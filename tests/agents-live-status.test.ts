import { describe, expect, test } from 'vitest';
import { liveAgentStatus } from '@/lib/agents/live-status';
import type { ConnectorStatus } from '@/lib/connectors/types';

function conn(id: string, state: ConnectorStatus['state']): ConnectorStatus {
  return { id, name: id, kind: 'email', state, detail: '' };
}

describe('liveAgentStatus (honest, computed — never trusts the static seed value)', () => {
  test('an always-on agent (conductor) is active with zero connectors and no run history', () => {
    expect(liveAgentStatus('conductor', [], undefined, 'active')).toBe('active');
    expect(liveAgentStatus('conductor', [], undefined, 'planned')).toBe('active');
  });

  test('a connector-gated agent is planned when its connector is not configured', () => {
    expect(liveAgentStatus('gmail-worker', [conn('email', 'not_configured')], undefined, 'planned')).toBe('planned');
    expect(liveAgentStatus('gmail-worker', [], undefined, 'active')).toBe('planned');
  });

  test('a connector-gated agent is active the moment its connector reports connected', () => {
    expect(liveAgentStatus('gmail-worker', [conn('email', 'connected')], undefined, 'planned')).toBe('active');
  });

  test('a connector-gated agent in an error state stays planned, not active', () => {
    expect(liveAgentStatus('quickbooks-pulse', [conn('quickbooks', 'error')], undefined, 'planned')).toBe('planned');
  });

  test('comms-agent is active if EITHER email or calendar is connected', () => {
    const onlyCalendar = [conn('email', 'not_configured'), conn('calendar', 'connected')];
    expect(liveAgentStatus('comms-agent', onlyCalendar, undefined, 'planned')).toBe('active');
    const neither = [conn('email', 'not_configured'), conn('calendar', 'not_configured')];
    expect(liveAgentStatus('comms-agent', neither, undefined, 'active')).toBe('planned');
  });

  test('website-pulse rides the same email connector as gmail-worker (no separate creds)', () => {
    expect(liveAgentStatus('website-pulse', [conn('email', 'connected')], undefined, 'planned')).toBe('active');
    expect(liveAgentStatus('website-pulse', [conn('email', 'not_configured')], undefined, 'planned')).toBe('planned');
  });

  test('chief-of-staff (cross-cutting, no single connector) is judged by its last run', () => {
    expect(liveAgentStatus('chief-of-staff', [], { ok: true }, 'planned')).toBe('active');
    expect(liveAgentStatus('chief-of-staff', [], { ok: false }, 'planned')).toBe('planned');
    expect(liveAgentStatus('chief-of-staff', [], undefined, 'planned')).toBe('planned');
  });

  test('an unknown agent id is left exactly as authored — never guessed', () => {
    expect(liveAgentStatus('some-future-agent', [], undefined, 'planned')).toBe('planned');
    expect(liveAgentStatus('some-future-agent', [], undefined, 'active')).toBe('active');
  });

  test('data-agent is gated on the brain (Knowledge store) connector', () => {
    expect(liveAgentStatus('data-agent', [conn('brain', 'connected')], undefined, 'planned')).toBe('active');
    expect(liveAgentStatus('data-agent', [conn('brain', 'not_configured')], undefined, 'planned')).toBe('planned');
  });

  test('allo-pulse and social-pulse are gated on allo / oneup respectively', () => {
    expect(liveAgentStatus('allo-pulse', [conn('allo', 'connected')], undefined, 'planned')).toBe('active');
    expect(liveAgentStatus('social-pulse', [conn('oneup', 'connected')], undefined, 'planned')).toBe('active');
  });
});
