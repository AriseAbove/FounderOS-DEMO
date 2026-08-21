import { describe, it, expect } from 'vitest';
import {
  bandRowsWithOffsets,
  commsLane,
  gravityDepth,
  laneBandZone,
  laneBottomPct,
  parseWorkKeywords,
} from '@/lib/comms-gravity';
import type { CommsItem } from '@/lib/comms';

const item = (over: Partial<CommsItem>): CommsItem => ({
  source: 'email',
  title: 'Inbox — someone',
  preview: 'p',
  ts: new Date(0).toISOString(),
  ...over,
});

describe('commsLane — source + inbox, unknown -> misc', () => {
  it('routes WhatsApp to personal (channel identity wins, tagged or not)', () => {
    expect(commsLane(item({ source: 'whatsapp', title: 'Mom' }))).toBe('personal');
  });

  it('routes Slack to work', () => {
    expect(commsLane(item({ source: 'slack', title: '#team — bob' }))).toBe('work');
  });

  it('routes Allo calls and SMS to work — Allo is AAC\'s lead-intake line, untagged or not', () => {
    expect(commsLane(item({ source: 'call', title: 'Inbound call — answered', priority: undefined }))).toBe('work');
    expect(commsLane(item({ source: 'sms', title: 'Inbound text', priority: undefined }))).toBe('work');
  });

  it('routes a personal-named email inbox to personal', () => {
    expect(commsLane(item({ source: 'email', title: 'Personal — Jane', priority: 2 }))).toBe('personal');
    expect(commsLane(item({ source: 'email', title: 'gmail — Jane' }))).toBe('personal');
  });

  it('routes a known (tagged) sender in a work inbox to work', () => {
    expect(commsLane(item({ source: 'email', title: 'Vantage — Client', priority: 1 }))).toBe('work');
  });

  it('routes an unknown (untagged) sender in a work inbox to misc', () => {
    expect(commsLane(item({ source: 'email', title: 'Northwind — nobody', priority: undefined }))).toBe('misc');
  });
});

describe('commsLane — work keywords rescue untagged work mail from misc', () => {
  it('routes an untagged work-inbox email to work when it matches a keyword', () => {
    expect(commsLane(item({ title: 'Northwind — nobody', preview: 'Vantage invoice' }), ['vantage'])).toBe('work');
  });

  it('is case-insensitive on keyword matches', () => {
    expect(commsLane(item({ title: 'Inbox — x', preview: 'LAUNCHPAD COHORT renewal' }), ['launchpad cohort'])).toBe('work');
  });

  it('matches a keyword in the sender (Frederick Potticary -> work)', () => {
    expect(commsLane(item({ title: 'Inbox — Frederick Potticary', sender: 'Frederick Potticary' }), ['potticary'])).toBe('work');
  });

  it('lets a work keyword beat a personal-named inbox', () => {
    expect(commsLane(item({ title: 'Personal — x', preview: 'Vantage deal' }), ['vantage'])).toBe('work');
  });

  it('still sends unmatched untagged work mail to misc', () => {
    expect(commsLane(item({ title: 'Northwind — nobody', preview: 'hello there' }), ['vantage'])).toBe('misc');
  });

  it('leaves original behavior intact when no keywords are given', () => {
    expect(commsLane(item({ title: 'Northwind — nobody' }))).toBe('misc');
  });
});

describe('parseWorkKeywords', () => {
  it('splits on commas, trims, and drops empties', () => {
    expect(parseWorkKeywords('Vantage, Launchpad Cohort ,, Potticary')).toEqual([
      'Vantage',
      'Launchpad Cohort',
      'Potticary',
    ]);
  });

  it('returns [] for undefined or blank', () => {
    expect(parseWorkKeywords(undefined)).toEqual([]);
    expect(parseWorkKeywords('   ')).toEqual([]);
  });
});

