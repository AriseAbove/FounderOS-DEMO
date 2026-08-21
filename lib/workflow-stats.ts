import type { Workflow } from '@/lib/schemas';
import type { BusinessFilter } from '@/lib/business-filter';

/**
 * The bottom-bar numbers for a workflow: how much human time it burns, how much
 * money leaks at its bottlenecks, and how much the automations carry back
 * (live) or would carry (suggested). Pure + tested so the map stays a renderer.
 */
export type WorkflowStats = {
  manualHours: number; // human step hours / week
  agentHours: number; // agent step hours / week
  leakUsd: number; // $/mo bleeding across all bottleneck steps
  liveReturnsUsd: number; // $/mo recovered by live automations
  suggestedReturnsUsd: number; // $/mo suggested automations would recover
  humanSteps: number;
  agentSteps: number;
  toolCount: number; // distinct tools across all steps
  automationCount: number; // steps carrying an automation
};

export function workflowStats(workflow: Workflow): WorkflowStats {
  const tools = new Set<string>();
  let manualHours = 0;
  let agentHours = 0;
  let leakUsd = 0;
  let liveReturnsUsd = 0;
  let suggestedReturnsUsd = 0;
  let humanSteps = 0;
  let agentSteps = 0;
  let automationCount = 0;

  for (const s of workflow.steps) {
    if (s.ownerKind === 'human') {
      humanSteps += 1;
      manualHours += s.hoursPerWeek;
    } else {
      agentSteps += 1;
      agentHours += s.hoursPerWeek;
    }
    if (s.leakUsd) leakUsd += s.leakUsd;
    for (const t of s.tools) tools.add(t);
    if (s.automation) {
      automationCount += 1;
      if (s.automation.state === 'live') liveReturnsUsd += s.automation.recoveredUsd;
      else suggestedReturnsUsd += s.automation.recoveredUsd;
    }
  }

  return {
    manualHours,
    agentHours,
    leakUsd,
    liveReturnsUsd,
    suggestedReturnsUsd,
    humanSteps,
    agentSteps,
    toolCount: tools.size,
    automationCount,
  };
}

/**
 * Scope the workflow list to the Topbar's selected business (2026-08-21
 * fix) — the same lens /org and /funnel already read. A workflow tagged
 * 'shared' shows under every selection since it's genuinely cross-cutting;
 * 'all' (combined) shows every workflow unfiltered, exactly as before this
 * fix. Pure so it's directly testable without a DB or a rendered page.
 */
export function workflowsForBusiness(workflows: Workflow[], filter: BusinessFilter): Workflow[] {
  if (filter === 'all') return workflows;
  return workflows.filter((w) => w.business === filter || w.business === 'shared');
}
