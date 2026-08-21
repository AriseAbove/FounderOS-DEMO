import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Regression for two real production disagreements on /comms:
 *   1. The page-header badge and CommsTabs' "N unread" both summed the
 *      `unread` flag over `gatherCommsFeed()` — a feed capped to the ~15
 *      most-recent envelopes per inbox — instead of the real IMAP unseen
 *      count, so "8 unread" on screen could be off from the real mailbox
 *      (1,572 unread) by orders of magnitude.
 *   2. The footer hardcoded the literal string "4 IMAP inboxes" while the
 *      Sources card above it, same page, computed the real configured count
 *      ("1 inbox" in production — only INBOX_1 is set).
 * Both numbers must now come from the one real `emailStatus()` result.
 */
describe('/comms unread + inbox-count honesty', () => {
  test('the page never sums feed.unread for a page-level total again', () => {
    const page = read('app/comms/page.tsx');
    expect(page).not.toMatch(/feed\.reduce\(\(sum, item\) => sum \+ \(item\.unread/);
    expect(page).toMatch(/email\.meta\?\.unread/);
  });

  test('the footer no longer hardcodes "4 IMAP inboxes" — it reads the real slot/configured counts', () => {
    const page = read('app/comms/page.tsx');
    expect(page).not.toMatch(/>\s*4 IMAP inboxes/);
    expect(page).toMatch(/email\.meta\?\.configured/);
    expect(page).toMatch(/email\.meta\?\.slots/);
  });

  test('CommsTabs takes the real total as a prop instead of re-deriving it from the capped feed', () => {
    const tabs = read('components/CommsTabs.tsx');
    expect(tabs).toMatch(/totalUnread: number/);
    expect(tabs).not.toMatch(/feed\.reduce\(\(sum, item\) => sum \+ \(item\.unread/);
  });

  test('the page passes totalUnread down to CommsTabs', () => {
    const page = read('app/comms/page.tsx');
    expect(page).toMatch(/<CommsTabs[\s\S]*?totalUnread=\{totalUnread\}/);
  });
});
