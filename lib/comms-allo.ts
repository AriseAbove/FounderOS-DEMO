import type { CommsItem } from '@/lib/comms';
import type { AlloCall, AlloMessage } from '@/lib/connectors/allo';

/**
 * Allo calls and SMS, mapped onto the same CommsItem shape every other
 * /comms channel uses — the point of this module is that a call sorts,
 * triages, and displays exactly like an email or a Slack DM, not off to the
 * side in a second list.
 *
 * A US 10-digit number formats for display when there's no Allo-matched
 * contact name; anything that isn't cleanly 10 digits (a partial number,
 * an international number, or nothing at all) is shown as-is or as
 * "Unknown caller"/"Unknown sender" rather than guessed at — honest over
 * pretty.
 */

function formatPhoneForDisplay(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * One Allo call → one CommsItem. Zoey's AI summary is the preview text (the
 * whole reason this channel is worth surfacing — Sean can read what the call
 * was about without opening /funnel or the recording). Direction and result
 * get folded into the title since CommsItem has no separate metadata field.
 * `replyTo` is a `tel:` link when there's a real callback number — the only
 * honest "reply" action for a phone call. Returns null for a call with no
 * usable timestamp (unrenderable — mergeFeed would drop it anyway).
 */
export function alloCallToCommsItem(call: AlloCall): CommsItem | null {
  if (!call.startedAt) return null;

  const directionLabel = call.direction === 'outbound' ? 'Outbound call' : 'Inbound call';
  const resultLabel = call.result ? call.result.toLowerCase() : 'no result recorded';
  const sender = call.contactName ?? formatPhoneForDisplay(call.from) ?? 'Unknown caller';
  const preview =
    call.summary ??
    (call.durationSeconds != null
      ? `${call.durationSeconds}s call — no AI summary yet`
      : 'No summary available');

  return {
    source: 'call',
    title: `${directionLabel} — ${resultLabel}`,
    sender,
    preview,
    ts: call.startedAt,
    replyTo: call.from ? `tel:${call.from}` : undefined,
    account: 'allo',
  };
}

export function alloCallsToCommsItems(calls: AlloCall[]): CommsItem[] {
  return calls.map(alloCallToCommsItem).filter((i): i is CommsItem => i !== null);
}

/**
 * One Allo SMS → one CommsItem. The message body is the preview; `replyTo`
 * is an `sms:` link so a reply opens the phone's real text composer instead
 * of pretending this app can send SMS on Sean's behalf (Allo's send-SMS API
 * exists but wiring outbound send is out of scope here — see /comms).
 */
export function alloMessageToCommsItem(msg: AlloMessage): CommsItem | null {
  if (!msg.startedAt) return null;

  const directionLabel = msg.direction === 'outbound' ? 'Outbound text' : 'Inbound text';
  const sender = msg.contactName ?? formatPhoneForDisplay(msg.from) ?? 'Unknown sender';

  return {
    source: 'sms',
    title: directionLabel,
    sender,
    preview: msg.content ?? '(no message content)',
    ts: msg.startedAt,
    replyTo: msg.from ? `sms:${msg.from}` : undefined,
    account: 'allo',
  };
}

export function alloMessagesToCommsItems(messages: AlloMessage[]): CommsItem[] {
  return messages.map(alloMessageToCommsItem).filter((i): i is CommsItem => i !== null);
}
