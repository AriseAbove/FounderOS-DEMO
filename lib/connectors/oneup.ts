import type { ConnectorStatus } from '@/lib/connectors/types';

/**
 * OneUp — social publishing + reviews (oneupapp.io). Every request carries
 * `apiKey` as a query parameter; OneUp has no header-auth mode (see
 * docs.oneupapp.io/docs/getting-started/authentication). Endpoints and
 * payload shapes below are cited directly from docs.oneupapp.io as of
 * 2026-08-13:
 *   - GET  /api/listcategory            — categories (client/workspace groupings)
 *   - GET  /api/listsocialaccounts      — connected accounts
 *   - GET  /api/getfailedposts          — failed posts + fail_reason
 *   - POST /api/scheduletextpost        — text-only post
 *   - POST /api/scheduleimagepost       — post with image_url
 *   - POST /api/schedulevideopost       — post with video_url
 *
 * Honest status only: no key -> not_configured. A key alone doesn't prove
 * it's valid (same pattern as lib/connectors/allo.ts) — real verification
 * happens the first time listOneUpAccounts()/publishOneUpPost() actually
 * calls the API, and those throw with OneUp's own error message rather than
 * masking a bad key or a rejected post.
 */

export const ONEUP_API_BASE = 'https://www.oneupapp.io/api';

export function oneupConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ONEUP_API_KEY);
}

export async function oneupStatus(
  env: Record<string, string | undefined> = process.env,
): Promise<ConnectorStatus> {
  const base = { id: 'oneup', name: 'OneUp', kind: 'social' } as const;
  if (!oneupConfigured(env)) {
    return {
      ...base,
      state: 'not_configured',
      detail: 'Set ONEUP_API_KEY (OneUp → Settings → API Access) to publish and monitor posts through OneUp.',
    };
  }
  return {
    ...base,
    state: 'connected',
    detail: 'API key set — social posting and post-status checks go through OneUp.',
  };
}

/* ---------- shared request plumbing ---------- */

class OneUpApiError extends Error {}

type OneUpEnvelope<T> = { message: string; error: boolean; data: T };

