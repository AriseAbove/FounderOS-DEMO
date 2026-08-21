import Link from 'next/link';
import { ArrowUpRight, Clapperboard, Wrench } from 'lucide-react';
import { getDb } from '@/lib/data';
import { contentAgents } from '@/lib/content';
import { allConnectorStatuses } from '@/lib/connectors';
import { liveAgentStatus } from '@/lib/agents/live-status';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Dot, SectionHead } from '@/components/terminal';
import type { Agent } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

function prettyTool(slug: string): string {
  return slug.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function AgentCard({ agent, lead = false }: { agent: Agent; lead?: boolean }) {
  return (
    <div
      className={`rounded-lg-t border bg-os-surface p-4 ${lead ? 'border-[var(--accent-line)]' : 'border-os-border'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Dot state={agent.status === 'active' ? 'ok' : 'available'} pulse={agent.status === 'active'} />
            <span className="truncate text-[14px] font-bold">{agent.name}</span>
            {lead && <span className="rounded-sm-t border border-[var(--accent-line)] px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-os-accent">lead</span>}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-os-dim">{agent.role} · {agent.model}</div>
        </div>
        <span className={`shrink-0 font-mono text-[10px] uppercase tracking-wide ${agent.status === 'active' ? 'text-os-ok' : 'text-os-warn'}`}>
          {agent.status}
        </span>
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-os-muted [text-wrap:pretty]">{agent.description}</p>
      {agent.tools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agent.tools.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-sm-t border border-os-border bg-os-surface2 px-1.5 py-0.5 font-mono text-[10px] text-os-muted">
              <Wrench className="h-2.5 w-2.5" /> {prettyTool(t)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function ContentPage() {
  const db = getDb();
  const connections = await allConnectorStatuses();
  // Honest, computed status — see lib/agents/live-status.ts. Same rule Home
  // and /agents use, so this page never shows "planned" for an agent that's
  // actually live elsewhere (e.g. Social Pulse once ONEUP_API_KEY is set).
  const liveAgents = db.agents.all().map((a) => ({
    ...a,
    status: liveAgentStatus(a.id, connections, db.agentRuns.byAgent(a.id)[0], a.status),
  }));
  const crew = contentAgents(liveAgents);
  const lead = crew[0] ?? null;
  const workers = lead ? crew.slice(1) : crew;


  return (
    <div>
      <PageHeader
        eyebrow="content engine"
        title="Content Creation"
        right={<Badge tone="accent">{crew.length} agents</Badge>}
      />

      {/* The content agent + crew (real seed roster) */}
      <section className="mt-8">
        <SectionHead
          label="Content agents"
          count={`${crew.length}`}
        />
        <p className="mb-3 flex items-center gap-1.5 text-xs text-os-dim">
          <Clapperboard className="h-3.5 w-3.5" /> Tied to your social media — run them from{' '}
          <Link href="/agents" className="inline-flex items-center gap-0.5 text-os-accent hover:underline">
            Agents <ArrowUpRight className="h-3 w-3" />
          </Link>
        </p>
        {lead && <AgentCard agent={lead} lead />}
        {workers.length > 0 && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {workers.map((a) => (
              <AgentCard key={a.id} agent={a} />
            ))}
          </div>
        )}
      </section>

      {/* Publishing pipeline — honest empty until a posting source connects */}
      <section className="mt-8">
        <SectionHead label="Content pipeline" count="no source connected" />
        <p className="rounded-lg-t border border-dashed border-os-border bg-os-surface px-4 py-5 text-center font-mono text-[11.5px] text-os-dim">
          No posting source is connected — published content and cadence land here when one is.
        </p>
      </section>
    </div>
  );
}
