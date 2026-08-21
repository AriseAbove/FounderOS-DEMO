import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { buildHierarchy, flattenNodes } from '@/lib/hierarchy';
import { liveAgentStatus } from '@/lib/agents/live-status';
import type { ConnectorStatus } from '@/lib/connectors/types';

let db: FounderDb;
afterEach(() => db?.close());

// Reproduces app/org/page.tsx's own pipeline: seed agents -> liveAgentStatus
// (the same rule Home, /agents, and /content already apply) -> buildHierarchy.
// Before this fix, /org rendered db.agents.all()'s static seed `status`
// completely untouched, so most of the roster — including Chief of Staff,
// which /agents correctly shows ACTIVE with real run history — rendered a
// hollow "planned" dot on the org chart regardless of what was actually
// connected or had actually run.
function liveOrgAgents(connections: ConnectorStatus[], lastRunByAgent = new Map<string, { ok: boolean; pushFailed?: boolean }>()) {
  db = openDb(':memory:');
  seedDatabase(db);
  return db.agents.all().map((a) => ({
    ...a,
    status: liveAgentStatus(a.id, connections, lastRunByAgent.get(a.id), a.status),
  }));
}

describe('/org must render live agent status, never the raw seed value', () => {
  test('conductor is always active — pure DB read, no connector required', () => {
    const agents = liveOrgAgents([]);
    expect(agents.find((a) => a.id === 'conductor')?.status).toBe('active');
  });

  test('chief-of-staff reads "planned" with no run history — matches /agents\' honest default', () => {
    const agents = liveOrgAgents([]);
    expect(agents.find((a) => a.id === 'chief-of-staff')?.status).toBe('planned');
  });

  test('chief-of-staff flips to "active" the moment it has a real, fully-successful run — this was the bug: /org used to show this agent "planned" (hollow dot) forever', () => {
    const lastRun = new Map([['chief-of-staff', { ok: true, pushFailed: false }]]);
    const agents = liveOrgAgents([], lastRun);
    expect(agents.find((a) => a.id === 'chief-of-staff')?.status).toBe('active');
  });

  test('gmail-worker/comms-agent flip to "active" once their connector reports connected', () => {
    const connections: ConnectorStatus[] = [
      { id: 'email', name: 'Email', kind: 'email', state: 'connected', detail: '' },
    ];
    const agents = liveOrgAgents(connections);
    expect(agents.find((a) => a.id === 'gmail-worker')?.status).toBe('active');
    expect(agents.find((a) => a.id === 'comms-agent')?.status).toBe('active');
  });

  test('the hierarchy built from the live-computed agents carries the live status through, so buildHierarchy\'s own activeAgents count is honest too', () => {
    const connections: ConnectorStatus[] = [
      { id: 'email', name: 'Email', kind: 'email', state: 'connected', detail: '' },
    ];
    const lastRun = new Map([['chief-of-staff', { ok: true, pushFailed: false }]]);
    const agents = liveOrgAgents(connections, lastRun);
    const departments = db.departments.all();
    const tree = buildHierarchy(departments, agents.filter((a) => a.id !== 'conductor'));
    const flat = tree.departments.flatMap((d) => flattenNodes(d.roots));
    const commsAgentNode = flat.find((n) => n.agent.id === 'comms-agent');
    expect(commsAgentNode?.agent.status).toBe('active');
    // Sanity: buildHierarchy's own activeAgents tally reflects the live
    // statuses fed into it, not whatever the seed originally said.
    expect(tree.activeAgents).toBeGreaterThan(0);
  });

  test('an agent with no live rule and no connector keeps its honest "planned" seed default (never guessed active)', () => {
    const agents = liveOrgAgents([]);
    const socialPulse = agents.find((a) => a.id === 'social-pulse');
    expect(socialPulse?.status).toBe('planned');
  });
});
