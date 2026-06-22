# ATS Checker Block — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Додати ATS Check таб в ApplicationDetailPanel, що автоматично запускається після tailoring і показує AI-аналіз того, наскільки tailored CV пройде ATS-фільтр.

**Architecture:** Новий Claude endpoint `POST /api/applications/:id/ats-check` читає збережені `analysis` + `tailored` CV і викликає окремий AI-промпт (ATS expert role). Результат кешується в `application-data/<id>.json`. Frontend авто-тригерить виклик після tailoring у фоні; `AtsCheck.tsx` компонент або показує кешований результат або авто-тригерить запит при відкритті табу.

**Tech Stack:** Node.js + Express + TypeScript (backend), React 18 + Vite + TypeScript (frontend), Anthropic Claude claude-sonnet-4-6, Tailwind-like custom CSS.

**Agent split:**
- **Claude** — Tasks 1–5 (backend: `server/src/`)
- **Codex** — Tasks 6–10 (frontend: `client/src/`)

## Global Constraints

- TypeScript strict mode в обох workspace
- Всі Claude API виклики використовують forced tool-use (не вільний текст)
- `temperature: 0` для детермінованих AI-outputs (аналіз, scoring)
- `MODEL` константа береться з `server/src/config.ts` — не хардкодити
- Persistence — flat JSON файли в `server/data/application-data/<id>.json`
- Немає unit-тестів у проекті — верифікація через `npm run typecheck` + ручний запуск

---

## File Map

**Змінюються:**
- `server/src/schemas.ts` — додати `AtsCheckResult` type + `atsCheckTool`
- `server/src/store.ts` — розширити `ApplicationData` interface
- `server/src/prompts.ts` — додати `ATS_CHECK_SYSTEM` + `atsCheckUserMessage()`
- `server/src/pipeline.ts` — додати `runAtsCheck()`
- `server/src/index.ts` — додати `POST /api/applications/:id/ats-check` endpoint
- `client/src/types.ts` — додати ATS interfaces + розширити `ApplicationData`
- `client/src/api.ts` — додати `runAtsCheck()` метод
- `client/src/components/ApplicationDetailPanel.tsx` — додати 6-й таб "ATS Check"
- `client/src/App.tsx` — авто-тригер ATS check після tailoring
- `client/src/styles.css` — нові CSS класи для ATS Check

**Створюються:**
- `client/src/components/AtsCheck.tsx` — новий компонент

---

## Task 1: ATS Schema + Tool (Backend)

**Files:**
- Modify: `server/src/schemas.ts`

**Interfaces:**
- Produces: `AtsCheckResult`, `AtsKeywordCheck`, `AtsFormatCheck`, `AtsRecommendation`, `atsCheckTool` — використовуються в Tasks 2, 3, 4

- [ ] **Step 1: Відкрити `server/src/schemas.ts`, знайти кінець файлу (після блоку `tailorCvTool`).**

- [ ] **Step 2: Додати TypeScript інтерфейси одразу після `TailoredCv` interface:**

```typescript
export interface AtsKeywordCheck {
  keyword: string;
  found: boolean;
  location?: string; // e.g. "skills", "experience bullet 2"
}

export interface AtsFormatCheck {
  rule: string;
  passed: boolean;
  note?: string;
}

export interface AtsRecommendation {
  priority: "high" | "medium" | "low";
  text: string;
}

export interface AtsCheckResult {
  ats_score: number; // 0-100
  keyword_coverage: AtsKeywordCheck[];
  format_checks: AtsFormatCheck[];
  recommendations: AtsRecommendation[];
  verdict: string;
}
```

- [ ] **Step 3: Додати `atsCheckTool` після `tailorCvTool` (той самий Anthropic.Messages.Tool pattern):**

