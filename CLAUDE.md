# ARISE OS

The Arise Above business operating system — one command center for Arise Above
Construction (AAC) and the Arise Above Apps portfolio. Runs on port **4100**.

## Commands

```bash
npm run dev        # dev server → http://localhost:4100
npm test           # vitest suite (must stay green)
npm run typecheck  # tsc --noEmit
npm run seed       # re-seed data/founder-os.db (idempotent)
npm run build && npm start
```

## Architecture: repo-layer, honest-status

The load-bearing design rule. Every page and API route reads through the
repository layer — never query SQLite directly from a page or route:

- `lib/data.ts` — `getDb()` app singleton; seeds on first touch and re-seeds
  once whenever `SEED_VERSION` (lib/seed.ts) bumps. Purge clauses in the seed
  only ever remove rows the seed itself created — real recorded data survives.
- `lib/db.ts` — `openDb()` + repos (`departments`, `agents`, `funnel`, …)
- `lib/seed.ts` — the honest baseline. NO invented data: no fake clients,
  followers, dollars, staff, or work items. If a seed entry isn't real or an
  obviously-labeled structural placeholder, it doesn't ship.
- `lib/schemas.ts` — Zod schemas validate every row on the way OUT of the DB

New data = new repo method + Zod schema + seed entry + test.

## The business lens

`lib/businesses.ts` defines the two businesses (`aac`, `apps`). The Topbar's
AAC / Apps / Combined switcher persists as a cookie (`lib/business-filter.ts`
client-safe + `lib/business-filter-server.ts` for `cookies()`); server
components read it per request. Business-scoped repo methods take an explicit
business argument.

## The funnel

AAC's real pipeline: `inquiry → follow_up → walkthrough_scheduled →
estimate_sent → negotiation → contract_signed → active_project →
complete_paid` (`lib/funnel.ts`). "Won" = contract_signed onward (`isWon`) —
won journeys never stall/decay and count toward revenue. Arise Above Apps'
funnel stages are STILL UNDEFINED — `apps` journeys reuse the AAC stages as a
clearly-flagged placeholder; do not present them as Apps truth or invent an
Apps stage model without Sean's direction. Stage hubs/rings in the two funnel
canvases derive from `FUNNEL_STAGES` (never hardcode the stage count); colors
are `--funnel-s0..s7` per theme in `app/globals.css`.

## Connectors & agents

Real integrations only — "real" means honest status reporting, nothing
pre-wired to any one machine.

- `lib/connectors/` — email.ts (4 IMAP slots), gcal.ts (ICS/CalDAV),
  quickbooks.ts (OAuth; tokens live in the DB via the `quickbooksAuth` repo,
  never in .env.local), llm.ts (Anthropic; stub for tests). Each returns an
  honest `ConnectorStatus` and goes live the moment its credentials land in
  `.env.local` (see `.env.example`).
- `lib/brain.ts` — the knowledge layer behind a provider abstraction: a local
  markdown store provider (point `BRAIN_STORE` at a folder — real grep search,
  folder overview; `lib/brain-dump.ts` captures write real files there) and a
  stub for tests. A vector provider slots in behind the same interface.
- `lib/agents/runtime.ts` + `real.ts` — the roster: conductor, comms-agent,
  gmail-worker, calendar-worker, data-agent, quickbooks-pulse. Every seeded
  agent row maps 1:1 to a `RuntimeAgent` with a real `run()` (enforced by
  seed tests). Runs persist to `agent_runs`.
- `/integrations` is the live Connections board (`GET /api/connections`).
- Credentials go in `.env.local` (gitignored). NEVER commit keys.

## Views

`/` operator console · `/comms` unified email + calendar feed · `/funnel` the
AAC pipeline (flow + radial views) · `/finances` QuickBooks + statement
uploads · `/agents` roster with Run buttons · `/org` hierarchy board with the
business lens (markup frozen — do not restructure) · `/brain` knowledge layer ·
`/roadmap` the real rebuild roadmap · `/analytics` real connector numbers ·
`/reference` reference model · `/integrations` connections board ·
`/workflows` `/tasks` `/skills` supporting views. Hidden from nav until they
apply (see `NAV_HIDDEN` in `lib/nav.ts`): `/social`, `/content`, `/personas` —
the pages still load by direct URL and render honest empty states.

## Conventions

- TDD: failing test first, then implementation. Tests live in `tests/`,
  one file per module; use `FOUNDER_OS_DB=:memory:` pattern (see `tests/db.test.ts`).
- Zod-validate anything that crosses the DB or API boundary.
- HONESTY: no invented numbers anywhere. Empty states say why they're empty
  and what connects them. A connector is "connected" only when it truly is.
- THEME: **Monolith Signal (`mono`) is the default** (`DEFAULT_THEME` in
  `lib/theme.ts`; bare `:root` in `app/globals.css` carries the mono tokens).
  Tokens live in `tailwind.config.ts` (`os.*`) AND as raw CSS vars in
  `app/globals.css` — keep the two in sync. JetBrains Mono everywhere; square
  corners; hairline borders; color = status only in mono.
- Env vars: `FOUNDER_OS_DB`, `BRAIN_PROVIDER`, `BRAIN_STORE`, `LLM_PROVIDER`,
  plus connector creds in `.env.local`. (`FOUNDER_OS_DB` and the
  `founder-os.db` filename keep their original names for deploy compat.)
- Heavy interaction-driven visualizations load via `next/dynamic`
  (`ssr: false`) behind dimension-matched skeletons (contract in
  `tests/code-splitting.test.ts`).
- Hosting: Railway (see `README.md`). The SQLite store needs a mounted volume
  in production — an ephemeral filesystem silently drops the DB (including
  stored OAuth tokens) on every redeploy. Point `FOUNDER_OS_DB` at a path
  inside the mounted volume.

## Multi-agent etiquette

Multiple Claude Code sessions may work on this repo concurrently:

- Commit small checkpoints often (`git log --oneline` to see where others are).
- Run `npm test && npm run typecheck` before claiming anything done.
- Don't kill another session's dev server if one is already running on 4100.
  If your edit crashes the dev server's hot reload, fix it fast: a crash loop
  corrupts `.next` and breaks every session's page chunks (kill the port,
  `rm -rf .next`, restart).
- Leave handoff notes in `docs/` if you stop mid-feature.
