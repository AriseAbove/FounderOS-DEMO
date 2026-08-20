import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KEY_SLOTS, listKeyStatuses, upsertEnvLocal } from '@/lib/keys';
import { envLocalPath } from '@/lib/creds';

export const dynamic = 'force-dynamic';

// 2026-08-20: was a hardcoded process.cwd()/.env.local here, independent of
// lib/creds.ts's envLocalPath() (which honors the FOUNDER_OS_ENV_LOCAL override
// used to point at Railway's mounted volume). That meant this route could never
// be redirected off the container's ephemeral filesystem even after the env var
// was set -- keys saved here would silently vanish on every redeploy. Found by
// today's 3-agent system audit; still needs FOUNDER_OS_ENV_LOCAL actually set on
// Railway (pointing inside the mounted volume, alongside FOUNDER_OS_DB) for this
// fix to take effect in production.
const ENV_LOCAL = envLocalPath();

export async function GET() {
  // masked statuses only — raw values never cross this boundary
  return NextResponse.json({ keys: listKeyStatuses() });
}

const SetKeySchema = z.object({
  envVar: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string().min(1).max(4096),
});

export async function POST(request: Request) {
  const parsed = SetKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { envVar, value } = parsed.data;
  if (!KEY_SLOTS.some((s) => s.envVar === envVar)) {
    return NextResponse.json({ error: `unknown key slot: ${envVar}` }, { status: 400 });
  }
  upsertEnvLocal(ENV_LOCAL, envVar, value);
  process.env[envVar] = value; // live immediately; .env.local persists across restarts
  return NextResponse.json({ ok: true, envVar });
}