```typescript
export const atsCheckTool: Anthropic.Messages.Tool = {
  name: "record_ats_check",
  description:
    "Record a structured ATS compatibility analysis of a tailored CV. Score the CV against the job's ATS keywords and formatting standards.",
  input_schema: {
    type: "object",
    properties: {
      ats_score: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Overall ATS compatibility score 0-100.",
      },
      keyword_coverage: {
        type: "array",
        items: {
          type: "object",
          properties: {
            keyword: { type: "string" },
            found: { type: "boolean" },
            location: {
              type: "string",
              description: "Where the keyword was found, e.g. 'skills', 'experience bullet 2'. Omit if not found.",
            },
          },
          required: ["keyword", "found"],
        },
        description: "One entry per ATS keyword from the job analysis.",
      },
      format_checks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rule: { type: "string", description: "The formatting rule being checked." },
            passed: { type: "boolean" },
            note: {
              type: "string",
              description: "Specific issue details when passed is false. Omit when passed.",
            },
          },
          required: ["rule", "passed"],
        },
        description: "ATS formatting rule checks.",
      },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            priority: { type: "string", enum: ["high", "medium", "low"] },
            text: { type: "string", description: "Specific, actionable recommendation." },
          },
          required: ["priority", "text"],
        },
        description: "Ordered list of actionable improvements.",
      },
      verdict: {
        type: "string",
        description: "1-2 sentence overall verdict in the CV's language.",
      },
    },
    required: ["ats_score", "keyword_coverage", "format_checks", "recommendations", "verdict"],
  },
};
```

- [ ] **Step 4: Перевірити типи:**

```bash
npm run typecheck
```

Очікується: без помилок у `server/src/schemas.ts`.

- [ ] **Step 5: Commit:**

```bash
git add server/src/schemas.ts
git commit -m "feat(backend): add AtsCheckResult type and atsCheckTool schema"
```

---

## Task 2: Extend ApplicationData (Backend)

**Files:**
- Modify: `server/src/store.ts`

**Interfaces:**
- Consumes: `AtsCheckResult` з `./schemas.js`
- Produces: `ApplicationData` з полем `ats_check?` — використовується в Task 5

- [ ] **Step 1: У `server/src/store.ts` знайти рядок:**

```typescript
import type { JobAnalysis, TailoredCv } from "./schemas.js";
```

Замінити на:

```typescript
import type { JobAnalysis, TailoredCv, AtsCheckResult } from "./schemas.js";
```

- [ ] **Step 2: Знайти `ApplicationData` interface і додати поле:**

```typescript
export interface ApplicationData {
  jobText: string;
  analysis: JobAnalysis;
  tailored: TailoredCv;
  ats_check?: AtsCheckResult; // cached after first ATS analysis run
}
```

