import type { ConnectorStatus } from '@/lib/connectors/types';
import { getDb } from '@/lib/data';
import type { QuickBooksAuth } from '@/lib/schemas';

/**
 * QuickBooks Online — real accounting data (income, expenses, open invoices)
 * for AAC's finances page. OAuth 2.0 (authorization-code + refresh), not a
 * pasted API key: /api/connections/quickbooks/connect starts the grant,
 * /api/connections/quickbooks/callback exchanges the code and stores the
 * tokens via lib/db.ts's quickbooksAuth repo (never in .env.local, never
 * committed — Client ID/Secret are the only pieces that live in env vars).
 *
 * Honest status only: no stored grant (or a dead one) reports pending/error,
 * never a faked "connected".
 */

export const QBO_SCOPE = 'com.intuit.quickbooks.accounting';
export const QBO_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
export const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
export const QBO_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

export function qboConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.QUICKBOOKS_CLIENT_ID && env.QUICKBOOKS_CLIENT_SECRET);
}

/** Production is the normal case — this is a real business's books, not a
    demo. Sandbox only when explicitly requested (dev keys / local testing
    via QUICKBOOKS_ENVIRONMENT=sandbox). */
export function qboEnvironment(env: Record<string, string | undefined> = process.env): 'sandbox' | 'production' {
  return env.QUICKBOOKS_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production';
}

export function qboApiBase(env: Record<string, string | undefined> = process.env): string {
  return qboEnvironment(env) === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

/** Build the Intuit consent-screen URL the user is sent to. Pure — testable
    without a network call. `state` should be a random nonce the callback
    route verifies (CSRF protection on the redirect). */
export function buildAuthorizeUrl(
  env: Record<string, string | undefined>,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: env.QUICKBOOKS_CLIENT_ID ?? '',
    response_type: 'code',
    scope: QBO_SCOPE,
    redirect_uri: redirectUri,
    state,
  });
  return `${QBO_AUTHORIZE_URL}?${params.toString()}`;
}

function basicAuthHeader(env: Record<string, string | undefined>): string {
  const id = env.QUICKBOOKS_CLIENT_ID ?? '';
  const secret = env.QUICKBOOKS_CLIENT_SECRET ?? '';
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  x_refresh_token_expires_in: number; // seconds
};

/** Parse a token-endpoint payload into the row shape we store. Pure. */
export function tokenResponseToAuth(
  raw: TokenResponse,
  realmId: string,
  now: number = Date.now(),
): QuickBooksAuth {
  return {
    id: 'default',
    realmId,
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    accessTokenExpiresAt: now + raw.expires_in * 1000,
    refreshTokenExpiresAt: now + raw.x_refresh_token_expires_in * 1000,
    updatedAt: new Date(now).toISOString(),
  };
}

/** Exchange an authorization code for tokens (first-time connect). */
export async function exchangeCodeForTokens(
  env: Record<string, string | undefined>,
  code: string,
  redirectUri: string,
  realmId: string,
): Promise<QuickBooksAuth> {
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(env),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`QuickBooks token exchange failed: ${res.status} ${await res.text()}`);
  return tokenResponseToAuth((await res.json()) as TokenResponse, realmId);
}

/** Refresh tokens — Intuit rotates the refresh token on every use, so the
    caller must persist the full new record, not just the access token. */
export async function refreshTokens(
  env: Record<string, string | undefined>,
  refreshToken: string,
  realmId: string,
): Promise<QuickBooksAuth> {
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(env),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`QuickBooks token refresh failed: ${res.status} ${await res.text()}`);
  return tokenResponseToAuth((await res.json()) as TokenResponse, realmId);
}

/** True once an access token is within `bufferMs` of expiring (or already
    expired). Pure — default 2-minute buffer to survive request latency. */
export function isTokenExpiringSoon(expiresAtMs: number, now: number = Date.now(), bufferMs = 120_000): boolean {
  return expiresAtMs - now <= bufferMs;
}

/** A valid access token + realmId, refreshing (and persisting the rotated
    refresh token) when the stored one is stale. Null when never connected. */
export async function getValidAccessToken(
  env: Record<string, string | undefined> = process.env,
): Promise<{ accessToken: string; realmId: string } | null> {
  const db = getDb();
  const stored = db.quickbooksAuth.get();
  if (!stored) return null;
  if (!isTokenExpiringSoon(stored.accessTokenExpiresAt)) {
    return { accessToken: stored.accessToken, realmId: stored.realmId };
  }
  const refreshed = await refreshTokens(env, stored.refreshToken, stored.realmId);
  db.quickbooksAuth.save(refreshed);
  return { accessToken: refreshed.accessToken, realmId: refreshed.realmId };
}

