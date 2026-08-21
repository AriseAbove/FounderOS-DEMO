'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { stagesFor } from '@/lib/funnel';
import type { FunnelBusiness, FunnelStage } from '@/lib/schemas';

/**
 * The explicit, deliberate control that moves one lead forward in the
 * pipeline — the one thing the funnel page never did on its own. Per
 * CLAUDE.md: "a call never moves a journey's stage — stage changes are
 * Sean's decision." So this is a click, never a page-load effect or a
 * timer: pick a stage, hit "move," and the change lands via
 * POST /api/funnel/[id]/stage (lib/funnel-stage.ts).
 *
 * Defaults the dropdown to the next stage in the lead's own pipeline (AAC's
 * 8 stages or Apps' 6, via stagesFor) but allows picking any stage in it —
 * moving backward is still an explicit human correction, not automation.
 * Renders nothing once a lead is already at its pipeline's final stage.
 */
export default function StageAdvanceControl({
  journey,
}: {
  journey: { id: string; business: FunnelBusiness; status: FunnelStage };
}) {
  const router = useRouter();
  const stages = stagesFor(journey.business);
  const currentIndex = stages.findIndex((s) => s.id === journey.status);
  const nextStage = currentIndex >= 0 ? stages[currentIndex + 1]?.id : undefined;
  const [selected, setSelected] = useState<FunnelStage>(nextStage ?? journey.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Already at the last stage in its pipeline — nothing further to move to.
  if (currentIndex === stages.length - 1) return null;

  async function move() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/funnel/${journey.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: selected }),
      });
      const body = (await res.json()) as { ok: true } | { ok: false; reason: string };
      if (!res.ok || !body.ok) {
        setErr('reason' in body ? body.reason.slice(0, 80) : 'move failed');
        return;
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 80) : 'move failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      <select
        value={selected}
        onChange={(e) => {
          setErr(null);
          setSelected(e.target.value as FunnelStage);
        }}
        disabled={busy}
        title="Pick the stage to move this lead to"
        className="rounded-sm-t border border-os-border bg-os-surface px-1 py-0.5 font-mono text-[9px] normal-case tracking-normal text-os-muted disabled:opacity-50"
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={move}
        disabled={busy || selected === journey.status}
        title="Move this lead — your decision, never automatic"
        className="rounded-sm-t border border-os-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text disabled:opacity-40"
      >
        {busy ? '…' : 'move →'}
      </button>
      {err && <span className="basis-full font-mono text-[9px] normal-case text-os-err">{err}</span>}
    </span>
  );
}
