import express from "express";
import cors from "cors";
import { promises as fs } from "node:fs";
import multer from "multer";
import type { RequestHandler } from "express";
import { PORT, MASTER_CV_PATH, anthropic, MODEL, CV_PROFILES_DIR, cvProfilePath, DEFAULT_PROFILE } from "./config.js";
import { MOCK_INTERVIEW_SYSTEM } from "./prompts.js";
import { analyzeJob, tailorCv, refineCv, extractCvFromPdf, generateFollowupEmail, generateCoverLetter, generateCompanyBrief, runAtsCheck, enhanceCvForAts, normalizeTailoredCv, normalizeAtsCheckResult, runExperienceVerification, enhanceCvForExperience } from "./pipeline.js";
import { buildDocx, type CvHeader } from "./docx.js";
import { buildPdf } from "./pdf.js";
import type { TailoredCv, JobAnalysis } from "./schemas.js";
import { type CandidateLevel } from "./prompt-builder.js";
import {
  readApplications,
  addApplication,
  updateApplication,
  deleteApplication,
  saveApplicationData,
  readApplicationData,
  customPdfPath,
  APPLICATIONS_XLSX_PATH,
  listCvProfiles,
  loadCvProfile,
  saveCvProfile,
  type Status,
  type ApplicationData,
  STATUSES,
} from "./store.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are accepted"));
    }
    cb(null, true);
  },
});


// One-time migration: master-cv.json → cv-profiles/default.json
async function migrateToProfiles() {
  try {
    await fs.access(CV_PROFILES_DIR);
  } catch {
    // cv-profiles/ doesn't exist yet — create and migrate
    await fs.mkdir(CV_PROFILES_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(MASTER_CV_PATH, "utf8");
      await fs.writeFile(cvProfilePath(DEFAULT_PROFILE), raw, "utf8");
    } catch {
      // master-cv.json doesn't exist either — that's fine
    }
  }
}
await migrateToProfiles();

const interviewSessions = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

interface MasterCv extends CvHeader {
  title?: string;
  summary?: string;
  [key: string]: unknown;
}

async function readMasterCv(profile = DEFAULT_PROFILE): Promise<MasterCv> {
  // Try profile first, fall back to legacy MASTER_CV_PATH
  const profileData = await loadCvProfile(profile);
  if (profileData) return profileData as MasterCv;
  const raw = await fs.readFile(MASTER_CV_PATH, "utf8");
  return JSON.parse(raw) as MasterCv;
}

function fail(res: express.Response, err: unknown, code = 500) {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("[cv-tailor]", message);
  res.status(code).json({ error: message });
}

const VALID_LEVELS = ["junior", "middle", "strong-middle", "senior"] as const;

