/**
 * Honest inputs for the operator-console pulse row. `runsPerDay` / `inboundPerDay`
 * turn real timestamped history (agent_runs, comms feed) into per-day series for
 * the sparklines; `stateOfWorld` distills live facts into one attention-first
 * status sentence. Pure + tested so the page stays a thin renderer — and so the
 * pulse row never shows a fabricated trend again.
 */

const DAY_MS = 86_400_000;

/** UTC date keys (YYYY-MM-DD) for the last `days` days, oldest first. */
function dayKeys(days: number, nowMs: number): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(new Date(nowMs - i * DAY_MS).toISOString().slice(0, 10));
  }
  return keys;
}

/** Count ISO timestamps into the last `days` UTC-day buckets (oldest first). */
function countPerDay(timestamps: (string | undefined)[], days: number, nowMs: number): number[] {
  const keys = dayKeys(days, nowMs);
  const index = new Map(keys.map((k, i) => [k, i]));
  const counts = new Array<number>(days).fill(0);
  for (const ts of timestamps) {
    if (!ts) continue;
    const t = Date.parse(ts);
    if (!Number.isFinite(t)) continue;
    const i = index.get(new Date(t).toISOString().slice(0, 10));
    if (i !== undefined) counts[i] += 1;
  }
  return counts;
}

export function runsPerDay(runs: { startedAt?: string }[], days = 7, nowMs = Date.now()): number[] {
  return countPerDay(
    runs.map((r) => r.startedAt),
    days,
    nowMs,
  );
}

export function inboundPerDay(items: { ts?: string }[], days = 7, nowMs = Date.now()): number[] {
  return countPerDay(
    items.map((i) => i.ts),
    days,
    nowMs,
  );
}

export type Tone = 'ok' | 'warn' | 'err' | 'accent' | 'dim';
export type StateSegment = { text: string; tone: Tone };

export type PulseFacts = {
  activeAgents: number;
  totalAgents: number;
  connected: number;
  totalConnectors: number;
  inbound: number;
  health: number | null;
  brainConnected: boolean;
  failedRuns: number;
  // Honest counterpart to activeAgents: how many agents (of activeAgents,
  // the ones with a real dependency actually wired up) have executed a run
  // in the trailing 24h — see lib/analytics.ts's countRanWithin. Being
  // "configured" (a connector connected, or chief-of-staff's last run ok)
  // only means an agent is *able* to run; it says nothing about whether its
  // schedule has actually fired. Before this field existed, a roster that
  // was fully configured but had never once run still read "10/10 agents
  // live" — see CLAUDE.md's 2026-08-21 agent-cron entry.
  ranRecently: number;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One honest sentence about what needs the operator, worst-first: failed runs,
 * an unhealthy brain, downed connectors, then inbound to reply to — always
 * anchored by the configured-vs-actually-ran agent facts. Leads with "All
 * nominal" only when nothing is actually wrong, which now includes "every
 * configured agent has actually run recently" — a roster that is merely
 * wired up but has never fired is not nominal, even with zero other issues.
 */
export function stateOfWorld(f: PulseFacts): StateSegment[] {
  const segs: StateSegment[] = [];
  const down = Math.max(0, f.totalConnectors - f.connected);
  const neverRan = Math.max(0, f.activeAgents - f.ranRecently);

  if (f.failedRuns > 0) segs.push({ text: `${plural(f.failedRuns, 'run')} failed`, tone: 'err' });
  if (!f.brainConnected) segs.push({ text: 'Knowledge store offline', tone: 'err' });
  else if (f.health != null && f.health < 70) segs.push({ text: `Knowledge store degraded ${f.health}/100`, tone: 'warn' });
  if (down > 0) segs.push({ text: `${plural(down, 'connector')} down`, tone: 'warn' });
  if (f.inbound > 0) segs.push({ text: `${f.inbound} inbound need reply`, tone: 'accent' });

  const hadAttention = segs.length > 0 || neverRan > 0;
  const tone: Tone = f.activeAgents === 0 ? 'dim' : neverRan > 0 ? 'warn' : 'ok';
  segs.push({ text: `${f.activeAgents}/${f.totalAgents} configured · ${f.ranRecently} ran in 24h`, tone });
  if (!hadAttention) segs.unshift({ text: 'All nominal', tone: 'ok' });

  return segs;
}
