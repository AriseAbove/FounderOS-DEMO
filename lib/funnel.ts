/**
 * Funnel stage math — pure functions over FunnelJourney rows. The journeys
 * themselves come from db.funnel (seeded dummy today; Trakyo / Meta Ads MCP
 * fill the same shape live), so everything here stays source-agnostic.
 */
import {
  FunnelSummarySchema,
  type FunnelJourney,
  type FunnelStage,
  type FunnelSummary,
  type FunnelTouch,
  type FunnelBusiness,
} from '@/lib/schemas';

/** AAC's real pipeline, in order — inquiry to complete-and-paid. */
export const AAC_FUNNEL_STAGES: { id: FunnelStage; label: string }[] = [
  { id: 'inquiry', label: 'Inquiry' },
  { id: 'follow_up', label: 'Follow-up' },
  { id: 'walkthrough_scheduled', label: 'Walk-through' },
  { id: 'estimate_sent', label: 'Estimate sent' },
  { id: 'negotiation', label: 'Negotiation' },
  { id: 'contract_signed', label: 'Contract signed' },
  { id: 'active_project', label: 'Active project' },
  { id: 'complete_paid', label: 'Complete & paid' },
];

/** Apps' real pipeline (decided 2026-08-14): Sean builds and publishes the
 *  apps himself, so this is a product/acquisition funnel, not a sales
 *  pipeline — discovery through paid retention, no client to walk through
 *  or negotiate with. */
export const APPS_FUNNEL_STAGES: { id: FunnelStage; label: string }[] = [
  { id: 'discovered', label: 'Discovered' },
  { id: 'installed', label: 'Installed' },
  { id: 'activated', label: 'Activated' },
  { id: 'trial_started', label: 'Trial started' },
  { id: 'subscribed', label: 'Subscribed' },
  { id: 'retained', label: 'Retained' },
];

export const FUNNEL_STAGES_BY_BUSINESS: Record<FunnelBusiness, { id: FunnelStage; label: string }[]> = {
  aac: AAC_FUNNEL_STAGES,
  apps: APPS_FUNNEL_STAGES,
};

/** Every stage across every business — safe for label lookups that don't
 *  care which pipeline a journey belongs to (ids never collide across
 *  businesses). */
export const ALL_FUNNEL_STAGES: { id: FunnelStage; label: string }[] = [
  ...AAC_FUNNEL_STAGES,
  ...APPS_FUNNEL_STAGES,
];

/** The stage set for one business, or AAC's as the shared backbone when
 *  business is unset (the funnel page's mixed "All" tab). NOTE: the two
 *  funnel canvases (FunnelSpace, FunnelRadial) still render hub geometry
 *  off the AAC backbone unconditionally — a dedicated Apps canvas view
 *  (real hub positions/colors for the 6 Apps stages) is a scoped follow-up,
 *  not yet wired, since Apps has zero live journeys today. */
export function stagesFor(business: FunnelBusiness | undefined): { id: FunnelStage; label: string }[] {
  return business ? FUNNEL_STAGES_BY_BUSINESS[business] : AAC_FUNNEL_STAGES;
}

/** Back-compat alias — AAC's pipeline, the default/most common case (the
 *  two funnel canvases still import this directly for their geometry). */
export const FUNNEL_STAGES = AAC_FUNNEL_STAGES;

/** Won = the deal/subscription is booked — AAC: deposit stage onward. Apps:
 *  paid conversion onward. Won journeys never stall/decay and count toward
 *  revenue. */
export const WON_STAGES: ReadonlySet<FunnelStage> = new Set([
  'contract_signed',
  'active_project',
  'complete_paid',
  'subscribed',
  'retained',
]);

export function isWon(stage: FunnelStage): boolean {
  return WON_STAGES.has(stage);
}

function buildStageIndex(stages: { id: FunnelStage }[]): Partial<Record<FunnelStage, number>> {
  return Object.fromEntries(stages.map((s, i) => [s.id, i])) as Partial<Record<FunnelStage, number>>;
}

/** Display glyphs for touch channels (journey chips). */
export const CHANNEL_GLYPHS: Record<string, string> = {
  call: '☎',
  sms: '¶',
  email: '@',
  dm: '✉',
  walkthrough: '⌂',
  document: '§',
  crm: '◈',
  organic: '◉',
  ads: '▣',
};

