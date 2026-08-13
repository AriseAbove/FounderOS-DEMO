import { mergeFeed, type CommsItem } from '@/lib/comms';
import { latestEmails } from '@/lib/connectors/email';

/** Gather the unified comms feed from every source that is reachable.
 *  Email (IMAP) is the one message source today; calendar events render
 *  separately. New channels merge in here as their connectors land. */
export async function gatherCommsFeed(limit = 40): Promise<CommsItem[]> {
  const [email] = await Promise.allSettled([latestEmails(15)]);
  const items: CommsItem[] = [...(email.status === 'fulfilled' ? email.value : [])];
  return mergeFeed(items, limit);
}
