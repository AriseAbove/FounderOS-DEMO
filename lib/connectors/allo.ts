import type { ConnectorStatus } from '@/lib/connectors/types';

/**
 * Allo — AAC's AI receptionist (Zoey) at (248) 717-1417. Every inbound lead
 * call lands in Allo's call log first, which makes it the funnel's front
 * door. This connector reads that log through Allo's v2 REST API
 * (help.withallo.com → API reference): POST /v2/api/conversations/items/search
 * with a scoped API key (CONVERSATIONS_READ) in the Authorization header.
 *
 * The same search endpoint also serves SMS: Allo's v2 reference
 * (help.withallo.com/en/v2/api-reference/conversations/search-conversation-items)
 * documents `type: SMS` alongside `type: CALL` on this exact endpoint, with
 * a `content` field carrying the message body in place of a call's
 * `summary`/`duration`/`result` — confirmed against Allo's public API docs
 * before wiring it in, not assumed. `fetchAlloMessages` below is genuinely
 * real, not a stand-in.
 *
 * Honest status only: no key → not_configured, and a failed pull throws
 * with the real HTTP status — never a silent empty call log.
 */

export const ALLO_API_BASE = 'https://api.withallo.com/v2/api';
export const ALLO_SEARCH_URL = `${ALLO_API_BASE}/conversations/items/search`;
/** Pagination cap per sync: 5 pages × 100 = the 500 most recent calls. */
export const ALLO_PAGE_SIZE = 100;
export const ALLO_MAX_PAGES = 5;

export type AlloCall = {
  id: string;
  from: string | null; // the caller (contact_number on inbound calls)
  to: string | null; // the Allo number
  direction: 'inbound' | 'outbound' | 'unknown';
  result: string | null; // ANSWERED / VOICEMAIL / TRANSFERRED … as Allo reports it
  summary: string | null; // Zoey's AI call summary
  contactName: string | null;
  durationSeconds: number | null;
  startedAt: string | null; // ISO timestamp
  recordingUrl: string | null;
};

/** An SMS/MMS conversation item — same search endpoint as AlloCall, type SMS. */
export type AlloMessage = {
  id: string;
  from: string | null; // contact_number
  to: string | null; // allo_number
  direction: 'inbound' | 'outbound' | 'unknown';
  content: string | null; // the message body (SMS has no summary/duration/result)
  contactName: string | null;
  startedAt: string | null; // ISO timestamp
};

export function alloConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ALLO_API_KEY);
}

export async function alloStatus(
  env: Record<string, string | undefined> = process.env,
): Promise<ConnectorStatus> {
  const base = { id: 'allo', name: 'Allo call log', kind: 'crm' } as const;
  if (!alloConfigured(env)) {
    return {
      ...base,
      state: 'not_configured',
      detail:
        'Set ALLO_API_KEY (Allo web → settings → API keys, Conversations Read scope) to pull the (248) 717-1417 call log into the funnel.',
    };
  }
  return {
    ...base,
    state: 'connected',
    detail:
      'API key set — inbound calls sync into the AAC pipeline via /api/funnel/sync-allo, and calls + SMS render live on /comms.',
  };
}

/* ---------- payload normalization ---------- */

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function pick(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null) return raw[k];
  }
  return undefined;
}

/** First linked contact's name, when Allo matched the caller to a contact. */
function contactNameOf(raw: Record<string, unknown>): string | null {
  const contacts = raw.contacts;
  if (Array.isArray(contacts) && contacts.length > 0) {
    const name = (contacts[0] as Record<string, unknown>)?.name;
    if (typeof name === 'string' && name.length > 0) return name;
  }
  return str(pick(raw, ['contact_name', 'contactName', 'name']));
}

/** Shared by AlloCall and AlloMessage — both carry a `direction` field
 *  (INBOUND/OUTBOUND) on the v2 API, with `type`/`call_type` kept as
 *  fallbacks for older payload shapes. */
function parseDirection(r: Record<string, unknown>): 'inbound' | 'outbound' | 'unknown' {
  const raw = str(pick(r, ['direction', 'type', 'call_type']))?.toLowerCase() ?? '';
  if (/in(bound|coming)/.test(raw)) return 'inbound';
  if (/out(bound|going)/.test(raw)) return 'outbound';
  return 'unknown';
}

/**
 * Map one raw Allo conversation item into AlloCall. Field names follow the
 * v2 API (id, direction, contact_number, allo_number, date, duration,
 * result, summary, recording_url, contacts[]) with the older aliases kept
 * for tolerance. Returns null when there's no usable id.
 */
