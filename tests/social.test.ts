import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { SocialAccountSchema, SocialSnapshotSchema, type SocialSnapshot } from '@/lib/schemas';
import {
  allTimeGrowthPct,
  buildSocialDashboard,
  growthPct,
  platformDetail,
  publishedPostDays,
  recentLivePosts,
  socialSourceBadge,
  syncSocialSnapshots,
} from '@/lib/social';
import type { SocialPost } from '@/lib/schemas';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

const snap = (platform: string, capturedAt: string, followers: number): SocialSnapshot =>
  SocialSnapshotSchema.parse({ platform, capturedAt, followers, source: 'test' });

describe('social schemas', () => {
  test('accepts the five tracked platforms only', () => {
    expect(() =>
      SocialAccountSchema.parse({ platform: 'myspace', handle: '@x', url: null, order: 1 }),
    ).toThrow();
    expect(() =>
      SocialAccountSchema.parse({ platform: 'instagram', handle: '@example', url: null, order: 1 }),
    ).not.toThrow();
  });

  test('snapshots require a YYYY-MM-DD capture date', () => {
    expect(() => snap('instagram', 'June 13', 100)).toThrow();
    expect(() => snap('instagram', '2026-06-13', 100)).not.toThrow();
  });
});

describe('social repo', () => {
  test('round-trips accounts ordered by their order column', () => {
    db = openDb(':memory:');
    db.social.upsertAccount({ platform: 'tiktok', handle: '@example', url: null, order: 2 });
    db.social.upsertAccount({ platform: 'instagram', handle: '@example', url: null, order: 1 });
    expect(db.social.accounts().map((a) => a.platform)).toEqual(['instagram', 'tiktok']);
  });

  test('upserting the same platform replaces instead of duplicating', () => {
    db = openDb(':memory:');
    db.social.upsertAccount({ platform: 'twitter', handle: '@old', url: null, order: 1 });
    db.social.upsertAccount({ platform: 'twitter', handle: '@Founderosai', url: null, order: 1 });
    expect(db.social.accounts()).toHaveLength(1);
    expect(db.social.accounts()[0].handle).toBe('@Founderosai');
  });

  test('returns snapshots for a platform in chronological order', () => {
    db = openDb(':memory:');
    db.social.insertSnapshot(snap('instagram', '2026-06-10', 40000));
    db.social.insertSnapshot(snap('instagram', '2026-06-01', 39000));
    db.social.insertSnapshot(snap('tiktok', '2026-06-10', 9900));
    expect(db.social.snapshots('instagram').map((s) => s.capturedAt)).toEqual([
      '2026-06-01',
      '2026-06-10',
    ]);
  });

  test('same-day snapshot for a platform replaces the earlier capture', () => {
    db = openDb(':memory:');
    db.social.insertSnapshot(snap('instagram', '2026-06-13', 40000));
    db.social.insertSnapshot(snap('instagram', '2026-06-13', 40100));
    const rows = db.social.snapshots('instagram');
    expect(rows).toHaveLength(1);
    expect(rows[0].followers).toBe(40100);
  });

  test('latest() returns the newest snapshot per platform', () => {
    db = openDb(':memory:');
    db.social.insertSnapshot(snap('instagram', '2026-06-01', 39000));
    db.social.insertSnapshot(snap('instagram', '2026-06-10', 40000));
    db.social.insertSnapshot(snap('tiktok', '2026-06-05', 9900));
    const latest = db.social.latest();
    expect(latest).toHaveLength(2);
    expect(latest.find((s) => s.platform === 'instagram')?.followers).toBe(40000);
  });
});

describe('growthPct', () => {
  test('computes percentage growth across the window', () => {
    const series = [snap('instagram', '2026-06-01', 1000), snap('instagram', '2026-06-08', 1100)];
    expect(growthPct(series, 7)).toBeCloseTo(10);
  });

  test('uses the most recent snapshot at or before the window start as baseline', () => {
    const series = [
      snap('instagram', '2026-06-01', 1000),
      snap('instagram', '2026-06-05', 1050),
      snap('instagram', '2026-06-12', 1155),
    ];
    expect(growthPct(series, 7)).toBeCloseTo(10);
  });

  test('is null when history does not reach back far enough', () => {
    const series = [snap('instagram', '2026-06-12', 1000), snap('instagram', '2026-06-13', 1010)];
    expect(growthPct(series, 7)).toBeNull();
  });

  test('is null with fewer than two snapshots or a zero baseline', () => {
    expect(growthPct([snap('instagram', '2026-06-13', 1000)], 7)).toBeNull();
    expect(growthPct([], 7)).toBeNull();
    expect(
      growthPct([snap('youtube', '2026-06-01', 0), snap('youtube', '2026-06-08', 50)], 7),
    ).toBeNull();
  });

  test('allTimeGrowthPct compares earliest to latest', () => {
    const series = [snap('tiktok', '2026-01-01', 5000), snap('tiktok', '2026-06-13', 12000)];
    expect(allTimeGrowthPct(series)).toBeCloseTo(140);
    expect(allTimeGrowthPct([snap('tiktok', '2026-06-13', 12000)])).toBeNull();
  });
});

