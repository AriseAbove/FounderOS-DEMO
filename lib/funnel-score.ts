import type { FunnelRelationship, FunnelTouch } from '@/lib/schemas';

/**
 * Lead score from call signal — deliberately simple, rule-based, and
 * explainable, not a fitted model. Before this fix every Allo-imported lead
 * was hardcoded to relationship: 'warm', likelihood: 50 at creation
 * (lib/funnel-allo.ts) and never touched again — so a number that called
 * (248) 717-1417 thirty-plus times scored exactly the same as a single real
 * inquiry. See lib/funnel-allo.ts's importAlloCalls for where this gets
 * applied, and CLAUDE.md's funnel section for the pipeline this feeds.
 *
 * The only real signal that exists in the data today:
 *   - how many times a number has called in (repeat-caller pattern)
 *   - how long those calls ran, where duration was captured — a real
 *     conversation vs. an instant hang-up / wrong number / robocall
 * (FunnelTouch.durationSeconds started being recorded alongside this fix —
 * see lib/schemas.ts. Older imports never captured it, so `durationSeconds`
 * is null on most of today's historical touches; this treats null as
 * "unknown," never as "short.")
 *
 * HONESTY caveat, stated plainly rather than hidden behind confident-looking
 * numbers: the thresholds below are a defensible starting heuristic, not a
 * calibrated model. There isn't yet enough contract_signed outcome data to
 * check them against, and this app has no access to project type, budget,
 * or anything else that would actually predict close probability — Allo
 * doesn't structure that. Treat `likelihood` as a rough sort order for
 * "who to call back first," not a probability. Tuning these constants (or
 * layering in project value once that's captured) is a product/business
 * call for Sean once real outcomes exist to check them against — this file
 * does not pretend to have already made that call.
 */

/** This many inbound call touches from one number stops reading as "one
 *  interested lead" and starts reading as noise (wrong number, robocall). */
export const REPEAT_CALLER_TOUCHES = 15;
/** A call this short rarely exchanges real information. */
export const SHORT_CALL_SECONDS = 20;
/** A call this long is a real conversation, not a hang-up. */
export const SUSTAINED_CALL_SECONDS = 60;

export type LeadScore = { relationship: FunnelRelationship; likelihood: number };

const NEUTRAL: LeadScore = { relationship: 'warm', likelihood: 50 };

function average(nums: number[]): number | null {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/**
 * Derive an honest, differentiated lead score from a journey's own touch
 * history. Only 'call' touches carry the duration signal; other channels
 * (a website form, an SMS) don't have anything comparable recorded yet, so
 * they fall through to the neutral default rather than being scored on
 * signal that doesn't exist.
 */
export function scoreFromTouches(touches: FunnelTouch[]): LeadScore {
  const calls = touches.filter((t) => t.channel === 'call');
  const durations = calls.map((t) => t.durationSeconds).filter((d): d is number => d != null);
  const avgDuration = average(durations);

  // Pattern: high call volume from one number. Whether or not we have
  // duration data for it (older imports never recorded it; new ones do),
  // this many calls from one number is the strongest signal available that
  // it's not a real prospect — more calls here means more noise, not more
  // interest. Confirmed further when the calls we do have durations for are
  // short.
  const noisyDuration = avgDuration === null || avgDuration < SHORT_CALL_SECONDS;
  if (calls.length >= REPEAT_CALLER_TOUCHES && noisyDuration) {
    return { relationship: 'cold', likelihood: 10 };
  }

  const sustained = avgDuration !== null && avgDuration >= SUSTAINED_CALL_SECONDS;

  // Pattern: more than one call, and where we have duration data it shows
  // real conversations — a prospect who called back and talked.
  if (calls.length >= 2 && sustained) {
    return { relationship: 'hot', likelihood: 75 };
  }
  // Repeat contact, but no duration data on record to confirm quality
  // either way — a mild bump over neutral, not a full "hot."
  if (calls.length >= 2) {
    return { relationship: 'warm', likelihood: 60 };
  }
  // One call, and it ran long enough to be a real conversation.
  if (calls.length === 1 && sustained) {
    return { relationship: 'warm', likelihood: 65 };
  }
  // One call, and it was an instant hang-up — the honest downgrade.
  if (calls.length === 1 && avgDuration !== null && avgDuration < SHORT_CALL_SECONDS) {
    return { relationship: 'cold', likelihood: 25 };
  }

  // No calls, or a single call with no duration data on record — nothing
  // here to differentiate on yet.
  return NEUTRAL;
}