- [ ] **Step 3: Перевірити типи та переконатися що `saveApplicationData` / `readApplicationData` не потребують змін** (вони вже серіалізують повний об'єкт через `JSON.stringify`/`JSON.parse`):

```bash
npm run typecheck
```

- [ ] **Step 4: Commit:**

```bash
git add server/src/store.ts
git commit -m "feat(backend): extend ApplicationData with optional ats_check field"
```

---

## Task 3: ATS Prompt + User Message Builder (Backend)

**Files:**
- Modify: `server/src/prompts.ts`

**Interfaces:**
- Consumes: `JobAnalysis`, `TailoredCv` з `./schemas.js`
- Produces: `ATS_CHECK_SYSTEM` (string), `atsCheckUserMessage(analysis, tailored)` (string) — використовуються в Task 4

- [ ] **Step 1: У `server/src/prompts.ts` знайти кінець файлу (після `FOLLOWUP_SYSTEM`).**

- [ ] **Step 2: Перевірити поточний імпорт JobAnalysis/TailoredCv в prompts.ts. Якщо їх нема — додати:**

```typescript
import type { JobAnalysis, TailoredCv } from "./schemas.js";
```

- [ ] **Step 3: Додати `ATS_CHECK_SYSTEM` константу:**

```typescript
export const ATS_CHECK_SYSTEM = `\
You are a senior ATS (Applicant Tracking System) specialist and technical recruiter. \
Your task is to audit a tailored CV against the job's ATS keywords and formatting standards.

## Scoring Criteria (weights)

- **Keyword Coverage 40%**: Check each term in \`ats_keywords\` for verbatim presence anywhere \
in the CV (headline, summary, top_skills, experience bullets, project descriptions, education). \
Even partial matches (e.g. "React" matching "React.js") count as found — record the location.
- **Bullet Format 30%**: Every experience bullet must start with an action verb (e.g. "Built", \
"Developed", "Optimized"). Passive phrases like "Responsible for", "Duties included", \
"Helped with" are ATS red flags. Bullets must be 1–2 lines max.
- **Structure 20%**: Standard sections must be present (headline/title, summary, skills, experience, \
education). No special characters, ASCII art, or table-like structures that break text parsers.
- **Language Consistency 10%**: Detect the CV language from the headline and summary. All text \
(bullets, project descriptions, skills labels) must stay in that language. Mixed-language \
mid-sentence is penalized.

## Output Rules

1. Detect the CV language (English or Ukrainian) from \`tailored.headline\` and \`tailored.summary\`.
2. Write ALL \`recommendations[].text\` and \`verdict\` in that same language.
3. Be specific and actionable — name the exact keyword missing or quote the bullet that violates format.
4. Emit one entry in \`keyword_coverage\` per keyword in the \`ats_keywords\` array.
5. Always emit these format_checks (more allowed if you find additional issues):
   - "All experience bullets start with an action verb"
   - "No passive constructions (Responsible for / Helped with)"
   - "Bullet length ≤ 2 lines"
   - "Standard sections present (headline, summary, skills, experience)"
   - "Language consistency throughout CV"
`;
```

- [ ] **Step 4: Додати `atsCheckUserMessage` helper після `ATS_CHECK_SYSTEM`:**

```typescript
export function atsCheckUserMessage(
  analysis: JobAnalysis,
  tailored: TailoredCv,
): string {
  return `\
## ATS Keywords to Check

${JSON.stringify(analysis.ats_keywords, null, 2)}

## Tailored CV to Audit

\`\`\`json
${JSON.stringify(tailored, null, 2)}
\`\`\`

Audit the CV against the ATS keywords and formatting rules. Score it and provide actionable recommendations.`;
}
```

- [ ] **Step 5: Перевірити типи:**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit:**

```bash
git add server/src/prompts.ts
git commit -m "feat(backend): add ATS_CHECK_SYSTEM prompt and atsCheckUserMessage builder"
```

---

## Task 4: runAtsCheck Pipeline Function (Backend)

**Files:**
- Modify: `server/src/pipeline.ts`

**Interfaces:**
- Consumes: `atsCheckTool`, `AtsCheckResult` з `./schemas.js`; `ATS_CHECK_SYSTEM`, `atsCheckUserMessage` з `./prompts.js`
- Produces: `export async function runAtsCheck(analysis: JobAnalysis, tailored: TailoredCv): Promise<AtsCheckResult>`

- [ ] **Step 1: У `server/src/pipeline.ts` знайти рядок import зі schemas і додати нові exports:**

```typescript
import {
  analyzeJobTool,
  tailorCvTool,
  masterCvTool,
  atsCheckTool,
  type JobAnalysis,
  type TailoredCv,
  type MasterCvData,
  type AtsCheckResult,
} from "./schemas.js";
```

- [ ] **Step 2: Знайти рядок import з prompts і додати нові exports:**

```typescript
import {
  ANALYZE_SYSTEM,
  tailorUserMessage,
  FOLLOWUP_SYSTEM,
  COVER_LETTER_SYSTEM,
  COMPANY_BRIEF_SYSTEM,
  ATS_CHECK_SYSTEM,
  atsCheckUserMessage,
} from "./prompts.js";
```

- [ ] **Step 3: Додати `runAtsCheck` функцію після `tailorCv` (або наприкінці файлу перед будь-якими helper-функціями):**

```typescript
/** Run ATS compatibility check on a tailored CV against the job's keywords. */
export async function runAtsCheck(
  analysis: JobAnalysis,
  tailored: TailoredCv,
): Promise<AtsCheckResult> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    temperature: 0,
    system: ATS_CHECK_SYSTEM,
    tools: [atsCheckTool],
    tool_choice: { type: "tool", name: atsCheckTool.name },
    messages: [
      {
        role: "user",
        content: atsCheckUserMessage(analysis, tailored),
      },
    ],
  });
  return extractToolInput<AtsCheckResult>(message, atsCheckTool.name);
}
```

- [ ] **Step 4: Перевірити типи:**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit:**

```bash
git add server/src/pipeline.ts
git commit -m "feat(backend): add runAtsCheck pipeline function"
```

---

## Task 5: ATS Check Endpoint (Backend)

**Files:**
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `runAtsCheck` з `./pipeline.js`; `readApplicationData`, `saveApplicationData` з `./store.js`
- Produces: `POST /api/applications/:id/ats-check` → `{ ats_check: AtsCheckResult }`

- [ ] **Step 1: У `server/src/index.ts` знайти рядок import з pipeline і додати `runAtsCheck`:**

```typescript
import {
  analyzeJob,
  tailorCv,
  // ... інші існуючі
  runAtsCheck,
} from "./pipeline.js";
```

- [ ] **Step 2: Знайти endpoint `app.post("/api/applications/:id/interview", ...)` і додати новий endpoint одразу ПІСЛЯ нього (перед секцією CV Profiles або наступним endpoint):**

```typescript
app.post("/api/applications/:id/ats-check", async (req, res) => {
  const { id } = req.params;
  const data = await readApplicationData(id);
  if (!data) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  const result = await runAtsCheck(data.analysis, data.tailored);
  await saveApplicationData(id, { ...data, ats_check: result });
  res.json({ ats_check: result });
});
```

- [ ] **Step 3: Перевірити типи:**

```bash
npm run typecheck
```

- [ ] **Step 4: Запустити сервер і перевірити endpoint вручну:**

```bash
npm run dev:server
```

У другому терміналі (підставити реальний ID аплікації з `server/data/applications.json`):

```bash
curl -X POST http://localhost:8787/api/applications/<id>/ats-check | jq .
```

Очікується: JSON з полями `ats_score`, `keyword_coverage`, `format_checks`, `recommendations`, `verdict`.

Перевірити що `server/data/application-data/<id>.json` тепер містить `"ats_check"` ключ.

- [ ] **Step 5: Commit:**

```bash
git add server/src/index.ts
git commit -m "feat(backend): add POST /api/applications/:id/ats-check endpoint"
```

---

## Task 6: Frontend Types (Codex)

**Files:**
- Modify: `client/src/types.ts`

**Interfaces:**
- Produces: `AtsKeywordCheck`, `AtsFormatCheck`, `AtsRecommendation`, `AtsCheckResult` — використовуються в Tasks 7, 8; розширений `ApplicationData` — використовується в Task 8

- [ ] **Step 1: Відкрити `client/src/types.ts` і додати ATS інтерфейси після `TailoredCv`:**

```typescript
export interface AtsKeywordCheck {
  keyword: string;
  found: boolean;
  location?: string;
}

