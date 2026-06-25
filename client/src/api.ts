import type { Application, ApplicationData, AtsCheckResult, ExperienceVerificationResult, JobAnalysis, TailoredCv, TailorResponse } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function triggerDownload(res: Response, fallbackName: string): Promise<void> {
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type MasterCv = Record<string, unknown> & { name?: string; title?: string };

export const api = {
  async getMasterCv(profile?: string): Promise<MasterCv> {
    if (profile && profile !== "default") {
      return json(await fetch(`/api/master-cv/profiles/${encodeURIComponent(profile)}`));
    }
    return json(await fetch("/api/master-cv"));
  },

  async putMasterCv(cv: MasterCv, profile?: string): Promise<void> {
    if (profile && profile !== "default") {
      await json(
        await fetch(`/api/master-cv/profiles/${encodeURIComponent(profile)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cv),
        }),
      );
      return;
    }
    await json(
      await fetch("/api/master-cv", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cv),
      }),
    );
  },

  async getCvProfiles(): Promise<string[]> {
    const data = await json<{ profiles: string[] }>(await fetch("/api/master-cv/profiles"));
    return data.profiles;
  },

  async createCvProfile(name: string, cv: MasterCv): Promise<{ name: string }> {
    return json(
      await fetch("/api/master-cv/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cv }),
      }),
    );
  },

  async deleteCvProfile(name: string): Promise<void> {
    await json(await fetch(`/api/master-cv/profiles/${encodeURIComponent(name)}`, { method: "DELETE" }));
  },

  async analyzeJob(jobText: string): Promise<{ analysis: JobAnalysis }> {
    return json(
      await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobText }),
      }),
    );
  },

  async tailor(
    jobText: string,
    jobUrl: string,
    source: string,
    analysis?: JobAnalysis,
    customInstructions?: string,
    cvProfile?: string,
    userLevel?: "junior" | "middle" | "strong-middle" | "senior",
  ): Promise<TailorResponse> {
    return json(
      await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobText, jobUrl, source, analysis, customInstructions, cvProfile, userLevel }),
      }),
    );
  },

  async downloadDocx(tailored: TailoredCv, company?: string): Promise<void> {
    const res = await fetch("/api/docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tailored, company }),
    });
    if (!res.ok) throw new Error("Could not generate the .docx file.");
    await triggerDownload(res, "CV.docx");
  },

  async downloadPdf(tailored: TailoredCv, company?: string): Promise<void> {
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tailored, company }),
    });
    if (!res.ok) throw new Error("Could not generate the PDF.");
    await triggerDownload(res, "CV.pdf");
  },

  async getApplications(): Promise<Application[]> {
    return json(await fetch("/api/applications"));
  },

  async createApplication(
    fields: Pick<Application, "company" | "role"> &
      Partial<Pick<Application, "status" | "source" | "jobUrl" | "salary" | "notes">>,
  ): Promise<Application> {
    const data = await json<{ application: Application }>(
      await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      }),
    );
    return data.application;
  },

  async patchApplication(id: string, patch: Partial<Application>): Promise<Application> {
    return json(
      await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    );
  },

  async deleteApplication(id: string): Promise<void> {
    await json(await fetch(`/api/applications/${id}`, { method: "DELETE" }));
  },

  async getApplicationData(id: string): Promise<ApplicationData> {
    return json(await fetch(`/api/applications/${id}/data`));
  },

  async patchTailored(id: string, tailored: TailoredCv): Promise<TailoredCv> {
    const res = await json<{ tailored: TailoredCv }>(
      await fetch(`/api/applications/${id}/data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tailored }),
      }),
    );
    return res.tailored;
  },

  async uploadCustomPdf(id: string, file: File): Promise<void> {
    const form = new FormData();
    form.append("file", file);
    await json(await fetch(`/api/applications/${id}/upload-pdf`, { method: "POST", body: form }));
  },

  async deleteCustomPdf(id: string): Promise<void> {
    await json(await fetch(`/api/applications/${id}/custom-pdf`, { method: "DELETE" }));
  },

  async downloadCustomPdf(id: string): Promise<void> {
    const res = await fetch(`/api/applications/${id}/custom-pdf`);
    if (!res.ok) throw new Error("Custom PDF not found.");
    await triggerDownload(res, "CV.pdf");
  },

  async importPdf(file: File): Promise<MasterCv> {
    const form = new FormData();
    form.append("file", file);
    return json(await fetch("/api/master-cv/import-pdf", { method: "POST", body: form }));
  },

  async fetchJobFromUrl(url: string): Promise<string> {
    const res = await fetch("/api/fetch-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error("fetch-job failed");
    const data = (await res.json()) as { text: string };
    return data.text;
  },

  async draftFollowupEmail(id: string): Promise<{ email: string }> {
    const res = await fetch(`/api/applications/${id}/draft-followup`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("draft-followup failed");
    return res.json() as Promise<{ email: string }>;
  },

  async startInterview(id: string): Promise<{ reply: string; questionNumber: number }> {
    const res = await fetch(`/api/applications/${id}/interview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    if (!res.ok) throw new Error("interview failed");
    return res.json() as Promise<{ reply: string; questionNumber: number }>;
  },

  async sendInterviewMessage(id: string, message: string): Promise<{ reply: string; questionNumber: number }> {
    const res = await fetch(`/api/applications/${id}/interview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error("interview failed");
    return res.json() as Promise<{ reply: string; questionNumber: number }>;
  },

  async generateCoverLetter(applicationId: string): Promise<{ letter: string }> {
    const res = await fetch("/api/cover-letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId }),
    });
    if (!res.ok) throw new Error("cover-letter failed");
    return res.json() as Promise<{ letter: string }>;
  },

  async getCompanyBrief(url: string, companyName: string): Promise<{ brief: string }> {
    const res = await fetch("/api/company-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, companyName }),
    });
    if (!res.ok) throw new Error("company-brief failed");
    return res.json() as Promise<{ brief: string }>;
  },

  async runAtsCheck(applicationId: string): Promise<AtsCheckResult> {
    const res = await fetch(`/api/applications/${applicationId}/ats-check`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("ats-check failed");
    const body = await res.json() as { ats_check: AtsCheckResult };
    return body.ats_check;
  },

  async enhanceForAts(applicationId: string): Promise<{ tailored: TailoredCv; ats_check: AtsCheckResult }> {
    const res = await fetch(`/api/applications/${applicationId}/ats-enhance`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("ats-enhance failed");
    return res.json() as Promise<{ tailored: TailoredCv; ats_check: AtsCheckResult }>;
  },

  async runExperienceVerification(applicationId: string): Promise<ExperienceVerificationResult> {
    const res = await fetch(`/api/applications/${applicationId}/experience-check`, { method: "POST" });
    if (!res.ok) throw new Error("Experience check failed");
    const data = await res.json() as { experience_check: ExperienceVerificationResult };
    return data.experience_check;
  },

  async enhanceCvForExperience(applicationId: string): Promise<{ tailored: TailoredCv; experience_check: ExperienceVerificationResult }> {
    const res = await fetch(`/api/applications/${applicationId}/experience-enhance`, { method: "POST" });
    if (!res.ok) throw new Error("Experience enhance failed");
    return res.json() as Promise<{ tailored: TailoredCv; experience_check: ExperienceVerificationResult }>;
  },

  async reTailor(
    applicationId: string,
    opts?: { customInstructions?: string },
  ): Promise<TailoredCv> {
    const res = await fetch(`/api/applications/${applicationId}/retailor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts ?? {}),
    });
    if (!res.ok) throw new Error("Re-tailor failed");
    const data = await res.json();
    return data.tailored as TailoredCv;
  },

  async refineTailor(
    applicationId: string,
    opts?: { customInstructions?: string },
  ): Promise<TailoredCv> {
    const res = await fetch(`/api/applications/${applicationId}/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts ?? {}),
    });
    if (!res.ok) throw new Error("Refine failed");
    const data = await res.json();
    return data.tailored as TailoredCv;
  },

  xlsxUrl: "/api/applications.xlsx",
};
