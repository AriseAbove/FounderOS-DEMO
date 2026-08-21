import { afterEach, describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, BUSY_TIMEOUT_MS, type FounderDb } from '@/lib/db';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('openDb', () => {
  // Regression guard for the Railway build failure on the "Docs: document
  // the honest-tools chatTools fix" commit: `SqliteError: database is
  // locked` (SQLITE_BUSY) thrown right on openDb's own pragma call, because
  // a build-time static-generation connection raced the live production
  // process on the same mounted volume and the old 5s busy_timeout wasn't
  // enough to outlast it. This doesn't reproduce the race itself (that
  // needs two real processes on one on-disk file) — it just pins the
  // generous timeout so nobody quietly shrinks it back toward the old
  // failure threshold.
  test('busy_timeout is generous enough to outlast real production write contention, not the SQLite default of 0', () => {
    expect(BUSY_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000);
  });

  test('creates an empty database with all tables queryable', () => {
    db = openDb(':memory:');
    expect(db.departments.all()).toEqual([]);
    expect(db.agents.all()).toEqual([]);
    expect(db.tools.all()).toEqual([]);
    expect(db.roadmap.all()).toEqual([]);
    expect(db.metrics.all()).toEqual([]);
    expect(db.domains.all()).toEqual([]);
    expect(db.phases.all()).toEqual([]);
  });

  test('round-trips an agent including its tools array', () => {
    db = openDb(':memory:');
    db.departments.insert({
      id: 'dept-tech',
      name: 'Tech & Automations',
      slug: 'tech',
      tagline: 'Build the machine that builds.',
      color: '#3b82f6',
      order: 1,
    });
    const agent = {
      id: 'agent-command-center',
      departmentId: 'dept-tech',
      name: 'Command Center',
      role: 'Chief Orchestrator',
      status: 'active' as const,
      tier: 'lead' as const,
      description: 'Routes work across the agent fleet via OpenClaw.',
      model: 'claude-fable-5',
      tools: ['openclaw', 'mcp'],
      parentId: null,
      instance: 'builtin',
    };
    db.agents.insert(agent);
    expect(db.agents.all()).toEqual([agent]);
  });

  test('lists agents scoped to a department', () => {
    db = openDb(':memory:');
    db.departments.insert({
      id: 'dept-a',
      name: 'A',
      slug: 'a',
      tagline: '',
      color: '#fff',
      order: 1,
    });
    db.departments.insert({
      id: 'dept-b',
      name: 'B',
      slug: 'b',
      tagline: '',
      color: '#fff',
      order: 2,
    });
    const base = {
      role: 'r',
      status: 'idle' as const,
      tier: 'specialist' as const,
      description: '',
      model: 'm',
      tools: [],
      parentId: null,
      instance: 'builtin',
    };
    db.agents.insert({ ...base, id: 'a1', departmentId: 'dept-a', name: 'A1' });
    db.agents.insert({ ...base, id: 'b1', departmentId: 'dept-b', name: 'B1' });
    expect(db.agents.byDepartment('dept-a').map((a) => a.id)).toEqual(['a1']);
  });

  test('returns departments ordered by their order column', () => {
    db = openDb(':memory:');
    db.departments.insert({
      id: 'second',
      name: 'Second',
      slug: 's2',
      tagline: '',
      color: '#fff',
      order: 2,
    });
    db.departments.insert({
      id: 'first',
      name: 'First',
      slug: 's1',
      tagline: '',
      color: '#fff',
      order: 1,
    });
    expect(db.departments.all().map((d) => d.id)).toEqual(['first', 'second']);
  });

  test('round-trips a business reference model domain with items array', () => {
    db = openDb(':memory:');
    const domain = {
      id: 'brm-9',
      number: 9,
      title: 'Legal',
      color: '#fbbf24',
      items: ['Contracts', 'Compliance'],
    };
    db.domains.insert(domain);
    expect(db.domains.all()).toEqual([domain]);
  });

  // 2026-08-21 fix: /workflows had no business dimension at all — every
  // workflow now carries an aac/apps/shared tag so the page can scope its
  // display to the Topbar's business switcher the same way /org and /funnel
  // already do.
  test('round-trips a workflow including its new business tag', () => {
    db = openDb(':memory:');
    const workflow = {
      id: 'w-aac-1',
      name: 'AAC lead intake',
      subtitle: '',
      revenueUsd: 0,
      order: 0,
      steps: [],
      business: 'aac' as const,
    };
    db.workflows.insert(workflow);
    expect(db.workflows.all()).toEqual([workflow]);
  });

  test('a workflows table created before the business column exists migrates rows to the honest "shared" default', () => {
    const dir = mkdtempSync(join(tmpdir(), 'founder-os-workflows-migration-'));
    const file = join(dir, 'test.db');
    try {
      // Simulate a pre-fix on-disk DB: the old workflows table, no `business`
      // column, one real row already in it.
      const raw = new Database(file);
      raw.exec(`CREATE TABLE workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        revenue_usd INTEGER NOT NULL DEFAULT 0,
        ord INTEGER NOT NULL DEFAULT 0,
        steps TEXT NOT NULL DEFAULT '[]'
      )`);
      raw
        .prepare('INSERT INTO workflows (id, name, subtitle, revenue_usd, ord, steps) VALUES (?, ?, ?, ?, ?, ?)')
        .run('w-old', 'Pre-migration workflow', '', 0, 0, '[]');
      raw.close();

      db = openDb(file);
      expect(db.workflows.all()).toEqual([
        { id: 'w-old', name: 'Pre-migration workflow', subtitle: '', revenueUsd: 0, order: 0, steps: [], business: 'shared' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
