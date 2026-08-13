import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import type { OneUpAccount } from '@/lib/connectors/oneup';
import {
  matchesOneUpPlatform,
  resolveSocialNetworkIds,
  oneUpScheduleTime,
  publishQueuedSocialPosts,
} from '@/lib/social-oneup';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

const account = (over: Partial<OneUpAccount> = {}): OneUpAccount => ({
  id: 'acct-1',
  platform: 'Facebook',
  name: 'Arise Above Construction',
  username: null,
  needsRefresh: false,
  ...over,
});

describe('matchesOneUpPlatform', () => {
  test('matches on case-insensitive substring', () => {
    expect(matchesOneUpPlatform('facebook', 'Facebook')).toBe(true);
    expect(matchesOneUpPlatform('instagram', 'Instagram')).toBe(true);
    expect(matchesOneUpPlatform('googlebusiness', 'Google Business Profile')).toBe(true);
    expect(matchesOneUpPlatform('googlebusiness', 'GBP')).toBe(true);
  });

  test('does not cross-match unrelated platforms', () => {
    expect(matchesOneUpPlatform('facebook', 'Instagram')).toBe(false);
    expect(matchesOneUpPlatform('instagram', 'Facebook')).toBe(false);
    expect(matchesOneUpPlatform('twitter', 'SnapChat')).toBe(false);
  });
});

describe('resolveSocialNetworkIds', () => {
  test('maps every matched platform to its account id, dedupes', () => {
    const accounts = [
      account({ id: 'a1', platform: 'Facebook' }),
      account({ id: 'a2', platform: 'Instagram' }),
    ];
    const { socialNetworkIds, unmatched } = resolveSocialNetworkIds(['facebook', 'instagram'], accounts);
    expect(socialNetworkIds.sort()).toEqual(['a1', 'a2']);
    expect(unmatched).toEqual([]);
  });

  test('reports platforms with no connected account as unmatched', () => {
    const accounts = [account({ id: 'a1', platform: 'Facebook' })];
    const { socialNetworkIds, unmatched } = resolveSocialNetworkIds(['facebook', 'youtube'], accounts);
    expect(socialNetworkIds).toEqual(['a1']);
    expect(unmatched).toEqual(['youtube']);
  });
});

describe('oneUpScheduleTime', () => {
  test('formats an explicit scheduledFor as YYYY-MM-DD HH:MM', () => {
    const t = oneUpScheduleTime({ scheduledFor: '2026-08-20T09:05:00' }, new Date('2026-08-13T00:00:00'));
    expect(t).toBe('2026-08-20 09:05');
  });

  test('defaults to ~1 minute from now when unscheduled', () => {
    const now = new Date('2026-08-13T14:30:00');
    const t = oneUpScheduleTime({ scheduledFor: null }, now);
    expect(t).toBe('2026-08-13 14:31');
  });
});

