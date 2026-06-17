import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  AlignmentType,
  BorderStyle,
} from "docx";
import type { TailoredCv } from "./schemas.js";

export interface CvHeader {
  name: string;
  location?: string;
  email?: string;
  phone?: string;
  links?: Record<string, string>;
}

const FONT = "Calibri";
const ACCENT = "0E7A63";
const INK = "16181A";
const MUTED = "5F6B66";

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 220, after: 90 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "D8DDDA", space: 2 },
    },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 20,
        color: ACCENT,
        font: FONT,
        characterSpacing: 4,
      }),
    ],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 21, color: INK, font: FONT })],
  });
}

/** Build an ATS-friendly single-column .docx. Returns a Buffer. */
export async function buildDocx(cv: TailoredCv, header: CvHeader): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Name
  children.push(
    new Paragraph({
      spacing: { after: 20 },
      children: [
        new TextRun({ text: header.name, bold: true, size: 36, color: INK, font: FONT }),
      ],
    }),
  );

  // Headline
  if (cv.headline) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: cv.headline, size: 22, color: ACCENT, font: FONT }),
        ],
      }),
    );
  }

  // Contact line
  const contactRuns: (TextRun | ExternalHyperlink)[] = [];
  const parts: { text: string; link?: string }[] = [];
  if (header.location) parts.push({ text: header.location });
  if (header.email) parts.push({ text: header.email, link: `mailto:${header.email}` });
  if (header.phone) parts.push({ text: header.phone });
  for (const [, url] of Object.entries(header.links ?? {})) {
    parts.push({ text: url.replace(/^https?:\/\//, ""), link: url });
  }
  parts.forEach((p, i) => {
    if (i > 0) contactRuns.push(new TextRun({ text: "  |  ", size: 19, color: MUTED, font: FONT }));
    if (p.link) {
      contactRuns.push(
        new ExternalHyperlink({
          link: p.link,
          children: [new TextRun({ text: p.text, size: 19, color: ACCENT, font: FONT })],
        }),
      );
    } else {
      contactRuns.push(new TextRun({ text: p.text, size: 19, color: MUTED, font: FONT }));
    }
  });
  if (contactRuns.length) {
    children.push(new Paragraph({ spacing: { after: 80 }, children: contactRuns }));
  }

  // Summary
  if (cv.summary) {
    children.push(sectionHeading("Summary"));
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: cv.summary, size: 21, color: INK, font: FONT })],
      }),
    );
  }

  // Skills
  if (cv.top_skills?.length) {
    children.push(sectionHeading("Skills"));
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: cv.top_skills.join(", "), size: 21, color: INK, font: FONT }),
        ],
      }),
    );
  }

  // Experience
  if (cv.experience?.length) {
    children.push(sectionHeading("Experience"));
    for (const job of cv.experience) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 0 },
          children: [
            new TextRun({ text: job.role, bold: true, size: 22, color: INK, font: FONT }),
            new TextRun({ text: `  —  ${job.company}`, size: 22, color: INK, font: FONT }),
          ],
        }),
      );
      const meta = [job.period, job.location].filter(Boolean).join("  |  ");
      if (meta) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: meta, italics: true, size: 19, color: MUTED, font: FONT })],
          }),
        );
      }
      for (const b of job.bullets ?? []) children.push(bullet(b));
    }
  }

  // Projects
  if (cv.projects?.length) {
    children.push(sectionHeading("Projects"));
    for (const p of cv.projects) {
      const runs: (TextRun | ExternalHyperlink)[] = [
        new TextRun({ text: p.name, bold: true, size: 21, color: INK, font: FONT }),
      ];
      if (p.link) {
        runs.push(new TextRun({ text: "  ", size: 21, font: FONT }));
        runs.push(
          new ExternalHyperlink({
            link: p.link,
            children: [new TextRun({ text: p.link.replace(/^https?:\/\//, ""), size: 18, color: ACCENT, font: FONT })],
          }),
        );
      }
      children.push(new Paragraph({ spacing: { before: 60, after: 0 }, children: runs }));
      children.push(
        new Paragraph({
          spacing: { after: 20 },
          children: [new TextRun({ text: p.description, size: 21, color: INK, font: FONT })],
        }),
      );
      if (p.tech?.length) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: p.tech.join(", "), size: 18, color: MUTED, font: FONT })],
          }),
        );
      }
    }
  }

  // Education
  if (cv.education?.length) {
    children.push(sectionHeading("Education"));
    for (const e of cv.education) {
      children.push(
        new Paragraph({
          spacing: { after: 30 },
          alignment: AlignmentType.LEFT,
          children: [
            new TextRun({ text: e.credential, bold: true, size: 21, color: INK, font: FONT }),
            new TextRun({ text: `  —  ${e.institution}  |  ${e.period}`, size: 20, color: MUTED, font: FONT }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT } } } },
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
