'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Phase = 'idle' | 'busy' | 'ok' | 'fail';

/** Idle-state label mirrors the agent's live status, same words the old
 *  dead pill on the home page used to show — 'no creds' is the honest
 *  fallback for anything that isn't 'active'/'idle' (e.g. 'planned'). */
const STATUS_LABEL: Record<string, string> = {
  active: 'Run',
  idle: 'Degraded',
};

const TONE_CLASS: Record<'accent' | 'warn' | 'ok' | 'err' | 'dim', string> = {
  accent: 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent',
  warn: 'border-[color-mix(in_oklab,var(--warn)_35%,transparent)] bg-[color-mix(in_oklab,var(--warn)_9%,transparent)] text-os-warn',
  ok: 'border-[color-mix(in_oklab,var(--ok)_35%,transparent)] bg-[color-mix(in_oklab,var(--ok)_9%,transparent)] text-os-ok',
  err: 'border-[color-mix(in_oklab,var(--err)_35%,transparent)] bg-[color-mix(in_oklab,var(--err)_9%,transparent)] text-os-err',
  dim: 'border-os-border text-os-dim',
};

/**
 * Real trigger for POST /api/agents/[id]/run. Used on the home page's agent
 * row and the /agents roster cards — the only two places an operator can
 * fire an agent's run outside its own cron schedule. Renders as its own
 * <button>, deliberately never nested inside a row's navigation <Link>, so a
 * click here can never be swallowed by (or confused with) navigating away —
 * see app/page.tsx and app/agents/page.tsx for how each keeps the two apart.
 */
export function AgentRunButton({ agentId, status }: { agentId: string; status: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState<string | null>(null);

  async function trigger() {
    if (phase === 'busy') return;
    setPhase('busy');
    setNote(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/run`, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        run?: { ok: boolean; summary: string };
        error?: string;
      };
      if (res.ok && body.run) {
        setPhase(body.run.ok ? 'ok' : 'fail');
        setNote(body.run.summary);
      } else {
        setPhase('fail');
        setNote(body.error ?? `run failed (${res.status})`);
      }
      // Pulls the fresh lastRun/status this run just produced into the row —
      // same pattern as AlloSyncButton/WebsiteSyncButton.
      router.refresh();
    } catch (err) {
      setPhase('fail');
      setNote(err instanceof Error ? err.message : 'run failed');
    }
  }

  const label = phase === 'busy' ? 'Running…' : phase === 'ok' ? 'OK' : phase === 'fail' ? 'FAILED' : (STATUS_LABEL[status] ?? 'no creds');
  const tone: keyof typeof TONE_CLASS =
    phase === 'ok' ? 'ok' : phase === 'fail' ? 'err' : status === 'active' ? 'accent' : status === 'idle' ? 'warn' : 'dim';

  return (
    <button
      type="button"
      onClick={trigger}
      disabled={phase === 'busy'}
      title={note ?? `Run ${agentId} now`}
      className={`shrink-0 rounded-sm-t border px-2.5 py-[3px] font-mono text-[11px] font-semibold transition-colors hover:border-os-border-strong disabled:cursor-wait disabled:opacity-60 ${TONE_CLASS[tone]}`}
    >
      {label}
    </button>
  );
}
