import { describe, expect, test } from 'vitest';
import {
  qboConfigured,
  qboEnvironment,
  qboApiBase,
  buildAuthorizeUrl,
  tokenResponseToAuth,
  isTokenExpiringSoon,
  parseQboQueryRows,
  sumQboAmounts,
  monthStartDate,
  parseOpenInvoices,
  parseProfitAndLossExpenseCategories,
} from '@/lib/connectors/quickbooks';

describe('qboConfigured', () => {
  test('needs BOTH client id and secret', () => {
    expect(qboConfigured({})).toBe(false);
    expect(qboConfigured({ QUICKBOOKS_CLIENT_ID: 'id' })).toBe(false);
    expect(qboConfigured({ QUICKBOOKS_CLIENT_ID: 'id', QUICKBOOKS_CLIENT_SECRET: 'sec' })).toBe(true);
  });
});

describe('qboEnvironment / qboApiBase', () => {
  test('defaults to production — real books are the normal case, not a demo', () => {
    expect(qboEnvironment({})).toBe('production');
    expect(qboEnvironment({ QUICKBOOKS_ENVIRONMENT: 'staging' })).toBe('production');
    expect(qboApiBase({})).toBe('https://quickbooks.api.intuit.com');
  });

  test('sandbox only when explicitly requested (dev keys / local testing)', () => {
    expect(qboEnvironment({ QUICKBOOKS_ENVIRONMENT: 'sandbox' })).toBe('sandbox');
    expect(qboApiBase({ QUICKBOOKS_ENVIRONMENT: 'sandbox' })).toContain('sandbox-quickbooks');
  });
});

describe('buildAuthorizeUrl', () => {
  test('includes client id, scope, redirect uri, and state', () => {
    const url = buildAuthorizeUrl(
      { QUICKBOOKS_CLIENT_ID: 'abc123' },
      'https://app.example.com/api/connections/quickbooks/callback',
      'nonce-1',
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://appcenter.intuit.com/connect/oauth2');
    expect(parsed.searchParams.get('client_id')).toBe('abc123');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('scope')).toBe('com.intuit.quickbooks.accounting');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.example.com/api/connections/quickbooks/callback');
    expect(parsed.searchParams.get('state')).toBe('nonce-1');
  });
});

describe('tokenResponseToAuth', () => {
  test('converts seconds-from-now expirations into absolute unix-ms timestamps', () => {
    const now = 1_700_000_000_000;
    const auth = tokenResponseToAuth(
      { access_token: 'at', refresh_token: 'rt', expires_in: 3600, x_refresh_token_expires_in: 8_640_000 },
      'realm-1',
      now,
    );
    expect(auth).toEqual({
      id: 'default',
      realmId: 'realm-1',
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: now + 3_600_000,
      refreshTokenExpiresAt: now + 8_640_000_000,
      updatedAt: new Date(now).toISOString(),
    });
  });
});

describe('isTokenExpiringSoon', () => {
  test('true once within the buffer (default 2 min), false with time to spare', () => {
    const now = 1_700_000_000_000;
    expect(isTokenExpiringSoon(now + 60_000, now)).toBe(true); // 1 min left
    expect(isTokenExpiringSoon(now + 5 * 60_000, now)).toBe(false); // 5 min left
    expect(isTokenExpiringSoon(now - 1000, now)).toBe(true); // already expired
  });
});

describe('parseQboQueryRows / sumQboAmounts', () => {
  test('extracts {id, amount, date} from a QBO Query response by entity name', () => {
    const raw = {
      QueryResponse: {
        Payment: [
          { Id: '1', TotalAmt: 1200.5, TxnDate: '2026-08-03' },
          { Id: '2', TotalAmt: 340, TxnDate: '2026-08-10' },
        ],
      },
    };
    const rows = parseQboQueryRows(raw, 'Payment');
    expect(rows).toEqual([
      { id: '1', amount: 1200.5, date: '2026-08-03' },
      { id: '2', amount: 340, date: '2026-08-10' },
    ]);
    expect(sumQboAmounts(rows)).toBe(1540.5);
  });

  test('skips malformed rows and returns [] for an empty/missing entity', () => {
    expect(parseQboQueryRows({ QueryResponse: {} }, 'Payment')).toEqual([]);
    expect(parseQboQueryRows(null, 'Payment')).toEqual([]);
    const raw = { QueryResponse: { Payment: [{ Id: '1' /* no TotalAmt */ }, { TotalAmt: 10, TxnDate: 'x' /* no Id */ }] } };
    expect(parseQboQueryRows(raw, 'Payment')).toEqual([]);
  });

  test('sumQboAmounts of an empty list is 0', () => {
    expect(sumQboAmounts([])).toBe(0);
  });
});

