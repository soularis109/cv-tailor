import type { Application, ApplicationData, AtsCheckResult, JobAnalysis, TailoredCv, TailorResponse } from "./types";

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
    userLevel?: "junior" | "middle" | "senior",
  ): Promise<TailorResponse> {
    return json(
      await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobText, jobUrl, source, analysis, customInstructions, cvProfile, userLevel }),
      }),
    );
  },

  async downloadDocx(tailored: TailoredCv): Promise<void> {
    const res = await fetch("/api/docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tailored }),
    });
    if (!res.ok) throw new Error("Could not generate the .docx file.");
    await triggerDownload(res, "CV.docx");
  },

  async downloadPdf(tailored: TailoredCv): Promise<void> {
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tailored }),
    });
    if (!res.ok) throw new Error("Could not generate the PDF.");
    await triggerDownload(res, "CV.pdf");
  },

  async getApplications(): Promise<Application[]> {
    return json(await fetch("/api/applications"));
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
    return res.json() as Promise<AtsCheckResult>;
  },

  xlsxUrl: "/api/applications.xlsx",
};
