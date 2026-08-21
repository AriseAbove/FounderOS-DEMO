import { beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb } from '@/lib/db';
import { recentActivity } from '@/lib/agents/activity';

function seed() {
  const db = openDb(':memory:');
  db.agentRuns.insert({ id: 'r1', agentId: 'data-agent', startedAt: '2026-06-12T01:00:00Z', finishedAt: '2026-06-12T01:00:01Z', ok: true, summary: 'ran the audit', pushFailed: false });
  db.agentMessages.insert({ id: 'm1', agentId: 'sales-agent', role: 'assistant', content: 'pipeline looks good', toolCalls: [], createdAt: '2026-06-12T02:00:00Z' });
  db.broadcasts.insert({ id: 'b1', message: 'status report', createdAt: '2026-06-12T03:00:00Z' });
  db.broadcasts.insertReply({ id: 'br1', broadcastId: 'b1', agentId: 'comms-agent', ok: true, reply: 'inbox clear', finishedAt: '2026-06-12T03:00:01Z' });
  return db;
}

describe('recentActivity', () => {
  test('merges runs, agent messages, and broadcast replies newest-first', () => {
    const events = recentActivity(seed(), 50);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.kind)).toEqual(['broadcast', 'message', 'run']);
    expect(events[0].agentId).toBe('comms-agent');
    expect(events[2].ok).toBe(true);
  });

  test('excludes user messages (the feed is what agents did)', () => {
    const db = seed();
    db.agentMessages.insert({ id: 'm2', agentId: 'sales-agent', role: 'user', content: 'hello?', toolCalls: [], createdAt: '2026-06-12T04:00:00Z' });
    const events = recentActivity(db, 50);
    expect(events.some((e) => e.summary === 'hello?')).toBe(false);
  });

  test('honors the limit, keeping the newest', () => {
    const events = recentActivity(seed(), 2);
    expect(events.map((e) => e.kind)).toEqual(['broadcast', 'message']);
  });

  // Regression: a run whose push genuinely failed (ok:true, pushFailed:true —
  // e.g. Chief of Staff's ntfy push) used to reach the /agents activity log
  // as a plain, unflagged "run" event indistinguishable from a fully healthy
  // one — only the FAIL badge (ok===false) rendered, and pushFailed was
  // dropped entirely on the way into ActivityEvent. The feed must carry the
  // signal through so the UI can flag it honestly instead of silently
  // reading as OK.
  test('a pushFailed run carries pushFailed through to its activity event', () => {
    const db = seed();
    db.agentRuns.insert({
      id: 'r-pf',
      agentId: 'chief-of-staff',
      startedAt: '2026-06-12T05:00:00Z',
      finishedAt: '2026-06-12T05:00:01Z',
      ok: true,
      summary: '3 new high-severity, push failed (fetch failed)',
      pushFailed: true,
    });
    const events = recentActivity(db, 50);
    const run = events.find((e) => e.kind === 'run' && e.agentId === 'chief-of-staff');
    expect(run).toBeDefined();
    expect(run?.ok).toBe(true);
    expect(run?.pushFailed).toBe(true);
  });

  test('a clean run does not carry a stray pushFailed:true', () => {
    const events = recentActivity(seed(), 50);
    const run = events.find((e) => e.kind === 'run' && e.agentId === 'data-agent');
    expect(run?.pushFailed).toBeFalsy();
  });
});

describe('GET /api/agents/activity', () => {
  beforeAll(() => {
    process.env.FOUNDER_OS_DB = path.join(mkdtempSync(path.join(tmpdir(), 'founder-os-activity-')), 'test.db');
  });

  test('returns an events array', async () => {
    const { GET } = await import('@/app/api/agents/activity/route');
    const res = await GET(new Request('http://localhost/api/agents/activity?limit=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
  });
});
