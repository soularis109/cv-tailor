---
name: project-ba-audit
description: Business analyst audit результати — 20-item backlog, 4 milestones, критичні dead-ends
metadata:
  type: project
---

Повний BA audit проведено 2026-06-17. Затверджено план у `.claude/plans/use-the-business-analyst-jolly-pixel.md`.

**Why:** Audit виявив critical dead-ends де дані зберігаються але UI не може їх прочитати, silent failures, і деструктивні дії без підтвердження.

**How to apply:** Використовувати backlog як reference при плануванні будь-яких нових фіч. Milestone порядок: M1 (core + detail + PDF) → M2 (data integrity) → M3 (onboarding/tracker UX) → M4 (auth/scale).

## M1 — РЕАЛІЗОВАНО 2026-06-17

### Зроблено:
1. **Toast система** — `client/src/utils/toast.ts` + `client/src/components/Toast.tsx`; підтримує action (undo)
2. **ApplicationDetailPanel** — `client/src/components/ApplicationDetailPanel.tsx`; tabs: Overview / Tailored CV / Interview Prep; notes editable
3. **Pipeline row click** — кожен рядок відкриває detail panel; клік на комірки не propagate
4. **Editable role** — `role` тепер inline-editable у Pipeline (було read-only)
5. **Undo delete** — 5-секундний undo toast перед реальним DELETE запитом
6. **Master CV guard** — `runTailor` перевіряє masterLoading/master; якщо немає CV відкриває drawer
7. **Pipeline loading/error states** — skeleton loader + retry на помилку завантаження
8. **Docx/PDF error handling** — try/catch із showToast замість silent uncaught rejection
9. **PDF export** — `server/src/pdf.ts` (pdfkit), endpoint `POST /api/pdf`, `api.downloadPdf()`; обидві кнопки в result view і detail panel
10. **MasterCvDrawer error fix** — 404 → template (OK), інші помилки → показати повідомлення (не маскувати)
11. **Optimistic patch error feedback** — patch fail показує toast "Could not save — reverted"

## P1/P2 — ЩЕ НЕ ЗРОБЛЕНО (M2/M3/M4)
- Master CV schema validation (P1)
- Search/filter/sort у Pipeline (P1)  
- First-run onboarding drawer hero (P1)
- Export master CV (P2)
- Pipeline summary stats (P2)
- Auth + CORS lockdown + rate limit (P0 для hosted — M4)
- Concurrency-safe store (P2)
- Retry/backoff на Anthropic calls (P2)
- Dialog a11y / focus trap (P2)
