import { describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { safeAlter } from '@/lib/db';

// Reproduces the exact Railway build failure from deployment c28185cc:
// Next.js's static-page-generation pool opens several concurrent connections
// to the same on-disk SQLite file (the production DB lives on a mounted
// volume, and build-time SSG touches it too). Every connection runs the same
// check-then-ALTER migration; the "check" and the "ALTER" aren't atomic
// across separate processes, so a second connection can see a column
// missing, lose the race, and crash the whole build with
// `SqliteError: duplicate column name: parent_id` -- on a commit that never
// touched migration code at all (it only added a catalog entry).
describe('safeAlter (concurrent-migration race safety)', () => {
  test('swallows a duplicate-column error -- another connection already won the identical race', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE agents (id TEXT PRIMARY KEY)');
    db.exec('ALTER TABLE agents ADD COLUMN parent_id TEXT'); // the "winning" connection
    // The "losing" connection's identical migration attempt must not throw.
    expect(() =>
      safeAlter(db, 'ALTER TABLE agents ADD COLUMN parent_id TEXT'),
    ).not.toThrow();
    db.close();
  });

  test('still throws on a genuinely different error (not masking real bugs)', () => {
    const db = new Database(':memory:');
    expect(() =>
      safeAlter(db, 'ALTER TABLE not_a_real_table ADD COLUMN x TEXT'),
    ).toThrow();
    db.close();
  });
});
