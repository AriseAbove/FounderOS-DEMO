/**
 * Single source of truth for the app's primary navigation. The Sidebar renders
 * these groups in order; the CommandPalette derives its digit (1–9) shortcuts
 * from the same visible order, so the two can never drift apart again.
 */
import {
  Home,
  MessageSquare,
  Share2,
  Clapperboard,
  Users,
  ListChecks,
  Sparkles,
  Network,
  ClipboardList,
  Brain,
  Wallet,
  Filter,
  Workflow,
  Map,
  Plug,
  BarChart3,
  LayoutGrid,
  Layers,
  Activity,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: typeof Home };

export const NAV_OPERATE: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/comms', label: 'Comms', icon: MessageSquare },
  { href: '/funnel', label: 'Funnel', icon: Filter },
  { href: '/workflows', label: 'Workflows', icon: Workflow },
  { href: '/finances', label: 'Finances', icon: Wallet },
];

// Surfaced 2026-08-14 now that OneUp (the social connector) is live — these
// three were built earlier but held out of the nav until a real social
// connector existed to back them. NAV_HIDDEN is gone; nothing is hidden
// pending a decision anymore. If a future page needs the same "built but
// not yet wired to anything real" treatment, reintroduce a NAV_HIDDEN array
// rather than deleting its pages.
export const NAV_MARKETING: NavItem[] = [
  { href: '/social', label: 'Social', icon: Share2 },
  { href: '/content', label: 'Content', icon: Clapperboard },
  { href: '/personas', label: 'Personas', icon: Layers },
];

// The agent workforce: the roster and the org chart that maps how they report.
export const NAV_AGENTS: NavItem[] = [
  { href: '/agents', label: 'Agents', icon: Users },
  { href: '/sops', label: 'SOPs', icon: ClipboardList },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/skills', label: 'Skills', icon: Sparkles },
  { href: '/org', label: 'Org Chart', icon: Network },
];

// The knowledge layer the agents draw on, plus the AAC Brain's own
// operational health (a different system — see app/aac-brain/page.tsx).
export const NAV_INTELLIGENCE: NavItem[] = [
  { href: '/brain', label: 'Knowledge', icon: Brain },
  { href: '/aac-brain', label: 'AAC Brain', icon: Activity },
];

export const NAV_SYSTEM: NavItem[] = [
  { href: '/integrations', label: 'Connections', icon: Plug },
  { href: '/roadmap', label: 'Roadmap', icon: Map },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/reference', label: 'Reference Model', icon: LayoutGrid },
];

// At the very bottom: reserved for library-style views (persona templates
// moved to NAV_HIDDEN in the Phase 2 purge).
export const NAV_LIBRARY: NavItem[] = [];

/** Visible top-to-bottom order across all groups. */
export const NAV_ORDER: string[] = [
  ...NAV_OPERATE,
  ...NAV_AGENTS,
  ...NAV_INTELLIGENCE,
  ...NAV_MARKETING,
  ...NAV_SYSTEM,
  ...NAV_LIBRARY,
].map((n) => n.href);

/** Digit keys 1–9 jump to the first nine views in visible order. */
export const DIGIT_VIEWS: string[] = NAV_ORDER.slice(0, 9);
