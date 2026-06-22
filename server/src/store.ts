import { promises as fs } from "node:fs";
import ExcelJS from "exceljs";
import {
  APPLICATIONS_JSON_PATH,
  APPLICATIONS_XLSX_PATH,
  APPLICATION_DATA_DIR,
  DATA_DIR,
  CV_PROFILES_DIR,
  cvProfilePath,
} from "./config.js";
import type { JobAnalysis, TailoredCv, AtsCheckResult } from "./schemas.js";

export interface ApplicationData {
  jobText: string;
  analysis: JobAnalysis;
  tailored: TailoredCv;
  ats_check?: AtsCheckResult;
}

export const STATUSES = [
  "Drafted",
  "Applied",
  "Screening",
  "Interview",
  "Take-home",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;

export type Status = (typeof STATUSES)[number];

export interface Application {
  id: string;
  dateAdded: string; // ISO date
  company: string;
  role: string;
  seniority: string;
  fitScore: number;
  status: Status;
  jobUrl: string;
  source: string;
  salary: string;
  notes: string;
  language: string;
  redFlagsCount?: number;
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function ensureAppDataDir(): Promise<void> {
  await fs.mkdir(APPLICATION_DATA_DIR, { recursive: true });
}

function appDataPath(id: string): string {
  return `${APPLICATION_DATA_DIR}/${id}.json`;
}

export async function saveApplicationData(id: string, data: ApplicationData): Promise<void> {
  await ensureAppDataDir();
  await fs.writeFile(appDataPath(id), JSON.stringify(data, null, 2), "utf8");
}

export async function readApplicationData(id: string): Promise<ApplicationData | null> {
  try {
    const raw = await fs.readFile(appDataPath(id), "utf8");
    return JSON.parse(raw) as ApplicationData;
  } catch {
    return null;
  }
}

export async function readApplications(): Promise<Application[]> {
  try {
    const raw = await fs.readFile(APPLICATIONS_JSON_PATH, "utf8");
    return JSON.parse(raw) as Application[];
  } catch {
    return [];
  }
}

async function persist(apps: Application[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(APPLICATIONS_JSON_PATH, JSON.stringify(apps, null, 2), "utf8");
  await writeXlsx(apps);
}

const COLUMNS: { header: string; key: keyof Application; width: number }[] = [
  { header: "Date", key: "dateAdded", width: 14 },
  { header: "Company", key: "company", width: 24 },
  { header: "Role", key: "role", width: 30 },
  { header: "Level", key: "seniority", width: 12 },
  { header: "Fit %", key: "fitScore", width: 8 },
  { header: "Status", key: "status", width: 14 },
  { header: "Job URL", key: "jobUrl", width: 36 },
  { header: "Source", key: "source", width: 16 },
  { header: "Salary", key: "salary", width: 16 },
  { header: "Notes", key: "notes", width: 50 },
];

async function writeXlsx(apps: Application[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "cv-tailor";
  const ws = wb.addWorksheet("Applications", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0E7A63" },
  };
  headerRow.alignment = { vertical: "middle" };

  for (const app of apps) {
    ws.addRow({
      dateAdded: app.dateAdded,
      company: app.company,
      role: app.role,
      seniority: app.seniority,
      fitScore: app.fitScore,
      status: app.status,
      jobUrl: app.jobUrl,
      source: app.source,
      salary: app.salary,
      notes: app.notes,
    });
  }

  ws.getColumn("notes").alignment = { wrapText: true, vertical: "top" };
  ws.autoFilter = { from: "A1", to: "J1" };

  await ensureDataDir();
  await wb.xlsx.writeFile(APPLICATIONS_XLSX_PATH);
}

export async function addApplication(
  partial: Omit<Application, "id" | "dateAdded">,
): Promise<Application> {
  const apps = await readApplications();
  const app: Application = {
    id: `app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    dateAdded: new Date().toISOString().slice(0, 10),
    ...partial,
  };
  apps.unshift(app);
  await persist(apps);
  return app;
}

export async function updateApplication(
  id: string,
  patch: Partial<Omit<Application, "id" | "dateAdded">>,
): Promise<Application | null> {
  const apps = await readApplications();
  const idx = apps.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  apps[idx] = { ...apps[idx], ...patch };
  await persist(apps);
  return apps[idx];
}

export async function deleteApplication(id: string): Promise<boolean> {
  const apps = await readApplications();
  const next = apps.filter((a) => a.id !== id);
  if (next.length === apps.length) return false;
  await persist(next);
  // Clean up full data file if it exists
  await fs.unlink(appDataPath(id)).catch(() => {});
  return true;
}

export { APPLICATIONS_XLSX_PATH };

// ---- CV Profiles ----

export async function listCvProfiles(): Promise<string[]> {
  try {
    const files = await fs.readdir(CV_PROFILES_DIR);
    const profiles = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
    // Ensure "default" is always first
    return ["default", ...profiles.filter((p) => p !== "default")];
  } catch {
    return ["default"];
  }
}

export async function loadCvProfile(name: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(cvProfilePath(name), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function saveCvProfile(name: string, cv: Record<string, unknown>): Promise<void> {
  await fs.mkdir(CV_PROFILES_DIR, { recursive: true });
  await fs.writeFile(cvProfilePath(name), JSON.stringify(cv, null, 2), "utf8");
}
