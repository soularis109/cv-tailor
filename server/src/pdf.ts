import PDFDocument from "pdfkit";
import type { TailoredCv } from "./schemas.js";

export interface CvPdfHeader {
  name: string;
  location?: string;
  email?: string;
  phone?: string;
  links?: Record<string, string>;
}

const THREAD = "#0e7a63";
const INK = "#16181a";
const INK2 = "#33373b";
const MUTED = "#5f6b66";
const PAGE_W = 595.28;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

function contactLine(header: CvPdfHeader): string {
  const parts: string[] = [];
  if (header.location) parts.push(header.location);
  if (header.email) parts.push(header.email);
  if (header.phone) parts.push(header.phone);
  if (header.links) {
    for (const [, url] of Object.entries(header.links)) {
      if (url) parts.push(url);
    }
  }
  // ATS-safe ASCII separator
  return parts.join("  |  ");
}

export async function buildPdf(tailored: TailoredCv, header: CvPdfHeader): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, info: { Title: `${header.name} CV` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = MARGIN;

    function text(
      content: string,
      opts: {
        font?: string;
        size?: number;
        color?: string;
        lineGap?: number;
        width?: number;
      } = {},
    ) {
      const { font = "Helvetica", size = 9.5, color = INK, lineGap = 1, width = CONTENT_W } = opts;
      doc.fontSize(size).fillColor(color).font(font).text(content, MARGIN, y, { width, lineGap });
      y = doc.y;
    }

    function gap(pt: number) {
      y += pt;
      doc.y = y;
    }

    function sectionHeading(title: string) {
      gap(14);
      // Plain uppercase text — no graphic lines, fully ATS-parseable
      doc.fontSize(7.5).fillColor(MUTED).font("Helvetica-Bold").text(
        title.toUpperCase(),
        MARGIN,
        y,
        { width: CONTENT_W, characterSpacing: 1.2 },
      );
      y = doc.y + 4;
      // Thin underline via a short text rule (dashes) is intentionally omitted —
      // graphical lines break ATS text extraction. Spacing alone provides visual separation.
    }

    function checkPageBreak() {
      if (y > 841.89 - MARGIN - 60) {
        doc.addPage();
        y = MARGIN;
      }
    }

    // ---- Name ----
    doc.fontSize(24).fillColor(INK).font("Helvetica-Bold").text(header.name, MARGIN, y, { width: CONTENT_W });
    y = doc.y + 4;

    // ---- Headline ----
    if (tailored.headline) {
      doc.fontSize(11).fillColor(THREAD).font("Helvetica-Bold").text(tailored.headline, MARGIN, y, { width: CONTENT_W });
      y = doc.y + 4;
    }

    // ---- Contact (single left-to-right line, ATS reads cleanly) ----
    const contact = contactLine(header);
    if (contact) {
      doc.fontSize(8.5).fillColor(MUTED).font("Helvetica").text(contact, MARGIN, y, { width: CONTENT_W });
      y = doc.y + 10;
    }

    // ---- Summary ----
    if (tailored.summary) {
      sectionHeading("Summary");
      text(tailored.summary, { color: INK2, lineGap: 2 });
    }

    // ---- Skills ----
    if (tailored.top_skills?.length) {
      sectionHeading("Skills");
      // Comma-separated plain text — most ATS-friendly format
      text(tailored.top_skills.join(", "), { color: INK2, lineGap: 2 });
    }

    // ---- Experience ----
    if (tailored.experience?.length) {
      sectionHeading("Experience");
      for (const job of tailored.experience) {
        checkPageBreak();

        // Role (bold, line 1) — ATS reads top-to-bottom, left-to-right
        doc.fontSize(9.5).fillColor(INK).font("Helvetica-Bold").text(job.role, MARGIN, y, { width: CONTENT_W });
        y = doc.y + 2;

        // Company  |  Location  |  Period (all on line 2, sequential — ATS-safe)
        const jobMeta = [job.company, job.location, job.period].filter(Boolean).join("  |  ");
        doc.fontSize(9).fillColor(THREAD).font("Helvetica").text(jobMeta, MARGIN, y, { width: CONTENT_W });
        y = doc.y + 4;

        // Bullets
        for (const b of job.bullets ?? []) {
          doc.fontSize(9).fillColor(INK2).font("Helvetica").text(`• ${b}`, MARGIN + 8, y, {
            width: CONTENT_W - 8,
            lineGap: 1,
          });
          y = doc.y + 2;
          checkPageBreak();
        }
        gap(6);
      }
    }

    // ---- Projects ----
    if (tailored.projects?.length) {
      sectionHeading("Projects");
      for (const proj of tailored.projects) {
        checkPageBreak();

        doc.fontSize(9.5).fillColor(INK).font("Helvetica-Bold").text(proj.name, MARGIN, y, { width: CONTENT_W });
        y = doc.y + 2;

        if (proj.description) {
          text(proj.description, { color: INK2, lineGap: 1 });
          gap(2);
        }
        if (proj.tech?.length) {
          text(proj.tech.join(", "), { color: MUTED, size: 8.5 });
          gap(2);
        }
        if (proj.link) {
          text(proj.link, { color: THREAD, size: 8.5 });
        }
        gap(6);
      }
    }

    // ---- Education ----
    if (tailored.education?.length) {
      sectionHeading("Education");
      for (const edu of tailored.education) {
        checkPageBreak();

        doc.fontSize(9.5).fillColor(INK).font("Helvetica-Bold").text(edu.credential, MARGIN, y, { width: CONTENT_W });
        y = doc.y + 2;

        // Institution  |  Period — sequential, ATS-safe
        const eduMeta = [edu.institution, edu.period].filter(Boolean).join("  |  ");
        doc.fontSize(9).fillColor(THREAD).font("Helvetica").text(eduMeta, MARGIN, y, { width: CONTENT_W });
        y = doc.y + 8;
      }
    }

    doc.end();
  });
}
