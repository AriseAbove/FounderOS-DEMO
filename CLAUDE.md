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
across both pipelines. Do not hardcode the AAC stage count elsewhere on the
assumption it is the only pipeline. Colors are `--funnel-s0..s7` per theme in
`app/globals.css` (Apps' 6 stages reuse the first 6 tokens).

**Apps funnel presence (2026-08-21 fix).** A dashboard review found the
`rm-apps-funnel` roadmap item's "done" claim overstated what had shipped —
the stage model was real (above), but `app/funnel/page.tsx` called
`funnelSummary`/`funnelSpaceModel`/`funnelRadialModel` with no `stages` arg,
so every one of them silently defaulted back to `AAC_FUNNEL_STAGES` even with
Apps selected, and `FunnelSpace` imported `FUNNEL_STAGES` (AAC's) at module
scope for its hub geometry regardless of business. Invisible today only
because Apps has zero live journeys (`nodes.length === 0` short-circuited
before any hub rendered) — the bug was real, just unobserved. Fixed: the page
now threads `stagesFor(business)` through every model call, and
`FunnelSpace` takes a `stages` prop and renders its **real** hub row (Apps'
Discovered → Retained, honestly all zero) instead of swapping the canvas for
a stage-less "No journeys" message. `FunnelRadial` stays AAC-only on purpose
— its rim is AAC's real lead-source wedges (phone, Google, website, social,
referral; `lib/funnel-radial.ts`'s `ACQUISITIONS`), and Apps has no
acquisition-channel data to back an equivalent wedge set, so inventing one
would violate HONESTY. `/funnel` now forces `layout=flow` and disables the
radial toggle whenever `business=apps`, with a tooltip explaining why, rather
than rendering AAC's wedges under an Apps label. `lib/businesses.ts`'s
`areaAgents` also went from "AAC and Apps are both shared-infra-only, equally
sparse" to AAC carrying its own real crew — Allo Pulse + Website Pulse
(sales, both literally described as "the AAC pipeline" in their own seed
copy), QuickBooks Pulse (finances, the confirmed real books), and Comms
Agent/Gmail Worker/Calendar Worker (communication, Sean's real connected
inbox/calendar) — none of it invented, just finally wired from facts already
documented elsewhere in this file. Apps stays honestly shared-only (no
app-specific inbox/books/lead source exists yet); its `focus` list now says
so directly instead of leaving the sparse roster unexplained.

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
- **Every real agent now has a real schedule (2026-08-21 fix).** A
  production review found only Chief of Staff had ever actually run on a
  schedule — the other 9 agents in `realAgents` had a real `run()` but no
  trigger, only the manual "Run" button on `/agents`, so production showed
  zero run history for most of the roster. `app/api/cron/chief-of-staff/
  route.ts` (single hardcoded agent) is now `app/api/cron/[agentId]/route.ts`
  — same `CRON_SECRET` bearer gate, same honest 501-when-not-configured
  behavior, but it validates `agentId` against `realAgents` and 404s on an
  unknown id instead of only ever running one agent. The URL
  `/api/cron/chief-of-staff` is unchanged (the dynamic route matches it via
  `agentId: "chief-of-staff"`), so `.github/workflows/chief-of-staff-check.yml`
  and its already-configured `ARISE_OS_URL`/`CRON_SECRET` repo secrets needed
  no changes. `.github/workflows/agent-cron-checks.yml` adds schedules for
  the rest of the roster, grouped by sensible cadence (see that file's header
  comment for the full reasoning per agent): gmail-worker/calendar-worker/
  comms-agent every 30 min business hours, allo-pulse/website-pulse (lead
  intake — a stale lead is a real cost) every 15 min business hours,
  data-agent/conductor (cheap pure-DB reads) hourly business hours,
  quickbooks-pulse twice daily, social-pulse every 4 hours around the clock.
  `middleware.ts`'s cron bypass prefix widened from `/api/cron/chief-of-staff`
  to `/api/cron` to cover the new per-agent paths — still just "let the
  route's own CRON_SECRET check run instead of the Basic Auth wall", not a
  new hole, since every id under that prefix is still bearer-gated by the
  route itself. No fake "last run" data was added anywhere — the fix is
  making runs actually happen, not backfilling history that didn't occur;
  each agent's real run history starts accumulating from whenever its
  workflow first fires after this ships. Tests in
  `tests/cron-agent-route.test.ts`.
- **Push-failure honesty didn't reach the badges, and "agents live" still
  conflated configured with actually-running (2026-08-21 fix).** A follow-up
  review of the two fixes above found both were real but incomplete.
  (1) `chiefOfStaffRunWith` and `runOutcomeCounts` (see above) correctly
  separate `ok` from `pushFailed` and `/analytics` already buckets a failed
  push into its own slice — but nothing downstream of the raw `agent_runs`
  row actually read `pushFailed`. `lib/agents/live-status.ts`'s
  `liveAgentStatus` judged Chief of Staff on `lastRun.ok` alone, so ~69
  straight runs whose push failed every single time still read "active"
  (green, pulsing "LIVE" dot) exactly like a fully healthy run; the OK/FAIL
  badges on `/agents`' roster cards, the home page's live ticker, its "Recent
  runs" list, and its per-agent roster rows all keyed off `.ok` only, so
  those runs rendered as plain "OK"; and `ActivityEventSchema`
  (`lib/schemas.ts`) didn't even carry `pushFailed` through
  `recentActivity()`, so the `/agents` Activity log dropped the signal
  entirely before it could be rendered. Fixed: `liveAgentStatus`'s
  cross-cutting rule now reads `ok:true, pushFailed:true` as `'idle'` (a
  third, amber state — genuinely ran, but couldn't deliver — distinct from
  green `'active'` and gray `'planned'`/no-creds); `ActivityEventSchema`
  gained `pushFailed` and `recentActivity()` passes it through; and every
  OK/FAIL badge (roster cards, live ticker, recent-runs list, per-agent rows,
  the pill that used to say "no creds" for a degraded-but-configured agent)
  is now a three-way OK / PUSH FAILED / FAIL, matching what `/analytics`
  already showed. (2) Separately, "X/10 agents live" (the home hero line via
  `lib/pulse-history.ts`'s `stateOfWorld`) and "/agents"'s "Active" tile both
  came from `liveAgentStatus`'s connector-configured check alone — true
  "wired up and able to run," but read by a business owner as "actually
  working," and as of this fix only 2 of the 10 real agents had ever actually
  executed since the cron schedules above went in (8 still showed "never
  run" per-agent). `lib/analytics.ts` gained `ranWithin`/`countRanWithin`
  (was an agent's most-recent run within the trailing 24h?) as the honest
  counterpart to "configured." The home hero line now reads e.g. "10/10
  configured · 2 ran in 24h" instead of "10/10 agents live," and no longer
  claims "All nominal" when agents are configured but haven't actually run;
  the "Agents configured" stat tile shows the ran-in-24h count alongside it;
  and `/agents`' stat strip splits its old single "Active" tile into
  "Configured" and "Ran (24h)." Tests: `tests/agents-live-status.test.ts`,
  `tests/activity.test.ts`, `tests/analytics.test.ts`,
  `tests/pulse-history.test.ts`.
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
- **Finances page self-contradicting on expenses (2026-08-21 fix).** A live
  QA review of `/finances` found the same QuickBooks connection giving three
  different answers for August 2026's expenses on one page: the top summary
  cards said "$244 · MTD" and "−$244 net", the header badge said "+$0 net
  /mo", and the "Monthly expenses · by category" chart said "$0 ·
  QuickBooks · Aug 2026 — Nothing to chart yet". Root cause: the page never
  had a genuine two-source disagreement, it had one broken parser. The top
  cards' `$244` came from `monthToDateExpenses` (`lib/connectors/
  quickbooks.ts`), a raw sum of every QBO `Purchase` transaction this month
  regardless of which P&L account it posts to. The `$0` chart came from
  `monthToDateExpensesByCategory` → `parseProfitAndLossExpenseCategories`,
  which read QuickBooks' ProfitAndLoss report but — by original design,
  documented in its own test — walked only the report's `"Expenses"`
  section and explicitly ignored `"COGS"` (Cost of Goods Sold). For a
  construction company, real job/material costs routinely post to a COGS
  account rather than Expenses, so the $244 Purchase transaction counted
  fully toward the raw MTD sum but contributed nothing to the categorized
  chart — same real spend, two numbers, because "expenses" quietly meant two
  different things in two places on the same page. Fixed in two parts:
  `parseProfitAndLossExpenseCategories` now walks both the `"Expenses"` and
  `"COGS"` sections (`SPEND_SECTION_GROUPS`) — still ignoring Income/
  NetIncome, still an honest `[]` when a period genuinely has no spend — so
  the categorized total actually captures all real money spent, not just
  the operating-expense subset. And `app/finances/page.tsx` stopped
  computing "this month's expenses" twice: it no longer calls
  `monthToDateExpenses` at all (that raw-Purchase-sum function stays in
  `lib/connectors/quickbooks.ts` for its other real caller, the
  `quickbooks-pulse` agent's `getFinancialSnapshot` chat tool, which labels
  its own number "expenses (purchases)" honestly and isn't part of this
  page). Every "this month's expenses" figure on `/finances` — the top QBO
  card, the header badge's net, the summary tiles, and the category chart —
  now derives from the single categorized QuickBooks read, so a real number
  shows the same way everywhere it appears, and a real API failure shows an
  honest "—" instead of a silently-wrong number standing next to a correct
  one. Regression test in `tests/quickbooks.test.ts` (`MTD expenses vs
  category-chart total`) reproduces the exact $244-vs-$0 scenario with a
  COGS-coded Purchase transaction and asserts the two totals must agree.
- **Comms gravity WORK-lane overflow fix (2026-08-21).** A live QA pass on
  `/comms` found the Sources visualization's WORK column header honestly said
  "25" and 25 node elements genuinely existed in the DOM, but 12 of them sat
  above the visible column area (offsets around -92px/-46px at 1400×862) and
  were clipped and unclickable — PERSONAL (0) and MISC (15) rendered fine.
  Root cause: `CommsGravity.tsx` positioned each priority tier as one
  flex-wrap box anchored only by `bottom: laneBottomPct(tier)%`, with the
  box's own height left to grow unbounded with however many rows the wrap
  produced. `laneBottomPct` is a pure function of tier alone (verified
  on-canvas by its own existing test), but nothing ever bounded the box's
  *height* against how many nodes actually landed in it — so once a tier held
  enough items to need more rows than fit between its anchor and the lane's
  top edge, the extra rows pushed the box's top edge above y=0, where the
  lane's `overflow-hidden` (for its rounded corners) silently clipped them.
  WORK's untagged tier was the only one in production with enough items to
  need that many rows; MISC (15) and PERSONAL (0) never crossed the
  threshold, so the bug was invisible until a lane's count grew. Fixed in
  `lib/comms-gravity.ts`: `laneBandZone(priority)` gives every tier a fixed,
  non-overlapping vertical territory (`{ bottomPct, heightPct }`) that is a
  pure function of the tier alone, never of item count; `bandRowsWithOffsets`
  chunks a tier's items into fixed-width rows and places each row at a
  `bottomPct` that divides the tier's zone evenly across however many rows
  are actually needed — row pitch shrinks as the band grows, so the top row's
  offset is always strictly inside `[zone.bottomPct, zone.bottomPct +
  zone.heightPct)` regardless of node count. `CommsGravity.tsx` now renders
  each tier as N positioned rows via `bandRowsWithOffsets` instead of one
  unbounded flex-wrap box; `laneBottomPct` itself is unchanged (still used to
  derive each zone's floor). Regression tests in `tests/comms-gravity.test.ts`
  construct a 25-item single-tier band (and a stress sweep up to 200) and
  assert every row's `bottomPct` stays inside its tier's zone and therefore
  inside `[0, 100]`; `tests/comms-gravity-component.test.ts` pins that the
  component actually renders through `bandRowsWithOffsets` rather than the
  old unbounded-wrap anchor.
- **`/brain` internal contradictions, fixed (2026-08-21).** A live QA pass on
  `/brain` and the home page's summary cards found five places where the
  page's own copy and status chips disagreed with each other. All five
  turned out to be real defects, not "pick the more-true side and delete the
  other":
  1. *Search provider.* Body copy honestly said grep is the only provider,
     but `components/BrainViz.tsx` hardcoded "ZEROENTROPY · EMBEDDINGS" and
     "SUPABASE · 1240 PAGES · PAUSED" unconditionally, and `BrainQuery.tsx`'s
     busy line claimed "hybrid (local + zeroentropy)". Neither service has
     ever been wired in this codebase — no SDK dependency, no env var, no
     client code touches either; 1240 was a leftover default, not a real
     count. Root cause of the "verified"/"paused" framing specifically: the
     page's `fallbackActive` flag was computed as `!doctor.connected` (is
     the *local grep store* reachable) instead of the actually-relevant fact
     (is a *vector* provider wired) — so a healthy local store read as "the
     real hybrid backend is live, just paused." `lib/brain.ts`'s
     `BrainOverview.doctor` gained a `vector: boolean` field (always `false`
     for both real providers today, by design — a future provider flips it
     in its own `overview()`), `fallbackActive` is now `!doctor.vector`, and
     every chip (`BrainViz`, `BrainQuery`, `BrainCore`'s "no vector provider
     wired" notice, `/brain`'s "search"/doctor annotations, home's G-Brain
     card) derives from that one flag instead of independently guessing.
  2. *Supabase reachability.* Same root cause as #1: "supabase reachable" on
     `/brain` was actually reporting the local store's own connectivity, not
     Supabase's (nothing in this app calls Supabase at all — confirmed via
     `grep`, no `SUPABASE_*` env var, no client dependency). Not "paused",
     simply never integrated. Fixed by the same `vector`-flag change above;
     the line now reads "no vector provider wired" / "vector provider
     reachable" — accurate for the local grep store today and still correct
     the day a real vector backend is registered.
  3. *"No agent runs yet" vs. 70 recorded runs.* `/brain`'s doctor panel
     queries `db.agentRuns.byAgent('data-agent')` — deliberately scoped to
     Data Agent, the one agent tied to the knowledge layer
     (`lib/agents/live-status.ts` maps it to the `'brain'` connector), not a
     wrong table or wrong filter. The bug was purely the bare "no agent runs
     yet" copy reading, to anyone who'd just seen 70 total runs on `/agents`
     or `/analytics`, as "nothing has ever run" — it was only ever reporting
     on this one agent (whose own schedule, per the "every real agent now
     has a real schedule" entry above, may genuinely not have fired yet).
     Now reads "data-agent has not run yet."
  4. *Tool count, three ways.* "Tools 13" (the knowledge-graph legend),
     "TOOLS 10" (the graph's sidebar directory), and "TOOLS · 9" (the
     brain-store pipeline's folder listing) are three legitimately different,
     correctly-computed numbers, not a bug: the legend counts graph NODES
     (`buildKnowledgeGraph` gives a shared tool one node PER department that
     uses it — 13), the directory dedupes those by slug (10 unique tools
     actually wired to an agent), and the pipeline's "tools" folder counts
     markdown DOCUMENTATION pages (one per catalog `Tool` in `lib/seed.ts` —
     9). All three used to render under a bare "Tools"/"TOOLS" label as if
     counting the same thing. Fixed by disambiguating each label instead of
     forcing one number: the legend row reads "Tool nodes"
     (`components/KnowledgeGraph.tsx`'s `LEGEND_LABEL_OVERRIDE`), the
     directory group is titled "Unique tools" (`lib/knowledge-graph.ts`'s
     `graphDirectory`), and the pipeline folder listing reads "tool docs"
     (`app/brain/page.tsx`'s `FOLDER_DISPLAY_NAME`, applied to the other
     generated-doc folders too).
  5. *Health score vs. "ok".* `doctor.healthScore` is never actually
     computed anywhere in this codebase (`lib/brain.ts` always returns
     `null`) — but `/brain`'s footer badge and header line granted "ok"/"all
     green" purely from `connected && warnings.length === 0`, with zero
     regard for whether a real score backed that claim, so "—/100" sat next
     to a green "all green" badge; `PillarRadar`'s center health number was
     hardcoded `text-os-ok` (green) even when rendering "—"; and the home
     page repeated the same pattern in both the Knowledge health tile
     (`overview.doctor.status` is `'ok'` whenever the store has any files,
     independent of the score) and the G-Brain summary card. Fixed with one
     new function, `lib/brain.ts`'s `summarizeDoctor()`: connected +
     checks-all-green + **no real score** now summarizes as `not_scored`
     ("not yet scored"), never `ok`. `ok`/"all green" is only reachable once
     a real score exists. `/brain` and the home page both now render that
     one function's output instead of computing their own "ok" independently
     (which is exactly how they drifted out of sync with each other in the
     first place), and `PillarRadar`'s health number is styled `text-os-dim`
     instead of `text-os-ok` whenever it's null. Tests in
     `tests/brain.test.ts` (`summarizeDoctor`, `doctor.vector`),
     `tests/brain-page.test.ts`, `tests/brain-viz.test.ts`,
     `tests/home-page.test.ts`, and `tests/knowledge-graph.test.ts`.
- **Three more connection-status disagreements found and fixed
  (2026-08-21).** A follow-up review found the OneUp reconciliation above
  hadn't fully reached `/content`, plus two unrelated honesty splits on
  `/integrations` and one on the sidebar:
  1. **`/content`'s "Content pipeline" section still said "No posting
     source is connected" unconditionally**, even after the agent-card fix
     above made the Social Pulse card itself live — the pipeline section
     underneath was a second, separately hardcoded piece of copy the
     earlier fix missed, so the page still contradicted `/social` ("OneUp
     connected · no synced data yet") and `/integrations` ("OneUp
     CONNECTED") the moment `ONEUP_API_KEY` was set. Fixed with
     `lib/content.ts`'s new `contentPipelineStatus()`, which reads the same
     `oneup` entry from `allConnectorStatuses()` `/social` and
     `/integrations` already read and reuses `lib/social.ts`'s
     `socialSourceBadge()` for wording — one source of truth, not a third
     guess. It renders three honest states, not two: not connected /
     connected but nothing synced yet / connected with real synced posts
     (driven by an actual `db.socialPosts` `'published'`-status count —
     never a hardcoded label). Tests in `tests/content.test.ts`.
  2. **`/integrations`'s "Google Calendar — CONNECTED" card sat directly
     above "CAL_1_USER: not set / CAL_1_PASS: not set"** in the API Keys
     panel, even though Calendar demonstrably works (`/comms` shows real
     events). Root cause: `lib/connectors/gcal.ts`'s real calendar
     connector has never read `CAL_1_USER`/`CAL_1_PASS` — it authenticates
     with the same Google `INBOX_*_USER`/`INBOX_*_PASS` app passwords the
     Email group already lists (a Gmail app password also unlocks the
     legacy CalDAV endpoint; see that file's header comment). The CONNECTED
     badge was right; the credential panel was labeling dead vars nothing
     in the codebase ever consulted. Fix: removed the `CAL_1_USER`/
     `CAL_1_PASS` slots from `lib/keys.ts`'s `KEY_SLOTS` entirely (the
     "Calendar" group no longer renders) and noted on `INBOX_1_HOST`'s hint
     that a Google inbox also powers Calendar via CalDAV — the panel now
     only shows credentials something real actually reads.
  3. **`/integrations`'s "Knowledge Store — CONNECTED" card sat above
     "BRAIN_STORE: not set"** — both facts are individually true and
     neither was actually wrong: `BRAIN_STORE` really isn't set, and the
     connector really is connected, because `lib/brain.ts`'s
     `brainStorePath()` deliberately falls back to the bundled
     `knowledge/brain-store/` folder shipped in the repo (documented above
     under "The knowledge layer"). Left unexplained, the juxtaposition read
     as a lie. Fix: `lib/keys.ts`'s `listKeyStatuses()` now attaches a
     `note` to the `BRAIN_STORE` slot ("using the bundled starter store —
     already connected") whenever it's unset but the bundled fallback
     exists (`lib/brain.ts`'s new `bundledBrainStoreExists()`), and
     `ApiKeys.tsx` renders it inline — the CONNECTED badge and the
     credential panel now agree instead of one silently overriding the
     other. Tests in `tests/keys.test.ts`.
  4. **Sidebar footer flickered between "7/7 systems live" and "—/—
     systems live"** on page load, worst on `/integrations` and `/social`.
     Root cause: `components/Sidebar.tsx` fetches `/api/connections`
     client-side after mount and rendered the literal string `'—/—'`
     alongside the same solid green pulsing "ok" LED the real count uses
     whenever that fetch hadn't resolved yet — a loading state disguised as
     a live "zero of zero" reading, not a data bug. Fixed with
     `lib/sidebar-status.ts`'s new pure `systemsLiveDisplay()`: while
     `live` is still `null` it returns `{ label: 'checking systems…',
     loading: true }` and the footer now renders a hollow neutral `.dot.off`
     LED instead of the green pulse; once the count resolves (including a
     genuine `0/0`) it renders the real value with the normal `ok` LED,
     visually and textually distinct from the loading state in every case.
     Tests in `tests/sidebar-status.test.ts`.
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
  Same caveat applies to `.github/workflows/agent-cron-checks.yml` (the
  schedules for the rest of the agent roster, added 2026-08-21) and to any
  future scheduled workflow: it only fires once it lives on whichever branch
  is default at the time, not necessarily the branch it was authored on.

## Multi-agent etiquette

Multiple Claude Code sessions may work on this repo concurrently:

- Commit small checkpoints often (`git log --oneline` to see where others are).
- Run `npm test && npm run typecheck` before claiming anything done.
- Don't kill another session's dev server if one is already running on 4100.
  If your edit crashes the dev server's hot reload, fix it fast: a crash loop
  corrupts `.next` and breaks every session's page chunks (kill the port,
  `rm -rf .next`, restart).
- Leave handoff notes in `docs/` if you stop mid-feature.