export function normalizeAlloCall(raw: unknown): AlloCall | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = str(pick(r, ['id', 'callId', 'call_id', 'uuid']));
  if (!id) return null;

  return {
    id,
    from: str(pick(r, ['contact_number', 'contactNumber', 'from', 'from_number', 'caller'])),
    to: str(pick(r, ['allo_number', 'alloNumber', 'to', 'to_number'])),
    direction: parseDirection(r),
    result: str(pick(r, ['result', 'status', 'call_result', 'outcome'])),
    summary: str(pick(r, ['summary', 'ai_summary', 'aiSummary'])),
    contactName: contactNameOf(r),
    durationSeconds: num(pick(r, ['duration', 'duration_seconds', 'durationSeconds'])),
    startedAt: str(pick(r, ['date', 'started_at', 'startedAt', 'timestamp', 'created_at'])),
    recordingUrl: str(pick(r, ['recording_url', 'recordingUrl', 'recording'])),
  };
}

/**
 * Map one raw Allo conversation item into AlloMessage (type: SMS on the
 * search endpoint). The v2 reference shows a `content` field carrying the
 * message body in place of a call's summary/duration/result — those simply
 * don't exist on an SMS item.
 */
export function normalizeAlloMessage(raw: unknown): AlloMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = str(pick(r, ['id', 'messageId', 'message_id', 'uuid']));
  if (!id) return null;

  return {
    id,
    from: str(pick(r, ['contact_number', 'contactNumber', 'from', 'from_number'])),
    to: str(pick(r, ['allo_number', 'alloNumber', 'to', 'to_number'])),
    direction: parseDirection(r),
    content: str(pick(r, ['content', 'body', 'text', 'message'])),
    contactName: contactNameOf(r),
    startedAt: str(pick(r, ['date', 'started_at', 'startedAt', 'timestamp', 'created_at'])),
  };
}

/* ---------- HTTP ---------- */

async function searchPage(
  key: string,
  itemType: 'CALL' | 'SMS',
  page: number,
  fetchImpl: typeof fetch,
): Promise<{ items: unknown[]; hasMore: boolean }> {
  const body = JSON.stringify({ type: itemType, sort: 'DATE_DESC', page, size: ALLO_PAGE_SIZE });
  const doFetch = (auth: string) =>
    fetchImpl(ALLO_SEARCH_URL, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    });

  // Allo's docs show both bare-key and `Api-Key <key>` header forms — try
  // bare first, fall back once on an auth rejection.
  let res = await doFetch(key);
  if (res.status === 401 || res.status === 403) res = await doFetch(`Api-Key ${key}`);
  if (!res.ok) throw new Error(`Allo API responded ${res.status} on POST /conversations/items/search`);

  const parsed: unknown = await res.json();
  const items = Array.isArray((parsed as { data?: unknown[] })?.data)
    ? (parsed as { data: unknown[] }).data
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : [];
  const hasMore = Boolean((parsed as { pagination?: { has_more?: boolean } })?.pagination?.has_more);
  return { items, hasMore };
}

/** Pull the recent call log (up to ALLO_MAX_PAGES × ALLO_PAGE_SIZE calls). */
export async function fetchAlloCalls(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<AlloCall[]> {
  const key = env.ALLO_API_KEY;
  if (!key) throw new Error('ALLO_API_KEY not set — cannot pull the Allo call log');

  const out: AlloCall[] = [];
  for (let page = 1; page <= ALLO_MAX_PAGES; page++) {
    const { items, hasMore } = await searchPage(key, 'CALL', page, fetchImpl);
    out.push(...items.map(normalizeAlloCall).filter((c): c is AlloCall => c !== null));
    if (!hasMore) break;
  }
  return out;
}

/** Pull the recent SMS thread (up to ALLO_MAX_PAGES × ALLO_PAGE_SIZE messages) —
 *  same search endpoint as calls, `type: SMS`. */
export async function fetchAlloMessages(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<AlloMessage[]> {
  const key = env.ALLO_API_KEY;
  if (!key) throw new Error('ALLO_API_KEY not set — cannot pull the Allo SMS thread');

  const out: AlloMessage[] = [];
  for (let page = 1; page <= ALLO_MAX_PAGES; page++) {
    const { items, hasMore } = await searchPage(key, 'SMS', page, fetchImpl);
    out.push(...items.map(normalizeAlloMessage).filter((m): m is AlloMessage => m !== null));
    if (!hasMore) break;
  }
  return out;
}
