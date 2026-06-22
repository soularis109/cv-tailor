# Фаза 4 — Platform

> **Мета:** SaaS readiness — перехід від локального tool до hosted multi-user продукту.
> **Таймлайн:** місяць 3+
> **Залежність:** Фази 1-3 завершені. Фаза 4 — найбільша архітектурна зміна.
> **Агенти:** Claude → `server/src/`, Codex → `client/src/` та `extension/`

---

## КОНТЕКСТ

Поточна архітектура — single-user, flat-file, без auth. Фаза 4 додає:
1. **JWT auth** — захищає всі endpoints, ізолює дані юзерів
2. **Per-user storage** — `server/data/users/{userId}/` замість глобальних файлів
3. **Share links** — read-only view для ментора/коуча
4. **Chrome Extension** — "Tailor" кнопка прямо на job board (growth механізм)

**Важливо:** це breaking change для data storage. Потрібна migration стратегія.

---

## BACKEND — `server/src/` (агент: Claude)

### Задача B4.1 — JWT Auth Middleware

**Новий файл:** `server/src/auth.ts`

```typescript
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";

export interface AuthPayload {
  userId: string;
  email: string;
}

// Middleware — прикріплює userId до req
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (req as any).userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// Генерація токена (для login/register)
export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}
```

**Залежності:** додати в `server/package.json`:
```json
"jsonwebtoken": "^9.0.0",
"@types/jsonwebtoken": "^9.0.0"
```

**`server/src/index.ts` — auth endpoints:**
```typescript
// В dev режимі — simple login без пароля (для тестування)
app.post("/api/auth/login", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: "email required" });

  // Спрощена реалізація: userId = hash від email
  const userId = Buffer.from(email.toLowerCase()).toString("base64url").slice(0, 16);
  const token = signToken({ userId, email });
  res.json({ token, userId, email });
});

// Захистити всі /api/* routes (крім /auth і /share)
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/") || req.path.startsWith("/share/")) return next();
  requireAuth(req, res, next);
});
```

**Для production:** замінити простий login на:
- Email magic link (nodemailer)
- або Google OAuth (passport.js)
- або GitHub OAuth

---

### Задача B4.2 — Per-User Storage

**`server/src/config.ts` — нова функція:**
```typescript
export const USERS_DATA_DIR = path.join(DATA_DIR, "users");

export function userDataDir(userId: string): string {
  // Sanitize: тільки base64url символи
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return path.join(USERS_DATA_DIR, safeId);
}

export function userMasterCvPath(userId: string): string {
  return path.join(userDataDir(userId), "master-cv.json");
}

export function userApplicationsPath(userId: string): string {
  return path.join(userDataDir(userId), "applications.json");
}

export function userApplicationDataPath(userId: string, appId: string): string {
  return path.join(userDataDir(userId), "application-data", `${appId}.json`);
}

export function userCvProfilesDir(userId: string): string {
  return path.join(userDataDir(userId), "cv-profiles");
}
```

**`server/src/store.ts` — всі функції отримують `userId` параметр:**
```typescript
// БУЛО:
export function loadMasterCv(): MasterCv | null
export function saveMasterCv(cv: MasterCv): void
export function loadApplications(): Application[]
// ...

// СТАЛО:
export function loadMasterCv(userId: string): MasterCv | null
export function saveMasterCv(userId: string, cv: MasterCv): void
export function loadApplications(userId: string): Application[]
// ...
```

**Всі routes в `server/src/index.ts`** — взяти `userId` з `(req as any).userId` і передати в store functions.

**Migration script** `server/src/migrate.ts`:
```typescript
// Запускати один раз: переносить дані дефолтного юзера
// Викликати при старті сервера якщо USERS_DATA_DIR порожня
import * as fs from "fs";
import * as path from "path";

export function migrateToPerUserStorage(defaultUserId: string) {
  const oldMasterCv = path.join(DATA_DIR, "master-cv.json");
  const oldApplications = path.join(DATA_DIR, "applications.json");
  const oldAppData = path.join(DATA_DIR, "application-data");

  const userDir = userDataDir(defaultUserId);
  fs.mkdirSync(userDir, { recursive: true });
  fs.mkdirSync(path.join(userDir, "application-data"), { recursive: true });

  if (fs.existsSync(oldMasterCv)) {
    fs.copyFileSync(oldMasterCv, userMasterCvPath(defaultUserId));
  }
  if (fs.existsSync(oldApplications)) {
    fs.copyFileSync(oldApplications, userApplicationsPath(defaultUserId));
  }
  if (fs.existsSync(oldAppData)) {
    const files = fs.readdirSync(oldAppData);
    for (const file of files) {
      fs.copyFileSync(
        path.join(oldAppData, file),
        userApplicationDataPath(defaultUserId, path.basename(file, ".json"))
      );
    }
  }

  console.log(`Migration complete for userId: ${defaultUserId}`);
}
```

