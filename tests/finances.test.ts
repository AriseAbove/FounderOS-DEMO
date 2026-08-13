import { describe, expect, test } from 'vitest';
import {
  SAMPLE_EXPENSES,
  totalExpenses,
  expensesByCategory,
  net,
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
