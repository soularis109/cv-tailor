# CV Tailor — a job-hunt workbench

Paste a job posting, and an agent rewrites your CV for that specific role using
**only the facts in your master CV** — nothing invented. It scores the fit, maps each
requirement to your real evidence, exports an ATS-friendly `.docx`, and logs the
application to a spreadsheet you can track.

Built for engineers applying broadly — junior to senior — who don't want to hand-tailor
a CV for every posting.

## How it works

```
job posting ──▶ [1] analyze ──▶ structured requirements + ATS keywords
                                          │
your master CV ───────────────────────────┤
                                          ▼
                              [2] tailor ──▶ tailored CV + coverage map + fit score
                                          │
                                          ├──▶ .docx export (ATS-friendly)
                                          └──▶ row added to the pipeline (.xlsx + JSON)
```

Two separate model calls keep it reliable:

1. **Analyze** — reads the posting into structured data: must-haves, nice-to-haves,
   core tech, seniority, and the exact ATS keywords a parser would match (verbatim).
2. **Tailor** — rewrites your master CV for the role. It selects and reorders relevant
   experience and rephrases bullets to mirror the posting's language **only where the
   underlying fact is already true**. It also returns an honest `coverage` map
   (strong / partial / missing) and a fit score, so you see your real gaps.

Both use the Anthropic Messages API with a forced tool call, which guarantees
well-formed JSON output.

## Project layout

```
cv-tailor/
├─ server/                Node + Express + TypeScript
│  ├─ src/
│  │  ├─ index.ts         routes
│  │  ├─ pipeline.ts      analyze() + tailor() — the two model calls
│  │  ├─ prompts.ts       system prompts (the no-fabrication guardrails)
│  │  ├─ schemas.ts       tool schemas + types
│  │  ├─ docx.ts          ATS-friendly .docx renderer
│  │  └─ store.ts         applications store (JSON, mirrored to .xlsx)
│  └─ data/
│     └─ master-cv.json   ← replace this with your own
└─ client/                React + Vite + TypeScript
   └─ src/
      ├─ App.tsx
      └─ components/       FitGauge, Coverage, CvPreview, Pipeline, MasterCvDrawer
```

## Setup

Requires Node 18+ (`fetch` and ESM are used throughout).

```bash
# 1. install both workspaces
npm run install:all

# 2. add your Anthropic API key
cp server/.env.example server/.env
#    then edit server/.env and paste your key (get one at console.anthropic.com)

# 3. put in your own CV
#    edit server/data/master-cv.json, or do it later in the UI ("Master CV" button)

# 4. run both server and client
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` to the Node
server on port 8787, so the API key never reaches the browser.

## Using it

- **Tailor tab** — paste a posting, hit *Tailor for this role*. You get the fit score,
  a requirement-coverage map, an honest read of your gaps, and the rewritten CV. Hit
  *Download .docx* for the file to submit.
- **Pipeline tab** — every tailoring run is logged here. Edit company, salary, notes,
  and move the status (Drafted → Applied → Screening → Interview → Offer / Rejected).
  *Open Excel* downloads the live `applications.xlsx`.

Your data lives in `server/data/` — `master-cv.json`, `applications.json`, and the
generated `applications.xlsx`. It is all local to your machine.

## Making it yours

- **Model** — set `ANTHROPIC_MODEL` in `server/.env`. Default is `claude-sonnet-4-6`.
  Switch the analyze step to a cheaper model in `pipeline.ts` if you tailor a lot.
- **Output fields** — the tailored CV shape lives in `schemas.ts` (`tailorCvTool`). Add a
  field there, surface it in `CvPreview.tsx`, and render it in `docx.ts`.
- **Tracker columns** — edit `COLUMNS` and the `Application` type in `store.ts`, then the
  table in `Pipeline.tsx`.
- **CV style** — `docx.ts` is deliberately single-column and parser-friendly. Adjust
  fonts, spacing, and headings there.

## A note on honesty

The prompts forbid inventing experience, skills, employers, dates, or metrics. That is
on purpose: a CV that embellishes falls apart in the first technical interview. The
`coverage` map and `match_notes` are there to show you where you're genuinely weak for a
role — treat them as prep, not as something to paper over.
# cv-tailor
