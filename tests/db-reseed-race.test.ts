import { describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

// Reproduces the shape of Railway build failure aa9094d: a version-string-only
// bump to SEED_VERSION (zero schema changes) still hit
// `SqliteError: database is locked` / SQLITE_BUSY during `next build`.
// Root cause: Next.js's static-generation worker pool opens several
// connections to the same on-disk production file; every worker that sees a
// stale seed_version independently runs the ~100-statement reseed, and
// before this fix those statements were each auto-committed separately —
// many interleaved workers could hold the write lock long enough to exceed
// the 5s busy_timeout set in openDb (that pragma alone only ever covered the
// single-ALTER migration race from db-migration-race.test.ts, not a full
// reseed). Wrapping the whole reseed in one transaction (lib/seed.ts) fixes
// both the race (one fast commit per worker instead of dozens) and gives it
// real atomicity, which this test verifies directly.
describe('seedDatabase (single-transaction reseed)', () => {
  test('a mid-seed failure rolls back every write, not just the ones after it', () => {
    const db: FounderDb = openDb(':memory:');
    expect(db.departments.all().length).toBe(0); // fresh, unseeded

    // Departments/agents/people/sopTasks/workflows/skills all insert before
    // tools in seedDatabase's order — force the failure at tools to prove
    // everything earlier in the same transaction is undone too.
    const original = db.tools.insert;
    db.tools.insert = () => {
      throw new Error('boom — simulated mid-seed failure');
    };

    expect(() => seedDatabase(db)).toThrow('boom');

    // Rolled back: nothing from this attempt persisted, not even the rows
    // inserted before the throw.
    expect(db.departments.all().length).toBe(0);
    expect(db.agents.all().length).toBe(0);
    expect(db.seedMeta.get('seed_version')).toBeNull();

    // Restore and confirm a real seed still succeeds cleanly afterward.
    db.tools.insert = original;
    expect(() => seedDatabase(db)).not.toThrow();
    expect(db.departments.all().length).toBeGreaterThan(0);
    db.close();
  });
});
