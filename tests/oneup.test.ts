import { describe, expect, test } from 'vitest';
import {
  ONEUP_API_BASE,
  oneupConfigured,
  oneupStatus,
  normalizeOneUpAccount,
  normalizeOneUpFailedPost,
  listOneUpAccounts,
  listOneUpCategories,
  listOneUpFailedPosts,
  publishOneUpPost,
  type OneUpAccount,
  type OneUpFailedPost,
} from '@/lib/connectors/oneup';

const KEYED = { ONEUP_API_KEY: 'oneup-test-key' };
const BARE: Record<string, string | undefined> = {};

function envelope(data: unknown, error = false, message = 'OK') {
  return JSON.stringify({ message, error, data });
}

describe('oneupConfigured', () => {
  test('false without ONEUP_API_KEY, true with it', () => {
    expect(oneupConfigured(BARE)).toBe(false);
    expect(oneupConfigured(KEYED)).toBe(true);
  });
});

describe('oneupStatus — honest states only', () => {
  test('not_configured without a key, and says which env var to set', async () => {
    const s = await oneupStatus(BARE);
    expect(s.id).toBe('oneup');
    expect(s.state).toBe('not_configured');
    expect(s.detail).toContain('ONEUP_API_KEY');
  });

  test('connected when the key is set', async () => {
    const s = await oneupStatus(KEYED);
    expect(s.state).toBe('connected');
    expect(s.kind).toBe('social');
  });
});

describe('normalizeOneUpAccount — the listsocialaccounts row shape', () => {
  test('maps social_account_id / social_network_type / full_name', () => {
    const account = normalizeOneUpAccount({
      username: 'ariseaboveconstruction',
      social_account_id: 'cd2a6a1f-b1d7-4784-9df1-8d21bb05a7d0',
      full_name: 'Arise Above Construction',
      is_expired: 0,
      social_network_type: 'Facebook',
      account_type: 0,
      need_refresh: false,
    });
    expect(account).toEqual<OneUpAccount>({
      id: 'cd2a6a1f-b1d7-4784-9df1-8d21bb05a7d0',
      platform: 'Facebook',
      name: 'Arise Above Construction',
      username: 'ariseaboveconstruction',
      needsRefresh: false,
    });
  });

  test('empty username becomes null, need_refresh becomes true', () => {
    const account = normalizeOneUpAccount({
      social_account_id: 'x',
      social_network_type: 'Instagram',
      full_name: 'AAC',
      username: '',
      need_refresh: true,
    });
    expect(account.username).toBeNull();
    expect(account.needsRefresh).toBe(true);
  });
});

describe('normalizeOneUpFailedPost — the getfailedposts row shape', () => {
  test('maps post_id / fail_reason / social_network_username', () => {
    const failed = normalizeOneUpFailedPost({
      email: 'sean@ariseaboveconstruction.com',
      content: 'SOUPDIVE commercial build-out',
      source_url: null,
      created_at: '2026-05-05 09:00:00',
      category_name: 'AAC Social Posts',
      post_id: '987654',
      content_image: 'https://cdn.filestackcontent.com/abc',
      social_network_username: 'ariseaboveconstruction',
      fail_reason: 'Fetching image failed.',
    });
    expect(failed).toEqual<OneUpFailedPost>({
      postId: '987654',
      content: 'SOUPDIVE commercial build-out',
      failReason: 'Fetching image failed.',
      socialNetworkUsername: 'ariseaboveconstruction',
      categoryName: 'AAC Social Posts',
      createdAt: '2026-05-05 09:00:00',
    });
  });

  test('missing fail_reason becomes null, never an empty string', () => {
    const failed = normalizeOneUpFailedPost({ post_id: '1', content: 'x' });
    expect(failed.failReason).toBeNull();
  });
});

describe('listOneUpAccounts — real HTTP contract, injectable fetch', () => {
  test('GETs listsocialaccounts with apiKey as a query param', async () => {
    let seenUrl = '';
    const fakeFetch: typeof fetch = async (url) => {
      seenUrl = String(url);
      return new Response(envelope([]), { status: 200 });
    };
    await listOneUpAccounts(KEYED, fakeFetch);
    expect(seenUrl).toBe(`${ONEUP_API_BASE}/listsocialaccounts?apiKey=oneup-test-key`);
  });

  test('normalizes every row in data', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        envelope([
          { social_account_id: 'a1', social_network_type: 'Facebook', full_name: 'AAC Page' },
          { social_account_id: 'a2', social_network_type: 'Instagram', full_name: 'AAC' },
        ]),
        { status: 200 },
      );
    const accounts = await listOneUpAccounts(KEYED, fakeFetch);
    expect(accounts.map((a) => a.platform)).toEqual(['Facebook', 'Instagram']);
  });

  test('throws an honest error without a key — never a silent empty result', async () => {
    await expect(listOneUpAccounts(BARE, async () => new Response(envelope([])))).rejects.toThrow(
      /ONEUP_API_KEY/,
    );
  });

  test('throws on a non-200 with the status in the message', async () => {
    const fakeFetch: typeof fetch = async () => new Response('nope', { status: 503 });
    await expect(listOneUpAccounts(KEYED, fakeFetch)).rejects.toThrow(/503/);
  });

  test('throws OneUp\'s own message when the envelope reports error:true', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(envelope([], true, 'Invalid API key'), { status: 200 });
    await expect(listOneUpAccounts(KEYED, fakeFetch)).rejects.toThrow(/Invalid API key/);
  });
});

