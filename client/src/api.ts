import type { Application, TailoredCv, TailorResponse } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export type MasterCv = Record<string, unknown> & { name?: string; title?: string };

export const api = {
  async getMasterCv(): Promise<MasterCv> {
    return json(await fetch("/api/master-cv"));
  },

  async putMasterCv(cv: MasterCv): Promise<void> {
    await json(
      await fetch("/api/master-cv", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cv),
      }),
    );
  },

  async tailor(jobText: string, jobUrl: string, source: string): Promise<TailorResponse> {
    return json(
      await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobText, jobUrl, source }),
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
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : "CV.docx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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

  xlsxUrl: "/api/applications.xlsx",
};
