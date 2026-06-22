# Архітектурний Курс — Модулі 1 і 2

Практичне навчання на реальному коді cv-tailor.
Кожна тема: теорія → поганий приклад з цього проєкту → хороший → ДЗ з шаблоном.

## Навчальний маршрут

```
Модуль 1 — Фундамент (починай тут)
│
├── 1.1 SOLID у React          ← найважливіший блок
│     S — Single Responsibility
│     O — Open/Closed
│     L — Liskov Substitution
│     I — Interface Segregation
│     D — Dependency Inversion
│
├── 1.2 MVC / MVP / MVVM
│     Архітектурні шари
│     Ролі: Model, View, Controller/VM
│     Як cv-tailor виглядає через цю лінзу
│
└── 1.3 DI, IoC, Composition Root
      Dependency Injection через props і Context
      Composition Root у main.tsx

Модуль 2 — Архітектура React від хаосу до production
│
├── 2.1 Архітектурний скелет
│     Шари: Service / Model / ViewModel / View
│     Цільова структура папок cv-tailor
│     Contract-first API
│
├── 2.2 Стейт-менеджер і архітектура
│     Типи стану (UI / Local / App / Server)
│     Zustand: правильне і неправильне використання
│     Селектори і оптимізація ре-рендерів
│
├── 2.3 Масштабування
│     FSD (Feature Sliced Design)
│     Bounded Context: три домени cv-tailor
│     Event Emitter для cross-module комунікації
│
├── 2.4 Одна фіча — чотири реалізації
│     Рівні «правильності» (MVP → ui-kit)
│     Render prop і slot патерни
│
├── 2.5 Глибока теорія State Management
│     Типи стану: класифікація
│     Проблеми React-екосистеми
│     React Query vs useState+useEffect
│
├── 2.6 Production-фічі
│     Optimistic UI з rollback
│     Fail Fast і Error Boundaries
│     Компонент Can (ролева модель)
│     Facade для cross-domain операцій
│
├── 2.7 Архітектура без IoC-контейнера
│     Barrel файли (публічне API модуля)
│     Dependency Scopes
│     Функції-фабрики замість класів
│
├── 2.8 Форми та аутентифікація
│     React Hook Form + Zod
│     Розділення логіки форми і UI
│     JWT Auth через Service Layer
│
└── 2.9 Канбан, SSoT, Undo/Redo
      Page-first проектування
      Single Source of Truth
      Undo/Redo через Event Sourcing
      Local-first архітектура
```

## Як працювати з матеріалом

1. Читай теорію до першого прикладу
2. Відкрий реальний файл у проєкті — переконайся що бачиш проблему своїми очима
3. Прочитай пояснення
4. Виконай ДЗ самостійно (не підглядай у рішення)
5. Commit свого рішення — це твоя точка прогресу

## Файли проєкту, з якими будеш працювати

| Файл | Рядки | Що вивчаємо |
|------|-------|-------------|
| `client/src/App.tsx` | 709 | SRP, MVC |
| `client/src/components/ApplicationDetailPanel.tsx` | 486 | OCP, DIP |
| `client/src/components/Pipeline.tsx` | 270 | ISP |
| `client/src/api.ts` | 218 | DIP, Composition Root |
| `client/src/main.tsx` | 10 | Composition Root |

---

**Модуль 1:**
[1.1 SOLID →](./module-1/1.1-solid.md) |
[1.2 MVC / MVP / MVVM →](./module-1/1.2-mvc-mvvm.md) |
[1.3 DI, IoC, Composition Root →](./module-1/1.3-di-composition-root.md)

**Модуль 2:**
[2.1 Скелет →](./module-2/2.1-architectural-skeleton.md) |
[2.2 Стейт-менеджер →](./module-2/2.2-state-manager.md) |
[2.3 Масштабування →](./module-2/2.3-scaling.md) |
[2.4 Чотири реалізації →](./module-2/2.4-one-feature-four-implementations.md) |
[2.5 Теорія State →](./module-2/2.5-state-management-theory.md) |
[2.6 Production →](./module-2/2.6-production-features.md) |
[2.7 Без IoC →](./module-2/2.7-architecture-without-ioc.md) |
[2.8 Форми →](./module-2/2.8-forms-and-auth.md) |
[2.9 Канбан →](./module-2/2.9-kanban-and-advanced.md)
