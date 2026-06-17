# CV Tailor — Agent Registry

Повний реєстр AI агентів цього проекту. Актуальний для Claude Code, Codex CLI, Gemini CLI.

## Агенти та їх ролі

### Claude Code (основний)
**Scope:** `server/` — бекенд, Express API, AI промпти, Zod схеми, document generation, архітектурні рішення.
**Інструмент:** Claude Code CLI (`claude`)
**Запуск:** Основний інструмент за замовчуванням.

---

### Codex
**Scope:** `client/` — React компоненти, хуки, Zustand стори, Tailwind стилізація, performance оптимізація.
**Інструмент:** OpenAI Codex CLI
**Запуск як субагент (з Claude Code):** Dispatch `codex` subagent
**Запуск напряму:**
```bash
cd client && codex "task description"
```

---

### Gemini
**Scope:** Універсальний агент — будь-яке завдання, другий погляд на архітектуру, дослідження, fallback.
**Інструмент:** Google Gemini CLI
**Запуск як субагент (з Claude Code):** Dispatch `gemini` subagent
**Запуск напряму:**
```bash
gemini "task description"
```

---

## Claude Code Субагенти (`.claude/agents/`)

| Агент | Модель | Scope | Колір |
|-------|--------|-------|-------|
| `codex` | sonnet | Codex CLI wrapper — `client/` | green |
| `gemini` | sonnet | Gemini CLI wrapper — universal | blue |
| `frontend` | sonnet | React/Vite спеціаліст (прямий Claude) | cyan |
| `reviewer` | sonnet | Read-only code audit | magenta |
| `business-analyst` | opus | Product/UX gap analysis | — |

## Таблиця вибору агента

| Задача | Агент |
|--------|-------|
| React компонент, хук, сторінка в `client/` | **codex** або **frontend** |
| CSS/Tailwind стилізація | **codex** |
| Express route, middleware в `server/` | **Claude** |
| AI prompt engineering | **Claude** |
| Zod схема | **Claude** |
| Code review перед PR | **reviewer** |
| Product/UX аудит | **business-analyst** |
| Другий погляд, дослідження, будь-що інше | **gemini** |
