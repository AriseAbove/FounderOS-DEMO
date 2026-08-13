import { NextResponse } from 'next/server';
import { alloConfigured, fetchAlloCalls } from '@/lib/connectors/allo';
import { importAlloCalls } from '@/lib/funnel-allo';
import { runtimeEnv } from '@/lib/creds';
import { getDb } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * POST — pull the Allo call log and file inbound lead calls into the AAC
 * pipeline (same code path as the Allo Pulse agent's Run button). Honest
 * states: 200 with counts on success, 200 {ok:false} when the key isn't
 * configured, 502 when Allo itself errors.
 */
export async function POST() {
  const env = runtimeEnv();
  if (!alloConfigured(env)) {
    return NextResponse.json({
      ok: false,
      reason: 'ALLO_API_KEY not set — create a key in Allo (settings → API, Conversations Read scope) and add it to the environment.',
    });
  }
  try {
    const calls = await fetchAlloCalls(env);
    const result = importAlloCalls(getDb(), calls, new Date());
    return NextResponse.json({ ok: true, calls: calls.length, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
