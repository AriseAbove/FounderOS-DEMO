# FOUNDER OS — agent rules

Full project docs live in **CLAUDE.md** (same directory) — read it first.
This file exists so non-Claude agents (Codex, etc.) get the same house rules.

## Non-negotiables

- **Never commit or copy secrets.** Credentials live in `.env.local`
  (gitignored); `lib/creds.ts` resolves them process.env-first with a live
  `.env.local` overlay. Never copy keys out of any external credential store
  into this repo.
- **Never push to any remote or touch `main` without Sean's explicit yes.**
  Commit locally, small checkpoints, often.
- **Don't kill another session's dev server** if one is already running on
  4100. If your edit crashes the dev server's hot reload, fix it fast: a
  crash loop corrupts `.next` and breaks every session's page chunks (kill
  the port, `rm -rf .next`, restart).
- `/org` markup is frozen — do not restructure it.
- No em/en dashes in anything written for Sean.

## How to work

- TDD: failing test first (`tests/`, one file per module,
  `FOUNDER_OS_DB=:memory:`), then implement. `npm test` and
  `npm run typecheck` must be green before claiming done.
- Everything reads through the repo layer: `lib/db.ts` repos + `lib/schemas.ts`
  Zod validation + `lib/seed.ts` seeds. Never query SQLite from a page/route.
- Theme via CSS vars on `data-theme` (five themes in `app/globals.css`);
  Tailwind `os.*` tokens map to them. Keep `tailwind.config.ts` and
  `globals.css` in sync.
- Commands: `npm run dev` (port 4100) · `npm test` · `npm run typecheck` ·
  `npm run seed` · `npm run brain:docs`.
- Production DB lives on a mounted Railway volume, not the container's
  ephemeral filesystem — see CLAUDE.md's Conventions section before touching
  anything that assumes the SQLite file (or a stored OAuth token) survives a
  redeploy.

## Multi-agent etiquette

Multiple agent sessions (Claude, Codex) may work this repo concurrently:
- `git log --oneline` to see where others are; commit small and often.
- Coordinate by surface: don't edit a page/component another session has
  uncommitted changes in (`git status` shows them).
- The Playwright browser is shared across sessions — expect interference.
- Leave handoff notes in `docs/` if you stop mid-feature.
