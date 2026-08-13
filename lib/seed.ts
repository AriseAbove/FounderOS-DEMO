import type { FounderDb } from '@/lib/db';
import { PERSONAS } from '@/lib/personas-seed';
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

// Alex's five operating pillars (2026-06-12 directive).
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

// Curated from a full-filesystem discovery sweep.
// status reflects what was VERIFIED on this machine: connected = creds/binary
// exist and worked; available = installed/configured but needs a key or start.
const tools: Tool[] = [
  // Knowledge
  { id: 'tool-gbrain', name: 'G-Brain (gbrain CLI)', category: 'Knowledge', status: 'connected', color: GRAY.white, description: 'v0.41 · brain-store markdown + Supabase + ZeroEntropy embeddings. Live.' },
  { id: 'tool-brain-store', name: 'brain-store/', category: 'Knowledge', status: 'connected', color: GRAY.light, description: 'Local markdown knowledge base at knowledge/brain-store.' },
  { id: 'tool-zeroentropy', name: 'ZeroEntropy', category: 'Knowledge', status: 'connected', color: GRAY.mid, description: 'Vector embeddings behind gbrain hybrid search. Key in ~/.config/knowledge/config.json.' },
  { id: 'tool-supabase', name: 'Supabase (Second Brain)', category: 'Knowledge', status: 'available', color: GRAY.mid, description: '1240 pages / 15k chunks. Free tier pauses on idle — unpause from dashboard when queries fail.' },
  { id: 'tool-obsidian', name: 'Notes Vault', category: 'Knowledge', status: 'connected', color: GRAY.light, description: 'Local notes vault. Direct filesystem access.' },
  { id: 'tool-notion', name: 'Notion', category: 'Knowledge', status: 'available', color: GRAY.dim, description: 'Client implemented. Set NOTION_API_KEY and share pages with the integration.' },
  // Social & growth
  { id: 'tool-zernio', name: 'Zernio', category: 'Social', status: 'connected', color: GRAY.white, description: '6 platforms under @founderos.ai (IG, TikTok, X…). Key at ~/.config/social/.env — live.' },
  { id: 'tool-manychat', name: 'ManyChat', category: 'Social', status: 'available', color: GRAY.dim, description: 'DM automation. Endpoint map fully documented in shared-config; needs MANYCHAT_API_KEY.' },
  { id: 'tool-skool', name: 'Skool (via Playwright)', category: 'Social', status: 'connected', color: GRAY.mid, description: 'launchpad-cohort community, driven by the documented Playwright workflow.' },
  // CRM & revenue
  { id: 'tool-attio', name: 'Attio', category: 'CRM & Revenue', status: 'connected', color: GRAY.white, description: 'Vantage + LC deals. Key reused from MCP config (read-scoped: query records, not lists).' },
  { id: 'tool-fanbasis', name: 'FanBasis', category: 'CRM & Revenue', status: 'planned', color: GRAY.light, description: 'Offer/payment/customer context for Sales, including the Vantage FanBasis lane.' },
  { id: 'tool-pava', name: 'PAVA', category: 'CRM & Revenue', status: 'planned', color: GRAY.mid, description: 'Financing options for sales offers and payment-plan context.' },
  { id: 'tool-stripe', name: 'Stripe', category: 'CRM & Revenue', status: 'available', color: GRAY.light, description: 'Full client implemented — balance + charges live once STRIPE_SECRET_KEY is set.' },
  { id: 'tool-ghl', name: 'GoHighLevel', category: 'CRM & Revenue', status: 'planned', color: GRAY.dark, description: 'CLI wrapper scaffolded in knowledge/scripts; keys never added.' },
  { id: 'tool-fathom', name: 'Fathom', category: 'CRM & Revenue', status: 'available', color: GRAY.mid, description: 'AI meeting notetaker, used daily. Needs FATHOM_API_KEY from settings for API access.' },
  { id: 'tool-webinarjam', name: 'WebinarJam', category: 'CRM & Revenue', status: 'available', color: GRAY.light, description: 'Launchpad Cohort webinar funnel — registrants & attendees are leads. Client implemented; set WEBINARJAM_API_KEY (account-wide).' },
  { id: 'tool-trakyo', name: 'Trakyo', category: 'CRM & Revenue', status: 'planned', color: GRAY.dim, description: 'Revenue attribution for Launchpad Cohort: content → booked calls → payments. Status-only until Trakyo ships a public API (TRAKYO_API_KEY).' },
  // Creative studio
  { id: 'tool-remotion', name: 'Remotion Pipeline', category: 'Creative', status: 'connected', color: GRAY.white, description: 'Local remotion pipeline · LC + Vantage themes · 7 skills.' },
  { id: 'tool-higgsfield', name: 'Higgsfield CLI', category: 'Creative', status: 'connected', color: GRAY.light, description: 'v0.1.40, auth in keychain. generate / product-photoshoot / marketing-studio / soul-id.' },
  { id: 'tool-arcads', name: 'Arcads', category: 'Creative', status: 'connected', color: GRAY.mid, description: 'UGC ads for Vantage (Veo/Sora/Kling). Basic auth from env.' },
  { id: 'tool-whisper', name: 'Whisper (local)', category: 'Creative', status: 'connected', color: GRAY.dim, description: 'whisper-cli + ffmpeg via brew. Local transcription, nothing leaves the machine.' },
  { id: 'tool-miro', name: 'Miro', category: 'Creative', status: 'connected', color: GRAY.mid, description: 'REST API with token from knowledge/.env.agents. GBrain architecture board exists.' },
  { id: 'tool-canva-figma', name: 'Canva + Figma', category: 'Creative', status: 'available', color: GRAY.dark, description: 'Connected as Claude MCPs (session-scoped). Standalone API needs separate keys.' },
  // Comms
  { id: 'tool-imap', name: 'Email (4 IMAP slots)', category: 'Comms', status: 'available', color: GRAY.light, description: 'Client implemented for 4 inboxes — set INBOX_1..4_HOST/_USER/_PASS.' },
  { id: 'tool-slack', name: 'Slack', category: 'Comms', status: 'available', color: GRAY.mid, description: 'Client implemented. Needs a bot token with channels:read/history scopes.' },
  { id: 'tool-wispr', name: 'Wispr Flow', category: 'Comms', status: 'connected', color: GRAY.white, description: 'Voice dictation — heaviest daily-use tool found. Local flow.sqlite read live.' },
  { id: 'tool-whatsapp', name: 'WhatsApp', category: 'Comms', status: 'connected', color: GRAY.white, description: 'Desktop app local ChatStorage.sqlite, read-only: local team chats.' },
  // Orchestration & infra
  { id: 'tool-command-center', name: 'Command Center (:4000)', category: 'Orchestration', status: 'available', color: GRAY.light, description: 'command-center: kanban, brand deals, sales calls, SOPs, dispatch. Start with npm run dev.' },
  { id: 'tool-openclaw', name: 'OpenClaw Gateway', category: 'Orchestration', status: 'available', color: GRAY.dim, description: 'Dormant — gateway offline, token missing. Needs repair/reinstall.' },
  { id: 'tool-tmux', name: 'tmux', category: 'Orchestration', status: 'connected', color: GRAY.mid, description: 'Multi-Claude session orchestration. Dashboard reads live session list.' },
  { id: 'tool-ollama', name: 'Ollama', category: 'Orchestration', status: 'connected', color: GRAY.light, description: 'Local LLM server :11434, no auth. Pull a model to enable free local inference.' },
  { id: 'tool-vercel', name: 'Vercel CLI', category: 'Orchestration', status: 'connected', color: GRAY.mid, description: 'v50, authenticated. Deploy target when FOUNDER OS goes public.' },
  { id: 'tool-gh', name: 'GitHub CLI', category: 'Orchestration', status: 'connected', color: GRAY.dim, description: 'gh 2.89, authenticated.' },
  // Payments (registry awaiting keys)
  { id: 'tool-paypal', name: 'PayPal', category: 'Payments', status: 'planned', color: GRAY.mid, description: 'Registered in the processor registry; client lands when keys do.' },
  { id: 'tool-square', name: 'Square', category: 'Payments', status: 'planned', color: GRAY.dim, description: 'Registered in the processor registry; client lands when keys do.' },
  { id: 'tool-whop', name: 'Whop', category: 'Payments', status: 'planned', color: GRAY.dark, description: 'Registered in the processor registry; client lands when keys do.' },
];

