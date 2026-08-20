import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  NAV_OPERATE,
  NAV_AGENTS,
  NAV_INTELLIGENCE,
  NAV_MARKETING,
  NAV_SYSTEM,
  NAV_LIBRARY,
  NAV_ORDER,
  DIGIT_VIEWS,
} from '@/lib/nav';

describe('shared nav config', () => {
  test('NAV_ORDER is the visible order: Operate → Agents → Intelligence → Marketing → System → Variants', () => {
    expect(NAV_ORDER).toEqual(
      [...NAV_OPERATE, ...NAV_AGENTS, ...NAV_INTELLIGENCE, ...NAV_MARKETING, ...NAV_SYSTEM, ...NAV_LIBRARY].map(
        (n) => n.href,
      ),
    );
  });

  test('Marketing group holds Social, Content, and Personas — surfaced now that OneUp is live', () => {
    expect(NAV_MARKETING.map((n) => n.href)).toEqual(['/social', '/content', '/personas']);
  });

  test('Agents group holds the roster and the org chart', () => {
    expect(NAV_AGENTS.map((n) => n.href)).toEqual(['/agents', '/sops', '/tasks', '/skills', '/org']);
  });

  test('Intelligence group holds G-Brain and the AAC Brain health page', () => {
    expect(NAV_INTELLIGENCE.map((n) => n.href)).toEqual(['/brain', '/aac-brain']);
  });

  test('Finances lives in Operate; Agents, Org Chart, and G-Brain moved to their own groups', () => {
    const hrefs = NAV_OPERATE.map((n) => n.href);
    expect(hrefs).toContain('/finances');
    expect(hrefs).not.toContain('/agents');
    expect(hrefs).not.toContain('/org');
    expect(hrefs).not.toContain('/brain');
  });

  test('digit shortcuts (1–9) map to the first 9 views in visible order', () => {
    expect(DIGIT_VIEWS).toEqual(NAV_ORDER.slice(0, 9));
    expect(DIGIT_VIEWS).toHaveLength(9);
  });

  test('every digit target is a real page route', () => {
    for (const href of DIGIT_VIEWS) {
      const rel = href === '/' ? 'app/page.tsx' : `app/${href.replace(/^\//, '')}/page.tsx`;
      expect(existsSync(path.join(process.cwd(), rel)), `${href} should have a page.tsx`).toBe(true);
    }
  });

  test('regression: Finances stays digit-reachable; Marketing group sits past the first 9', () => {
    expect(DIGIT_VIEWS, '/finances must be reachable by digit').toContain('/finances');
    // Social/Content/Personas are visible in nav (Marketing group) but land
    // after Operate + Agents fill the first 9 digit slots — not a hidden
    // state, just where they fall in visible order.
    for (const href of ['/social', '/content', '/personas']) {
      expect(DIGIT_VIEWS).not.toContain(href);
      expect(NAV_ORDER).toContain(href);
    }
  });

  test('Funnel sits right after Comms', () => {
    const hrefs = NAV_OPERATE.map((n) => n.href);
    expect(hrefs.indexOf('/funnel')).toBe(hrefs.indexOf('/comms') + 1);
  });

  test('CommandPalette consumes the shared DIGIT_VIEWS (no private stale copy)', () => {
    const src = readFileSync(path.join(process.cwd(), 'components', 'CommandPalette.tsx'), 'utf8');
    expect(src).toMatch(/from '@\/lib\/nav'/);
    expect(src).not.toMatch(/const DIGIT_VIEWS\s*=/); // must import, not redefine
  });
});
