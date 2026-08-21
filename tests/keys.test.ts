import { describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KEY_SLOTS, listKeyStatuses, maskSecret, upsertEnvLocal } from '@/lib/keys';
import { caldavAccounts } from '@/lib/connectors/gcal';

describe('maskSecret', () => {
  test('shows only the tail, never short secrets', () => {
    expect(maskSecret('sk-live-abcdef123456')).toBe('••••3456');
    expect(maskSecret('abc')).toBe('••••');
    expect(maskSecret('')).toBe('');
  });
});

describe('KEY_SLOTS', () => {
  test('covers the canonical connector slots with groups', () => {
    const vars = KEY_SLOTS.map((s) => s.envVar);
    expect(vars).toEqual(
      expect.arrayContaining(['INBOX_1_PASS', 'QUICKBOOKS_CLIENT_ID', 'BRAIN_STORE']),
    );
    for (const slot of KEY_SLOTS) {
      expect(slot.group.length).toBeGreaterThan(0);
      expect(slot.envVar).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  // Bug: /integrations showed "Google Calendar — CONNECTED" sitting directly
  // above "CAL_1_USER: not set / CAL_1_PASS: not set" even though the
  // calendar demonstrably works on /comms. Root cause: lib/connectors/gcal.ts
  // never reads CAL_1_USER/CAL_1_PASS at all — it authenticates with the same
  // Google INBOX_*_USER/_PASS app passwords the Email group already shows.
  // The credential panel was labeling the wrong env vars, not the CONNECTED
  // badge lying — so those dead slots must not exist (must never resurface
  // as a "Calendar" group nobody's code actually reads).
  test('never lists CAL_1_USER/CAL_1_PASS — the real calendar connector reads INBOX_*, not these', () => {
    const vars = KEY_SLOTS.map((s) => s.envVar);
    expect(vars).not.toContain('CAL_1_USER');
    expect(vars).not.toContain('CAL_1_PASS');
    expect(KEY_SLOTS.some((s) => s.group === 'Calendar')).toBe(false);
  });

  // Bug: .env.example documented NTFY_TOPIC/NTFY_URL as real, working
  // Chief-of-Staff push config (lib/chief-of-staff.ts's sendNtfyPush reads
  // both), but neither var had a KEY_SLOTS entry — so /integrations gave
  // Sean no way to see or edit them himself; only someone SSHed into
  // Railway could set them.
  test('lists NTFY_TOPIC and NTFY_URL so Sean can see/edit them on /integrations', () => {
    const vars = KEY_SLOTS.map((s) => s.envVar);
    expect(vars).toContain('NTFY_TOPIC');
    expect(vars).toContain('NTFY_URL');
  });
});

describe('listKeyStatuses', () => {
  test('reports presence with masked values only — never the raw secret', () => {
    const env = { QUICKBOOKS_CLIENT_SECRET: 'qbo-very-secret-9876', INBOX_1_PASS: '' };
    const statuses = listKeyStatuses(env);
    const qbo = statuses.find((s) => s.envVar === 'QUICKBOOKS_CLIENT_SECRET')!;
    expect(qbo.present).toBe(true);
    expect(qbo.masked).toBe('••••9876');
    expect(JSON.stringify(statuses)).not.toContain('qbo-very-secret-9876');
    expect(statuses.find((s) => s.envVar === 'INBOX_1_PASS')!.present).toBe(false);
  });

  // Bug: /integrations showed "Knowledge Store — CONNECTED" sitting directly
  // above "BRAIN_STORE: not set" with nothing explaining why — both facts
  // are individually true (BRAIN_STORE really isn't set; the connector is
  // really connected via the bundled knowledge/brain-store/ fallback), so
  // the credential panel needs to say so instead of reading as a lie.
  test('BRAIN_STORE not set: carries an explanatory note when the bundled fallback store exists', () => {
    const env = {};
    const statuses = listKeyStatuses(env);
    const brainStore = statuses.find((s) => s.envVar === 'BRAIN_STORE')!;
    expect(brainStore.present).toBe(false);
    expect(brainStore.note).toMatch(/bundled starter store/i);
  });

  test('BRAIN_STORE explicitly set: no fallback note (nothing to explain)', () => {
    const env = { BRAIN_STORE: '/some/real/path' };
    const statuses = listKeyStatuses(env);
    const brainStore = statuses.find((s) => s.envVar === 'BRAIN_STORE')!;
    expect(brainStore.present).toBe(true);
    expect(brainStore.note).toBeUndefined();
  });
});

describe('the credential panel and the real Calendar connector agree on which vars actually power it', () => {
  test('a real Google inbox app password (INBOX_1_*) is what caldavAccounts() reads AND what the panel displays — the same source, not two guesses', () => {
    const env = {
      INBOX_1_HOST: 'imap.gmail.com',
      INBOX_1_USER: 'sean@ariseaboveconstruction.com',
      INBOX_1_PASS: 'abcd efgh ijkl mnop',
    };
    // The connector genuinely authenticates off these — proves the panel
    // isn't just displaying decorative vars nothing reads.
    expect(caldavAccounts(env)).toHaveLength(1);
    const statuses = listKeyStatuses(env);
    expect(statuses.find((s) => s.envVar === 'INBOX_1_USER')!.present).toBe(true);
    expect(statuses.find((s) => s.envVar === 'INBOX_1_PASS')!.present).toBe(true);
  });
});

describe('upsertEnvLocal', () => {
  test('appends a new key and updates an existing one in place', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'keys-')), '.env.local');
    writeFileSync(file, '# comment\nSLACK_BOT_TOKEN=old\nNOTION_API_KEY=keep\n');
    upsertEnvLocal(file, 'SLACK_BOT_TOKEN', 'xoxb-new');
    upsertEnvLocal(file, 'WHOP_API_KEY', 'whop-123');
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('SLACK_BOT_TOKEN=xoxb-new');
    expect(content).not.toContain('SLACK_BOT_TOKEN=old');
    expect(content).toContain('NOTION_API_KEY=keep');
    expect(content).toContain('# comment');
    expect(content.trim().endsWith('WHOP_API_KEY=whop-123')).toBe(true);
  });

  test('creates the file when missing and rejects bad names', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'keys-')), '.env.local');
    upsertEnvLocal(file, 'STRIPE_SECRET_KEY', 'sk_test_1');
    expect(readFileSync(file, 'utf8')).toContain('STRIPE_SECRET_KEY=sk_test_1');
    expect(() => upsertEnvLocal(file, 'bad-name', 'x')).toThrow();
    expect(() => upsertEnvLocal(file, 'HAS SPACE', 'x')).toThrow();
  });
});
