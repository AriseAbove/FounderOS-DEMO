import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openLedger, type Ledger } from '@/lib/ledger';
import type { LedgerRow } from '@/lib/statements';

let led: Ledger;
afterEach(() => led?.close());

const ROWS: LedgerRow[] = [
  { date: '2026-06-01', description: 'AWS', amountCents: 5700, direction: 'out', category: 'Infrastructure' },
  { date: '2026-06-02', description: 'Facebook Ads', amountCents: 150000, direction: 'out', category: 'Advertising' },
  { date: '2026-06-03', description: 'AWS extra', amountCents: 4300, direction: 'out', category: 'Infrastructure' },
  { date: '2026-06-04', description: 'Client', amountCents: 500000, direction: 'in', category: 'Income' },
];

describe('ledger store', () => {
  it('inserts rows and dedupes re-uploads by content hash', () => {
    led = openLedger(':memory:');
    expect(led.insertRows(ROWS)).toBe(4);
    expect(led.insertRows(ROWS)).toBe(0); // same statement again → nothing new
    expect(led.rowCount()).toBe(4);
  });

  it('monthly() groups out-rows by category in USD, descending; income excluded', () => {
    led = openLedger(':memory:');
    led.insertRows(ROWS);
    expect(led.monthly()).toEqual([
      { category: 'Advertising', total: 1500 },
      { category: 'Infrastructure', total: 100 },
    ]);
  });

  it('reconcile(income) returns income, expenses (out total), and net', () => {
    led = openLedger(':memory:');
    led.insertRows(ROWS);
    expect(led.reconcile(5000)).toEqual({ income: 5000, expenses: 1600, net: 3400 });
  });

  it('monthly()/latestMonth() report only the most recent month when data spans several', () => {
    led = openLedger(':memory:');
    led.insertRows([
      { date: '2026-05-10', description: 'May AWS', amountCents: 1000, direction: 'out', category: 'Infrastructure' },
      { date: '2026-06-10', description: 'Jun Ads', amountCents: 5000, direction: 'out', category: 'Advertising' },
      { date: '2026-06-12', description: 'Jun AWS', amountCents: 2000, direction: 'out', category: 'Infrastructure' },
    ]);
    expect(led.latestMonth()).toBe('2026-06');
    expect(led.monthly()).toEqual([
      { category: 'Advertising', total: 50 },
      { category: 'Infrastructure', total: 20 }, // May's 10 excluded
    ]);
  });
});

describe('LEDGER_DB env var (Railway persistent-volume fix)', () => {
  // The ledger's default path used to resolve unconditionally under
  // process.cwd()/data — invisible on Railway's ephemeral container
  // filesystem, so every uploaded bank/CC statement vanished on the next
  // redeploy. It already reads process.env.LEDGER_DB the same way
  // lib/data.ts's getDb() reads FOUNDER_OS_DB; this pins that down so it
  // can't silently regress. DEFAULT_PATH is computed once at module load,
  // so the env var must be set BEFORE the fresh import below.
  it('openLedger() with no argument honors LEDGER_DB when set', async () => {
    const prev = process.env.LEDGER_DB;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-env-'));
    const file = path.join(dir, 'custom-ledger.db');
    process.env.LEDGER_DB = file;
    vi.resetModules();
    let led2: Ledger | undefined;
    try {
      const fresh = await import('@/lib/ledger');
      led2 = fresh.openLedger();
      led2.insertRows([ROWS[0]]);
      expect(fs.existsSync(file)).toBe(true);
    } finally {
      led2?.close();
      if (prev === undefined) delete process.env.LEDGER_DB;
      else process.env.LEDGER_DB = prev;
      vi.resetModules();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
