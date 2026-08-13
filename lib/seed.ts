import type { FounderDb } from '@/lib/db';
import type {
  Agent,
  AgentTask,
  Department,
  Domain,
  EmailListSnapshot,
  FunnelContact,
  FunnelTouch,
  Metric,
  Person,
  Phase,
  RoadmapItem,
  SopTask,
  Workflow,
  Skill,
  SocialAccount,
  SocialDm,
  SocialDmSnapshot,
  SocialDmMessage,
  SocialPost,
  SocialSnapshot,
  Tool,
} from '@/lib/schemas';

// Monochrome palette — the UI is strict black & white; "color" fields carry
// grayscale steps used only for subtle hierarchy.
const GRAY = {
  white: '#fafafa',
  light: '#d4d4d4',
  mid: '#a3a3a3',
  dim: '#737373',
  dark: '#525252',
};

// the operator's five operating pillars (2026-06-12 directive).
const departments: Department[] = [
  { id: 'dept-sales', name: 'Sales', slug: 'sales', tagline: 'Pipeline and deals.', color: GRAY.white, order: 1 },
  { id: 'dept-marketing-growth', name: 'Marketing/Growth', slug: 'marketing-growth', tagline: 'Publishing, content, attention.', color: GRAY.light, order: 2 },
  { id: 'dept-tech', name: 'TECH', slug: 'tech', tagline: 'AI & automations · G-Brain.', color: GRAY.mid, order: 3 },
  { id: 'dept-finance', name: 'Finances', slug: 'finances', tagline: 'Every processor, one view.', color: GRAY.dim, order: 4 },
  { id: 'dept-comms', name: 'Communications', slug: 'communications', tagline: 'Gmail, WhatsApp, Slack → one feed.', color: GRAY.dark, order: 5 },
  { id: 'dept-clients', name: 'Clients', slug: 'clients', tagline: 'Every client, onboarded and served.', color: GRAY.light, order: 6 },
];

