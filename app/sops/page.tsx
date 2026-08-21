import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { Badge, SectionHead } from '@/components/terminal';
import { lifeAreaForDepartment } from '@/lib/life-map';
import type { Agent, Department, Person, SopTask } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

/** Resolve a task's assignee to a display name + role, agent or person alike. */
function assigneeOf(task: SopTask, agents: Map<string, Agent>, people: Map<string, Person>) {
  if (task.assigneeKind === 'agent') {
    const a = agents.get(task.assigneeId);
    return { name: a?.name ?? task.assigneeId, role: a?.role ?? 'Agent' };
  }
  const p = people.get(task.assigneeId);
  return { name: p?.name ?? task.assigneeId, role: p?.role ?? 'Person' };
}

function SopCard({
  task,
  department,
  agents,
  people,
}: {
  task: SopTask;
  department: Department | undefined;
  agents: Map<string, Agent>;
  people: Map<string, Person>;
}) {
  const assignee = assigneeOf(task, agents, people);
  const color = department ? lifeAreaForDepartment(department.id)?.color : null;
  return (
    <article className="rounded-lg-t border border-os-border bg-os-surface px-[18px] py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-bold leading-snug [text-wrap:pretty]">{task.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-os-dim">
            <span className="text-os-muted">{assignee.name}</span>
            <span>·</span>
            <span>{assignee.role}</span>
          </div>
        </div>
        <Badge>{task.assigneeKind === 'agent' ? 'Agent' : 'Person'}</Badge>
      </div>

      {task.summary && <p className="mt-2.5 text-xs leading-relaxed text-os-muted [text-wrap:pretty]">{task.summary}</p>}

      <ol className="mt-3.5 flex flex-col gap-1.5">
        {task.steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-os-muted">
            <span className="mt-0.5 shrink-0 font-mono text-[9.5px] font-bold text-os-accent">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="[text-wrap:pretty]">{step}</span>
          </li>
        ))}
      </ol>

      {department && (
        <div className="mt-3.5 flex items-center gap-1.5 border-t border-os-border pt-3 font-mono text-[9.5px] text-os-muted">
          <span className="h-[5px] w-[5px] rounded-sm" style={{ backgroundColor: color ?? 'var(--accent)' }} />
          {department.name}
        </div>
      )}
    </article>
  );
}

export default function SopsPage() {
  const db = getDb();
  const tasks = db.sopTasks.all();
  const departments = db.departments.all();
  const departmentById = new Map(departments.map((d) => [d.id, d]));
  const agentById = new Map(db.agents.all().map((a) => [a.id, a]));
  const personById = new Map(db.people.all().map((p) => [p.id, p]));

  const byDept = new Map<string, SopTask[]>();
  for (const t of tasks) byDept.set(t.departmentId, [...(byDept.get(t.departmentId) ?? []), t]);
  const groups = departments
    .filter((d) => byDept.has(d.id))
    .map((d) => ({ department: d, tasks: byDept.get(d.id)! }));

  return (
    <div>
      <PageHeader eyebrow="standard operating procedure" title="SOPs" />

      <p className="-mt-3 mb-6 max-w-[62ch] text-[12.5px] leading-relaxed text-os-muted [text-wrap:pretty]">
        Every agent on the roster runs from a written procedure, not guesswork — no person has been seeded onto it
        yet. This is the checklist each one actually follows — the same source data behind the nodes in{' '}
        <a href="/brain" className="text-os-accent hover:underline">
          Knowledge
        </a>
        , surfaced here as a straight read.
      </p>

      {tasks.length === 0 ? (
        <div className="rounded-lg-t border border-os-border bg-os-surface px-[18px] py-6 text-center font-mono text-[11px] text-os-dim">
          No SOPs seeded yet.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(({ department, tasks: deptTasks }) => (
            <section key={department.id}>
              <SectionHead label={department.name} count={deptTasks.length} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {deptTasks.map((t) => (
                  <SopCard key={t.id} task={t} department={department} agents={agentById} people={personById} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
