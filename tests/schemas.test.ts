import { describe, expect, test } from 'vitest';
import {
  AgentSchema,
  DepartmentSchema,
  DomainSchema,
  MetricSchema,
  PhaseSchema,
  RoadmapItemSchema,
  ToolSchema,
  WorkflowBusinessSchema,
  WorkflowSchema,
} from '@/lib/schemas';

describe('AgentSchema', () => {
  const valid = {
    id: 'agent-zernio-poster',
    departmentId: 'dept-marketing',
    name: 'Zernio Poster',
    role: 'Social Distribution',
    status: 'active',
    tier: 'specialist',
    description: 'Schedules and publishes content across IG, TikTok, YouTube, FB, LinkedIn, X.',
    model: 'claude-fable-5',
    tools: ['zernio', 'whisper'],
    parentId: null,
    instance: 'builtin',
  };

  test('accepts a valid agent', () => {
    expect(AgentSchema.parse(valid)).toEqual(valid);
  });

  test('rejects an unknown status', () => {
    expect(() => AgentSchema.parse({ ...valid, status: 'sleeping' })).toThrow();
  });

  test('rejects an unknown tier', () => {
    expect(() => AgentSchema.parse({ ...valid, tier: 'intern' })).toThrow();
  });

  test('rejects a missing departmentId', () => {
    const { departmentId: _omitted, ...rest } = valid;
    expect(() => AgentSchema.parse(rest)).toThrow();
  });
});

describe('DepartmentSchema', () => {
  test('accepts a valid department', () => {
    const dept = {
      id: 'dept-marketing',
      name: 'Marketing & Growth',
      slug: 'marketing',
      tagline: 'Attention is the asset.',
      color: '#ec4899',
      order: 3,
    };
    expect(DepartmentSchema.parse(dept)).toEqual(dept);
  });

  test('rejects a non-numeric order', () => {
    expect(() =>
      DepartmentSchema.parse({
        id: 'd',
        name: 'X',
        slug: 'x',
        tagline: '',
        color: '#fff',
        order: 'first',
      }),
    ).toThrow();
  });
});

describe('RoadmapItemSchema', () => {
  test('accepts a valid roadmap item with null department', () => {
    const item = {
      id: 'rm-1',
      title: 'Ship the OS v1',
      quarter: '2026-Q2',
      status: 'now',
      departmentId: null,
      description: 'Live web app on port 4100.',
    };
    expect(RoadmapItemSchema.parse(item)).toEqual(item);
  });

  test('rejects a malformed quarter', () => {
    expect(() =>
      RoadmapItemSchema.parse({
        id: 'rm-2',
        title: 'X',
        quarter: 'Q2 2026',
        status: 'next',
        departmentId: null,
        description: '',
      }),
    ).toThrow();
  });
});

describe('ToolSchema', () => {
  test('rejects an unknown integration status', () => {
    expect(() =>
      ToolSchema.parse({
        id: 'tool-zernio',
        name: 'Zernio',
        category: 'Distribution',
        status: 'maybe',
        color: '#22d3ee',
        description: '',
      }),
    ).toThrow();
  });
});

describe('MetricSchema', () => {
  test('accepts a valid metric', () => {
    const metric = {
      id: 'metric-mrr',
      key: 'mrr',
      label: 'Monthly Recurring Revenue',
      value: 18400,
      unit: 'usd',
      delta: 12.5,
      period: '30d',
    };
    expect(MetricSchema.parse(metric)).toEqual(metric);
  });
});

describe('DomainSchema', () => {
  test('accepts a business reference model domain with items', () => {
    const domain = {
      id: 'brm-1',
      number: 1,
      title: 'Company Leadership',
      color: '#8b5cf6',
      items: ['Vision & strategy', 'Quarterly planning', 'Decision log'],
    };
    expect(DomainSchema.parse(domain)).toEqual(domain);
  });
});

describe('PhaseSchema', () => {
  test('accepts a high-level functionality phase', () => {
    const phase = {
      id: 'phase-1',
      number: 1,
      title: 'Foundation',
      items: ['Agent org chart', 'Seeded data layer'],
    };
    expect(PhaseSchema.parse(phase)).toEqual(phase);
  });
});

// 2026-08-21 fix: /workflows had no business dimension at all — a workflow
// couldn't be tagged AAC vs Apps vs shared, so the page had nothing to scope
// against the Topbar's business switcher. WorkflowBusinessSchema adds that
// dimension (with 'shared' for a cross-cutting process, unlike the funnel's
// per-journey business tag which only ever needs aac/apps).
describe('WorkflowBusinessSchema', () => {
  test('accepts aac, apps, and shared', () => {
    expect(WorkflowBusinessSchema.parse('aac')).toBe('aac');
    expect(WorkflowBusinessSchema.parse('apps')).toBe('apps');
    expect(WorkflowBusinessSchema.parse('shared')).toBe('shared');
  });

  test('rejects anything else', () => {
    expect(() => WorkflowBusinessSchema.parse('all')).toThrow();
    expect(() => WorkflowBusinessSchema.parse('vantage')).toThrow();
  });
});

describe('WorkflowSchema', () => {
  const base = {
    id: 'w-1',
    name: 'Test workflow',
    subtitle: '',
    revenueUsd: 0,
    order: 0,
    steps: [],
  };

  test('requires a business tag — aac, apps, or shared', () => {
    expect(WorkflowSchema.parse({ ...base, business: 'aac' })).toMatchObject({ business: 'aac' });
    expect(WorkflowSchema.parse({ ...base, business: 'apps' })).toMatchObject({ business: 'apps' });
    expect(WorkflowSchema.parse({ ...base, business: 'shared' })).toMatchObject({ business: 'shared' });
  });

  test('rejects a missing or invalid business tag', () => {
    expect(() => WorkflowSchema.parse(base)).toThrow();
    expect(() => WorkflowSchema.parse({ ...base, business: 'bogus' })).toThrow();
  });
});
