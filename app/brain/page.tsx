import { getBrainProvider, readStoreNotes } from '@/lib/brain';
import type { RosterClient } from '@/lib/schemas';
import { buildBrainGraph } from '@/lib/brain-graph';
import { buildKnowledgeGraph } from '@/lib/knowledge-graph';
import { distillMemoryGraph, type MemoryGraph } from '@/lib/memory-core';
import { foldersToClusters } from '@/lib/brain-viz';
import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { BrainCore } from '@/components/BrainCore';
import { PillarRadar } from '@/components/PillarRadar';
import { pillarRadarAxes } from '@/lib/pillar-radar';
import { BrainGraphView } from '@/components/BrainGraphView';
import { BrainDump } from '@/components/BrainDump';
import { Dot, SectionHead } from '@/components/terminal';

export const dynamic = 'force-dynamic';

const CHECK_DOT: Record<string, string> = {
  ok: 'ok',
  warn: 'warn',
  error: 'err',
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Stage({
  step,
  title,
  caption,
  children,
}: {
  step: string;
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex-1 rounded-lg-t border border-os-border bg-os-surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm-t bg-os-accent font-mono text-xs font-bold text-os-ink">
          {step}
        </span>
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          <div className="font-mono text-[10.5px] text-os-dim">{caption}</div>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center self-stretch px-1 py-2 xl:flex-col">
      <div className="flex items-center gap-1 xl:flex-col">
        <span className="hidden h-px w-6 bg-os-border-strong xl:block xl:h-6 xl:w-px" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-os-dim xl:[writing-mode:vertical-rl]">
          {label}
        </span>
        <span className="text-os-muted xl:rotate-90">→</span>
      </div>
    </div>
  );
}

function FlowStep({ title, detail, dashed = false }: { title: string; detail: string; dashed?: boolean }) {
  return (
    <div
      className={`flex-1 rounded-md-t border px-3 py-2.5 ${
        dashed ? 'border-dashed border-os-border' : 'border-os-border bg-os-surface2'
      }`}
    >
      <div className="text-xs font-semibold">{title}</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-os-dim">{detail}</div>
    </div>
  );
}

// The client roster reads the funnel repo — the one client source now.
function clientRoster(db: ReturnType<typeof getDb>): RosterClient[] {
  return db.funnel.journeys().map((j) => ({
    id: j.id,
    name: j.name,
    venture: j.venture,
    status: j.status,
    amountUsd: j.amountUsd,
    source: 'funnel' as const,
  }));
}

// The memory constellation distills the whole brain-store (parse + local PCA
// over the full note set) — too heavy to redo per request on a force-dynamic page, so
// cache per server process with a short TTL. Never throws: an unreadable
// store yields undefined and the graph falls back to its plain center dot.
let memoryCache: { at: number; value: MemoryGraph | undefined } | null = null;
const MEMORY_TTL_MS = 5 * 60_000;

function memoryConstellation(): MemoryGraph | undefined {
  if (memoryCache && Date.now() - memoryCache.at < MEMORY_TTL_MS) return memoryCache.value;
  let value: MemoryGraph | undefined;
  try {
    // The operator's memory = whatever markdown store BRAIN_STORE points at.
    // Empty (undefined) when no store is configured — the graph renders its
    // plain fallback instead of an invented constellation.
    const store = readStoreNotes();
    const distilled = distillMemoryGraph(buildBrainGraph(store));
    value = distilled.nodes.length > 0 ? distilled : undefined;
  } catch {
    value = undefined;
  }
  memoryCache = { at: Date.now(), value };
  return value;
}

export default async function BrainPage() {
  const overview = await getBrainProvider().overview();
  const { store, doctor } = overview;
  const db = getDb();
  const knowledgeGraph = buildKnowledgeGraph(db.agents.all(), db.departments.all(), db.people.all(), db.sopTasks.all());
  const maxFiles = Math.max(1, ...store.folders.map((f) => f.files));
  const clusters = foldersToClusters(store.folders);
  const storeShort = store.path ? store.path.replace(process.env.HOME ?? '', '~') : 'BRAIN_STORE not set';

  const lastBrainRun = db.agentRuns.byAgent('data-agent')[0];
  // latest run per agent (oldest first so the LAST write per id is the newest)
  const runsByAgent = Object.fromEntries(
    db.agentRuns
      .recent(300)
      .reverse()
      .map((r) => [r.agentId, r]),
  );
  const warnings = doctor.checks.filter((c) => c.status !== 'ok');
  const fallbackActive = !doctor.connected;

  const layers: { name: string; sub: string; val: string; state: string }[] = [
    {
      name: 'Markdown store',
      sub: `${storeShort} · source of truth on disk`,
      val: store.totalFiles > 0 ? `${store.totalFiles} pages` : 'not configured',
      state: store.totalFiles > 0 ? 'connected' : 'available',
    },
    {
      name: 'Search provider',
      sub: 'grep over the store today; a vector provider slots in behind the same interface',
      val: doctor.connected ? 'LIVE' : 'PENDING',
      state: doctor.connected ? 'connected' : 'available',
    },
  ];

  return (
    <div>
      {/* capture rides the header's right slot: one untitled slot — type,
          talk, or drop documents. The graph owns the space under the title. */}
      <PageHeader
        eyebrow="knowledge core"
        title="Knowledge"
        caret
        rightWide
        right={<BrainDump compact />}
      />

      <section className="mt-5">
        <SectionHead label="Knowledge graph" count={`${knowledgeGraph.nodes.length} nodes`} />
        <BrainGraphView
          graph={knowledgeGraph}
          agents={db.agents.all()}
          departments={db.departments.all()}
          people={db.people.all()}
          tasks={db.sopTasks.all()}
          memory={memoryConstellation()}
          clients={clientRoster(db)}
          runsByAgent={runsByAgent}
        />
      </section>

      {/* G-Brain knowledge core: the PILLAR SPIDER CHART on the LEFT, the
          radar/health monitor on the RIGHT — a 50/50 split of the row.
          Stacks on narrow screens. */}
      <div className="mt-5 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <div className="flex min-h-[480px] flex-col overflow-hidden rounded-lg-t border border-os-border bg-os-surface">
          <div className="flex items-start justify-between px-4 pt-3.5 font-mono text-[10px] leading-normal text-os-dim">
            <span>
              <b className="font-medium text-os-muted">pillar health</b> — live roster + runs + SOP coverage
            </span>
          </div>
          <PillarRadar
            axes={pillarRadarAxes(db.departments.all(), db.agents.all(), db.sopTasks.all(), runsByAgent)}
            health={doctor.healthScore}
            warnings={warnings.length}
          />
        </div>

        <div className="brain-stage flex min-h-[480px] flex-col overflow-hidden rounded-lg-t border border-os-border">
          {/* annotations as a real header row — at half width the old absolute
              corners collided with the radar's ring labels */}
          <div className="flex items-start justify-between px-4 pt-3.5 font-mono text-[10px] leading-normal text-os-dim">
            <div className="flex flex-col gap-1">
              <span>
                <b className="font-medium text-os-muted">doctor</b> —{' '}
                {doctor.connected ? (warnings.length > 0 ? 'warnings' : 'ok') : 'unreachable'}
              </span>
              <span>
                {lastBrainRun ? `last run ${relativeTime(lastBrainRun.finishedAt)} · data-agent` : 'no agent runs yet'}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-right">
              <span>
                <b className="font-medium text-os-muted">hybrid search</b> {doctor.connected ? 'verified' : 'degraded'}
              </span>
              <span>{fallbackActive ? 'local fallback active' : 'supabase reachable'}</span>
            </div>
          </div>
          <div className="grid flex-1 place-items-center">
            <div className="w-full max-w-[540px]">
              <BrainCore clusters={clusters} health={doctor.healthScore} doctor={doctor} fallbackActive={fallbackActive} />
            </div>
          </div>
        </div>

      </div>

      {/* Core status: storage layers + doctor-health footer, full width. */}
      <div className="mt-4 flex flex-col overflow-hidden rounded-lg-t border border-os-border bg-os-surface">
        <div className="border-b border-os-border px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-os-dim">
          Storage layers
        </div>
        <div className="flex flex-1 flex-col divide-y divide-os-border">
          {layers.map((layer) => (
            <div key={layer.name} className="flex flex-1 items-center gap-3 px-3.5 py-3">
              <Dot state={layer.state} pulse={layer.state === 'connected'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold">{layer.name}</div>
                <div className="truncate font-mono text-[10px] text-os-dim">{layer.sub}</div>
              </div>
              <span
                className={`shrink-0 font-mono text-[10.5px] font-semibold ${
                  layer.state === 'connected' ? 'text-os-ok' : layer.state === 'error' ? 'text-os-err' : 'text-os-warn'
                }`}
              >
                {layer.val}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-os-border px-3.5 py-3 font-mono text-[10.5px]">
          <span className="text-os-dim">
            <b className="font-medium text-os-muted">doctor</b> — health {doctor.healthScore ?? '—'}/100
          </span>
          <span className={warnings.length > 0 ? 'text-os-warn' : doctor.connected ? 'text-os-ok' : 'text-os-err'}>
            {doctor.connected ? (warnings.length > 0 ? `${warnings.length} warnings` : 'all green') : 'offline'}
          </span>
        </div>
      </div>

      {/* The pipeline: where knowledge lives and how it becomes searchable */}
      <section className="mt-8">
        <SectionHead label="Pipeline" count={`${store.totalFiles} pages on disk`} />
        <div className="flex flex-col gap-2 xl:flex-row xl:items-stretch">
          <Stage step="1" title="Markdown brain-store" caption={storeShort}>
            <div className="text-xs text-os-muted">
              {store.totalFiles} pages on disk, plain <span className="font-semibold text-os-text">.md</span> files —
              the source of truth. Point <code className="font-mono text-[11px]">BRAIN_STORE</code> at any folder of
              markdown and it appears here.
            </div>
            <ul className="mt-3 space-y-1.5">
              {store.folders.map((folder) => (
                <li key={folder.name} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate font-mono text-[11px] text-os-muted">{folder.name}</span>
                  <span
                    className="h-2 rounded-sm bg-os-accent"
                    style={{
                      width: `${Math.max(6, (folder.files / maxFiles) * 100)}%`,
                      opacity: 0.25 + 0.55 * (folder.files / maxFiles),
                    }}
                  />
                  <span className="font-mono text-[11px] text-os-dim">{folder.files}</span>
                </li>
              ))}
            </ul>
          </Stage>

          <Arrow label="read" />

          <Stage step="2" title="Grep search" caption="the working provider — simple, honest, zero dependencies">
            <div className="text-xs text-os-muted">
              Queries walk the markdown store directly and return matching lines as snippets. No index to drift,
              no external service to pause — it works the moment{' '}
              <code className="font-mono text-[11px]">BRAIN_STORE</code> points at a folder.
            </div>
            <ul className="mt-3 space-y-1.5">
              {doctor.checks.map((check) => (
                <li key={check.name} className="flex items-start gap-2 text-[11px]">
                  <span className={`dot mt-1 ${CHECK_DOT[check.status] ?? 'err'}`} />
                  <span className="text-os-muted">
                    <span className="font-semibold text-os-text">{check.name}</span> — {check.message}
                  </span>
                </li>
              ))}
              {doctor.checks.length === 0 && (
                <li className="rounded-md-t border border-dashed border-os-border px-3 py-2 font-mono text-[11px] text-os-dim">
                  {doctor.detail}
                </li>
              )}
            </ul>
          </Stage>

          <Arrow label="upgrade path" />

          <Stage step="3" title="Vector provider (future)" caption="same interface, richer retrieval">
            <div className="space-y-1.5 text-[11px] leading-relaxed text-os-muted">
              <p>
                Semantic search slots in behind the same <code className="font-mono">BrainProvider</code> interface —
                embeddings, hybrid ranking, an external service — without touching a single page or agent.
              </p>
              <p className="text-os-dim">
                Until one is wired, the OS reports the grep provider honestly instead of pretending to a vector DB.
              </p>
            </div>
          </Stage>
        </div>
      </section>

      {/* How a query actually resolves */}
      <section className="mt-8">
        <SectionHead label="Query path" />
        <p className="mb-3 text-xs text-os-dim">
          What happens when an agent searches the knowledge layer — real retrieval with an honest empty result
          when nothing is configured.
        </p>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
          <FlowStep title="Question" detail="Natural-language query from you or an agent run." />
          <Arrow label="search" />
          <FlowStep title="Store grep" detail="Walk the markdown store; first matching line per page becomes the snippet." />
          <Arrow label="answer" />
          <FlowStep title="Ranked snippets" detail="Top pages with snippets, returned to the agent — never invented ones." />
        </div>
        <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-stretch">
          <FlowStep
            dashed
            title="Not configured"
            detail="No BRAIN_STORE set → searches return empty and the status card says so. Nothing fakes an answer."
          />
        </div>
      </section>
    </div>
  );
}
