import type { RoadmapItem } from '@/lib/schemas';

export type QuarterGroup = { quarter: string; items: RoadmapItem[] };

export type RoadmapProgress = {
  total: number;
  done: number;
  now: number;
  next: number;
  later: number;
  /** Whole-number percentage of items marked done; 0 for an empty roadmap. */
  percentDone: number;
};

/** Honest build-plan summary: what's shipped, what's in flight, what's queued. */
export function roadmapProgress(items: RoadmapItem[]): RoadmapProgress {
  const done = items.filter((i) => i.status === 'done').length;
  const now = items.filter((i) => i.status === 'now').length;
  const next = items.filter((i) => i.status === 'next').length;
  const later = items.filter((i) => i.status === 'later').length;
  const total = items.length;
  return { total, done, now, next, later, percentDone: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export type RoadmapSplit = { shipped: RoadmapItem[]; waiting: RoadmapItem[] };

const URGENCY: Record<RoadmapItem['status'], number> = { done: -1, now: 0, next: 1, later: 2 };

/**
 * Every AAC build plan reduces to two honest buckets, not a quarter-by-quarter
 * schedule: what's actually live, and what's still waiting — every remaining
 * item today is blocked on Sean himself (a credential only he holds, an OAuth
 * grant only he can authorize, or a decision only he can make), never on
 * agent time. `waiting` is ordered most-blocking first (status urgency, then
 * title) so the item needing him soonest reads at the top.
 */
export function splitRoadmap(items: RoadmapItem[]): RoadmapSplit {
  const shipped = items.filter((i) => i.status === 'done');
  const waiting = items
    .filter((i) => i.status !== 'done')
    .slice()
    .sort((a, b) => URGENCY[a.status] - URGENCY[b.status] || a.title.localeCompare(b.title));
  return { shipped, waiting };
}

export function groupRoadmapByQuarter(items: RoadmapItem[]): QuarterGroup[] {
  const byQuarter = new Map<string, RoadmapItem[]>();
  for (const item of items) {
    const bucket = byQuarter.get(item.quarter) ?? [];
    bucket.push(item);
    byQuarter.set(item.quarter, bucket);
  }
  // '2026-Q1' sorts chronologically as a plain string.
  return [...byQuarter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, quarterItems]) => ({ quarter, items: quarterItems }));
}
