import { describe, expect, test } from 'vitest';
import {
  alloCallToCommsItem,
  alloCallsToCommsItems,
  alloMessageToCommsItem,
  alloMessagesToCommsItems,
} from '@/lib/comms-allo';
import type { AlloCall, AlloMessage } from '@/lib/connectors/allo';

const call = (over: Partial<AlloCall> = {}): AlloCall => ({
  id: 'cll-1',
  from: '+12485551234',
  to: '+12487171417',
  direction: 'inbound',
  result: 'ANSWERED',
  summary: 'Kitchen remodel inquiry — wants a walk-through next week.',
  contactName: 'Sarah Johnson',
  durationSeconds: 145,
  startedAt: '2026-08-12T14:03:00Z',
  recordingUrl: null,
  ...over,
});

const msg = (over: Partial<AlloMessage> = {}): AlloMessage => ({
  id: 'sms-1',
  from: '+12485559876',
  to: '+12487171417',
  direction: 'inbound',
  content: 'Can you call me back about the estimate?',
  contactName: null,
  startedAt: '2026-08-12T15:00:00Z',
  ...over,
});

describe('alloCallToCommsItem — the AI summary is the preview, not a placeholder', () => {
  test('maps a real call onto the CommsItem shape used by every other channel', () => {
    const item = alloCallToCommsItem(call())!;
    expect(item.source).toBe('call');
    expect(item.preview).toBe('Kitchen remodel inquiry — wants a walk-through next week.');
    expect(item.sender).toBe('Sarah Johnson');
    expect(item.ts).toBe('2026-08-12T14:03:00Z');
    expect(item.replyTo).toBe('tel:+12485551234');
    expect(item.account).toBe('allo');
  });

  test('direction and result are visible on the item — not silently dropped', () => {
    const inbound = alloCallToCommsItem(call({ direction: 'inbound', result: 'VOICEMAIL' }))!;
    expect(inbound.title.toLowerCase()).toContain('inbound');
    expect(inbound.title.toLowerCase()).toContain('voicemail');

    const outbound = alloCallToCommsItem(call({ direction: 'outbound', result: 'ANSWERED' }))!;
    expect(outbound.title.toLowerCase()).toContain('outbound');
  });

  test('falls back to a caller-less, summary-less honest label — never invents a name or note', () => {
    const item = alloCallToCommsItem(
      call({ contactName: null, from: '+12485551234', summary: null, durationSeconds: 8 }),
    )!;
    expect(item.sender).toBe('(248) 555-1234');
    expect(item.preview).toMatch(/no ai summary/i);
  });

  test('a call missing a caller number gets no callback link, rather than a broken tel:', () => {
    const item = alloCallToCommsItem(call({ from: null }))!;
    expect(item.replyTo).toBeUndefined();
  });

  test('returns null for a call with no usable timestamp (unrenderable in the feed)', () => {
    expect(alloCallToCommsItem(call({ startedAt: null }))).toBeNull();
  });

  test('alloCallsToCommsItems maps a whole page and drops unusable entries', () => {
    const items = alloCallsToCommsItems([call({ id: 'a' }), call({ id: 'b', startedAt: null })]);
    expect(items).toHaveLength(1);
  });
});

describe('alloMessageToCommsItem — SMS thread as a comms item', () => {
  test('maps SMS content as the preview, with an sms: callback link', () => {
    const item = alloMessageToCommsItem(msg())!;
    expect(item.source).toBe('sms');
    expect(item.preview).toBe('Can you call me back about the estimate?');
    expect(item.replyTo).toBe('sms:+12485559876');
    expect(item.account).toBe('allo');
  });

  test('falls back to a formatted phone number when Allo has no matched contact', () => {
    const item = alloMessageToCommsItem(msg({ contactName: null }))!;
    expect(item.sender).toBe('(248) 555-9876');
  });

  test('returns null for a message with no usable timestamp', () => {
    expect(alloMessageToCommsItem(msg({ startedAt: null }))).toBeNull();
  });

  test('alloMessagesToCommsItems maps a whole page and drops unusable entries', () => {
    const items = alloMessagesToCommsItems([msg({ id: 'a' }), msg({ id: 'b', startedAt: null })]);
    expect(items).toHaveLength(1);
  });
});
