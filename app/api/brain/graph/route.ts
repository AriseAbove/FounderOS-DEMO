import { NextResponse } from 'next/server';
import { readStoreNotes } from '@/lib/brain';
import { buildBrainGraph } from '@/lib/brain-graph';
import { BrainGraphSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
  const graph = buildBrainGraph(readStoreNotes());
  return NextResponse.json(BrainGraphSchema.parse(graph));
}
