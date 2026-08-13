import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ingestBrainDump } from '@/lib/brain-dump';

export const dynamic = 'force-dynamic';

const DumpSchema = z.object({
  text: z.string().min(1),
  title: z.string().optional(),
  folder: z.string().regex(/^[a-z0-9-]+$/i),
  tags: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  const parsed = DumpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    // Local markdown write only — no embed hook is wired yet.
    const result = await ingestBrainDump(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'write failed' },
      { status: 500 },
    );
  }
}
