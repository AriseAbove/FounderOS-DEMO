import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import { describe, expect, test } from 'vitest';

/** Strip TS type annotations from an extracted function snippet so it can
    run through `new Function` in a plain-JS eval. */
const stripTypes = (src: string) => transformSync(src, { loader: 'ts' }).code;

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * 2026-08-21 fix: the home page's agent roster row appended a literal " ago"
 * onto relativeTime()'s output unconditionally — but relativeTime() already
 * returns a full phrase ("just now") for anything under a minute old, so a
 * run that just finished rendered "just now ago". relativeTimeAgo() only
 * appends " ago" when relativeTime() returned a bare duration (e.g. "5m").
 */
describe('relativeTimeAgo never doubles up on "just now"', () => {
  const page = read('app/page.tsx');

  test('defines relativeTimeAgo as the conditional wrapper, not a bare template append', () => {
    expect(page).toMatch(/function relativeTimeAgo\(/);
    // the old bug: `${relativeTime(last.finishedAt)} ago` unconditionally
    expect(page).not.toMatch(/\$\{relativeTime\([^)]*\)\}\s*ago/);
  });

  test('the agent roster row renders through relativeTimeAgo', () => {
    expect(page).toMatch(/relativeTimeAgo\(last\.finishedAt\)/);
  });

  // Reproduce the exact "just now ago" scenario against the real function
  // bodies (extracted as source since app/page.tsx is an async server
  // component that needs a live db to import/execute directly).
  function extractFn(src: string, name: string): string {
    const start = src.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`function ${name} not found`);
    let depth = 0;
    let i = src.indexOf('{', start);
    const bodyStart = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    return src.slice(start, i + 1) || src.slice(start, bodyStart);
  }

  test('relativeTimeAgo(now) never renders "just now ago"', () => {
    const relativeTimeSrc = stripTypes(extractFn(page, 'relativeTime'));
    const relativeTimeAgoSrc = stripTypes(extractFn(page, 'relativeTimeAgo'));
    // eslint-disable-next-line no-new-func
    const relativeTime = new Function(`${relativeTimeSrc}; return relativeTime;`)();
    // eslint-disable-next-line no-new-func
    const relativeTimeAgo = new Function(
      `const relativeTime = ${relativeTime.toString()}; ${relativeTimeAgoSrc}; return relativeTimeAgo;`,
    )();

    const nowIso = new Date().toISOString();
    expect(relativeTime(nowIso)).toBe('just now');
    expect(relativeTimeAgo(nowIso)).toBe('just now');
    expect(relativeTimeAgo(nowIso)).not.toMatch(/ago/);

    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTimeAgo(fiveMinAgo)).toBe('5m ago');
  });
});