const roadmap: RoadmapItem[] = [
  { id: 'rm-v1', title: 'FOUNDER OS v1 baseline', quarter: '2026-Q2', status: 'done', departmentId: 'dept-tech', description: 'Six views, SQLite repos, 32 tests.' },
  { id: 'rm-mono', title: 'Monochrome rebuild + real connectors', quarter: '2026-Q2', status: 'done', departmentId: 'dept-tech', description: 'Black & white theme; IMAP, Slack, Stripe, Notion, gbrain wired.' },
  { id: 'rm-gbrain', title: 'G-Brain provider live', quarter: '2026-Q2', status: 'done', departmentId: 'dept-tech', description: 'gbrain CLI doctor/query + brain-store local fallback.' },
  { id: 'rm-creds-email', title: 'Connect 4 email inboxes', quarter: '2026-Q2', status: 'now', departmentId: 'dept-comms', description: 'App passwords / IMAP creds into .env.local slots 1-4.' },
  { id: 'rm-creds-slack', title: 'Connect Slack workspace', quarter: '2026-Q2', status: 'now', departmentId: 'dept-comms', description: 'Bot token with channels:read, channels:history.' },
  { id: 'rm-creds-payments', title: 'Connect payment processors', quarter: '2026-Q2', status: 'now', departmentId: 'dept-finance', description: 'Stripe first; PayPal/Square/Whop as keys land.' },
  { id: 'rm-creds-notion', title: 'Connect Notion workspace', quarter: '2026-Q2', status: 'now', departmentId: 'dept-tech', description: 'Internal integration secret + page shares.' },
  { id: 'rm-supabase', title: 'Revive Supabase Second Brain', quarter: '2026-Q2', status: 'now', departmentId: 'dept-tech', description: 'Unpause free-tier project so gbrain hybrid queries resolve again.' },
  { id: 'rm-scheduler', title: 'Agent scheduler (cron runs)', quarter: '2026-Q3', status: 'next', departmentId: 'dept-tech', description: 'Recurring agent runs with run history and failure alerts.' },
  { id: 'rm-llm', title: 'LLM summarization layer', quarter: '2026-Q3', status: 'next', departmentId: 'dept-tech', description: 'Claude API digests over inbox/Slack/payments data.' },
  { id: 'rm-host', title: 'Migrate to a dedicated host', quarter: '2026-Q3', status: 'next', departmentId: 'dept-tech', description: 'Host app + gbrain + agents on the host; Supabase stays managed.' },
  { id: 'rm-ui', title: 'UI design pass', quarter: '2026-Q4', status: 'later', departmentId: 'dept-tech', description: 'Alex-led redesign once all integrations are live.' },
  { id: 'rm-auth', title: 'Auth + remote access', quarter: '2026-Q4', status: 'later', departmentId: 'dept-tech', description: 'Reach FOUNDER OS on the host from anywhere, safely.' },
];