/** Quiet for more than this many days before converting → the node runs red. */
export const STALL_DAYS = 7;
/** Quiet past this → the lead decays out of the space into the archive tab. */
export const DECAY_DAYS = 90;
/** Nodes stay their neutral segment color until here, then fade toward red.
 * Three quiet weeks = a lead visibly starting to die. */
export const DECAY_FADE_START = 21;

/**
 * Continuous decay for the space's fade-to-red: 0 (neutral) through
 * DECAY_FADE_START, ramping linearly to 1 at DECAY_DAYS — the node visibly
 * dies before it archives. Converted never decays; advancing a stage resets
 * the quiet clock, so movement is what keeps a lead vivid.
 */
export function decayFactor(daysSinceLastTouch: number, status: FunnelStage): number {
  if (isWon(status)) return 0;
  return Math.min(1, Math.max(0, (daysSinceLastTouch - DECAY_FADE_START) / (DECAY_DAYS - DECAY_FADE_START)));
}

export type JourneyState = 'converted' | 'stalled' | 'active' | 'decayed';

/**
 * Liveness of one journey at `now`: how long since the last touch, and the
 * color-state the space renders — green once won (contract signed onward),
 * red when a pre-win lead has sat quiet past STALL_DAYS, blue otherwise, and
 * `decayed` (out of the space, into the archive) past DECAY_DAYS.
 * Fresh entries (a journey's business's first stage) never stall — but even
 * they decay after 90 quiet days.
 */
export function journeyMeta(j: FunnelJourney, now: Date): { daysSinceLastTouch: number; state: JourneyState } {
  const lastAt = j.touches[j.touches.length - 1]?.at ?? j.createdAt;
  const days = Math.max(0, Math.floor((now.getTime() - new Date(`${lastAt}T00:00:00Z`).getTime()) / 86_400_000));
  const canStall = !isWon(j.status) && j.status !== stagesFor(j.business)[0]?.id;
  const state: JourneyState =
    isWon(j.status)
      ? 'converted'
      : days > DECAY_DAYS
        ? 'decayed'
        : canStall && days > STALL_DAYS
          ? 'stalled'
          : 'active';
  return { daysSinceLastTouch: days, state };
}

/**
 * What the operator should act on today — the funnel answering a question instead
 * of glowing. Two queues, both capped so the rail reads at a glance:
 *   pushNow — hot leads (likelihood ≥ 70) still in active motion; freshest
 *             movement first, because momentum is when a push closes.
 *   saveNow — leads visibly fading toward the archive (past DECAY_FADE_START);
 *             highest likelihood first, because those are worth saving.
 */
export const ATTENTION_CAP = 4;
export const PUSH_LIKELIHOOD = 70;

export function attentionQueue(
  journeys: FunnelJourney[],
  now: Date,
): { pushNow: FunnelJourney[]; saveNow: FunnelJourney[] } {
  const metas = journeys.map((j) => ({ j, meta: journeyMeta(j, now) }));
  const pushNow = metas
    .filter(
      ({ j, meta }) =>
        meta.state === 'active' &&
        !isWon(j.status) &&
        j.likelihood >= PUSH_LIKELIHOOD &&
        // a fading lead is a save, not a push — even where stalling can't apply
        decayFactor(meta.daysSinceLastTouch, j.status) === 0,
    )
    .sort((a, b) => a.meta.daysSinceLastTouch - b.meta.daysSinceLastTouch || b.j.likelihood - a.j.likelihood)
    .slice(0, ATTENTION_CAP)
    .map(({ j }) => j);
  const saveNow = metas
    .filter(
      ({ j, meta }) =>
        meta.state !== 'decayed' &&
        !isWon(j.status) &&
        decayFactor(meta.daysSinceLastTouch, j.status) > 0,
    )
    .sort((a, b) => b.j.likelihood - a.j.likelihood || b.meta.daysSinceLastTouch - a.meta.daysSinceLastTouch)
    .slice(0, ATTENTION_CAP)
    .map(({ j }) => j);
  return { pushNow, saveNow };
}

/** The space renders actives; the archive tab lists what has decayed. */
export function splitFunnelJourneys(
  journeys: FunnelJourney[],
  now: Date,
): { active: FunnelJourney[]; archived: FunnelJourney[] } {
  const active: FunnelJourney[] = [];
  const archived: FunnelJourney[] = [];
  for (const j of journeys) (journeyMeta(j, now).state === 'decayed' ? archived : active).push(j);
  return { active, archived };
}

