import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCodeForTokens } from '@/lib/connectors/quickbooks';
import { getDb } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * Intuit redirects here after the user approves (or denies) the consent
 * screen with ?code&state&realmId (success) or ?error (denied/failed).
 * State is checked against the cookie the connect route set, then the code
 * is exchanged for tokens and stored via lib/db.ts's quickbooksAuth repo —
 * never in .env.local, never logged.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const realmId = url.searchParams.get('realmId');
  const oauthError = url.searchParams.get('error');

  const jar = await cookies();
  const expectedState = jar.get('qbo_oauth_state')?.value;
  jar.delete('qbo_oauth_state');

  if (oauthError) {
    return NextResponse.redirect(new URL(`/integrations?quickbooks=denied`, url.origin));
  }
  if (!code || !realmId || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL(`/integrations?quickbooks=error`, url.origin));
  }

  try {
    const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI ?? `${url.origin}/api/connections/quickbooks/callback`;
    const auth = await exchangeCodeForTokens(process.env, code, redirectUri, realmId);
    getDb().quickbooksAuth.save(auth);
  } catch {
    return NextResponse.redirect(new URL(`/integrations?quickbooks=error`, url.origin));
  }

  return NextResponse.redirect(new URL(`/finances?quickbooks=connected`, url.origin));
}
