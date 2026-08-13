import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('seedDatabase', () => {
  test('populates the honest baseline', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.departments.all().length).toBeGreaterThanOrEqual(5);
    expect(db.agents.all().length).toBeGreaterThanOrEqual(5);
    expect(db.metrics.all().length).toBeGreaterThanOrEqual(3);
    expect(db.skills.all().length).toBeGreaterThanOrEqual(3);
    // Purged in Phase 2: invented staff and invented work items stay gone.
    expect(db.people.all().length).toBe(0);
    expect(db.agentTasks.all().length).toBe(0);
  });

  test('every agent belongs to an existing department', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const deptIds = new Set(db.departments.all().map((d) => d.id));
    for (const agent of db.agents.all()) {
      expect(deptIds.has(agent.departmentId)).toBe(true);
    }
  });

  test('every seeded agent maps to a real runtime agent — no larp', async () => {
    const { realAgents } = await import('@/lib/agents/real');
    db = openDb(':memory:');
    seedDatabase(db);
    const runtimeIds = new Set(realAgents.map((a) => a.id));
    for (const agent of db.agents.all()) {
      expect(runtimeIds.has(agent.id)).toBe(true);
    }
  });

  test('the six operating pillars, in order', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.departments.all().map((d) => d.name)).toEqual([
      'Sales',
      'Marketing/Growth',
      'TECH',
      'Finances',
      'Communications',
      'Clients',
    ]);
  });

  test('agents are homed in the right department', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const byId = new Map(db.agents.all().map((a) => [a.id, a.departmentId]));
    for (const id of ['conductor', 'data-agent']) {
      expect(byId.get(id)).toBe('dept-tech');
    }
    for (const id of ['comms-agent', 'gmail-worker', 'calendar-worker']) {
      expect(byId.get(id)).toBe('dept-comms');
    }
    expect(byId.get('quickbooks-pulse')).toBe('dept-finance');
    expect(byId.get('allo-pulse')).toBe('dept-sales');
  });

  test('re-seeding removes departments that left the model', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.departments.insert({ id: 'dept-ghost', name: 'Ghost', slug: 'ghost', tagline: '', color: '#fff', order: 99 });
    seedDatabase(db);
    expect(db.departments.all().some((d) => d.id === 'dept-ghost')).toBe(false);
  });

  test('instance agents have task workers parented beneath them', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const byId = new Map(db.agents.all().map((a) => [a.id, a]));

    // Comms: the channel workers that feed /comms hang off the comms agent
    for (const worker of ['gmail-worker', 'calendar-worker']) {
      expect(byId.get(worker)?.parentId).toBe('comms-agent');
      expect(byId.get(worker)?.tier).toBe('worker');
    }
    // Top-level agents are instance slots
    expect(byId.get('comms-agent')?.parentId).toBeNull();
    expect(byId.get('comms-agent')?.instance).not.toBe('');
    expect(byId.get('conductor')?.parentId).toBeNull();
    expect(byId.get('quickbooks-pulse')?.parentId).toBeNull();
  });

  test('re-seeding removes agents that left the roster', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.agents.insert({
      id: 'ghost', departmentId: 'dept-tech', name: 'Ghost', role: 'r', status: 'active',
      tier: 'lead', description: '', model: 'm', tools: [], parentId: null, instance: 'builtin',
    });
    seedDatabase(db);
    expect(db.agents.all().some((a) => a.id === 'ghost')).toBe(false);
  });

  test('re-seeding clears the retired invented agent-task rows', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    // an older DB still holding a pre-purge seeded task + a real user task
    const ts = '2026-08-01T00:00:00.000Z';
    db.agentTasks.insert({ id: 'task-seed-2', agentId: 'conductor', title: 'retired larp task', status: 'open', createdAt: ts, updatedAt: ts });
    db.agentTasks.insert({ id: 'task-user-1', agentId: 'conductor', title: 'real user task', status: 'open', createdAt: ts, updatedAt: ts });
    seedDatabase(db);
    const ids = db.agentTasks.all().map((t) => t.id);
    expect(ids).not.toContain('task-seed-2');
    expect(ids).toContain('task-user-1');
  });

  test('is idempotent — seeding twice does not duplicate rows', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const counts = {
      departments: db.departments.all().length,
      agents: db.agents.all().length,
      tools: db.tools.all().length,
    };
    seedDatabase(db);
    expect(db.departments.all().length).toBe(counts.departments);
    expect(db.agents.all().length).toBe(counts.agents);
    expect(db.tools.all().length).toBe(counts.tools);
  });

  test('seeded data passes schema validation end to end', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    // openDb repos parse rows through Zod on the way out, so a full read
    // of every table proves the seed data conforms to every schema.
    expect(() => {
      db.departments.all();
      db.agents.all();
      db.tools.all();
      db.roadmap.all();
      db.metrics.all();
      db.domains.all();
      db.phases.all();
    }).not.toThrow();
  });
});

describe('roadmap grouping', () => {
  test('groups roadmap items by quarter in chronological order', async () => {
    const { groupRoadmapByQuarter } = await import('@/lib/roadmap');
    db = openDb(':memory:');
    seedDatabase(db);
    const grouped = groupRoadmapByQuarter(db.roadmap.all());
    const quarters = grouped.map((g) => g.quarter);
    expect(quarters.length).toBeGreaterThanOrEqual(1);
    expect([...quarters].sort()).toEqual(quarters);
    for (const group of grouped) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});
