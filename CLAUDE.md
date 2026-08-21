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

Two real pipelines, one shared `FunnelStage` enum (`lib/schemas.ts`) scoped
per journey by its `business` field (`lib/funnel.ts`):

- AAC — a sales pipeline: `inquiry → follow_up → walkthrough_scheduled →
  estimate_sent → negotiation → contract_signed → active_project →
  complete_paid`. "Won" = contract_signed onward.
- Apps — decided 2026-08-14: Sean builds and publishes the apps himself, so
  it is a product/acquisition pipeline, not a sales one: `discovered →
  installed → activated → trial_started → subscribed → retained`. "Won" =
  subscribed onward.

`stagesFor(business)` returns the right stage set; `ALL_FUNNEL_STAGES` is the
safe flat lookup for label rendering regardless of business (ids never
collide). `isWon`/`journeyMeta`/`funnelSummary`/`funnelSpaceModel` all work
across both pipelines. The two funnel canvases (FunnelSpace, FunnelRadial)
still render hub geometry off the AAC backbone (`FUNNEL_STAGES`, unconditionally)
— a dedicated Apps canvas view is a scoped follow-up, not yet wired, since
Apps has zero live journeys today; do not hardcode the AAC stage count
elsewhere on the assumption it is the only pipeline. Colors are
`--funnel-s0..s7` per theme in `app/globals.css` (Apps' 6 stages reuse the
first 6 tokens).

## Connectors & agents

Real integrations only — "real" means honest status reporting, nothing
pre-wired to any one machine.

- `lib/connectors/` — email.ts (4 IMAP slots), gcal.ts (ICS/CalDAV),
  quickbooks.ts (OAuth; tokens live in the DB via the `quickbooksAuth` repo,
  never in .env.local; PRODUCTION is the default environment —
  `QUICKBOOKS_ENVIRONMENT=sandbox` only for dev keys), allo.ts (the AI
  receptionist's call log via Allo's REST API — `ALLO_API_KEY`), llm.ts
  (Anthropic; stub for tests). Each returns an honest `ConnectorStatus` and
  goes live the moment its credentials land in `.env.local`
  (see `.env.example`).
