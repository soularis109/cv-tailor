# CV Tailor — Project Context

## Project

Job-hunt workbench: tailor CVs to specific job postings via AI, export ATS-friendly documents, track applications.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript (`client/`) |
| Backend | Node.js + Express + TypeScript (`server/`) |
| AI | Anthropic Claude API (claude-sonnet-4-6) |
| Workers | Cloudflare Workers runtime |
| Docs export | docx, pdf-lib |
| Validation | Zod |

## Directory Structure

```
client/       React frontend (Vite, Zustand, React Query, Tailwind)
server/       Express API + AI prompts + document generation
  src/
    prompts.ts      AI prompt templates
    schemas.ts      Zod schemas
    docx.ts         DOCX generation
    pdf.ts          PDF generation
  data/
    master-cv.json  Source CV data
docs/         Design specs and documentation
.claude/
  agents/     Custom Claude Code subagents
  skills/     Custom skills
```

## Dev Commands

```bash
npm run dev           # start client + server concurrently
npm run dev:client    # Vite dev server (port 5173)
npm run dev:server    # Express + tsx watch (port 8787)
npm run typecheck     # TypeScript check both workspaces
npm run install:all   # install deps in client/ and server/
```

## Agent Delegation

| Agent | Scope | Trigger |
|-------|-------|---------|
| **Claude** (this) | `server/`, architecture, AI prompts, Zod schemas | default |
| **codex** subagent | `client/` — React, Tailwind, Zustand, hooks | будь-яка frontend задача |
| **gemini** subagent | Universal — second opinion, research, будь-яке завдання | немає конкретного агента |
| **frontend** subagent | React спеціаліст (прямий Claude, без CLI) | компонент, хук, сторінка |
| **reviewer** subagent | Read-only code audit | review, рев'ю, знайди баги |
| **business-analyst** subagent | Product/UX gap analysis | що бракує, UX audit |

## Key Files

- `server/src/schemas.ts` — Zod типи для CV, applications, tailoring
- `server/src/prompts.ts` — AI системні та user промпти
- `server/data/master-cv.json` — майстер-резюме (єдине джерело правди)
- `client/src/` — React компоненти, сторінки, стор

## Conventions

- TypeScript strict mode в обох workspaces
- Zod для валідації на межах API
- Без mock-ів у тестах — тільки реальна логіка
- Claude = backend, Codex = frontend (розподіл закріплений у пам'яті)
