import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Dot, Label, SectionHead } from '@/components/terminal';

export const dynamic = 'force-dynamic';

// The AAC Brain is a separate system from this one: a set of Python workers
// running on Sean's Mac (~/.aac_brain) that drafts lead follow-ups, ASC
// review responses, invoice reminders, etc., scored by urgency and queued
// for his approval. It is NOT the same thing as this repo's own /brain
// knowledge layer (a local markdown store the agents search) — the two
// names collide but the concepts don't. This page surfaces the Brain's own
// operational health: is it running, is anything failing, how big is its
// backlog of drafted-but-unreviewed actions.
//
// Data arrives by push, not pull: stateio.py's heartbeat() on the Mac POSTs
// a snapshot to /api/aac-brain every time it already pings its
// Healthchecks canary. There is no way for this server to reach out to
// Sean's Mac directly, so an honest empty state (below) is what shows until
// the first heartbeat lands — never a fabricated "connected".
const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12h — Brain runs hourly by day, may go quiet overnight

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function AacBrainPage() {
  const snapshot = getDb().brainHealth.latest();
  const stale = snapshot ? Date.now() - new Date(snapshot.reportedAt).getTime() > STALE_AFTER_MS : false;
  const downConnectors = snapshot ? snapshot.connectors.filter((c) => !c.ok) : [];
  const state = !snapshot
    ? 'not_configured'
    : stale
      ? 'warn'
      : snapshot.failingWorkers > 0 || downConnectors.length > 0
        ? 'warn'
        : 'ok';

  return (
    <div>
      <PageHeader
        eyebrow="AAC Brain"
        title="Automation Health"
        right={
          snapshot ? (
            <Badge tone={state === 'ok' ? 'ok' : state === 'warn' ? 'warn' : 'default'}>
              <Dot state={state} pulse={state === 'ok'} />
              {stale ? `stale · reported ${relativeTime(snapshot.reportedAt)}` : `reported ${relativeTime(snapshot.reportedAt)}`}
            </Badge>
          ) : (
            <Badge tone="default">
              <Dot state="not_configured" />
              never reported
            </Badge>
          )
        }
      />

      {!snapshot && (
        <section className="rounded-lg-t border border-os-border bg-os-surface p-5">
          <p className="font-mono text-[12px] text-os-muted">
            No heartbeat has ever been received from the AAC Brain. This page fills in the moment
            ~/.aac_brain/stateio.py&apos;s heartbeat() sends its first snapshot to POST /api/aac-brain —
            set <code className="text-os-accent">AAC_BRAIN_SECRET</code> in .env.local and as a Railway env
            var, then set matching <code className="text-os-accent">AAC_BRAIN_URL</code> /{' '}
            <code className="text-os-accent">AAC_BRAIN_SECRET</code> values in ~/.aac_brain/.env on Sean&apos;s Mac.
          </p>
        </section>
      )}

      {snapshot && (
        <>
          <section className="mb-[18px] grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
            <div className="rounded-lg-t border border-os-border bg-os-surface px-[18px] py-4">
              <Label>Pending actions</Label>
              <div className="mt-2 font-mono text-[26px] font-semibold tracking-[-0.02em]">
                {snapshot.pendingActions}
              </div>
              <div className="mt-1 font-mono text-[11px] text-os-dim">
                drafted, awaiting Sean&apos;s review
              </div>
            </div>
            <div className="rounded-lg-t border border-os-border bg-os-surface px-[18px] py-4">
              <Label>Workers failing</Label>
              <div
                className={`mt-2 font-mono text-[26px] font-semibold tracking-[-0.02em] ${
                  snapshot.failingWorkers > 0 ? 'text-os-warn' : 'text-os-ok'
                }`}
              >
                {snapshot.failingWorkers}
                <small className="ml-1.5 text-xs font-normal text-os-dim">/ {snapshot.totalWorkers}</small>
              </div>
              <div className="mt-1 font-mono text-[11px] text-os-dim">of the tracked worker roster</div>
            </div>
            <div className="rounded-lg-t border border-os-border bg-os-surface px-[18px] py-4">
              <Label>Last daily summary</Label>
              <div className="mt-2 font-mono text-[26px] font-semibold tracking-[-0.02em]">
                {snapshot.lastDailySummaryDate ?? '—'}
              </div>
              <div className="mt-1 font-mono text-[11px] text-os-dim">most recent morning run</div>
            </div>
          </section>

          <section className="mb-8">
            {/* Live external-connector checks (Allo, Railway/arise-os) — added 2026-08-21
                so a broken connector shows up here the same day, not 8 weeks later in an
                audit. See world_state_builder.py's _note_connector_result(). */}
            <SectionHead label="Connector health" count={snapshot.connectors.length} />
            {snapshot.connectors.length === 0 ? (
              <div className="rounded-lg-t border border-os-border bg-os-surface p-5 font-mono text-[12px] text-os-muted">
                No connector checks reported yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg-t border border-os-border bg-os-surface">
                <table className="w-full font-mono text-[12px]">
                  <thead>
                    <tr className="border-b border-os-border text-left text-os-dim">
                      <th className="px-[18px] py-2.5 font-normal uppercase tracking-[0.14em]">Connector</th>
                      <th className="px-[18px] py-2.5 font-normal uppercase tracking-[0.14em]">Status</th>
                      <th className="px-[18px] py-2.5 font-normal uppercase tracking-[0.14em]">Last checked</th>
                      <th className="px-[18px] py-2.5 font-normal uppercase tracking-[0.14em]">Last error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.connectors.map((c) => (
                      <tr key={c.name} className="border-b border-os-border last:border-0">
                        <td className="px-[18px] py-2.5">{c.name}</td>
                        <td className={`px-[18px] py-2.5 ${c.ok ? 'text-os-ok' : 'text-os-warn'}`}>
                          {c.ok ? 'ok' : 'down'}
                        </td>
                        <td className="px-[18px] py-2.5 text-os-dim">{relativeTime(c.lastCheckedAt)}</td>
                        <td className="px-[18px] py-2.5 text-os-dim">{c.ok ? '—' : c.lastError || 'unknown error'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mb-8">
            <SectionHead label="Top failing workers" count={snapshot.topFailures.length} />
            {snapshot.topFailures.length === 0 ? (
              <div className="rounded-lg-t border border-os-border bg-os-surface p-5 font-mono text-[12px] text-os-muted">
                No workers currently failing.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg-t border border-os-border bg-os-surface">
                <table className="w-full font-mono text-[12px]">
                  <thead>
                    <tr className="border-b border-os-border text-left text-os-dim">
                      <th className="px-[18px] py-2.5 font-normal uppercase tracking-[0.14em]">Worker</th>
                      <th className="px-[18px] py-2.5 font-normal uppercase tracking-[0.14em]">Failures</th>
                      <th className="px-[18px] py-2.5 font-normal uppercase tracking-[0.14em]">Last failure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.topFailures.map((f) => (
                      <tr key={f.worker} className="border-b border-os-border last:border-0">
                        <td className="px-[18px] py-2.5">{f.worker}</td>
                        <td className="px-[18px] py-2.5 text-os-warn">{f.count}</td>
                        <td className="px-[18px] py-2.5 text-os-dim">
                          {f.lastFailureAt ? relativeTime(f.lastFailureAt) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
