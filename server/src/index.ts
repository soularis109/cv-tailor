import express from "express";
import cors from "cors";
import { promises as fs } from "node:fs";
import multer from "multer";
import type { RequestHandler } from "express";
import { PORT, MASTER_CV_PATH } from "./config.js";
import { analyzeJob, tailorCv, extractCvFromPdf, generateFollowupEmail, generateCoverLetter } from "./pipeline.js";
import { buildDocx, type CvHeader } from "./docx.js";
import { buildPdf } from "./pdf.js";
import type { TailoredCv, JobAnalysis } from "./schemas.js";
import {
  readApplications,
  addApplication,
  updateApplication,
  deleteApplication,
  saveApplicationData,
  readApplicationData,
  APPLICATIONS_XLSX_PATH,
  type Status,
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


const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

interface MasterCv extends CvHeader {
  title?: string;
  summary?: string;
  [key: string]: unknown;
}

async function readMasterCv(): Promise<MasterCv> {
  const raw = await fs.readFile(MASTER_CV_PATH, "utf8");
  return JSON.parse(raw) as MasterCv;
}

function fail(res: express.Response, err: unknown, code = 500) {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("[cv-tailor]", message);
  res.status(code).json({ error: message });
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
    await fs.writeFile(MASTER_CV_PATH, JSON.stringify(req.body, null, 2), "utf8");
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
    const { jobText, jobUrl = "", source = "", analysis: preAnalysis, customInstructions } = req.body ?? {};
    if (!jobText || typeof jobText !== "string" || jobText.trim().length < 30) {
      return fail(res, new Error("Paste the full job posting (at least a few lines)."), 400);
    }
    const masterCv = await readMasterCv();
    const analysis: JobAnalysis = preAnalysis ?? await analyzeJob(jobText);
    const tailored = await tailorCv(masterCv, analysis, typeof customInstructions === "string" ? customInstructions : undefined);

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
    const tailored = req.body?.tailored as TailoredCv | undefined;
    if (!tailored) return fail(res, new Error("Missing tailored CV in request body."), 400);
    const master = await readMasterCv();
    const header: CvHeader = {
      name: master.name ?? "Your Name",
      location: master.location,
      email: master.email,
      phone: master.phone,
      links: master.links,
    };
    const buffer = await buildDocx(tailored, header);
    const safe = (header.name + " - " + tailored.headline)
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

app.get("/api/applications/:id/data", async (req, res) => {
  try {
    const data = await readApplicationData(req.params.id);
    if (!data) return fail(res, new Error("Application data not found."), 404);
    res.json(data);
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
    res.json({ ok });
  } catch (err) {
    fail(res, err);
  }
});

// ---- Export tailored CV to .pdf ----
app.post("/api/pdf", async (req, res) => {
  try {
    const tailored = req.body?.tailored as TailoredCv | undefined;
    if (!tailored) return fail(res, new Error("Missing tailored CV in request body."), 400);
    const master = await readMasterCv();
    const header: CvHeader = {
      name: master.name ?? "Your Name",
      location: master.location,
      email: master.email,
      phone: master.phone,
      links: master.links,
    };
    const buffer = await buildPdf(tailored, header);
    const safe = (header.name + " - " + tailored.headline)
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

  let masterCv: { name: string; email?: string; phone?: string } | null = null;
  try {
    const raw = await fs.readFile(MASTER_CV_PATH, "utf-8");
    masterCv = JSON.parse(raw) as { name: string; email?: string; phone?: string };
  } catch {
    // file missing
  }
  if (!masterCv) return res.status(400).json({ error: "Master CV not set" });

  try {
    const letter = await generateCoverLetter(masterCv, application, data.analysis, data.tailored);
    res.json({ letter });
  } catch (err) {
    res.status(500).json({ error: "Generation failed" });
  }
});

app.listen(PORT, () => {
  console.log(`[cv-tailor] server on http://localhost:${PORT}`);
});
