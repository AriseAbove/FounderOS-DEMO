# ARISE OS

**The Arise Above business operating system: one live web command center for
Arise Above Construction (AAC) and the Arise Above Apps portfolio.**

A rebuilt fork of an open-source "personal OS" demo. The Phase 2 purge removed
the original demo's fictional businesses, invented data, and personal-machine
connectors; what remains is honest: every number on screen is either real or
visibly empty, and every connector reports its true status.

## Quick start

Requires **Node 18+**.

```bash
npm install
cp .env.example .env.local   # fill in credentials to wire live integrations
npm run dev                  # http://localhost:4100
```

A local SQLite database seeds itself with the honest baseline on first run
(departments, the real agent roster, the real roadmap — no invented clients,
followers, or dollars). Navigate with the sidebar or the Command Palette
(Cmd/Ctrl + K).

```bash
npm run build && npm start   # production build
npm test                     # vitest suite
npm run typecheck            # tsc --noEmit
npm run seed                 # re-seed the baseline (idempotent)
```

## Views

| Route | What it is |
| --- | --- |
| `/` | Operator console: pulse row, connections strip, agent list |
| `/comms` | Unified inbox: IMAP email + CalDAV calendar in one feed |
| `/funnel` | Two real pipelines (AAC's sales funnel, Apps' product funnel) as a living flow + radial acquisition wheel — radial is AAC-only, see Notes |
| `/finances` | QuickBooks income/expenses/invoices + uploaded statement analysis |
| `/agents` | The agent roster, each with a real `run()` and last-run state |
| `/org` | Org hierarchy with the AAC / Apps / Combined business lens |
| `/brain` | The knowledge layer (local markdown store provider) |
| `/integrations` | Live connections board with honest status for every connector |
| `/roadmap`, `/reference`, `/analytics`, `/workflows`, `/tasks`, `/skills` | Supporting views |

Hidden from the nav until they clearly apply (pages still load by URL):
`/social`, `/content`, `/personas`.

## Architecture: repo-layer, honest-status

- **`lib/data.ts`**: `getDb()` singleton; seeds on first touch and re-seeds
  once per `SEED_VERSION` bump (purges retired seed rows, never real data).
- **`lib/db.ts`**: `openDb()` plus typed repositories.
- **`lib/seed.ts`**: the honest baseline content.
- **`lib/schemas.ts`**: Zod validates every row on the way out of the DB.
- **`lib/businesses.ts`**: the AAC / Apps business lens.
- **`lib/connectors/*`**: email (IMAP), calendar (ICS/CalDAV), QuickBooks
  (OAuth), LLM — each returns a typed `ConnectorStatus`, never a fake green.
- **`lib/brain.ts`**: knowledge provider abstraction — a local markdown store
  (`BRAIN_STORE`) today, richer providers behind the same interface later.
- **`lib/agents/*`**: every seeded agent maps 1:1 to a runtime agent with a
  real `run()`.

New data = new repo method + Zod schema + seed entry + test.

## Deploying to Railway

The app runs as a Railway service. **The SQLite store must live on a mounted
volume** — the container filesystem is ephemeral and silently drops the DB
(including stored OAuth tokens) on every redeploy. Mount a volume (e.g.
`/data`) and set `FOUNDER_OS_DB=/data/founder-os.db`.

Two more files carry the same ephemeral-filesystem risk and need the same
mounted-volume treatment — both already read their env var override the
moment it's set, nothing else to wire up:

- **`LEDGER_DB`** — the separate statement-ledger store (`lib/ledger.ts`)
  holding every row imported from a `/finances` bank/CC statement upload.
  Unset, it defaults to `./data/ledger.db` on the container's ephemeral
  disk — a real production data-loss risk, since that's uploaded financial
  data with no other copy. Set `LEDGER_DB=/data/ledger.db`.
- **`FOUNDER_OS_ENV_LOCAL`** — the path to the `.env.local` credential
  overlay (`lib/creds.ts`) that `/integrations`' connect flow and QuickBooks
  token rotation write to live. Unset, it defaults to `./.env.local` next to
  the app code — also on ephemeral disk, so a rotated QuickBooks token or a
  freshly-pasted API key would silently vanish on the next redeploy. Set
  `FOUNDER_OS_ENV_LOCAL=/data/.env.local`.

All three (`FOUNDER_OS_DB`, `LEDGER_DB`, `FOUNDER_OS_ENV_LOCAL`) can point at
the same mounted volume, in different files.

## Notes

- The funnel has two real pipelines, not one: AAC's sales pipeline (inquiry →
  complete & paid) and Apps' own product/acquisition pipeline (discovered →
  installed → activated → trial started → subscribed → retained, decided
  2026-08-14 — Sean builds and publishes the apps himself, so there's no
  client to walk through or negotiate with). Both live stages on
  `lib/funnel.ts`'s `FunnelStage` enum and render on `/funnel`'s flow canvas,
  honestly at zero for Apps today (no Apps journeys yet). The radial
  (acquisition-wedge) view stays AAC-only — its rim models AAC's real lead
  sources (phone, Google, website, social, referral), which Apps has no
  equivalent for yet.
- Env var names (`FOUNDER_OS_DB`, …) and the DB filename keep their original
  names for deploy compatibility.