// Honest zeros — these flip to live numbers as connectors come online.
const metrics: Metric[] = [
  { id: 'metric-unread', key: 'unread_total', label: 'Unread (all inboxes)', value: 0, unit: 'emails', delta: 0, period: 'pending creds' },
  { id: 'metric-brain', key: 'brain_pages', label: 'Brain-store Pages', value: 0, unit: 'pages', delta: 0, period: 'run Data Agent' },
  { id: 'metric-balance', key: 'stripe_available', label: 'Stripe Available', value: 0, unit: 'usd', delta: 0, period: 'pending creds' },
  { id: 'metric-runs', key: 'agent_runs', label: 'Agent Runs Logged', value: 0, unit: 'runs', delta: 0, period: 'all time' },
];

const domains: Domain[] = [
  { id: 'brm-1', number: 1, title: 'Command & Memory', color: GRAY.white, items: ['G-Brain (gbrain CLI)', 'brain-store markdown', 'Agent run history', 'Operator dashboard'] },
  { id: 'brm-2', number: 2, title: 'Email Operations', color: GRAY.light, items: ['Four IMAP inboxes', 'Unread triage', 'Per-inbox health', 'Digest (planned)'] },
  { id: 'brm-3', number: 3, title: 'Team Comms', color: GRAY.light, items: ['Slack channels', 'Message digests', 'Mention tracking (planned)'] },
  { id: 'brm-4', number: 4, title: 'Payments & Revenue', color: GRAY.mid, items: ['Stripe balance + charges', 'PayPal / Square / Whop registry', 'Reconciliation (planned)'] },
  { id: 'brm-5', number: 5, title: 'Knowledge & Docs', color: GRAY.mid, items: ['Notion workspace', 'ZeroEntropy embeddings', 'Supabase Second Brain'] },
  { id: 'brm-6', number: 6, title: 'Agent Runtime', color: GRAY.dim, items: ['Registry + run()', 'Persisted run log', 'Honest failure states'] },
  { id: 'brm-7', number: 7, title: 'Infrastructure', color: GRAY.dim, items: ['Current host', 'dedicated host (next)', 'SQLite local', 'Supabase managed'] },
  { id: 'brm-8', number: 8, title: 'Security', color: GRAY.dark, items: ['.env.local secrets (gitignored)', 'Read-only connector scopes', 'No keys in repo'] },
];

