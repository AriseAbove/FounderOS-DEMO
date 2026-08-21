import { afterEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getBrainProvider, brainStorePath } from '@/lib/brain';
import { GENERATED_MARKER } from '@/lib/brain-docs';

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

  test('stub overview reports zero generated and zero hand-written files (honest empty)', async () => {
    process.env.BRAIN_PROVIDER = 'stub';
    const overview = await getBrainProvider().overview();
    expect(overview.store.generatedFiles).toBe(0);
    expect(overview.store.handWrittenFiles).toBe(0);
  });

  test('overview() splits store files honestly: GENERATED_MARKER frontmatter = system-generated, anything else = hand-written', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-store-origin-'));
    fs.writeFileSync(path.join(dir, 'generated-doc.md'), `---\ntitle: x\n${GENERATED_MARKER}\n---\n\n# X\n`);
    fs.writeFileSync(path.join(dir, 'my-real-note.md'), '# A note I actually wrote\n\nSome real content.\n');
    process.env.BRAIN_STORE = dir;
    const overview = await getBrainProvider().overview();
    expect(overview.store.totalFiles).toBe(2);
    expect(overview.store.generatedFiles).toBe(1);
    expect(overview.store.handWrittenFiles).toBe(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the bundled starter store is entirely system-generated — zero hand-written notes ship in the repo', async () => {
    delete process.env.BRAIN_STORE;
    delete process.env.GBRAIN_STORE;
    const overview = await getBrainProvider().overview();
    expect(overview.store.totalFiles).toBeGreaterThan(0);
    expect(overview.store.handWrittenFiles).toBe(0);
    expect(overview.store.generatedFiles).toBe(overview.store.totalFiles);
  });
});
