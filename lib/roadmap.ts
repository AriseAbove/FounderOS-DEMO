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
