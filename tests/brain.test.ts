import { afterEach, describe, expect, test } from 'vitest';
import path from 'node:path';
import { getBrainProvider, brainStorePath } from '@/lib/brain';

afterEach(() => {
  delete process.env.BRAIN_PROVIDER;
  delete process.env.BRAIN_STORE;
  delete process.env.GBRAIN_STORE;
});

describe('G Brain adapter', () => {
  test('defaults to the local markdown store provider', () => {
    const brain = getBrainProvider();
    expect(brain.name).toBe('local-store');
  });

  test('an explicit BRAIN_STORE always wins over the bundled default', () => {
    process.env.BRAIN_STORE = '/tmp/some-operator-folder';
    expect(brainStorePath()).toBe('/tmp/some-operator-folder');
  });

  test('falls back to the bundled knowledge/brain-store when no override is set and it exists on disk', () => {
    delete process.env.BRAIN_STORE;
    delete process.env.GBRAIN_STORE;
    // Real, checked-in content generated from the honest seed data (agents,
    // SOPs, tools, people, pillars) via `npm run brain:docs` — see
    // scripts/generate-brain-docs.ts. Not fabricated: it's a live projection
    // of lib/seed.ts, so Knowledge search has something real on day one
    // without Sean having to configure anything.
    expect(brainStorePath()).toBe(path.join(process.cwd(), 'knowledge', 'brain-store'));
  });

  test('falls back to stub when BRAIN_PROVIDER=stub', () => {
    process.env.BRAIN_PROVIDER = 'stub';
    const brain = getBrainProvider();
    expect(brain.name).toBe('stub');
  });

  test('stub reports a disconnected status with wiring instructions', async () => {
    process.env.BRAIN_PROVIDER = 'stub';
    const brain = getBrainProvider();
    const status = await brain.status();
    expect(status.connected).toBe(false);
    expect(status.provider).toBe('stub');
    expect(status.detail.length).toBeGreaterThan(0);
  });

  test('stub search returns an empty result set, never throws', async () => {
    process.env.BRAIN_PROVIDER = 'stub';
    const brain = getBrainProvider();
    await expect(brain.search('launchpad cohort')).resolves.toEqual([]);
  });
});
