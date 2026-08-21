'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ActivityEvent } from '@/lib/schemas';

/**
 * The live agent activity feed for the /agents page — one newest-first stream
 * of what agents actually did: runs, chat replies, and broadcast answers.
 * SSR-seeded; the refresh button re-pulls GET /api/agents/activity.
 */
const KIND: Record<ActivityEvent['kind'], { label: string; cls: string }> = {
  run: { label: 'run', cls: 'text-os-muted' },
  message: { label: 'chat', cls: 'text-os-accent' },
  broadcast: { label: 'cast', cls: 'text-os-text' },
};

// 2026-08-21 hydration fix: this used to call toLocaleTimeString([], …) (the
// BROWSER's local timezone) directly in render. Next.js server-renders this
// 'use client' component on Railway (server TZ = UTC), then React hydrates
// and re-renders it in the visitor's local timezone — the formatted string
// differs (e.g. "2:30 PM" vs "10:30 AM"), and React throws a hydration
// mismatch (#418/#423/#425) on every single page load. Fixed by rendering
// the deterministic UTC string on the render that has to match SSR (both the
// server pass and the client's pre-hydration pass compute it the same way,
// since it doesn't depend on the runtime's local offset), then swapping to
// the real local-time string inside useEffect — which only runs client-side,
// strictly after hydration has already reconciled successfully.
function clockUTC(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function clockLocal(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AgentActivityFeed({
  initialEvents,
  agentNames,
}: {
  initialEvents: ActivityEvent[];
  agentNames: Record<string, string>;
}) {
  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  // Stays false through SSR and the client's first (pre-hydration) render so
  // both passes render clockUTC identically; flips true once mounted, which
  // only ever happens client-side and after hydration already succeeded.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/agents/activity?limit=40');
      if (res.ok) setEvents(((await res.json()) as { events: ActivityEvent[] }).events);
    } catch {
      // keep the existing list on a transient failure
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg-t border border-os-border bg-os-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-os-dim">Activity</h2>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 font-mono text-[10px] text-os-dim hover:text-os-muted disabled:opacity-50"
          aria-label="Refresh activity"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> refresh
        </button>
      </div>

      {events.length === 0 ? (
        <p className="font-mono text-[10.5px] text-os-dim">
          No activity yet — chat with an agent or the Conductor to see it here.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {events.map((e, i) => (
            <li
              key={`${e.kind}-${e.at}-${i}`}
              className="flex items-baseline gap-2 border-b border-os-border/50 pb-1 font-mono text-[10.5px] last:border-0"
            >
              <span className={`w-9 shrink-0 uppercase ${KIND[e.kind].cls}`}>{KIND[e.kind].label}</span>
              <span className="shrink-0 font-semibold text-os-text">{agentNames[e.agentId] ?? e.agentId}</span>
              {e.ok === false && <span className="shrink-0 text-os-err">FAIL</span>}
              {/* The run's own job succeeded (ok !== false) but a downstream
                  notification it attempted genuinely failed — must never look
                  like an unremarkable success, see lib/analytics.ts's
                  runOutcomeCounts for the same distinction on /analytics. */}
              {e.ok !== false && e.pushFailed && <span className="shrink-0 text-os-warn">PUSH FAILED</span>}
              <span className="min-w-0 flex-1 truncate text-os-muted" title={e.summary}>
                {e.summary}
              </span>
              <span className="shrink-0 text-os-dim">{hydrated ? clockLocal(e.at) : clockUTC(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
