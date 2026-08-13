import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmailReply } from '@/lib/connectors/email';

export const dynamic = 'force-dynamic';

/**
 * Replies the server can actually deliver. Email sends for real over SMTP
 * using the originating inbox's credentials. A non-ok result is honest (502)
 * so the UI can fall back to a mailto: draft.
 */
const ReplySchema = z.object({
  source: z.literal('email'),
  account: z.string().optional(),
  to: z.string().email(),
  subject: z.string().max(300).optional(),
  text: z.string().min(1).max(20000),
});

export async function POST(request: Request) {
  const parsed = ReplySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await sendEmailReply({
    accountId: parsed.data.account,
    to: parsed.data.to,
    subject: parsed.data.subject ?? '(no subject)',
    text: parsed.data.text,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
