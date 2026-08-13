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
| `/funnel` | AAC's real pipeline (inquiry → complete & paid) as a living flow + radial acquisition wheel |
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

## Notes

- The funnel's stage model is AAC's real pipeline. Arise Above Apps' funnel
  stages are still undefined — `apps` journeys ride the AAC stages as a
  clearly-flagged placeholder.
- Env var names (`FOUNDER_OS_DB`, …) and the DB filename keep their original
  names for deploy compatibility.
