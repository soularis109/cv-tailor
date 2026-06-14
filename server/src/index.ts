import express from "express";
import cors from "cors";
import { promises as fs } from "node:fs";
import { PORT, MASTER_CV_PATH } from "./config.js";
import { analyzeJob, tailorCv } from "./pipeline.js";
import { buildDocx, type CvHeader } from "./docx.js";
import type { TailoredCv } from "./schemas.js";
import {
  readApplications,
  addApplication,
  updateApplication,
  deleteApplication,
  APPLICATIONS_XLSX_PATH,
  type Status,
} from "./store.js";

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

// ---- Tailor: analyze + rewrite + log ----
app.post("/api/tailor", async (req, res) => {
  try {
    const { jobText, jobUrl = "", source = "" } = req.body ?? {};
    if (!jobText || typeof jobText !== "string" || jobText.trim().length < 30) {
      return fail(res, new Error("Paste the full job posting (at least a few lines)."), 400);
    }
    const masterCv = await readMasterCv();
    const analysis = await analyzeJob(jobText);
    const tailored = await tailorCv(masterCv, analysis);

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
    });

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

app.patch("/api/applications/:id", async (req, res) => {
  try {
    const updated = await updateApplication(req.params.id, req.body ?? {});
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

app.get("/api/applications.xlsx", async (_req, res) => {
  try {
    // Make sure the file exists by touching the store first.
    await readApplications();
    res.download(APPLICATIONS_XLSX_PATH, "applications.xlsx");
  } catch (err) {
    fail(res, err);
  }
});

/** Best-effort company guess for the tracker row; the user can edit it later. */
function extractCompany(jobText: string): string {
  const m =
    jobText.match(/(?:at|@|join)\s+([A-Z][\w&.\- ]{2,40})/) ??
    jobText.match(/([A-Z][\w&.\- ]{2,40})\s+is\s+(?:looking|hiring|seeking)/);
  return m ? m[1].trim() : "";
}

app.listen(PORT, () => {
  console.log(`[cv-tailor] server on http://localhost:${PORT}`);
});
