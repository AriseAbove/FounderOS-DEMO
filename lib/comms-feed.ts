import { mergeFeed, type CommsItem } from '@/lib/comms';
import { alloCallsToCommsItems, alloMessagesToCommsItems } from '@/lib/comms-allo';
import { alloConfigured, fetchAlloCalls, fetchAlloMessages } from '@/lib/connectors/allo';
import { latestEmails } from '@/lib/connectors/email';

/**
 * Gather the unified comms feed from every source that is reachable. Email
 * (IMAP) and Allo (calls + SMS, AAC's actual primary lead-intake line) are
 * the message sources today; calendar events render separately. New
 * channels merge in here as their connectors land.
 *
 * `env`/`fetchImpl` are injectable (default to the real `process.env`/
 * `fetch`) purely for tests — every real caller just calls
 * `gatherCommsFeed()`. Allo isn't pulled at all when `ALLO_API_KEY` isn't
 * set (honest not_configured, not a failed fetch), and any pull that does
 * fail degrades to "no items from that source" via `Promise.allSettled` —
 * same honest-empty pattern email already uses, never a thrown error that
 * would take the whole feed down.
 */
export async function gatherCommsFeed(
  limit = 40,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<CommsItem[]> {
  const pullAllo = alloConfigured(env);
  const [email, calls, sms] = await Promise.allSettled([
    latestEmails(15, env),
    pullAllo ? fetchAlloCalls(env, fetchImpl) : Promise.resolve([]),
    pullAllo ? fetchAlloMessages(env, fetchImpl) : Promise.resolve([]),
  ]);
  const items: CommsItem[] = [
    ...(email.status === 'fulfilled' ? email.value : []),
    ...(calls.status === 'fulfilled' ? alloCallsToCommsItems(calls.value) : []),
    ...(sms.status === 'fulfilled' ? alloMessagesToCommsItems(sms.value) : []),
  ];
  return mergeFeed(items, limit);
}
