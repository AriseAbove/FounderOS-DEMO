import type { FounderDb } from '@/lib/db';
import type { FunnelJourney, FunnelStage } from '@/lib/schemas';
import { stagesFor } from '@/lib/funnel';

/**
 * Moves one lead to a new stage — the one and only place in this app allowed
 * to change a journey's `status`. Every other write path (lib/funnel-allo.ts,
 * lib/funnel-website.ts) explicitly never touches it: per CLAUDE.md, "a call
 * never moves a journey's stage — stage changes are Sean's decision." This
 * function exists so that decision has somewhere real to land — wired to the
 * "move to stage" control on /funnel via POST /api/funnel/[id]/stage.
 *
 * The move itself is recorded as an ordinary touch (channel: 'crm', source:
 * 'manual') so it shows up in the journey's own touch trail exactly like a
 * call or an email would — no separate audit log to keep in sync.
 */

export type AdvanceStageResult =
  | { ok: true; journey: FunnelJourney }
  | { ok: false; reason: string; status: 404 | 400 };

export function advanceStage(
  db: FounderDb,
  contactId: string,
  stage: FunnelStage,
  now: Date,
): AdvanceStageResult {
  const journey = db.funnel.journeys().find((j) => j.id === contactId);
  if (!journey) {
    return { ok: false, reason: `no lead with id ${contactId}`, status: 404 };
  }

  const pipeline = stagesFor(journey.business);
  const target = pipeline.find((s) => s.id === stage);
  if (!target) {
    return {
      ok: false,
      reason: `${stage} is not a stage in ${journey.business}'s pipeline`,
      status: 400,
    };
  }
  if (journey.status === stage) {
    return { ok: false, reason: `already at ${target.label}`, status: 400 };
  }

  const at = now.toISOString().slice(0, 10);
  const { touches, ...contact } = journey;
  db.funnel.insertContact({ ...contact, status: stage });
  db.funnel.insertTouch({
    id: `manual-stage-${contactId}-${touches.length + 1}`,
    contactId,
    seq: touches.length + 1,
    stage,
    channel: 'crm',
    label: `Moved to ${target.label}`,
    source: 'manual',
    at,
    durationSeconds: null,
  });

  const updated = db.funnel.journeys().find((j) => j.id === contactId)!;
  return { ok: true, journey: updated };
}
