import { describe, expect, test } from 'vitest';
import {
  ALLO_CALLS_URL,
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

describe('normalizeAlloCall — tolerant of Allo payload field naming', () => {
  test('maps a canonical payload', () => {
    const call = normalizeAlloCall({
      id: 'call_123',
      from: '+12485551234',
      to: '+12487171417',
      direction: 'inbound',
      result: 'answered',
      summary: 'Kitchen remodel inquiry — wants a walk-through next week.',
      contact_name: 'Jane Doe',
      duration: 184,
      started_at: '2026-08-12T14:03:00Z',
    });
    expect(call).toEqual<AlloCall>({
      id: 'call_123',
      from: '+12485551234',
      to: '+12487171417',
      direction: 'inbound',
      result: 'answered',
      summary: 'Kitchen remodel inquiry — wants a walk-through next week.',
      contactName: 'Jane Doe',
      durationSeconds: 184,
      startedAt: '2026-08-12T14:03:00Z',
      recordingUrl: null,
    });
  });

  test('accepts alternate field spellings (callId, from_number, aiSummary, createdAt)', () => {
    const call = normalizeAlloCall({
      callId: 'c9',
      from_number: '2485559876',
      type: 'incoming',
      aiSummary: 'Bathroom gut, Southfield.',
      createdAt: '2026-08-11T09:00:00Z',
      recording_url: 'https://cdn.withallo.com/rec/c9.mp3',
    })!;
    expect(call).not.toBeNull();
    expect(call.id).toBe('c9');
    expect(call.from).toBe('2485559876');
    expect(call.direction).toBe('inbound');
    expect(call.summary).toBe('Bathroom gut, Southfield.');
    expect(call.startedAt).toBe('2026-08-11T09:00:00Z');
    expect(call.recordingUrl).toBe('https://cdn.withallo.com/rec/c9.mp3');
  });

  test('returns null when there is no usable id', () => {
    expect(normalizeAlloCall({ from: '+12485551234' })).toBeNull();
  });
});

describe('fetchAlloCalls — real HTTP contract, injectable fetch', () => {
  test('sends the API key in the Authorization header to the calls endpoint', async () => {
    let seenUrl = '';
    let seenAuth = '';
    const fakeFetch: typeof fetch = async (url, init) => {
      seenUrl = String(url);
      seenAuth = String(new Headers(init?.headers).get('authorization'));
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };
    await fetchAlloCalls(KEYED, fakeFetch);
    expect(seenUrl).toBe(ALLO_CALLS_URL);
    expect(seenAuth).toBe('allo-test-key');
  });

  test.each([
    ['bare array', [{ id: 'a', from: '+1', started_at: '2026-08-01T00:00:00Z' }]],
    ['data envelope', { data: [{ id: 'a', from: '+1', started_at: '2026-08-01T00:00:00Z' }] }],
    ['calls envelope', { calls: [{ id: 'a', from: '+1', started_at: '2026-08-01T00:00:00Z' }] }],
  ])('unwraps the %s response shape', async (_label, body) => {
    const fakeFetch: typeof fetch = async () => new Response(JSON.stringify(body), { status: 200 });
    const calls = await fetchAlloCalls(KEYED, fakeFetch);
    expect(calls.map((c) => c.id)).toEqual(['a']);
  });

  test('throws an honest error without a key — never a silent empty result', async () => {
    await expect(fetchAlloCalls(BARE, async () => new Response('[]'))).rejects.toThrow(/ALLO_API_KEY/);
  });

  test('throws on a non-200 with the status in the message', async () => {
    const fakeFetch: typeof fetch = async () => new Response('nope', { status: 429 });
    await expect(fetchAlloCalls(KEYED, fakeFetch)).rejects.toThrow(/429/);
  });
});