export interface AtsFormatCheck {
  rule: string;
  passed: boolean;
  note?: string;
}

export interface AtsRecommendation {
  priority: "high" | "medium" | "low";
  text: string;
}

export interface AtsCheckResult {
  ats_score: number;
  keyword_coverage: AtsKeywordCheck[];
  format_checks: AtsFormatCheck[];
  recommendations: AtsRecommendation[];
  verdict: string;
}
```

- [ ] **Step 2: Знайти `ApplicationData` interface і додати поле:**

```typescript
export interface ApplicationData {
  jobText: string;
  analysis: JobAnalysis;
  tailored: TailoredCv;
  ats_check?: AtsCheckResult;
}
```

- [ ] **Step 3: Перевірити типи:**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit:**

```bash
git add client/src/types.ts
git commit -m "feat(client): add ATS check types and extend ApplicationData"
```

---

## Task 7: API Method (Codex)

**Files:**
- Modify: `client/src/api.ts`

**Interfaces:**
- Consumes: `AtsCheckResult` з `./types`
- Produces: `api.runAtsCheck(id: string): Promise<{ ats_check: AtsCheckResult }>`

- [ ] **Step 1: Відкрити `client/src/api.ts`, додати import `AtsCheckResult` до існуючих type imports.**

- [ ] **Step 2: Знайти об'єкт `api` і додати метод після `sendInterviewMessage`:**

```typescript
async runAtsCheck(id: string): Promise<{ ats_check: AtsCheckResult }> {
  const res = await fetch(`/api/applications/${id}/ats-check`, { method: "POST" });
  return json<{ ats_check: AtsCheckResult }>(res);
},
```

- [ ] **Step 3: Перевірити типи:**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit:**

```bash
git add client/src/api.ts
git commit -m "feat(client): add api.runAtsCheck() method"
```

---

## Task 8: AtsCheck Component (Codex)

**Files:**
- Create: `client/src/components/AtsCheck.tsx`

**Interfaces:**
- Consumes: `api.runAtsCheck(id)` з `../api`; `AtsCheckResult`, `AtsKeywordCheck`, `AtsFormatCheck`, `AtsRecommendation` з `../types`; `FitGauge` з `./FitGauge`
- Produces: `<AtsCheck applicationId={string} initialResult={AtsCheckResult|undefined} />`

- [ ] **Step 1: Створити `client/src/components/AtsCheck.tsx`:**

```tsx
import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import type { AtsCheckResult } from "../types";
import FitGauge from "./FitGauge";

