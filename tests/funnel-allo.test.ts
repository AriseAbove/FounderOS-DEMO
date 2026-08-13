import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { importAlloCalls, normalizePhoneKey, looksLikeSpam } from '@/lib/funnel-allo';
import type { AlloCall } from '@/lib/connectors/allo';

let db: FounderDb;
afterEach(() => db?.close());

const NOW = new Date('2026-08-13T12:00:00Z');

function call(overrides: Partial<AlloCall>): AlloCall {
  return {
    id: 'call-1',
    from: '+12485551234',
    to: '+12487171417',
    direction: 'inbound',
    result: 'answered',
    summary: 'Kitchen remodel inquiry, Southfield. Wants a walk-through.',
    contactName: null,
    durationSeconds: 180,
    startedAt: '2026-08-12T14:03:00Z',
    recordingUrl: null,
    ...overrides,
  };
}

function freshDb(): FounderDb {
  const d = openDb(':memory:');
  seedDatabase(d);
  return d;
}

describe('normalizePhoneKey', () => {
  test('strips formatting and the US country code', () => {
    expect(normalizePhoneKey('+1 (248) 555-1234')).toBe('2485551234');
    expect(normalizePhoneKey('2485551234')).toBe('2485551234');
    expect(normalizePhoneKey('12485551234')).toBe('2485551234');
  });
  test('returns null for unusable values', () => {
    expect(normalizePhoneKey(null)).toBeNull();
    expect(normalizePhoneKey('anonymous')).toBeNull();
  });
});

describe('looksLikeSpam — Zoey already kills spam; the importer keeps the rest out', () => {
  test('spam/blocked results are spam', () => {
    expect(looksLikeSpam(call({ result: 'spam' }))).toBe(true);
    expect(looksLikeSpam(call({ result: 'Blocked' }))).toBe(true);
  });
  test('instant hangups with no summary are spam', () => {
    expect(looksLikeSpam(call({ durationSeconds: 4, summary: null }))).toBe(true);
  });
  test('a real inquiry is not spam', () => {
    expect(looksLikeSpam(call({}))).toBe(false);
  });
  test('a short call WITH a summary is kept — Zoey collects fast', () => {
    expect(looksLikeSpam(call({ durationSeconds: 12 }))).toBe(false);
  });
});

describe('importAlloCalls', () => {
  test('a new caller becomes an AAC journey at inquiry with a call touch', () => {
    db = freshDb();
    const res = importAlloCalls(db, [call({})], NOW);
    expect(res.newContacts).toBe(1);

    const [j] = db.funnel.journeys('aac');
    expect(j.status).toBe('inquiry');
    expect(j.business).toBe('aac');
    expect(j.phone).toBe('+12485551234');
    expect(j.name).toBe('(248) 555-1234'); // no contact name → formatted number
    expect(j.touches).toHaveLength(1);
    expect(j.touches[0]).toMatchObject({
      channel: 'call',
      source: 'allo',
      stage: 'inquiry',
      at: '2026-08-12',
    });
    expect(j.touches[0].label).toContain('Kitchen remodel');
  });

  test('uses the Allo contact name when present', () => {
    db = freshDb();
    importAlloCalls(db, [call({ contactName: 'Jane Doe' })], NOW);
    expect(db.funnel.journeys('aac')[0].name).toBe('Jane Doe');
  });

  test('a repeat call from the same number adds a touch, not a duplicate journey', () => {
    db = freshDb();
    importAlloCalls(db, [call({})], NOW);
    const res = importAlloCalls(
      db,
      [call({ id: 'call-2', startedAt: '2026-08-13T09:00:00Z', summary: 'Called back about timing.' })],
      NOW,
    );
    expect(res.newContacts).toBe(0);
    expect(res.newTouches).toBe(1);
    const journeys = db.funnel.journeys('aac');
    expect(journeys).toHaveLength(1);
    expect(journeys[0].touches.map((t) => t.seq)).toEqual([1, 2]);
  });

  test('re-syncing the same call id is a no-op — idempotent by call id', () => {
    db = freshDb();
    importAlloCalls(db, [call({})], NOW);
    const res = importAlloCalls(db, [call({})], NOW);
    expect(res.newContacts).toBe(0);
    expect(res.newTouches).toBe(0);
    expect(db.funnel.journeys('aac')[0].touches).toHaveLength(1);
  });

  test('a repeat call never regresses the journey stage', () => {
    db = freshDb();
    importAlloCalls(db, [call({})], NOW);
    const { touches: _touches, ...contact } = db.funnel.journeys('aac')[0];
    db.funnel.insertContact({ ...contact, status: 'estimate_sent' });
    importAlloCalls(db, [call({ id: 'call-3', summary: 'Question about the estimate.' })], NOW);
    const after = db.funnel.journeys('aac')[0];
    expect(after.status).toBe('estimate_sent');
    expect(after.touches.at(-1)?.stage).toBe('estimate_sent');
  });

  test('skips spam, outbound legs, and callers with no number', () => {
    db = freshDb();
    const res = importAlloCalls(
      db,
      [
        call({ id: 's1', result: 'spam' }),
        call({ id: 's2', direction: 'outbound' }),
        call({ id: 's3', from: null }),
      ],
      NOW,
    );
    expect(res.newContacts).toBe(0);
    expect(res.skipped).toBe(3);
    expect(db.funnel.journeys('aac')).toHaveLength(0);
  });

  test('falls back to the sync date when the call has no timestamp', () => {
    db = freshDb();
    importAlloCalls(db, [call({ startedAt: null })], NOW);
    expect(db.funnel.journeys('aac')[0].touches[0].at).toBe('2026-08-13');
  });
});
