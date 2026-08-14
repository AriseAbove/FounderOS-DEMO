'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * One-click website-form sync on the funnel page. Honest states: shows the
 * no-inbox note until an INBOX_* slot is configured (the same one Comms
 * already reads — no separate credential to set up), live counts after a
 * successful pull, and the real error when IMAP declines.
 */
export default function WebsiteSyncButton({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!configured) {
    return (
      <span
        className="font-mono text-[10px] uppercase tracking-wide text-os-dim"
        title="Set INBOX_1_HOST/_USER/_PASS in the environment — the same inbox Comms already reads."
      >
        website leads: no inbox set
      </span>
    );
  }

  async function sync() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/funnel/sync-website', { method: 'POST' });
      const body = (await res.json()) as
        | { ok: true; leads: number; newContacts: number; newTouches: number; skipped: number }
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
        {busy ? 'syncing…' : 'sync website leads'}
      </button>
      {note && <span className="font-mono text-[10px] text-os-dim">{note}</span>}
    </span>
  );
}
