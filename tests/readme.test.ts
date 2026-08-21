import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const readme = () => readFileSync(join(process.cwd(), 'README.md'), 'utf8');

/**
 * README honesty contract (2026-08-21 fix): README.md still claimed "Arise
 * Above Apps' funnel stages are still undefined — apps journeys ride the AAC
 * stages as a clearly-flagged placeholder" — stale since 2026-08-14's "Define
 * the Apps funnel" commit gave Apps its own real 6-stage pipeline
 * (lib/funnel.ts's APPS_FUNNEL_STAGES / stagesFor). A false "not done yet"
 * claim is exactly as much an honesty bug in this repo as a false "done"
 * claim — fix the doc, not just the code.
 */
describe('README.md does not understate what the Apps funnel actually has', () => {
  test('no longer claims Apps funnel stages are undefined / riding AAC as a placeholder', () => {
    expect(readme()).not.toMatch(/Apps' funnel\s*\n?\s*stages are still undefined/);
    expect(readme()).not.toMatch(/apps.*journeys ride the AAC stages/i);
  });

  test('accurately describes the real Apps pipeline', () => {
    expect(readme()).toMatch(/discovered/i);
    expect(readme()).toMatch(/subscribed|retained/i);
  });
});
