import { NextResponse } from 'next/server';
import { getBrainProvider } from '@/lib/brain';
import { BrainOverviewSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const overview = await getBrainProvider().overview();
  return NextResponse.json(BrainOverviewSchema.parse(overview));
}