describe('publishQueuedSocialPosts', () => {
  const KEYED = { ONEUP_API_KEY: 'k', ONEUP_CATEGORY_ID: '175179' };

  function envelope(data: unknown, error = false, message = 'OK') {
    return JSON.stringify({ message, error, data });
  }

  test('throws without ONEUP_CATEGORY_ID — never guesses a category', async () => {
    db = openDb(':memory:');
    await expect(
      publishQueuedSocialPosts(db, { ONEUP_API_KEY: 'k' }, async () => new Response(envelope([]))),
    ).rejects.toThrow(/ONEUP_CATEGORY_ID/);
  });

  test('returns [] with nothing queued — no accounts call made', async () => {
    db = openDb(':memory:');
    let called = false;
    const outcomes = await publishQueuedSocialPosts(db, KEYED, async () => {
      called = true;
      return new Response(envelope([]));
    });
    expect(outcomes).toEqual([]);
    expect(called).toBe(false);
  });

  test('publishes a matched post and marks it published', async () => {
    db = openDb(':memory:');
    db.socialPosts.enqueue({
      id: 'p1',
      caption: 'Hello Detroit',
      mediaUrl: null,
      platforms: ['facebook'],
      status: 'queued',
      scheduledFor: null,
      createdAt: '2026-08-13T00:00:00Z',
    });
    let sawSchedulePost = false;
    const fakeFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('listsocialaccounts')) {
        return new Response(
          envelope([{ social_account_id: 'a1', social_network_type: 'Facebook', full_name: 'AAC' }]),
        );
      }
      if (u.includes('scheduletextpost')) {
        sawSchedulePost = true;
        return new Response(envelope([], false, '1 new Posts Scheduled.'));
      }
      throw new Error(`unexpected URL ${u}`);
    };
    const outcomes = await publishQueuedSocialPosts(db, KEYED, fakeFetch, new Date('2026-08-13T09:00:00'));
    expect(sawSchedulePost).toBe(true);
    expect(outcomes).toEqual([{ postId: 'p1', ok: true, message: '1 new Posts Scheduled.' }]);
    expect(db.socialPosts.all()[0].status).toBe('published');
  });

  test('a mediaUrl routes to scheduleimagepost', async () => {
    db = openDb(':memory:');
    db.socialPosts.enqueue({
      id: 'p2',
      caption: 'Before/after',
      mediaUrl: 'https://example.com/photo.jpg',
      platforms: ['facebook'],
      status: 'queued',
      scheduledFor: null,
      createdAt: '2026-08-13T00:00:00Z',
    });
    let sawImagePost = false;
    const fakeFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('listsocialaccounts')) {
        return new Response(
          envelope([{ social_account_id: 'a1', social_network_type: 'Facebook', full_name: 'AAC' }]),
        );
      }
      if (u.includes('scheduleimagepost')) {
        sawImagePost = true;
        return new Response(envelope([], false, '1 new Posts Scheduled.'));
      }
      throw new Error(`unexpected URL ${u}`);
    };
    await publishQueuedSocialPosts(db, KEYED, fakeFetch, new Date('2026-08-13T09:00:00'));
    expect(sawImagePost).toBe(true);
  });

  test('a post with no matching connected account is marked failed, never published', async () => {
    db = openDb(':memory:');
    db.socialPosts.enqueue({
      id: 'p3',
      caption: 'YouTube-only post',
      mediaUrl: null,
      platforms: ['youtube'],
      status: 'queued',
      scheduledFor: null,
      createdAt: '2026-08-13T00:00:00Z',
    });
    const fakeFetch: typeof fetch = async () =>
      new Response(envelope([{ social_account_id: 'a1', social_network_type: 'Facebook', full_name: 'AAC' }]));
    const outcomes = await publishQueuedSocialPosts(db, KEYED, fakeFetch);
    expect(outcomes).toEqual([{ postId: 'p3', ok: false, reason: 'No connected OneUp account matches: youtube' }]);
    expect(db.socialPosts.all()[0].status).toBe('failed');
  });

  test("a OneUp-rejected post is marked failed with OneUp's own message", async () => {
    db = openDb(':memory:');
    db.socialPosts.enqueue({
      id: 'p4',
      caption: 'Bad post',
      mediaUrl: null,
      platforms: ['facebook'],
      status: 'queued',
      scheduledFor: null,
      createdAt: '2026-08-13T00:00:00Z',
    });
    const fakeFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('listsocialaccounts')) {
        return new Response(
          envelope([{ social_account_id: 'a1', social_network_type: 'Facebook', full_name: 'AAC' }]),
        );
      }
      return new Response(envelope([], true, 'content is required'));
    };
    const outcomes = await publishQueuedSocialPosts(db, KEYED, fakeFetch);
    expect(outcomes[0]).toEqual({
      postId: 'p4',
      ok: false,
      reason: 'OneUp /scheduletextpost failed: content is required',
    });
    expect(db.socialPosts.all()[0].status).toBe('failed');
  });

  test('processes multiple queued posts independently', async () => {
    db = openDb(':memory:');
    db.socialPosts.enqueue({
      id: 'p5',
      caption: 'One',
      mediaUrl: null,
      platforms: ['facebook'],
      status: 'queued',
      scheduledFor: null,
      createdAt: '2026-08-13T00:00:00Z',
    });
    db.socialPosts.enqueue({
      id: 'p6',
      caption: 'Two',
      mediaUrl: null,
      platforms: ['youtube'],
      status: 'queued',
      scheduledFor: null,
      createdAt: '2026-08-13T00:00:01Z',
    });
    const fakeFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes('listsocialaccounts')) {
        return new Response(
          envelope([{ social_account_id: 'a1', social_network_type: 'Facebook', full_name: 'AAC' }]),
        );
      }
      return new Response(envelope([], false, '1 new Posts Scheduled.'));
    };
    const outcomes = await publishQueuedSocialPosts(db, KEYED, fakeFetch);
    expect(outcomes).toHaveLength(2);
    expect(outcomes.find((o) => o.postId === 'p5')?.ok).toBe(true);
    expect(outcomes.find((o) => o.postId === 'p6')?.ok).toBe(false);
  });
});