function seniorityToLevel(s: string): CandidateLevel {
  if (s === "senior" || s === "lead" || s === "staff" || s === "principal") return "senior";
  if (s === "junior" || s === "intern") return "junior";
  if (s === "strong-middle") return "strong-middle";
  return "middle";
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- Master CV ----
app.get("/api/master-cv", async (_req, res) => {
  try {
    res.json(await readMasterCv());
  } catch (err) {
    fail(res, err, 404);
  }
});

app.put("/api/master-cv", async (req, res) => {
  try {
    const data = JSON.stringify(req.body, null, 2);
    await fs.writeFile(MASTER_CV_PATH, data, "utf8");
    await saveCvProfile(DEFAULT_PROFILE, req.body as Record<string, unknown>);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

// ---- Analyze job posting (stage 1) ----
app.post("/api/analyze", async (req, res) => {
  try {
    const { jobText } = req.body ?? {};
    if (!jobText || typeof jobText !== "string" || jobText.trim().length < 30) {
      return fail(res, new Error("Paste the full job posting (at least a few lines)."), 400);
    }
    const analysis = await analyzeJob(jobText);
    res.json({ analysis });
  } catch (err) {
    fail(res, err);
  }
});

// ---- Tailor: analyze + rewrite + log ----
app.post("/api/tailor", async (req, res) => {
  try {
    const { jobText, jobUrl = "", source = "", analysis: preAnalysis, customInstructions, cvProfile = DEFAULT_PROFILE, userRole, userLevel } = req.body ?? {};
    if (!jobText || typeof jobText !== "string" || jobText.trim().length < 30) {
      return fail(res, new Error("Paste the full job posting (at least a few lines)."), 400);
    }
    const masterCv = await readMasterCv(cvProfile as string);
    const role = (typeof userRole === "string" && userRole.trim()) ? userRole.trim() : (masterCv.title ?? "Software Engineer");
    const level: CandidateLevel = VALID_LEVELS.includes(userLevel as CandidateLevel) ? userLevel as CandidateLevel : "middle";
    const analysis: JobAnalysis = preAnalysis ?? await analyzeJob(jobText);
    const tailored = await tailorCv(masterCv, analysis, {
      customInstructions: typeof customInstructions === "string" ? customInstructions : undefined,
      role,
      level,
    });

    const application = await addApplication({
      company: extractCompany(jobText) || "—",
      role: analysis.role_title,
      seniority: analysis.seniority,
      fitScore: tailored.fit_score,
      status: "Drafted" as Status,
      jobUrl,
      source,
      salary: "",
      notes: "",
      language: analysis.language,
      redFlagsCount: analysis.red_flags?.length ?? 0,
    });

    // Persist full analysis + tailored CV for interview prep and future features
    await saveApplicationData(application.id, { jobText, analysis, tailored });

    res.json({ analysis, tailored, application });
  } catch (err) {
    fail(res, err);
  }
});

// ---- Export tailored CV to .docx ----
app.post("/api/docx", async (req, res) => {
  try {
    if (!req.body?.tailored) return fail(res, new Error("Missing tailored CV in request body."), 400);
    const tailored = normalizeTailoredCv(req.body.tailored as TailoredCv);
    const company: string | undefined = req.body.company;
    const master = await readMasterCv();
    const header: CvHeader = {
      name: master.name ?? "Your Name",
      location: master.location,
      email: master.email,
      phone: master.phone,
      links: master.links,
    };
    const buffer = await buildDocx(tailored, header);
    const companySuffix = company ? "_" + company : "";
    const safe = (header.name + "_CV" + companySuffix)
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${safe || "CV"}.docx"`);
    res.send(buffer);
  } catch (err) {
    fail(res, err);
  }
});

// ---- Applications tracker ----
app.get("/api/applications", async (_req, res) => {
  try {
    res.json(await readApplications());
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/applications", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const company = typeof body.company === "string" ? body.company.trim() : "";
    const role    = typeof body.role    === "string" ? body.role.trim()    : "";
    if (!company) return fail(res, new Error("company is required"), 400);
    if (!role)    return fail(res, new Error("role is required"), 400);
    const status: Status =
      typeof body.status === "string" && (STATUSES as readonly string[]).includes(body.status)
        ? (body.status as Status)
        : "Applied";
    const application = await addApplication({
      company, role, status,
      seniority: typeof body.seniority === "string" ? body.seniority.trim() : "",
      fitScore: 0,
      jobUrl:  typeof body.jobUrl  === "string" ? body.jobUrl.trim()  : "",
      source:  typeof body.source  === "string" ? body.source.trim()  : "",
      salary:  typeof body.salary  === "string" ? body.salary.trim()  : "",
      notes:   typeof body.notes   === "string" ? body.notes.trim()   : "",
      language: "en",
    });
    res.status(201).json({ application });
  } catch (err) {
    fail(res, err);
  }
});

app.get("/api/applications/:id/data", async (req, res) => {
  try {
    const data = await readApplicationData(req.params.id);
    if (!data) return fail(res, new Error("Application data not found."), 404);
    res.json({
      ...data,
      tailored: normalizeTailoredCv(data.tailored),
      ...(data.ats_check ? { ats_check: normalizeAtsCheckResult(data.ats_check) } : {}),
    });
  } catch (err) {
    fail(res, err);
  }
});

app.patch("/api/applications/:id/data", async (req, res) => {
  try {
    const rawTailored = req.body?.tailored;
    if (!rawTailored) return fail(res, new Error("Missing tailored field."), 400);
    const data = await readApplicationData(req.params.id);
    if (!data) return fail(res, new Error("Application data not found."), 404);
    const tailored = normalizeTailoredCv(rawTailored as TailoredCv);
    await saveApplicationData(req.params.id, { ...data, tailored });
    res.json({ tailored });
  } catch (err) {
    fail(res, err);
  }
});

// ---- Custom PDF upload / download / delete ----
app.post(
  "/api/applications/:id/upload-pdf",
  upload.single("file") as unknown as RequestHandler,
  async (req, res) => {
    try {
      if (!req.file) return fail(res, new Error("No file uploaded. Send the PDF in the 'file' field."), 400);
      const id = req.params['id'] as string;
      const data = await readApplicationData(id);
      if (!data) return fail(res, new Error("Application data not found."), 404);
      await fs.writeFile(customPdfPath(id), req.file.buffer);
      await saveApplicationData(id, { ...data, customPdf: true });
      res.json({ ok: true });
    } catch (err) {
      fail(res, err);
    }
  },
);

app.get("/api/applications/:id/custom-pdf", async (req, res) => {
  try {
    const filePath = customPdfPath(req.params.id);
    await fs.access(filePath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="CV.pdf"`);
    const buf = await fs.readFile(filePath);
    res.send(buf);
  } catch {
    fail(res, new Error("Custom PDF not found."), 404);
  }
});

app.delete("/api/applications/:id/custom-pdf", async (req, res) => {
  try {
    const data = await readApplicationData(req.params.id);
    if (!data) return fail(res, new Error("Application data not found."), 404);
    await fs.unlink(customPdfPath(req.params.id)).catch(() => {});
    await saveApplicationData(req.params.id, { ...data, customPdf: false });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

app.patch("/api/applications/:id", async (req, res) => {
  try {
    const { id: _id, dateAdded: _da, redFlagsCount: _rfc, ...patchable } = (req.body ?? {}) as Record<string, unknown>;
    const updated = await updateApplication(req.params.id, patchable);
    if (!updated) return fail(res, new Error("Application not found."), 404);
    res.json(updated);
  } catch (err) {
    fail(res, err);
  }
});

app.delete("/api/applications/:id", async (req, res) => {
  try {
    const ok = await deleteApplication(req.params.id);
    interviewSessions.delete(req.params.id);
    res.json({ ok });
  } catch (err) {
    fail(res, err);
  }
});

// ---- Export tailored CV to .pdf ----
app.post("/api/pdf", async (req, res) => {
  try {
    if (!req.body?.tailored) return fail(res, new Error("Missing tailored CV in request body."), 400);
    const tailored = normalizeTailoredCv(req.body.tailored as TailoredCv);
    const company: string | undefined = req.body.company;
    const master = await readMasterCv();
    const header: CvHeader = {
      name: master.name ?? "Your Name",
      location: master.location,
      email: master.email,
      phone: master.phone,
      links: master.links,
    };
    const buffer = await buildPdf(tailored, header);
    const companySuffix = company ? "_" + company : "";
    const safe = (header.name + "_CV" + companySuffix)
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safe || "CV"}.pdf"`);
    res.send(buffer);
  } catch (err) {
    fail(res, err);
  }
});

// ---- Import Master CV from PDF ----
app.post(
  "/api/master-cv/import-pdf",
  upload.single("file") as unknown as RequestHandler,
  async (req, res) => {
    try {
      if (!req.file) {
        return fail(res, new Error("No file uploaded. Send the PDF in the 'file' field."), 400);
      }
      if (!req.file.buffer.slice(0, 4).equals(Buffer.from("%PDF"))) {
        return fail(res, new Error("File does not appear to be a valid PDF"), 400);
      }

      const b64 = req.file.buffer.toString("base64");
      const cv = await extractCvFromPdf(b64);
      res.json(cv);
    } catch (err) {
      fail(res, err);
    }
  },
);

app.get("/api/applications.xlsx", async (_req, res) => {
  try {
    // Make sure the file exists by touching the store first.
    await readApplications();
    res.download(APPLICATIONS_XLSX_PATH, "applications.xlsx");
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/fetch-job", async (req, res) => {
  const { url } = req.body as { url?: string };
  let parsed: URL;
  try {
    parsed = new URL(url ?? "");
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return res.status(400).json({ error: "Invalid URL" });
  }
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url!)}`;
    const response = await fetch(jinaUrl, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Jina returned ${response.status}`);
    let text = await response.text();
    if (text.length > 20_000) text = text.slice(0, 20_000);
    res.json({ text });
  } catch (err) {
    res.status(502).json({ error: "Could not fetch URL" });
  }
});

/** Best-effort company guess for the tracker row; the user can edit it later. */
function extractCompany(jobText: string): string {
  const m =
    jobText.match(/(?:at|@|join)\s+([A-Z][\w&.\- ]{2,40})/) ??
    jobText.match(/([A-Z][\w&.\- ]{2,40})\s+is\s+(?:looking|hiring|seeking)/);
  return m ? m[1].trim() : "";
}

app.post("/api/applications/:id/draft-followup", async (req, res) => {
  const { id } = req.params;

  const apps = await readApplications();
  const application = apps.find((a) => a.id === id);
  if (!application) return res.status(404).json({ error: "Not found" });

  const data = await readApplicationData(id);
  if (!data) return res.status(404).json({ error: "Application data not found" });

  let candidateName = "the candidate";
  try {
    const raw = await fs.readFile(MASTER_CV_PATH, "utf-8");
    const masterCv = JSON.parse(raw) as { name?: string };
    if (masterCv?.name) candidateName = masterCv.name;
  } catch {
    // fallback to default
  }

  const daysWaited = Math.floor(
    (Date.now() - new Date(application.dateAdded).getTime()) / (1000 * 60 * 60 * 24)
  );

  try {
    const email = await generateFollowupEmail(application, data, candidateName, daysWaited);
    res.json({ email });
  } catch (err) {
    res.status(500).json({ error: "Generation failed" });
  }
});

app.post("/api/cover-letter", async (req, res) => {
  const { applicationId } = req.body as { applicationId?: string };
  if (!applicationId) return res.status(400).json({ error: "applicationId required" });

  const apps = await readApplications();
  const application = apps.find((a) => a.id === applicationId);
  if (!application) return res.status(404).json({ error: "Not found" });

  const data = await readApplicationData(applicationId);
  if (!data) return res.status(404).json({ error: "Application data not found" });

  let masterCv: MasterCv | null = null;
  try {
    masterCv = await readMasterCv();
  } catch {
    return res.status(400).json({ error: "Master CV not set" });
  }

  try {
    const letter = await generateCoverLetter(masterCv, application, data.analysis, data.tailored);
    res.json({ letter });
  } catch (err) {
    res.status(500).json({ error: "Generation failed" });
  }
});

app.post("/api/company-brief", async (req, res) => {
  const { url, companyName } = req.body as { url?: string; companyName?: string };
  if (!url || !companyName) return res.status(400).json({ error: "url and companyName required" });

  // Validate URL (same pattern as /api/fetch-job)
  let parsed: URL;
  try { parsed = new URL(url); } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const pageRes = await fetch(jinaUrl, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(10_000),
    });
    const pageContent = pageRes.ok ? await pageRes.text() : "";

    const brief = await generateCompanyBrief(companyName, pageContent || `Company: ${companyName}`);
    res.json({ brief });
  } catch (err) {
    res.status(500).json({ error: "Brief generation failed" });
  }
});

