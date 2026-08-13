/**
 * Finances domain — pure, real-ready. Income reads from QuickBooks (the real
 * books) once its OAuth grant lands; expenses come from uploaded bank/CC
 * statements parsed into the ledger.
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

