import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { groupRoadmapByQuarter, roadmapProgress, splitRoadmap } from '@/lib/roadmap';
import type { RoadmapItem } from '@/lib/schemas';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const ITEMS: RoadmapItem[] = [
  { id: 'a', title: 'A', quarter: '2026-Q3', status: 'done', departmentId: null, description: '' },
  { id: 'b', title: 'B', quarter: '2026-Q3', status: 'done', departmentId: null, description: '' },
  { id: 'c', title: 'C', quarter: '2026-Q3', status: 'now', departmentId: null, description: '' },
  { id: 'd', title: 'D', quarter: '2026-Q4', status: 'next', departmentId: null, description: '' },
  { id: 'e', title: 'E', quarter: '2026-Q4', status: 'later', departmentId: null, description: '' },
];

describe('roadmapProgress', () => {
  test('counts every status and computes a done percentage', () => {
    const p = roadmapProgress(ITEMS);
    expect(p.total).toBe(5);
    expect(p.done).toBe(2);
    expect(p.now).toBe(1);
    expect(p.next).toBe(1);
    expect(p.later).toBe(1);
    expect(p.percentDone).toBe(40); // 2/5
  });

  test('empty roadmap is honestly zero, never divides by zero', () => {
    const p = roadmapProgress([]);
    expect(p).toEqual({ total: 0, done: 0, now: 0, next: 0, later: 0, percentDone: 0 });
  });

  test('rounds the percentage to the nearest whole number', () => {
    const p = roadmapProgress([ITEMS[0], ITEMS[2], ITEMS[3]]); // 1 done of 3 → 33%
    expect(p.percentDone).toBe(33);
  });
});

describe('splitRoadmap', () => {
  test('splits done from everything else — no quarter/schedule framing', () => {
    const { shipped, waiting } = splitRoadmap(ITEMS);
    expect(shipped.map((i) => i.id)).toEqual(['a', 'b']);
    expect(waiting.map((i) => i.id)).toEqual(['c', 'd', 'e']); // now, then next, then later
  });

  test('waiting items sort by urgency first, title second — never by quarter', () => {
    const items: RoadmapItem[] = [
      { id: 'z-later', title: 'Z later item', quarter: '2026-Q4', status: 'later', departmentId: null, description: '' },
      { id: 'a-now', title: 'A now item', quarter: '2027-Q1', status: 'now', departmentId: null, description: '' },
      { id: 'b-now', title: 'B now item', quarter: '2026-Q3', status: 'now', departmentId: null, description: '' },
    ];
    const { waiting } = splitRoadmap(items);
    // urgency wins even though the 'later' item's quarter string sorts earliest
    expect(waiting.map((i) => i.id)).toEqual(['a-now', 'b-now', 'z-later']);
  });

  test('empty roadmap splits to two empty arrays', () => {
    expect(splitRoadmap([])).toEqual({ shipped: [], waiting: [] });
  });
});

describe('roadmap seed data reflects the real build plan', () => {
  test('the seeded roadmap is never empty and always resolves to a valid progress summary', () => {
    const db: FounderDb = openDb(':memory:');
    seedDatabase(db);
    const items = db.roadmap.all();
    expect(items.length).toBeGreaterThan(0);
    const p = roadmapProgress(items);
    expect(p.total).toBe(items.length);
    expect(p.done + p.now + p.next + p.later).toBe(p.total);
    db.close();
  });

  test('groupRoadmapByQuarter output is still ordered chronologically with the extra items in place', () => {
    const db: FounderDb = openDb(':memory:');
    seedDatabase(db);
    const quarters = groupRoadmapByQuarter(db.roadmap.all());
    const labels = quarters.map((q) => q.quarter);
    expect(labels).toEqual([...labels].sort());
    db.close();
  });
});

// Regression: "12/12 · 100% shipped · Nothing waiting on you" was true only
// for this fixed rebuild-milestone checklist (a hand-curated seed array —
// see lib/seed.ts's `roadmap`), but read as a blanket claim about the whole
// app. Real, live gaps (an unconfigured connector on /integrations, a
// not-yet-set secret) don't contradict a 100% here — they're a different
// scope entirely, computed from a different source (live connector status,
// not this static checklist). The page must say so, not just imply it.
describe('/roadmap page — scope is stated plainly, not just implied', () => {
  const page = () => read('app/roadmap/page.tsx');

  test('the intro explains this tracks the rebuild plan, not live connector/credential status', () => {
    expect(page()).toMatch(/not live connector or credential status/);
    expect(page()).toMatch(/href="\/integrations"/);
  });

  test('the empty "waiting" state does not claim nothing anywhere needs Sean', () => {
    const src = page();
    expect(src).not.toMatch(/Nothing waiting — everything buildable is built and live\./);
    expect(src).toMatch(/Nothing waiting on the rebuild plan/);
  });

  test('section labels name the rebuild-plan scope explicitly', () => {
    const src = page();
    expect(src).toMatch(/Rebuild milestones shipped/);
    expect(src).toMatch(/Waiting on you \(rebuild plan\)/);
  });
});