function buildInterviewContext(data: ApplicationData): string {
  const gaps = data.tailored.coverage.filter((c) => c.status === "missing").map((c) => c.requirement);
  const partials = data.tailored.coverage.filter((c) => c.status === "partial").map((c) => c.requirement);
  return `
Job role: ${data.analysis.role_title} (${data.analysis.seniority})
Key responsibilities: ${data.analysis.responsibilities.slice(0, 5).join("; ")}
Candidate headline: ${data.tailored.headline}
Coverage gaps (missing): ${gaps.join("; ") || "none"}
Coverage partials: ${partials.join("; ") || "none"}
Red flags to probe: ${(data.analysis.red_flags ?? []).join("; ") || "none"}
  `.trim();
}

app.post("/api/applications/:id/interview", async (req, res) => {
  const { id } = req.params;
  const { message, reset } = req.body as { message?: string; reset?: boolean };

  try {
    const data = await readApplicationData(id);
    if (!data) return res.status(404).json({ error: "Not found" });

    if (reset || !interviewSessions.has(id)) {
      interviewSessions.set(id, []);

      const context = buildInterviewContext(data);
      const startMessages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: "Start the interview." }
      ];

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: MOCK_INTERVIEW_SYSTEM + "\n\n" + context,
        messages: startMessages,
      });
      const reply = (response.content[0] as { type: "text"; text: string }).text;
      interviewSessions.get(id)!.push(
        { role: "user", content: "Start the interview." },
        { role: "assistant", content: reply }
      );
      return res.json({ reply, questionNumber: 1 });
    }

    if (!message) return res.status(400).json({ error: "message required" });

    const history = interviewSessions.get(id)!;
    history.push({ role: "user", content: message });

    const context = buildInterviewContext(data);
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: MOCK_INTERVIEW_SYSTEM + "\n\n" + context,
      messages: history,
    });
    const reply = (response.content[0] as { type: "text"; text: string }).text;
    history.push({ role: "assistant", content: reply });

    res.json({ reply, questionNumber: Math.ceil(history.length / 2) });
  } catch (err) {
    res.status(500).json({ error: "Interview failed" });
  }
});