---

### Задача B4.3 — Share Links

**`server/src/index.ts` — share endpoints:**
```typescript
// In-memory store для share tokens (для MVP, для production → Redis/DB)
const shareTokens = new Map<string, { applicationId: string; userId: string; expiresAt: number }>();

// Генерація share link
app.post("/api/applications/:id/share", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { id } = req.params;
  const { expiresInDays = 7 } = req.body;

  const token = crypto.randomUUID();
  shareTokens.set(token, {
    applicationId: id,
    userId,
    expiresAt: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  });

  const shareUrl = `${process.env.CLIENT_URL ?? "http://localhost:5173"}/share/${token}`;
  res.json({ shareUrl, expiresAt: new Date(shareTokens.get(token)!.expiresAt) });
});

// Read-only view для share link (без auth)
app.get("/api/share/:token", async (req, res) => {
  const entry = shareTokens.get(req.params.token);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(404).json({ error: "Link expired or not found" });
  }

  const apps = store.loadApplications(entry.userId);
  const application = apps.find((a) => a.id === entry.applicationId);
  const data = store.loadApplicationData(entry.userId, entry.applicationId);

  if (!application || !data) return res.status(404).json({ error: "Not found" });

  // Повертаємо тільки потрібне — без внутрішніх ID
  res.json({
    application: {
      company: application.company,
      role: application.role,
      fitScore: application.fitScore,
      status: application.status,
    },
    tailored: data.tailored,
    analysis: {
      role_title: data.analysis.role_title,
      must_have: data.analysis.must_have,
      coverage: data.tailored.coverage,
    },
  });
});
```

---

## FRONTEND — `client/src/` (агент: Codex)

### Задача F4.1 — AuthProvider

**Новий файл:** `client/src/context/AuthContext.tsx`

```tsx
interface AuthContextValue {
  token: string | null;
  userId: string | null;
  email: string | null;
  login: (email: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

// localStorage key: "cv-tailor:auth"
// Зберігати: { token, userId, email }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // При mount: відновити з localStorage
  // login(): POST /api/auth/login → зберегти token
  // logout(): очистити localStorage + стан
  // Передавати token в всі api.ts запити через Authorization header
}
```

**`client/src/api.ts` — додати token до всіх запитів:**
```typescript
// Всі fetch calls додати:
headers: {
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
},
```

Найкраще: передавати `token` в api functions або зберігати в api singleton через `api.setToken(token)`.

**Login page** `client/src/pages/Login.tsx`:
```tsx
// Simple form: email input + "Continue" button
// При submit: api.login(email) → зберегти token → redirect до /
// Dev mode: будь-який email без пароля
```

**Route guard в App.tsx:**
```tsx
if (!isAuthenticated) return <Login />;
// Решта app рендериться тільки для authenticated users
```

---

### Задача F4.2 — SharedView Page

**Новий файл:** `client/src/pages/SharedView.tsx`

```tsx
// Route: /share/:token
// Mount: fetch GET /api/share/:token
// Стан: loading | expired | data

// Layout (read-only, без хедера і навігації):
// - Заголовок: "Shared Application: [role] @ [company]"
// - Fit gauge
// - Coverage map (read-only)
// - Tailored CV preview (CvPreview component — вже існує)
// - Footer: "Create your own → cv-tailor.app"

// Error states:
// - expired: "This link has expired"
// - not-found: "Link not found"
```

**В `client/src/App.tsx` або `main.tsx` — додати routing:**
```tsx
// Якщо використовується react-router-dom (перевірити чи є):
<Route path="/share/:token" element={<SharedView />} />

// Якщо немає роутера — додати простий URL-based render:
const pathname = window.location.pathname;
if (pathname.startsWith("/share/")) {
  const token = pathname.split("/share/")[1];
  return <SharedView token={token} />;
}
```

---

### Задача F4.3 — Chrome Extension

**Окремий package** `extension/` в корені монорепо (не в `client/` і не в `server/`).

**Структура:**
```
extension/
  manifest.json        (Manifest V3)
  src/
    content.js         (content script — вставляє кнопку на job board)
    background.js      (service worker — зберігає налаштування)
    popup.html         (налаштування API URL)
    popup.js
  icons/
    16.png, 48.png, 128.png
```