describe('syncSocialSnapshots', () => {
  test('records a snapshot today for every tracked platform with a follower count', () => {
    db = openDb(':memory:');
    const recorded = syncSocialSnapshots(
      db,
      {
        instagram: { handle: '@ariseaboveconstruction', followers: 420 },
        tiktok: { handle: '@ariseaboveconstruction', followers: 120 },
        facebook: { handle: 'Arise Above Construction', followers: 100 }, // OneUp's Facebook channel — tracked
        pinterest: { handle: 'Arise Above Construction', followers: 100 }, // untracked platform
        linkedin: { handle: 'Arise Above Construction' }, // no follower count yet
      },
      '2026-06-13',
    );
    expect(recorded).toBe(3);
    expect(db.social.snapshots('instagram')).toEqual([
      { platform: 'instagram', capturedAt: '2026-06-13', followers: 420, source: 'manual-sync' },
    ]);
    expect(db.social.snapshots('facebook')).toEqual([
      { platform: 'facebook', capturedAt: '2026-06-13', followers: 100, source: 'manual-sync' },
    ]);
    expect(db.social.snapshots('linkedin')).toEqual([]);
  });

  test('re-syncing the same day overwrites rather than duplicates', () => {
    db = openDb(':memory:');
    syncSocialSnapshots(db, { instagram: { followers: 42000 } }, '2026-06-13');
    syncSocialSnapshots(db, { instagram: { followers: 40100 } }, '2026-06-13');
    const rows = db.social.snapshots('instagram');
    expect(rows).toHaveLength(1);
    expect(rows[0].followers).toBe(40100);
  });
});

describe('buildSocialDashboard', () => {
  test('lists the seeded real accounts with honest null followers', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const dash = buildSocialDashboard(db);
    // Only the real AAC account is seeded; no invented follower history.
    expect(dash.platforms.map((p) => p.platform)).toEqual(['instagram']);
    expect(dash.platforms[0].followers).toBeNull();
  });

  test('total followers is zero until a real source records snapshots', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(buildSocialDashboard(db).totalFollowers).toBe(0);
  });

  test('computes growth from recorded snapshot history per platform', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.social.insertSnapshot(snap('instagram', '2026-06-01', 100));
    db.social.insertSnapshot(snap('instagram', '2026-06-10', 110));
    const ig = buildSocialDashboard(db).platforms.find((p) => p.platform === 'instagram');
    expect(ig?.followers).toBe(110);
    expect(typeof ig?.growth.allTime).toBe('number');
    expect(ig?.series.length ?? 0).toBe(2);
  });
});

describe('platformDetail', () => {
  test('returns account, history, and growth for one platform', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const detail = platformDetail(db, 'instagram');
    expect(detail?.account.handle).toBe('@ariseaboveconstruction');
    expect(detail?.snapshots.length).toBe(0); // no invented history
    expect(detail?.growth).toHaveProperty('d7');
    expect(detail?.growth).toHaveProperty('d30');
    expect(detail?.growth).toHaveProperty('allTime');
  });

  test('is null for a platform that is not tracked', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(platformDetail(db, 'myspace' as never)).toBeNull();
  });
});

describe('seeded social data', () => {
  test('seeds only the real AAC account, with no invented history', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const accounts = db.social.accounts();
    expect(accounts.map((a) => a.handle)).toEqual(['@ariseaboveconstruction']);
    expect(db.social.snapshots('instagram')).toEqual([]);
  });

  test('re-seeding drops retired dummy history but keeps real recorded rows', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    // an older DB still holding retired dummy history + a live-recorded row
    db.social.insertSnapshot({ platform: 'instagram', capturedAt: '2026-05-01', followers: 42000, source: 'seed-dummy' });
    db.social.insertSnapshot({ platform: 'instagram', capturedAt: '2026-06-01', followers: 300, source: 'manual-sync' });
    db.social.upsertAccount({ platform: 'tiktok', handle: '@example', url: null, order: 2 });
    seedDatabase(db);
    expect(db.social.snapshots('instagram').map((s) => s.source)).toEqual(['manual-sync']);
    expect(db.social.accounts().map((a) => a.platform)).toEqual(['instagram']); // retired accounts leave
  });

  test('re-seeding does not duplicate accounts or snapshots', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const accounts = db.social.accounts().length;
    seedDatabase(db);
    expect(db.social.accounts().length).toBe(accounts);
  });
});

