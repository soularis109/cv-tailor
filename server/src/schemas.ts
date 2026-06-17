import type Anthropic from "@anthropic-ai/sdk";

/**
 * We get structured output by defining a tool whose input schema is the shape
 * we want back, then forcing the model to call it with tool_choice. This is the
 * stable way to guarantee well-formed JSON from the Messages API.
 */

// ---------- Step 1: job analysis ----------

export type Seniority =
  | "intern"
  | "junior"
  | "middle"
  | "senior"
  | "lead"
  | "staff"
  | "principal"
  | "unspecified";

export interface JobAnalysis {
  role_title: string;
  seniority: Seniority;
  language: string; // ISO-ish code of the posting, e.g. "en", "uk"
  must_have: string[];
  nice_to_have: string[];
  core_technologies: string[];
  domains: string[];
  responsibilities: string[];
  ats_keywords: string[]; // verbatim terms an ATS would match
  soft_signals: string[];
  red_flags: string[];
}

export const analyzeJobTool: Anthropic.Messages.Tool = {
  name: "record_job_analysis",
  description:
    "Record a structured analysis of the job posting. Capture requirements and terminology exactly as written so they can be matched against a CV and an ATS.",
  input_schema: {
    type: "object",
    properties: {
      role_title: { type: "string", description: "Normalized job title." },
      seniority: {
        type: "string",
        enum: [
          "intern",
          "junior",
          "middle",
          "senior",
          "lead",
          "staff",
          "principal",
          "unspecified",
        ],
      },
      language: {
        type: "string",
        description: "Language code of the posting, e.g. 'en' or 'uk'.",
      },
      must_have: {
        type: "array",
        items: { type: "string" },
        description: "Hard requirements the candidate must meet.",
      },
      nice_to_have: { type: "array", items: { type: "string" } },
      core_technologies: {
        type: "array",
        items: { type: "string" },
        description: "Specific languages, frameworks, and tools named in the posting.",
      },
      domains: {
        type: "array",
        items: { type: "string" },
        description: "Industry or product domains, e.g. 'fintech', 'e-commerce'.",
      },
      responsibilities: { type: "array", items: { type: "string" } },
      ats_keywords: {
        type: "array",
        items: { type: "string" },
        description:
          "Exact words/phrases a resume parser would match. Copy them verbatim from the posting.",
      },
      soft_signals: {
        type: "array",
        items: { type: "string" },
        description: "Culture / working-style cues, e.g. 'fast-paced startup', 'ownership'.",
      },
      red_flags: {
        type: "array",
        items: { type: "string" },
        description: "Optional concerns worth flagging, e.g. vague comp or very broad scope.",
      },
    },
    required: [
      "role_title",
      "seniority",
      "language",
      "must_have",
      "nice_to_have",
      "core_technologies",
      "domains",
      "responsibilities",
      "ats_keywords",
      "soft_signals",
      "red_flags",
    ],
  },
};

// ---------- Step 2: tailored CV ----------

export type CoverageStatus = "strong" | "partial" | "missing";

export interface CoverageItem {
  requirement: string;
  status: CoverageStatus;
  evidence: string; // what in the master CV backs this (empty if missing)
}

export interface TailoredExperience {
  company: string;
  role: string;
  period: string;
  location?: string;
  bullets: string[];
}

export interface TailoredProject {
  name: string;
  description: string;
  tech: string[];
  link?: string;
}

export interface TailoredEducation {
  institution: string;
  credential: string;
  period: string;
}

export interface TailoredCv {
  headline: string;
  summary: string;
  top_skills: string[];
  experience: TailoredExperience[];
  projects: TailoredProject[];
  education: TailoredEducation[];
  coverage: CoverageItem[];
  fit_score: number; // 0-100, honest match estimate
  match_notes: string; // gaps + advice, written to the candidate
  keywords_to_weave_in: string[]; // truthful job keywords the candidate has but under-emphasizes
}

// ---------- PDF import: master CV extraction ----------

