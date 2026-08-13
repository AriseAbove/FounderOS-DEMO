import { NextResponse } from 'next/server';
import { getDb } from '@/lib/data';
import { funnelSummary, splitFunnelJourneys } from '@/lib/funnel';
import { FunnelBusinessSchema, type FunnelBusiness } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('business');
  let business: FunnelBusiness | undefined;
  if (raw !== null) {
    const parsed = FunnelBusinessSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: `unknown business: ${raw}` }, { status: 400 });
    }
    business = parsed.data;
  }
  const now = new Date();
  // The funnel repo is the one source today — a live lead source (Allo call
  // log, a CRM) fills the same shape when it lands. Quiet >90d splits into
  // `archived`.
  const all = getDb().funnel.journeys(business);
  const { active, archived } = splitFunnelJourneys(all, now);
  return NextResponse.json({
    summary: funnelSummary(active),
    journeys: active,
    archived,
    source: 'db',
  });
}
