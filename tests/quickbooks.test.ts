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
} from '@/lib/connectors/quickbooks';

describe('qboConfigured', () => {
  test('needs BOTH client id and secret', () => {
    expect(qboConfigured({})).toBe(false);
    expect(qboConfigured({ QUICKBOOKS_CLIENT_ID: 'id' })).toBe(false);
    expect(qboConfigured({ QUICKBOOKS_CLIENT_ID: 'id', QUICKBOOKS_CLIENT_SECRET: 'sec' })).toBe(true);
  });
});

describe('qboEnvironment / qboApiBase', () => {
  test('defaults to sandbox — never guesses production', () => {
    expect(qboEnvironment({})).toBe('sandbox');
    expect(qboEnvironment({ QUICKBOOKS_ENVIRONMENT: 'staging' })).toBe('sandbox');
    expect(qboApiBase({})).toContain('sandbox-quickbooks');
  });

  test('production only when explicitly set', () => {
    expect(qboEnvironment({ QUICKBOOKS_ENVIRONMENT: 'production' })).toBe('production');
    expect(qboApiBase({ QUICKBOOKS_ENVIRONMENT: 'production' })).toBe('https://quickbooks.api.intuit.com');
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
      { id: '2', docNumber: '1002', customer: 'Tinholt', balance: 4200, dueDate: '2026-08-20' },
      { id: '3', docNumber: '1003', customer: 'Holcomb', balance: 900, dueDate: null },
    ]);
  });

  test('returns [] for malformed input', () => {
    expect(parseOpenInvoices(null)).toEqual([]);
    expect(parseOpenInvoices({})).toEqual([]);
  });
});
