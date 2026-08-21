import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { contentAgents, contentPipelineStatus } from '@/lib/content';
import { liveAgentStatus } from '@/lib/agents/live-status';
import type { ConnectorStatus } from '@/lib/connectors/types';
import type { SocialPost } from '@/lib/schemas';

let db: FounderDb;
afterEach(() => db?.close());

describe('contentAgents', () => {
  test('only the content pillar — excludes other departments', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const crew = contentAgents(db.agents.all());
    expect(crew.every((a) => a.departmentId === 'dept-marketing-growth')).toBe(true);
    expect(crew.map((a) => a.id)).not.toContain('data-agent');
  });

  test('deterministic, and includes the real Social Pulse publisher', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const a = contentAgents(db.agents.all()).map((x) => x.id);
    const b = contentAgents(db.agents.all()).map((x) => x.id);
    expect(a).toEqual(b);
    // The purge removed the demo's fictional content crew; social-pulse
    // (a real OneUp publisher, not a larp) is the first real member.
    expect(a).toEqual(['social-pulse']);
  });
});

describe('content page status must be computed live (never the stale seed value)', () => {
  // Reproduces the app/content/page.tsx pipeline: seed agents -> liveAgentStatus
  // (same rule Home and /agents already apply) -> contentAgents. Before this
  // fix, /content rendered db.agents.all() unmodified, so Social Pulse showed
  // its seed-time 'planned' status forever, even once ONEUP_API_KEY was set
  // and /integrations correctly reported OneUp as connected.
  function liveCrew(connections: ConnectorStatus[]) {
    db = openDb(':memory:');
    seedDatabase(db);
    const liveAgents = db.agents.all().map((a) => ({
      ...a,
      status: liveAgentStatus(a.id, connections, db.agentRuns.byAgent(a.id)[0], a.status),
    }));
    return contentAgents(liveAgents);
  }

  test('social-pulse stays "planned" while OneUp is not configured — matches seed default', () => {
    const crew = liveCrew([{ id: 'oneup', name: 'OneUp', kind: 'social', state: 'not_configured', detail: '' }]);
    expect(crew.find((a) => a.id === 'social-pulse')?.status).toBe('planned');
  });

  test('social-pulse flips to "active" the moment OneUp reports connected — matches /integrations', () => {
    const crew = liveCrew([{ id: 'oneup', name: 'OneUp', kind: 'social', state: 'connected', detail: '' }]);
    expect(crew.find((a) => a.id === 'social-pulse')?.status).toBe('active');
  });

  test('social-pulse stays "planned" on an OneUp error, not a false "active"', () => {
    const crew = liveCrew([{ id: 'oneup', name: 'OneUp', kind: 'social', state: 'error', detail: 'boom' }]);
    expect(crew.find((a) => a.id === 'social-pulse')?.status).toBe('planned');
  });
});

describe('contentPipelineStatus — /content pipeline must agree with the same OneUp connector /social and /integrations read', () => {
  function post(status: SocialPost['status']): SocialPost {
    return {
      id: `p-${status}-${Math.random()}`,
      caption: 'test caption',
      mediaUrl: null,
      platforms: ['instagram'],
      status,
      scheduledFor: null,
      createdAt: new Date().toISOString(),
    };
  }

  test('not connected: honest "no source connected" — same wording /social uses (single source of truth)', () => {
    const result = contentPipelineStatus({ state: 'not_configured' }, []);
    expect(result.countLabel).toBe('no source connected');
    expect(result.connectedWithData).toBe(false);
    expect(result.bodyText).toMatch(/connect a posting source/i);
  });

  test('connected but nothing synced yet: distinct honest state, not "connected" and not "not connected"', () => {
    const result = contentPipelineStatus({ state: 'connected' }, []);
    expect(result.countLabel).toBe('no synced data yet');
    expect(result.connectedWithData).toBe(false);
    expect(result.publishedCount).toBe(0);
    // Same wording /social uses for the same real state — one honest source, not two guesses.
    expect(result.bodyText).toMatch(/no post history has synced/i);
  });

  test('connected with real synced data: uses the real published-post count, never invents one', () => {
    const posts = [post('published'), post('published'), post('queued')];
    const result = contentPipelineStatus({ state: 'connected' }, posts.filter((p) => p.status === 'published'));
    expect(result.connectedWithData).toBe(true);
    expect(result.publishedCount).toBe(2);
    expect(result.countLabel).toBe('2 published');
    expect(result.bodyText).toContain('2');
  });

  test('connector error: never claims "connected", never claims plain "not connected" either', () => {
    const result = contentPipelineStatus({ state: 'error' }, []);
    expect(result.countLabel).toBe('connector error');
    expect(result.connectedWithData).toBe(false);
  });
});
