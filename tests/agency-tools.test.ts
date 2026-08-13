import { afterEach, describe, expect, test } from 'vitest';
import { trakyoStatus } from '@/lib/connectors/trakyo';

const TK = 'TRAKYO_API_KEY';
const prevTk = process.env[TK];

afterEach(() => {
  if (prevTk === undefined) delete process.env[TK];
  else process.env[TK] = prevTk;
});

describe('trakyoStatus', () => {
  test('honest not_configured: no public API / no key yet', async () => {
    delete process.env[TK];
    const status = await trakyoStatus();
    expect(status.state).toBe('not_configured');
    expect(status.id).toBe('trakyo');
    expect(status.kind).toBe('crm');
  });

  test('connected once a key is provided', async () => {
    process.env[TK] = 'tk_test';
    const status = await trakyoStatus();
    expect(status.state).toBe('connected');
  });
});
