import path from 'node:path';
import fs from 'node:fs';
import { openDb, type FounderDb } from '@/lib/db';
import { SEED_VERSION, seedDatabase } from '@/lib/seed';

/**
 * App-level singleton. Larp-first, real-ready: every page and API route reads
 * through this seeded SQLite database, so swapping in live sources later is a
 * repo-level change, not a UI rewrite.
 */
let instance: FounderDb | null = null;

export function getDb(): FounderDb {
  if (instance) return instance;
  const dbPath = process.env.FOUNDER_OS_DB ?? path.join(process.cwd(), 'data', 'founder-os.db');
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  instance = openDb(dbPath);
  // Seed on first touch, and re-seed ONCE whenever the seed baseline version
  // changes (picks up new baseline rows and purges retired ones). Real
  // recorded data always survives a re-seed — the purge clauses only remove
  // rows the seed itself created.
  if (
    instance.departments.all().length === 0 ||
    instance.seedMeta.get('seed_version') !== SEED_VERSION
  ) {
    seedDatabase(instance);
  }
  return instance;
}
