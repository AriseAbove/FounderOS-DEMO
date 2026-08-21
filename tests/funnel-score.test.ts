import { describe, expect, test } from 'vitest';
import { scoreFromTouches, REPEAT_CALLER_TOUCHES, SHORT_CALL_SECONDS, SUSTAINED_CALL_SECONDS } from '@/lib/funnel-score';
import type { FunnelTouch } from '@/lib/schemas';

/**
 * Before this fix, every Allo-imported lead was hardcoded to
 * relationship: 'warm', likelihood: 50 at creation (lib/funnel-allo.ts) and
 * never touched again — so a number that called 30+ times scored exactly
 * the same as a single real inquiry. These tests pin the honest,
 * differentiated behavior that replaces it.
 */

let seq = 0;
function callTouch(over: Partial<FunnelTouch> = {}): FunnelTouch {
  seq += 1;
  return {
    id: `t-${seq}`,
    contactId: 'c-1',
    seq,
    stage: 'inquiry',
    channel: 'call',
    label: 'Inbound call',
    source: 'allo',
    at: '2026-08-10',
    durationSeconds: null,
    ...over,
  };
}

describe('scoreFromTouches — honest, differentiated lead scoring from real call signal', () => {
  test('no touches at all: neutral default, nothing to score on', () => {
    expect(scoreFromTouches([])).toEqual({ relationship: 'warm', likelihood: 50 });
  });

  test('a single call with no duration data on record: neutral default (no signal to differentiate)', () => {
    expect(scoreFromTouches([callTouch()])).toEqual({ relationship: 'warm', likelihood: 50 });
  });

  test('a single, real, substantial call: scored above neutral', () => {
    const score = scoreFromTouches([callTouch({ durationSeconds: SUSTAINED_CALL_SECONDS })]);
    expect(score.relationship).toBe('warm');
    expect(score.likelihood).toBeGreaterThan(50);
  });

  test('a single instant hang-up: scored below neutral', () => {
    const score = scoreFromTouches([callTouch({ durationSeconds: SHORT_CALL_SECONDS - 1 })]);
    expect(score.relationship).toBe('cold');
    expect(score.likelihood).toBeLessThan(50);
  });

  test('repeat calls that are genuinely long: scored hot — sustained real interest', () => {
    const touches = [
      callTouch({ durationSeconds: SUSTAINED_CALL_SECONDS + 30 }),
      callTouch({ durationSeconds: SUSTAINED_CALL_SECONDS + 10 }),
    ];
    const score = scoreFromTouches(touches);
    expect(score.relationship).toBe('hot');
    expect(score.likelihood).toBeGreaterThanOrEqual(70);
  });

  test('30+ short calls from one number: scored cold, not warm — the exact bug this fixes', () => {
    const touches = Array.from({ length: 32 }, () => callTouch({ durationSeconds: 5 }));
    const score = scoreFromTouches(touches);
    expect(score.relationship).toBe('cold');
    expect(score.likelihood).toBeLessThan(20);
  });

  test('30+ calls with NO duration data (legacy import): still reads as noise, not extra interest', () => {
    const touches = Array.from({ length: REPEAT_CALLER_TOUCHES + 5 }, () => callTouch());
    const score = scoreFromTouches(touches);
    expect(score.relationship).toBe('cold');
  });

  test('30+ calls that are genuinely long: high volume alone does not override real sustained conversations', () => {
    const touches = Array.from({ length: 32 }, () => callTouch({ durationSeconds: SUSTAINED_CALL_SECONDS + 20 }));
    const score = scoreFromTouches(touches);
    expect(score.relationship).toBe('hot');
  });

  test('non-call touches (e.g. a website form) carry no call signal: neutral default', () => {
    const score = scoreFromTouches([callTouch({ channel: 'organic', durationSeconds: null })]);
    expect(score).toEqual({ relationship: 'warm', likelihood: 50 });
  });

  test('likelihood always stays inside 0..100', () => {
    for (const touches of [[], [callTouch()], Array.from({ length: 50 }, () => callTouch({ durationSeconds: 3 }))]) {
      const { likelihood } = scoreFromTouches(touches);
      expect(likelihood).toBeGreaterThanOrEqual(0);
      expect(likelihood).toBeLessThanOrEqual(100);
    }
  });
});
