import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { runtimeEnv } from '@/lib/creds';
import { createRuntime } from '@/lib/agents/runtime';
import { realAgents } from '@/lib/agents/real';

// Triggered externally (see .github/workflows/chief-of-staff-check.yml) —
// Railway's native Cron Jobs feature can't be used here because the
// FOUNDER_OS_DB volume can only mount to this one service, not a second
// scheduler service. A shared secret gates the route since it's public.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const env = runtimeEnv();
  const secret = env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not set — add it to .env.local (and the host env) to enable the scheduled Chief of Staff check.' },
      { status: 501 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const runtime = createRuntime(getDb(), realAgents);
  const run = await runtime.run('chief-of-staff');
  return NextResponse.json({ run });
}
