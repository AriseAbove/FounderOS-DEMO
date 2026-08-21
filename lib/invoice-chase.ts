/**
 * Invoice-chase draft generation — pure, no network. Turns a QuickBooks open
 * invoice into a ready-to-review reminder email whose tone escalates with
 * how overdue the invoice is (gentle heads-up → firm → urgent). This never
 * sends anything: it hands back a subject/body for Sean to read, edit, and
 * send himself, same as every other draft-and-approve flow in this app
 * (see components/CommsGravity.tsx's reply box + POST /api/comms/reply).
 *
 * Sending real email automatically off a bucket threshold would be exactly
 * the kind of invented automation CLAUDE.md's honesty principle rules out —
 * a chased-but-wrong invoice (paid same day, disputed, wrong customer) can't
 * be un-sent. A human reviews every message before it goes out.
 */
import { daysOverdue } from '@/lib/finances';

export type ChaseTone = 'gentle' | 'firm' | 'urgent';
export type ChaseDraft = { subject: string; body: string; tone: ChaseTone };

/** Same thresholds as the aging buckets: not-yet-due/unknown and 1–30 days
    read as a friendly nudge, 31–60 gets firmer, 60+ is urgent. */
export function chaseTone(days: number | null): ChaseTone {
  if (days === null || days <= 30) return 'gentle';
  if (days <= 60) return 'firm';
  return 'urgent';
}

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export type ChaseInvoice = {
  docNumber: string;
  customer: string;
  balance: number;
  dueDate: string | null;
};

/** Draft a chase email for one invoice. Pure — same invoice + same `now`
    always yields the same draft, so it's safe to call from a server page or
    a client component without a round trip. */
export function chaseEmailDraft(invoice: ChaseInvoice, now: Date = new Date()): ChaseDraft {
  const days = daysOverdue(invoice.dueDate, now);
  const tone = chaseTone(days);
  const amount = usd(invoice.balance);

  let subject: string;
  let situation: string;
  if (invoice.dueDate === null) {
    subject = `Invoice #${invoice.docNumber} — friendly reminder`;
    situation = `invoice #${invoice.docNumber} for ${amount} is still open — there's no due date on file for it`;
  } else if (tone === 'gentle') {
    subject = `Invoice #${invoice.docNumber} — friendly reminder`;
    situation =
      days !== null && days > 0
        ? `invoice #${invoice.docNumber} for ${amount} is ${days} day${days === 1 ? '' : 's'} past its due date (${invoice.dueDate})`
        : `invoice #${invoice.docNumber} for ${amount} is coming due on ${invoice.dueDate}`;
  } else if (tone === 'firm') {
    subject = `Invoice #${invoice.docNumber} — payment overdue (${days} days)`;
    situation = `invoice #${invoice.docNumber} for ${amount} is now ${days} days past its due date (${invoice.dueDate})`;
  } else {
    subject = `Invoice #${invoice.docNumber} — significantly overdue (${days} days)`;
    situation = `invoice #${invoice.docNumber} for ${amount} is now ${days} days past its due date (${invoice.dueDate}) — well beyond our normal terms`;
  }

  const ask =
    tone === 'gentle'
      ? "Just flagging it in case it slipped through — let me know if you have any questions."
      : tone === 'firm'
        ? 'Could you let me know the status of payment, or reach out if something is holding it up?'
        : "Please let me know when I can expect payment, or reach out right away if something's holding it up — I'd like to get this resolved.";

  const body = `Hi ${invoice.customer},\n\nJust a note that ${situation}.\n\n${ask}\n\nThanks,\nSean\nArise Above Construction`;

  return { subject, body, tone };
}
