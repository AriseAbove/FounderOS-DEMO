import type { FounderDb } from '@/lib/db';
import type { SocialPlatform, SocialPost } from '@/lib/schemas';
import {
  listOneUpAccounts,
  listOneUpFailedPosts,
  publishOneUpPost,
  type OneUpAccount,
  type OneUpFailedPost,
} from '@/lib/connectors/oneup';

/**
 * Bridges the app's own post queue (Social tab -> POST /api/social/posts,
 * status 'queued') to OneUp's real publish API. Composes lib/connectors/
 * oneup.ts (pure API client, no DB) with lib/db.ts's socialPosts repo — same
 * shape as lib/funnel-allo.ts composing allo.ts with the funnel repo.
 */

// Our own SocialPlatformSchema values -> substrings OneUp's social_network_type
// is known/expected to contain (case-insensitive). OneUp's own docs example
// shows title-case ("SnapChat"); Google Business Profile's exact literal
// isn't in any cited docs example, so it matches loosely on "google"/"gbp"/
// "business" rather than guessing one exact string that might not match
// Sean's real account. If none of these ever match on a real
// listOneUpAccounts() pull, that's a signal to add the real observed string
// here — not a signal to silently widen the match.
const PLATFORM_MATCHERS: Record<SocialPlatform, string[]> = {
  instagram: ['instagram'],
  facebook: ['facebook'],
  twitter: ['twitter', ' x', 'x.com'],
  linkedin: ['linkedin'],
  youtube: ['youtube'],
  tiktok: ['tiktok'],
  googlebusiness: ['google', 'gbp', 'business profile'],
};

export function matchesOneUpPlatform(ourPlatform: SocialPlatform, oneupPlatformType: string): boolean {
  const needles = PLATFORM_MATCHERS[ourPlatform] ?? [];
  const hay = ` ${oneupPlatformType.toLowerCase()} `;
  return needles.some((n) => hay.includes(n));
}

export type ResolvedTargets = {
  socialNetworkIds: string[];
  unmatched: SocialPlatform[];
};

/** Maps a post's abstract platforms to OneUp's real connected account ids. */
export function resolveSocialNetworkIds(
  platforms: SocialPlatform[],
  accounts: OneUpAccount[],
): ResolvedTargets {
  const socialNetworkIds: string[] = [];
  const unmatched: SocialPlatform[] = [];
  for (const platform of platforms) {
    const matches = accounts.filter((a) => matchesOneUpPlatform(platform, a.platform));
    if (matches.length === 0) unmatched.push(platform);
    else for (const m of matches) socialNetworkIds.push(m.id);
  }
  return { socialNetworkIds: [...new Set(socialNetworkIds)], unmatched };
}

/**
 * 'YYYY-MM-DD HH:MM' in OneUp's expected schedule format. A post with no
 * scheduledFor goes out ~1 minute from `now` — OneUp's API has no "post
 * immediately" verb, only "schedule for a time", so the earliest an honest
 * unscheduled post can go out is "very soon".
 */
export function oneUpScheduleTime(post: Pick<SocialPost, 'scheduledFor'>, now: Date): string {
  const when = post.scheduledFor ? new Date(post.scheduledFor) : new Date(now.getTime() + 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

export type PublishOutcome =
  | { postId: string; ok: true; message: string }
  | { postId: string; ok: false; reason: string };

/**
 * Publishes every currently-queued post through OneUp, one at a time.
 * Honest per-post outcomes only: a post whose platforms match no connected
 * OneUp account, or whose publish call OneUp itself rejects, is marked
 * 'failed' in the DB with the real reason attached to the outcome — never
 * silently dropped, never marked 'published' on a guess. Requires
 * ONEUP_CATEGORY_ID in env (see docs/oneup-integration.md for how to find
 * it) — throws if it's missing rather than guessing a category.
 *
 * Media handling: SocialPost has a single mediaUrl with no type flag, so it
 * is always sent as an image (scheduleimagepost), never video — a known
 * limitation until the schema grows a mediaType field.
 */
export async function publishQueuedSocialPosts(
  db: FounderDb,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<PublishOutcome[]> {
  const categoryId = env.ONEUP_CATEGORY_ID;
  if (!categoryId) {
    throw new Error(
      'ONEUP_CATEGORY_ID not set — run GET /api/listcategory with your OneUp API key to find it, see docs/oneup-integration.md',
    );
  }

  const queued = db.socialPosts.queued();
  if (queued.length === 0) return [];

  const accounts = await listOneUpAccounts(env, fetchImpl);
  const outcomes: PublishOutcome[] = [];

  for (const post of queued) {
    const { socialNetworkIds, unmatched } = resolveSocialNetworkIds(post.platforms, accounts);
    if (socialNetworkIds.length === 0) {
      db.socialPosts.setStatus(post.id, 'failed');
      outcomes.push({
        postId: post.id,
        ok: false,
        reason: `No connected OneUp account matches: ${unmatched.join(', ')}`,
      });
      continue;
    }

    try {
      const result = await publishOneUpPost(
        env,
        {
          categoryId,
          socialNetworkIds,
          scheduledDateTime: oneUpScheduleTime(post, now),
          content: post.caption,
          imageUrl: post.mediaUrl ?? undefined,
        },
        fetchImpl,
      );
      db.socialPosts.setStatus(post.id, 'published');
      outcomes.push({
        postId: post.id,
        ok: true,
        message: unmatched.length > 0 ? `${result.message} (skipped, no match: ${unmatched.join(', ')})` : result.message,
      });
    } catch (err) {
      db.socialPosts.setStatus(post.id, 'failed');
      outcomes.push({ postId: post.id, ok: false, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return outcomes;
}

export type OneUpFailedPostsResult = { ok: true; posts: OneUpFailedPost[] } | { ok: false; error: string };

/**
 * Real failed-post detail straight from OneUp's own /getfailedposts feed
 * (lib/connectors/oneup.ts's listOneUpFailedPosts — had zero callers
 * anywhere in the app until this fix). This is the only place a post's real
 * fail_reason survives once the triggering agent run finishes:
 * `publishQueuedSocialPosts` above marks a post 'failed' in our own queue
 * immediately, but AgentRunSchema never persists a run's per-post `data`,
 * only its one-line `summary` string — so a queued post that OneUp itself
 * rejects (platform mismatch, a malformed field, etc.) used to vanish from
 * the operator's view entirely beyond that truncated /agents summary line.
 * Never throws: a network/API failure surfaces as an honest
 * `{ ok: false, error }` for the caller to render inline, same as every
 * other connector call in this app — not a hidden section and not a fake
 * empty list.
 */
export async function fetchOneUpFailedPosts(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<OneUpFailedPostsResult> {
  try {
    const posts = await listOneUpFailedPosts(env, fetchImpl);
    return { ok: true, posts };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
