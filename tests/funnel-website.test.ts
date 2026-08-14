import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { importWebsiteFormLeads } from '@/lib/funnel-website';
import { importAlloCalls } from '@/lib/funnel-allo';
import type { WebsiteFormLead } from '@/lib/connectors/website-leads';
import type { AlloCall } from '@/lib/connectors/allo';

let db: FounderDb;
afterEach(() => db?.close());

const NOW = new Date('2026-08-13T12:00:00Z');

function lead(overrides: Partial<WebsiteFormLead> = {}): WebsiteFormLead {
  return {
    id: 'inbox-1-101',
    name: 'Jane Doe',
    phone: '3135550100',
    email: 'jane.doe@example.com',
    projectType: '203K Rehab',
    address: '123 Example St, Detroit, Michigan',
    timeline: 'ASAP – within 30 days',
    budget: '$100,000+',
    howFound: 'Referred by a friend or family',
    description: null,
    formSite: 'book.ariseaboveconstruction.com',
    receivedAt: '2026-08-11T14:40:32Z',
    ...overrides,
  };
}

function freshDb(): FounderDb {
  const d = openDb(':memory:');
  seedDatabase(d);
  return d;
}

describe('importWebsiteFormLeads', () => {
  test('a new website submission becomes an AAC journey at inquiry with an organic touch', () => {
    db = freshDb();
    const res = importWebsiteFormLeads(db, [lead()], NOW);
    expect(res.newContacts).toBe(1);
    expect(res.newTouches).toBe(1);

    const [j] = db.funnel.journeys('aac');
    expect(j.status).toBe('inquiry');
    expect(j.business).toBe('aac');
    expect(j.name).toBe('Jane Doe');
    expect(j.phone).toBe('3135550100');
    expect(j.email).toBe('jane.doe@example.com');
    expect(j.product).toBe('203K Rehab');
    expect(j.touches).toHaveLength(1);
    expect(j.touches[0]).toMatchObject({
      channel: 'organic',
      source: 'website',
      stage: 'inquiry',
      at: '2026-08-11',
    });
    expect(j.touches[0].label).toContain('Referred by a friend');
  });

  test('re-importing the same email id is a no-op — idempotent by message id', () => {
    db = freshDb();
    importWebsiteFormLeads(db, [lead()], NOW);
    const res = importWebsiteFormLeads(db, [lead()], NOW);
    expect(res.newContacts).toBe(0);
    expect(res.newTouches).toBe(0);
    expect(db.funnel.journeys('aac')[0].touches).toHaveLength(1);
  });

  test('a second submission from the same phone adds a touch, not a duplicate journey', () => {
    db = freshDb();
    importWebsiteFormLeads(db, [lead()], NOW);
    const res = importWebsiteFormLeads(
      db,
      [lead({ id: 'inbox-1-102', projectType: 'Kitchen', receivedAt: '2026-08-12T10:00:00Z' })],
      NOW,
    );
    expect(res.newContacts).toBe(0);
    expect(res.newTouches).toBe(1);
    const journeys = db.funnel.journeys('aac');
    expect(journeys).toHaveLength(1);
    expect(journeys[0].touches.map((t) => t.seq)).toEqual([1, 2]);
  });

  test('a submission with no phone or email is skipped, not filed as a dead lead', () => {
    db = freshDb();
    const res = importWebsiteFormLeads(db, [lead({ phone: null, email: null })], NOW);
    expect(res.skipped).toBe(1);
    expect(db.funnel.journeys('aac')).toHaveLength(0);
  });

  test('a website submission never regresses the journey stage', () => {
    db = freshDb();
    importWebsiteFormLeads(db, [lead()], NOW);
    const { touches: _touches, ...contact } = db.funnel.journeys('aac')[0];
    db.funnel.insertContact({ ...contact, status: 'estimate_sent' });
    importWebsiteFormLeads(db, [lead({ id: 'inbox-1-103', receivedAt: '2026-08-13T10:00:00Z' })], NOW);
    const after = db.funnel.journeys('aac')[0];
    expect(after.status).toBe('estimate_sent');
    expect(after.touches.at(-1)?.stage).toBe('estimate_sent');
  });

  test('falls back to the sync date when the lead has no timestamp', () => {
    db = freshDb();
    importWebsiteFormLeads(db, [lead({ receivedAt: '' })], NOW);
    expect(db.funnel.journeys('aac')[0].touches[0].at).toBe('2026-08-13');
  });

  test('a caller who ALSO fills out the website form merges onto the same journey by phone — identity, not a new lead', () => {
    db = freshDb();
    const call: AlloCall = {
      id: 'call-1',
      from: '+13135550100',
      to: '+12487171417',
      direction: 'inbound',
      result: 'answered',
      summary: 'Kitchen remodel inquiry.',
      contactName: null,
      durationSeconds: 120,
      startedAt: '2026-08-10T14:00:00Z',
      recordingUrl: null,
    };
    importAlloCalls(db, [call], NOW);
    expect(db.funnel.journeys('aac')).toHaveLength(1);

    const res = importWebsiteFormLeads(db, [lead({ phone: '3135550100' })], NOW);
    expect(res.newContacts).toBe(0); // merged onto the Allo-created journey, not a new one
    expect(res.newTouches).toBe(1);
    const journeys = db.funnel.journeys('aac');
    expect(journeys).toHaveLength(1);
    expect(journeys[0].touches).toHaveLength(2);
    expect(journeys[0].touches.map((t) => t.source)).toEqual(['allo', 'website']);
  });

  test('a lead matched only by email (no phone) still merges onto an existing journey', () => {
    db = freshDb();
    importWebsiteFormLeads(db, [lead({ id: 'a', phone: null })], NOW);
    const res = importWebsiteFormLeads(
      db,
      [lead({ id: 'b', phone: null, receivedAt: '2026-08-12T10:00:00Z' })],
      NOW,
    );
    expect(res.newContacts).toBe(0);
    expect(res.newTouches).toBe(1);
    expect(db.funnel.journeys('aac')).toHaveLength(1);
  });
});
