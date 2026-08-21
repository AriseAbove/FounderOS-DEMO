import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /brain layout contract (Alex, 2026-07-12): the capture box is ONE
 * compact untitled part riding the right of the G-BRAIN header — text or
 * dropped documents — and the knowledge graph sits directly under the title.
 */
describe('/brain header capture + graph placement', () => {
  test('the compact dump rides the header right slot; no standalone dump section', () => {
    const page = read('app/brain/page.tsx');
    expect(page).toMatch(/right=\{<BrainDump compact \/>\}/);
    expect(page).not.toMatch(/<section[^>]*>\s*<BrainDump \/>/);
  });

  test('the knowledge graph is the first section after the header', () => {
    const page = read('app/brain/page.tsx');
    const header = page.indexOf('<PageHeader');
    const graph = page.indexOf('Knowledge graph');
    const firstSection = page.indexOf('<section', header);
    expect(graph).toBeGreaterThan(header);
    // the first section on the page IS the graph section
    expect(page.indexOf('BrainGraphView', firstSection)).toBeLessThan(page.indexOf('</section>', firstSection));
  });

  test('BrainDump has a compact mode with document drop that reads files as text', () => {
    const dump = read('components/BrainDump.tsx');
    expect(dump).toMatch(/compact/);
    expect(dump).toMatch(/onDrop/);
    expect(dump).toMatch(/\.text\(\)/);
    // dropped docs keep their filename as the note title
    expect(dump).toMatch(/name\.replace/);
  });
});

/**
 * 2026-08-21 fix: a live QA pass on /brain found five internal
 * contradictions — copy and status chips on the same page disagreeing about
 * the same fact. These lock in the fixes so the page can't quietly drift
 * back to any of them.
 */
describe('/brain — five contradictions found in a live QA pass, fixed', () => {
  const page = read('app/brain/page.tsx');

  test('1. search-provider chips derive from real state — no fixed "hybrid"/"verified" claim independent of doctor.vector', () => {
    // fallbackActive must be driven by doctor.vector (real: "no vector
    // provider is wired anywhere"), not doctor.connected (a different fact:
    // "is the local grep store reachable"). The old `!doctor.connected`
    // conflated the two, so a healthy local store read as a working hybrid
    // backend.
    expect(page).toMatch(/fallbackActive = !doctor\.vector/);
    expect(page).not.toMatch(/fallbackActive = !doctor\.connected/);
    // the annotation no longer claims "hybrid search verified"
    expect(page).not.toMatch(/hybrid search<\/b>\s*\{doctor\.connected \? 'verified'/);
  });

  test('2. no hardcoded "supabase reachable"/paused claim tied to the local store\'s own connectivity', () => {
    expect(page).not.toMatch(/fallbackActive \? 'local fallback active' : 'supabase reachable'/);
  });

  test('3. the empty-runs state names the agent it is actually scoped to, not a bare "no agent runs"', () => {
    expect(page).not.toMatch(/'no agent runs yet'/);
    expect(page).toMatch(/data-agent has not run yet/);
  });

  test('4. the brain-store folder listing does not render a bare "tools" that collides with the tool-roster counts', () => {
    expect(page).toMatch(/FOLDER_DISPLAY_NAME/);
    expect(page).toMatch(/tools:\s*'tool docs'/);
  });

  test('5. a null health score can never render as "ok"/"all green" — summarizeDoctor is the single source of that word', () => {
    expect(page).toMatch(/summarizeDoctor/);
    // the old inline ternary that granted "all green" off connected+warnings
    // alone, with no regard for whether healthScore existed, must be gone
    expect(page).not.toMatch(/warnings\.length > 0 \? `\$\{warnings\.length\} warnings` : 'all green'/);
  });
});
