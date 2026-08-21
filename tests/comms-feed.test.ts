import { describe, expect, test } from 'vitest';
import { gatherCommsFeed } from '@/lib/comms-feed';

const BARE: Record<string, string | undefined> = {};

function alloPage(data: unknown[]) {
  return JSON.stringify({ data, pagination: { has_more: false } });
}

describe('gatherCommsFeed — Allo calls + SMS join the unified feed', () => {
  test('no email inboxes and no ALLO_API_KEY -> an honest empty feed, never a throw', async () => {
    const feed = await gatherCommsFeed(40, BARE);
    expect(feed).toEqual([]);
  });

  test('ALLO_API_KEY set: calls and SMS both merge into the feed, newest first', async () => {
    const env = { ALLO_API_KEY: 'allo-test-key' };
    const fakeFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.type === 'CALL') {
        return new Response(
          alloPage([
            {
              id: 'cll-1',
              direction: 'INBOUND',
              contact_number: '+12485551234',
              contacts: [{ name: 'Sarah Johnson' }],
              date: '2026-08-12T14:03:00Z',
              result: 'ANSWERED',
              summary: 'Kitchen remodel inquiry.',
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(
        alloPage([
          {
            id: 'sms-1',
            direction: 'INBOUND',
            contact_number: '+12485559876',
            date: '2026-08-12T15:00:00Z',
            content: 'Can you call me back?',
          },
        ]),
        { status: 200 },
      );
    };

    const feed = await gatherCommsFeed(40, env, fakeFetch);
    const sources = feed.map((i) => i.source);
    expect(sources).toContain('call');
    expect(sources).toContain('sms');
    // newest first: the 15:00 SMS sorts ahead of the 14:03 call
    expect(feed[0].source).toBe('sms');

    const call = feed.find((i) => i.source === 'call')!;
    expect(call.preview).toBe('Kitchen remodel inquiry.');
    expect(call.replyTo).toBe('tel:+12485551234');

    const sms = feed.find((i) => i.source === 'sms')!;
    expect(sms.preview).toBe('Can you call me back?');
    expect(sms.replyTo).toBe('sms:+12485559876');
  });

  test('a failed Allo pull degrades to no call/sms items instead of throwing', async () => {
    const env = { ALLO_API_KEY: 'allo-test-key' };
    const failFetch: typeof fetch = async () => new Response('nope', { status: 500 });
    const feed = await gatherCommsFeed(40, env, failFetch);
    expect(feed).toEqual([]);
  });
});
