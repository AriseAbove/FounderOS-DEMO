import { describe, expect, test } from 'vitest';
import { LIFE_AREAS } from '@/lib/life-map';
import {
  BUSINESSES,
  businessAgentSet,
  businessAreaAgents,
  businessesForAgent,
  getBusiness,
} from '@/lib/businesses';

import { realAgents } from '@/lib/agents/real';

const KNOWN_AGENTS = new Set(realAgents.map((a) => a.id));

describe('BUSINESSES', () => {
  test("Sean's two businesses, each with a distinct color and brain tag", () => {
    expect(BUSINESSES.map((b) => b.id)).toEqual(['aac', 'apps']);
    expect(new Set(BUSINESSES.map((b) => b.color)).size).toBe(2);
    expect(new Set(BUSINESSES.map((b) => b.brainTag)).size).toBe(2);
    for (const b of BUSINESSES) {
      expect(b.focus.length).toBeGreaterThan(0); // executive task list
      expect(b.detail.length).toBeGreaterThan(0);
    }
  });

  test('business colors match the AAC brand palette', () => {
    const byId = new Map(BUSINESSES.map((b) => [b.id, b]));
    expect(byId.get('aac')?.color).toBe('#191265'); // AAC navy
    expect(byId.get('apps')?.color).toBe('#C9A84C'); // AAC gold
  });

  test('business colors do not collide with life-area colors', () => {
    const areaColors = new Set(LIFE_AREAS.map((a) => a.color));
    for (const b of BUSINESSES) expect(areaColors.has(b.color)).toBe(false);
  });

  test('every areaAgents key is a real life area; every agent id is real', () => {
    const areaIds = new Set(LIFE_AREAS.map((a) => a.id));
    for (const b of BUSINESSES) {
      for (const [areaId, agents] of Object.entries(b.areaAgents)) {
        expect(areaIds.has(areaId), `unknown area ${areaId} in ${b.id}`).toBe(true);
        for (const id of agents) {
          expect(KNOWN_AGENTS.has(id), `unknown agent ${id} in ${b.id}/${areaId}`).toBe(true);
        }
      }
    }
  });
});

describe('AAC gets its own real crew, not just the shared infra (2026-08-21 fix)', () => {
  // Before this fix, aac.areaAgents === apps.areaAgents (both shared-only) —
  // an equally-sparse roster on both lenses, even though comms-agent,
  // gmail-worker, calendar-worker, quickbooks-pulse, allo-pulse, and
  // website-pulse are all demonstrably AAC-only in their own seed
  // descriptions (real inbox, real QuickBooks books, "the AAC pipeline").
  // None of that is invented — it was just never wired into the business
  // lens. Apps genuinely has no equivalent yet, so its roster stays shared-only.
  test('sales: the real AAC-pipeline lead-intake agents', () => {
    const agents = businessAreaAgents('aac', 'sales');
    expect(agents).toContain('allo-pulse');
    expect(agents).toContain('website-pulse');
  });

  test('finances: the real QuickBooks monitor', () => {
    expect(businessAreaAgents('aac', 'finances')).toContain('quickbooks-pulse');
  });

  test('communication: the real inbox + calendar crew', () => {
    const agents = businessAreaAgents('aac', 'communication');
    expect(agents).toContain('comms-agent');
    expect(agents).toContain('gmail-worker');
    expect(agents).toContain('calendar-worker');
  });

  test('none of AAC-only agents leak onto Apps — Apps stays honestly shared-only', () => {
    const appsSet = businessAgentSet('apps');
    for (const id of ['allo-pulse', 'website-pulse', 'quickbooks-pulse', 'comms-agent', 'gmail-worker', 'calendar-worker']) {
      expect(appsSet.has(id), `${id} should not be assigned to apps — no real Apps data backs it`).toBe(false);
    }
  });

  test('businessesForAgent: allo-pulse serves AAC only, not Apps', () => {
    expect(businessesForAgent('allo-pulse').map((b) => b.id)).toEqual(['aac']);
  });

  test("Apps' executive focus is honest about why its roster is thin", () => {
    const apps = getBusiness('apps')!;
    const focusText = apps.focus.join(' ').toLowerCase();
    expect(focusText).toMatch(/single.operator|solo|no dedicated/);
  });
});

describe('lookups', () => {
  test('getBusiness resolves by id and returns null for unknowns', () => {
    expect(getBusiness('aac')?.label).toBe('Arise Above Construction');
    expect(getBusiness('nope')).toBeNull();
  });

  test('businessAgentSet unions all areas for a business', () => {
    const set = businessAgentSet('aac');
    const aac = getBusiness('aac')!;
    for (const agents of Object.values(aac.areaAgents)) {
      for (const id of agents) expect(set.has(id)).toBe(true);
    }
  });

  test('businessesForAgent reverse lookup: shared infra agents serve both businesses', () => {
    expect(businessesForAgent('conductor').map((b) => b.id)).toEqual(['aac', 'apps']);
  });
});
