import type { CommsItem } from '@/lib/comms';

/**
 * The gravity-funnel model behind the /comms canvas. Messages fall into three
 * lanes (work · personal · misc/unknown) and sink toward the reply box by
 * priority — red (tier 1) lowest and nearest, untagged white highest and
 * furthest. Pure + tested so the visual layer stays a thin renderer.
 */

export type CommsLane = 'work' | 'personal' | 'misc';

export const COMMS_LANES: { id: CommsLane; label: string }[] = [
  { id: 'work', label: 'Work' },
  { id: 'personal', label: 'Personal' },
  { id: 'misc', label: 'Misc / Unknown' },
];

// A personal-looking email inbox. Generic on purpose — never hardcode the operator's
// real brand inboxes (they must not leak into the FounderOS demo).
const PERSONAL_INBOX_RE = /\b(personal|gmail|icloud|proton|outlook|private|me)\b/i;

// Generic work signals shipped with the app. the operator's real work brands
// (Vantage, Launchpad Cohort, specific people, …) live in COMMS_WORK_KEYWORDS
// in .env.local, NOT here — the committed default must stay brand-free so it is
// safe for the public FounderOS demo.
export const DEFAULT_WORK_KEYWORDS = [
  'invoice',
  'contract',
  'proposal',
  'onboarding',
  'partnership',
  'statement of work',
  'purchase order',
];

/** Parse a comma-separated COMMS_WORK_KEYWORDS value into trimmed, non-empty terms. */
export function parseWorkKeywords(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** The inbox an email came from: its title is "<Inbox> — <sender>". */
function inboxName(item: CommsItem): string {
  return (item.title.split(' — ')[0] ?? '').trim();
}

/** True when the message reads as work — any keyword appears in its inbox,
    sender, or subject. Used to pull work mail out of the misc lane. */
function matchesWork(item: CommsItem, workKeywords: string[]): boolean {
  if (workKeywords.length === 0) return false;
  const hay = `${item.title} ${item.sender ?? ''} ${item.preview}`.toLowerCase();
  return workKeywords.some((k) => {
    const kw = k.trim().toLowerCase();
    return kw.length > 0 && hay.includes(kw);
  });
}

/**
 * Which lane a message belongs in. Channel identity wins — WhatsApp is personal,
 * Slack is work, and Allo calls/SMS are work (Allo is AAC's lead-intake line —
 * every call to (248) 717-1417 is a business call, tagged or not). For email:
 * a work keyword forces work (even over a personal inbox); otherwise a
 * personal-named inbox is personal, a known (tagged) sender is work, and an
 * unknown sender is misc.
 */
export function commsLane(item: CommsItem, workKeywords: string[] = []): CommsLane {
  if (item.source === 'whatsapp') return 'personal';
  if (item.source === 'slack' || item.source === 'call' || item.source === 'sms') return 'work';
  if (matchesWork(item, workKeywords)) return 'work';
  if (PERSONAL_INBOX_RE.test(inboxName(item))) return 'personal';
  return item.priority === undefined ? 'misc' : 'work';
}

/** How far a node sinks toward the reply box: 1 = nearest/bottom, 0 = far/top.
    Priority pulls it down; an untagged sender floats up and away. */
export function gravityDepth(priority: CommsItem['priority']): number {
  switch (priority) {
    case 1:
      return 1;
    case 2:
      return 0.68;
    case 3:
      return 0.38;
    default:
      return 0.1;
  }
}

// The band nearest the reply box still sits a little off the bottom edge; the
// furthest floats near (but not off) the top.
const NEAR_PCT = 3;
const SPAN_PCT = 74;

/** A tier's vertical band, as a CSS `bottom` percentage (0 = bottom edge). */
export function laneBottomPct(priority: CommsItem['priority']): number {
  return NEAR_PCT + (1 - gravityDepth(priority)) * SPAN_PCT;
}

// Priority tiers ordered by ascending `laneBottomPct` — tier 1 nearest the
// reply box, untagged furthest/highest.
const TIER_ORDER: CommsItem['priority'][] = [1, 2, 3, undefined];

// The topmost tier's territory stops short of 100% so it never renders under
// the lane's sticky header.
const TOP_CLEARANCE_PCT = 10;

/**
 * The fixed, non-overlapping vertical territory a priority tier owns inside
 * a lane, as `{ bottomPct, heightPct }` CSS percentages. Deliberately a pure
 * function of the tier alone — never of how many messages land in it — so a
 * tier's box can never grow past its own territory no matter how full it
 * gets. `bandRowsWithOffsets` below packs a tier's rows inside this box.
 */
export function laneBandZone(priority: CommsItem['priority']): { bottomPct: number; heightPct: number } {
  const i = TIER_ORDER.indexOf(priority);
  const bottomPct = laneBottomPct(priority);
  const topPct = i + 1 < TIER_ORDER.length ? laneBottomPct(TIER_ORDER[i + 1]) : 100 - TOP_CLEARANCE_PCT;
  return { bottomPct, heightPct: topPct - bottomPct };
}

/** How many node buttons sit in one row before wrapping to the next. */
export const LANE_NODES_PER_ROW = 8;

/**
 * Root cause of the WORK-lane overflow bug (2026-08-21): nodes used to wrap
 * inside a single flex box anchored only by `bottom: X%`, with the box's own
 * height left to grow unbounded with however many rows the wrap produced.
 * Once a lane's busiest tier held enough items to need more rows than fit
 * between that anchor and the container's top edge, the extra rows pushed
 * the box's own top edge above y=0 — invisible and unclickable, clipped by
 * the lane's `overflow-hidden` (25 WORK nodes genuinely existed in the DOM,
 * but only 13 stayed on-canvas; PERSONAL and MISC "worked" only because
 * neither lane's busiest tier ever needed enough rows to escape).
 *
 * The fix: chunk a tier's items into fixed-width rows, then place each row
 * at a `bottomPct` that divides the tier's fixed `laneBandZone` evenly
 * across however many rows are actually needed. Row pitch shrinks as the
 * band grows, so the top row's offset is always strictly less than the
 * zone's own height — every row (and so every node) stays inside `[0, 100]`
 * regardless of how many items land in the tier.
 */
export function bandRowsWithOffsets<T>(
  items: T[],
  priority: CommsItem['priority'],
  perRow: number = LANE_NODES_PER_ROW
): { row: T[]; bottomPct: number }[] {
  if (items.length === 0) return [];
  const zone = laneBandZone(priority);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  const pitch = rows.length <= 1 ? 0 : zone.heightPct / rows.length;
  return rows.map((row, i) => ({ row, bottomPct: zone.bottomPct + i * pitch }));
}
