/**
 * Sean's business lens over the OS — Arise Above Construction (AAC) and the
 * app portfolio (Apps).
 *
 * One database, one G-Brain, one agent roster: businesses never partition
 * the data. They are saved filters — each one names the agents that serve
 * it per life area, the brain tag that marks its pages, and the current
 * executive focus. Switching business in the hierarchy or life map swaps
 * which crew lights up; the agents themselves keep full visibility of
 * everything.
 *
 * `areaAgents` (2026-08-21): AAC's crew is real, not a placeholder — every
 * agent below has a description in lib/seed.ts that already names AAC by
 * name or is demonstrably AAC's own connected data (Sean's real inbox is
 * ariseaboveconstruction.com; the confirmed QuickBooks books; the confirmed
 * Allo call log and website-form leads, both explicitly "the AAC pipeline"
 * in their own seed copy). Apps has no equivalent connected data yet — no
 * app-specific inbox, books, or lead source — so it honestly stays on just
 * the shared infra (Conductor, Data Agent) until one exists. Nothing here is
 * invented: this only wires already-documented real facts into the lens.
 */
import type { LifeArea } from '@/lib/life-map';
import { LIFE_AREAS } from '@/lib/life-map';

export type BusinessId = 'aac' | 'apps';

export type Business = {
  id: BusinessId;
  label: string;
  kind: string;
  color: string;
  detail: string;
  /** Tag that marks this business's pages inside the single shared G-Brain. */
  brainTag: string;
  /** Current executive priorities — edit freely, this is Sean's list. */
  focus: string[];
  /** life-area id → the agents working that area FOR this business. */
  areaAgents: Record<string, string[]>;
};

const SHARED_OPS = ['conductor'];
const SHARED_KNOWLEDGE = ['data-agent'];

export const BUSINESSES: Business[] = [
  {
    id: 'aac',
    label: 'Arise Above Construction',
    kind: 'Residential & light commercial construction',
    // AAC brand navy (see AAC_STANDARD).
    color: '#191265',
    detail: '203K renovation specialist — Metro Detroit.',
    brainTag: 'aac',
    focus: [
      'Lead pipeline — follow up on warm leads within 24 hours',
      'Job margin — every estimate hits target margin before it goes out',
      'Reputation — 5.0★ rating protected, every completed job gets a review ask',
    ],
    areaAgents: {
      // Allo (the phone receptionist) and Website Pulse both file leads
      // straight into "the AAC pipeline" per their own seed descriptions —
      // there's no Apps equivalent lead source connected yet.
      sales: ['allo-pulse', 'website-pulse'],
      // The connected QuickBooks company is AAC's real books (confirmed
      // $178,262 across 67 unpaid invoices — see the roadmap).
      finances: ['quickbooks-pulse'],
      // The connected inbox/calendar are Sean's real AAC business channels.
      communication: ['comms-agent', 'gmail-worker', 'calendar-worker'],
      knowledge: SHARED_KNOWLEDGE,
      operations: SHARED_OPS,
    },
  },
  {
    id: 'apps',
    label: 'App Portfolio',
    kind: 'Multi-app software studio',
    // AAC brand gold (see AAC_STANDARD).
    color: '#C9A84C',
    detail: 'The app portfolio arm — build, ship, and maintain the product line.',
    brainTag: 'apps',
    focus: [
      'Ship velocity — active builds shipped on schedule',
      'Portfolio health — each app status honestly tracked',
      'Delivery quality — every handoff documented in G-Brain',
      'Staffing, honestly — no dedicated crew yet: Sean builds and ships single-operator, ' +
        'covered for now by the shared Conductor + Data Agent until Apps has its own connected tools',
    ],
    areaAgents: {
      // Genuinely nothing Apps-specific yet — no app inbox, no app books, no
      // app store connector. This stays shared-only until one of those is
      // real, not padded to look busier than it is.
      knowledge: SHARED_KNOWLEDGE,
      operations: SHARED_OPS,
    },
  },
];

export function getBusiness(id: string): Business | null {
  return BUSINESSES.find((b) => b.id === id) ?? null;
}

/** Every agent serving a business, across all its life areas. */
export function businessAgentSet(businessId: string): Set<string> {
  const b = getBusiness(businessId);
  return new Set(b ? Object.values(b.areaAgents).flat() : []);
}

/** Which businesses an agent works for (shared infra agents serve all). */
export function businessesForAgent(agentId: string): Business[] {
  return BUSINESSES.filter((b) => businessAgentSet(b.id).has(agentId));
}

/** Agents on one life area for one business (the click-through Sean described). */
export function businessAreaAgents(businessId: string, areaId: string): string[] {
  return getBusiness(businessId)?.areaAgents[areaId] ?? [];
}

export function lifeAreaById(areaId: string): LifeArea | null {
  return LIFE_AREAS.find((a) => a.id === areaId) ?? null;
}
