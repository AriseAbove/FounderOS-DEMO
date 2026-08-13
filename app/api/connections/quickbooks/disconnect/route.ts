import { NextResponse } from 'next/server';
import { QBO_REVOKE_URL } from '@/lib/connectors/quickbooks';
import { getDb } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** Revokes the stored refresh token with Intuit (best-effort) and always
    clears the local grant, so a failed revoke call never leaves a dead
    token looking "connected". */
export async function POST() {
  const db = getDb();
  const stored = db.quickbooksAuth.get();
  if (stored) {
    try {
      await fetch(QBO_REVOKE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.QUICKBOOKS_CLIENT_ID ?? ''}:${process.env.QUICKBOOKS_CLIENT_SECRET ?? ''}`,
          ).toString('base64')}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ token: stored.refreshToken }),
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      // best-effort — the local grant is cleared regardless below
    }
  }
  db.quickbooksAuth.clear();
  return NextResponse.json({ ok: true });
}