describe('listOneUpCategories', () => {
  test('maps id / category_name', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(envelope([{ id: 49839, category_name: 'AAC Social Posts', isPaused: 0 }]), {
        status: 200,
      });
    const cats = await listOneUpCategories(KEYED, fakeFetch);
    expect(cats).toEqual([{ id: '49839', name: 'AAC Social Posts' }]);
  });
});

describe('listOneUpFailedPosts', () => {
  test('passes start for pagination and normalizes fail_reason', async () => {
    let seenUrl = '';
    const fakeFetch: typeof fetch = async (url) => {
      seenUrl = String(url);
      return new Response(
        envelope([{ post_id: '1', content: 'x', fail_reason: 'Fetching image failed.' }]),
        { status: 200 },
      );
    };
    const posts = await listOneUpFailedPosts(KEYED, fakeFetch, 20);
    expect(seenUrl).toContain('start=20');
    expect(posts[0].failReason).toBe('Fetching image failed.');
  });
});

describe('publishOneUpPost — endpoint selection + real form-encoded contract', () => {
  test('text-only content POSTs to scheduletextpost with urlencoded params', async () => {
    let seenPath = '';
    let seenBody = '';
    let seenContentType = '';
    const fakeFetch: typeof fetch = async (url, init) => {
      seenPath = String(url);
      seenBody = String(init?.body);
      seenContentType = String(new Headers(init?.headers).get('content-type'));
      return new Response(envelope([], false, '1 new Posts Scheduled.'), { status: 200 });
    };
    const result = await publishOneUpPost(
      KEYED,
      {
        categoryId: '49839',
        socialNetworkIds: ['a1', 'a2'],
        scheduledDateTime: '2026-08-20 09:00',
        content: 'Hello Detroit',
      },
      fakeFetch,
    );
    expect(seenPath).toBe(`${ONEUP_API_BASE}/scheduletextpost`);
    expect(seenContentType).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(seenBody);
    expect(body.get('apiKey')).toBe('oneup-test-key');
    expect(body.get('category_id')).toBe('49839');
    expect(body.get('social_network_id')).toBe('["a1","a2"]');
    expect(body.get('scheduled_date_time')).toBe('2026-08-20 09:00');
    expect(body.get('content')).toBe('Hello Detroit');
    expect(result.message).toBe('1 new Posts Scheduled.');
  });

  test('imageUrl routes to scheduleimagepost and includes image_url', async () => {
    let seenPath = '';
    let seenBody = '';
    const fakeFetch: typeof fetch = async (url, init) => {
      seenPath = String(url);
      seenBody = String(init?.body);
      return new Response(envelope([], false, '1 new Posts Scheduled.'), { status: 200 });
    };
    await publishOneUpPost(
      KEYED,
      {
        categoryId: '49839',
        socialNetworkIds: 'ALL',
        scheduledDateTime: '2026-08-20 09:00',
        content: 'Before/after',
        imageUrl: 'https://example.com/photo.jpg',
      },
      fakeFetch,
    );
    expect(seenPath).toBe(`${ONEUP_API_BASE}/scheduleimagepost`);
    const body = new URLSearchParams(seenBody);
    expect(body.get('social_network_id')).toBe('ALL');
    expect(body.get('image_url')).toBe('https://example.com/photo.jpg');
  });

  test('videoUrl routes to schedulevideopost and includes video_url', async () => {
    let seenPath = '';
    const fakeFetch: typeof fetch = async (url) => {
      seenPath = String(url);
      return new Response(envelope([], false, '1 new Posts Scheduled.'), { status: 200 });
    };
    await publishOneUpPost(
      KEYED,
      {
        categoryId: '49839',
        socialNetworkIds: ['a1'],
        scheduledDateTime: '2026-08-20 09:00',
        content: 'Walkthrough video',
        videoUrl: 'https://example.com/clip.mp4',
      },
      fakeFetch,
    );
    expect(seenPath).toBe(`${ONEUP_API_BASE}/schedulevideopost`);
  });

  test('rejects imageUrl + videoUrl together before making any request', async () => {
    let called = false;
    const fakeFetch: typeof fetch = async () => {
      called = true;
      return new Response(envelope([]), { status: 200 });
    };
    await expect(
      publishOneUpPost(
        KEYED,
        {
          categoryId: '49839',
          socialNetworkIds: ['a1'],
          scheduledDateTime: '2026-08-20 09:00',
          content: 'x',
          imageUrl: 'https://example.com/a.jpg',
          videoUrl: 'https://example.com/a.mp4',
        },
        fakeFetch,
      ),
    ).rejects.toThrow(/imageUrl or videoUrl, not both/);
    expect(called).toBe(false);
  });

  test('surfaces OneUp\'s own rejection message (e.g. a bad schedule time)', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(envelope([], true, 'scheduled_date_time is in the past'), { status: 200 });
    await expect(
      publishOneUpPost(
        KEYED,
        {
          categoryId: '49839',
          socialNetworkIds: ['a1'],
          scheduledDateTime: '2020-01-01 09:00',
          content: 'x',
        },
        fakeFetch,
      ),
    ).rejects.toThrow(/scheduled_date_time is in the past/);
  });

  test('throws an honest error without a key — never silently no-ops', async () => {
    await expect(
      publishOneUpPost(
        BARE,
        { categoryId: '1', socialNetworkIds: 'ALL', scheduledDateTime: '2026-08-20 09:00', content: 'x' },
        async () => new Response(envelope([])),
      ),
    ).rejects.toThrow(/ONEUP_API_KEY/);
  });
});
