import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { parseInboxConfigs, imapClientOptions } from '@/lib/connectors/email';

/**
 * AAC's two live sites both submit through FormSubmit.co (`submissions@
 * formsubmit.co`), which emails a `| Field | Value |` table straight to
 * a connected inbox — no site changes and no new API key needed, this
 * reuses the same INBOX_1..4 credentials Comms already reads.
 *
 * Two forms, two field-name sets (confirmed against real notification
 * emails, 2026-08-14):
 *  - book.ariseaboveconstruction.com (the estimate/booking form):
 *    Full Name · Phone · Email · Project Type · Project Address ·
 *    Timeline · Budget Range · Priority · How Found AAC
 *  - ariseaboveconstruction.com (the main-site contact form):
 *    firstName · lastName · phone · email · projectAddress · serviceType ·
 *    description · heardAbout · contactMethod
 */

export type WebsiteFormLead = {
  /** Stable dedupe key — this connector's own id for the source email. */
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  projectType: string | null;
  address: string | null;
  timeline: string | null;
  budget: string | null;
  howFound: string | null;
  description: string | null;
  /** The site the form was on, e.g. "book.ariseaboveconstruction.com". */
  formSite: string | null;
  receivedAt: string; // ISO
};

const EMPTY_PLACEHOLDERS = new Set(['', '—', '-', 'n/a', 'none']);

/**
 * Parses one FormSubmit.co notification email into structured lead fields.
 * Pure — no network, no DB. Returns null for anything that isn't actually a
 * FormSubmit notification, or that carries no usable contact info (name is
 * the only guaranteed field; a submission with neither phone nor email
 * isn't reachable, so it's dropped rather than filed as a dead lead).
 */
export function parseFormSubmitEmail(params: {
  id: string;
  from: string;
  subject: string;
  text: string;
  receivedAt: string;
}): WebsiteFormLead | null {
  if (!/formsubmit\.co/i.test(params.from)) return null;

  const siteMatch = params.text.match(/submitted your form on https?:\/\/([^\s/]+)/i);

  const fields: Record<string, string> = {};
  for (const match of params.text.matchAll(/\|\s*([^|\n]+?)\s*\|\s*([^|\n]*?)\s*\|/g)) {
    const key = match[1].trim().toLowerCase();
    if (key === 'name' || key === '') continue; // the table's own header row
    const val = match[2].trim();
    if (!EMPTY_PLACEHOLDERS.has(val.toLowerCase())) fields[key] = val;
  }

  const name =
    fields['full name'] ||
    [fields['firstname'], fields['lastname']].filter(Boolean).join(' ').trim();
  const phone = fields['phone'] ?? null;
  const email = fields['email'] ?? null;
  if (!name && !phone && !email) return null; // nothing usable in this email at all
  if (!phone && !email) return null; // a name with no way to reach them isn't a lead

  return {
    id: params.id,
    name: name || 'Website lead',
    phone,
    email,
    projectType: fields['project type'] ?? fields['servicetype'] ?? null,
    address: fields['project address'] ?? fields['projectaddress'] ?? null,
    timeline: fields['timeline'] ?? null,
    budget: fields['budget range'] ?? fields['budget'] ?? null,
    howFound: fields['how found aac'] ?? fields['heardabout'] ?? null,
    description: fields['description'] ?? null,
    formSite: siteMatch?.[1] ?? null,
    receivedAt: params.receivedAt,
  };
}

/**
 * Live IMAP fetch: searches every configured inbox for FormSubmit.co
 * notifications received in the last `sinceDays` days and parses each into
 * a WebsiteFormLead. Fails open per-inbox (matches latestEmails' pattern in
 * lib/connectors/email.ts) — one broken inbox degrades to fewer leads, not
 * a thrown error. Not unit-tested directly (same as latestEmails/
 * unreadCounts) — parseFormSubmitEmail carries the real logic and has full
 * coverage; this function is the thin, live IO wrapper around it.
 */
export async function fetchWebsiteFormLeads(
  env: Record<string, string | undefined> = process.env,
  sinceDays = 45,
): Promise<WebsiteFormLead[]> {
  const inboxes = parseInboxConfigs(env);
  const leads: WebsiteFormLead[] = [];
  const since = new Date(Date.now() - sinceDays * 86_400_000);

  await Promise.all(
    inboxes.map(async (config) => {
      const client = new ImapFlow(imapClientOptions(config));
      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
          const uids = await client.search({ from: 'formsubmit.co', since }, { uid: true });
          if (!uids || uids.length === 0) return;
          for await (const msg of client.fetch(uids, { envelope: true, source: true }, { uid: true })) {
            if (!msg.source) continue;
            const parsed = await simpleParser(msg.source);
            const from = msg.envelope?.from?.[0]?.address ?? '';
            const lead = parseFormSubmitEmail({
              id: `${config.id}-${msg.uid}`,
              from,
              subject: msg.envelope?.subject ?? '',
              text: parsed.text ?? '',
              receivedAt: (msg.envelope?.date ?? new Date()).toISOString(),
            });
            if (lead) leads.push(lead);
          }
        } finally {
          lock.release();
        }
      } catch {
        // inbox-level failure — skip, matches latestEmails' fail-open pattern
      } finally {
        await client.logout().catch(() => {});
      }
    }),
  );

  return leads;
}
