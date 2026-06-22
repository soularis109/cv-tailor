# Фаза 2 — Active Coach

> **Мета:** перетворити пасивний трекер на активного job-hunt помічника.
> **Таймлайн:** тиждень 3-4
> **Залежність:** Фаза 1 повинна бути завершена (або незалежно — backend/frontend не перетинаються з Ф1)
> **Агенти:** Claude → `server/src/`, Codex → `client/src/`

---

## КОНТЕКСТ

Pipeline tracker — пасивний список. Він не підказує:
- Що заявка "Applied" вже 2 тижні і треба follow-up
- Що у вакансії є 3 red flags (ризик компанії)
- Скільки % заявок взагалі дали відповідь

Backend вже генерує `red_flags` і зберігає в `application-data/{id}.json` — але фронтенд нічого з цим не робить. Задача: показати ці дані.

---

## BACKEND — `server/src/` (агент: Claude)

### Задача B2.1 — `redFlagsCount` в Application record

**Проблема:** `red_flags` є в `ApplicationData` (окремий файл), але не в `Application` (основний запис). Pipeline рядок не може показати risk badge без окремого запиту.

**Рішення:** зберігати `redFlagsCount: number` безпосередньо в Application при створенні.

**Файл 1: `server/src/schemas.ts`**

Знайти Zod схему `Application` (або `applicationSchema`) і додати поле:
```typescript
redFlagsCount: z.number().int().min(0).default(0),
```

**Файл 2: `server/src/store.ts`**

Знайти функцію що створює новий Application record (викликається в `POST /api/tailor`).
Додати поле при створенні:
```typescript
redFlagsCount: analysis.red_flags?.length ?? 0,
```
де `analysis` — це `JobAnalysis` об'єкт що вже є в scope під час збереження.

**Backward compatibility:** старі записи в `applications.json` матимуть `undefined` для цього поля → фронтенд повинен зробити `a.redFlagsCount ?? 0` для fallback.

**Файл 3: `server/src/index.ts`**

`PATCH /api/applications/:id` — поле `redFlagsCount` НЕ повинно бути patchable (пропустити в whitelist оновлень). Перевірити що воно не включене в список дозволених полів для оновлення.

---

### Задача B2.2 — Follow-up Email Draft endpoint

**Нові файли/зміни:**

**`server/src/prompts.ts` — додати новий prompt:**
```typescript
export const FOLLOWUP_SYSTEM = `You are a senior career coach helping a job seeker write a professional follow-up email.

You will receive:
- Company name and role title
- Days since applying
- The candidate's headline from their tailored CV
- 2-3 strongest coverage areas from the job analysis
- The candidate's name

Write a short, professional follow-up email (3-5 sentences total):
1. Brief re-introduction and application reference
2. One sentence reinforcing genuine interest / key strength
3. Polite call to action

Rules:
- Plain text only (no markdown, no HTML)
- No fabricated achievements or metrics not provided
- Warm but professional tone
- Do NOT mention specific salary expectations
- Under 120 words`;
```

**`server/src/pipeline.ts` — нова функція після існуючих:**
```typescript
export async function generateFollowupEmail(
  application: { company: string; role: string; dateAdded: string },
  data: { tailored: { headline: string; coverage: Array<{ requirement: string; status: string }> } },
  candidateName: string,
  daysWaited: number
): Promise<string> {
  // Зібрати 2-3 "strong" coverage items як контекст сили
  const strengths = data.tailored.coverage
    .filter((c) => c.status === "strong")
    .slice(0, 3)
    .map((c) => c.requirement)
    .join(", ");

  const userMessage = `
Company: ${application.company}
Role: ${application.role}
Days since applying: ${daysWaited}
My headline: ${data.tailored.headline}
Key strengths for this role: ${strengths || "strong technical background"}
My name: ${candidateName}
  `.trim();

  // Використати anthropic client (вже є в pipeline.ts) з simple text response
  const message = await anthropic.messages.create({
    model: MODEL, // реюз з існуючого config
    max_tokens: 300,
    system: FOLLOWUP_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text.trim();
}
```

**`server/src/index.ts` — новий endpoint:**
```typescript
app.post("/api/applications/:id/draft-followup", async (req, res) => {
  const { id } = req.params;

  // Завантажити application metadata
  const apps = store.loadApplications();
  const application = apps.find((a) => a.id === id);
  if (!application) return res.status(404).json({ error: "Not found" });

  // Завантажити full ApplicationData
  const data = store.loadApplicationData(id);
  if (!data) return res.status(404).json({ error: "Application data not found" });

  // Завантажити master CV щоб дістати ім'я кандидата
  const masterCv = store.loadMasterCv();
  const candidateName = masterCv?.name ?? "the candidate";

  // Розрахувати кількість днів
  const daysWaited = Math.floor(
    (Date.now() - new Date(application.dateAdded).getTime()) / (1000 * 60 * 60 * 24)
  );

  try {
    const email = await generateFollowupEmail(application, data, candidateName, daysWaited);
    res.json({ email });
  } catch (err) {
    res.status(500).json({ error: "Generation failed" });
  }
});
```