describe('monthStartDate', () => {
  test('formats the first of the month as YYYY-MM-DD (UTC)', () => {
    expect(monthStartDate(new Date('2026-08-12T23:00:00Z'))).toBe('2026-08-01');
    expect(monthStartDate(new Date('2026-01-31T05:00:00Z'))).toBe('2026-01-01');
  });
});

describe('parseOpenInvoices', () => {
  test('keeps only invoices with a positive balance, largest first', () => {
    const raw = {
      QueryResponse: {
        Invoice: [
          { Id: '1', DocNumber: '1001', CustomerRef: { name: 'Ramirez' }, Balance: 0, DueDate: '2026-08-01' },
          { Id: '2', DocNumber: '1002', CustomerRef: { name: 'Tinholt' }, Balance: 4200, DueDate: '2026-08-20' },
          { Id: '3', DocNumber: '1003', CustomerRef: { name: 'Holcomb' }, Balance: 900 },
        ],
      },
    };
    expect(parseOpenInvoices(raw)).toEqual([
      { id: '2', docNumber: '1002', customer: 'Tinholt', balance: 4200, dueDate: '2026-08-20', billEmail: null },
      { id: '3', docNumber: '1003', customer: 'Holcomb', balance: 900, dueDate: null, billEmail: null },
    ]);
  });

  test('returns [] for malformed input', () => {
    expect(parseOpenInvoices(null)).toEqual([]);
    expect(parseOpenInvoices({})).toEqual([]);
  });

  test('carries the customer bill-to email when QBO has one on file — needed to chase by email', () => {
    const raw = {
      QueryResponse: {
        Invoice: [
          {
            Id: '4',
            DocNumber: '1004',
            CustomerRef: { name: 'Ashworth' },
            Balance: 1500,
            DueDate: '2026-07-01',
            BillEmail: { Address: 'ashworth@example.com' },
          },
        ],
      },
    };
    expect(parseOpenInvoices(raw)[0].billEmail).toBe('ashworth@example.com');
  });

  test('missing or malformed BillEmail never invents an address', () => {
    const raw = {
      QueryResponse: {
        Invoice: [
          { Id: '5', DocNumber: '1005', CustomerRef: { name: 'Post' }, Balance: 300, BillEmail: {} },
          { Id: '6', DocNumber: '1006', CustomerRef: { name: 'Reyes' }, Balance: 300, BillEmail: { Address: 42 } },
        ],
      },
    };
    for (const inv of parseOpenInvoices(raw)) expect(inv.billEmail).toBeNull();
  });
});

