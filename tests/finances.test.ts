import { describe, expect, test } from 'vitest';
import {
  SAMPLE_EXPENSES,
  totalExpenses,
  expensesByCategory,
  net,
  daysOverdue,
  agingBucket,
  agingSummary,
  AGING_BUCKET_DEFS,
  type ExpenseItem,
} from '@/lib/finances';

describe('expenses', () => {
  test('the sample list is empty — no invented recurring spend', () => {
    expect(SAMPLE_EXPENSES).toEqual([]);
    expect(totalExpenses(SAMPLE_EXPENSES)).toBe(0);
    expect(expensesByCategory(SAMPLE_EXPENSES)).toEqual([]);
  });

  test('totals and category grouping work on real uploaded items', () => {
    const items: ExpenseItem[] = [
      { id: 'a', label: 'Lumber supplier', category: 'Materials', monthly: 1200 },
      { id: 'b', label: 'Fuel', category: 'Vehicles', monthly: 300 },
      { id: 'c', label: 'Tile', category: 'Materials', monthly: 500 },
    ];
    expect(totalExpenses(items)).toBe(2000);
    expect(expensesByCategory(items)).toEqual([
      { category: 'Materials', total: 1700 },
      { category: 'Vehicles', total: 300 },
    ]);
  });
});

describe('net', () => {
  test('income minus expenses, may go negative', () => {
    expect(net(5000, 2000)).toBe(3000);
    expect(net(1000, 2500)).toBe(-1500);
  });
});

// Fixed "today" for deterministic aging math.
const TODAY = new Date('2026-08-21T12:00:00Z');

describe('daysOverdue', () => {
  test('null due date -> null (never guessed)', () => {
    expect(daysOverdue(null, TODAY)).toBeNull();
  });

  test('unparseable due date -> null', () => {
    expect(daysOverdue('not-a-date', TODAY)).toBeNull();
  });

  test('due today -> 0', () => {
    expect(daysOverdue('2026-08-21', TODAY)).toBe(0);
  });

  test('due in the future -> negative', () => {
    expect(daysOverdue('2026-08-28', TODAY)).toBe(-7);
  });

  test('past due -> positive day count', () => {
    expect(daysOverdue('2026-07-22', TODAY)).toBe(30);
    expect(daysOverdue('2026-05-23', TODAY)).toBe(90);
  });
});

describe('agingBucket', () => {
  test('not yet due (or no due date) is current', () => {
    expect(agingBucket(null)).toBe('current');
    expect(agingBucket(-5)).toBe('current');
    expect(agingBucket(0)).toBe('current');
  });

  test('1-30 days past due', () => {
    expect(agingBucket(1)).toBe('1-30');
    expect(agingBucket(30)).toBe('1-30');
  });

  test('31-60 days past due', () => {
    expect(agingBucket(31)).toBe('31-60');
    expect(agingBucket(60)).toBe('31-60');
  });

  test('61-90 days past due', () => {
    expect(agingBucket(61)).toBe('61-90');
    expect(agingBucket(90)).toBe('61-90');
  });

  test('90+ days past due', () => {
    expect(agingBucket(91)).toBe('90+');
    expect(agingBucket(400)).toBe('90+');
  });
});

describe('AGING_BUCKET_DEFS', () => {
  test('most-overdue bucket first, current last', () => {
    expect(AGING_BUCKET_DEFS.map((b) => b.id)).toEqual(['90+', '61-90', '31-60', '1-30', 'current']);
  });
});

describe('agingSummary', () => {
  type Inv = { id: string; balance: number; dueDate: string | null };
  const invoices: Inv[] = [
    { id: 'a', balance: 1000, dueDate: '2026-08-28' }, // not due yet -> current
    { id: 'b', balance: 500, dueDate: '2026-08-10' }, // 11 days -> 1-30
    { id: 'c', balance: 2000, dueDate: '2026-07-01' }, // 51 days -> 31-60
    { id: 'd', balance: 300, dueDate: '2026-05-01' }, // 112 days -> 90+
    { id: 'e', balance: 700, dueDate: null }, // unknown -> current
  ];

  test('groups every invoice into exactly one of the five standard buckets, most overdue first', () => {
    const summary = agingSummary(invoices, TODAY);
    expect(summary.map((g) => g.bucket)).toEqual(['90+', '61-90', '31-60', '1-30', 'current']);
    expect(summary.find((g) => g.bucket === '90+')?.invoices.map((i) => i.id)).toEqual(['d']);
    expect(summary.find((g) => g.bucket === '31-60')?.invoices.map((i) => i.id)).toEqual(['c']);
    expect(summary.find((g) => g.bucket === '1-30')?.invoices.map((i) => i.id)).toEqual(['b']);
    const current = summary.find((g) => g.bucket === 'current')?.invoices.map((i) => i.id) ?? [];
    expect(current.sort()).toEqual(['a', 'e']);
  });

  test('every invoice is accounted for exactly once — no dropped or duplicated dollars', () => {
    const summary = agingSummary(invoices, TODAY);
    const total = summary.reduce((s, g) => s + g.total, 0);
    const count = summary.reduce((s, g) => s + g.count, 0);
    expect(total).toBe(invoices.reduce((s, i) => s + i.balance, 0));
    expect(count).toBe(invoices.length);
  });

  test('count and total match the invoices placed in each bucket', () => {
    const summary = agingSummary(invoices, TODAY);
    const bucket90 = summary.find((g) => g.bucket === '90+')!;
    expect(bucket90.count).toBe(1);
    expect(bucket90.total).toBe(300);
  });

  test('empty input yields all five buckets at zero, never a missing bucket', () => {
    const summary = agingSummary([], TODAY);
    expect(summary).toHaveLength(5);
    expect(summary.every((g) => g.count === 0 && g.total === 0 && g.invoices.length === 0)).toBe(true);
  });
});
