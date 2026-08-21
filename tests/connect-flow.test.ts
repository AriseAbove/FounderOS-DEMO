import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * 2026-08-21 fix: a connector genuinely in the 'error' state (a stored grant
 * exists but the last real API call failed — e.g. a QuickBooks token that
 * needs reconnecting) rendered on /integrations as a plain "Not connected ·
 * Connect →" card, indistinguishable from a tool that was never touched at
 * all — collapsing a real, alarming failure into the same UI as "nothing to
 * see here" and throwing away the connector's real detail message
 * (ConnectorStatus.detail) in the process. ConnectFlow now takes a genuine
 * `error` prop (sourced from lib/integrations-catalog.ts's CatalogEntry.error,
 * which itself only lights up for a real connectorId whose live status is
 * 'error' — see tests/integrations-catalog.test.ts) and renders a distinct
 * amber/red "Reconnect needed" state with the real detail message and a
 * Reconnect action, instead of collapsing into "Not connected". This test
 * follows the same source-reading convention as tests/funnel-page.test.ts
 * and tests/home-page.test.ts (no DOM-rendering test harness — jsdom/RTL
 * aren't installed in this repo — so the contract is pinned against the
 * actual component/page source).
 */
describe('ConnectFlow renders a genuine error/reconnect state, distinct from connected and not-connected', () => {
  const connectFlow = read('components/ConnectFlow.tsx');

  test('accepts an `error` prop', () => {
    expect(connectFlow).toMatch(/error\s*=\s*false/); // defaults to false — never assumed broken
    expect(connectFlow).toMatch(/error\?:\s*boolean/);
  });

  test('the status chip has a THIRD branch for error, distinct from "Connected" and "Not connected"', () => {
    // connected -> "Connected" is checked first, so error only applies once
    // connected is already known false — never contradicts a real connected
    // state.
    expect(connectFlow).toMatch(/connected \? \([\s\S]*?Connected[\s\S]*?\) : error \? \(/);
    expect(connectFlow).toMatch(/Reconnect needed/);
  });

  test('the real failure detail renders as visible body text, not just a title tooltip', () => {
    expect(connectFlow).toMatch(/\{error && guidance && \(/);
  });

  test('the connect action reads "Reconnect" instead of "Connect" when in the error state', () => {
    expect(connectFlow).toMatch(/error \? 'Reconnect/);
  });
});

describe('ConnectionCard passes the real error state through to ConnectFlow', () => {
  const card = read('components/ConnectionCard.tsx');

  test('forwards entry.error — never silently drops it', () => {
    expect(card).toMatch(/error=\{entry\.error\}/);
  });
});

describe('/integrations regression: existing connected/keySaved/not-connected states are untouched', () => {
  const connectFlow = read('components/ConnectFlow.tsx');

  test('the connected branch still reads entry.connected -> "Connected" first, unconditionally', () => {
    expect(connectFlow).toMatch(/const statusChip = connected \? \(/);
  });

  test('keySaved and the plain not-connected fallback are still present, unchanged in wording', () => {
    expect(connectFlow).toMatch(/Key saved/);
    expect(connectFlow).toMatch(/>Not connected</);
  });

  test('the disconnect/managed/setup action branches for already-connected or key-saved tools are untouched', () => {
    expect(connectFlow).toMatch(/Disconnect/);
    expect(connectFlow).toMatch(/Managed/);
    expect(connectFlow).toMatch(/>\s*Setup\s*</);
  });
});