describe('parseProfitAndLossExpenseCategories', () => {
  // Real shape of a QBO Reports API ProfitAndLoss response
  // (GET /v3/company/{realmId}/reports/ProfitAndLoss): a Rows.Row array of
  // Section rows (Income, COGS, Expenses, …), each with its own nested
  // Rows.Row of per-account Data rows and a Summary total. Both the "COGS"
  // and "Expenses" sections are real money spent this period and must count
  // toward the chart — a construction company's job/material costs commonly
  // post to Cost of Goods Sold, not Expenses (2026-08-21 fix: this used to
  // read the "Expenses" section only, so a real COGS-coded Purchase
  // transaction counted toward the finances page's raw MTD-expenses total
  // but silently vanished from the category chart — see CLAUDE.md's dated
  // entry). Income/NetIncome rows must still be ignored, not folded in.
  const fullReport = {
    Header: {
      ReportName: 'ProfitAndLoss',
      StartPeriod: '2026-08-01',
      EndPeriod: '2026-08-21',
      Currency: 'USD',
    },
    Columns: {
      Column: [
        { ColTitle: '', ColType: 'Account' },
        { ColTitle: 'Total', ColType: 'Money' },
      ],
    },
    Rows: {
      Row: [
        {
          type: 'Section',
          group: 'Income',
          Header: { ColData: [{ value: 'Income' }, { value: '' }] },
          Rows: {
            Row: [{ type: 'Data', ColData: [{ value: 'Design income', id: '79' }, { value: '3357.00' }] }],
          },
          Summary: { ColData: [{ value: 'Total Income' }, { value: '3357.00' }] },
        },
        {
          type: 'Section',
          group: 'COGS',
          Header: { ColData: [{ value: 'Cost of Goods Sold' }, { value: '' }] },
          Rows: {
            Row: [{ type: 'Data', ColData: [{ value: 'Job Materials', id: '91' }, { value: '244.00' }] }],
          },
          Summary: { ColData: [{ value: 'Total COGS' }, { value: '244.00' }] },
        },
        {
          type: 'Section',
          group: 'Expenses',
          Header: { ColData: [{ value: 'Expenses' }, { value: '' }] },
          Rows: {
            Row: [
              { type: 'Data', ColData: [{ value: 'Advertising', id: '7' }, { value: '22.50' }] },
              {
                // sub-account rollup — a nested Section within Expenses
                type: 'Section',
                group: '',
                Header: { ColData: [{ value: 'Job Expenses' }, { value: '' }] },
                Rows: {
                  Row: [
                    { type: 'Data', ColData: [{ value: 'Materials', id: '82' }, { value: '380.00' }] },
                    { type: 'Data', ColData: [{ value: 'Permits', id: '83' }, { value: '25.00' }] },
                  ],
                },
                Summary: { ColData: [{ value: 'Total Job Expenses' }, { value: '405.00' }] },
              },
            ],
          },
          Summary: { ColData: [{ value: 'Total Expenses' }, { value: '427.50' }] },
        },
        {
          type: 'Section',
          group: 'NetIncome',
          Header: { ColData: [{ value: 'Net Income' }, { value: '' }] },
          Summary: { ColData: [{ value: 'Net Income' }, { value: '2929.50' }] },
        },
      ],
    },
  };

  test('extracts leaf categories from both COGS and Expenses sections, recursing into sub-account sections, largest first', () => {
    expect(parseProfitAndLossExpenseCategories(fullReport)).toEqual([
      { category: 'Materials', total: 380 },
      { category: 'Job Materials', total: 244 },
      { category: 'Permits', total: 25 },
      { category: 'Advertising', total: 22.5 },
    ]);
  });

  test('ignores Income/NetIncome sections — never folds revenue into the expense chart', () => {
    const categories = parseProfitAndLossExpenseCategories(fullReport).map((c) => c.category);
    expect(categories).not.toContain('Design income');
    expect(categories).not.toContain('Net Income');
  });

  test('empty report (no expenses recorded this period) returns [] — an honest real zero, not undefined', () => {
    const emptyReport = {
      Header: { ReportName: 'ProfitAndLoss', Option: [{ Name: 'NoReportData', Value: 'true' }] },
      Rows: { Row: [] },
    };
    expect(parseProfitAndLossExpenseCategories(emptyReport)).toEqual([]);
  });

  test('report with no Expenses section at all returns [] rather than throwing', () => {
    const noExpenses = {
      Rows: {
        Row: [
          {
            type: 'Section',
            group: 'Income',
            Header: { ColData: [{ value: 'Income' }] },
            Rows: { Row: [{ type: 'Data', ColData: [{ value: 'Sales' }, { value: '100.00' }] }] },
            Summary: { ColData: [{ value: 'Total Income' }, { value: '100.00' }] },
          },
        ],
      },
    };
    expect(parseProfitAndLossExpenseCategories(noExpenses)).toEqual([]);
  });

  test('malformed/missing input never throws, always returns []', () => {
    expect(parseProfitAndLossExpenseCategories(null)).toEqual([]);
    expect(parseProfitAndLossExpenseCategories(undefined)).toEqual([]);
    expect(parseProfitAndLossExpenseCategories({})).toEqual([]);
    expect(parseProfitAndLossExpenseCategories({ Rows: {} })).toEqual([]);
    expect(parseProfitAndLossExpenseCategories('not an object')).toEqual([]);
  });

  test('skips malformed leaf rows (missing amount, missing label) without inventing values', () => {
    const raw = {
      Rows: {
        Row: [
          {
            type: 'Section',
            group: 'Expenses',
            Header: { ColData: [{ value: 'Expenses' }] },
            Rows: {
              Row: [
                { type: 'Data', ColData: [{ value: 'Fuel' } /* no amount column */] },
                { type: 'Data', ColData: [{ value: '' }, { value: '50.00' }] /* blank label */ },
                { type: 'Data', ColData: [{ value: 'Tools' }, { value: 'not-a-number' }] },
                { type: 'Data', ColData: [{ value: 'Vehicles' }, { value: '150.00' }] },
              ],
            },
            Summary: { ColData: [{ value: 'Total Expenses' }, { value: '200.00' }] },
          },
        ],
      },
    };
    expect(parseProfitAndLossExpenseCategories(raw)).toEqual([{ category: 'Vehicles', total: 150 }]);
  });

  test('duplicate category labels are summed, not overwritten', () => {
    const raw = {
      Rows: {
        Row: [
          {
            type: 'Section',
            group: 'Expenses',
            Header: { ColData: [{ value: 'Expenses' }] },
            Rows: {
              Row: [
                { type: 'Data', ColData: [{ value: 'Fuel' }, { value: '100.00' }] },
                { type: 'Data', ColData: [{ value: 'Fuel' }, { value: '25.00' }] },
              ],
            },
            Summary: { ColData: [{ value: 'Total Expenses' }, { value: '125.00' }] },
          },
        ],
      },
    };
    expect(parseProfitAndLossExpenseCategories(raw)).toEqual([{ category: 'Fuel', total: 125 }]);
  });

  test('a report with only a COGS section (no Expenses section at all) still yields its categories', () => {
    const cogsOnly = {
      Rows: {
        Row: [
          {
            type: 'Section',
            group: 'COGS',
            Header: { ColData: [{ value: 'Cost of Goods Sold' }] },
            Rows: {
              Row: [{ type: 'Data', ColData: [{ value: 'Subcontractors' }, { value: '244.00' }] }],
            },
            Summary: { ColData: [{ value: 'Total COGS' }, { value: '244.00' }] },
          },
        ],
      },
    };
    expect(parseProfitAndLossExpenseCategories(cogsOnly)).toEqual([{ category: 'Subcontractors', total: 244 }]);
  });
});

