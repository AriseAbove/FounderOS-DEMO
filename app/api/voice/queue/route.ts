import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/data';
import { runtimeEnv } from '@/lib/creds';

// The voice-relay queue behind Zoey's speaker daemon
// (~/.cowork_speaker/speaker_daemon.py on Sean's Mac). Any Claude session —
// cloud sandbox or on-device — POSTs a short reply here; the daemon polls
// it with GET over the ordinary network. This exists specifically so voice
// output stops depending on a fresh device_request_folder_access grant to
// ~/.cowork_speaker on every new cloud session (see
// project_cowork_speaker_voice_system.md in project memory for the full
// history) — an ordinary HTTPS call needs no device-folder grant at all.
// Gated by a shared secret the same way the Chief of Staff cron route is
// gated by CRON_SECRET (see app/api/cron/chief-of-staff/route.ts) since
// this is a public route.
export const dynamic = 'force-dynamic';

function checkAuth(req: Request): NextResponse | null {
  const secret = runtimeEnv().VOICE_RELAY_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'VOICE_RELAY_SECRET not set — add it to .env.local (and the host env) and to speaker_daemon.py\'s config to enable the voice relay queue.',
      },
      { status: 501 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const id = randomUUID();
  getDb().voiceQueue.enqueue({ id, text, createdAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, id });
}

export async function GET(req: Request) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  const item = getDb().voiceQueue.popNext(new Date().toISOString());
  return NextResponse.json({ item });
}
