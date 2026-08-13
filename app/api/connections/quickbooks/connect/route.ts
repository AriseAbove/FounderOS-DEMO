import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { buildAuthorizeUrl, qboConfigured } from '@/lib/connectors/quickbooks';

export const dynamic = 'force-dynamic';

/**
 * Starts the QuickBooks OAuth grant: redirects to Intuit's consent screen.
 * The redirect_uri must exactly match one registered on the app (Intuit
 * Developer → Keys & OAuth) — QUICKBOOKS_REDIRECT_URI overrides the derived
 * origin when the two differ (e.g. a custom domain in front of Railway).
 */
export async function GET(req: Request) {
  if (!qboConfigured(process.env)) {
    return NextResponse.json(
      { ok: false, error: 'QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET not set' },
      { status: 400 },
    );
  }
  const origin = new URL(req.url).origin;
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI ?? `${origin}/api/connections/quickbooks/callback`;

  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set('qbo_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes — plenty for the consent screen round trip
    path: '/',
  });

  return NextResponse.redirect(buildAuthorizeUrl(process.env, redirectUri, state));
}
