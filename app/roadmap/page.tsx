import { getDb } from '@/lib/data';
import { splitRoadmap, roadmapProgress } from '@/lib/roadmap';
import { PageHeader } from '@/components/PageHeader';
import { Badge, SectionHead, type BadgeTone } from '@/components/terminal';
import type { RoadmapStatus } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

// No "Now / Next / Later" quarter-style scheduling badges — everything not
// shipped is blocked on the same person (Sean), so it only needs one label.
const STATUS_BADGE: Record<RoadmapStatus, { tone: BadgeTone; ghost: boolean; label: string }> = {
  done: { tone: 'ok', ghost: false, label: 'Live' },
  now: { tone: 'accent', ghost: false, label: 'Waiting on you' },
  next: { tone: 'accent', ghost: false, label: 'Waiting on you' },
  later: { tone: 'accent', ghost: false, label: 'Waiting on you' },
};

export default function RoadmapPage() {
  const db = getDb();
  const items = db.roadmap.all();
  const { shipped, waiting } = splitRoadmap(items);
  const progress = roadmapProgress(items);
  const phases = db.phases.all();
  const departments = new Map(db.departments.all().map((d) => [d.id, d]));

  return (
    <div>
      <PageHeader eyebrow="build plan" title="Roadmap" />

      <p className="-mt-3 mb-8 max-w-[64ch] text-[12.5px] leading-relaxed text-os-muted [text-wrap:pretty]">
        No quarters, no queue — every line below is either shipped or blocked on one specific thing only Sean can
        do: a credential, an OAuth grant, or a decision. Nothing here is agent time being held back.
      </p>

      {/* High-level functionality phases */}
      <section className="mb-9">
        <SectionHead label="Phases" count={phases.length} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 ultra:grid-cols-6">
          {phases.map((phase) => (
            <div key={phase.id} className="rounded-lg-t border border-os-border bg-os-surface px-[17px] py-[15px]">
              <div className="mb-[7px] font-mono text-[10px] tracking-[0.18em] text-os-accent">
                PHASE {String(phase.number).padStart(2, '0')}
              </div>
              <h2 className="text-sm font-bold">{phase.title}</h2>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {phase.items.map((item) => (
                  <li key={item} className="flex items-baseline gap-2 text-[11.5px] text-os-muted">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-os-dim" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Waiting on you — the whole open list, one flat priority order, no scheduling */}
      <section className="mb-9">
        <SectionHead label="Waiting on you" count={waiting.length} />
        {waiting.length === 0 ? (
          <div className="rounded-lg-t border border-os-border bg-os-surface px-[18px] py-6 text-center font-mono text-[11px] text-os-dim">
            Nothing waiting — everything buildable is built and live.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {waiting.map((item) => {
              const badge = STATUS_BADGE[item.status];
              const dept = item.departmentId ? departments.get(item.departmentId) : null;
              return (
                <div key={item.id} className="hoverable rounded-lg-t border border-os-border bg-os-surface px-[15px] py-3">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="text-[12.5px] font-semibold leading-snug">{item.title}</div>
                    <Badge tone={badge.tone} ghost={badge.ghost}>
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-os-dim [text-wrap:pretty]">{item.description}</p>
                  {dept && (
                    <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[9.5px] text-os-muted">
                      <span className="h-[5px] w-[5px] rounded-sm bg-os-accent" />
                      {dept.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Shipped — collapsed, dimmed, no schedule metadata */}
      <section>
        <SectionHead label="Live" count={`${shipped.length}/${progress.total} · ${progress.percentDone}% shipped`} />
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {shipped.map((item) => {
            const dept = item.departmentId ? departments.get(item.departmentId) : null;
            return (
              <div
                key={item.id}
                className="flex items-baseline gap-2.5 rounded-sm-t border border-os-border bg-os-surface px-3 py-[9px] opacity-[0.62]"
              >
                <span className="shrink-0 font-mono text-[10px] font-bold text-os-ok">✓</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-os-muted line-through decoration-os-dim">
                  {item.title}
                </span>
                {dept && <span className="shrink-0 font-mono text-[9.5px] text-os-dim">{dept.name}</span>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