async function get<T>(
  env: Record<string, string | undefined>,
  path: string,
  params: Record<string, string> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const key = env.ONEUP_API_KEY;
  if (!key) throw new OneUpApiError('ONEUP_API_KEY not set — cannot call OneUp');

  const url = new URL(`${ONEUP_API_BASE}${path}`);
  url.searchParams.set('apiKey', key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new OneUpApiError(`OneUp ${path} failed: HTTP ${res.status}`);
  const body = (await res.json()) as OneUpEnvelope<T>;
  if (body.error) throw new OneUpApiError(`OneUp ${path} failed: ${body.message}`);
  return body.data;
}

async function post<T>(
  env: Record<string, string | undefined>,
  path: string,
  formParams: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<OneUpEnvelope<T>> {
  const key = env.ONEUP_API_KEY;
  if (!key) throw new OneUpApiError('ONEUP_API_KEY not set — cannot call OneUp');

  const body = new URLSearchParams({ apiKey: key, ...formParams });
  const res = await fetchImpl(`${ONEUP_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new OneUpApiError(`OneUp ${path} failed: HTTP ${res.status}`);
  const parsed = (await res.json()) as OneUpEnvelope<T>;
  if (parsed.error) throw new OneUpApiError(`OneUp ${path} failed: ${parsed.message}`);
  return parsed;
}

/* ---------- categories ---------- */

export type OneUpCategory = { id: string; name: string };

function normalizeOneUpCategory(raw: Record<string, unknown>): OneUpCategory {
  return { id: String(raw.id), name: String(raw.category_name ?? '') };
}

export async function listOneUpCategories(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<OneUpCategory[]> {
  const data = await get<Record<string, unknown>[]>(env, '/listcategory', {}, fetchImpl);
  return data.map(normalizeOneUpCategory);
}

/* ---------- connected accounts ---------- */

export type OneUpAccount = {
  id: string; // social_account_id — what publishOneUpPost's socialNetworkIds expects
  platform: string; // social_network_type, exactly as OneUp reports it (Facebook, Instagram, SnapChat, ...)
  name: string; // full_name
  username: string | null;
  needsRefresh: boolean;
};

export function normalizeOneUpAccount(raw: Record<string, unknown>): OneUpAccount {
  return {
    id: String(raw.social_account_id ?? ''),
    platform: String(raw.social_network_type ?? ''),
    name: String(raw.full_name ?? ''),
    username: typeof raw.username === 'string' && raw.username.length > 0 ? raw.username : null,
    needsRefresh: Boolean(raw.need_refresh),
  };
}

export async function listOneUpAccounts(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<OneUpAccount[]> {
  const data = await get<Record<string, unknown>[]>(env, '/listsocialaccounts', {}, fetchImpl);
  return data.map(normalizeOneUpAccount);
}

/* ---------- failed posts ---------- */

export type OneUpFailedPost = {
  postId: string;
  content: string;
  failReason: string | null;
  socialNetworkUsername: string | null;
  categoryName: string | null;
  createdAt: string | null;
};

export function normalizeOneUpFailedPost(raw: Record<string, unknown>): OneUpFailedPost {
  return {
    postId: String(raw.post_id ?? ''),
    content: String(raw.content ?? ''),
    failReason: typeof raw.fail_reason === 'string' && raw.fail_reason.length > 0 ? raw.fail_reason : null,
    socialNetworkUsername:
      typeof raw.social_network_username === 'string' && raw.social_network_username.length > 0
        ? raw.social_network_username
        : null,
    categoryName: typeof raw.category_name === 'string' && raw.category_name.length > 0 ? raw.category_name : null,
    createdAt: typeof raw.created_at === 'string' && raw.created_at.length > 0 ? raw.created_at : null,
  };
}

export async function listOneUpFailedPosts(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
  start = 0,
): Promise<OneUpFailedPost[]> {
  const data = await get<Record<string, unknown>[]>(
    env,
    '/getfailedposts',
    { start: String(start) },
    fetchImpl,
  );
  return data.map(normalizeOneUpFailedPost);
}

/* ---------- publishing ---------- */

export type PublishOneUpPostInput = {
  categoryId: string;
  /** OneUp social_account_id values (from listOneUpAccounts), or 'ALL'. */
  socialNetworkIds: string[] | 'ALL';
  /** 'YYYY-MM-DD HH:MM' (OneUp's account-timezone format) or 'timeslot'. */
  scheduledDateTime: string;
  content: string;
  title?: string;
  imageUrl?: string;
  videoUrl?: string;
  isDraft?: boolean;
};

function socialNetworkIdParam(ids: string[] | 'ALL'): string {
  return ids === 'ALL' ? 'ALL' : JSON.stringify(ids);
}

/**
 * Schedules one post via the matching OneUp endpoint (text / image / video,
 * chosen by which of imageUrl/videoUrl is set — a post must not set both).
 * Returns OneUp's own confirmation message; throws OneUp's own error text on
 * a bad key, a rejected media URL, or a malformed schedule time.
 */
export async function publishOneUpPost(
  env: Record<string, string | undefined>,
  input: PublishOneUpPostInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ message: string }> {
  if (input.imageUrl && input.videoUrl) {
    throw new OneUpApiError('publishOneUpPost: set imageUrl or videoUrl, not both');
  }

  const params: Record<string, string> = {
    category_id: input.categoryId,
    social_network_id: socialNetworkIdParam(input.socialNetworkIds),
    scheduled_date_time: input.scheduledDateTime,
    content: input.content,
  };
  if (input.title) params.title = input.title;
  if (input.isDraft) params.isDraftPost = 'true';

  let path = '/scheduletextpost';
  if (input.imageUrl) {
    path = '/scheduleimagepost';
    params.image_url = input.imageUrl;
  } else if (input.videoUrl) {
    path = '/schedulevideopost';
    params.video_url = input.videoUrl;
  }

  const result = await post<unknown[]>(env, path, params, fetchImpl);
  return { message: result.message };
}
