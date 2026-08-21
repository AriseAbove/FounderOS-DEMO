'use client';

/**
 * The live footer of a connection tile: Connect opens an inline paste-a-key
 * form (one field per env key), Save posts to /api/connections/connect (which
 * writes .env.local only), and the page refreshes into the connector's real
 * status — connected is never faked, a stored key on a connector-less tile
 * reads "key saved". Guidance-only tools (WhatsApp needs Full Disk Access,
 * IMAP inboxes, CalDAV) show their setup hint instead of a form.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ConnectFlow({
  slug,
  connected,
  keySaved,
  error = false,
  keys,
  guidance,
  oauthConnectUrl,
  oauthDisconnectUrl,
}: {
  slug: string;
  connected: boolean;
  keySaved: boolean;
  /** True when the linked connector's live status is genuinely 'error' — a
   *  stored grant/key exists but the last real API call failed (e.g. a
   *  QuickBooks token that needs reconnecting). Renders a distinct amber/red
   *  "Reconnect needed" state instead of collapsing into the same
   *  "Not connected" card a tool that was never touched would show. */
  error?: boolean;
  keys: string[];
  /** Live connector detail for guidance-only tools (keys.length === 0), AND
   *  the real failure detail (ConnectorStatus.detail) whenever `error` is
   *  true — shown as visible body text in that case, not just a tooltip. */
  guidance?: string;
  /** OAuth tools (QuickBooks) navigate here instead of opening a key form —
      a real browser redirect to the provider's consent screen. */
  oauthConnectUrl?: string;
  /** POSTed to revoke + clear an OAuth grant, mirrored from the generic
      disconnect button below. */
  oauthDisconnectUrl?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Named formError (not `error`) so it never shadows the `error` prop above
  // (the connector's live 'error' status) — the two are unrelated: this one
  // is a transient save/disconnect-request failure message, the prop is the
  // connector's persistent connection-health state.
  const [formError, setFormError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch('/api/connections/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, values }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) throw new Error(body.error ?? 'save failed');
      setOpen(false);
      setValues({});
      router.refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setFormError(null);
    try {
      if (oauthDisconnectUrl) {
        await fetch(oauthDisconnectUrl, { method: 'POST' });
      } else {
        await fetch('/api/connections/connect', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        });
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const statusChip = connected ? (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-os-ok">
      <span className="h-1.5 w-1.5 rounded-full bg-os-ok" />
      Connected
    </span>
  ) : error ? (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-os-err">
      <span className="h-1.5 w-1.5 rounded-full bg-os-err" />
      Reconnect needed
    </span>
  ) : keySaved ? (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-os-warn">
      <span className="h-1.5 w-1.5 rounded-full bg-os-warn" />
      Key saved
    </span>
  ) : (
    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-os-dim">Not connected</span>
  );

  if (open) {
    return (
      <div className="mt-3">
        {keys.map((k) => (
          <input
            key={k}
            type="password"
            autoComplete="off"
            placeholder={k}
            value={values[k] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
            className="mb-1.5 w-full rounded-md border border-os-border bg-os-surface2 px-2 py-1.5 font-mono text-[10.5px] text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
          />
        ))}
        {formError && <div className="mb-1.5 font-mono text-[9.5px] text-os-err">{formError}</div>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setFormError(null);
            }}
            className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim transition-colors hover:text-os-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || keys.some((k) => !(values[k] ?? '').trim())}
            onClick={() => void save()}
            className="rounded-full border border-os-border-strong px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-text transition-colors hover:bg-os-text hover:text-os-bg disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save & connect'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        {statusChip}
        {connected || keySaved ? (
          keySaved ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
              className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim transition-colors hover:text-os-text disabled:opacity-40"
            >
              Disconnect
            </button>
          ) : oauthDisconnectUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
              className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim transition-colors hover:text-os-text disabled:opacity-40"
            >
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : (
            <span
              title="Credentials managed outside Founder OS (canonical machine files)"
              className="cursor-default rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim/60"
            >
              Managed
            </span>
          )
        ) : keys.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full border border-os-border-strong px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-text transition-colors hover:bg-os-text hover:text-os-bg"
          >
            {error ? 'Reconnect →' : '+ Connect'}
          </button>
        ) : oauthConnectUrl ? (
          <a
            href={oauthConnectUrl}
            title={guidance}
            className="rounded-full border border-os-border-strong px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-text transition-colors hover:bg-os-text hover:text-os-bg"
          >
            {error ? 'Reconnect →' : 'Connect →'}
          </a>
        ) : (
          <span
            title={guidance ?? 'Connects through local setup, not a pasted key'}
            className="cursor-help rounded-full border border-os-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim"
          >
            Setup
          </span>
        )}
      </div>
      {/* Error state gets its real failure detail as visible body text, not
          just a barely-discoverable title tooltip — a stored-but-broken
          grant (e.g. QuickBooks needing reconnect) must read as genuinely
          different from a tool nobody ever connected. */}
      {error && guidance && (
        <div className="mt-1.5 font-mono text-[9.5px] leading-relaxed text-os-err">{guidance}</div>
      )}
    </div>
  );
}
