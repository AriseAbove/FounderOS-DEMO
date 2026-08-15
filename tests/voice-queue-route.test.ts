import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { POST, GET } from '@/app/api/voice/queue/route';

// The voice-relay endpoint behind Zoey's speaker daemon: any Claude session
// (cloud or on-device) POSTs a short reply here, and Sean's Mac polls it
// with GET — no device-folder grant needed every new cloud session. Gated
// by VOICE_RELAY_SECRET the same way the Chief of Staff cron route is
// gated by CRON_SECRET (see app/api/cron/chief-of-staff/route.ts).
describe('/api/voice/queue', () => {
  const prevSecret = process.env.VOICE_RELAY_SECRET;
  const prevDb = process.env.FOUNDER_OS_DB;

  beforeEach(() => {
    process.env.VOICE_RELAY_SECRET = 'test-secret';
    process.env.FOUNDER_OS_DB = ':memory:';
  });
  afterEach(() => {
    if (prevSecret === undefined) delete process.env.VOICE_RELAY_SECRET;
    else process.env.VOICE_RELAY_SECRET = prevSecret;
    if (prevDb === undefined) delete process.env.FOUNDER_OS_DB;
    else process.env.FOUNDER_OS_DB = prevDb;
  });

  const post = (text: string, secret = 'test-secret') =>
    POST(
      new Request('http://test/api/voice/queue', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify({ text }),
      }),
    );
  const get = (secret = 'test-secret') =>
    GET(new Request('http://test/api/voice/queue', { headers: { authorization: `Bearer ${secret}` } }));

  test('rejects an unauthorized POST', async () => {
    const res = await post('hi', 'wrong');
    expect(res.status).toBe(401);
  });

  test('rejects an unauthorized GET', async () => {
    const res = await get('wrong');
    expect(res.status).toBe(401);
  });

  test('returns 501 with a setup hint when VOICE_RELAY_SECRET is not configured', async () => {
    delete process.env.VOICE_RELAY_SECRET;
    const res = await post('hi', 'anything');
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toMatch(/VOICE_RELAY_SECRET/);
  });

  test('a queued reply comes back out on GET, then the queue is empty again', async () => {
    const posted = await post('Done, sent to voice.');
    expect(posted.status).toBe(200);
    const postedBody = await posted.json();
    expect(postedBody.ok).toBe(true);

    const first = await get();
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.item.text).toBe('Done, sent to voice.');

    const second = await get();
    const secondBody = await second.json();
    expect(secondBody.item).toBeNull();
  });

  test('rejects a POST with no text', async () => {
    const res = await post('');
    expect(res.status).toBe(400);
  });
});
