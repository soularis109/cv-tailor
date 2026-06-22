# Фаза 3 — Depth

> **Мета:** диференціація через глибину AI і розширений CV workflow.
> **Таймлайн:** місяць 2
> **Залежність:** Фази 1 і 2 завершені (або незалежно — всі задачі Ф3 ізольовані)
> **Агенти:** Claude → `server/src/`, Codex → `client/src/`

---

## КОНТЕКСТ

Після Фаз 1-2 продукт вирішує тертя і активно допомагає. Фаза 3 — диференціація:
- **Cover letter**: завершує весь job application workflow в одному місці
- **Company research brief**: юзер іде на інтерв'ю підготовленим
- **Multi-version CV**: точніший tailor для різних job tracks
- **AI Mock Interview**: великий differentiator від конкурентів — ніхто не робить це добре

---

## BACKEND — `server/src/` (агент: Claude)

### Задача B3.1 — Cover Letter Generation

**`server/src/prompts.ts` — новий системний промпт:**
```typescript
export const COVER_LETTER_SYSTEM = `You are a senior career coach writing a cover letter for a job applicant.

You will receive:
- Company name and role title
- The candidate's tailored CV headline and summary
- Must-have requirements from the job analysis
- 3-5 strongest coverage areas from the tailored CV
- The candidate's name and contact info

Write a professional cover letter with:
1. Opening: genuine interest in the company/role (2 sentences)
2. Body paragraph 1: strongest 2-3 relevant achievements/skills (3-4 sentences)
3. Body paragraph 2: why this role/company specifically (2-3 sentences)
4. Closing: call to action, signature

Rules:
- Plain text only (no markdown formatting within letter)
- 250-350 words total
- No fabricated metrics or achievements not provided
- Professional but not stiff — match the seniority level
- Start with "Dear Hiring Team," if no contact name provided`;
```

**`server/src/pipeline.ts` — нова функція:**
```typescript
export async function generateCoverLetter(
  masterCv: { name: string; email?: string; phone?: string },
  application: { company: string; role: string },
  analysis: { must_have: string[]; seniority: string },
  tailored: { headline: string; summary: string; coverage: Array<{ requirement: string; status: string }> }
): Promise<string> {
  const strengths = tailored.coverage
    .filter((c) => c.status === "strong")
    .slice(0, 5)
    .map((c) => c.requirement)
    .join("\n- ");

  const userMessage = `
Name: ${masterCv.name}
Email: ${masterCv.email ?? ""}
Company: ${application.company}
Role: ${application.role}
Seniority: ${analysis.seniority}
My headline: ${tailored.headline}
My summary: ${tailored.summary}
Key requirements I strongly match:
- ${strengths}
Top must-have requirements for the role:
- ${analysis.must_have.slice(0, 5).join("\n- ")}
  `.trim();

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: COVER_LETTER_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text.trim();
}
```

**`server/src/index.ts` — новий endpoint:**
```typescript
app.post("/api/cover-letter", async (req, res) => {
  const { applicationId } = req.body as { applicationId?: string };
  if (!applicationId) return res.status(400).json({ error: "applicationId required" });

  const apps = store.loadApplications();
  const application = apps.find((a) => a.id === applicationId);
  if (!application) return res.status(404).json({ error: "Not found" });

  const data = store.loadApplicationData(applicationId);
  if (!data) return res.status(404).json({ error: "Application data not found" });

  const masterCv = store.loadMasterCv();
  if (!masterCv) return res.status(400).json({ error: "Master CV not set" });

  try {
    const letter = await generateCoverLetter(masterCv, application, data.analysis, data.tailored);
    res.json({ letter });
  } catch (err) {
    res.status(500).json({ error: "Generation failed" });
  }
});
```

---

### Задача B3.2 — Company Research Brief

**Логіка:** якщо юзер надав `jobUrl` → після `/api/analyze` автоматично генеруємо brief про компанію.

**`server/src/prompts.ts` — новий prompt:**
```typescript
export const COMPANY_BRIEF_SYSTEM = `You are a research assistant. Given a company's website content or job posting, write a concise company brief for a job candidate preparing for an interview.

Include (2-4 sentences total):
1. What the company does / their product
2. Company size/stage if apparent (startup/scale-up/enterprise)
3. One notable thing about their culture or tech stack if visible

Keep it factual and brief. If information is unclear, say so rather than guessing.`;
```