app.post("/api/applications/:id/ats-check", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readApplicationData(id);
    if (!data) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    const result = await runAtsCheck(data.analysis, data.tailored);
    await saveApplicationData(id, { ...data, ats_check: result });
    res.json({ ats_check: result });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/applications/:id/ats-enhance", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readApplicationData(id);
    if (!data) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    if (!data.ats_check) {
      res.status(400).json({ error: "Run ATS check first" });
      return;
    }
    const masterCv = await readMasterCv();
    const enhanced = await enhanceCvForAts(masterCv, data.tailored, data.ats_check, data.analysis);
    const newAtsCheck = await runAtsCheck(data.analysis, enhanced);
    await saveApplicationData(id, { ...data, tailored: enhanced, ats_check: newAtsCheck });
    res.json({ tailored: enhanced, ats_check: newAtsCheck });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/applications/:id/experience-check", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readApplicationData(id);
    if (!data) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    const result = await runExperienceVerification(data.analysis, data.tailored);
    await saveApplicationData(id, { ...data, experience_check: result });
    res.json({ experience_check: result });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/applications/:id/experience-enhance", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readApplicationData(id);
    if (!data) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    if (!data.experience_check) {
      res.status(400).json({ error: "Run experience check first" });
      return;
    }
    const masterCv = await readMasterCv();
    const enhanced = await enhanceCvForExperience(
      masterCv,
      data.tailored,
      data.experience_check,
      data.analysis,
    );
    const newCheck = await runExperienceVerification(data.analysis, enhanced);
    await saveApplicationData(id, { ...data, tailored: enhanced, experience_check: newCheck });
    res.json({ tailored: enhanced, experience_check: newCheck });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/applications/:id/retailor", async (req, res) => {
  try {
    const { id } = req.params;
    const { customInstructions, userLevel } = req.body as {
      customInstructions?: string;
      userLevel?: string;
    };

    const data = await readApplicationData(id);
    if (!data) { res.status(404).json({ error: "Application not found" }); return; }

    const masterCv = await readMasterCv();
    const role = data.analysis.role_title;
    const baseLevel = seniorityToLevel(data.analysis.seniority);
    const effectiveLevel: CandidateLevel =
      VALID_LEVELS.includes(userLevel as CandidateLevel) ? userLevel as CandidateLevel : baseLevel;

    const tailored = await tailorCv(masterCv, data.analysis, {
      customInstructions:
        typeof customInstructions === "string" && customInstructions.trim()
          ? customInstructions.trim()
          : undefined,
      role,
      level: effectiveLevel,
    });

    await saveApplicationData(id, {
      ...data,
      tailored,
      ats_check: undefined,
      experience_check: undefined,
    });
    res.json({ tailored });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/applications/:id/refine", async (req, res) => {
  try {
    const { id } = req.params;
    const { customInstructions } = req.body as { customInstructions?: string };

    const data = await readApplicationData(id);
    if (!data) { res.status(404).json({ error: "Application not found" }); return; }
    if (!data.tailored) { res.status(400).json({ error: "No tailored CV to refine" }); return; }

    const masterCv = await readMasterCv();
    const tailored = await refineCv(masterCv, data.tailored, data.analysis, {
      customInstructions:
        typeof customInstructions === "string" && customInstructions.trim()
          ? customInstructions.trim()
          : undefined,
    });

    await saveApplicationData(id, {
      ...data,
      tailored,
      ats_check: undefined,
      experience_check: undefined,
    });
    res.json({ tailored });
  } catch (err) {
    fail(res, err);
  }
});

