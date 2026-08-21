import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * 2026-08-21 fix: /finances called every QuickBooks status/data function
 * with bare `process.env` (or with no argument at all, silently falling back
 * to each connector function's own `= process.env` default) instead of
 * lib/creds.ts's runtimeEnv() — process.env + a fresh .env.local overlay.
 * .env.local is where the /integrations connect/rotate flow (and
 * production's FOUNDER_OS_ENV_LOCAL-backed volume file) actually writes
 * rotated QuickBooks credentials, so /finances deterministically showed
 * "RECONNECT NEEDED" / income "—" / hid the AR-aging + invoice-chase section
 * even when QuickBooks was genuinely connected and working everywhere else
 * on the same screen (verified live: /api/connections said connected 8/8
 * times while /finances said reconnect-needed 8/8 times in the same
 * session). Every OTHER real QuickBooks consumer already passes
 * runtimeEnv() (lib/connectors/index.ts's quickbooksStatus,
 * lib/agents/real.ts's quickbooks-pulse agent and Chief of Staff) — this
 * page was the one holdout. This test reads the page's actual source (same
 * convention as tests/funnel-page.test.ts and tests/home-page.test.ts) and
 * pins that every QBO call on the page is handed the SAME runtimeEnv()
 * result, never bare process.env and never called with no argument.
 */
describe('/finances passes runtimeEnv() (not process.env) into every QuickBooks call', () => {
  const page = read('app/finances/page.tsx');

  test('imports runtimeEnv from lib/creds', () => {
    expect(page).toMatch(/import\s*\{\s*runtimeEnv\s*\}\s*from\s*'@\/lib\/creds'/);
  });

  test('computes one env value from runtimeEnv() and never reads bare process.env for QuickBooks', () => {
    expect(page).toMatch(/const\s+env\s*=\s*runtimeEnv\(\)/);
    // Regression guard: the exact bug was `qboConfigured(process.env)`.
    expect(page).not.toMatch(/qboConfigured\(process\.env\)/);
    expect(page).toMatch(/qboConfigured\(env\)/);
  });

  test('the authorized-only data calls (company name, income, invoices, expense categories) all pass env explicitly', () => {
    // Regression guard: the exact bug called every one of these with NO
    // argument, silently falling back to the connector functions' own
    // `= process.env` default instead of the page's runtimeEnv() overlay.
    expect(page).not.toMatch(/qboCompanyName\(\)/);
    expect(page).not.toMatch(/qboMonthToDateIncome\(\)/);
    expect(page).not.toMatch(/qboOpenInvoices\(\)/);
    expect(page).not.toMatch(/qboMonthToDateExpensesByCategory\(\)/);

    expect(page).toMatch(/qboCompanyName\(env\)/);
    expect(page).toMatch(/qboMonthToDateIncome\(env\)/);
    expect(page).toMatch(/qboOpenInvoices\(env\)/);
    expect(page).toMatch(/qboMonthToDateExpensesByCategory\(env\)/);
  });
});
