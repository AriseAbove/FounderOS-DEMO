import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// The one login wall for the whole app. Every page and every API route in
// this repo was built honest-by-default (repo-layer, real connector status)
// but NOT auth-by-default — a 2026-08-15 security review found that of the
// ~40 routes under app/api, only two check anything at all (the Chief of
// Staff cron route via CRON_SECRET, and the voice relay via
// VOICE_RELAY_SECRET). Every other route — finances, funnel/CRM, comms
// (including SENDING real email), the /api/keys and
// /api/connections/connect routes that overwrite saved integration
// credentials — was reachable by anyone who had the URL, no password at
// all. This middleware is the fix: a single HTTP Basic Auth gate in front
// of the entire app, so "the URL is public" stops being "the data is
// public."
//
// The two routes above keep their own bearer-token auth instead of this
// Basic Auth wall, because their callers are machines (GitHub Actions'
// scheduled cron, and Sean's Mac speaker daemon polling over HTTPS) that
// can't do an interactive Basic Auth challenge — they send
// `Authorization: Bearer <secret>` directly, which this middleware would
// otherwise reject as "not Basic".
//
// Honest-by-default here too: if APP_BASIC_AUTH_USER/PASS aren't set, this
// fails OPEN (matches every other connector's ConnectorStatus pattern in
// this repo — never silently claim protection that isn't configured yet).
// Once both are set, every other route requires them.
const BYPASS_PREFIXES = ['/api/cron/chief-of-staff', '/api/voice/queue'];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const user = process.env.APP_BASIC_AUTH_USER;
  const pass = process.env.APP_BASIC_AUTH_PASS;
  if (!user || !pass) {
    return NextResponse.next();
  }

  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    const decoded = atob(auth.slice('Basic '.length));
    const sep = decoded.indexOf(':');
    const suppliedUser = sep === -1 ? decoded : decoded.slice(0, sep);
    const suppliedPass = sep === -1 ? '' : decoded.slice(sep + 1);
    if (suppliedUser === user && suppliedPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ARISE OS"' },
  });
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