const phases: Phase[] = [
  { id: 'phase-1', number: 1, title: 'Real Connections', items: ['4 email inboxes', 'Slack', 'Payment processors', 'Notion', 'G-Brain'] },
  { id: 'phase-2', number: 2, title: 'Real Agents', items: ['Runtime + run log', 'Honest status board', 'On-demand runs'] },
  { id: 'phase-3', number: 3, title: 'Autonomy', items: ['Scheduled runs', 'LLM digests', 'Failure alerts'] },
  { id: 'phase-4', number: 4, title: 'Dedicated Host', items: ['Migrate compute', 'Remote access + auth', '24/7 uptime'] },
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

// ── Funnel journeys — DUMMY clients from first touch to conversion ──────────
// Real-ready: `source` on every touch names where it will come from live —
// 'trakyo' (organic attribution), 'meta-ads' (Meta Ads MCP), 'manual' until
// then. Swapping seed for live pulls is a repo-level change; the shape stays.
// Touch dates are DAYS-AGO offsets resolved at seed time, so the space's
// stall coloring (quiet > 7 days pre-conversion → red) stays truthful no
// matter when the DB is re-seeded.
const funnelDay = (daysBack: number): string =>
  new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);

type SeededTouch = [FunnelTouch['stage'], FunnelTouch['channel'], string, FunnelTouch['source'], number];
type SeededJourney = {
  id: string;
  name: string;
  venture: FunnelContact['venture'];
  relationship: FunnelContact['relationship'];
  likelihood: number; // 0–100 likelihood-to-buy (dummy; later CRM/Trakyo-scored)
  product?: string;
  amountUsd?: number;
  email?: string; // dummy contact channels so the demo shows outreach actions
  phone?: string;
  person?: string; // the human behind the deal — demo dossier identity
  company?: string;
  role?: string;
  linkedin?: string;
  touches: SeededTouch[]; // 4–5, chronological (last number = days ago)
};

