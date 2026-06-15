# PDF Export — Design Spec
_Date: 2026-06-15_

## Overview

Add a "Download PDF" export alongside the existing "Download .docx" option in CV Tailor.
The PDF is generated server-side via Puppeteer (headless Chrome), from an HTML string
with all styles inlined — no external resources required.

---

## Architecture

```
Client                        Server
──────                        ──────
downloadPdf(tailored) ──POST /api/pdf──► buildPdf(cv, header)
                                              │
                                              ▼
                                        HTML string (inline CSS)
                                              │
                                              ▼
                                        Puppeteer page.pdf()
                                              │
                                              ▼
                              Buffer ──► res.send() → .pdf attachment
```

---

## Server

### New file: `server/src/pdf.ts`

**Signature:** `buildPdf(cv: TailoredCv, header: CvHeader): Promise<Buffer>`

Responsibilities:
1. Build a complete, self-contained HTML document (full `<html>…</html>`) with all CSS inlined.
2. Typography: `system-ui` for body text, `monospace` for code/tech tokens. No external font loading.
3. Colour palette mirrors `docx.ts`: ACCENT `#0E7A63`, INK `#16181A`, MUTED `#5F6B66`.
4. Sections: Name + contact row, Headline, Summary, Skills, Experience, Projects, Education.
5. Launch `puppeteer` (full package, auto-downloads Chromium), open a new page, set content,
   call `page.pdf({ format: 'A4', printBackground: false })`, close browser, return Buffer.

### New route in `server/src/index.ts`

`POST /api/pdf`
- Body: `{ tailored: TailoredCv }`
- Behaviour identical to `/api/docx`: reads master CV for header fields, calls `buildPdf`, returns file.
- Response headers: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<safe>.pdf"`

---

## Client

### `client/src/api.ts`

Add `downloadPdf(tailored: TailoredCv): Promise<void>`:
- Mirrors `downloadDocx` exactly: POST to `/api/pdf`, read blob + Content-Disposition, trigger download.

### `client/src/App.tsx`

Add "Download PDF" button next to "Download .docx" in two places:
1. `result-summary` card (inside `summary-meta`, next to the existing `btn-primary` docx button)
2. `cv-card-head` (next to the existing ghost docx button)

Both buttons use the same style class as their sibling docx button.

---

## Error handling

Same pattern as `/api/docx`: on any error, `fail(res, err)` returns `500` JSON with `{ error }`.
Client shows nothing special — the existing error surface (console / uncaught) is sufficient for a local tool.

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Puppeteer variant | `puppeteer` (full) | Local tool; simpler, single dependency, auto-manages Chromium |
| Fonts | `system-ui` / `monospace` | No font embedding needed; readability over pixel-perfect |
| PDF orientation | A4 portrait | Standard CV format |
| Print background | false | Keeps PDF clean on white |
