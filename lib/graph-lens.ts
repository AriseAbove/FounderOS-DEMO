/**
 * Lenses over the operating knowledge graph: slice the same nodes three ways —
 * by ENTITY TYPE, by BUSINESS FUNCTION (revenue-driving core vs enabling),
 * and by ACTION (what a thing is actually used for). Picking a lens lights
 * the matching nodes and dims the rest. Pure data + matchers; the component
 * supplies the node list and a department resolver.
 *
 * Trimmed in the Phase 2 purge: the previous venture-team and marketing-action
 * lenses described the demo's fictional agency roster. New lenses land here
 * as real capabilities do.
 */

export type LensGroup = 'entity' | 'function' | 'action';

export type Lens = { id: string; group: LensGroup; label: string };

export type LensNode = { id: string; kind: string };

export type LensContext = {
  nodes: LensNode[];
  /** resolves any node to its pillar's team node id (`team:dept-…`), or null */
  teamOf: (nodeId: string) => string | null;
};

export const ENTITY_LENSES: Lens[] = [
  { id: 'ent-people', group: 'entity', label: 'All people' },
  { id: 'ent-subagents', group: 'entity', label: 'Sub-agents' },
  { id: 'ent-tools', group: 'entity', label: 'Tools' },
  { id: 'ent-workflows', group: 'entity', label: 'Workflows' },
  { id: 'ent-sops', group: 'entity', label: 'SOPs' },
  { id: 'ent-projects', group: 'entity', label: 'Projects' },
  { id: 'ent-departments', group: 'entity', label: 'Departments' },
];

export const FUNCTION_LENSES: Lens[] = [
  { id: 'fn-core', group: 'function', label: 'Core' },
  { id: 'fn-enabling', group: 'function', label: 'Enabling' },
];

export const ACTION_LENSES: Lens[] = [
  { id: 'act-inbox-triage', group: 'action', label: 'Inbox triage' },
  { id: 'act-schedule', group: 'action', label: 'Schedule awareness' },
  { id: 'act-books', group: 'action', label: 'Books & invoices' },
  { id: 'act-knowledge-search', group: 'action', label: 'Knowledge search' },
  { id: 'act-broadcast', group: 'action', label: 'Fleet broadcast' },
];

export const ALL_LENSES: Lens[] = [...ENTITY_LENSES, ...FUNCTION_LENSES, ...ACTION_LENSES];

/** Revenue-driving pillars vs the ones that keep the machine running. */
const CORE_DEPTS = new Set(['team:dept-sales', 'team:dept-marketing-growth', 'team:dept-clients']);
const ENABLING_DEPTS = new Set(['team:dept-tech', 'team:dept-finance', 'team:dept-comms']);

/** What each action actually runs on — seeded agent ids, honest best-fit. */
const ACTION_AGENTS: Record<string, string[]> = {
  'act-inbox-triage': ['gmail-worker', 'comms-agent'],
  'act-schedule': ['calendar-worker', 'comms-agent'],
  'act-books': ['quickbooks-pulse'],
  'act-knowledge-search': ['data-agent'],
  'act-broadcast': ['conductor'],
};

const idSet = (ids: string[]) => new Set(ids.map((id) => `emp:${id}`));

/**
 * The node ids a lens lights. Unknown lens → empty set. Workflows and
 * projects are not modeled as graph entities yet — their lenses honestly
 * return empty until those tables exist (larp-first, real-ready).
 */
export function lensNodeSet(lensId: string, ctx: LensContext): Set<string> {
  const out = new Set<string>();
  const byKind = (kind: string) => {
    for (const n of ctx.nodes) if (n.kind === kind) out.add(n.id);
  };
  switch (lensId) {
    case 'ent-people':
      byKind('person');
      break;
    case 'ent-subagents':
      byKind('employee');
      break;
    case 'ent-tools':
      byKind('tool');
      break;
    case 'ent-sops':
      byKind('task');
      break;
    case 'ent-departments':
      byKind('team');
      break;
    case 'ent-workflows':
    case 'ent-projects':
      break; // not modeled yet — honest empty
    case 'fn-core':
    case 'fn-enabling': {
      const depts = lensId === 'fn-core' ? CORE_DEPTS : ENABLING_DEPTS;
      for (const n of ctx.nodes) {
        const team = n.kind === 'team' ? n.id : ctx.teamOf(n.id);
        if (team && depts.has(team)) out.add(n.id);
      }
      break;
    }
    default: {
      const agents = ACTION_AGENTS[lensId];
      if (!agents) break;
      const members = idSet(agents);
      for (const n of ctx.nodes) if (members.has(n.id)) out.add(n.id);
    }
  }
  return out;
}
