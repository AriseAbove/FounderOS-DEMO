import { describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import {
  gatherSignals,
  briefingText,
  newHighSeveritySignals,
  markNotified,
  sendNtfyPush,
  type Signal,
} from '@/lib/chief-of-staff';
import type { FunnelContact, FunnelTouch } from '@/lib/schemas';

function seedJourney(db: FounderDb, overrides: Partial<FunnelContact> = {}, touchAt = '2026-08-10'): void {
  const contact: FunnelContact = {
    id: overrides.id ?? 'c-1',
    name: overrides.name ?? 'Test Lead',
    business: 'aac',
    status: overrides.status ?? 'estimate_sent',
    product: 'Kitchen remodel',
    amountUsd: 25000,
    relationship: 'warm',
    likelihood: overrides.likelihood ?? 80,
    url: null,
    email: null,
    phone: null,
    person: null,
    company: null,
    role: null,
    linkedin: null,
    createdAt: '2026-08-01',
    ...overrides,
  };
  db.funnel.insertContact(contact);
  const touch: FunnelTouch = {
    id: `${contact.id}-t1`,
    contactId: contact.id,
    seq: 1,
    stage: contact.status,
    channel: 'call',
    label: 'touch',
    source: 'manual',
    at: touchAt,
  };
  db.funnel.insertTouch(touch);
}

describe('gatherSignals', () => {
  test('a hot, recently-touched lead becomes a high-severity push signal', async () => {
    const db = openDb(':memory:');
    seedJourney(db, { id: 'hot-1', likelihood: 85 }, '2026-08-13');
    const signals = await gatherSignals(db, {}, new Date('2026-08-14T00:00:00Z'));
    expect(signals.some((s) => s.category === 'lead' && s.severity === 'high' && s.id === 'lead-push-hot-1')).toBe(true);
    db.close();
  });

  test('no leads, no QuickBooks, no comms configured — comes back empty, not throwing', async () => {
    const db = openDb(':memory:');
    const signals = await gatherSignals(db, {}, new Date('2026-08-14T00:00:00Z'));
    expect(signals).toEqual([]);
    db.close();
  });

  test('a won journey never becomes a signal', async () => {
    const db = openDb(':memory:');
    seedJourney(db, { id: 'won-1', status: 'contract_signed', likelihood: 95 }, '2026-08-13');
    const signals = await gatherSignals(db, {}, new Date('2026-08-14T00:00:00Z'));
    expect(signals.some((s) => s.id.includes('won-1'))).toBe(false);
    db.close();
  });
});

describe('briefingText (deterministic, no-AI fallback)', () => {
  test('summarizes counts by category and severity', () => {
    const signals: Signal[] = [
      { id: 'a', category: 'lead', severity: 'high', summary: 'x' },
      { id: 'b', category: 'lead', severity: 'high', summary: 'y' },
      { id: 'c', category: 'invoice', severity: 'high', summary: 'z' },
      { id: 'd', category: 'comms', severity: 'medium', summary: 'w' },
    ];
    const text = briefingText(signals);
    expect(text).toContain('2 hot lead');
    expect(text).toContain('1 overdue invoice');
    expect(text).toContain('1 work email');
  });

  test('nothing outstanding says so honestly', () => {
    expect(briefingText([])).toBe('Nothing needs your attention right now.');
  });
});

describe('newHighSeveritySignals / markNotified (dedupe across runs)', () => {
  test('first run treats every high-severity signal as new', () => {
    const db = openDb(':memory:');
    const signals: Signal[] = [{ id: 'lead-push-1', category: 'lead', severity: 'high', summary: 'x' }];
    expect(newHighSeveritySignals(db, signals)).toEqual(signals);
    db.close();
  });

  test('a signal already notified does not fire again on the next run', () => {
    const db = openDb(':memory:');
    const signals: Signal[] = [{ id: 'lead-push-1', category: 'lead', severity: 'high', summary: 'x' }];
    markNotified(db, signals);
    expect(newHighSeveritySignals(db, signals)).toEqual([]);
    db.close();
  });

  test('a genuinely new signal alongside an already-known one only reports the new one', () => {
    const db = openDb(':memory:');
    const known: Signal = { id: 'lead-push-1', category: 'lead', severity: 'high', summary: 'x' };
    markNotified(db, [known]);
    const fresh: Signal = { id: 'invoice-9', category: 'invoice', severity: 'high', summary: 'y' };
    expect(newHighSeveritySignals(db, [known, fresh])).toEqual([fresh]);
    db.close();
  });

  test('medium-severity signals never trigger a push, even when new', () => {
    const db = openDb(':memory:');
    const signals: Signal[] = [{ id: 'lead-save-1', category: 'lead', severity: 'medium', summary: 'x' }];
    expect(newHighSeveritySignals(db, signals)).toEqual([]);
    db.close();
  });
});

describe('sendNtfyPush', () => {
  test('honest no-op when NTFY_TOPIC is not set', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 200 });
    };
    const result = await sendNtfyPush({}, 'Title', 'body', fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ sent: false, reason: 'NTFY_TOPIC not set' });
    expect(calls).toEqual([]);
  });

  test('posts to the configured ntfy topic with title + body', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 200 });
    };
    const result = await sendNtfyPush(
      { NTFY_TOPIC: 'aac-cos-abc123' },
      'Chief of Staff',
      'Hot lead ready to push',
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({ sent: true, status: 200 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://ntfy.sh/aac-cos-abc123');
    expect((calls[0].init.headers as Record<string, string>).Title).toBe('Chief of Staff');
    expect(calls[0].init.body).toBe('Hot lead ready to push');
  });

  test('NTFY_URL overrides the default host (self-hosted ntfy)', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 200 });
    };
    await sendNtfyPush(
      { NTFY_TOPIC: 'aac-cos', NTFY_URL: 'https://ntfy.example.com' },
      'T',
      'B',
      fetchImpl as unknown as typeof fetch,
    );
    expect(calls[0]).toBe('https://ntfy.example.com/aac-cos');
  });

  test('reports honestly when the push itself fails', async () => {
    const fetchImpl = async () => new Response(null, { status: 503 });
    const result = await sendNtfyPush({ NTFY_TOPIC: 'x' }, 'T', 'B', fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ sent: false, status: 503 });
  });
});