describe('socialSourceBadge — the /social header must agree with /integrations', () => {
  test('not_configured reads "no posting source connected", same as before OneUp existed', () => {
    const badge = socialSourceBadge({ state: 'not_configured' });
    expect(badge.label).toBe('no posting source connected');
    expect(badge.tone).toBe('warn');
    expect(badge.ghost).toBe(true);
  });

  test('connected never claims "no posting source" — that would contradict /integrations', () => {
    const badge = socialSourceBadge({ state: 'connected' });
    expect(badge.label.toLowerCase()).not.toContain('no posting source');
    expect(badge.label.toLowerCase()).toContain('connected');
    expect(badge.tone).toBe('ok');
    expect(badge.ghost).toBe(false);
  });

  test('connected is still honest that no post/account data has synced — no invented numbers', () => {
    const badge = socialSourceBadge({ state: 'connected' });
    expect(badge.emptyPostsDetail.toLowerCase()).toContain('no post history has synced');
  });

  test('error state is distinct from both connected and not_configured', () => {
    const badge = socialSourceBadge({ state: 'error' });
    expect(badge.tone).toBe('err');
    expect(badge.label.toLowerCase()).toContain('error');
  });
});

// /social must read the SAME real published-post rows /content already
// reads (lib/content.ts's contentPipelineStatus, status === 'published'),
// never the hardcoded livePosts=[]/recentLive=false/postDays=[] this page
// shipped with before 2026-08-21. Reproduces the exact cross-page
// contradiction: once Social Pulse actually publishes something, /content
// correctly counts it while /social used to keep claiming no post history
// had ever synced.
describe('recentLivePosts — the real /social "Recent posts" data (not hardcoded empty)', () => {
  const post = (over: Partial<SocialPost>): SocialPost => ({
    id: 'p1',
    caption: 'Fresh pour on Woodward',
    mediaUrl: null,
    platforms: ['facebook'],
    status: 'published',
    scheduledFor: null,
    createdAt: '2026-08-10T12:00:00Z',
    ...over,
  });

  test('empty input yields an empty list — never a fake fallback', () => {
    expect(recentLivePosts([])).toEqual([]);
  });

  test('ignores queued and failed posts — only published counts as "live"', () => {
    const posts = [post({ id: 'q1', status: 'queued' }), post({ id: 'f1', status: 'failed' })];
    expect(recentLivePosts(posts)).toEqual([]);
  });

  test('one row per platform for a cross-posted post, newest first', () => {
    const posts = [
      post({ id: 'p1', createdAt: '2026-08-10T12:00:00Z', platforms: ['facebook', 'instagram'] }),
      post({ id: 'p2', createdAt: '2026-08-12T09:00:00Z', platforms: ['instagram'] }),
    ];
    const rows = recentLivePosts(posts);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ platform: 'instagram', publishedAt: '2026-08-12T09:00:00Z' });
    expect(rows.slice(1).map((r) => r.platform).sort()).toEqual(['facebook', 'instagram']);
    // Never invents a permalink OneUp's schedule APIs don't return.
    for (const r of rows) expect(r.url).toBeNull();
  });

  test('a scheduled post publishes at its scheduledFor time, not its queued createdAt', () => {
    const posts = [post({ scheduledFor: '2026-08-15T08:00:00Z', createdAt: '2026-08-10T12:00:00Z' })];
    expect(recentLivePosts(posts)[0].publishedAt).toBe('2026-08-15T08:00:00Z');
  });
});

describe('publishedPostDays — real posting-consistency chart data (not hardcoded empty)', () => {
  const post = (over: Partial<SocialPost>): SocialPost => ({
    id: 'p1',
    caption: 'Fresh pour on Woodward',
    mediaUrl: null,
    platforms: ['facebook', 'instagram'],
    status: 'published',
    scheduledFor: null,
    createdAt: '2026-08-10T12:00:00Z',
    ...over,
  });

  test('empty input yields an empty list', () => {
    expect(publishedPostDays([])).toEqual([]);
  });

  test('one entry per published post, dated YYYY-MM-DD, carrying its real platforms', () => {
    const days = publishedPostDays([post({})]);
    expect(days).toEqual([{ date: '2026-08-10', platforms: ['facebook', 'instagram'] }]);
  });

  test('queued and failed posts never contribute a day', () => {
    const days = publishedPostDays([post({ status: 'queued' }), post({ id: 'f', status: 'failed' })]);
    expect(days).toEqual([]);
  });
});
