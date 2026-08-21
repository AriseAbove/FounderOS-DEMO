import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Home page + /agents "Run" wiring (2026-08-21 fix): the home page's agent
 * row used to render a styled <span> that said "Run" but did nothing except
 * sit inside a <Link href="/agents"> — clicking it only ever navigated away.
 * Meanwhile the /agents roster had no run trigger at all. AgentRunButton is
 * the one real trigger for POST /api/agents/[id]/run, shared by both pages.
 */
describe('AgentRunButton actually calls the real run endpoint', () => {
  const src = read('components/AgentRunButton.tsx');

  test('is a client component', () => {
    expect(src).toMatch(/^'use client';/);
  });

  test('POSTs to /api/agents/[id]/run, not a dead handler', () => {
    expect(src).toMatch(/fetch\(`\/api\/agents\/\$\{agentId\}\/run`,\s*\{\s*method:\s*'POST'/);
  });

  test('renders a real <button>, not a plain non-interactive <span>', () => {
    expect(src).toMatch(/<button/);
  });

  test('disables itself while the request is in flight', () => {
    expect(src).toMatch(/disabled=\{phase === 'busy'\}/);
  });

  test('shows an honest OK/FAILED outcome after the request settles', () => {
    expect(src).toMatch(/'OK'/);
    expect(src).toMatch(/'FAILED'/);
  });

  test('refreshes the page so last-run info updates after a run', () => {
    expect(src).toMatch(/router\.refresh\(\)/);
  });
});

describe('home page wires the Run pill to AgentRunButton, separate from row navigation', () => {
  const src = read('app/page.tsx');

  test('imports AgentRunButton', () => {
    expect(src).toMatch(/import\s*\{\s*AgentRunButton\s*\}\s*from\s*['"]@\/components\/AgentRunButton['"]/);
  });

  test('the old dead status pill (span with Run/Degraded/no creds) is gone', () => {
    expect(src).not.toMatch(/a\.status === 'active' \? 'Run' : a\.status === 'idle' \? 'Degraded' : 'no creds'/);
  });

  test('AgentRunButton sits outside the row\'s navigation <Link>, not nested inside it', () => {
    const linkOpen = src.indexOf('<Link href="/agents" className="flex min-w-0 flex-1 items-center gap-3">');
    const linkClose = src.indexOf('</Link>', linkOpen);
    const buttonUse = src.indexOf('<AgentRunButton', linkClose);
    expect(linkOpen).toBeGreaterThan(-1);
    expect(linkClose).toBeGreaterThan(linkOpen);
    expect(buttonUse).toBeGreaterThan(linkClose);
  });
});

describe('/agents roster gets a real Run trigger where it previously had none', () => {
  const src = read('app/agents/page.tsx');

  test('imports and renders AgentRunButton on each roster card', () => {
    expect(src).toMatch(/import\s*\{\s*AgentRunButton\s*\}\s*from\s*['"]@\/components\/AgentRunButton['"]/);
    expect(src).toMatch(/<AgentRunButton agentId=\{agent\.id\}/);
  });
});
