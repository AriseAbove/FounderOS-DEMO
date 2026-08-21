/**
 * Analytics helpers — honest aggregates over real activity logs (no seeded
 * numbers). Pure functions; the page feeds them rows from the repo layer.
 */

type Runlike = { startedAt: string };

/** YYYY-MM-DD `days` before (or equal to) `endDate`, inclusive at both ends. */
function dateRange(endDate: string, days: number): string[] {
  const end = new Date(`${endDate}T00:00:00Z`);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Agent runs bucketed per calendar day over the trailing `days` ending on
 * `endDate` (YYYY-MM-DD). Days with no runs are present with count 0, so the
 * chart never lies about quiet stretches.
 */
export function agentRunVolume(
  runs: Runlike[],
  endDate: string,
  days = 14,
): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of runs) {
    const day = r.startedAt.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return dateRange(endDate, days).map((date) => ({ date, count: counts.get(date) ?? 0 }));
}

/** How many runs started within the trailing `days` ending on `endDate`. */
export function runsWithin(runs: Runlike[], endDate: string, days: number): number {
  const cutoff = dateRange(endDate, days)[0];
  return runs.filter((r) => r.startedAt.slice(0, 10) >= cutoff).length;
}

type RunOutcomeLike = { ok: boolean; pushFailed?: boolean };

export type RunOutcomeCounts = {
  /** The run did its job AND every downstream notification it attempted
   *  actually went through. Only this bucket counts as fully "OK". */
  succeeded: number;
  /** The run itself completed (ok: true) but a push/notification it
   *  attempted genuinely failed — a real problem worth seeing, distinct from
   *  the run's own job succeeding or failing. Never rolled into `succeeded`. */
  pushFailed: number;
  /** The run itself did not complete. */
  failed: number;
  total: number;
};

/**
 * Buckets the run log into three honest outcomes instead of the two-way
 * ok/fail split that used to let a genuinely failing side-effect (e.g. the
 * Chief of Staff's ntfy push) hide inside "Succeeded" just because the run's
 * own job — gathering signals — completed fine. `ok` (did the run's job
 * succeed) and `pushFailed` (did a notification it tried to send fail) are
 * legitimately different signals; see lib/agents/real.ts's
 * chiefOfStaffRunWith and the regression this guards in tests/analytics.test.ts.
 */
export function runOutcomeCounts(runs: RunOutcomeLike[]): RunOutcomeCounts {
  let succeeded = 0;
  let pushFailed = 0;
  let failed = 0;
  for (const r of runs) {
    if (!r.ok) failed++;
    else if (r.pushFailed) pushFailed++;
    else succeeded++;
  }
  return { succeeded, pushFailed, failed, total: runs.length };
}
