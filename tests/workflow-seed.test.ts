import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

// The seeded /workflows entries: AAC's real, documented business processes
// (203(k) draws, the 14-week trade sequence, permitting, review requests,
// project kickoff, and lead follow-up). No dollar or hours-per-week figure
// is invented here — every numeric field the schema doesn't get real data
// for stays an honest 0/null (see the comment above `workflows` in
// lib/seed.ts). This file pins the six real workflows exist, are shaped
// right, and survive a re-seed.
describe('seeded AAC workflows', () => {
  test('exactly the six real, documented AAC processes are seeded', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const ids = db.workflows.all().map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
    expect(ids).toEqual([
      'wf-203k-draw-request',
      'wf-reno-trade-sequence',
      'wf-permit-application',
      'wf-review-request-followup',
      'wf-project-kickoff-checklist',
      'wf-lead-followup-cadence',
    ]);
  });

  test('none of the seeded workflows invent a dollar or hours figure', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    for (const w of db.workflows.all()) {
      expect(w.revenueUsd, w.id).toBe(0);
      for (const s of w.steps) {
        expect(s.hoursPerWeek, `${w.id}/${s.id}`).toBe(0);
        expect(s.leakUsd, `${w.id}/${s.id}`).toBeNull();
        expect(s.automation, `${w.id}/${s.id}`).toBeNull();
      }
    }
  });

  test('the 203(k) draw process runs milestone → HUD inspection → lender release → pay subs', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const wf = db.workflows.all().find((w) => w.id === 'wf-203k-draw-request')!;
    expect(wf).toBeDefined();
    expect(wf.subtitle.toLowerCase()).toMatch(/never.*ahead of draws/);
    expect(wf.steps.map((s) => s.title)).toEqual([
      'Complete milestone of work',
      'Call HUD consultant to schedule inspection',
      'Consultant inspects & approves draw',
      'Lender releases funds (3–5 business days)',
      'Pay subs & materials from the draw',
    ]);
  });

  test('the full renovation trade sequence covers all 14 weeks, demo through final punch', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const wf = db.workflows.all().find((w) => w.id === 'wf-reno-trade-sequence')!;
    expect(wf).toBeDefined();
    expect(wf.steps[0].title).toMatch(/Week 1 — Demo crew/);
    expect(wf.steps.at(-1)!.title).toMatch(/Week 14 — Final punch/);
    // the documented countertop lead time survives as a real edge label
    const measure = wf.steps.find((s) => s.title.includes('Countertops: measure'));
    expect(measure?.edgeLabel).toBe('7–10 day lead time');
    // every real week 1-14 milestone from the process doc is represented
    for (const week of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
      expect(wf.steps.some((s) => s.title.startsWith(`Week ${week} —`)), `week ${week}`).toBe(true);
    }
  });

  test('the permit process never lets work start before approval', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const wf = db.workflows.all().find((w) => w.id === 'wf-permit-application')!;
    expect(wf).toBeDefined();
    expect(wf.steps.at(-1)!.title.toLowerCase()).toMatch(/never start before it, no exceptions/);
    // the real jurisdiction wait times from the doc are attached, not invented
    const submit = wf.steps.find((s) => s.tools.includes('projectdox'));
    expect(submit?.edgeLabel).toMatch(/Detroit ProjectDox 3–6wk/);
  });

  test('the review-request follow-up fires within 48 hours with a real Google review link', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const wf = db.workflows.all().find((w) => w.id === 'wf-review-request-followup')!;
    expect(wf).toBeDefined();
    expect(wf.steps[0].edgeLabel).toBe('within 48 hours');
    expect(wf.steps.some((s) => s.tools.includes('google-reviews'))).toBe(true);
  });

  test('the kickoff checklist collects at least a 30% deposit before anything else', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const wf = db.workflows.all().find((w) => w.id === 'wf-project-kickoff-checklist')!;
    expect(wf).toBeDefined();
    expect(wf.steps[0].title).toMatch(/minimum 30%/);
    expect(wf.steps.at(-1)!.title).toMatch(/File signed contract/);
  });

  test('the lead follow-up cadence matches the real 24h/3d/7d/14d/21d schedule', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const wf = db.workflows.all().find((w) => w.id === 'wf-lead-followup-cadence')!;
    expect(wf).toBeDefined();
    expect(wf.steps[0].title).toMatch(/24 business hours/);
    expect(wf.steps.find((s) => s.title.includes('Follow up'))?.title).toMatch(/3, 7, and 14 days/);
    expect(wf.steps.at(-1)!.title).toMatch(/21 days/);
  });

  test('is idempotent — re-seeding does not duplicate or drop workflows', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const before = db.workflows.all().length;
    seedDatabase(db);
    expect(db.workflows.all().length).toBe(before);
  });

  test('re-seeding purges a stale workflow that left the model', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.workflows.insert({
      id: 'wf-ghost',
      name: 'Ghost workflow',
      subtitle: 'stale',
      revenueUsd: 0,
      business: 'aac',
      order: 99,
      steps: [],
    });
    seedDatabase(db);
    expect(db.workflows.all().some((w) => w.id === 'wf-ghost')).toBe(false);
  });

  test('seeded workflow rows pass schema validation end to end', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(() => db.workflows.all()).not.toThrow();
  });
});
