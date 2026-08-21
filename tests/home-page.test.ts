import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * 2026-08-21 fix: a live QA pass found the same "—/100 · ok" contradiction
 * from /brain repeated on the home page's Knowledge health tile and G-Brain
 * card — a null health score rendered right next to a status word ('ok')
 * that implied one had been computed. Both surfaces now derive their status
 * word from lib/brain.ts's summarizeDoctor, the single place allowed to
 * decide "ok".
 */
describe('home page — Knowledge health tile never pairs a null score with "ok"', () => {
  const page = read('app/page.tsx');

  test('imports and uses summarizeDoctor instead of the raw doctor.status field', () => {
    expect(page).toMatch(/summarizeDoctor/);
    // the old unit string read `overview.doctor.status` directly, which is
    // 'ok' whenever the store has any files on disk regardless of whether a
    // real health score exists
    expect(page).not.toMatch(/overview\.doctor\.status\}/);
  });

  test('the G-Brain summary card no longer claims "hybrid search verified"', () => {
    expect(page).not.toMatch(/hybrid search\{/);
    expect(page).toMatch(/'grep verified'/);
  });
});
