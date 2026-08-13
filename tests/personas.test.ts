import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

let db: FounderDb;
afterEach(() => db?.close());

describe('personas', () => {
  test('the persona library seeds empty — demo templates retired', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.personas.all()).toEqual([]);
  });

  test('re-seeding clears previously-seeded persona rows from older DBs', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.personas.insert({
      id: 'persona-old', order: 1, name: 'Old Demo', archetype: 'x', tagline: 't',
      summary: 's', accent: '#fff', northStar: 'n', pillars: [], connectors: [],
      metrics: [], brainUse: 'b', signaturePlay: 'p',
    });
    seedDatabase(db);
    expect(db.personas.all()).toEqual([]);
  });
});