const FUNNEL_JOURNEYS: SeededJourney[] = [
  // — Launchpad Cohort (mentorship) —
  {
    id: 'fc-jake-moreau', name: 'Jake Moreau', venture: 'launchpad-cohort',
    relationship: 'hot', likelihood: 100,
    product: 'Launchpad Cohort — mentorship (PIF)', amountUsd: 6800,
    touches: [
      ['first_touch', 'organic', 'IG reel: "3 AI offers that close themselves"', 'trakyo', 59],
      ['engaged', 'dm', 'Replied to story CTA — "wants out of retainer hell"', 'manual', 57],
      ['nurtured', 'email', 'Day-3 email: student case study (0→22k/mo)', 'manual', 54],
      ['opted_in', 'call', 'Booked strategy call via Trakyo link', 'trakyo', 51],
      ['converted', 'checkout', 'Paid in full — FanBasis checkout', 'manual', 49],
    ],
  },
  {
    id: 'fc-priya-shah', name: 'Priya Shah', venture: 'launchpad-cohort',
    relationship: 'warm', likelihood: 95,
    product: 'Launchpad Cohort — mentorship (3-pay)', amountUsd: 2600,
    touches: [
      ['first_touch', 'ads', 'Meta ad: "Agency owners — install AI in 30 days"', 'meta-ads', 45],
      ['engaged', 'ads', 'Watched VSL to 80% — retarget pool', 'meta-ads', 45],
      ['opted_in', 'webinar', 'Registered + attended WebinarJam training', 'manual', 42],
      ['converted', 'checkout', 'First of 3 payments — FanBasis', 'manual', 40],
    ],
  },
  {
    id: 'fc-danny-okafor', name: 'Danny Okafor', venture: 'launchpad-cohort',
    relationship: 'hot', likelihood: 100,
    product: 'Launchpad Cohort — mentorship (PIF)', amountUsd: 6800,
    touches: [
      ['first_touch', 'organic', 'TikTok: "day in the life running an AI agency"', 'trakyo', 38],
      ['engaged', 'organic', 'Binged 6 reels, followed, saved lead magnet post', 'trakyo', 36],
      ['nurtured', 'ads', 'Retargeting ad: student-wins carousel', 'meta-ads', 33],
      ['opted_in', 'call', 'Booked call from link-in-bio (Trakyo attributed)', 'trakyo', 30],
      ['converted', 'checkout', 'Paid in full — FanBasis checkout', 'manual', 29],
    ],
  },
  {
    id: 'fc-sofia-reyes', name: 'Sofia Reyes', venture: 'launchpad-cohort',
    relationship: 'warm', likelihood: 95,
    product: 'Launchpad Cohort — mentorship (3-pay)', amountUsd: 2600,
    touches: [
      ['first_touch', 'organic', 'YT long-form: "how I\'d start an agency in 2026"', 'trakyo', 31],
      ['engaged', 'email', 'Joined newsletter from YT description', 'manual', 30],
      ['nurtured', 'email', 'Newsletter: pricing-psychology issue clicked', 'manual', 26],
      ['opted_in', 'webinar', 'Attended WebinarJam training, stayed for offer', 'manual', 23],
      ['converted', 'checkout', 'First of 3 payments — FanBasis', 'manual', 22],
    ],
  },
  {
    // Ads ghost — three engaged touches, quiet for 3 weeks: the red node.
    id: 'fc-liam-carter', name: 'Liam Carter', venture: 'launchpad-cohort',
    relationship: 'cold', likelihood: 15,
    touches: [
      ['first_touch', 'ads', 'Meta ad: "stop selling hours" (cold traffic)', 'meta-ads', 27],
      ['engaged', 'ads', 'Clicked through, watched VSL 45%', 'meta-ads', 27],
      ['engaged', 'ads', 'Retarget click — opened application form, abandoned', 'meta-ads', 23],
      ['engaged', 'email', 'Abandoned-form email opened, no reply yet', 'manual', 21],
    ],
  },
  {
    // Warm but drifting — 10 quiet days in nurture: also red until re-touched.
    id: 'fc-marcus-webb', name: 'Marcus Webb', venture: 'launchpad-cohort',
    relationship: 'warm', likelihood: 42,
    touches: [
      ['first_touch', 'organic', 'IG carousel: "agency niches that print in 2026"', 'trakyo', 24],
      ['engaged', 'dm', 'ManyChat keyword "SCALE" → DM flow', 'manual', 24],
      ['nurtured', 'email', 'Lead magnet delivered, day-1 email opened', 'manual', 12],
      ['nurtured', 'email', 'Newsletter: student-win breakdown clicked', 'manual', 10],
    ],
  },
  {
    id: 'fc-tayla-nguyen', name: 'Tayla Nguyen', venture: 'launchpad-cohort',
    relationship: 'hot', likelihood: 84,
    email: 'tayla.nguyen@example.com', phone: '+15550100841',
    touches: [
      ['first_touch', 'organic', 'TikTok: "AI receptionist demo" went semi-viral', 'trakyo', 4],
      ['engaged', 'organic', 'Profile visit → followed + commented', 'trakyo', 4],
      ['nurtured', 'dm', 'DM convo — asked about payment plans', 'manual', 3],
      ['opted_in', 'call', 'Call booked for next week (Trakyo attributed)', 'trakyo', 2],
    ],
  },
  {
    // Mid-decay: 70 quiet days — visibly fading toward red, 20 days from the archive.
    id: 'fc-remy-cole', name: 'Remy Cole', venture: 'launchpad-cohort',
    relationship: 'cold', likelihood: 25,
    touches: [
      ['first_touch', 'organic', 'IG reel: "fire your lead-gen agency"', 'trakyo', 84],
      ['engaged', 'dm', 'Story-reply convo, asked for pricing', 'manual', 80],
      ['engaged', 'email', 'Pricing breakdown sent, opened twice', 'manual', 74],
      ['engaged', 'email', 'Follow-up: "circling back" — no reply since', 'manual', 70],
    ],
  },
  {
    // Went quiet in March — decayed past 90 days into the archive tab.
    id: 'fc-jordan-blake', name: 'Jordan Blake', venture: 'launchpad-cohort',
    relationship: 'cold', likelihood: 20,
    touches: [
      ['first_touch', 'ads', 'Meta ad: "quit your 9-5 with one client" (old campaign)', 'meta-ads', 118],
      ['engaged', 'ads', 'Clicked through, watched VSL 30%', 'meta-ads', 118],
      ['engaged', 'dm', 'One-word DM reply, then silence', 'manual', 112],
      ['engaged', 'email', 'Re-engagement email bounced-opened, no click', 'manual', 104],
    ],
  },
  // — Vantage (AI agency clients) —
  {
    id: 'fc-ava-stone', name: 'Ava Stone — Northwind Legal', venture: 'vantage',
    relationship: 'hot', likelihood: 100,
    product: 'Vantage — AI intake build (sprint)', amountUsd: 12000,
    touches: [
      ['first_touch', 'organic', 'LinkedIn post: legal-intake automation teardown', 'trakyo', 57],
      ['engaged', 'email', 'Replied to newsletter — "this is our exact bottleneck"', 'manual', 55],
      ['opted_in', 'call', 'Discovery call booked via site (Trakyo attributed)', 'trakyo', 50],
      ['nurtured', 'email', 'Proposal + Loom walkthrough sent, viewed 3×', 'manual', 47],
      ['converted', 'checkout', 'Signed — 50% deposit via Stripe invoice', 'manual', 43],
    ],
  },
  {
    id: 'fc-omar-haddad', name: 'Omar Haddad — Pulse Fitness Group', venture: 'vantage',
    relationship: 'warm', likelihood: 95,
    product: 'Vantage — AI ops retainer (monthly)', amountUsd: 4500,
    touches: [
      ['first_touch', 'ads', 'Meta ad: "your gym\'s front desk, automated"', 'meta-ads', 48],
      ['engaged', 'ads', 'Case-study page dwell 4m — retarget pool', 'meta-ads', 47],
      ['nurtured', 'email', 'ROI one-pager emailed after form fill', 'manual', 44],
      ['opted_in', 'call', 'Demo call — 3 locations scoped', 'manual', 41],
      ['converted', 'checkout', 'Retainer live — Stripe subscription', 'manual', 37],
    ],
  },
  {
    id: 'fc-elena-brooks', name: 'Elena Brooks — Harbor Dental', venture: 'vantage',
    relationship: 'hot', likelihood: 100,
    product: 'Vantage — AI intake build (sprint)', amountUsd: 9500,
    touches: [
      ['first_touch', 'organic', 'IG reel: missed-call → booked-patient demo', 'trakyo', 31],
      ['engaged', 'dm', 'DM: "does this work for dental?"', 'manual', 30],
      ['opted_in', 'call', 'Discovery call via link-in-bio (Trakyo attributed)', 'trakyo', 27],
      ['converted', 'checkout', 'Signed — deposit via Stripe invoice', 'manual', 23],
    ],
  },
  {
    id: 'fc-noah-fields', name: 'Noah Fields — Fields Roofing', venture: 'vantage',
    relationship: 'warm', likelihood: 66,
    touches: [
      ['first_touch', 'ads', 'Meta ad: "book 20 estimates/mo on autopilot"', 'meta-ads', 8],
      ['engaged', 'ads', 'Lead form opened, 60% VSL', 'meta-ads', 8],
      ['nurtured', 'email', 'Follow-up sequence day 2 — case study clicked', 'manual', 5],
      ['opted_in', 'call', 'Discovery call booked for Friday', 'manual', 2],
    ],
  },
  {
    id: 'fc-grace-lin', name: 'Grace Lin — Lin & Co Accounting', venture: 'vantage',
    relationship: 'warm', likelihood: 74,
    email: 'grace@linandco.example.com', phone: '+15550100742',
    person: 'Grace Lin', company: 'Lin & Co Accounting', role: 'Managing Partner',
    linkedin: 'https://linkedin.com/in/gracelin-example',
    touches: [
      ['first_touch', 'organic', 'X thread: client-onboarding agent breakdown', 'trakyo', 6],
      ['engaged', 'organic', 'Followed + bookmarked, visited site twice', 'trakyo', 5],
      ['nurtured', 'email', 'Newsletter signup — welcome sequence started', 'manual', 3],
      ['opted_in', 'call', 'Call request form submitted (Trakyo attributed)', 'trakyo', 1],
    ],
  },
];

