import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /funnel business-lens contract (2026-08-21 fix): switching to APPS used to
 * still drive both canvases (flow + radial) off AAC_FUNNEL_STAGES — the
 * summary/space/radial models all defaulted to the AAC backbone regardless
 * of which business tab was selected. Apps has zero live journeys today, so
 * this was invisible (empty nodes short-circuited before any hub rendered),
 * but the model was wrong the moment a real Apps journey landed. Fixed by
 * threading `stagesFor(business)` through every model call on the page.
 */
describe('/funnel wires the selected business into every stage model', () => {
  const page = read('app/funnel/page.tsx');

  test('funnelSummary is scoped to the selected business, not left on the AAC default', () => {
    expect(page).toMatch(/funnelSummary\(\s*journeys\s*,\s*stagesFor\(business\)\s*\)/);
  });

  test('funnelSpaceModel (the flow canvas) is scoped to the selected business', () => {
    expect(page).toMatch(/funnelSpaceModel\(\s*journeys\s*,\s*now\s*,\s*stagesFor\(business\)\s*\)/);
  });

  test("the flow canvas receives the real stage set as a prop, not FunnelSpace's AAC-only default", () => {
    expect(page).toMatch(/<FunnelSpaceLazy[^>]*stages=\{stagesFor\(business\)\}/);
  });

  test('radial stays AAC-only — Apps has no acquisition-wedge data to render, so the toggle is disabled for it rather than mislabeling', () => {
    // the layout is forced off radial when Apps is selected, whatever the ?layout= param says
    expect(page).toMatch(/business === 'apps'[^;]*\?\s*'flow'/);
  });
});
