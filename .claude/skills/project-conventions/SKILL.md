---
name: project-conventions
description: Where each Carrot Wall convention is defined and what enforces it. Use when creating or modifying source files, tests, or migrations.
---

# Conventions — where they live

**This file states no rules of its own.** It used to restate them, drifted, and ended up
asserting the opposite of what the code does ("validate with Bean Validation annotations" —
the codebase deliberately does not). A rule restated in two places has no traceability and
nothing forces the copy to move when the code moves.

`CLAUDE.md` at the repo root is the single authoritative source and is already loaded in
every session. Read it there. This file exists only to answer "what actually stops me getting
this wrong?" — the enforcement map below.

## What is enforced, and by what

| Convention | Defined in | Enforced by |
|---|---|---|
| Existing Flyway migrations are immutable | CLAUDE.md | `PreToolUse` hook, `.claude/settings.json` |
| No Bean Validation annotations in `apps/api` | CLAUDE.md | `PreToolUse` hook, `.claude/hooks/block_bean_validation.py` (tests: `*.test.sh`) |
| Every `Post` mutation moves `updated_at` | CLAUDE.md | `WallResourceTest` — "a pin-only change must move updatedAt", "an upvote-only change must move updatedAt" |
| Hidden posts never reach a public response | CLAUDE.md | `WallResourceTest`, plus the single-endpoint design of `GET /api/wall` |
| Admin endpoints 401 without a session | CLAUDE.md | `AdminResourceTest`, and `@AdminOnly` + `AdminAuthFilter` |
| Messages render as text, never HTML | CLAUDE.md | `post-card.spec.ts`, e2e; **nothing blocks a new `[innerHTML]`** |
| TS/HTML/SCSS formatting | `.prettierrc` | `PostToolUse` hook (auto-formats on write) |
| Angular route also registered in `SpaRoutes.java` | CLAUDE.md | **nothing — production-only 404 if missed** |

The bolded gaps are the rules that currently rely on someone remembering them. If one of them
bites, add a check rather than adding a sentence.

## Changing a convention

Change the rule, its enforcement, and `CLAUDE.md` in the same commit. A hook or test that
disagrees with `CLAUDE.md` is the bug this file was created to stop repeating.