const funnelContacts: FunnelContact[] = FUNNEL_JOURNEYS.map((j) => ({
  id: j.id,
  name: j.name,
  venture: j.venture,
  status: j.touches[j.touches.length - 1][0], // furthest stage reached
  product: j.product ?? null,
  amountUsd: j.amountUsd ?? null,
  relationship: j.relationship,
  likelihood: j.likelihood,
  url: null,
  email: j.email ?? null,
  phone: j.phone ?? null,
  person: j.person ?? null,
  company: j.company ?? null,
  role: j.role ?? null,
  linkedin: j.linkedin ?? null,
  createdAt: funnelDay(j.touches[0][4]), // journey starts at the first touch
}));

const funnelTouches: FunnelTouch[] = FUNNEL_JOURNEYS.flatMap((j) =>
  j.touches.map(([stage, channel, label, source, daysBack], i) => ({
    id: `${j.id}-t${i + 1}`,
    contactId: j.id,
    seq: i + 1,
    stage,
    channel,
    label,
    source,
    at: funnelDay(daysBack),
  })),
);

// The machine, mapped: each venture's process as an owned chain of steps.
// Real-ready — owners, weekly hours, tools, the bottlenecks that leak money,
// and the automations (live or suggested) that carry the load back.
const workflows: Workflow[] = [
  {
    id: 'wf-vantage-sales',
    name: 'Vantage sales machine',
    subtitle: 'Cold outbound to closed retainer.',
    revenueUsd: 120_000,
    order: 0,
    steps: [
      {
        id: 'wf-mer-1',
        title: 'Run outbound campaigns',
        ownerKind: 'agent',
        owner: 'Zernio Publisher',
        hoursPerWeek: 6,
        tools: ['zernio', 'arcads'],
        edgeLabel: 'replies',
        leakUsd: null,
        automation: { title: 'Always-on content + DM outreach', state: 'live', recoveredUsd: 4200 },
      },
      {
        id: 'wf-mer-2',
        title: 'Qualify replies',
        ownerKind: 'agent',
        owner: 'Comms Agent',
        hoursPerWeek: 9,
        tools: ['manychat', 'gmail'],
        edgeLabel: 'qualified',
        leakUsd: 14_000,
        automation: { title: 'Auto-qualify + book', state: 'suggested', recoveredUsd: 9000 },
      },
      {
        id: 'wf-mer-3',
        title: 'Book demos',
        ownerKind: 'human',
        owner: 'Alex · Founder',
        hoursPerWeek: 4,
        tools: ['calendar', 'attio'],
        edgeLabel: 'demo',
        leakUsd: null,
        automation: null,
      },
      {
        id: 'wf-mer-4',
        title: 'Sales call',
        ownerKind: 'human',
        owner: 'Alex · Founder',
        hoursPerWeek: 10,
        tools: ['webinarjam', 'attio'],
        edgeLabel: 'proposal',
        leakUsd: null,
        automation: null,
      },
      {
        id: 'wf-mer-5',
        title: 'Proposal & follow-up',
        ownerKind: 'human',
        owner: 'Alex · Founder',
        hoursPerWeek: 5,
        tools: ['proposal-gen', 'gmail'],
        edgeLabel: 'won',
        leakUsd: 6000,
        automation: { title: 'Proposal follow-up sequence', state: 'suggested', recoveredUsd: 6000 },
      },
      {
        id: 'wf-mer-6',
        title: 'Onboard & deliver',
        ownerKind: 'agent',
        owner: 'Onboarding Agent',
        hoursPerWeek: 3,
        tools: ['attio', 'slack', 'notion'],
        edgeLabel: null,
        leakUsd: null,
        automation: { title: 'Onboarding rails', state: 'live', recoveredUsd: 3000 },
      },
    ],
  },
  {
    id: 'wf-lc-delivery',
    name: 'Launchpad Cohort delivery',
    subtitle: 'Webinar lead to retained program member.',
    revenueUsd: 80_000,
    order: 1,
    steps: [
      {
        id: 'wf-lc-1',
        title: 'Capture webinar leads',
        ownerKind: 'agent',
        owner: 'WebinarJam',
        hoursPerWeek: 2,
        tools: ['webinarjam', 'ghl'],
        edgeLabel: 'registered',
        leakUsd: null,
        automation: { title: 'Webinar to GHL sync', state: 'live', recoveredUsd: 2500 },
      },
      {
        id: 'wf-lc-2',
        title: 'Nurture in GHL',
        ownerKind: 'agent',
        owner: 'GoHighLevel',
        hoursPerWeek: 3,
        tools: ['ghl'],
        edgeLabel: 'booked',
        leakUsd: 8000,
        automation: { title: 'Nurture sequences', state: 'live', recoveredUsd: 5000 },
      },
      {
        id: 'wf-lc-3',
        title: 'Strategy call',
        ownerKind: 'human',
        owner: 'Alex · Founder',
        hoursPerWeek: 8,
        tools: ['ghl', 'calendar'],
        edgeLabel: 'closed',
        leakUsd: null,
        automation: null,
      },
      {
        id: 'wf-lc-4',
        title: 'Deliver program',
        ownerKind: 'human',
        owner: 'LC Team',
        hoursPerWeek: 12,
        tools: ['skool', 'notion'],
        edgeLabel: 'retained',
        leakUsd: 5000,
        automation: { title: 'Skool community ops', state: 'suggested', recoveredUsd: 4000 },
      },
      {
        id: 'wf-lc-5',
        title: 'Track attribution',
        ownerKind: 'agent',
        owner: 'Trakyo',
        hoursPerWeek: 1,
        tools: ['trakyo'],
        edgeLabel: null,
        leakUsd: null,
        automation: { title: 'Revenue attribution', state: 'suggested', recoveredUsd: 0 },
      },
    ],
  },
];

// Agent task board — seeded across open/doing/done so the Kanban is alive on
// first load. Demo cards; user-added tasks coexist (we insert by id, never wipe).
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
  for (const p of PERSONAS) db.personas.insert(p);
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
}
