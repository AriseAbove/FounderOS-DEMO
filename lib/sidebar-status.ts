/**
 * The sidebar footer's "N/N systems live" line. Pure and testable on
 * purpose: before this fix Sidebar.tsx rendered a bare "—/— systems live"
 * whenever `live` was still null (initial render, or the /api/connections
 * fetch still in flight) — indistinguishable from a genuine "0 of 0"
 * reading, next to the same green pulsing "ok" dot the real count uses.
 * That's a race/hydration-timing bug, not a data bug: the count is fetched
 * client-side after mount, so every page load shows this state briefly, and
 * a slow response (or the request landing on a route that's already busy,
 * as observed on /integrations and /social) makes it linger long enough to
 * read as broken. A loading state must look like loading, never like a
 * live (wrong) value.
 */
export type SystemsLiveCount = { up: number; total: number };

export type SystemsLiveDisplay = {
  /** Text for the footer line, loading or resolved — never "—/—". */
  label: string;
  /** True while still waiting on the real count. */
  loading: boolean;
};

export function systemsLiveDisplay(live: SystemsLiveCount | null): SystemsLiveDisplay {
  if (!live) return { label: 'checking systems…', loading: true };
  return { label: `${live.up}/${live.total} systems live`, loading: false };
}
