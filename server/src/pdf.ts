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
const LINE = "#e1e6e3";
const PAGE_W = 595.28; // A4 points width
const PAGE_H = 841.89;
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
  return parts.join("  ·  ");
}

export async function buildPdf(tailored: TailoredCv, header: CvPdfHeader): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, info: { Title: `${header.name} CV` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = MARGIN;

    function moveDown(pt: number) {
      y += pt;
      doc.y = y;
    }

    function rule(color = LINE) {
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).strokeColor(color).lineWidth(0.75).stroke();
      moveDown(8);
    }

    function sectionHeading(title: string) {
      moveDown(14);
      doc.fontSize(7.5).fillColor(MUTED).font("Helvetica-Bold").text(title.toUpperCase(), MARGIN, y, {
        width: CONTENT_W,
        characterSpacing: 1.2,
      });
      y = doc.y + 4;
      rule();
    }

    // ---- Name & contact ----
    doc.fontSize(24).fillColor(INK).font("Helvetica-Bold").text(header.name, MARGIN, y, { width: CONTENT_W });
    y = doc.y + 4;

    if (tailored.headline) {
      doc.fontSize(11).fillColor(THREAD).font("Helvetica-Bold").text(tailored.headline, MARGIN, y, { width: CONTENT_W });
      y = doc.y + 4;
    }

    const contact = contactLine(header);
    if (contact) {
      doc.fontSize(8.5).fillColor(MUTED).font("Helvetica").text(contact, MARGIN, y, { width: CONTENT_W });
      y = doc.y + 6;
    }

    rule(THREAD);

    // ---- Summary ----
    if (tailored.summary) {
      doc.fontSize(9.5).fillColor(INK2).font("Helvetica").text(tailored.summary, MARGIN, y, {
        width: CONTENT_W,
        lineGap: 2,
      });
      y = doc.y;
    }

    // ---- Skills ----
    if (tailored.top_skills?.length) {
      sectionHeading("Skills");
      doc.fontSize(9).fillColor(INK2).font("Helvetica").text(tailored.top_skills.join("  ·  "), MARGIN, y, {
        width: CONTENT_W,
        lineGap: 2,
      });
      y = doc.y;
    }

    // ---- Experience ----
    if (tailored.experience?.length) {
      sectionHeading("Experience");
      for (const job of tailored.experience) {
        const rightSide = job.period ?? "";
        doc.fontSize(9.5).fillColor(INK).font("Helvetica-Bold").text(job.role, MARGIN, y, { continued: false, width: CONTENT_W - 100 });
        const jobY = y;
        doc.fontSize(8.5).fillColor(MUTED).font("Helvetica").text(rightSide, MARGIN, jobY, { align: "right", width: CONTENT_W });
        y = doc.y;
        doc.fontSize(9).fillColor(THREAD).font("Helvetica").text(`${job.company}${job.location ? ` · ${job.location}` : ""}`, MARGIN, y, { width: CONTENT_W });
        y = doc.y + 3;
        for (const bullet of job.bullets ?? []) {
          doc.fontSize(9).fillColor(INK2).font("Helvetica").text(`•  ${bullet}`, MARGIN + 8, y, { width: CONTENT_W - 8, lineGap: 1 });
          y = doc.y + 1;
        }
        y += 6;
        doc.y = y;

        if (y > PAGE_H - MARGIN - 60) {
          doc.addPage();
          y = MARGIN;
        }
      }
    }

    // ---- Projects ----
    if (tailored.projects?.length) {
      sectionHeading("Projects");
      for (const proj of tailored.projects) {
        doc.fontSize(9.5).fillColor(INK).font("Helvetica-Bold").text(proj.name, MARGIN, y, { continued: false, width: CONTENT_W });
        y = doc.y + 2;
        if (proj.description) {
          doc.fontSize(9).fillColor(INK2).font("Helvetica").text(proj.description, MARGIN, y, { width: CONTENT_W, lineGap: 1 });
          y = doc.y + 2;
        }
        if (proj.tech?.length) {
          doc.fontSize(8).fillColor(MUTED).font("Helvetica").text(proj.tech.join(", "), MARGIN, y, { width: CONTENT_W });
          y = doc.y + 2;
        }
        if (proj.link) {
          doc.fontSize(8).fillColor(THREAD).font("Helvetica").text(proj.link, MARGIN, y, { width: CONTENT_W });
          y = doc.y;
        }
        y += 6;
        doc.y = y;
      }
    }

    // ---- Education ----
    if (tailored.education?.length) {
      sectionHeading("Education");
      for (const edu of tailored.education) {
        doc.fontSize(9.5).fillColor(INK).font("Helvetica-Bold").text(edu.credential, MARGIN, y, { continued: false, width: CONTENT_W - 100 });
        const eduY = y;
        doc.fontSize(8.5).fillColor(MUTED).font("Helvetica").text(edu.period ?? "", MARGIN, eduY, { align: "right", width: CONTENT_W });
        y = doc.y + 2;
        doc.fontSize(9).fillColor(THREAD).font("Helvetica").text(edu.institution, MARGIN, y, { width: CONTENT_W });
        y = doc.y + 8;
        doc.y = y;
      }
    }

    doc.end();
  });
}