// The roster IS the runtime — every row here maps 1:1 to a RuntimeAgent in
// lib/agents/real.ts (enforced by tests/seed.test.ts). No larp agents.
//
// Shape: top-level agents (parentId null) are INSTANCE slots — each one is
// what becomes its own OpenClaw Hermes / Claude Code process on the dedicated host
// (`instance` records that binding; everything is 'builtin' until then).
// Worker rows underneath them do one specific task each and sit at the
// bottom of the hierarchy.
const agents: Agent[] = [
  // ── TECH: command + knowledge ───────────────────────────────────────────
  {
    id: 'conductor',
    departmentId: 'dept-tech',
    name: 'Conductor',
    role: 'Broadcast & Orchestration',
    status: 'active',
    tier: 'lead',
    description: 'Fans a message out to every agent at once and reports fleet size and run history from the DB.',
    model: 'fan-out runtime',
    tools: ['broadcast'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'data-agent',
    departmentId: 'dept-tech',
    name: 'Data Agent',
    role: 'Knowledge Search',
    status: 'planned',
    tier: 'lead',
    description: 'Answers questions from the knowledge layer through the brain provider abstraction. Honest stub until a provider is wired.',
    model: 'brain provider',
    tools: ['brain'],
    parentId: null,
    instance: 'builtin',
  },
  // ── Communications: one instance, two channel workers feeding /comms ────
  {
    id: 'comms-agent',
    departmentId: 'dept-comms',
    name: 'Comms Agent',
    role: 'Unified Communications Instance',
    status: 'active',
    tier: 'lead',
    description: 'Owns the unified /comms feed. Aggregates its channel workers and reports which are live.',
    model: 'aggregate of workers',
    tools: ['comms-feed'],
    parentId: null,
    instance: 'builtin',
  },
  {
    id: 'gmail-worker',
    departmentId: 'dept-comms',
    name: 'Gmail Worker',
    role: 'IMAP Inboxes ×4',
    status: 'planned',
    tier: 'worker',
    description: 'Pulls unread counts and recent mail from up to four IMAP inboxes into /comms. Activates when INBOX_* creds land.',
    model: 'imapflow',
    tools: ['imap'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  {
    id: 'calendar-worker',
    departmentId: 'dept-comms',
    name: 'Calendar Worker',
    role: 'Schedule Feed',
    status: 'planned',
    tier: 'worker',
    description: 'Upcoming events from ICS/CalDAV calendar feeds. Activates when CAL_* creds land.',
    model: 'node-ical',
    tools: ['calendar'],
    parentId: 'comms-agent',
    instance: 'builtin',
  },
  // ── Finances ─────────────────────────────────────────────────────────────
  {
    id: 'quickbooks-pulse',
    departmentId: 'dept-finance',
    name: 'QuickBooks Pulse',
    role: 'Books Monitor',
    status: 'planned',
    tier: 'lead',
    description: 'Reports the QuickBooks connection state; month-to-date income and expenses once the OAuth grant lands.',
    model: 'quickbooks api',
    tools: ['quickbooks'],
    parentId: null,
    instance: 'builtin',
  },
];

// ── Humans in the process ─────────────────────────────────────────────────────
// Empty on purpose: the previous seed carried invented staff. Real hires get
// added here when they exist — a name in this file means a real person.
const people: Person[] = [];

// ── SOP tasks — every agent's job, written out ───────────────────────────────
// One task per worker, one worker per task (monogamous; tests enforce it).
// The chain the /brain graph draws: department → task → worker → tools.
const sopTasks: SopTask[] = [
  {
    id: 'sop-conductor', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'conductor',
    title: 'Broadcast directives across the fleet',
    summary: 'One message in, every agent briefed, replies collected.',
    steps: [
      'Receive the directive from the operator console',
      'Resolve the target list: the whole fleet, or the pillar the directive names',
      'Fan the message out to every target at once and stamp each send',
      'Collect replies as they land and file the run to agent_runs',
      'Report non-responders so nothing fails silently',
    ],
  },
  {
    id: 'sop-data-agent', departmentId: 'dept-tech', assigneeKind: 'agent', assigneeId: 'data-agent',
    title: 'Answer questions from the knowledge layer',
    summary: 'Search through the provider abstraction, honest fallbacks.',
    steps: [
      'Parse the incoming question into a search query',
      'Run the query through the configured brain provider',
      'Report an honest empty result while no provider is wired',
      'Return cited passages with their source notes, never invented ones',
      'Log unanswerable questions as gaps to fill',
    ],
  },
  {
    id: 'sop-comms-agent', departmentId: 'dept-comms', assigneeKind: 'agent', assigneeId: 'comms-agent',
    title: 'Compose the unified comms feed',
    summary: 'Email and calendar, one timeline at /comms.',
    steps: [
      'Collect fresh output from the Gmail and Calendar workers',
      'Dedupe and merge everything into one ordered timeline',
      'Mark which channels are live and which are awaiting credentials',
      'Surface the merged feed to /comms and the operator console',
      'Report per-channel errors honestly instead of hiding a dead source',
    ],
  },
  {
    id: 'sop-gmail-worker', departmentId: 'dept-comms', assigneeKind: 'agent', assigneeId: 'gmail-worker',
    title: 'Triage the inboxes',
    summary: 'Up to four IMAP inboxes, honest unread counts.',
    steps: [
      'Poll each configured IMAP inbox for unread counts and recent mail',
      'Report per-inbox errors instead of hiding a dead connection',
      'Feed recent messages into the unified comms timeline',
      'Flag inboxes that have not been configured yet',
      'Never mark mail read or delete anything — read-only by design',
    ],
  },
  {
    id: 'sop-calendar-worker', departmentId: 'dept-comms', assigneeKind: 'agent', assigneeId: 'calendar-worker',
    title: 'Surface the schedule',
    summary: 'Upcoming events from every connected calendar feed.',
    steps: [
      'Fetch the ICS/CalDAV feed for each configured calendar account',
      'Merge events across calendars into one upcoming list',
      'Extract join links so meetings are one click away',
      'Report honestly when no calendar credentials are set',
      'Skip cancelled events and expand recurring ones correctly',
    ],
  },
  {
    id: 'sop-quickbooks-pulse', departmentId: 'dept-finance', assigneeKind: 'agent', assigneeId: 'quickbooks-pulse',
    title: 'Report the books truthfully',
    summary: 'QuickBooks connection state, income and expenses.',
    steps: [
      'Check the stored OAuth grant and refresh tokens before they expire',
      'Pull month-to-date income and expenses from QuickBooks once connected',
      'List open invoices with balances and due dates',
      'Report not-configured honestly until the grant lands — no faked money',
      'Surface token-refresh failures the moment they happen',
    ],
  },
];

// The honest tool list: only what this OS actually integrates with today.
// status 'available' = implemented, goes live when credentials land.
const tools: Tool[] = [
  { id: 'tool-imap', name: 'Email (4 IMAP slots)', category: 'Comms', status: 'available', color: GRAY.light, description: 'Client implemented for 4 inboxes — set INBOX_1..4_HOST/_USER/_PASS.' },
  { id: 'tool-calendar', name: 'Calendar (ICS/CalDAV)', category: 'Comms', status: 'available', color: GRAY.mid, description: 'Upcoming events across calendar feeds — set CAL_1_USER/_PASS.' },
  { id: 'tool-quickbooks', name: 'QuickBooks', category: 'Finance', status: 'available', color: GRAY.white, description: 'The real books: MTD income/expenses + open invoices once the OAuth grant lands.' },
  { id: 'tool-llm', name: 'Claude API', category: 'AI', status: 'available', color: GRAY.light, description: 'LLM lane for agent chat — set ANTHROPIC_API_KEY (stub provider in tests).' },
  { id: 'tool-brain-store', name: 'Markdown knowledge store', category: 'Knowledge', status: 'available', color: GRAY.mid, description: 'Point BRAIN_STORE at a folder of markdown — grep search + capture, no external service.' },
  { id: 'tool-railway', name: 'Railway (hosting)', category: 'Infrastructure', status: 'connected', color: GRAY.dim, description: 'Production host; SQLite lives on a mounted volume so redeploys keep data.' },
];

// The real rebuild roadmap — what has actually shipped and what is next.
const roadmap: RoadmapItem[] = [
  { id: 'rm-p0', title: 'Phase 0: foundation', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'Railway volume mounted (DB survives deploys), creds hygiene, ownership docs.' },
  { id: 'rm-p1', title: 'Phase 1: business lens', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'AAC / Apps / Combined switcher; businesses replace the demo ventures.' },
  { id: 'rm-p2', title: 'Phase 2: the purge', quarter: '2026-Q3', status: 'done', departmentId: 'dept-tech', description: 'Demo connectors, invented data, and fictional roster removed; AAC pipeline in the funnel.' },
  { id: 'rm-qbo', title: 'Connect QuickBooks', quarter: '2026-Q3', status: 'now', departmentId: 'dept-finance', description: 'OAuth grant → real MTD income, expenses, open invoices on /finances.' },
  { id: 'rm-email', title: 'Connect the inboxes', quarter: '2026-Q3', status: 'now', departmentId: 'dept-comms', description: 'IMAP creds into INBOX_1..4 slots → live unified /comms.' },
  { id: 'rm-cal', title: 'Connect the calendar', quarter: '2026-Q3', status: 'now', departmentId: 'dept-comms', description: 'CalDAV creds → real schedule in /comms and agent context.' },
  { id: 'rm-allo', title: 'Allo call log → funnel', quarter: '2026-Q4', status: 'next', departmentId: 'dept-sales', description: 'Real AAC leads flow from the AI receptionist into the pipeline stages.' },
  { id: 'rm-apps-funnel', title: 'Define the Apps funnel', quarter: '2026-Q4', status: 'next', departmentId: 'dept-sales', description: 'Arise Above Apps gets its own stage model — the aac placeholder retires.' },
  { id: 'rm-crm', title: 'Evaluate CRM sync', quarter: '2026-Q4', status: 'later', departmentId: 'dept-sales', description: 'HubSpot (or Allo built-in CRM) as the lead source of record feeding the funnel.' },
];

// Honest zeros — these flip to live numbers as connectors come online.
const metrics: Metric[] = [
  { id: 'metric-unread', key: 'unread_total', label: 'Unread (all inboxes)', value: 0, unit: 'emails', delta: 0, period: 'pending creds' },
  { id: 'metric-brain', key: 'brain_pages', label: 'Brain-store Pages', value: 0, unit: 'pages', delta: 0, period: 'run Data Agent' },
  { id: 'metric-qbo-net', key: 'qbo_net_mtd', label: 'QuickBooks Net (MTD)', value: 0, unit: 'usd', delta: 0, period: 'pending OAuth' },
  { id: 'metric-runs', key: 'agent_runs', label: 'Agent Runs Logged', value: 0, unit: 'runs', delta: 0, period: 'all time' },
];

const domains: Domain[] = [
  { id: 'brm-1', number: 1, title: 'Command & Memory', color: GRAY.white, items: ['Operator dashboard', 'Agent run history', 'Markdown knowledge store'] },
  { id: 'brm-2', number: 2, title: 'Email Operations', color: GRAY.light, items: ['Four IMAP inboxes', 'Unread triage', 'Per-inbox health'] },
  { id: 'brm-3', number: 3, title: 'Schedule', color: GRAY.light, items: ['CalDAV calendar feeds', 'Meeting join links', 'Week-ahead view'] },
  { id: 'brm-4', number: 4, title: 'Books & Revenue', color: GRAY.mid, items: ['QuickBooks income/expenses', 'Open invoices', 'Statement uploads'] },
  { id: 'brm-5', number: 5, title: 'Lead Pipeline', color: GRAY.mid, items: ['AAC stages inquiry → paid', 'Decay + attention queues', 'Allo call log (planned)'] },
  { id: 'brm-6', number: 6, title: 'Agent Runtime', color: GRAY.dim, items: ['Registry + run()', 'Persisted run log', 'Honest failure states'] },
  { id: 'brm-7', number: 7, title: 'Infrastructure', color: GRAY.dim, items: ['Railway hosting', 'Mounted volume for SQLite', 'Deploy pipeline'] },
  { id: 'brm-8', number: 8, title: 'Security', color: GRAY.dark, items: ['.env.local secrets (gitignored)', 'Read-only connector scopes', 'No keys in repo'] },
];

const phases: Phase[] = [
  { id: 'phase-0', number: 1, title: 'Foundation', items: ['Railway volume', 'Creds hygiene', 'Ownership docs'] },
  { id: 'phase-1', number: 2, title: 'Business Lens', items: ['AAC / Apps switcher', 'businesses.ts', 'Explicit business args'] },
  { id: 'phase-2', number: 3, title: 'The Purge', items: ['Demo connectors out', 'Invented data out', 'AAC pipeline in'] },
  { id: 'phase-3', number: 4, title: 'Real Connections', items: ['QuickBooks OAuth', 'Email + calendar creds', 'Allo call log → funnel'] },
];

// Real Arise Above Construction accounts — handles only, no invented
// follower counts. Snapshot history stays empty until a real source records
// it; the dashboards render honest nulls.
const socialAccounts: SocialAccount[] = [
  { platform: 'instagram', handle: '@ariseaboveconstruction', url: 'https://instagram.com/ariseaboveconstruction', order: 1 },
];

const socialBaseline: SocialSnapshot[] = [];
const emailListBaseline: EmailListSnapshot[] = [];
const socialDms: SocialDm[] = [];
const socialDmMessages: SocialDmMessage[] = [];
const socialDmSnapshots: SocialDmSnapshot[] = [];
const socialPosts: SocialPost[] = [];

// ── Funnel journeys ─────────────────────────────────────────────────────────
// Empty on purpose: the previous seed carried ~12 invented client journeys.
// Real AAC leads land here (via the Allo call log, a CRM sync, or manual
// entry) in the real pipeline: inquiry → follow_up → walkthrough_scheduled →
// estimate_sent → negotiation → contract_signed → active_project →
// complete_paid. Apps journeys reuse these stages as a flagged placeholder
// until Arise Above Apps defines its own funnel.
const funnelContacts: FunnelContact[] = [];
const funnelTouches: FunnelTouch[] = [];

// Workflows are empty on purpose: the previous seed shipped the original
// creator's invented revenue machines (fake $ figures throughout). Real AAC
// workflows get mapped here deliberately, one at a time.
const workflows: Workflow[] = [];

// Seeded agent tasks are gone — the previous list was invented work items.
// Real tasks are created from the UI (insert-by-id keeps user tasks intact).
const agentTasks: AgentTask[] = [];

const SKILL_STATUS_NOTE: Record<string, string> = {
  live: 'Live in production. The owning agent runs this today.',
  learning: 'In training. Runs with a human in the loop while it calibrates.',
  planned: 'Planned. Scoped and queued, not yet wired.',
};

/** Compose a real-ready SKILL.md doc from a skill's fields (viewed from its card). */
function skillDoc(s: Omit<Skill, 'markdown'>): string {
  const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const toolLine = s.tools.length ? s.tools.map((t) => `\`${t}\``).join(', ') : 'no external tools';
  return `---
name: ${slug}
description: ${s.description}
category: ${s.category}
status: ${s.status}
---

# ${s.name}

${s.description}

## When to use
Reach for this when the ${s.category.toLowerCase()} flow needs to ${s.name.toLowerCase()}. It runs on ${toolLine}.

## Status
${SKILL_STATUS_NOTE[s.status] ?? s.status}
`;
}

// The capability library the agent workforce draws on. Only skills that map
// to a real implemented lane appear here — no larp capabilities.
const skills: Omit<Skill, 'markdown'>[] = [
  { id: 'skill-triage', name: 'Inbox triage', category: 'Ops', description: 'Unread counts and recent mail across up to four IMAP inboxes, honest per-inbox errors.', ownerAgentId: 'gmail-worker', status: 'live', tools: ['imap'], order: 0 },
  { id: 'skill-schedule', name: 'Schedule awareness', category: 'Ops', description: 'Upcoming events merged across connected calendar feeds, join links extracted.', ownerAgentId: 'calendar-worker', status: 'live', tools: ['calendar'], order: 1 },
  { id: 'skill-books', name: 'Books pulse', category: 'Finance', description: 'QuickBooks month-to-date income, expenses, and open invoices once the OAuth grant lands.', ownerAgentId: 'quickbooks-pulse', status: 'live', tools: ['quickbooks'], order: 2 },
  { id: 'skill-retrieval', name: 'Knowledge retrieval', category: 'Ops', description: 'Search over the knowledge layer so every agent shares one memory. Stub until a provider is wired.', ownerAgentId: 'data-agent', status: 'planned', tools: ['brain'], order: 3 },
];

/** Bump when the seed content changes shape — existing DBs re-seed once to
 *  pick up the new baseline (and purge retired rows). */
export const SEED_VERSION = '2026-08-13-phase2-purge';

export function seedDatabase(db: FounderDb): void {
  // INSERT OR REPLACE in every repo makes re-seeding idempotent by id.
  for (const d of departments) db.departments.insert(d);
  for (const a of agents) db.agents.insert(a);
  // The roster IS the runtime: rows that left the roster leave the DB too,
  // and departments that left the operating model go with them.
  db.agents.deleteWhereIdNotIn(agents.map((a) => a.id));
  db.departments.deleteWhereIdNotIn(departments.map((d) => d.id));
  for (const p of people) db.people.insert(p);
  db.people.deleteWhereIdNotIn(people.map((p) => p.id));
  for (const t of sopTasks) db.sopTasks.insert(t);
  db.sopTasks.deleteWhereIdNotIn(sopTasks.map((t) => t.id));
  for (const w of workflows) db.workflows.insert(w);
  db.workflows.deleteWhereIdNotIn(workflows.map((w) => w.id));
  for (const s of skills) db.skills.insert({ ...s, markdown: skillDoc(s) });
  db.skills.deleteWhereIdNotIn(skills.map((s) => s.id));
  for (const t of agentTasks) db.agentTasks.insert(t); // insert-by-id; user tasks coexist
  // Drop the retired invented task rows from any DB seeded before the purge.
  for (let i = 1; i <= 11; i++) db.agentTasks.remove(`task-seed-${i}`);
  for (const t of tools) db.tools.insert(t);
  for (const r of roadmap) db.roadmap.insert(r);
  for (const m of metrics) db.metrics.insert(m);
  for (const d of domains) db.domains.insert(d);
  db.personas.clearAll(); // persona templates were demo content — retired
  for (const p of phases) db.phases.insert(p);
  for (const a of socialAccounts) db.social.upsertAccount(a);
  // Retired invented follower/DM history leaves the DB on re-seed; anything a
  // real source recorded survives.
  db.social.deleteSeeded();
  db.social.deleteAccountsWherePlatformNotIn(socialAccounts.map((a) => a.platform));
  for (const s of socialBaseline) db.social.insertSnapshot(s);
  for (const d of socialDms) db.social.upsertDm(d);
  for (const s of socialDmSnapshots) db.social.insertDmSnapshot(s);
  for (const m of socialDmMessages) db.social.upsertDmMessage(m);
  // Retired dummy email history leaves the DB on re-seed; the real Beehiiv
  // baseline is authoritative. Live-synced snapshots survive.
  db.emailList.deleteSeeded();
  for (const s of emailListBaseline) db.emailList.insertSnapshot(s);
  for (const p of socialPosts) db.socialPosts.enqueue(p);
  db.socialPosts.remove('post-seed-1'); // retired invented queue item
  for (const c of funnelContacts) db.funnel.insertContact(c);
  for (const t of funnelTouches) db.funnel.insertTouch(t);
  db.seedMeta.set('seed_version', SEED_VERSION);
}