**Примітки:**
- `store.loadApplicationData(id)` — перевірити як саме завантажується `application-data/{id}.json` в існуючому `store.ts` і реюзати той самий паттерн
- `store.loadMasterCv()` — реюз існуючої функції
- Якщо функції в store.ts мають інші назви — адаптувати відповідно

---

## FRONTEND — `client/src/` (агент: Codex)

### Задача F2.0 — `utils/dates.ts` (основа для всього Ф2)

**Новий файл:** `client/src/utils/dates.ts`

```typescript
import type { Application } from "../types";

export function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function needsFollowUp(app: Application): boolean {
  return app.status === "Applied" && daysSince(app.dateAdded) >= 7;
}
```

---

### Задача F2.1 — Risk Badge в Pipeline

**Файл:** `client/src/components/Pipeline.tsx`

**Зміни в типі Application** (`client/src/types.ts`):
```typescript
// Додати в Application interface:
redFlagsCount?: number;   // optional — backward compat для старих записів
```

**В Pipeline.tsx**, в рядку таблиці (рядки ~168-245), знайти колонку з `fitScore` (рядок ~190):
```tsx
// БУЛО:
<td className="mono fit">{a.fitScore}</td>

// СТАЛО:
<td className="mono fit">
  {a.fitScore}
  {(a.redFlagsCount ?? 0) > 0 && (
    <span
      className="risk-badge"
      title={`${a.redFlagsCount} red flag${a.redFlagsCount === 1 ? "" : "s"} — check Interview Prep tab`}
    >
      ⚠ {a.redFlagsCount}
    </span>
  )}
</td>
```

**CSS** (в існуючому CSS файлі або inline Tailwind):
- `risk-badge`: маленький badge, amber/orange колір, font-size 0.7rem, margin-left 4px
- Якщо Tailwind: `className="ml-1 text-xs text-amber-600 font-medium"`

---

### Задача F2.2 — Follow-up Clock Badge в Pipeline

**Файл:** `client/src/components/Pipeline.tsx`

Імпортувати `needsFollowUp`, `daysSince` з `utils/dates.ts`.

В колонці Status (рядки ~191-203), поруч з dropdown або після нього:
```tsx
{needsFollowUp(a) && (
  <span
    className="followup-badge"
    title={`Applied ${daysSince(a.dateAdded)} days ago — consider sending a follow-up`}
  >
    ⏱ {daysSince(a.dateAdded)}d
  </span>
)}
```

**CSS:** мутований сірий або синій колір, щоб не конкурував з risk badge.

---

### Задача F2.3 — Follow-up метрика в PipelineStats

**Файл:** `client/src/components/PipelineStats.tsx`

Імпортувати `needsFollowUp`, `daysSince`.

Додати нові розрахунки після існуючих (рядки ~7-36):
```tsx
const followUpCount = applications.filter(needsFollowUp).length;
const responded = applications.filter((a) =>
  ["Screening", "Interview", "Take-home", "Offer", "Rejected"].includes(a.status)
).length;
const appliedTotal = applications.filter((a) =>
  ["Applied", "Screening", "Interview", "Take-home", "Offer", "Rejected"].includes(a.status)
).length;
const responseRate = appliedTotal > 0 ? Math.round((responded / appliedTotal) * 100) : null;
```

Додати нові чіпи в UI після існуючих:
- **"Follow-up"** — `followUpCount` (колір: amber якщо > 0)
- **"Response rate"** — `{responseRate ?? "—"}%` (тільки якщо `appliedTotal >= 3`)

---

### Задача F2.4 — Follow-up таб в ApplicationDetailPanel

**Файл:** `client/src/components/ApplicationDetailPanel.tsx`

**Контекст:**
- Зараз 3 таби: `"overview"` / `"cv"` / `"prep"` (рядки ~203-211)
- Потрібно додати 4-й таб `"followup"` → "Follow-up"
- Таб видимий завжди (не тільки при Applied) — юзер може згенерувати email і для пізніших стадій

**Зміни:**

1. Додати таб `"followup"` в tab navigation (рядки ~203-211):
```tsx
<button
  className={`tab-btn ${activeSection === "followup" ? "active" : ""}`}
  onClick={() => setActiveSection("followup")}
>
  Follow-up
</button>
```

2. Додати секцію вмісту (після існуючих секцій, рядки ~224-262):
```tsx
{activeSection === "followup" && (
  <FollowUpSection application={application} daysWaited={daysSince(application.dateAdded)} />
)}
```

3. Новий inline або окремий компонент `FollowUpSection`:

