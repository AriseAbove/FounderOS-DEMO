import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { systemsLiveDisplay } from '@/lib/sidebar-status';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('systemsLiveDisplay', () => {
  test('still loading (live === null): a loading label, not a "0/0"-shaped value', () => {
    const result = systemsLiveDisplay(null);
    expect(result.loading).toBe(true);
    expect(result.label).not.toMatch(/—\/—/);
    expect(result.label).not.toMatch(/^\d+\/\d+/); // must not look like a resolved count
  });

  test('resolved: renders the real up/total count, not loading', () => {
    const result = systemsLiveDisplay({ up: 7, total: 7 });
    expect(result.loading).toBe(false);
    expect(result.label).toBe('7/7 systems live');
  });

  test('resolved even when genuinely zero-of-zero: still distinguishable from the loading state', () => {
    const zero = systemsLiveDisplay({ up: 0, total: 0 });
    const loading = systemsLiveDisplay(null);
    expect(zero.loading).toBe(false);
    expect(zero.label).toBe('0/0 systems live');
    expect(zero.label).not.toBe(loading.label);
  });
});

// Regression guard: the sidebar footer must never render the bare "—/—"
// placeholder — that reads as a live "zero of zero" value, not a loading
// state, and was the actual bug (seen inconsistently on /integrations and
// /social — a race between first paint and the /api/connections fetch
// resolving, not a data bug). Source-text check in the same style as
// tests/nav.test.ts and tests/os-mark.test.ts, since Sidebar.tsx is a client
// component this project's node-environment test suite doesn't render.
describe('Sidebar footer never shows a raw "—/—" as if it were a real value', () => {
  test('no literal "—/—" placeholder left in the component', () => {
    const src = read('components/Sidebar.tsx');
    expect(src).not.toContain('—/—');
  });

  test('the footer count is driven by the shared, testable systemsLiveDisplay helper', () => {
    const src = read('components/Sidebar.tsx');
    expect(src).toMatch(/from '@\/lib\/sidebar-status'/);
    expect(src).toMatch(/systemsLiveDisplay\(/);
  });
});