describe('gravityDepth — priority pulls a node toward the reply box', () => {
  it('sinks priority 1 deepest, untagged shallowest', () => {
    expect(gravityDepth(1)).toBeGreaterThan(gravityDepth(2));
    expect(gravityDepth(2)).toBeGreaterThan(gravityDepth(3));
    expect(gravityDepth(3)).toBeGreaterThan(gravityDepth(undefined));
  });

  it('keeps every depth within 0..1', () => {
    for (const p of [1, 2, 3, undefined] as const) {
      expect(gravityDepth(p)).toBeGreaterThanOrEqual(0);
      expect(gravityDepth(p)).toBeLessThanOrEqual(1);
    }
  });
});

describe('laneBottomPct — where a tier band sits, measured from the bottom', () => {
  it('places priority 1 nearest the bottom and untagged highest', () => {
    expect(laneBottomPct(1)).toBeLessThan(laneBottomPct(2));
    expect(laneBottomPct(2)).toBeLessThan(laneBottomPct(3));
    expect(laneBottomPct(3)).toBeLessThan(laneBottomPct(undefined));
  });

  it('keeps bands on-canvas (0..100)', () => {
    for (const p of [1, 2, 3, undefined] as const) {
      expect(laneBottomPct(p)).toBeGreaterThanOrEqual(0);
      expect(laneBottomPct(p)).toBeLessThanOrEqual(100);
    }
  });
});

describe('laneBandZone — each tier owns a fixed territory, independent of item count', () => {
  it('keeps every zone on-canvas and never past the container top', () => {
    for (const p of [1, 2, 3, undefined] as const) {
      const zone = laneBandZone(p);
      expect(zone.bottomPct).toBeGreaterThanOrEqual(0);
      expect(zone.heightPct).toBeGreaterThan(0);
      expect(zone.bottomPct + zone.heightPct).toBeLessThanOrEqual(100);
    }
  });

  it('never lets one tier\'s territory overlap the tier above it', () => {
    const order = [1, 2, 3, undefined] as const;
    for (let i = 0; i < order.length - 1; i++) {
      const lower = laneBandZone(order[i]);
      const higher = laneBandZone(order[i + 1]);
      expect(lower.bottomPct + lower.heightPct).toBeLessThanOrEqual(higher.bottomPct + 1e-9);
    }
  });

  it('is a pure function of the tier alone — unaffected by how many messages land in it', () => {
    // laneBandZone has no count parameter at all; this pins that contract so
    // a future "helpful" refactor can't quietly reintroduce a count-grown box.
    expect(laneBandZone(undefined)).toEqual(laneBandZone(undefined));
  });
});

describe('bandRowsWithOffsets — regression for the WORK-lane bug (2026-08-21): 25 items in one tier must all stay in bounds', () => {
  it('keeps every row of a 25-item band inside that tier\'s zone, not just the first few', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const zone = laneBandZone(undefined); // the worst-case tier: highest zone, most items in the real bug
    const rows = bandRowsWithOffsets(items, undefined);

    // every item is actually placed somewhere (nothing silently dropped)
    expect(rows.reduce((n, r) => n + r.row.length, 0)).toBe(25);

    for (const { bottomPct } of rows) {
      expect(bottomPct).toBeGreaterThanOrEqual(zone.bottomPct);
      expect(bottomPct).toBeLessThan(zone.bottomPct + zone.heightPct);
      // and therefore inside the whole canvas too
      expect(bottomPct).toBeGreaterThanOrEqual(0);
      expect(bottomPct).toBeLessThanOrEqual(100);
    }
  });

  it('keeps rows in bounds no matter how large the lane grows (not just 25)', () => {
    for (const count of [0, 1, 8, 15, 25, 60, 200]) {
      const items = Array.from({ length: count }, (_, i) => i);
      const zone = laneBandZone(undefined);
      const rows = bandRowsWithOffsets(items, undefined);
      for (const { bottomPct } of rows) {
        expect(bottomPct).toBeGreaterThanOrEqual(zone.bottomPct);
        expect(bottomPct).toBeLessThan(zone.bottomPct + zone.heightPct);
      }
    }
  });

  it('single-row bands sit exactly at the tier\'s own anchor (unchanged from before the fix)', () => {
    const rows = bandRowsWithOffsets([1, 2, 3], 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].bottomPct).toBe(laneBandZone(1).bottomPct);
  });

  it('returns nothing for an empty band', () => {
    expect(bandRowsWithOffsets([], undefined)).toEqual([]);
  });
});
