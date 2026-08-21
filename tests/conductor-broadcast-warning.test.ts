import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Real, verified footgun (2026-08-21 fix): lib/agents/runtime.ts's
 * broadcast() calls `agent.respond ? agent.respond(message) : agent.run()`
 * for every agent. Only data-agent implements respond() (lib/agents/real.ts)
 * — every other real agent falls back to its full run() the instant a
 * message reaches it via POST /api/agents/broadcast, with real side effects
 * (Allo Pulse pulls live calls, Gmail Worker polls real unread counts,
 * Social Pulse can PUBLISH queued posts to Instagram). ConductorCard.tsx (on
 * /org) is the only UI that actually calls broadcast() — ConductorChat.tsx
 * and AgentChat.tsx (on /agents) route through chatWithAgent/
 * routeConductorMessage instead, which never falls back to run(), so they
 * don't carry this risk and shouldn't claim to.
 */
describe('runtime.broadcast() really does fall back to run() for agents without respond()', () => {
  test('broadcast calls agent.respond ?? agent.run()', () => {
    const src = read('lib/agents/runtime.ts');
    expect(src).toMatch(/agent\.respond \? agent\.respond\(message\) : agent\.run\(\)/);
  });

  test('only data-agent implements respond() in the real roster', () => {
    const src = read('lib/agents/real.ts');
    const matches = src.match(/async respond\(message: string\)/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe('ConductorCard (the real broadcast UI on /org) carries a visible warning', () => {
  const src = read('components/ConductorCard.tsx');

  test('still posts to /api/agents/broadcast (the actual runtime.broadcast() path)', () => {
    expect(src).toMatch(/\/api\/agents\/broadcast/);
  });

  test('warns that sending can trigger real agent runs, not just a reply', () => {
    expect(src).toMatch(/real (job|run)/i);
    expect(src).toMatch(/broadcasts to every agent/i);
  });

  test('points to the side-effect-free alternative on /agents', () => {
    expect(src).toMatch(/\/agents/);
  });
});

describe('the safe per-agent chat path is untouched by the broadcast fallback', () => {
  test('chatWithAgent never falls back to agent.run()', () => {
    const src = read('lib/agents/chat.ts');
    expect(src).not.toMatch(/agent\.run\(\)/);
  });
});