interface Props {
  applicationId: string;
  initialResult?: AtsCheckResult;
}

export default function AtsCheck({ applicationId, initialResult }: Props) {
  const [result, setResult] = useState<AtsCheckResult | null>(initialResult ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggered = useRef(false);

  useEffect(() => {
    if (initialResult || triggered.current) return;
    triggered.current = true;
    runCheck();
  }, []);

  async function runCheck() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.runAtsCheck(applicationId);
      setResult(res.ats_check);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ATS check failed");
    } finally {
      setLoading(false);
    }
  }

  if (!result && loading) {
    return <div className="drawer-loading">Analyzing ATS compatibility…</div>;
  }

  if (!result && error) {
    return (
      <div className="error-banner">
        {error}
        <button className="btn btn-ghost btn-sm" onClick={runCheck}>
          Retry
        </button>
      </div>
    );
  }

  if (!result) return null;

  const foundCount = result.keyword_coverage.filter((k) => k.found).length;
  const totalCount = result.keyword_coverage.length;

  return (
    <div className="ats-check">
      {/* Score */}
      <div className="ats-score-row">
        <FitGauge score={result.ats_score} />
        <p className="ats-verdict">{result.verdict}</p>
      </div>

      {/* Keyword Coverage */}
      <section>
        <h3 className="section-label">Keyword Coverage</h3>
        <p className="ats-section-summary">
          {foundCount} / {totalCount} keywords found
        </p>
        <div className="ats-keyword-grid">
          {result.keyword_coverage.map((k) => (
            <div
              key={k.keyword}
              className={`ats-keyword-chip ${k.found ? "found" : "missing"}`}
            >
              <span>{k.found ? "✓" : "✗"}</span>
              <span>{k.keyword}</span>
              {k.found && k.location && (
                <span className="ats-keyword-location">{k.location}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Format Checks */}
      <section>
        <h3 className="section-label">Format Checks</h3>
        <ul className="ats-format-list">
          {result.format_checks.map((fc) => (
            <li key={fc.rule} className="ats-format-item">
              <span className={`ats-format-icon ${fc.passed ? "pass" : "fail"}`}>
                {fc.passed ? "✓" : "✗"}
              </span>
              <div>
                <span>{fc.rule}</span>
                {!fc.passed && fc.note && (
                  <p className="ats-format-note">{fc.note}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <section>
          <h3 className="section-label">Recommendations</h3>
          <ul className="ats-rec-list">
            {result.recommendations.map((rec, i) => (
              <li key={i} className={`ats-rec-item ${rec.priority}`}>
                <p className="ats-rec-priority">{rec.priority}</p>
                <p>{rec.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Re-check */}
      <div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={runCheck}
          disabled={loading}
        >
          {loading ? "Re-checking…" : "Re-check ATS"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Перевірити типи:**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit:**

```bash
git add client/src/components/AtsCheck.tsx
git commit -m "feat(client): add AtsCheck component"
```

---

## Task 9: Wire ATS Tab in ApplicationDetailPanel (Codex)

**Files:**
- Modify: `client/src/components/ApplicationDetailPanel.tsx`

**Interfaces:**
- Consumes: `<AtsCheck />` з `./AtsCheck`; `data?.ats_check` з `ApplicationData`

- [ ] **Step 1: Додати import `AtsCheck` на початку файлу:**

```tsx
import AtsCheck from "./AtsCheck";
```

- [ ] **Step 2: Знайти `activeSection` state і розширити тип:**

```tsx
const [activeSection, setActiveSection] = useState<
  "overview" | "cv" | "prep" | "followup" | "interview" | "ats"
>("overview");
```

- [ ] **Step 3: Знайти блок табів (`detail-tabs` div) і додати 6-й таб після "Mock Interview":**

```tsx
<button
  className={`detail-tab ${activeSection === "ats" ? "on" : ""}`}
  onClick={() => setActiveSection("ats")}
>
  ATS Check
</button>
```

- [ ] **Step 4: Знайти `detail-body` div і додати ATS секцію після блоку `interview`:**

```tsx
{activeSection === "ats" && (
  <AtsCheck
    key={application.id}
    applicationId={application.id}
    initialResult={data?.ats_check}
  />
)}
```

- [ ] **Step 5: Перевірити типи:**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit:**

```bash
git add client/src/components/ApplicationDetailPanel.tsx
git commit -m "feat(client): add ATS Check tab to ApplicationDetailPanel"
```

---

## Task 10: Auto-trigger + CSS (Codex)

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/styles.css`

**Interfaces:**
- Consumes: `api.runAtsCheck(id)` — fire-and-forget після tailoring

- [ ] **Step 1: У `client/src/App.tsx` знайти місце де обробляється результат `runTailor` (десь після `setApps((prev) => [res.application, ...prev])`). Додати background ATS check одразу після:**

```typescript
// Background: pre-compute ATS check so tab shows instantly when user opens it
api.runAtsCheck(res.application.id).catch(() => {});
```

- [ ] **Step 2: Перевірити типи:**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit:**

```bash
git add client/src/App.tsx
git commit -m "feat(client): auto-trigger ATS check in background after tailoring"
```

- [ ] **Step 4: У `client/src/styles.css` знайти кінець файлу. Додати CSS для ATS компонента:**

Спочатку додати `--gap-weak` до `:root` блоку (знайти `:root {` та додати всередину):
```css
--gap-weak: #f7e7dd;
```

Потім додати нові класи в кінець файлу:

```css
/* ───── ATS Check ───── */
.ats-check {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.ats-score-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.ats-verdict {
  font-size: 0.88rem;
  color: var(--muted);
  text-align: center;
  max-width: 36ch;
}

.ats-section-summary {
  font-size: 0.82rem;
  color: var(--muted);
  margin-bottom: 0.5rem;
}

.ats-keyword-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.4rem;
}

.ats-keyword-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 0.8rem;
  overflow: hidden;
}

.ats-keyword-chip.found {
  border-color: var(--thread);
  background: color-mix(in srgb, var(--thread) 12%, transparent);
  color: var(--thread);
}

.ats-keyword-chip.missing {
  border-color: var(--gap);
  background: var(--gap-weak);
  color: var(--gap);
}

.ats-keyword-location {
  font-size: 0.7rem;
  color: var(--muted);
  margin-left: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ats-format-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.ats-format-item {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
}

.ats-format-icon {
  flex: none;
  font-size: 0.85rem;
}

.ats-format-icon.pass {
  color: var(--thread);
}

.ats-format-icon.fail {
  color: var(--gap);
}

.ats-format-note {
  font-size: 0.82rem;
  color: var(--muted);
  font-style: italic;
  margin: 0.15rem 0 0;
}

.ats-rec-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.ats-rec-item {
  padding: 0.6rem 0.75rem;
  border-left: 3px solid var(--line);
  border-radius: 0 8px 8px 0;
  background: var(--panel-2, var(--panel));
}

.ats-rec-item.high {
  border-left-color: var(--gap);
}

.ats-rec-item.medium {
  border-left-color: var(--partial);
}

.ats-rec-item.low {
  border-left-color: var(--line);
}

.ats-rec-priority {
  font-size: 0.67rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 600;
  color: var(--muted);
  margin: 0 0 0.2rem;
}
```

- [ ] **Step 5: Commit:**

```bash
git add client/src/styles.css
git commit -m "feat(client): add ATS Check CSS classes and --gap-weak token"
```

---

## Verification (End-to-End)

- [ ] Запустити `npm run dev` (client + server)
- [ ] Вставити вакансію, натиснути Tailor → перевірити що в консолі браузера нема помилок після tailoring
- [ ] Відкрити Application Detail → натиснути "ATS Check" таб → має з'явитися spinner → результат з score, keywords, format checks, recommendations
- [ ] Перезавантажити сторінку → відкрити ту саму аплікацію → "ATS Check" таб → результат показується **моментально** (кеш)
- [ ] Натиснути "Re-check ATS" → кнопка показує "Re-checking…", результат оновлюється
- [ ] Перевірити `server/data/application-data/<id>.json` — повинен містити ключ `"ats_check"`
- [ ] Перевірити що `GET /api/applications/<id>/data` повертає `ats_check` у JSON
- [ ] `npm run typecheck` — без помилок
