# OneUp integration — status and handoff

Phase 6 (corrected), steps 2–5 of the brief. Picks up after the `oneup`
catalog entry (Phase 6 step 1, commit `e15d6c8`) and the DB migration race
fix (`e34de32`).

## What's real and shipped

- `lib/connectors/oneup.ts` — a real connector against the documented
  `docs.oneupapp.io` REST API (endpoints, params, and response shapes cited
  in the file's header comment, verified against the live docs on
  2026-08-13):
  - `oneupStatus()` / `oneupConfigured()` — honest connected/not_configured,
    same pattern as `lib/connectors/allo.ts`.
  - `listOneUpCategories()`, `listOneUpAccounts()`, `listOneUpFailedPosts()`
    — GET calls, normalized into typed rows.
  - `publishOneUpPost()` — routes to `scheduletextpost` /
    `scheduleimagepost` / `schedulevideopost` based on which media field is
    set; throws OneUp's own error message on a rejected key/media/schedule
    time rather than swallowing it.
- Registered in `lib/connectors/index.ts` → shows up in `/integrations`
  and `GET /api/connections` as a real, live connector.
- `lib/integrations-catalog.ts`'s `oneup` entry now has `connectorId:
  'oneup'` — the tile shows truly "connected" once `ONEUP_API_KEY` is saved.
- `lib/schemas.ts`'s `SocialPlatformSchema` widened with `facebook` and
  `googlebusiness` — the two extra channel types OneUp actually publishes to
  for AAC (confirmed live in Sean's OneUp Queue: "Arise Above Construction
  (Page)" = Facebook, "Arise Above Construction (440 Burroughs…)" = Google
  Business Profile), on top of the pre-existing instagram/tiktok/twitter/
  youtube/linkedin set. Every exhaustive `Record<SocialPlatform, …>` map
  (icons, colors, posting-cadence sim) updated to match — `npm run
  typecheck` is the tripwire if a future platform gets added and a map is
  missed.
- `tests/oneup.test.ts` — 20 tests, TDD-first, dependency-injected `fetch`
  (matches `tests/allo.test.ts`'s convention) so real HTTP is never touched
  by the suite.
- `lib/social-oneup.ts` — the publish path is wired. `publishQueuedSocialPosts()`
  pulls every `status: 'queued'` post, matches its abstract platforms
  (`facebook`/`instagram`/… ) to OneUp's real connected accounts by
  `social_network_type` (loose case-insensitive match — see
  `PLATFORM_MATCHERS` in that file; if a platform never matches on a real
  `listOneUpAccounts()` pull, that's a signal to add the exact observed
  string, not to widen the match), and calls `publishOneUpPost()`. Every
  outcome is honest: a post with no matching connected account, or one
  OneUp itself rejects, is marked `'failed'` in the DB with the real reason
  — never silently dropped, never marked `'published'` on a guess.
  `tests/social-oneup.test.ts` — 13 tests covering the matcher, the schedule-
  time formatter, and the full publish loop against an injected `fetch`.
- **Sean's real `category_id` is `175179`** (category name "AAC Social
  Posts", confirmed 2026-08-13 via `GET /api/listcategory` in Sean's own
  browser). Set `ONEUP_CATEGORY_ID=175179` in Railway's env alongside
  `ONEUP_API_KEY` — `publishQueuedSocialPosts()` throws an honest error and
  refuses to guess a category if it's unset.
- **Social Pulse** (`social-pulse`, dept-marketing-growth) is a new real
  agent on `/agents` — `socialPulseRun()` in `lib/agents/real.ts` reports
  not-configured until both env vars land, then publishes whatever's queued
  and reports `N/total published` per run. Seeded (`lib/seed.ts`) with a
  matching SOP task (`sop-social-pulse`) and tool row (`tool-oneup`).

## What's NOT done yet (deliberately deferred)

1. **Reviews.** `docs.oneupapp.io`'s nav has no dedicated "reviews" section
   — the closest real surface is Comment Management (`fetch-top-comments`,
   `reply-to-post`, `reply-to-comment`), which the docs explicitly flag as
   **not available on the Basic plan**. Before building anything here,
   confirm Sean's OneUp plan tier — if it's Basic, reviews/comments simply
   aren't reachable via API and the honest move is a clearly-labeled
   "upgrade to unlock" state, not a silently-broken feature.

2. **Analytics / follower snapshots.** `lib/schemas.ts`'s
   `SocialSnapshotSchema` and the `/analytics` and `/social` audience charts
   still run on the pre-existing "Zernio config" placeholder path (see
   `lib/db.ts`'s `zernio-config` seed-purge source, `lib/operating-metrics.ts`,
   `app/analytics/page.tsx`). OneUp does have a real Analytics API
   (`docs.oneupapp.io/docs/analytics/*` — Facebook, Instagram, LinkedIn,
   GBP, etc.), but per the docs it's **also gated off the Basic plan**, same
   caveat as reviews. Renaming the "Zernio" labels to "OneUp" without wiring
   real data would violate `CLAUDE.md`'s honesty rule (a connector is
   "connected" only when it truly is) — left untouched until real analytics
   data can actually flow.

3. **Live test post.** Not attempted. Posting anything — even a throwaway —
   to Sean's real, live Facebook/Instagram/GBP accounts is a public,
   irreversible action; per this session's own operating rules that needs
   Sean's explicit go-ahead before it happens, not just "step 9 of the
   brief."

## Open questions for Sean

- What's the OneUp plan tier (Basic vs. a higher tier)? Determines whether
  reviews/comments and analytics are reachable via API at all.
