/**
 * Honest, computed agent status — never trusts the static seed value at
 * render time. `lib/seed.ts` still carries an initial `status` (used only as
 * the fallback for agents this module doesn't know about), but every agent
 * with a real dependency is judged live, the same way `allConnectorStatuses()`
 * already judges connectors: it's "active" only when the thing it actually
 * needs is actually there.
 *
 * This mirrors CLAUDE.md's own rule for connectors ("a connector is
 * 'connected' only when it truly is") — applied to agents, which the
 * dashboard previously left on a stale hardcoded value (Chief of Staff could
 * run successfully on a live cron and still show "no creds").
 */
import type { Agent } from '@/lib/schemas';
import type { ConnectorStatus } from '@/lib/connectors/types';

type LiveRule =
  | { kind: 'always' }
  | { kind: 'connector'; ids: string[] }
  | { kind: 'last-run' };

/** id → how to judge it live. Agents not listed here keep their seed status
 *  unchanged — this module never guesses about an agent it doesn't know. */
const AGENT_LIVE_RULE: Record<string, LiveRule> = {
  conductor: { kind: 'always' }, // pure DB read, no external dependency
  'comms-agent': { kind: 'connector', ids: ['email', 'calendar'] }, // live if either channel worker is
  'gmail-worker': { kind: 'connector', ids: ['email'] },
  'calendar-worker': { kind: 'connector', ids: ['calendar'] },
  'website-pulse': { kind: 'connector', ids: ['email'] }, // reuses the Comms inbox, no separate creds
  'allo-pulse': { kind: 'connector', ids: ['allo'] },
  'social-pulse': { kind: 'connector', ids: ['oneup'] },
  'quickbooks-pulse': { kind: 'connector', ids: ['quickbooks'] },
  'data-agent': { kind: 'connector', ids: ['brain'] },
  // Chief of Staff is cross-cutting (funnel + QuickBooks + email + ntfy) —
  // no single connector owns its readiness, so the honest signal is whether
  // it has actually completed a real run.
  'chief-of-staff': { kind: 'last-run' },
};

export function liveAgentStatus(
  agentId: string,
  connections: ConnectorStatus[],
  lastRun: { ok: boolean } | undefined,
  seedStatus: Agent['status'],
): Agent['status'] {
  const rule = AGENT_LIVE_RULE[agentId];
  if (!rule) return seedStatus;
  if (rule.kind === 'always') return 'active';
  if (rule.kind === 'last-run') return lastRun?.ok ? 'active' : 'planned';
  const byId = new Map(connections.map((c) => [c.id, c.state]));
  const live = rule.ids.some((id) => byId.get(id) === 'connected');
  return live ? 'active' : 'planned';
}
