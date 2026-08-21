import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * FunnelSpace hub-geometry contract (2026-08-21 fix): the flow canvas
 * imported FUNNEL_STAGES (AAC's 8-stage backbone) at module scope and built
 * every hub position, hub count, and hub label off it unconditionally — the
 * component had no way to know a journey belonged to Apps' 6-stage pipeline
 * instead. Fixed by threading a `stages` prop through the geometry instead
 * of the static import, and by rendering the real (possibly all-zero) hub
 * row even when there are no journeys yet, instead of swapping the whole
 * canvas for a stage-less "No journeys" message that erases which pipeline
 * is even being looked at.
 */
describe('FunnelSpace renders the real stage set it is given, not always AAC\'s', () => {
  const src = read('components/FunnelSpace.tsx');

  test('accepts a stages prop instead of hardcoding the AAC import for hub geometry', () => {
    expect(src).toMatch(/stages\s*[:=][^,}]*(FunnelStage|FUNNEL_STAGES)/);
  });

  test('the hub row is built from the stages prop, not the static FUNNEL_STAGES import', () => {
    // the render loop over section hubs must map the prop, not the AAC-only const
    expect(src).toMatch(/\{stages\.map\(/);
  });

  test('an honestly-empty business (0 journeys) still shows its own hub row instead of a stage-less blank message', () => {
    // no early `if (nodes.length === 0) return <p>...` that replaces the whole canvas
    expect(src).not.toMatch(/if\s*\(\s*nodes\.length\s*===\s*0\s*\)\s*\{\s*return\s*<p/);
  });
});