```tsx
function FollowUpSection({ application, daysWaited }: {
  application: Application;
  daysWaited: number;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.draftFollowupEmail(application.id);
      setEmail(res.email);
    } catch {
      setError("Generation failed — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="followup-section">
      {daysWaited < 5 && (
        <p className="hint">Usually best to follow up after 7 days. Applied {daysWaited}d ago.</p>
      )}
      {!email && (
        <button className="btn btn-secondary" onClick={draft} disabled={loading}>
          {loading ? "Drafting…" : "Draft follow-up email with AI"}
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {email && (
        <>
          <textarea
            className="email-textarea"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            rows={8}
          />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigator.clipboard.writeText(email)}
          >
            Copy to clipboard
          </button>
          <button className="btn btn-ghost btn-sm" onClick={draft}>
            Regenerate
          </button>
        </>
      )}
    </div>
  );
}
```

4. В `client/src/api.ts` додати:
```typescript
async draftFollowupEmail(id: string): Promise<{ email: string }> {
  const res = await fetch(`${BASE}/api/applications/${id}/draft-followup`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("draft-followup failed");
  return res.json();
}
```

---

### Задача F2.5 — "Quick Analyze" mode в App.tsx

**Файл:** `client/src/App.tsx`

**Мета:** юзер вставляє job text → натискає "Quick Analyze" → бачить AnalysisCard (вимоги, red flags, keywords) БЕЗ tailoring і БЕЗ збереження в pipeline.

**Зміни:**

1. Додати стан (поруч рядок 96-116):
```typescript
const [analyzeOnlyDone, setAnalyzeOnlyDone] = useState(false);
```

2. Нова функція `runAnalyzeOnly()` (поруч з `runTailor()`):
```typescript
async function runAnalyzeOnly() {
  if (!jobText.trim() || jobText.trim().length < 30) return;
  setStage("analyzing");
  setError(null);
  setAnalyzeOnlyDone(false);
  try {
    const { analysis } = await api.analyzeJob(jobText);
    setCachedAnalysis(analysis);
    setAnalyzeOnlyDone(true);
  } catch (e) {
    setError("Analysis failed");
  } finally {
    setStage(null);
  }
}
```

3. Кнопка (рядки ~400-406, поруч з "Tailor for this role"):
```tsx
<button
  className="btn btn-ghost btn-block"
  onClick={runAnalyzeOnly}
  disabled={isRunning || jobText.trim().length < 30}
>
  {stage === "analyzing" && !analyzeOnlyDone ? "Analyzing…" : "Quick Analyze"}
</button>
```

4. Після `cachedAnalysis` + `analyzeOnlyDone`: під `<AnalysisCard>` показати CTA:
```tsx
{cachedAnalysis && analyzeOnlyDone && !result && (
  <div className="analyze-only-cta">
    <p>Looks interesting? Tailor your CV for this role.</p>
    <button className="btn btn-primary" onClick={runTailor}>
      Tailor CV →
    </button>
  </div>
)}
```
Цей `runTailor` використає вже завантажений `cachedAnalysis` → пропустить re-analyze.

---

## HANDOFF — що Backend передає Frontend

| Що | Endpoint | Response |
|----|----------|---------|
| Follow-up email | `POST /api/applications/:id/draft-followup` | `{ email: string }` |
| redFlagsCount | Вже в `Application` object при `GET /api/applications` | `application.redFlagsCount: number` |

**Новий тип в `client/src/types.ts`:**
```typescript
// В Application interface — додати:
redFlagsCount?: number;
```

---

## VERIFICATION

```bash
npm run dev
```

**Чеклист:**

1. **Risk Badge:**
   - Зробити новий tailor для вакансії з red flags
   - В pipeline таблиці: поруч з fit score видно `⚠ 2` (або інше число)
   - Старі заявки: без badge (graceful fallback)

2. **Follow-up Clock:**
   - В `server/data/applications.json` вручну змінити `dateAdded` однієї `Applied` заявки на 10 днів назад
   - Refresh → в pipeline рядку видно `⏱ 10d`
   - PipelineStats показує "Follow-up: 1"

3. **Follow-up Email:**
   - Відкрити detail panel заявки
   - Таб "Follow-up" → кнопка "Draft with AI"
   - Email генерується (10-15 секунд)
   - Кнопка "Copy to clipboard" працює
   - Textarea editable

4. **Quick Analyze:**
   - Вставити текст вакансії → "Quick Analyze"
   - AnalysisCard з'являється, pipeline НЕ отримує новий рядок
   - CTA "Tailor CV →" → запускає tailor БЕЗ повторного analyze (перевірити Network tab)

5. **Response Rate в Stats:**
   - Pipeline stats показує новий чіп "Response rate: X%"

6. **TypeScript:**
   ```bash
   npm run typecheck   # 0 помилок
   ```
