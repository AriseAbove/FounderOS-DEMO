import { getDb } from '@/lib/data';
import { allConnectorStatuses } from '@/lib/connectors';
import { PageHeader } from '@/components/PageHeader';
import { SkillsGrid, type SkillCard } from '@/components/SkillsGrid';
import { readUserSkills, liveSkillStatus } from '@/lib/skills-catalog';

export const dynamic = 'force-dynamic';

const truncate = (t: string, n = 110) => (t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t);

export default async function SkillsPage() {
  const real = readUserSkills();

  let cards: SkillCard[];
  let sourceNote: string;

  if (real.length > 0) {
    // Live from disk — the full SKILL.md loads on demand via /api/skills/[slug].
    cards = real.map((s) => ({
      id: s.slug,
      name: s.name,
      group: s.group,
      description: truncate(s.description),
      meta: s.path,
      filePath: s.path,
    }));
    sourceNote = `${real.length} skills read live from ~/.claude/skills — open any card to read its SKILL.md.`;
  } else {
    // Fallback: the seeded catalog (docs carried inline).
    const db = getDb();
    const agentNames = Object.fromEntries(db.agents.all().map((a) => [a.id, a.name]));
    // "Books pulse" used to carry a hardcoded 'live' status regardless of
    // whether QuickBooks was actually connected — see lib/skills-catalog.ts's
    // liveSkillStatus() for the honest, computed replacement (every other
    // seeded skill keeps its authored status untouched).
    const connections = await allConnectorStatuses();
    const quickbooks = connections.find((c) => c.id === 'quickbooks');
    cards = db.skills.all().map((s) => ({
      id: s.id,
      name: s.name,
      group: s.category,
      description: truncate(s.description),
      meta: s.ownerAgentId ? (agentNames[s.ownerAgentId] ?? s.ownerAgentId) : 'unassigned',
      filePath: `skills/${s.id}/SKILL.md`,
      status: liveSkillStatus(s.id, quickbooks, s.status),
      markdown: s.markdown,
    }));
    sourceNote = 'Seeded catalog — no ~/.claude/skills found on this machine.';
  }

  return (
    <div>
      <PageHeader eyebrow="capability library" title="Skills" />
      <SkillsGrid cards={cards} sourceNote={sourceNote} />
    </div>
  );
}