**`manifest.json`:**
```json
{
  "manifest_version": 3,
  "name": "CV Tailor",
  "version": "1.0.0",
  "description": "Tailor your CV for any job in one click",
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://djinni.co/*",
    "https://www.linkedin.com/jobs/*",
    "https://work.ua/*",
    "https://dou.ua/*"
  ],
  "content_scripts": [{
    "matches": [
      "https://djinni.co/jobs/*",
      "https://www.linkedin.com/jobs/*",
      "https://work.ua/vacancies/*",
      "https://dou.ua/vacancies/*"
    ],
    "js": ["src/content.js"]
  }],
  "action": {
    "default_popup": "src/popup.html"
  },
  "background": {
    "service_worker": "src/background.js"
  }
}
```

**`src/content.js` — логіка для кожного job board:**
```javascript
// Djinni, LinkedIn, work.ua, dou.ua мають різну структуру DOM
// Виявити який сайт → витягти текст вакансії через CSS selector
// Додати кнопку "🎯 Tailor with CV Tailor" поруч з "Apply" кнопкою

const SELECTORS = {
  "djinni.co": ".job-description",
  "linkedin.com": ".jobs-description-content",
  "work.ua": ".card-description",
  "dou.ua": ".b-typo",
};

const jobText = document.querySelector(SELECTORS[getSite()])?.innerText ?? "";
const jobUrl = window.location.href;

// При кліку на кнопку:
// Зберегти jobText + jobUrl в chrome.storage.session
// Відкрити нову вкладку: {apiUrl}/?from=extension
// CV Tailor app при mount: перевірити chrome.storage.session і auto-fill
```

**`client/src/App.tsx` — extension integration:**
```typescript
// При mount: перевірити URL params
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("from") === "extension") {
  // Спробувати прочитати з chrome.storage.session (якщо доступно)
  // chrome.storage.session.get(["jobText", "jobUrl"], (data) => { ... })
  // або через URL hash/params
}
```

---

## HANDOFF — що Backend передає Frontend

| Що | Endpoint | Response |
|----|----------|---------|
| Login token | `POST /api/auth/login` | `{ token, userId, email }` |
| Share link | `POST /api/applications/:id/share` | `{ shareUrl, expiresAt }` |
| Shared view data | `GET /api/share/:token` | `{ application, tailored, analysis }` |

**Нові ENV змінні:**
- `JWT_SECRET` — секрет для підпису токенів (обов'язково змінити в production)
- `CLIENT_URL` — base URL клієнта для формування share links

---

## VERIFICATION

```bash
npm run dev
```

**Чеклист:**

1. **Auth flow:**
   - Відкрити app → redirect на Login
   - Ввести email → "Continue" → в localStorage з'явився token
   - Refresh → залишився авторизованим
   - "Logout" → redirect на Login
   - Перевірити всі API calls: заголовок `Authorization: Bearer ...`

2. **Per-user storage:**
   - Login як user1@test.com → зробити tailor → в `server/data/users/{userId}/applications.json` з'явився запис
   - Logout → login як user2@test.com → pipeline порожній (ізоляція)

3. **Share link:**
   - Відкрити detail panel → кнопка "Share" → генерується URL
   - Відкрити URL в інкогніто → SharedView рендериться (без login)
   - Через 7 днів (або вручну видалити з Map) → "This link has expired"

4. **Chrome Extension:**
   - Перейти в `chrome://extensions` → Developer mode → Load unpacked → вибрати `extension/`
   - Відкрити djinni.co/jobs/... → поруч з "Apply" кнопка "🎯 Tailor with CV Tailor"
   - Клік → відкривається CV Tailor → textarea заповнена текстом вакансії

5. **Migration:**
   - Зупинити сервер → видалити `server/data/users/` якщо є
   - Запустити сервер → migration script переносить старі дані в `server/data/users/{defaultId}/`
   - Перевірити що старі дані збереглись

6. **TypeScript:**
   ```bash
   npm run typecheck   # 0 помилок в server/ і client/
   ```

---

## Примітки для Production

- `JWT_SECRET` — мінімум 256-bit random string (`openssl rand -hex 32`)
- `shareTokens` Map → замінити на Redis або database для persistence після restart
- Login без пароля (dev mode) → замінити на email magic link або OAuth
- `CLIENT_URL` → налаштувати через `.env` для production domain
- `server/data/users/` → рекомендується S3 або managed storage для scale
