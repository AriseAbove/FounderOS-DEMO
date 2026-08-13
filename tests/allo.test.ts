import { describe, expect, test } from 'vitest';
import {
  ALLO_SEARCH_URL,
  alloConfigured,
  alloStatus,
  fetchAlloCalls,
  normalizeAlloCall,
  type AlloCall,
} from '@/lib/connectors/allo';

const KEYED = { ALLO_API_KEY: 'allo-test-key' };
const BARE: Record<string, string | undefined> = {};

describe('alloConfigured', () => {
  test('false without ALLO_API_KEY, true with it', () => {
    expect(alloConfigured(BARE)).toBe(false);
    expect(alloConfigured(KEYED)).toBe(true);
  });
});

describe('alloStatus — honest states only', () => {
  test('not_configured without a key, and says which env var to set', async () => {
    const s = await alloStatus(BARE);
    expect(s.id).toBe('allo');
    expect(s.state).toBe('not_configured');
    expect(s.detail).toContain('ALLO_API_KEY');
  });

  test('connected when the key is set', async () => {
    const s = await alloStatus(KEYED);
    expect(s.state).toBe('connected');
    expect(s.kind).toBe('crm');
  });
});

describe('normalizeAlloCall — the v2 conversation-item shape', () => {
  test('maps a v2 payload (contact_number, allo_number, date, contacts[])', () => {
    const call = normalizeAlloCall({
      id: 'cll-abc123',
      type: 'CALL',
      direction: 'INBOUND',
      allo_number: '+12487171417',
      contact_number: '+12485551234',
      contacts: [{ id: 'cnt-1', name: 'Sarah Johnson' }],
      date: '2026-08-12T14:03:00Z',
      duration: 145,
      result: 'ANSWERED',
      recording_url: 'https://storage.withallo.com/recordings/cll-abc123.mp3',
      summary: 'Kitchen remodel inquiry — wants a walk-through next week.',
    });
    expect(call).toEqual<AlloCall>({
      id: 'cll-abc123',
      from: '+12485551234',
      to: '+12487171417',
      direction: 'inbound',
      result: 'ANSWERED',
      summary: 'Kitchen remodel inquiry — wants a walk-through next week.',
      contactName: 'Sarah Johnson',
      durationSeconds: 145,
      startedAt: '2026-08-12T14:03:00Z',
      recordingUrl: 'https://storage.withallo.com/recordings/cll-abc123.mp3',
    });
  });

  test('tolerates older field spellings (callId, from_number, aiSummary, createdAt)', () => {
    const call = normalizeAlloCall({
      callId: 'c9',
      from_number: '2485559876',
      call_type: 'incoming',
      aiSummary: 'Bathroom gut, Southfield.',
      created_at: '2026-08-11T09:00:00Z',
    })!;
    expect(call).not.toBeNull();
    expect(call.id).toBe('c9');
    expect(call.from).toBe('2485559876');
    expect(call.direction).toBe('inbound');
    expect(call.summary).toBe('Bathroom gut, Southfield.');
    expect(call.startedAt).toBe('2026-08-11T09:00:00Z');
  });

  test('returns null when there is no usable id', () => {
    expect(normalizeAlloCall({ contact_number: '+12485551234' })).toBeNull();
  });
});

const ITEM = {
  id: 'cll-1',
  direction: 'INBOUND',
  contact_number: '+12485551234',
  date: '2026-08-12T14:03:00Z',
};

function page(data: unknown[], hasMore: boolean) {
  return JSON.stringify({ data, pagination: { has_more: hasMore } });
}

describe('fetchAlloCalls — real v2 HTTP contract, injectable fetch', () => {
  test('POSTs the search body with the API key in the Authorization header', async () => {
    let seenUrl = '';
    let seenAuth = '';
    let seenBody: any = null;
    const fakeFetch: typeof fetch = async (url, init) => {
      seenUrl = String(url);
      seenAuth = String(new Headers(init?.headers).get('authorization'));
      seenBody = JSON.parse(String(init?.body));
      return new Response(page([], false), { status: 200 });
    };
    await fetchAlloCalls(KEYED, fakeFetch);
    expect(seenUrl).toBe(ALLO_SEARCH_URL);
    expect(seenAuth).toBe('allo-test-key');
    expect(seenBody).toMatchObject({ type: 'CALL', sort: 'DATE_DESC', page: 1 });
  });

  test('retries once with the Api-Key prefix when the bare key is rejected', async () => {
    const auths: string[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      const auth = String(new Headers(init?.headers).get('authorization'));
      auths.push(auth);
      return auth.startsWith('Api-Key ')
        ? new Response(page([ITEM], false), { status: 200 })
        : new Response('unauthorized', { status: 401 });
    };
    const calls = await fetchAlloCalls(KEYED, fakeFetch);
    expect(auths).toEqual(['allo-test-key', 'Api-Key allo-test-key']);
    expect(calls.map((c) => c.id)).toEqual(['cll-1']);
  });

  test('follows pagination until has_more is false', async () => {
    let n = 0;
    const fakeFetch: typeof fetch = async () => {
      n += 1;
      return new Response(page([{ ...ITEM, id: `cll-${n}` }], n < 3), { status: 200 });
    };
    const calls = await fetchAlloCalls(KEYED, fakeFetch);
    expect(calls.map((c) => c.id)).toEqual(['cll-1', 'cll-2', 'cll-3']);
  });

  test('throws an honest error without a key — never a silent empty result', async () => {
    await expect(fetchAlloCalls(BARE, async () => new Response('[]'))).rejects.toThrow(/ALLO_API_KEY/);
  });

  test('throws on a non-200 with the status in the message', async () => {
    const fakeFetch: typeof fetch = async () => new Response('nope', { status: 429 });
    await expect(fetchAlloCalls(KEYED, fakeFetch)).rejects.toThrow(/429/);
  });
});
