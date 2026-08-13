'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * One-click Allo call-log sync on the funnel page. Honest states: shows the
 * missing-key note until ALLO_API_KEY is configured, live counts after a
 * successful pull, and the real error when Allo declines.
 */
export default function AlloSyncButton({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!configured) {
    return (
      <span
        className="font-mono text-[10px] uppercase tracking-wide text-os-dim"
        title="Create a key in Allo (settings → API, Conversations Read scope) and add ALLO_API_KEY to the environment."
      >
        allo call log: key not set
      </span>
    );
  }

  async function sync() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/funnel/sync-allo', { method: 'POST' });
      const body = (await res.json()) as
        | { ok: true; calls: number; newContacts: number; newTouches: number; skipped: number }
        | { ok: false; reason: string };
      if (body.ok) {
        setNote(`${body.newContacts} new · ${body.newTouches} touches · ${body.skipped} skipped`);
        router.refresh();
      } else {
        setNote(body.reason.slice(0, 80));
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message.slice(0, 80) : 'sync failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        className="rounded-sm-t border border-os-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text disabled:opacity-50"
      >
        {busy ? 'syncing…' : 'sync allo calls'}
      </button>
      {note && <span className="font-mono text-[10px] text-os-dim">{note}</span>}
    </span>
  );
}