// ---- CV Profiles ----
app.get("/api/master-cv/profiles", async (_req, res) => {
  try {
    const profiles = await listCvProfiles();
    res.json({ profiles });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/api/master-cv/profiles", async (req, res) => {
  try {
    const { name, cv } = req.body as { name?: string; cv?: Record<string, unknown> };
    if (!name || typeof name !== "string") return res.status(400).json({ error: "name required" });
    if (!cv || typeof cv !== "object") return res.status(400).json({ error: "cv required" });
    const safe = name.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
    if (safe === DEFAULT_PROFILE) return res.status(400).json({ error: "Use PUT /api/master-cv to update default" });
    await saveCvProfile(safe, cv);
    res.status(201).json({ ok: true, name: safe });
  } catch (err) {
    fail(res, err);
  }
});

app.get("/api/master-cv/profiles/:name", async (req, res) => {
  try {
    const cv = await loadCvProfile(req.params.name);
    if (!cv) return res.status(404).json({ error: "Profile not found" });
    res.json(cv);
  } catch (err) {
    fail(res, err);
  }
});

app.put("/api/master-cv/profiles/:name", async (req, res) => {
  try {
    const { name } = req.params;
    if (!req.body || typeof req.body !== "object") return res.status(400).json({ error: "cv body required" });
    const safe = name.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
    await saveCvProfile(safe, req.body as Record<string, unknown>);
    // If updating default, also keep master-cv.json in sync
    if (safe === DEFAULT_PROFILE) {
      await fs.writeFile(MASTER_CV_PATH, JSON.stringify(req.body, null, 2), "utf8");
    }
    res.json({ ok: true, name: safe });
  } catch (err) {
    fail(res, err);
  }
});

app.delete("/api/master-cv/profiles/:name", async (req, res) => {
  try {
    const { name } = req.params;
    if (name === DEFAULT_PROFILE) return res.status(400).json({ error: "Cannot delete default profile" });
    await fs.unlink(cvProfilePath(name));
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, 404);
  }
});

app.listen(PORT, () => {
  console.log(`[cv-tailor] server on http://localhost:${PORT}`);
});