export interface MasterCvData {
  name: string;
  title?: string;
  location?: string;
  email?: string;
  phone?: string;
  links?: Record<string, string>;
  summary?: string;
  skills?: Record<string, string[]>;
  experience?: Array<{
    company: string;
    role: string;
    period: string;
    location?: string;
    tech?: string[];
    bullets: string[];
  }>;
  projects?: Array<{
    name: string;
    description: string;
    tech: string[];
    link?: string;
  }>;
  education?: Array<{
    institution: string;
    credential: string;
    period: string;
  }>;
  certifications?: string[];
}

export const masterCvTool: Anthropic.Messages.Tool = {
  name: "extract_master_cv",
  description: "Extract all CV data from the document into structured JSON.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      title: { type: "string" },
      location: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      links: { type: "object", additionalProperties: { type: "string" } },
      summary: { type: "string" },
      skills: {
        type: "object",
        additionalProperties: { type: "array", items: { type: "string" } },
      },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string" },
            role: { type: "string" },
            period: { type: "string" },
            location: { type: "string" },
            tech: { type: "array", items: { type: "string" } },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["company", "role", "period", "bullets"],
        },
      },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            tech: { type: "array", items: { type: "string" } },
            link: { type: "string" },
          },
          required: ["name", "description", "tech"],
        },
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            institution: { type: "string" },
            credential: { type: "string" },
            period: { type: "string" },
          },
          required: ["institution", "credential", "period"],
        },
      },
      certifications: { type: "array", items: { type: "string" } },
    },
    required: ["name"],
  },
};

// ---------- Step 2: tailored CV ----------

export const tailorCvTool: Anthropic.Messages.Tool = {
  name: "produce_tailored_cv",
  description:
    "Produce a CV tailored to the analyzed role, using ONLY facts present in the master CV. Reorder, select, and rephrase truthful content; never invent experience, skills, employers, dates, or metrics.",
  input_schema: {
    type: "object",
    properties: {
      headline: {
        type: "string",
        description: "Short role-specific headline matching the job's exact seniority wording, e.g. 'Middle Frontend Engineer | React, TypeScript'. No periods.",
      },
      summary: { type: "string", description: "2-4 sentence summary aimed at this role." },
      top_skills: {
        type: "array",
        items: { type: "string" },
        description: "Skills the candidate genuinely has, most relevant to this role first.",
      },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string" },
            role: { type: "string" },
            period: { type: "string" },
            location: { type: "string" },
            bullets: {
              type: "array",
              items: { type: "string" },
              description: "Achievement bullets, rephrased to mirror the job's language where truthful.",
            },
          },
          required: ["company", "role", "period", "bullets"],
        },
      },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            tech: { type: "array", items: { type: "string" } },
            link: { type: "string" },
          },
          required: ["name", "description", "tech"],
        },
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            institution: { type: "string" },
            credential: { type: "string" },
            period: { type: "string" },
          },
          required: ["institution", "credential", "period"],
        },
      },
      coverage: {
        type: "array",
        description: "Map each key requirement from the analysis to the candidate's real evidence.",
        items: {
          type: "object",
          properties: {
            requirement: { type: "string" },
            status: { type: "string", enum: ["strong", "partial", "missing"] },
            evidence: {
              type: "string",
              description: "What in the master CV supports this. Leave empty for 'missing'.",
            },
          },
          required: ["requirement", "status", "evidence"],
        },
      },
      fit_score: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Honest overall match estimate for this candidate and role.",
      },
      match_notes: {
        type: "string",
        description: "Plain, honest notes to the candidate: where they are strong, where the real gaps are.",
      },
      keywords_to_weave_in: {
        type: "array",
        items: { type: "string" },
        description:
          "Job keywords the candidate truthfully has but does not emphasize yet — worth surfacing.",
      },
    },
    required: [
      "headline",
      "summary",
      "top_skills",
      "experience",
      "projects",
      "education",
      "coverage",
      "fit_score",
      "match_notes",
      "keywords_to_weave_in",
    ],
  },
};
