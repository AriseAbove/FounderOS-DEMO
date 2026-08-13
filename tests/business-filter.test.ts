import { describe, expect, test } from 'vitest';
import { isBusinessFilter, resolveBusinessFilter } from '@/lib/business-filter';

describe('isBusinessFilter', () => {
  test('accepts all, aac, apps', () => {
    expect(isBusinessFilter('all')).toBe(true);
    expect(isBusinessFilter('aac')).toBe(true);
    expect(isBusinessFilter('apps')).toBe(true);
  });

  test('rejects unknown values', () => {
    expect(isBusinessFilter('vantage')).toBe(false);
    expect(isBusinessFilter('')).toBe(false);
    expect(isBusinessFilter(undefined)).toBe(false);
    expect(isBusinessFilter(null)).toBe(false);
  });
});

describe('resolveBusinessFilter', () => {
  test('valid cookie value wins', () => {
    expect(resolveBusinessFilter('aac')).toBe('aac');
    expect(resolveBusinessFilter('apps')).toBe('apps');
    expect(resolveBusinessFilter('all')).toBe('all');
  });

  test('missing or invalid cookie defaults to combined (all)', () => {
    expect(resolveBusinessFilter(null)).toBe('all');
    expect(resolveBusinessFilter(undefined)).toBe('all');
    expect(resolveBusinessFilter('bogus')).toBe('all');
  });
});
