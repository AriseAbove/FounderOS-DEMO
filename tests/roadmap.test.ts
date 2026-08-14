import { describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { groupRoadmapByQuarter, roadmapProgress } from '@/lib/roadmap';
import type { RoadmapItem } from '@/lib/schemas';

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
