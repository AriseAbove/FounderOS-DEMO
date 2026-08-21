import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * /comms unified the email + calendar sources into an honest connector-status
 * pattern (Sources card, "N/M connected" count, footer status line) but never
 * accounted for Allo — the phone channel that's actually AAC's primary
 * lead-intake line. This is the regression guard for that: the page must read
 * Allo's real ConnectorStatus, the same honest connected/not_configured
 * pattern used for email and calendar, never a hardcoded claim either way.
 */
describe('/comms — Allo call-channel status is honest, not hardcoded', () => {
  test('the page imports and reads the real Allo connector status', () => {
    const page = read('app/comms/page.tsx');
    expect(page).toMatch(/alloStatus/);
    expect(page).toMatch(/from ['"]@\/lib\/connectors\/allo['"]/);
  });

  test('the footer reflects the real Allo state, not a hardcoded "connected"', () => {
    const page = read('app/comms/page.tsx');
    // must branch on the live state, never print a bare literal "connected"
    // for Allo unconditionally
    expect(page).not.toMatch(/Allo calls connected —/);
    expect(page).toMatch(/allo\.state/);
  });

  test('gatherCommsFeed pulls Allo calls and SMS alongside email', () => {
    const feed = read('lib/comms-feed.ts');
    expect(feed).toMatch(/fetchAlloCalls/);
    expect(feed).toMatch(/fetchAlloMessages/);
    expect(feed).toMatch(/alloConfigured/);
  });
});
