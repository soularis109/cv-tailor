# Фаза 1 — Friction Kill

> **Мета:** усунути найбільші точки тертя в core workflow.
> **Таймлайн:** тиждень 1-2
> **Агенти:** Claude → `server/src/`, Codex → `client/src/`

---

## КОНТЕКСТ

Юзер вже хоче використовувати продукт — але ми перешкоджаємо:
1. Треба вручну копіювати весь текст вакансії (найбільше тертя)
2. Refresh сторінки = вся чернетка зникає
3. Після результату не можна переробити CV з іншими інструкціями без повторного AI аналізу (платний)

---

## BACKEND — `server/src/` (агент: Claude)

### Задача B1.1 — `POST /api/fetch-job`

**Файл:** `server/src/index.ts`

**Розмістити:** після останнього існуючого route, перед `app.listen()`

**Реалізація:**
```typescript
app.post("/api/fetch-job", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "Invalid URL" });
  }
  try {
    // Jina Reader — безкоштовний, без ключів, повертає чистий Markdown
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Jina returned ${response.status}`);
    let text = await response.text();
    // Обмеження: не більше 20 000 символів (щоб не перевантажити AI prompt)
    if (text.length > 20_000) text = text.slice(0, 20_000);
    res.json({ text });
  } catch (err) {
    res.status(502).json({ error: "Could not fetch URL" });
  }
});
```

**Примітки:**
- `fetch` доступний нативно з Node 18+. Перевірити версію: `node -v`. Якщо < 18 — додати `node-fetch` в `server/package.json`.
- `AbortSignal.timeout(15_000)` — 15 секунд таймаут
- Jina Reader URL формат: `https://r.jina.ai/` + encoded URL
- Jina Reader не потребує ключів, rate limit: 20 req/хв безкоштовно
- Fallback не потрібен — якщо Jina недоступний, повертаємо 502 і показуємо toast

**Валідація:**
- URL повинен починатися з `http` (захист від SSRF)
- Тіло відповіді обрізати до 20 000 символів

---

## FRONTEND — `client/src/` (агент: Codex)

### Задача F1.1 — `useDraftAutoSave` hook

**Новий файл:** `client/src/hooks/useDraftAutoSave.ts`

**Призначення:** автоматично зберігати стан форми в localStorage і відновлювати після refresh.

**Інтерфейс hook:**
```typescript
interface DraftState {
  jobText: string;
  jobUrl: string;
  source: string;
  customInstructions: string;
  showCustom: boolean;
}

function useDraftAutoSave(): {
  draft: DraftState;
  setDraft: (updates: Partial<DraftState>) => void;
  clearDraft: () => void;
}
```

**Реалізація:**
- localStorage key: `"cv-tailor:draft"`
- Ініціалізація: `JSON.parse(localStorage.getItem("cv-tailor:draft") || "null")` з fallback до порожніх значень
- Збереження: `useEffect` що запускається при зміні `draft` з 300ms debounce (через `useRef` + `setTimeout`)
- `clearDraft()`: видаляє ключ з localStorage + скидає стан до початкових значень
- Якщо draft старший 7 днів (порівняти `savedAt` ISO timestamp): показати toast "Restored a draft from N days ago"

**Зміни в `client/src/App.tsx`:**
- Замінити `useState` ініціалізацію рядки 96-100:
  ```typescript
  // БУЛО:
  const [jobText, setJobText] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [source, setSource] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  // СТАЛО:
  const { draft, setDraft, clearDraft } = useDraftAutoSave();
  const { jobText, jobUrl, source, customInstructions, showCustom } = draft;
  // Сеттери: (val) => setDraft({ jobText: val }) тощо
  ```
- Після `setResult(data)` (рядок ~174): викликати `clearDraft()`
- Всі `setJobText(...)` → `setDraft({ jobText: ... })`

---

### Задача F1.2 — "Fetch" кнопка

**Файл:** `client/src/App.tsx` (рядки 340-345) та `client/src/api.ts`

**В `client/src/api.ts` додати:**
```typescript
async fetchJobFromUrl(url: string): Promise<string> {
  const res = await fetch(`${BASE}/api/fetch-job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error("fetch-job failed");
  const data = await res.json();
  return data.text as string;
}
```

**В `client/src/App.tsx`:**
- Додати стан: `const [fetchingUrl, setFetchingUrl] = useState(false)` (поруч рядок 97)
- Поруч з input `jobUrl` (рядки 340-345) додати кнопку:
  - Іконка ↓ або текст "Fetch"
  - `disabled={!jobUrl.trim() || fetchingUrl}`
  - При кліку: `setFetchingUrl(true)` → `api.fetchJobFromUrl(jobUrl)` → `setDraft({ jobText: text })` → toast success → `setFetchingUrl(false)`
  - При помилці: toast error "Couldn't fetch — try pasting manually" → `setFetchingUrl(false)`
- Loading state: кнопка показує spinner або "Fetching…" поки `fetchingUrl === true`

---

### Задача F1.3 — "Adjust & Re-tailor" кнопка

**Файл:** `client/src/App.tsx` (зона результатів, рядки ~434-494)

**Контекст:**
- `retryTailor()` вже існує в App.tsx (рядок ~187) — використовує `cachedAnalysis`, тільки 1 AI виклик
- Зараз показується тільки в error стані (рядок ~410-413)
- Потрібно додати його в зону успішного результату

**Реалізація:**
- Умова відображення: `result !== null && cachedAnalysis !== null && stage === null`
- Кнопка: вторинний стиль (ghost або secondary), текст `"Adjust & Re-tailor"`
- Розмістити: під fit gauge або поруч з download кнопками (в зоні результату)
- При кліку:
  1. Якщо custom instructions accordion закритий → відкрити (`setDraft({ showCustom: true })`)
  2. Плавно прокрутити до поля custom instructions (`document.getElementById("custom-instructions")?.scrollIntoView(...)`)
  3. Показати hint: "Update instructions above, then click Re-tailor"
  4. Або одразу запустити `retryTailor()` — на розсуд Codex (UX рішення)
- Label кнопки при `stage === "tailoring"`: показати `"Re-tailoring…"` (disabled)

---

## HANDOFF — що Backend передає Frontend

| Що | Endpoint | Response shape |
|----|----------|---------------|
| Job text з URL | `POST /api/fetch-job` | `{ text: string }` |

**Немає нових типів** — існуючий api.ts pattern достатній.

---

## VERIFICATION

```bash
npm run dev   # запустити client + server
```

**Чеклист:**

1. **URL Auto-fetch:**
   - Вставити URL вакансії з djinni.co або work.ua в поле "Job URL"
   - Натиснути "Fetch" → textarea "Job description" заповнюється текстом
   - Перевірити Network tab: `POST /api/fetch-job` → 200
   - Вставити невалідний URL → toast error

2. **Draft Auto-Save:**
   - Вписати текст вакансії в textarea
   - Refresh сторінки
   - Textarea залишається заповненою
   - Після успішного tailor → refresh → textarea порожня (clearDraft спрацював)

3. **Re-tailor:**
   - Запустити повний tailor → дочекатись результату
   - Змінити custom instructions
   - Натиснути "Adjust & Re-tailor"
   - Перевірити Network tab: тільки `POST /api/tailor`, НЕ `POST /api/analyze`
   - Результат оновився

4. **TypeScript:**
   ```bash
   npm run typecheck   # 0 помилок
   ```
