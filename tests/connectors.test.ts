import { afterEach, describe, expect, test, vi } from 'vitest';
import { imapClientOptions, parseInboxConfigs } from '@/lib/connectors/email';

describe('parseInboxConfigs', () => {
  test('returns empty when nothing is configured', () => {
    expect(parseInboxConfigs({})).toEqual([]);
  });

  test('parses up to four complete inbox slots', () => {
    const env = {
      INBOX_1_HOST: 'imap.gmail.com',
      INBOX_1_USER: 'admin@example.com',
      INBOX_1_PASS: 'app-pass-1',
      INBOX_2_HOST: 'imap.gmail.com',
      INBOX_2_USER: 'owner@example.com',
      INBOX_2_PASS: 'app-pass-2',
      INBOX_2_NAME: 'LC Main',
      INBOX_3_HOST: 'imap.fastmail.com',
      INBOX_3_PORT: '1993',
      INBOX_3_USER: 'ops@example.org',
      INBOX_3_PASS: 'app-pass-3',
      INBOX_4_HOST: 'imap.gmail.com',
      INBOX_4_USER: 'personal@gmail.com',
      INBOX_4_PASS: 'app-pass-4',
    };
    const inboxes = parseInboxConfigs(env);
    expect(inboxes).toHaveLength(4);
    expect(inboxes[0]).toEqual({
      id: 'inbox-1',
      name: 'admin@example.com',
      host: 'imap.gmail.com',
      port: 993,
      user: 'admin@example.com',
      pass: 'app-pass-1',
      smtpHost: 'smtp.gmail.com', // imap. → smtp. default
      smtpPort: 465,
    });
    expect(inboxes[1].name).toBe('LC Main');
    expect(inboxes[2].port).toBe(1993);
  });

  test('imap clients fail fast: connect/greeting/socket timeouts are always set', () => {
    // Without these, a throttled Gmail connect hangs the home render and the
    // comms feed for tens of seconds (dashboards must degrade, not stall).
    const opts = imapClientOptions({
      id: 'inbox-1', name: 'x', host: 'imap.gmail.com', port: 993,
      user: 'a@b.c', pass: 'p', smtpHost: 'smtp.gmail.com', smtpPort: 465,
    });
    expect(opts.connectionTimeout).toBeLessThanOrEqual(5000);
    expect(opts.greetingTimeout).toBeLessThanOrEqual(5000);
    expect(opts.socketTimeout).toBeLessThanOrEqual(10000);
    expect(opts.host).toBe('imap.gmail.com');
    expect(opts.auth).toEqual({ user: 'a@b.c', pass: 'p' });
  });

  test('skips slots that are missing host, user, or pass', () => {
    const env = {
      INBOX_1_HOST: 'imap.gmail.com',
      INBOX_1_USER: 'a@b.c',
      // no pass — incomplete
      INBOX_2_HOST: 'imap.gmail.com',
      INBOX_2_USER: 'x@y.z',
      INBOX_2_PASS: 'ok',
    };
    const inboxes = parseInboxConfigs(env);
    expect(inboxes).toHaveLength(1);
    expect(inboxes[0].id).toBe('inbox-2');
  });

  test('a lone configured INBOX_1 with INBOX_2/3/4 entirely unset never throws and yields exactly one inbox', () => {
    // Production reality on this Railway deploy today: only INBOX_1_* is set;
    // INBOX_2/3/4 are reserved for a second business (Arise Above Apps) and
    // left completely absent, not just partially filled. Locks in the no-op
    // path the /comms and /integrations pages depend on staying crash-free.
    const env = {
      INBOX_1_HOST: 'imap.gmail.com',
      INBOX_1_USER: 'sean@ariseaboveconstruction.com',
      INBOX_1_PASS: 'app-password',
      INBOX_1_NAME: 'AAC',
      // INBOX_2_*, INBOX_3_*, INBOX_4_* intentionally absent — no keys at all
    };
    expect(() => parseInboxConfigs(env)).not.toThrow();
    const inboxes = parseInboxConfigs(env);
    expect(inboxes).toHaveLength(1);
    expect(inboxes[0].id).toBe('inbox-1');
    expect(inboxes[0].name).toBe('AAC');
  });
});
