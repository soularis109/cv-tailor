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
  language: string;
  must_have: string[];
  nice_to_have: string[];
  core_technologies: string[];
  domains: string[];
  responsibilities: string[];
  ats_keywords: string[];
  soft_signals: string[];
  red_flags: string[];
}

export type CoverageStatus = "strong" | "partial" | "missing";

export interface CoverageItem {
  requirement: string;
  status: CoverageStatus;
  evidence: string;
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
  fit_score: number;
  match_notes: string;
  keywords_to_weave_in: string[];
}

export interface AtsKeywordCheck {
  keyword: string;
  found: boolean;
  location?: string;
}

export interface AtsFormatCheck {
  rule: string;
  passed: boolean;
  note?: string;
}

export interface AtsRecommendation {
  priority: "high" | "medium" | "low";
  text: string;
}

export interface AtsCheckResult {
  ats_score: number;
  keyword_coverage: AtsKeywordCheck[];
  format_checks: AtsFormatCheck[];
  recommendations: AtsRecommendation[];
  verdict: string;
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
  dateAdded: string;
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

export interface TailorResponse {
  analysis: JobAnalysis;
  tailored: TailoredCv;
  application: Application;
}

export interface ApplicationData {
  jobText: string;
  analysis: JobAnalysis;
  tailored: TailoredCv;
  ats_check?: AtsCheckResult;
}
