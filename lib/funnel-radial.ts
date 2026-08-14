/**
 * Radial funnel math — the outside → in view. The journey is a circle: leads
 * enter at the rim in one of the acquisition segments (where they actually
 * came from) and travel inward ring by ring until the center — the win.
 *
 * Attribution is honest: keyword classification over the entry touch, with
 * `word_of_mouth` as the explicit catch-all for what nothing tracked. Live
 * lead sources (the Allo call log, a CRM's source field) feed the same
 * labels, so attribution sharpens as they land — no schema change needed.
 */
import { funnelSpaceModel, type FunnelSpaceNode } from '@/lib/funnel';
import type { FunnelJourney, FunnelTouch } from '@/lib/schemas';

/** Journeys and space nodes both qualify — classification reads touches only. */
type HasTouches = { touches: FunnelTouch[] };

export type FunnelAcquisition =
  | 'phone'
  | 'google'
  | 'website'
  | 'social'
  | 'referral'
  | 'word_of_mouth';

/** The rim segments, in render order around the circle — AAC's real lead
 * sources: the Allo phone line, Google (search + Business Profile), the
 * website form, social, referrals, and the honest untracked catch-all. */
export const ACQUISITIONS: { id: FunnelAcquisition; label: string }[] = [
  { id: 'phone', label: 'Phone / Allo' },
  { id: 'google', label: 'Google' },
  { id: 'website', label: 'Website' },
  { id: 'social', label: 'Social' },
  { id: 'referral', label: 'Referral' },
  { id: 'word_of_mouth', label: 'Word of mouth' },
];

const SEGMENT_INDEX: Record<FunnelAcquisition, number> = Object.fromEntries(
  ACQUISITIONS.map((a, i) => [a.id, i]),
) as Record<FunnelAcquisition, number>;

/**
 * Keyword families, first match wins. Explicit referral language beats the
 * website-form fallback; the Allo phone line owns anything call-shaped.
 */
const MATCHERS: { id: FunnelAcquisition; re: RegExp }[] = [
  { id: 'referral', re: /referr|word of mouth|recommend/i },
  { id: 'phone', re: /\ballo\b|phone|\bcall\b|voicemail|missed call/i },
  { id: 'google', re: /google|\bgbp\b|business profile|maps|search/i },
  { id: 'social', re: /instagram|\big\b|facebook|\bfb\b|nextdoor|houzz|yelp|tiktok/i },
  { id: 'website', re: /website|\bform\b|landing page|book(ing)? link|estimate request/i },
];

/**
 * Which rim segment a journey enters through — classified from its entry
 * touch (label + channel). Unattributed stays word_of_mouth: the honest
 * bucket for "we didn't track this", exactly the operator's framing of referrals.
 */
export function acquisitionFor(j: HasTouches): FunnelAcquisition {
  const entry = j.touches[0];
  if (!entry) return 'word_of_mouth';
  // Keyword match runs first even for a structurally-known source — a
  // website-form submission whose "how found AAC" answer says "Google" or
  // "Referred by a friend" (lib/funnel-website.ts folds that answer into
  // the label) is more specifically Google/Referral than generically
  // Website; the label carries that nuance, the bare source field doesn't.
  for (const m of MATCHERS) if (m.re.test(entry.label)) return m.id;
  if (entry.channel === 'call' || entry.channel === 'sms') return 'phone';
  if (entry.channel === 'ads') return 'social'; // paid traffic = the social machine
  if (entry.channel === 'organic') return 'website'; // real website-form submission, no keyword hit
  return 'word_of_mouth';
}

/** "Where they came from" as words for the dossier card — the acquisition
 * segment plus the actual entry touch that put them in the funnel. */
export type FunnelOrigin = {
  segment: string;
  entry: string | null;
  channel: string | null;
  source: string | null;
  at: string | null;
};

export function originOf(j: HasTouches): FunnelOrigin {
  const seg = ACQUISITIONS[SEGMENT_INDEX[acquisitionFor(j)]];
  const entry = j.touches[0] ?? null;
  return {
    segment: seg.label,
    entry: entry?.label ?? null,
    channel: entry?.channel ?? null,
    source: entry?.source ?? null,
    at: entry?.at ?? null,
  };
}

/** A space node placed on the circle: rim segment + ring depth. */
export type FunnelRadialNode = FunnelSpaceNode & {
  /** 0–6 index into ACQUISITIONS — the wedge this lead entered through. */
  segment: number;
  /** Stage rings visited in order (aliases the space model's hub path). */
  rings: number[];
  /** Where they are now: 0 = outermost ring, last = the won core. */
  currentRing: number;
};

export type FunnelRadialSegment = {
  id: FunnelAcquisition;
  label: string;
  count: number;
  converted: number;
};

export type FunnelRadialModel = {
  nodes: FunnelRadialNode[];
  segments: FunnelRadialSegment[];
};

/**
 * Model for the radial view: the same living nodes as the space (decay,
 * likelihood, contact channels all preserved), placed by acquisition wedge
 * and stage ring. Every segment is always present so the rim reads as a
 * fixed compass even when a wedge is empty.
 */
export function funnelRadialModel(journeys: FunnelJourney[], now: Date): FunnelRadialModel {
  const segments: FunnelRadialSegment[] = ACQUISITIONS.map((a) => ({ ...a, count: 0, converted: 0 }));
  const acquisitionById = new Map(journeys.map((j) => [j.id, acquisitionFor(j)]));

  const nodes: FunnelRadialNode[] = funnelSpaceModel(journeys, now).map((n) => {
    const seg = SEGMENT_INDEX[acquisitionById.get(n.id) ?? 'word_of_mouth'];
    segments[seg].count++;
    if (n.state === 'converted') segments[seg].converted++;
    return { ...n, segment: seg, rings: n.hubs, currentRing: n.currentHub };
  });

  return { nodes, segments };
}
