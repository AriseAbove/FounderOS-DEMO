import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { runtimeEnv } from '@/lib/creds';
import { BrainHealthTopFailureSchema } from '@/lib/schemas';
import { z } from 'zod';

// The health-report relay for the AAC Brain — Sean's separate Mac-based
// automation system (~/.aac_brain: lead follow-up drafting, ASC response
// drafting, the Phase 9 action queue, worker failure tracking). It is NOT
// the same thing as this repo's own /brain knowledge layer; see
// app/aac-brain/page.tsx's header comment for that distinction.
//
// stateio.py's heartbeat() on Sean's Mac POSTs a snapshot here every time it
// already pings its Healthchecks canary (BRAIN_PING_URL) — riding the same
// call sites, no new schedule to maintain. The dashboard tile and the
// /aac-brain detail page both read the latest snapshot straight from the DB
// via getDb().brainHealth.latest(), same as every other page in this repo —
// this GET only exists for external checkability (curl / a future poller),
// mirroring app/api/voice/queue's own auth pattern.
//
// Gated by AAC_BRAIN_SECRET the same way the Chief of Staff cron route is
// gated by CRON_SECRET and the voice relay is gated by VOICE_RELAY_SECRET —
// the caller here is a script on Sean's Mac, not a browser, so it sends
// `Authorization: Bearer <secret>` directly rather than doing an interactive
// Basic Auth challenge. Exempted from the app-wide Basic Auth wall in
// middleware.ts for the same reason.
export const dynamic = 'force-dynamic';

const IngestSchema = z.object({
  pendingActions: z.number().int().nonnegative(),
  failingWorkers: z.number().int().nonnegative(),
  totalWorkers: z.number().int().nonnegative(),
  topFailures: z.array(BrainHealthTopFailureSchema).max(20),
  lastDailySummaryDate: z.string().nullable().optional(),
  reportedAt: z.string(),
});

function checkAuth(req: Request): NextResponse | null {
  const secret = runtimeEnv().AAC_BRAIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          'AAC_BRAIN_SECRET not set — add it to .env.local (and the host env) and to ~/.aac_brain/.env on Sean\'s Mac to enable the AAC Brain health relay.',
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

  const body = await req.json().catch(() => null);
  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid snapshot', issues: parsed.error.issues }, { status: 400 });
  }

  const snapshot = parsed.data;
  getDb().brainHealth.upsert({
    id: 'aac_brain',
    pendingActions: snapshot.pendingActions,
    failingWorkers: snapshot.failingWorkers,
    totalWorkers: snapshot.totalWorkers,
    topFailures: snapshot.topFailures,
    lastDailySummaryDate: snapshot.lastDailySummaryDate ?? null,
    reportedAt: snapshot.reportedAt,
    receivedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  const snapshot = getDb().brainHealth.latest();
  return NextResponse.json({ snapshot });
}
