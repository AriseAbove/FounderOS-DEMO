/**
 * Chief of Staff — the proactive signal engine behind the chief-of-staff
 * agent and its cron. Pure/honest by design: every signal traces back to a
 * real repo row or a real connector call, nothing invented, and every
 * source that isn't configured just contributes zero signals instead of
 * throwing (see gatherSignals's own no-config test).
 *
 * Three moving parts:
 *  - gatherSignals: pulls hot/fading leads (from the funnel's own attention
 *    model), overdue/open QuickBooks invoices, and unread work email into
 *    one flat list.
 *  - briefingText: a deterministic, no-AI summary sentence — the honest
 *    fallback when AI_GATEWAY_API_KEY isn't configured, and always the
 *    fast path even when it is.
 *  - newHighSeveritySignals / markNotified: dedupe across cron runs so a
 *    push only fires once per signal, using the same seed_meta KV table
 *    lib/seed.ts already uses for SEED_VERSION (see lib/db.ts's seedMeta).
 *  - sendNtfyPush: a tiny, honest ntfy.sh client (self-hostable via
 *    NTFY_URL) — no-ops with a stated reason when NTFY_TOPIC isn't set.
 */
import type { FounderDb } from '@/lib/db';
import { attentionQueue } from '@/lib/funnel';
import { qboConfigured, openInvoices } from '@/lib/connectors/quickbooks';
import { gatherCommsFeed } from '@/lib/comms-feed';
import { commsLane, parseWorkKeywords } from '@/lib/comms-gravity';

export type SignalCategory = 'lead' | 'invoice' | 'comms';
export type SignalSeverity = 'high' | 'medium';

export type Signal = {
  id: string;
  category: SignalCategory;
  severity: SignalSeverity;
  summary: string;
};

type Env = Record<string, string | undefined>;

/** Hot leads ready to push and fading leads worth saving, straight from the
 *  funnel's own attention model — no separate scoring logic to drift out of
 *  sync with what /funnel already shows the operator. */
function leadSignals(db: FounderDb, now: Date): Signal[] {
  const journeys = db.funnel.journeys();
  const { pushNow, saveNow } = attentionQueue(journeys, now);
  const signals: Signal[] = [];
  for (const j of pushNow) {
    signals.push({
      id: `lead-push-${j.id}`,
      category: 'lead',
      severity: 'high',
      summary: `${j.name} — hot lead (${j.likelihood}% likely), push now.`,
    });
  }
  for (const j of saveNow) {
    signals.push({
      id: `lead-save-${j.id}`,
      category: 'lead',
      severity: 'medium',
      summary: `${j.name} — fading, worth a save-touch before it decays.`,
    });
  }
  return signals;
}

/** Open QuickBooks invoices — overdue ones are high severity, everything
 *  else open is a medium-severity heads-up. Empty (not thrown) whenever
 *  QuickBooks isn't configured or the API call fails. */
async function invoiceSignals(env: Env, now: Date): Promise<Signal[]> {
  if (!qboConfigured(env)) return [];
  const invoices = await openInvoices(env);
  if (!invoices) return [];
  return invoices.map((inv) => {
    const overdue = inv.dueDate ? new Date(`${inv.dueDate}T00:00:00Z`).getTime() < now.getTime() : false;
    return {
      id: `invoice-${inv.id}`,
      category: 'invoice' as const,
      severity: overdue ? ('high' as const) : ('medium' as const),
      summary: overdue
        ? `${inv.customer} — invoice ${inv.docNumber} overdue ($${inv.balance.toLocaleString()}).`
        : `${inv.customer} — invoice ${inv.docNumber} open ($${inv.balance.toLocaleString()}).`,
    };
  });
}

/** Unread work-lane email from the unified comms feed — tier-1 tagged
 *  senders are high severity, every other unread work email is medium.
 *  Empty (not thrown) whenever no inbox is configured. */
async function commsSignals(env: Env): Promise<Signal[]> {
  let items;
  try {
    items = await gatherCommsFeed();
  } catch {
    return [];
  }
  const workKeywords = parseWorkKeywords(env.COMMS_WORK_KEYWORDS);
  const signals: Signal[] = [];
  for (const item of items) {
    if (!item.unread) continue;
    if (commsLane(item, workKeywords) !== 'work') continue;
    signals.push({
      id: `comms-${item.source}-${item.sender ?? item.title}-${item.ts}`,
      category: 'comms',
      severity: item.priority === 1 ? 'high' : 'medium',
      summary: `${item.sender ?? item.title} — unread work email.`,
    });
  }
  return signals;
}

/** Every signal worth surfacing right now, from whichever sources are
 *  actually configured. Never throws — a source that isn't wired up (no
 *  QuickBooks keys, no inbox) just contributes nothing. */
export async function gatherSignals(db: FounderDb, env: Env, now: Date = new Date()): Promise<Signal[]> {
  const [invoice, comms] = await Promise.all([invoiceSignals(env, now), commsSignals(env)]);
  return [...leadSignals(db, now), ...invoice, ...comms];
}

const CATEGORY_LABEL: Record<SignalCategory, Record<SignalSeverity, string>> = {
  lead: { high: 'hot lead', medium: 'lead to save' },
  invoice: { high: 'overdue invoice', medium: 'open invoice' },
  comms: { high: 'urgent email', medium: 'work email' },
};

/** A deterministic, no-AI summary sentence — counts by category+severity in
 *  first-seen order. This is the honest fallback when AI_GATEWAY_API_KEY
 *  isn't set, and stays the fast path even once it is. */
export function briefingText(signals: Signal[]): string {
  if (signals.length === 0) return 'Nothing needs your attention right now.';
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const s of signals) {
    const label = CATEGORY_LABEL[s.category][s.severity];
    if (!counts.has(label)) order.push(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return order.map((label) => `${counts.get(label)} ${label}${counts.get(label) === 1 ? '' : 's'}`).join(', ') + '.';
}

const NOTIFIED_PREFIX = 'chief_of_staff_notified:';

/** High-severity signals that haven't already triggered a push on a prior
 *  run — the dedupe gate so a hot lead pings once, not every hour. */
export function newHighSeveritySignals(db: FounderDb, signals: Signal[]): Signal[] {
  return signals.filter((s) => s.severity === 'high' && db.seedMeta.get(NOTIFIED_PREFIX + s.id) === null);
}

/** Record that these signals have been pushed, so the next run's dedupe
 *  gate skips them. */
export function markNotified(db: FounderDb, signals: Signal[]): void {
  for (const s of signals) db.seedMeta.set(NOTIFIED_PREFIX + s.id, '1');
}

export type NtfyResult =
  | { sent: true; status: number }
  | { sent: false; reason: string }
  | { sent: false; status: number };

/** Post a push notification to ntfy.sh (or a self-hosted instance via
 *  NTFY_URL). Honest no-op — never a silent failure — when NTFY_TOPIC isn't
 *  configured. */
export async function sendNtfyPush(
  env: Env,
  title: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NtfyResult> {
  const topic = env.NTFY_TOPIC;
  if (!topic) return { sent: false, reason: 'NTFY_TOPIC not set' };
  const base = env.NTFY_URL ?? 'https://ntfy.sh';
  const res = await fetchImpl(`${base}/${topic}`, {
    method: 'POST',
    headers: { Title: title },
    body,
  });
  if (!res.ok) return { sent: false, status: res.status };
  return { sent: true, status: res.status };
}
