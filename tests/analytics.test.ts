import { describe, expect, test } from 'vitest';
import { agentRunVolume, runsWithin, runOutcomeCounts } from '@/lib/analytics';

const runs = [
  { startedAt: '2026-06-13T11:22:53.404Z' },
  { startedAt: '2026-06-13T11:22:52.480Z' },
  { startedAt: '2026-06-13T09:00:00.000Z' },
  { startedAt: '2026-06-10T08:00:00.000Z' },
  { startedAt: '2026-05-20T08:00:00.000Z' }, // outside a 14-day window ending 06-14
];

describe('agentRunVolume', () => {
  test('returns one bucket per day for the trailing window, ending on endDate', () => {
    const v = agentRunVolume(runs, '2026-06-14', 14);
    expect(v).toHaveLength(14);
    expect(v[0].date).toBe('2026-06-01');
    expect(v[13].date).toBe('2026-06-14');
  });

  test('counts runs by their started-at calendar day', () => {
    const v = agentRunVolume(runs, '2026-06-14', 14);
    const byDate = Object.fromEntries(v.map((p) => [p.date, p.count]));
    expect(byDate['2026-06-13']).toBe(3);
    expect(byDate['2026-06-10']).toBe(1);
    expect(byDate['2026-06-14']).toBe(0);
  });

  test('ignores runs that fall outside the window', () => {
    const v = agentRunVolume(runs, '2026-06-14', 14);
    const total = v.reduce((s, p) => s + p.count, 0);
    expect(total).toBe(4); // the 05-20 run is excluded
  });

  test('empty log yields an all-zero series of the right length', () => {
    const v = agentRunVolume([], '2026-06-14', 7);
    expect(v).toHaveLength(7);
    expect(v.every((p) => p.count === 0)).toBe(true);
  });
});

describe('runsWithin', () => {
  test('counts runs on or after the cutoff (inclusive of endDate day)', () => {
    expect(runsWithin(runs, '2026-06-14', 7)).toBe(4); // three on 06-13 + one on 06-10
    expect(runsWithin(runs, '2026-06-14', 14)).toBe(4);
    expect(runsWithin(runs, '2026-06-14', 60)).toBe(5);
  });
});

describe('runOutcomeCounts', () => {
  // Regression: before 2026-08-21 the Chief of Staff cron always recorded
  // ok: true even when its ntfy push failed (a deliberate, separate design
  // choice — a flaky push should never fail the whole run), and Analytics
  // rolled `ok` straight into "Succeeded" with no other signal. 69 straight
  // hourly runs whose push failed with "fetch failed" showed up as ~99%
  // SUCCEEDED. ok (the run did its job) and pushFailed (a downstream
  // notification failed) are legitimately different signals and must be
  // counted separately, never merged back into one bucket.
  test('a run that finished ok but whose push failed is neither Succeeded nor Failed', () => {
    const runs = [
      { ok: true, pushFailed: false },
      { ok: true, pushFailed: true },
      { ok: false, pushFailed: false },
    ];
    expect(runOutcomeCounts(runs)).toEqual({ succeeded: 1, pushFailed: 1, failed: 1, total: 3 });
  });

  test('a run without pushFailed at all counts as a clean success (every non-chief-of-staff agent)', () => {
    const runs = [{ ok: true }, { ok: true }, { ok: false }];
    expect(runOutcomeCounts(runs)).toEqual({ succeeded: 2, pushFailed: 0, failed: 1, total: 3 });
  });

  test('a failed run with pushFailed still set counts as Failed, not double-counted', () => {
    const runs = [{ ok: false, pushFailed: true }];
    expect(runOutcomeCounts(runs)).toEqual({ succeeded: 0, pushFailed: 0, failed: 1, total: 1 });
  });

  test('empty log is all zeros', () => {
    expect(runOutcomeCounts([])).toEqual({ succeeded: 0, pushFailed: 0, failed: 0, total: 0 });
  });
});