**`server/src/pipeline.ts` — нова функція:**
```typescript
export async function generateCompanyBrief(
  companyName: string,
  pageContent: string
): Promise<string> {
  const truncated = pageContent.slice(0, 8_000); // обмежити контекст
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: COMPANY_BRIEF_SYSTEM,
    messages: [{
      role: "user",
      content: `Company: ${companyName}\n\nWebsite/job page content:\n${truncated}`,
    }],
  });
  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected");
  return block.text.trim();
}
```

**`server/src/index.ts` — новий endpoint:**
```typescript
app.post("/api/company-brief", async (req, res) => {
  const { url, companyName } = req.body as { url?: string; companyName?: string };
  if (!url || !companyName) return res.status(400).json({ error: "url and companyName required" });

  try {
    // Реюз Jina Reader (вже є для /api/fetch-job з Фази 1)
    const jinaUrl = `https://r.jina.ai/${url}`;
    const pageRes = await fetch(jinaUrl, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(10_000),
    });
    const pageContent = pageRes.ok ? await pageRes.text() : "";

    const brief = await generateCompanyBrief(companyName, pageContent || `Company: ${companyName}`);
    res.json({ brief });
  } catch (err) {
    res.status(500).json({ error: "Brief generation failed" });
  }
});
```

**Примітка:** якщо Jina не доступний — передаємо тільки назву компанії, AI генерує загальний brief.

---

### Задача B3.3 — Multi-Version Master CV

**Архітектурна зміна:** замість єдиного `server/data/master-cv.json` → директорія `server/data/cv-profiles/`.

**`server/src/config.ts` — нові шляхи:**
```typescript
export const CV_PROFILES_DIR = path.join(DATA_DIR, "cv-profiles");
export const DEFAULT_PROFILE = "default";

export function cvProfilePath(name: string): string {
  // Sanitize profile name — only alphanumeric, dash, underscore
  const safe = name.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
  return path.join(CV_PROFILES_DIR, `${safe}.json`);
}
```

**`server/src/store.ts` — нові функції:**
```typescript
// Список профілів (назви файлів без .json)
export function listCvProfiles(): string[]

// Завантажити конкретний профіль
export function loadCvProfile(name: string): MasterCv | null

// Зберегти профіль
export function saveCvProfile(name: string, cv: MasterCv): void
```

**Migration:** при старті сервера (`server/src/index.ts`) перевіряти:
```typescript
// Якщо старий master-cv.json існує і cv-profiles/ порожня → автоміграція
if (fs.existsSync(MASTER_CV_PATH) && !fs.existsSync(CV_PROFILES_DIR)) {
  fs.mkdirSync(CV_PROFILES_DIR, { recursive: true });
  fs.copyFileSync(MASTER_CV_PATH, cvProfilePath("default"));
}
```

**`server/src/index.ts` — нові endpoints:**
```
GET  /api/master-cv/profiles           → { profiles: string[] }
POST /api/master-cv/profiles           → { name: string, cv: MasterCv } → 201
GET  /api/master-cv/profiles/:name     → MasterCv
PUT  /api/master-cv/profiles/:name     → update profile
DELETE /api/master-cv/profiles/:name   → delete (не можна видалити "default")
```

Існуючі `GET /api/master-cv` та `PUT /api/master-cv` залишаються і працюють з профілем `"default"` (backward compat).

**`POST /api/tailor` — приймає опційний `cvProfile` параметр:**
```typescript
const { jobText, jobUrl, source, customInstructions, cvProfile = "default" } = req.body;
const masterCv = store.loadCvProfile(cvProfile);
```

---

### Задача B3.4 — AI Mock Interview

**`server/src/prompts.ts`:**
```typescript
export const MOCK_INTERVIEW_SYSTEM = `You are a technical interviewer conducting a mock interview for a software engineering position.

You have been given the job requirements and the candidate's tailored CV.

Conduct the interview as follows:
- Ask ONE question at a time
- After the candidate responds, briefly evaluate (1-2 sentences), then ask the next question
- Focus on: technical skills, past experience, problem-solving, gaps from the coverage map
- Start with a behavioral question, then go technical
- If the candidate gives a weak answer, gently probe deeper
- After 5-6 questions, give a brief summary of performance

Tone: professional but encouraging. This is practice, not a real interview.`;
```

**`server/src/index.ts` — stateful conversation endpoint:**
```typescript
// Conversation history stored in memory (simple Map, per interview session)
const interviewSessions = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();

