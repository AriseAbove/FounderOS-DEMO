import type { ConnectorStatus } from '@/lib/connectors/types';

/**
 * Allo — AAC's AI receptionist (Zoey) at (248) 717-1417. Every inbound lead
 * call lands in Allo's call log first, which makes it the funnel's front
 * door. This connector reads that log through Allo's REST API
 * (https://www.withallo.com/api): a scoped API key (CONVERSATIONS_READ)
 * pasted into ALLO_API_KEY, sent as the Authorization header verbatim.
 *
 * Honest status only: no key → not_configured, and a failed pull throws
 * with the real HTTP status — never a silent empty call log.
 */

export const ALLO_API_BASE = 'https://api.withallo.com/v1/api';
export const ALLO_CALLS_URL = `${ALLO_API_BASE}/calls`;

export type AlloCall = {
  id: string;
  from: string | null;
  to: string | null;
  direction: 'inbound' | 'outbound' | 'unknown';
  result: string | null; // answered / missed / voicemail / spam … as Allo reports it
  summary: string | null; // Zoey's AI call summary
  contactName: string | null;
  durationSeconds: number | null;
  startedAt: string | null; // ISO timestamp
  recordingUrl: string | null;
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
        'Set ALLO_API_KEY (Allo web → settings → API keys, CONVERSATIONS_READ scope) to pull the (248) 717-1417 call log into the funnel.',
    };
  }
  return {
    ...base,
    state: 'connected',
    detail: 'API key set — inbound calls sync into the AAC pipeline via /api/funnel/sync-allo.',
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

/**
 * Map one raw Allo call object into AlloCall. Tolerant of field-name drift
 * (the public API is young) — every alias observed in Allo's docs and
 * webhook examples is accepted. Returns null when there's no usable id.
 */
export function normalizeAlloCall(raw: unknown): AlloCall | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = str(pick(r, ['id', 'callId', 'call_id', 'uuid']));
  if (!id) return null;

  const directionRaw = str(pick(r, ['direction', 'type', 'call_type']))?.toLowerCase() ?? '';
  const direction: AlloCall['direction'] = /in(bound|coming)/.test(directionRaw)
    ? 'inbound'
    : /out(bound|going)/.test(directionRaw)
      ? 'outbound'
      : 'unknown';

  return {
    id,
    from: str(pick(r, ['from', 'from_number', 'fromNumber', 'caller', 'caller_number'])),
    to: str(pick(r, ['to', 'to_number', 'toNumber'])),
    direction,
    result: str(pick(r, ['result', 'status', 'call_result', 'outcome'])),
    summary: str(pick(r, ['summary', 'ai_summary', 'aiSummary'])),
    contactName: str(pick(r, ['contact_name', 'contactName', 'name'])),
    durationSeconds: num(pick(r, ['duration', 'duration_seconds', 'durationSeconds'])),
    startedAt: str(pick(r, ['started_at', 'startedAt', 'timestamp', 'created_at', 'createdAt'])),
    recordingUrl: str(pick(r, ['recording_url', 'recordingUrl', 'recording'])),
  };
}

/* ---------- HTTP ---------- */

/** Pull the call log. The response envelope varies ({data}, {calls}, or a
    bare array) — all three unwrap to the same normalized list. */
export async function fetchAlloCalls(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<AlloCall[]> {
  const key = env.ALLO_API_KEY;
  if (!key) throw new Error('ALLO_API_KEY not set — cannot pull the Allo call log');

  const res = await fetchImpl(ALLO_CALLS_URL, {
    headers: { Authorization: key, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Allo API responded ${res.status} on GET /calls`);

  const body: unknown = await res.json();
  const list: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { data?: unknown[] })?.data)
      ? (body as { data: unknown[] }).data
      : Array.isArray((body as { calls?: unknown[] })?.calls)
        ? (body as { calls: unknown[] }).calls
        : [];

  return list.map(normalizeAlloCall).filter((c): c is AlloCall => c !== null);
}
