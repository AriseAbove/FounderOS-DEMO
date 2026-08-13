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

## What's NOT done yet (deliberately deferred)

1. **Wiring the publish path into the Social Agent.** `POST
   /api/social/posts` still only queues a post (`status: 'queued'`); nothing
   picks it up and calls `publishOneUpPost()` yet. That's the next real
   step, and it needs one thing only Sean can provide first:

   **Sean's OneUp `category_id`.** Every `publishOneUpPost()` call requires
   a `category_id` — OneUp's grouping of which connected accounts a post
   goes out to. I don't have Sean's real API key (by design — it lives in
   Railway's `.env.local`, never in chat or this repo), so I can't call
   `listOneUpCategories()` myself to find it. Once Sean (or a session with
   the real key) runs `listOneUpCategories()` against production, drop the
   real id into `.env.local` as `ONEUP_CATEGORY_ID` (or hardcode it in the
   Social Agent wiring — TBD which reads better) and the publish wiring
   becomes a small, mechanical step.

2. **Reviews.** `docs.oneupapp.io`'s nav has no dedicated "reviews" section
   — the closest real surface is Comment Management (`fetch-top-comments`,
   `reply-to-post`, `reply-to-comment`), which the docs explicitly flag as
   **not available on the Basic plan**. Before building anything here,
   confirm Sean's OneUp plan tier — if it's Basic, reviews/comments simply
   aren't reachable via API and the honest move is a clearly-labeled
   "upgrade to unlock" state, not a silently-broken feature.

3. **Analytics / follower snapshots.** `lib/schemas.ts`'s
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

4. **Live test post.** Not attempted. Posting anything — even a throwaway —
   to Sean's real, live Facebook/Instagram/GBP accounts is a public,
   irreversible action; per this session's own operating rules that needs
   Sean's explicit go-ahead before it happens, not just "step 9 of the
   brief."

## Open questions for Sean

- What's the OneUp plan tier (Basic vs. a higher tier)? Determines whether
  reviews/comments and analytics are reachable via API at all.
- Confirm the `category_id` to use for AAC's posts (see above).
