import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { PersonasViewer } from '@/components/PersonasViewer';
import { Badge, Dot } from '@/components/terminal';

export const dynamic = 'force-dynamic';

export default function PersonasPage() {
  const personas = getDb().personas.all();

  return (
    <div>
      <PageHeader
        eyebrow="platform variants"
        title="Personas"
        right={
          personas.length > 0 ? (
            <Badge tone="accent">{personas.length} templates</Badge>
          ) : (
            <Badge tone="default">
              <Dot state="not_configured" />
              none authored
            </Badge>
          )
        }
      />
      {personas.length > 0 ? (
        <PersonasViewer personas={personas} />
      ) : (
        <section className="rounded-lg-t border border-os-border bg-os-surface p-5">
          <p className="font-mono text-[12px] leading-relaxed text-os-muted">
            No personas authored. A <span className="text-os-text">persona</span> here is a full alternate
            configuration of this OS for a different kind of operator — its own pillars (departments), the
            agents that run them, the connectors it wires, the metrics it tracks, and how it uses the shared
            knowledge layer (<code className="text-os-accent">PersonaSchema</code> in{' '}
            <code className="text-os-accent">lib/schemas.ts</code>). The library shipped here empty on
            purpose: the original ten &quot;operator archetype&quot; templates were invented demo content —
            fictional businesses with fabricated pillars and metrics — and were retired wholesale rather
            than kept around dressed up as real (<code className="text-os-accent">db.personas.clearAll()</code>{' '}
            in <code className="text-os-accent">lib/seed.ts</code>). This page will have content again only
            once Arise Above actually configures and runs this OS as a second real operator persona — not
            before.
          </p>
        </section>
      )}
    </div>
  );
}
