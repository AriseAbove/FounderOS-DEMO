import { describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { buildKnowledgeGraph } from '@/lib/knowledge-graph';
import { ACTION_LENSES, ALL_LENSES, ENTITY_LENSES, FUNCTION_LENSES, lensNodeSet, type LensContext } from '@/lib/graph-lens';

function contextFromSeed(): LensContext {
  const db: FounderDb = openDb(':memory:');
  seedDatabase(db);
  const graph = buildKnowledgeGraph(db.agents.all(), db.departments.all(), db.people.all(), db.sopTasks.all());
  // dept resolver mirroring the component's teamForFocus: worker → its dept
  const deptOf = new Map<string, string>();
  for (const a of db.agents.all()) deptOf.set(`emp:${a.id}`, `team:${a.departmentId}`);
  for (const p of db.people.all()) deptOf.set(`person:${p.id}`, `team:${p.departmentId}`);
  return { nodes: graph.nodes, teamOf: (id) => deptOf.get(id) ?? null };
}

const ctx = contextFromSeed();

describe('graph lenses', () => {
  test('the categories all exist and ids never collide', () => {
    expect(ENTITY_LENSES.map((l) => l.label)).toEqual([
      'All people', 'Sub-agents', 'Tools', 'Workflows', 'SOPs', 'Projects', 'Departments',
    ]);
    expect(FUNCTION_LENSES.map((l) => l.label)).toContain('Core');
    expect(FUNCTION_LENSES.map((l) => l.label)).toContain('Enabling');
    expect(ACTION_LENSES.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ALL_LENSES.map((l) => l.id)).size).toBe(ALL_LENSES.length);
  });

  test('entity lenses match by node kind against the real seeded graph', () => {
    // invented staff purged — the people lens is honestly empty
    expect(lensNodeSet('ent-people', ctx).size).toBe(0);
    expect(lensNodeSet('ent-subagents', ctx).size).toBe(8);
    // only staffed pillars appear as team nodes (sales, tech, comms, finance, marketing-growth)
    expect(lensNodeSet('ent-departments', ctx).size).toBe(5);
    expect(lensNodeSet('ent-sops', ctx).size).toBe(8);
  });

  test('workflows and projects are honestly empty until modeled', () => {
    expect(lensNodeSet('ent-workflows', ctx).size).toBe(0);
    expect(lensNodeSet('ent-projects', ctx).size).toBe(0);
  });

  test('core and enabling split the pillars cleanly and light whole sectors', () => {
    const core = lensNodeSet('fn-core', ctx);
    const enabling = lensNodeSet('fn-enabling', ctx);
    // Sales staffed up with Allo Pulse — the first core (revenue-driving)
    // sector lights: the sales team node plus its lead-intake agent.
    expect(core.has('team:dept-sales')).toBe(true);
    expect(core.has('emp:allo-pulse')).toBe(true);
    expect(enabling.has('team:dept-tech')).toBe(true);
    // a node is never both core and enabling
    for (const id of core) expect(enabling.has(id), id).toBe(false);
    // sectors include their workers, not just the gateways
    expect(enabling.has('emp:gmail-worker')).toBe(true);
  });

  test('every action lens resolves to real seeded agents', () => {
    for (const lens of ACTION_LENSES) {
      const set = lensNodeSet(lens.id, ctx);
      expect(set.size, lens.label).toBeGreaterThan(0);
      for (const id of set) expect(id.startsWith('emp:'), `${lens.label} → ${id}`).toBe(true);
    }
  });

  test('specific action mappings hold', () => {
    expect(lensNodeSet('act-inbox-triage', ctx).has('emp:gmail-worker')).toBe(true);
    expect(lensNodeSet('act-schedule', ctx).has('emp:calendar-worker')).toBe(true);
    expect(lensNodeSet('act-books', ctx).has('emp:quickbooks-pulse')).toBe(true);
    expect(lensNodeSet('act-knowledge-search', ctx).has('emp:data-agent')).toBe(true);
    expect(lensNodeSet('act-broadcast', ctx).has('emp:conductor')).toBe(true);
  });

  test('unknown lens returns an empty set, never throws', () => {
    expect(lensNodeSet('nope', ctx).size).toBe(0);
  });
});
