import { describe, expect, test } from 'vitest';
import { LIFE_AREAS } from '@/lib/life-map';
import {
  BUSINESSES,
  businessAgentSet,
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