// ── Regression: 2026-08-21 finances-page contradiction ──────────────────────
//
// A live QA review found /finances disagreeing with itself about August
// 2026's expenses: the MTD summary cards (fed by monthToDateExpenses, a raw
// sum of QBO Purchase transactions) said $244, while the "Monthly expenses ·
// by category" chart (fed by monthToDateExpensesByCategory ->
// parseProfitAndLossExpenseCategories, reading QuickBooks' ProfitAndLoss
// report) said $0 for the exact same QuickBooks connection and month.
//
// Root cause: the two calls query genuinely different things, but the page
// presented both as unqualified "expenses". monthToDateExpenses sums every
// Purchase transaction regardless of which P&L account it posts to.
// parseProfitAndLossExpenseCategories previously read only the report's
// "Expenses" (operating expenses) section — but a construction company's
// real job/material costs routinely post to a Cost of Goods Sold account,
// which the parser silently dropped. A $244 Purchase transaction coded to
// COGS (materials bought for a job) therefore counted toward the MTD total
// but contributed nothing to the category chart, even though it is the same
// real spend. This test reproduces that exact scenario with the two raw QBO
// response shapes and asserts the totals must agree — it fails against the
// pre-fix parser (244 vs 0) and passes once COGS is included.
describe('MTD expenses vs category-chart total (regression)', () => {
  test('a Purchase transaction coded to a COGS account counts the same toward the raw MTD sum and the category chart', () => {
    // What monthToDateExpenses's `SELECT ... FROM Purchase` query returns.
    const purchaseQueryRaw = {
      QueryResponse: {
        Purchase: [{ Id: '901', TotalAmt: 244, TxnDate: '2026-08-05' }],
      },
    };
    // What the ProfitAndLoss report returns for that same real transaction —
    // coded to a Cost of Goods Sold account (typical for job materials).
    const profitAndLossRaw = {
      Rows: {
        Row: [
          {
            type: 'Section',
            group: 'COGS',
            Header: { ColData: [{ value: 'Cost of Goods Sold' }, { value: '' }] },
            Rows: {
              Row: [{ type: 'Data', ColData: [{ value: 'Job Materials' }, { value: '244.00' }] }],
            },
            Summary: { ColData: [{ value: 'Total COGS' }, { value: '244.00' }] },
          },
        ],
      },
    };

    const rawMtdTotal = sumQboAmounts(parseQboQueryRows(purchaseQueryRaw, 'Purchase'));
    const categoryChartTotal = parseProfitAndLossExpenseCategories(profitAndLossRaw).reduce(
      (sum, c) => sum + c.total,
      0,
    );

    expect(rawMtdTotal).toBe(244);
    expect(categoryChartTotal).toBe(rawMtdTotal);
  });
});