app.post("/api/applications/:id/interview", async (req, res) => {
  const { id } = req.params;
  const { message, reset } = req.body as { message?: string; reset?: boolean };

  if (reset || !interviewSessions.has(id)) {
    const data = store.loadApplicationData(id);
    if (!data) return res.status(404).json({ error: "Not found" });

    const context = buildInterviewContext(data);
    interviewSessions.set(id, []);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: MOCK_INTERVIEW_SYSTEM + "\n\n" + context,
      messages: [{ role: "user", content: "Start the interview." }],
    });
    const reply = (response.content[0] as { text: string }).text;
    interviewSessions.get(id)!.push(
      { role: "user", content: "Start the interview." },
      { role: "assistant", content: reply }
    );
    return res.json({ reply, questionNumber: 1 });
  }

  const history = interviewSessions.get(id)!;
  history.push({ role: "user", content: message! });

  const data = store.loadApplicationData(id);
  const context = data ? buildInterviewContext(data) : "";

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: MOCK_INTERVIEW_SYSTEM + "\n\n" + context,
    messages: history,
  });
  const reply = (response.content[0] as { text: string }).text;
  history.push({ role: "assistant", content: reply });

  res.json({ reply, questionNumber: Math.ceil(history.length / 2) });
});

function buildInterviewContext(data: ApplicationData): string {
  const gaps = data.tailored.coverage.filter((c) => c.status === "missing").map((c) => c.requirement);
  const partials = data.tailored.coverage.filter((c) => c.status === "partial").map((c) => c.requirement);
  return `
Job role: ${data.analysis.role_title} (${data.analysis.seniority})
Key responsibilities: ${data.analysis.responsibilities.slice(0, 5).join("; ")}
Candidate headline: ${data.tailored.headline}
Coverage gaps (missing): ${gaps.join("; ") || "none"}
Coverage partials: ${partials.join("; ") || "none"}
Red flags to probe: ${data.analysis.red_flags?.join("; ") || "none"}
  `.trim();
}
```

**Примітка:** `interviewSessions` — in-memory Map. Сесія живе поки сервер працює. Після рестарту — нова сесія. Для MVP це достатньо.

---

## FRONTEND — `client/src/` (агент: Codex)

### Задача F3.1 — Cover Letter Modal

**Новий файл:** `client/src/components/CoverLetterModal.tsx`

```tsx
// Props:
interface Props {
  applicationId: string;
  isOpen: boolean;
  onClose: () => void;
}

// Стан всередині:
// - letter: string (generated text)
// - loading: boolean
// - error: string | null

