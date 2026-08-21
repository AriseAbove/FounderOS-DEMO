import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { QuickBooksAuth } from '@/lib/schemas';
import { getValidAccessToken } from '@/lib/connectors/quickbooks';

/**
 * 2026-08-21 fix (defensive): Intuit rotates the refresh token on every use
 * (refreshTokens' own comment in lib/connectors/quickbooks.ts says so), so
 * concurrent callers of getValidAccessToken() with a stale access token — for
 * example /finances firing 4 QBO calls in one Promise.all (see
 * app/finances/page.tsx), plus other pages potentially rendering
 * concurrently — could each independently call Intuit's token endpoint.
 * Whichever response landed second would carry a refresh token the OTHER
 * caller's stored write had already superseded, silently invalidating the
 * connection. getValidAccessToken() now caches the in-flight refresh in a
 * module-level promise so every concurrent caller awaits the SAME refresh
 * instead of each firing its own request.
 *
 * lib/data.ts's getDb() is mocked here (rather than pointed at a real
 * :memory: db) so this test can assert on exactly how many times the stored
 * grant is read/written without needing the full repo-layer plumbing —
 * getValidAccessToken's only dependency on it is get()/save().
 */

let currentStored: QuickBooksAuth | null = null;
let savedRows: QuickBooksAuth[] = [];

vi.mock('@/lib/data', () => ({
  getDb: () => ({
    quickbooksAuth: {
      get: () => currentStored,
      save: (row: QuickBooksAuth) => {
        savedRows.push(row);
        currentStored = row;
      },
    },
  }),
}));

const EXPIRING_SOON: QuickBooksAuth = {
  id: 'default',
  realmId: 'realm-1',
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  accessTokenExpiresAt: 0, // already expired -> every call must refresh
  refreshTokenExpiresAt: Date.now() + 1_000_000_000,
  updatedAt: new Date(0).toISOString(),
};

function mockTokenEndpoint(accessToken: string, refreshToken: string, delayMs = 15) {
  let calls = 0;
  const spy = vi.spyOn(global, 'fetch').mockImplementation(async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return new Response(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
        x_refresh_token_expires_in: 8_640_000,
      }),
      { status: 200 },
    );
  });
  return { spy, calls: () => calls };
}

describe('getValidAccessToken — concurrent-refresh lock', () => {
  beforeEach(() => {
    currentStored = { ...EXPIRING_SOON };
    savedRows = [];
    vi.restoreAllMocks();
  });

  test('N concurrent callers with a stale token share ONE in-flight refresh, not one each', async () => {
    const { calls } = mockTokenEndpoint('new-access-1', 'new-refresh-1');

    const results = await Promise.all([
      getValidAccessToken({}),
      getValidAccessToken({}),
      getValidAccessToken({}),
      getValidAccessToken({}),
    ]);

    // The regression this guards against: without the lock, every one of
    // these 4 concurrent calls independently hits the token endpoint — each
    // rotating (and invalidating) the refresh token the others are mid-use
    // with. With the lock, exactly one real network call happens.
    expect(calls()).toBe(1);
    expect(savedRows).toHaveLength(1);
    for (const result of results) {
      expect(result).toEqual({ accessToken: 'new-access-1', realmId: 'realm-1' });
    }
  });

  test('a fresh (non-expiring) token needs no refresh at all — zero fetch calls', async () => {
    currentStored = {
      ...EXPIRING_SOON,
      accessTokenExpiresAt: Date.now() + 10 * 60_000, // 10 min out, well past the buffer
    };
    const { calls } = mockTokenEndpoint('unused', 'unused');

    const result = await getValidAccessToken({});
    expect(calls()).toBe(0);
    expect(result).toEqual({ accessToken: 'old-access', realmId: 'realm-1' });
  });

  test('the lock releases after the refresh settles — a later genuinely-stale call refreshes again', async () => {
    const { calls } = mockTokenEndpoint('new-access-1', 'new-refresh-1');

    await getValidAccessToken({});
    expect(calls()).toBe(1);

    // Simulate time passing: the newly-stored token is ALSO already stale
    // (e.g. a short-lived token in a slow test, or simply time moving on).
    currentStored = { ...currentStored!, accessTokenExpiresAt: 0 };

    const second = await getValidAccessToken({});
    expect(calls()).toBe(2); // a genuinely new refresh, not stuck on the old lock
    expect(second).toEqual({ accessToken: 'new-access-1', realmId: 'realm-1' });
  });
});
