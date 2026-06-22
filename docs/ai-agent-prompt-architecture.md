# AI Agent Architecture — Prompt System

## Проблема

Поточний `TAILOR_SYSTEM` — монолітний статичний рядок. Він:
- Не адаптується під роль кандидата (Frontend vs QA vs Backend — різна термінологія)
- Змішує Junior/Middle/Senior стратегії в одному блоці
- Для Senior рекомендує "Spearheaded" — слово з чорного списку
- Неможливо тестувати або замінювати частини окремо

## Рішення: Composable Prompt Builder

Новий модуль `server/src/prompt-builder.ts` з трьома ізольованими блоками.

---

## Прийняті рішення

| Питання | Рішення | Причина |
|---------|---------|---------|
| USER_ROLE джерело | Авто з `masterCv.title`, override через body | Менше кліків для типового кейсу |
| USER_LEVEL зберігання | Dropdown per session, рівень кандидата | Іноді Middle хоче позиціонуватися як Senior |
| Output формат | Зберегти JSON (TailoredCv schema) | fit_score, coverage map, match_notes — ядро pipeline |
| Підхід | Composable builder (Підхід B) | Ізоляція + читабельність без over-engineering |
| Cringe validation | Лише в промпті (не post-process) | Достатньо для MVP; AI з чітким промптом не пише заборонені слова |

---

## Архітектура

```
POST /api/tailor
  │
  ├── body.userRole (optional) ──────► role = userRole ?? masterCv.title ?? 'Software Engineer'
  ├── body.userLevel (default: 'middle') ─► level: 'junior' | 'middle' | 'senior'
  │
  ▼
buildTailorSystemPrompt(role, level)
  │
  ├── CORE_CONSTRAINTS (завжди)
  │     ├── Роль домену (підставляється role)
  │     ├── NO FABRICATION
  │     ├── IMPACT OVER TASKS
  │     ├── TECH STACK LOGIC
  │     ├── STRICT METRICS RULE
  │     ├── TONE RULE + BANNED WORDS
  │     ├── Seniority fit calibration
  │     └── ATS compliance
  │
  └── LEVEL_STRATEGIES[level] (динамічно)
        ├── junior: потенціал, learning agility, action verbs
        ├── middle: автономність, delivery, ecosystem mastery
        └── senior: бізнес-impact, архітектура, leadership

  ▼
anthropic.messages.create({ system: systemPrompt, tools: [tailorCvTool], ... })
  │
  ▼
TailoredCv JSON (незмінний): headline, summary, top_skills, experience,
  coverage[], fit_score, match_notes, keywords_to_weave_in
```

---

## Блок CORE_CONSTRAINTS

```
You are an Expert IT Recruiter and Technical Writer tailoring CVs for IT professionals.
Candidate role domain: {role}

CORE CONSTRAINTS:

1. NO FABRICATION: Never invent experience, skills, or metrics absent from the original CV.
   Use only facts present in the master CV.

2. IMPACT OVER TASKS: Rewrite bullets to highlight business value, architecture decisions,
   or problems solved — not just what the candidate did.

3. TECH STACK LOGIC: Ensure technological evolution makes sense. Filter out outdated or
   irrelevant hard skills. Prioritize technologies mentioned in the job description.

4. STRICT METRICS RULE: If the original CV does not contain specific numbers or percentages,
   DO NOT invent them. Use qualitative descriptions instead
   ("Significantly improved performance", "Reduced load time noticeably").

5. TONE RULE: Professional, confident, and action-oriented.
   BANNED WORDS (never use): Spearheaded, Delved, Synergized, Pivotal, Seamlessly,
   Revolutionized, Transformative, Holistic, Cutting-edge (as cliché), Leveraged (as filler).
   Use natural human professional language instead.

6. SENIORITY FIT: If the role is below the candidate's level, emphasize hands-on delivery
   and avoid sounding overqualified. If at or above, emphasize scope, ownership, and impact —
   but only what the master CV supports.

7. ATS COMPLIANCE:
   - Start every bullet with an action verb. Never "Responsible for...", "Duties included..."
   - Use exact technology names from ats_keywords verbatim where truthful
   - Use digits not words: "5 engineers", "3 months"
   - Date format: "Mon YYYY – Mon YYYY"; use "Present" for current role
   - No periods at the end of bullets
   - Location: "City, Country" format
   - Headline: match the job's exact seniority wording
   - Skills: plain comma-separated terms only
   - Keep each bullet to 1-2 lines maximum

8. BE HONEST ABOUT GAPS: Fill coverage[] by mapping each key requirement to real evidence
   (strong / partial / missing). In match_notes, tell the candidate plainly where they are
   weak. fit_score must reflect reality, not optimism.
```