async function qboFetch(
  env: Record<string, string | undefined>,
  path: string,
): Promise<unknown> {
  const auth = await getValidAccessToken(env);
  if (!auth) throw new Error('QuickBooks is not connected');
  const res = await fetch(`${qboApiBase(env)}/v3/company/${auth.realmId}${path}`, {
    headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`QuickBooks API ${res.status}: ${await res.text()}`);
  return res.json();
}

export type QboTxn = { id: string; amount: number; date: string };

/** Pull rows out of a QBO Query response for a given entity name. Guarded —
    malformed rows are skipped, never invented. */
export function parseQboQueryRows(raw: unknown, entity: string): QboTxn[] {
  const rows = (raw as { QueryResponse?: Record<string, unknown> })?.QueryResponse?.[entity];
  if (!Array.isArray(rows)) return [];
  const out: QboTxn[] = [];
  for (const row of rows) {
    const r = (row ?? {}) as Record<string, unknown>;
    const amount = Number(r.TotalAmt);
    const date = r.TxnDate;
    const id = r.Id;
    if (!Number.isFinite(amount) || typeof date !== 'string' || typeof id !== 'string') continue;
    out.push({ id, amount, date });
  }
  return out;
}

/** Sum of `.amount` across rows — cents-free (QBO reports decimal dollars). */
export function sumQboAmounts(rows: QboTxn[]): number {
  return rows.reduce((sum, r) => sum + r.amount, 0);
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** First-of-month date string in the shape QBO's query language expects. */
export function monthStartDate(now: Date = new Date()): string {
  return isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

/** Month-to-date income = payments received (money actually landed), not
    invoiced-but-unpaid. Null when not connected/reachable — the finances
    page renders honest pending, never a fake zero. */
export async function monthToDateIncome(
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): Promise<number | null> {
  try {
    const query = `SELECT Id, TotalAmt, TxnDate FROM Payment WHERE TxnDate >= '${monthStartDate(now)}' MAXRESULTS 1000`;
    const raw = await qboFetch(env, `/query?query=${encodeURIComponent(query)}&minorversion=65`);
    return sumQboAmounts(parseQboQueryRows(raw, 'Payment'));
  } catch {
    return null;
  }
}

/** Month-to-date expenses = Purchase transactions (card/check/cash spend
    that actually left the bank) — the construction-business analog of the
    "processor charges" the Stripe path sums. Null when unreachable. */
export async function monthToDateExpenses(
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): Promise<number | null> {
  try {
    const query = `SELECT Id, TotalAmt, TxnDate FROM Purchase WHERE TxnDate >= '${monthStartDate(now)}' MAXRESULTS 1000`;
    const raw = await qboFetch(env, `/query?query=${encodeURIComponent(query)}&minorversion=65`);
    return sumQboAmounts(parseQboQueryRows(raw, 'Purchase'));
  } catch {
    return null;
  }
}

/** Month-to-date expenses broken out by category, from the QBO Reports API's
    ProfitAndLoss report (/v3/company/{realmId}/reports/ProfitAndLoss) —
    the standard QuickBooks report for accountant-categorized income/expense
    by account, not another raw transaction-query sum. This is what actually
    answers "where did the money go this month": monthToDateExpenses above
    sums raw Purchase transactions to one number; this reads the same books
    QuickBooks itself categorizes them into (Materials, Advertising, Fuel,
    Subcontractors, …) for the finances page's category chart. Null when
    unreachable/unauthorized — the page falls back to uploaded-statement
    categories rather than showing a fake empty chart. */
export async function monthToDateExpensesByCategory(
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): Promise<CategoryTotal[] | null> {
  try {
    const start = monthStartDate(now);
    const end = isoDate(now);
    const raw = await qboFetch(env, `/reports/ProfitAndLoss?start_date=${start}&end_date=${end}&minorversion=65`);
    return parseProfitAndLossExpenseCategories(raw);
  } catch {
    return null;
  }
}

export type CategoryTotal = { category: string; total: number };

/** One row of a QBO Reports API response's `Rows.Row` array — either a leaf
    "Data" row (one account/category + amount) or a "Section" row that nests
    its own child Rows (a sub-account rollup, e.g. "Job Expenses" grouping
    "Materials"/"Permits"). Loosely typed — this is exactly the shape we
    guard against being wrong. */
type QboReportRow = {
  type?: string;
  group?: string;
  ColData?: { value?: unknown }[];
  Header?: { ColData?: { value?: unknown }[] };
  Summary?: { ColData?: { value?: unknown }[] };
  Rows?: { Row?: unknown };
};

/** Recursively pull every leaf category+amount out of a section's child rows.
    "Data" rows are read directly; "Section" rows (sub-account rollups) are
    recursed into so multi-level chart-of-accounts nesting still yields real
    per-account numbers instead of one lumped total. A Section's own Summary
    total is never added alongside its children — that would double-count
    the same spend once as the rollup and again per leaf account. */
function collectLeafCategories(rows: unknown): CategoryTotal[] {
  if (!Array.isArray(rows)) return [];
  const out: CategoryTotal[] = [];
  for (const raw of rows) {
    const row = (raw ?? {}) as QboReportRow;
    if (row.type === 'Data') {
      const category = row.ColData?.[0]?.value;
      const total = Number(row.ColData?.[1]?.value);
      if (typeof category === 'string' && category.trim() && Number.isFinite(total)) {
        out.push({ category, total });
      }
    } else if (row.type === 'Section') {
      out.push(...collectLeafCategories(row.Rows?.Row));
    }
  }
  return out;
}

/** Parse the "Expenses" section of a QBO Reports API ProfitAndLoss response
    into category totals, largest first. Guarded like every other QBO parser
    here — Income/COGS/NetIncome sections are ignored, malformed or
    non-finite rows are skipped, duplicate category labels are summed rather
    than overwritten, and anything unexpected returns [] instead of
    throwing. A real, connected report with genuinely no expenses this
    period also returns [] — that's an honest zero, not an error. */
export function parseProfitAndLossExpenseCategories(raw: unknown): CategoryTotal[] {
  const rows = (raw as { Rows?: { Row?: unknown } } | null | undefined)?.Rows?.Row;
  if (!Array.isArray(rows)) return [];
  const expensesSection = rows.find((r) => (r as QboReportRow)?.group === 'Expenses') as QboReportRow | undefined;
  if (!expensesSection) return [];
  const leaves = collectLeafCategories(expensesSection.Rows?.Row);

  const totals = new Map<string, number>();
  for (const { category, total } of leaves) totals.set(category, (totals.get(category) ?? 0) + total);
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export type OpenInvoice = {
  id: string;
  docNumber: string;
  customer: string;
  balance: number;
  dueDate: string | null;
  /** Bill-to email QBO has on file, if any — needed to chase by email.
      Null (never invented) when QBO didn't return one. */
  billEmail: string | null;
};

/** Parse open (Balance > 0) invoices from a QBO Query response. Guarded. */
export function parseOpenInvoices(raw: unknown): OpenInvoice[] {
  const rows = (raw as { QueryResponse?: { Invoice?: unknown } })?.QueryResponse?.Invoice;
  if (!Array.isArray(rows)) return [];
  const out: OpenInvoice[] = [];
  for (const row of rows) {
    const r = (row ?? {}) as Record<string, any>;
    const balance = Number(r.Balance);
    const id = r.Id;
    if (!Number.isFinite(balance) || balance <= 0 || typeof id !== 'string') continue;
    out.push({
      id,
      docNumber: typeof r.DocNumber === 'string' ? r.DocNumber : id,
      customer: typeof r.CustomerRef?.name === 'string' ? r.CustomerRef.name : 'Unknown client',
      balance,
      dueDate: typeof r.DueDate === 'string' ? r.DueDate : null,
      billEmail: typeof r.BillEmail?.Address === 'string' ? r.BillEmail.Address : null,
    });
  }
  return out.sort((a, b) => b.balance - a.balance);
}

/** Outstanding accounts receivable — unpaid/partially-paid invoices, largest
    balance first. Null when unreachable (page hides the section). */
export async function openInvoices(
  env: Record<string, string | undefined> = process.env,
): Promise<OpenInvoice[] | null> {
  try {
    const query =
      "SELECT Id, DocNumber, CustomerRef, Balance, DueDate, BillEmail FROM Invoice WHERE Balance > '0' MAXRESULTS 100";
    const raw = await qboFetch(env, `/query?query=${encodeURIComponent(query)}&minorversion=65`);
    return parseOpenInvoices(raw);
  } catch {
    return null;
  }
}

export async function companyName(env: Record<string, string | undefined> = process.env): Promise<string | null> {
  try {
    const auth = await getValidAccessToken(env);
    if (!auth) return null;
    const raw = (await qboFetch(env, `/companyinfo/${auth.realmId}`)) as {
      CompanyInfo?: { CompanyName?: string };
    };
    return raw.CompanyInfo?.CompanyName ?? null;
  } catch {
    return null;
  }
}

export async function quickbooksStatus(
  env: Record<string, string | undefined> = process.env,
): Promise<ConnectorStatus> {
  if (!qboConfigured(env)) {
    return {
      id: 'quickbooks',
      name: 'QuickBooks',
      kind: 'payments',
      state: 'not_configured',
      detail: 'QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET not set.',
    };
  }
  const stored = getDb().quickbooksAuth.get();
  if (!stored) {
    return {
      id: 'quickbooks',
      name: 'QuickBooks',
      kind: 'payments',
      state: 'not_configured',
      detail: `Client keys set (${qboEnvironment(env)}) — visit /api/connections/quickbooks/connect to authorize.`,
    };
  }
  const name = await companyName(env);
  if (!name) {
    return {
      id: 'quickbooks',
      name: 'QuickBooks',
      kind: 'payments',
      state: 'error',
      detail: 'Connected previously but the API call failed — token may be revoked. Reconnect at /api/connections/quickbooks/connect.',
    };
  }
  return {
    id: 'quickbooks',
    name: 'QuickBooks',
    kind: 'payments',
    state: 'connected',
    detail: `${name} · ${qboEnvironment(env)}`,
    meta: { environment: qboEnvironment(env) },
  };
}
