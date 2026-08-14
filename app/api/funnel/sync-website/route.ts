import { NextResponse } from 'next/server';
import { parseInboxConfigs } from '@/lib/connectors/email';
import { fetchWebsiteFormLeads } from '@/lib/connectors/website-leads';
import { importWebsiteFormLeads } from '@/lib/funnel-website';
import { runtimeEnv } from '@/lib/creds';
import { getDb } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * POST — pull FormSubmit.co website-form notification emails from every
 * configured inbox and file them into the AAC pipeline (same code path as
 * the Website Pulse agent's Run button). Honest states: 200 with counts on
 * success, 200 {ok:false} when no inbox is configured, 502 on IMAP failure.
 * No new credentials needed — reuses the INBOX_1..4 slots Comms already
 * reads.
 */
export async function POST() {
  const env = runtimeEnv();
  if (parseInboxConfigs(env).length === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'No inboxes configured — set INBOX_1..4_HOST/_USER/_PASS in the environment (same inbox Comms already uses).',
    });
  }
  try {
    const leads = await fetchWebsiteFormLeads(env);
    const result = importWebsiteFormLeads(getDb(), leads, new Date());
    return NextResponse.json({ ok: true, leads: leads.length, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
