/**
 * Finances domain — pure, real-ready. Income reads from QuickBooks (the real
 * books) once its OAuth grant lands; category-level expenses read from
 * QuickBooks' ProfitAndLoss report when connected, falling back to uploaded
 * bank/CC statements parsed into the ledger when it isn't.
 *
 * No faked money: an unwired source reports null income, never a zero that
 * reads as "earned nothing". The page renders pending honestly.
 */

// ── Expenses: from uploaded statements only — no invented sample spend ──────

export type ExpenseItem = { id: string; label: string; category: string; monthly: number };

/**
 * Emptied in the Phase 2 purge: the previous list was the original creator's
 * invented subscription stack. Real recurring spend comes from parsed
 * bank/credit-card statement uploads (the ledger); this stays as the typed
 * empty fallback so the page renders an honest zero until an upload lands.
 */
export const SAMPLE_EXPENSES: ExpenseItem[] = [];

/** Sum of every recurring monthly cost. */
export function totalExpenses(items: ExpenseItem[]): number {
  return items.reduce((sum, e) => sum + e.monthly, 0);
}

/** Per-category totals, largest first. */
export function expensesByCategory(items: ExpenseItem[]): { category: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const e of items) totals.set(e.category, (totals.get(e.category) ?? 0) + e.monthly);
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

/** Net monthly cash flow — income minus expenses (may be negative). */
export function net(income: number, expenses: number): number {
  return income - expenses;
}

// ── AR aging: standard 5-bucket structure, most overdue surfaced first ──────
//
// QuickBooks hands the Finances page a flat list of open invoices with a
// balance and a due date. That's real AR data, but a flat "$178,262 across
// 67 invoices" number gives the owner no next step. Aging buckets turn it
// into "here's what's actually gone stale" — the standard construction/
// small-business AR aging structure (current, 1-30, 31-60, 61-90, 90+ days
// past due), sorted worst-first so the invoices most worth a chase surface
// at the top.

export type AgingBucketId = 'current' | '1-30' | '31-60' | '61-90' | '90+';

/** Ordered worst → best, matching how the Finances page renders bucket rows. */
export const AGING_BUCKET_DEFS: { id: AgingBucketId; label: string }[] = [
  { id: '90+', label: '90+ days' },
  { id: '61-90', label: '61–90 days' },
  { id: '31-60', label: '31–60 days' },
  { id: '1-30', label: '1–30 days' },
  { id: 'current', label: 'Current' },
];

/**
 * Whole days past `dueDate` as of `now` (UTC calendar days, not elapsed
 * hours, so "due today" is always 0 regardless of time-of-day). Null when
 * there's no due date to compute from, or it doesn't parse — honest unknown,
 * never a guessed day count.
 */
export function daysOverdue(dueDate: string | null, now: Date = new Date()): number | null {
  if (!dueDate) return null;
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(due)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - due) / 86_400_000);
}

/** Which standard AR bucket a day count falls in. Not-yet-due, due today, and
    unknown (null) due dates are all "current" — none of them are overdue. */
export function agingBucket(days: number | null): AgingBucketId {
  if (days === null || days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export type AgingGroup<T> = {
  bucket: AgingBucketId;
  label: string;
  count: number;
  total: number;
  /** Within a bucket: most days overdue first, largest balance breaks ties. */
  invoices: T[];
};

/**
 * Group invoices into the five standard AR aging buckets, worst first.
 * Every input invoice lands in exactly one bucket — no dollars dropped, none
 * invented. Buckets with nothing in them still appear (count/total 0) so the
 * page always shows the full aging structure, not just whichever buckets
 * happen to be non-empty today.
 */
export function agingSummary<T extends { balance: number; dueDate: string | null }>(
  invoices: T[],
  now: Date = new Date(),
): AgingGroup<T>[] {
  const withDays = invoices.map((inv) => ({ inv, days: daysOverdue(inv.dueDate, now) }));
  return AGING_BUCKET_DEFS.map(({ id, label }) => {
    const list = withDays
      .filter(({ days }) => agingBucket(days) === id)
      .sort((a, b) => (b.days ?? -Infinity) - (a.days ?? -Infinity) || b.inv.balance - a.inv.balance)
      .map(({ inv }) => inv);
    return { bucket: id, label, count: list.length, total: list.reduce((s, i) => s + i.balance, 0), invoices: list };
  });
}

// ── Expense categories: QuickBooks when connected, uploads as fallback ──────

export type CategoryTotal = { category: string; total: number };
export type ExpenseCategorySource = 'quickbooks' | 'statements' | 'none';

/**
 * Which expense-category source the "Monthly expenses by category" chart
 * should render, and which one wins.
 *
 * Decision: QuickBooks' ProfitAndLoss report is real, accountant-categorized
 * data straight from the books — a materially more complete and trustworthy
 * picture than whatever subset of spend happened to get uploaded as a CSV/
 * PDF statement. So once QuickBooks is connected and its report call
 * succeeds, it takes priority outright rather than being merged with the
 * uploaded-statement ledger: the two sources likely overlap (a QuickBooks
 * Purchase transaction and an uploaded bank-statement line can both describe
 * the same real charge), and summing them would double-count real spend —
 * which fails the "no invented numbers" bar just as badly as making one up.
 *
 * `qboCategories === null` means the report call itself failed or
 * QuickBooks isn't connected/authorized — that's the only case that falls
 * back to the uploaded-statement ledger, so the upload flow keeps working
 * as the honest path for anyone who hasn't set up QuickBooks OAuth (or
 * whose token needs reconnecting). `qboCategories === []` while connected
 * means the report call succeeded and QuickBooks genuinely has no
 * categorized expenses this period — that's a real $0, not a failure, so it
 * is NOT treated as "nothing" and does not fall back to stale uploaded
 * numbers.
 */
export function resolveExpenseCategories(
  qboConnected: boolean,
  qboCategories: CategoryTotal[] | null,
  ledgerCategories: CategoryTotal[],
): { source: ExpenseCategorySource; categories: CategoryTotal[] } {
  if (qboConnected && qboCategories !== null) {
    return { source: 'quickbooks', categories: qboCategories };
  }
  if (ledgerCategories.length > 0) {
    return { source: 'statements', categories: ledgerCategories };
  }
  return { source: 'none', categories: [] };
}