- `lib/funnel-allo.ts` — Allo call log → pipeline import: inbound calls only,
  spam kept out, idempotent by call id, and a call never moves a journey's
  stage (stage changes are Sean's decision). Runs via the Allo Pulse agent,
  POST /api/funnel/sync-allo, or the sync button on /funnel.
- `lib/brain.ts` — the knowledge layer behind a provider abstraction: a local
  markdown store provider (point `BRAIN_STORE` at a folder — real grep search,
  folder overview; `lib/brain-dump.ts` captures write real files there) and a
  stub for tests. A vector provider slots in behind the same interface.
  `brainStorePath()` falls back to the bundled `knowledge/brain-store/` in the
  repo when no `BRAIN_STORE`/`GBRAIN_STORE` override is set — real markdown
  generated from the honest seed data (agents, SOPs, tools, people, pillars)
  via `npm run brain:docs` (`scripts/generate-brain-docs.ts`), so Knowledge
  search and the Data Agent have something real to search on day one with
  zero required config. Regenerate after a seed change with
  `BRAIN_DOCS_DIR="$(pwd)/knowledge/brain-store" npm run brain:docs` — it's
  idempotent and never clobbers a hand-edited file (one without the
  `generated: founder-os` marker).
- `lib/agents/runtime.ts` + `real.ts` — the roster: conductor, comms-agent,
  gmail-worker, calendar-worker, data-agent, quickbooks-pulse, allo-pulse. Every seeded
  agent row maps 1:1 to a `RuntimeAgent` with a real `run()` (enforced by
  seed tests). Runs persist to `agent_runs`, including a `pushFailed`
  column (`ok`/`pushFailed` are deliberately separate signals — a run can do
  its own job fine while a notification it tried to send genuinely fails;
  see below and `lib/analytics.ts`'s `runOutcomeCounts`).
- Chief of Staff / ntfy (2026-08-21 fix): production logged "push failed
  (fetch failed)" on every single hourly run with no way to tell why — Node's
  fetch throws a generic `TypeError: fetch failed` for any network-level
  failure and buries the real reason on `err.cause`. `describeFetchError`
  (`lib/chief-of-staff.ts`) now walks that cause chain into the summary
  instead of swallowing it, `sendNtfyPush` URL-encodes `NTFY_TOPIC` and
  attaches a 10s `AbortSignal` timeout so a hung connection fails fast
  instead of stalling the cron. Separately, `chiefOfStaffRunWith` always
  returned `ok: true` even when the push itself failed (intentional — a
  flaky push must never fail the run whose real job, gathering signals,
  worked), but Analytics' "Run outcomes" pie read `ok` straight into
  "Succeeded" with nothing else to go on, so 69 straight failed-push runs
  showed as ~99% OK. The run now also reports `pushFailed: true` on a
  genuine failure (not on the honest "NTFY_TOPIC not set" no-op), persisted
  alongside `ok`, and `/analytics` (`runOutcomeCounts`) buckets outcomes into
  Succeeded / Push failed / Failed instead of a two-way ok/fail split — a
  failing push is now visible on its own, not folded into full success.
- `lib/agents/chat.ts`'s `systemPromptFor` only tells an agent to "use your
  tools" when `agent.chatTools()` actually returns tools — otherwise it tells
  the model plainly that it has no live-data tools wired in and to never
  invent a tool call. Before this fix, every tool-less agent (all but
  data-agent) was told to "use your tools" anyway, and under the real Gateway
  provider the model would hallucinate fake tool-call syntax into its reply
  text trying to comply. `chief-of-staff` (`getBusinessSignals` → reuses
  `gatherSignals`), `comms-agent` (`getUnreadEmail`/`getUpcomingEvents` →
  reuse `gmailRun`/`calendarRun`), and `quickbooks-pulse`
  (`getFinancialSnapshot` → company name + MTD income/expenses + open
  invoices) now carry real `chatTools()` so chat can actually pull live data
  instead of only being able to describe what it would do.
- `/integrations` is the live Connections board (`GET /api/connections`).
- `app/api/voice/queue` (`lib/db.ts`'s `voiceQueue` repo, `voice_queue` table)
  — the relay behind Zoey, Sean's local voice loop
  (`~/.cowork_speaker/speaker_daemon.py`, see project memory's
  `project_cowork_speaker_voice_system.md`). Any Claude session POSTs a
  short reply; the daemon polls GET over the network and marks it
  consumed atomically (FIFO, no double-speak), so voice output no longer
  needs a fresh `device_request_folder_access` grant to
  `~/.cowork_speaker` every new cloud session — that per-session
  re-approval was exactly what Sean was trying to get away from. Gated by
  `VOICE_RELAY_SECRET`, same pattern as the Chief of Staff cron's
  `CRON_SECRET`. Consumed rows older than 24h are swept on every `popNext`
  so the table stays small.
- `app/api/aac-brain` (`lib/db.ts`'s `brainHealth` repo, `brain_health`
  table) — the health relay for the AAC Brain, Sean's SEPARATE Mac-based
  automation system (`~/.aac_brain`: lead-followup/ASC-response drafting,
  the Phase 9 action queue, worker-failure tracking). Not the same thing as
  this repo's own `/brain` knowledge layer above — the names collide, the
  concepts don't (see `app/aac-brain/page.tsx`'s header comment). Data
  arrives by push, not pull: `~/.aac_brain/stateio.py`'s `heartbeat()` POSTs
  a snapshot here every time it already pings its Healthchecks canary
  (`brain_health_push.py` on the Mac gathers `worker_failures.json` +
  `ACTION_QUEUE.json` + `.last_daily_summary`). Gated by `AAC_BRAIN_SECRET`,
  same pattern as `VOICE_RELAY_SECRET`. The dashboard tile (`app/page.tsx`)
  and `/aac-brain` detail page both read `getDb().brainHealth.latest()`
  directly — single latest-snapshot row, upserted per push, no fabricated
  trend line. 2026-08-20.
- `middleware.ts` — the app-wide login wall, added 2026-08-15 after a
  security review found that of the ~40 routes under `app/api`, only the
  cron and voice-relay routes checked anything at all; every other page
  and route (finances, funnel/CRM, comms including SENDING real email,
  `/api/keys`, `/api/connections/connect`) was reachable by anyone with
  the URL. It's a single HTTP Basic Auth gate in front of the whole app,
  gated by `APP_BASIC_AUTH_USER`/`APP_BASIC_AUTH_PASS` (see
  `.env.example`) — honest-by-default like every connector here: fails
  OPEN (no protection) until both are set, never silently claims a
  password wall that isn't configured. The cron and voice-relay routes
  are exempted (`BYPASS_PREFIXES`) since their callers are machines
  authenticating with their own bearer secret, not a browser that can do
  an interactive Basic Auth challenge. Tests in `tests/middleware.test.ts`.
- **OneUp status reconciliation (2026-08-21).** A dashboard review found
  `/social`, `/content`, and the publish queue all disagreeing with
  `/integrations` about whether OneUp was connected: `/integrations`
  (`allConnectorStatuses()` → `oneupStatus()`, honest env-var-present check)
  correctly said connected, but `/social` hardcoded "no posting source
  connected" regardless of real state, and `/content` rendered
  `db.agents.all()`'s static seed `status` (`'planned'`) for Social Pulse
  instead of computing it live like `/agents` and `/` already do via
  `lib/agents/live-status.ts`'s `liveAgentStatus()` — the fix both pages were
  missing, not a new status source. `/social`'s badge now reads the real
  OneUp state (`lib/social.ts`'s `socialSourceBadge()`) — connected still
  doesn't claim synced audience/post data exists, since no OneUp
  account/post sync is wired yet (`docs/oneup-integration.md`'s "what's NOT
  done" #2 — the audience chart still runs on the pre-existing "Zernio
  config" placeholder path, deliberately left alone). Root cause of "the
  publish queue never fires": Social Pulse (`social-pulse`) has a real
  `run()` (`socialPulseRun` in `lib/agents/real.ts`) but, unlike Chief of
  Staff, has no cron route or GitHub Actions workflow — it only runs when
  triggered manually from `/agents`. Wiring an actual schedule is scoped to
  the separate agent-scheduling task; `PostComposer`'s copy now says so
  honestly instead of implying an automatic "next run."
- Credentials go in `.env.local` (gitignored). NEVER commit keys.

## Views

`/` operator console · `/comms` unified email + calendar feed · `/funnel` the
AAC pipeline (flow + radial views) · `/finances` QuickBooks + statement
uploads · `/agents` roster with Run buttons · `/org` hierarchy board with the
business lens (markup frozen — do not restructure) · `/brain` knowledge layer ·
`/aac-brain` the AAC Brain's own operational health (Sean's Mac automation —
distinct from `/brain` above) · `/roadmap` the real rebuild roadmap · `/analytics` real connector numbers ·
`/reference` reference model · `/integrations` connections board ·
`/workflows` `/tasks` `/skills` supporting views. `/social`, `/content`,
`/personas` surfaced into their own "Marketing" nav group (`NAV_MARKETING` in
`lib/nav.ts`) on 2026-08-14 now that OneUp (social connector) is live — they
still render honest empty states wherever there's genuinely nothing yet.

## Conventions

- TDD: failing test first, then implementation. Tests live in `tests/`,
  one file per module; use `FOUNDER_OS_DB=:memory:` pattern (see `tests/db.test.ts`).
- Zod-validate anything that crosses the DB or API boundary.
- HONESTY: no invented numbers anywhere. Empty states say why they're empty
  and what connects them. A connector is "connected" only when it truly is.
- THEME: **Copper is the default** as of 2026-08-14 (`DEFAULT_THEME` in
  `lib/theme.ts`; bare `:root` in `app/globals.css` carries the copper
  tokens) — Sean's call, off the prior monochrome default. Monolith Signal
  (`mono`) remains a fully selectable theme, just no longer bare-root-anchored.
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
- `rebuild/arise-above` is the repo's **default branch** (switched from the
  stale `main` on 2026-08-14) — this matters beyond habit: GitHub Actions
  only picks up `on: schedule` and `on: workflow_dispatch` triggers from
  whichever branch is default, so the Chief of Staff cron workflow was
  invisible to GitHub until this switch, independent of its secrets being
  set correctly. `main` still exists but is 15 commits behind and unused.

## Multi-agent etiquette

Multiple Claude Code sessions may work on this repo concurrently:

- Commit small checkpoints often (`git log --oneline` to see where others are).
- Run `npm test && npm run typecheck` before claiming anything done.
- Don't kill another session's dev server if one is already running on 4100.
  If your edit crashes the dev server's hot reload, fix it fast: a crash loop
  corrupts `.next` and breaks every session's page chunks (kill the port,
  `rm -rf .next`, restart).
- Leave handoff notes in `docs/` if you stop mid-feature.