/** One client in the open funnel space — everything the canvas needs to move it. */
export type FunnelSpaceNode = {
  id: string;
  name: string;
  business: FunnelBusiness;
  status: FunnelStage;
  relationship: FunnelJourney['relationship'];
  likelihood: number;
  state: JourneyState;
  daysSinceLastTouch: number;
  product: string | null;
  amountUsd: number | null;
  /** Distinct hubs in visit order — the path the node travels on entry. */
  hubs: number[];
  /** Where they live now: the last hub visited. */
  currentHub: number;
  /** Node size encodes likelihood-to-buy. */
  radius: number;
  /** 0 = vivid segment color · → 1 = faded red, about to archive. */
  decay: number;
  /** Deep link to the source record (Attio / GHL contact page). */
  url: string | null;
  email: string | null;
  phone: string | null;
  /** The human behind the deal — the dossier's identity block. */
  person: string | null;
  company: string | null;
  role: string | null;
  linkedin: string | null;
  touches: FunnelTouch[];
};

/**
 * Model for the "open space" view: each journey becomes one moving node.
 * Repeated touches inside a stage collapse into a single hub visit (the node
 * travels sections, not touches); color-state comes from journeyMeta and size
 * from likelihood. `stages` is the canvas backbone the caller is rendering
 * against (defaults to AAC's, today's only real canvas geometry) — a touch
 * whose stage id isn't in that set (e.g. an Apps journey inside the mixed
 * "All" canvas) parks at hub 0 rather than crashing; see `stagesFor`.
 */
export function funnelSpaceModel(
  journeys: FunnelJourney[],
  now: Date,
  stages: { id: FunnelStage; label: string }[] = AAC_FUNNEL_STAGES,
): FunnelSpaceNode[] {
  const stageIndex = buildStageIndex(stages);
  return journeys.map((j) => {
    const hubs: number[] = [];
    for (const t of j.touches) {
      const col = stageIndex[t.stage] ?? 0;
      if (hubs[hubs.length - 1] !== col) hubs.push(col);
    }
    if (hubs.length === 0) hubs.push(0);
    const meta = journeyMeta(j, now);
    return {
      id: j.id,
      name: j.name,
      business: j.business,
      status: j.status,
      relationship: j.relationship,
      likelihood: j.likelihood,
      state: meta.state,
      daysSinceLastTouch: meta.daysSinceLastTouch,
      product: j.product,
      amountUsd: j.amountUsd,
      hubs,
      currentHub: hubs[hubs.length - 1],
      // Constellation-small: 2.5–5.5px by likelihood, knowledge-graph texture.
      radius: 2.5 + (j.likelihood / 100) * 3,
      decay: decayFactor(meta.daysSinceLastTouch, j.status),
      url: j.url,
      email: j.email,
      phone: j.phone,
      person: j.person,
      company: j.company,
      role: j.role,
      linkedin: j.linkedin,
      touches: j.touches,
    };
  });
}

/**
 * Per-stage reached counts + stage→stage conversion. "Reached" means the
 * journey's furthest stage is at or past the bar's stage — a journey that
 * skipped an optional touch still progressed past that point. `stages`
 * scopes the breakdown to one business's pipeline (defaults to AAC's); a
 * journey whose status isn't in that set (e.g. an Apps journey while
 * summarizing AAC's stages) still counts toward `clients`/`converted`, just
 * not toward any row in the per-stage breakdown.
 */
export function funnelSummary(
  journeys: FunnelJourney[],
  stages: { id: FunnelStage; label: string }[] = AAC_FUNNEL_STAGES,
): FunnelSummary {
  const won = journeys.filter((j) => isWon(j.status));
  const stageIndex = buildStageIndex(stages);
  const rows = stages.map(({ id }, i) => {
    const reached = journeys.filter((j) => (stageIndex[j.status] ?? -1) >= i);
    return {
      stage: id,
      total: reached.length,
      conversionFromPrev: null as number | null,
    };
  });
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].total;
    rows[i].conversionFromPrev = prev > 0 ? Math.round((rows[i].total / prev) * 1000) / 10 : null;
  }
  return FunnelSummarySchema.parse({
    clients: journeys.length,
    converted: won.length,
    revenueUsd: won.reduce((sum, j) => sum + (j.amountUsd ?? 0), 0),
    stages: rows,
  });
}
