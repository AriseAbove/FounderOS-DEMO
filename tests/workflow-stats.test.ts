import { describe, it, expect } from 'vitest';
import { workflowStats, workflowsForBusiness } from '@/lib/workflow-stats';
import type { Workflow } from '@/lib/schemas';

const wf: Workflow = {
  id: 'w',
  name: 'W',
  subtitle: '',
  revenueUsd: 100_000,
  order: 0,
  business: 'shared',
  steps: [
    { id: 's1', title: 'A', ownerKind: 'human', owner: 'Sean', hoursPerWeek: 10, tools: ['attio', 'gmail'], edgeLabel: 'x', leakUsd: 14_000, automation: null },
    { id: 's2', title: 'B', ownerKind: 'agent', owner: 'Bot', hoursPerWeek: 6, tools: ['attio', 'zernio'], edgeLabel: null, leakUsd: null, automation: { title: 'Auto', state: 'live', recoveredUsd: 4000 } },
    { id: 's3', title: 'C', ownerKind: 'human', owner: 'Sean', hoursPerWeek: 5, tools: ['gmail'], edgeLabel: null, leakUsd: 6000, automation: { title: 'Sug', state: 'suggested', recoveredUsd: 6000 } },
  ],
};

describe('workflowStats', () => {
  it('sums manual (human) vs agent hours per week', () => {
    const s = workflowStats(wf);
    expect(s.manualHours).toBe(15);
    expect(s.agentHours).toBe(6);
  });

  it('sums leaks and splits automation returns by live vs suggested', () => {
    const s = workflowStats(wf);
    expect(s.leakUsd).toBe(20_000);
    expect(s.liveReturnsUsd).toBe(4000);
    expect(s.suggestedReturnsUsd).toBe(6000);
  });

  it('counts humans, agents, distinct tools, and automations', () => {
    const s = workflowStats(wf);
    expect(s.humanSteps).toBe(2);
    expect(s.agentSteps).toBe(1);
    expect(s.toolCount).toBe(3); // attio, gmail, zernio deduped
    expect(s.automationCount).toBe(2);
  });

  it('is all-zero for an empty workflow', () => {
    const s = workflowStats({ ...wf, steps: [] });
    expect(s).toMatchObject({ manualHours: 0, agentHours: 0, leakUsd: 0, toolCount: 0, automationCount: 0 });
  });
});

/**
 * 2026-08-21 fix: /workflows had no business dimension — every workflow now
 * carries an aac/apps/shared tag (WorkflowBusinessSchema, lib/schemas.ts) so
 * the page can scope its display to the Topbar's business switcher the same
 * way /org and /funnel already do. workflowsForBusiness is the pure filter
 * the page reads.
 */
describe('workflowsForBusiness', () => {
  const aac: Workflow = { ...wf, id: 'w-aac', business: 'aac' };
  const apps: Workflow = { ...wf, id: 'w-apps', business: 'apps' };
  const shared: Workflow = { ...wf, id: 'w-shared', business: 'shared' };
  const all = [aac, apps, shared];

  it('"all" (combined) shows every workflow, unfiltered — the pre-fix default behavior', () => {
    expect(workflowsForBusiness(all, 'all')).toEqual(all);
  });

  it('"aac" shows AAC-tagged and shared workflows, excludes Apps-only ones', () => {
    expect(workflowsForBusiness(all, 'aac').map((w) => w.id)).toEqual(['w-aac', 'w-shared']);
  });

  it('"apps" shows Apps-tagged and shared workflows, excludes AAC-only ones', () => {
    expect(workflowsForBusiness(all, 'apps').map((w) => w.id)).toEqual(['w-apps', 'w-shared']);
  });
});
