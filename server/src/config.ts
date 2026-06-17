import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[cv-tailor] ANTHROPIC_API_KEY is not set. Copy server/.env.example to server/.env and add your key.",
  );
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// One place to change the model. Sonnet is a good quality/cost balance for this task.
export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export const PORT = Number(process.env.PORT ?? 8787);

// Data lives next to the source so it is easy to find and back up.
export const DATA_DIR = path.resolve(__dirname, "..", "data");
export const MASTER_CV_PATH = path.join(DATA_DIR, "master-cv.json");
export const APPLICATIONS_JSON_PATH = path.join(DATA_DIR, "applications.json");
export const APPLICATIONS_XLSX_PATH = path.join(DATA_DIR, "applications.xlsx");
export const APPLICATION_DATA_DIR = path.join(DATA_DIR, "application-data");
