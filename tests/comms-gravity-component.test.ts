import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * CommsGravity WORK-lane overflow fix (2026-08-21): a lane's busiest priority
 * tier used to be a single flex-wrap box anchored only by `bottom: X%`, with
 * the box's own height left to grow unbounded with the row count — so a
 * 25-item WORK lane pushed 12 nodes above the container's top edge, clipped
 * invisible and unclickable by the lane's `overflow-hidden` (only 13 of the
 * 25 nodes the header genuinely counted were ever reachable). Fixed by
 * routing every tier's nodes through `bandRowsWithOffsets`
 * (`lib/comms-gravity.ts`), which packs a tier's items into fixed-width rows
 * and places each row inside that tier's fixed `laneBandZone` territory —
 * row pitch shrinks as the tier grows, so however many nodes land in it, none
 * can be positioned outside `[0, 100]`. See tests/comms-gravity.test.ts for
 * the layout-math regression coverage (25-item and stress-count cases).
 */
describe('CommsGravity renders every tier through the bounded row-packer, not an unbounded wrap', () => {
  const src = read('components/CommsGravity.tsx');

  test('imports the bounded row-packer from lib/comms-gravity', () => {
    expect(src).toMatch(/import\s*\{[^}]*bandRowsWithOffsets[^}]*\}\s*from\s*['"]@\/lib\/comms-gravity['"]/);
  });

  test('positions rows via bandRowsWithOffsets, not the raw laneBottomPct anchor a whole band used to grow from', () => {
    expect(src).toMatch(/bandRowsWithOffsets\(/);
    // the old bug: a single box per tier anchored by `bottom: ${laneBottomPct(tier)}%`
    // with flex-wrap left to grow it unbounded — that call must be gone.
    expect(src).not.toMatch(/laneBottomPct/);
  });

  test('no longer relies on unbounded flex-wrap to fit a tier\'s nodes', () => {
    // the old bug: one box per tier let flex-wrap grow it past the container;
    // rows are now pre-chunked in lib/comms-gravity.ts instead, so no node
    // row div should still wrap.
    expect(src).not.toMatch(/flex-wrap items-end/);
  });
});
