import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { CommandPalette } from '@/components/CommandPalette';
import { ConductorPanel } from '@/components/ConductorPanel';
import { getDb } from '@/lib/data';
import type { Command } from '@/lib/palette';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { resolveBusinessFilter } from '@/lib/business-filter';
import { readBusinessFilterCookie } from '@/lib/business-filter-server';

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'ARISE OS',
  description: 'Arise Above operating system — business command center',
};

const NAV_COMMANDS: Command[] = [
  { id: 'nav-home', label: 'Home', keywords: 'dashboard today overview start', href: '/', hint: 'view' },
  { id: 'nav-social', label: 'Social', keywords: 'instagram tiktok twitter x youtube linkedin followers growth audience', href: '/social', hint: 'view' },
  { id: 'nav-comms', label: 'Comms', keywords: 'messages email calendar inbox unified feed', href: '/comms', hint: 'view' },
  { id: 'nav-agents', label: 'Agents', keywords: 'runtime run real roster', href: '/agents', hint: 'view' },
  { id: 'nav-connections', label: 'Connections', keywords: 'integrations tools status creds', href: '/integrations', hint: 'view' },
  { id: 'nav-roadmap', label: 'Roadmap', keywords: 'plan phases quarters', href: '/roadmap', hint: 'view' },
  { id: 'nav-analytics', label: 'Analytics', keywords: 'metrics numbers', href: '/analytics', hint: 'view' },
  { id: 'nav-reference', label: 'Reference Model', keywords: 'domains business brm', href: '/reference', hint: 'view' },
  { id: 'nav-org', label: 'Org Chart', keywords: 'org chart hierarchy departments tree structure leads specialists', href: '/org', hint: 'view' },
  { id: 'nav-brain', label: 'Knowledge', keywords: 'brain knowledge core markdown store search graph', href: '/brain', hint: 'view' },
  // Real external destinations for this operation — open in a new tab
  { id: 'ext-allo', label: 'Allo CRM', keywords: 'allo receptionist calls leads contacts', href: 'https://web.withallo.com/contacts', hint: 'web' },
  { id: 'ext-site', label: 'ariseaboveconstruction.com', keywords: 'website marketing site', href: 'https://ariseaboveconstruction.com', hint: 'web' },
  { id: 'ext-qbo', label: 'QuickBooks', keywords: 'books accounting invoices', href: 'https://qbo.intuit.com', hint: 'web' },
];

function buildCommands(): Command[] {
  const db = getDb();
  const tools: Command[] = db.tools.all().map((t) => ({
    id: `tool-${t.id}`,
    label: t.name,
    keywords: `${t.category} ${t.description}`,
    href: '/integrations',
    hint: 'tool',
  }));
  const agents: Command[] = db.agents.all().map((a) => ({
    id: `agent-${a.id}`,
    label: a.name,
    keywords: `${a.role} ${a.description}`,
    href: '/agents',
    hint: 'agent',
  }));
  return [...NAV_COMMANDS, ...agents, ...tools];
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const businessFilter = resolveBusinessFilter(readBusinessFilterCookie());
  return (
    <html lang="en" className={fontMono.variable} suppressHydrationWarning>
      <head>
        {/* Apply the persisted theme before first paint — no dark↔light flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Sidebar />
        {/* os-shell yields to the Conductor dock: the panel sets --conductor-w
            and the whole content column glides left instead of being covered */}
        <div className="os-shell ml-[232px] flex min-h-screen min-w-0 flex-col" style={{ marginRight: 'var(--conductor-w, 0px)' }}>
          <Topbar businessFilter={businessFilter} />
          <main className="min-w-0 flex-1 px-8 pb-16 pt-7 wide:px-10 ultra:px-12">
            {/* Width tiers: 1280 on laptops · 1760 on large monitors ·
                full-bleed on 32"/ultrawide. See tailwind screens wide/ultra. */}
            <div className="mx-auto max-w-[1280px] wide:max-w-[1760px] ultra:max-w-none">
              {children}
            </div>
          </main>
        </div>
        <CommandPalette commands={buildCommands()} />
        {/* Notion-style agent dock — the Conductor, aware of the current screen */}
        <ConductorPanel />
      </body>
    </html>
  );
}
