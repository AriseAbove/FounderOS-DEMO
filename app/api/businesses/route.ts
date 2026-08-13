import { NextResponse } from 'next/server';
import { BUSINESSES } from '@/lib/businesses';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ businesses: BUSINESSES });
}
