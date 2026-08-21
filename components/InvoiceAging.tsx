'use client';

/**
 * AR aging + chase action for the Finances page's QuickBooks invoice list.
 * A flat "$178,262 across 67 invoices" number gives Sean no next step —
 * this groups the real open invoices into the standard AR aging buckets
 * (current → 90+ days), worst first, and lets him draft-and-send a chase
 * email per invoice without leaving the page.
 *
 * Sending is never automatic: clicking "Chase" opens an editable draft
 * (lib/invoice-chase.ts's chaseEmailDraft, toned to how overdue the invoice
 * is) that Sean reviews before it goes out — same draft-and-approve shape as
 * the reply box in components/CommsGravity.tsx, reusing the same real-send
 * endpoint (POST /api/comms/reply: sends over SMTP when an inbox is
 * configured, otherwise falls back to a mailto: draft — never silently
 * drops the message).
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Send, AlertTriangle } from 'lucide-react';
import { agingSummary, agingBucket, daysOverdue, AGING_BUCKET_DEFS, type AgingBucketId } from '@/lib/finances';
import { chaseEmailDraft, type ChaseTone } from '@/lib/invoice-chase';
import type { OpenInvoice } from '@/lib/connectors/quickbooks';
import { Badge, Label, type BadgeTone } from '@/components/terminal';

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const BUCKET_TONE: Record<AgingBucketId, BadgeTone> = {
  current: 'default',
  '1-30': 'warn',
  '31-60': 'warn',
  '61-90': 'err',
  '90+': 'err',
};

const TONE_LABEL: Record<ChaseTone, string> = { gentle: 'gentle nudge', firm: 'firm', urgent: 'urgent' };

function dueLabel(days: number | null): string {
  if (days === null) return 'no due date';
  if (days < 0) return `due in ${-days} day${days === -1 ? '' : 's'}`;
  if (days === 0) return 'due today';
  return `${days} day${days === 1 ? '' : 's'} overdue`;
}

export function InvoiceAging({ invoices }: { invoices: OpenInvoice[] }) {
  const now = useMemo(() => new Date(), []);
  const summary = useMemo(() => agingSummary(invoices, now), [invoices, now]);
  const totalOverdue = useMemo(
    () => summary.filter((g) => g.bucket !== 'current').reduce((s, g) => s + g.total, 0),
    [summary],
  );
  const [filter, setFilter] = useState<AgingBucketId | null>(null);
  const rows = useMemo(
    () => (filter ? (summary.find((g) => g.bucket === filter)?.invoices ?? []) : summary.flatMap((g) => g.invoices)),
    [summary, filter],
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (invoices.length === 0) return null;

  return (
    <section className="mb-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <Label rule>Accounts receivable · aging</Label>
        {totalOverdue > 0 && (
          <span className="shrink-0 font-mono text-[10.5px] text-os-err">{usd(totalOverdue)} overdue</span>
        )}
      </div>

      {/* Bucket pills — worst first, click to filter the table below */}
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        {AGING_BUCKET_DEFS.map(({ id, label }) => {
          const group = summary.find((g) => g.bucket === id)!;
          const active = filter === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFilter((cur) => (cur === id ? null : id))}
              className={`rounded-sm-t border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                active
                  ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                  : 'border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted'
              }`}
            >
              {label} ({group.count}
              {group.count > 0 ? ` · ${usd(group.total)}` : ''})
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg-t border border-os-border bg-os-surface">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-os-dim">
              <th className="px-3 pb-1 pt-3 font-normal">Customer</th>
              <th className="px-3 pb-1 pt-3 font-normal">Invoice</th>
              <th className="px-3 pb-1 pt-3 font-normal">Amount</th>
              <th className="px-3 pb-1 pt-3 font-normal">Status</th>
              <th className="px-3 pb-1 pt-3 font-normal">Aging</th>
              <th className="px-3 pb-1 pt-3 font-normal" />
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                now={now}
                expanded={expandedId === inv.id}
                onToggle={() => setExpandedId((cur) => (cur === inv.id ? null : inv.id))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InvoiceRow({
  invoice,
  now,
  expanded,
  onToggle,
}: {
  invoice: OpenInvoice;
  now: Date;
  expanded: boolean;
  onToggle: () => void;
}) {
  const days = daysOverdue(invoice.dueDate, now);
  return (
    <>
      <tr className="border-t border-os-border">
        <td className="px-3 py-2.5">
          <span className="block max-w-[220px] truncate text-[12.5px] font-semibold" title={invoice.customer}>
            {invoice.customer}
          </span>
        </td>
        <td className="px-3 py-2.5 font-mono text-[11px] text-os-muted">#{invoice.docNumber}</td>
        <td className="px-3 py-2.5 font-mono text-[12.5px] font-semibold text-os-warn">{usd(invoice.balance)}</td>
        <td className="px-3 py-2.5 font-mono text-[10.5px] text-os-dim">
          {invoice.dueDate ? `due ${invoice.dueDate}` : 'no due date'}
        </td>
        <td className="px-3 py-2.5">
          <RowAgingBadge days={days} />
        </td>
        <td className="px-3 py-2.5 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm-t border border-os-border-strong px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-os-text transition-colors hover:bg-os-text hover:text-os-bg"
          >
            {expanded ? <ChevronDown className="h-3 w-3" strokeWidth={2} /> : <ChevronRight className="h-3 w-3" strokeWidth={2} />}
            Chase
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-os-border bg-os-surface2">
          <td colSpan={6} className="px-3 py-3">
            <ChasePanel invoice={invoice} now={now} />
          </td>
        </tr>
      )}
    </>
  );
}

function RowAgingBadge({ days }: { days: number | null }) {
  return <Badge tone={BUCKET_TONE[agingBucket(days)]}>{dueLabel(days)}</Badge>;
}

function ChasePanel({ invoice, now }: { invoice: OpenInvoice; now: Date }) {
  const draft = useMemo(() => chaseEmailDraft(invoice, now), [invoice, now]);
  const [to, setTo] = useState(invoice.billEmail ?? '');
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    const recipient = to.trim();
    if (!recipient) {
      setStatus('add an email address to chase this invoice');
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch('/api/comms/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'email', to: recipient, subject, text: body }),
      }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok && data.ok) {
        setStatus('sent ✓');
        return;
      }
      // Honest fallback: SMTP isn't configured/reachable, so open the
      // system mail client with the draft pre-filled instead of silently
      // dropping it — the same fallback CommsGravity's reply box uses.
      window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setStatus(data.error ? `SMTP unavailable (${data.error}) — opened draft in Mail` : 'opened draft in Mail');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim">
        <AlertTriangle className="h-3 w-3" strokeWidth={1.8} />
        Draft · {TONE_LABEL[draft.tone]}
        {!invoice.billEmail && <span className="text-os-warn">— no email on file for {invoice.customer}, add one below</span>}
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">To</span>
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="client@example.com"
          className="rounded-sm-t border border-os-border bg-os-bg px-2.5 py-1.5 font-mono text-[12px] text-os-text outline-none focus:border-os-border-strong"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">Subject</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="rounded-sm-t border border-os-border bg-os-bg px-2.5 py-1.5 font-mono text-[12px] text-os-text outline-none focus:border-os-border-strong"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">Message</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="resize-y rounded-sm-t border border-os-border bg-os-bg px-2.5 py-1.5 font-mono text-[12px] leading-relaxed text-os-text outline-none focus:border-os-border-strong"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-sm-t border border-os-border-strong px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-os-text transition-colors hover:bg-os-text hover:text-os-bg disabled:opacity-50"
        >
          <Send className="h-3 w-3" strokeWidth={2} />
          {sending ? 'Sending…' : 'Send reminder'}
        </button>
        {status && <span className="font-mono text-[10.5px] text-os-dim">{status}</span>}
      </div>
    </div>
  );
}