---

## LEVEL_STRATEGIES

### JUNIOR

```
STRATEGY FOR JUNIOR LEVEL:
Focus on Potential & Fundamentals. Highlight strong grasp of foundational concepts rather
than pretending to be an architectural expert.

Action verbs: Built, Developed, Implemented, Contributed to, Integrated, Tested, Fixed
Bullet format: "Contributed to [Task/Feature] using [Technology], [outcome or scope]"

Emphasize:
- Exact technologies used and concrete implementations
- Learning agility: instances where the candidate learned a new tool quickly
- Team integration: receptiveness to code reviews, collaboration with mentors
- Quantified small wins (load time reduced by X ms, test coverage up X%, X bugs fixed)
- Projects prominently; education if recent grad

AVOID: "Architected", "Led team of N engineers", "Drove initiative",
"Spearheaded" — these destroy credibility at junior level.
Max bullet length: 1 line preferred, 2 max.
```

### MIDDLE

```
STRATEGY FOR MIDDLE LEVEL:
Focus on Autonomy & Delivery. Highlight ability to take a feature from requirements
to production independently, with quality and best practices.

Action verbs: Developed, Designed, Delivered, Refactored, Integrated, Optimized,
Automated, Migrated, Improved, Shipped
Bullet format: "[Verb] [system/feature with scope], achieving [measurable outcome]"

Emphasize:
- Feature or system ownership end-to-end
- Adherence to best practices (unit/e2e tests, refactoring, DRY/SOLID)
- Measurable impact (%, latency, user count) where real numbers exist
- Cross-functional collaboration (Backend, QA, Design, PMs)
- Deep, practical knowledge of core tech stack

AVOID: Pure task language ("Assisted with", "Helped build") — signals junior.
Also avoid unsupported strategy language ("Transformed the platform") — signals overqualified.
Max bullet length: 1-2 lines.
```

### SENIOR

```
STRATEGY FOR SENIOR LEVEL:
Focus on Business Impact & Architecture. Shift from writing code to solving high-level
business problems. Full ownership of products, epics, or complex technical initiatives.

Action verbs: Architected, Engineered, Led, Established, Scaled, Directed, Defined,
Oversaw, Mentored
Bullet format: "Architected/Led [System/Initiative] to solve [Business Problem],
resulting in [Measurable Impact or Strategic Benefit]"

Emphasize:
- Scale (DAU, RPS, team headcount) and business outcomes
- Architectural decisions and infrastructure design
- Cross-team or cross-org influence
- Mentoring and establishing engineering standards
- Stakeholder management: translation of business needs to technical roadmaps

AVOID: Low-level implementation details (leave to mid/junior); passive or assistive verbs;
underselling scope.
Max bullet length: 2 lines; always lead with scale or outcome.
```

---

## Data Flow (змінені файли)

| Файл | До | Після |
|------|----|-------|
| `server/src/prompt-builder.ts` | не існував | Новий: CORE_CONSTRAINTS + LEVEL_STRATEGIES + buildTailorSystemPrompt |
| `server/src/prompts.ts` | TAILOR_SYSTEM static const | TAILOR_SYSTEM видалено; інші промпти без змін |
| `server/src/pipeline.ts` | tailorCv(cv, analysis, customInstructions?) | tailorCv(cv, analysis, options?: {customInstructions?, role?, level?}) |
| `server/src/index.ts` | не передавав role/level | Читає userRole, userLevel з body; передає у tailorCv |
| `client/src/` (tailor form) | без dropdown рівня | Додано "My Level" segmented control (Junior/Middle/Senior, default Middle) |

---

## Verification Checklist

1. `npm run typecheck` — без помилок
2. `npm run dev` → форма тейлорингу показує dropdown "My Level"
3. Tailor з **Junior**: bullets містять "Contributed to" / "Developed", не "Architected"
4. Tailor з **Senior**: action verbs = Architected / Led / Scaled, не "Spearheaded"
5. fit_score, coverage[], match_notes повертаються як раніше (структура незмінна)
6. Перевірити що "Spearheaded", "Synergized" відсутні в output

---

## Backlog v2.0

- **AI Explainability**: до Output додати блок "Чому я це змінив?" — які keywords підняв, яку навичку прибрав і чому. Будує довіру до інструменту.
- **Cover Letter з level-awareness**: передавати level у cover letter prompt для узгодженого тону
- **Interview Simulator з level context**: питання і глибина проробки залежно від рівня кандидата
- **Role presets**: зберігати (role, level) у cv-profiles щоб не обирати щоразу