// Layout:
// - Modal overlay
// - Заголовок "Cover Letter"
// - Кнопка "Generate with AI" (якщо letter порожній)
// - Textarea з letter (editable, rows=15)
// - Footer: "Copy" button + "Download .txt" button + "Close"
```

**В `client/src/api.ts`:**
```typescript
async generateCoverLetter(applicationId: string): Promise<{ letter: string }> {
  const res = await fetch(`${BASE}/api/cover-letter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicationId }),
  });
  if (!res.ok) throw new Error("cover-letter failed");
  return res.json();
}
```

**Точки входу в UI:**
1. В `client/src/App.tsx` — поруч з "Download DOCX/PDF" кнопками в result zone: кнопка "Cover Letter"
2. В `client/src/components/ApplicationDetailPanel.tsx` — в таб "cv": додати кнопку "Generate Cover Letter"

---

### Задача F3.2 — Company Research Brief Card

**Файл:** `client/src/App.tsx` (зона результатів після AnalysisCard)

**В `client/src/api.ts`:**
```typescript
async getCompanyBrief(url: string, companyName: string): Promise<{ brief: string }> {
  const res = await fetch(`${BASE}/api/company-brief`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, companyName }),
  });
  if (!res.ok) throw new Error("company-brief failed");
  return res.json();
}
```

**Логіка в App.tsx:**
- Після успішного tailor (якщо `jobUrl` та `result.application.company` є) → автоматично запустити `api.getCompanyBrief(jobUrl, company)`
- Зберегти в стан `companyBrief: string | null`
- Показати як невелику карточку: "About [Company]" + текст brief
- Розмістити між AnalysisCard і основним результатом

---

### Задача F3.3 — CV Profile Selector

**Файл:** `client/src/components/MasterCvDrawer.tsx` та `client/src/App.tsx`

**Новий стан в App.tsx:**
```typescript
const [cvProfiles, setCvProfiles] = useState<string[]>([]);
const [activeProfile, setActiveProfile] = useState("default");
```

**В `client/src/api.ts`:**
```typescript
async getCvProfiles(): Promise<string[]>
async createCvProfile(name: string, cv: MasterCv): Promise<void>
async deleteCvProfile(name: string): Promise<void>
// Існуючі get/put master-cv → додати profile param:
async getMasterCv(profile?: string): Promise<MasterCv>
async saveMasterCv(cv: MasterCv, profile?: string): Promise<void>
```

**UI в header (поруч з кнопкою "Master CV"):**
```tsx
<select
  value={activeProfile}
  onChange={(e) => setActiveProfile(e.target.value)}
  className="profile-select"
>
  {cvProfiles.map((p) => <option key={p} value={p}>{p}</option>)}
</select>
```

**В MasterCvDrawer.tsx:**
- Показати поточний профіль у заголовку
- Кнопка "+ New Profile" → prompt для назви → `api.createCvProfile(name, currentCv)`
- Кнопка "Delete Profile" (disabled для "default")

**В App.tsx `runTailor()`:**
- Передавати `cvProfile: activeProfile` в `api.tailor()` body

---

### Задача F3.4 — MockInterview компонент

**Новий файл:** `client/src/components/MockInterview.tsx`

```tsx
// Props:
interface Props {
  applicationId: string;
}

// Стан:
// - messages: Array<{ role: "interviewer" | "you"; text: string }>
// - inputText: string
// - loading: boolean
// - started: boolean
// - questionNumber: number

// Layout (chat-like):
// - Кнопка "Start Mock Interview" (якщо !started)
// - Messages list (scrollable, max-height)
// - Input textarea + Send button (Enter to submit)
// - "Start Over" button

// API calls:
// POST /api/applications/:id/interview
// Body: { message?: string, reset?: boolean }
// Response: { reply: string, questionNumber: number }
```

**В `client/src/components/ApplicationDetailPanel.tsx`:**
- Додати 5-й таб `"interview"` → "Mock Interview"
- Вміст: `<MockInterview applicationId={application.id} />`

**В `client/src/api.ts`:**
```typescript
async startInterview(id: string): Promise<{ reply: string; questionNumber: number }>
async sendInterviewMessage(id: string, message: string): Promise<{ reply: string; questionNumber: number }>
```

---

## HANDOFF — що Backend передає Frontend

| Що | Endpoint | Response |
|----|----------|---------|
| Cover letter text | `POST /api/cover-letter` | `{ letter: string }` |
| Company brief | `POST /api/company-brief` | `{ brief: string }` |
| CV profiles list | `GET /api/master-cv/profiles` | `{ profiles: string[] }` |
| Interview reply | `POST /api/applications/:id/interview` | `{ reply: string, questionNumber: number }` |

**Нові поля в `client/src/api.ts`:**
- `generateCoverLetter(applicationId)` → `{ letter }`
- `getCompanyBrief(url, companyName)` → `{ brief }`
- `getCvProfiles()` → `string[]`
- `startInterview(id)` / `sendInterviewMessage(id, msg)` → `{ reply, questionNumber }`

---

## VERIFICATION

```bash
npm run dev
```

**Чеклист:**

1. **Cover Letter:**
   - Зробити tailor → в result zone: кнопка "Cover Letter"
   - Клік → Modal відкривається → "Generate with AI" → лист генерується (15-20 сек)
   - Textarea editable, "Copy" копіює в буфер, "Download .txt" завантажує файл

2. **Company Brief:**
   - Tailor вакансії з jobUrl → після результату: карточка "About [Company]" з 2-3 реченнями
   - Якщо jobUrl не вказано — карточки нема

3. **Multi-CV:**
   - В header: dropdown "default" + кнопка "+ New Profile"
   - Створити профіль "fullstack" → вибрати → відкрити Master CV drawer → зміни зберігаються в "fullstack"
   - Запустити tailor з профілем "fullstack" → Profile selector відповідає

4. **Mock Interview:**
   - Відкрити detail panel → таб "Mock Interview"
   - "Start Mock Interview" → AI ставить перше питання
   - Написати відповідь → Enter → AI відповідає і ставить наступне питання
   - "Start Over" → починає з початку

5. **TypeScript:**
   ```bash
   npm run typecheck   # 0 помилок
   ```
