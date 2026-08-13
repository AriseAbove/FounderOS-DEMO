import { z } from 'zod';
import { getBrainProvider } from '@/lib/brain';
import { parseInboxConfigs, unreadCounts } from '@/lib/connectors/email';
import { calendarStatus, upcomingEvents, caldavAccounts } from '@/lib/connectors/gcal';
import { quickbooksStatus } from '@/lib/connectors/quickbooks';
import { alloConfigured, fetchAlloCalls } from '@/lib/connectors/allo';
import { importAlloCalls } from '@/lib/funnel-allo';
import { runtimeEnv } from '@/lib/creds';
import { getDb } from '@/lib/data';
import type { LlmToolSpec } from '@/lib/connectors/llm';
import type { AgentRunResult, RuntimeAgent } from '@/lib/agents/runtime';

/**
 * The real agent roster. Every run() does actual work against a live system —
 * no seeded numbers. Agents whose connector lacks credentials fail honestly
 * with setup instructions instead of pretending.
 *
 * Trimmed in the Phase 2 purge to the lanes with real backing: email (IMAP),
 * calendar (ICS), QuickBooks, the knowledge provider abstraction, and the
 * DB-backed conductor. New agents land here as real integrations do —
 * a row in this file plus its seed entry, never a larp.
 */

async function gmailRun(): Promise<AgentRunResult> {
  const inboxes = parseInboxConfigs(process.env);
  if (inboxes.length === 0) {
    return { ok: false, summary: 'No inboxes configured — set INBOX_1..4_HOST/_USER/_PASS in .env.local' };
  }
  const counts = await unreadCounts(process.env);
  const failed = counts.filter((c) => c.error);
  const total = counts.reduce((sum, c) => sum + c.unread, 0);
  return {
    ok: failed.length < counts.length,
    summary: counts
      .map((c) => `${c.inbox}: ${c.error ? `ERROR ${c.error.slice(0, 60)}` : `${c.unread} unread`}`)
      .join(' · ')
      .concat(` · total ${total} unread`),
    data: counts,
  };
}

async function calendarRun(): Promise<AgentRunResult> {
  const env = runtimeEnv();
  if (caldavAccounts(env).length === 0) {
    return { ok: false, summary: 'No calendars configured — set CAL_1_USER/_PASS (+ optional _NAME/_COLOR) in .env.local' };
  }
  const events = await upcomingEvents(env);
  return {
    ok: true,
    summary: `${events.length} upcoming event${events.length === 1 ? '' : 's'} across ${caldavAccounts(env).length} calendar(s)`,
    data: events.slice(0, 10),
  };
}

async function quickbooksRun(): Promise<AgentRunResult> {
  const status = await quickbooksStatus(runtimeEnv());
  return { ok: status.state === 'connected', summary: status.detail, data: status.meta };
}

async function alloRun(): Promise<AgentRunResult> {
  const env = runtimeEnv();
  if (!alloConfigured(env)) {
    return {
      ok: false,
      summary: 'ALLO_API_KEY not set — create a key in Allo (settings → API, Conversations Read scope) and add it to the environment',
    };
  }
  const calls = await fetchAlloCalls(env);
  const res = importAlloCalls(getDb(), calls, new Date());
  return {
    ok: true,
    summary: `${calls.length} calls in the Allo log · ${res.newContacts} new lead journey(s) · ${res.newTouches} new touch(es) · ${res.skipped} skipped (spam/outbound)`,
    data: res,
  };
}

const label = (r: AgentRunResult) => (r.ok ? 'LIVE' : 'DOWN');

export const realAgents: RuntimeAgent[] = [
  // ── Command ──────────────────────────────────────────────────────────
  {
    id: 'conductor',
    name: 'Conductor',
    description: 'Broadcast fan-out across the roster; reports fleet size and run history from the DB.',
    departmentId: 'dept-tech',
    async run() {
      const db = getDb();
      const agents = db.agents.all();
      const runs = db.agentRuns.recent(50);
      const lastBroadcast = db.broadcasts.recent(1)[0] ?? null;
      return {
        ok: true,
        summary: `${agents.length} agents on the roster · ${runs.length} recent runs logged · last broadcast ${
          lastBroadcast ? lastBroadcast.createdAt.slice(0, 10) : 'never'
        }`,
        data: { agents: agents.length, recentRuns: runs.length },
      };
    },
  },

  // ── Comms: one instance, email + calendar workers ────────────────────
  {
    id: 'comms-agent',
    name: 'Comms Agent',
    description: 'Aggregates the Gmail and Calendar workers that feed the unified /comms view.',
    departmentId: 'dept-comms',
    async run() {
      const [gmail, calendar] = await Promise.all([gmailRun(), calendarRun()]);
      const live = [gmail, calendar].filter((r) => r.ok).length;
      return {
        ok: live > 0,
        summary: `${live}/2 channels live → /comms · Gmail ${label(gmail)} · Calendar ${label(calendar)}`,
        data: { gmail, calendar },
      };
    },
  },
  { id: 'gmail-worker', name: 'Gmail Worker', description: 'Unread counts and recent mail from up to four IMAP inboxes.', departmentId: 'dept-comms', run: gmailRun },
  { id: 'calendar-worker', name: 'Calendar Worker', description: 'Upcoming events from ICS/CalDAV calendar feeds.', departmentId: 'dept-comms', run: calendarRun },

  // ── Knowledge ────────────────────────────────────────────────────────
  {
    id: 'data-agent',
    name: 'Data Agent',
    description: 'Answers questions from the knowledge layer via the brain provider abstraction; honest stub until a provider is wired.',
    departmentId: 'dept-tech',
    async run() {
      const status = await getBrainProvider().status();
      return {
        ok: status.connected,
        summary: `Knowledge provider: ${status.provider} · ${status.detail}`,
        data: status,
      };
    },
    async respond(message: string) {
      const results = await getBrainProvider().search(message);
      if (results.length === 0) {
        return { ok: false, summary: `Nothing in the knowledge layer matches "${message.slice(0, 80)}"` };
      }
      return {
        ok: true,
        summary: results
          .slice(0, 3)
          .map((r) => `${r.title}: ${r.snippet.slice(0, 100)}`)
          .join(' · '),
        data: results,
      };
    },
    chatTools(): LlmToolSpec[] {
      return [
        {
          name: 'searchKnowledge',
          description:
            'Search the knowledge layer and return the top matching notes. Read-only. Empty until a brain provider is configured.',
          parameters: z.object({ query: z.string().describe('what to look up in the knowledge base') }),
          execute: async (args) => {
            const query = typeof args.query === 'string' ? args.query : '';
            const results = await getBrainProvider().search(query);
            return results.slice(0, 5);
          },
        },
      ];
    },
  },

  // ── Sales: the funnel's front door ───────────────────────────────────
  {
    id: 'allo-pulse',
    name: 'Allo Pulse',
    description: 'Pulls the Allo (248) 717-1417 call log and files inbound lead calls into the AAC pipeline.',
    departmentId: 'dept-sales',
    run: alloRun,
  },

  // ── Finance ──────────────────────────────────────────────────────────
  {
    id: 'quickbooks-pulse',
    name: 'QuickBooks Pulse',
    description: 'Reports the QuickBooks connection state; month-to-date income/expenses once connected.',
    departmentId: 'dept-finance',
    run: quickbooksRun,
  },
];
