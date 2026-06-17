---
name: codex-review
description: Use OpenAI Codex CLI for code review, architecture analysis, performance optimization, and alternative implementations.
---

# Codex Review Skill

When the user asks for:
- code review
- performance analysis
- architecture validation
- bundle optimization
- React optimization
- Next.js optimization
- alternative implementation ideas
- Zustand/store analysis
- TypeScript improvements
- testing improvements

Use the Codex CLI.

## Rules

- Prefer Codex for low-level code analysis.
- Use Codex for second opinions on architecture.
- Use Codex for performance bottlenecks.
- Use Codex for React rendering optimization.
- Use Codex for bundle size analysis.
- Use Codex for edge-case detection.

## Command Examples

```bash
codex "review this React component for performance issues"
```

```bash
codex "analyze this Next.js page for SSR and hydration issues"
```

```bash
codex "suggest a better Zustand store architecture"
```

```bash
codex "review this NX monorepo structure"
```

## Workflow

1. Read the relevant files.
2. Summarize the current implementation.
3. Ask Codex for analysis.
4. Return:
    - issues
    - risks
    - improvements
    - optimized examples