import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { POST, GET } from '@/app/api/aac-brain/route';

// The AAC Brain health relay: ~/.aac_brain/stateio.py's heartbeat() on
// Sean's Mac POSTs a snapshot here (pending drafted actions, failing
// workers), the dashboard tile / /aac-brain page read the latest snapshot
// back. Gated by AAC_BRAIN_SECRET the same way voice/queue is gated by
// VOICE_RELAY_SECRET (see tests/voice-queue-route.test.ts).
describe('/api/aac-brain', () => {
  const prevSecret = process.env.AAC_BRAIN_SECRET;
  const prevDb = process.env.FOUNDER_OS_DB;

  beforeEach(() => {
    process.env.AAC_BRAIN_SECRET = 'test-secret';
    process.env.FOUNDER_OS_DB = ':memory:';
  });
  afterEach(() => {
    if (prevSecret === undefined) delete process.env.AAC_BRAIN_SECRET;
    else process.env.AAC_BRAIN_SECRET = prevSecret;
    if (prevDb === undefined) delete process.env.FOUNDER_OS_DB;
    else process.env.FOUNDER_OS_DB = prevDb;
  });

  const snapshot = {
    pendingActions: 189,
    failingWorkers: 3,
    totalWorkers: 11,
    topFailures: [{ worker: 'goal-scoreboard', count: 24, lastFailureAt: '2026-08-17T11:00:40.559Z' }],
    lastDailySummaryDate: '2026-08-18',
    reportedAt: '2026-08-20T07:00:00.000Z',
  };

  const post = (body: unknown, secret = 'test-secret') =>
    POST(
      new Request('http://test/api/aac-brain', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(body),
      }),
    );
  const get = (secret = 'test-secret') =>
    GET(new Request('http://test/api/aac-brain', { headers: { authorization: `Bearer ${secret}` } }));

  // Must run before any test below posts a snapshot — getDb() is a
  // module-level singleton for the life of this test file, so once any
  // other test writes a row, GET would honestly (and correctly) stop
  // returning null; this checks the true first-ever-heartbeat state.
  test('GET returns a null snapshot before any heartbeat has ever been posted', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.snapshot).toBeNull();
  });

  test('rejects an unauthorized POST', async () => {
    const res = await post(snapshot, 'wrong');
    expect(res.status).toBe(401);
  });

  test('rejects an unauthorized GET', async () => {
    const res = await get('wrong');
    expect(res.status).toBe(401);
  });

  test('returns 501 with a setup hint when AAC_BRAIN_SECRET is not configured', async () => {
    delete process.env.AAC_BRAIN_SECRET;
    const res = await post(snapshot, 'anything');
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toMatch(/AAC_BRAIN_SECRET/);
  });

  test('rejects a malformed snapshot', async () => {
    const res = await post({ pendingActions: 'not a number' });
    expect(res.status).toBe(400);
  });

  test('a posted snapshot comes back out on GET, and a second post overwrites it', async () => {
    const posted = await post(snapshot);
    expect(posted.status).toBe(200);
    const postedBody = await posted.json();
    expect(postedBody.ok).toBe(true);

    const first = await get();
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.snapshot.pendingActions).toBe(189);
    expect(firstBody.snapshot.failingWorkers).toBe(3);
    expect(firstBody.snapshot.topFailures[0].worker).toBe('goal-scoreboard');
    expect(typeof firstBody.snapshot.receivedAt).toBe('string');

    await post({ ...snapshot, pendingActions: 5, failingWorkers: 0, topFailures: [] });
    const second = await get();
    const secondBody = await second.json();
    expect(secondBody.snapshot.pendingActions).toBe(5);
    expect(secondBody.snapshot.failingWorkers).toBe(0);
  });
});
