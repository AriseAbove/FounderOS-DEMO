import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import { describe, expect, test } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Strip TS type annotations from an extracted function snippet so it can
    run through `new Function` in a plain-JS eval. */
const stripTypes = (src: string) => transformSync(src, { loader: 'ts' }).code;

/**
 * 2026-08-21 fix: AgentActivityFeed and WeekCalendar both formatted
 * timestamps with toLocaleTimeString([], …) / toLocaleDateString([], …) —
 * the BROWSER's local timezone/locale — directly during render. Next.js
 * server-renders these 'use client' components on Railway (server TZ = UTC),
 * then React hydrates and re-renders them in the visitor's local timezone,
 * so the formatted string differs between the SSR pass and the client's
 * first render, and React throws hydration mismatches (#418/#423/#425) on
 * every page load of /, /agents, and /comms.
 *
 * Fixed by rendering a deterministic UTC string on the pass that has to
 * match SSR (both the server render and the client's pre-hydration render
 * compute it the same way, since UTC formatting doesn't depend on the
 * runtime's local offset), then swapping to the real local-time string
 * inside useEffect — which only runs client-side, strictly after hydration
 * has already reconciled. A real SSR-vs-client render pass isn't available
 * in Vitest/jsdom, so this asserts the source structure (the local formatter
 * is only reachable through the post-mount `hydrated` branch) and that the
 * UTC formatter itself is timezone-independent.
 */
describe('AgentActivityFeed renders a timezone-independent string until mounted', () => {
  const src = read('components/AgentActivityFeed.tsx');

  test('tracks a hydrated flag that starts false and flips in useEffect', () => {
    expect(src).toMatch(/const \[hydrated, setHydrated\] = useState\(false\)/);
    expect(src).toMatch(/useEffect\(\(\) => setHydrated\(true\), \[\]\)/);
  });

  test('the clock timestamp renders through the hydrated ternary, not the raw local formatter directly', () => {
    expect(src).toMatch(/\{hydrated \? clockLocal\(e\.at\) : clockUTC\(e\.at\)\}/);
  });

  test('clockUTC pins an explicit UTC timezone (independent of the browser/runtime default)', () => {
    expect(src).toMatch(/function clockUTC[\s\S]*?timeZone:\s*'UTC'/);
  });

  test('clockUTC is deterministic regardless of the process timezone', () => {
    const start = src.indexOf('function clockUTC(');
    const end = src.indexOf('\n}', start) + 2;
    const fnSrc = stripTypes(src.slice(start, end));
    // eslint-disable-next-line no-new-func
    const clockUTC = new Function(`${fnSrc}; return clockUTC;`)();
    const iso = '2026-08-21T14:37:00.000Z';
    expect(clockUTC(iso)).toBe('02:37 PM');
    // same absolute instant, expressed with a different offset in the ISO
    // string — must format identically since it's the same instant in UTC.
    const isoOtherOffset = '2026-08-21T09:37:00.000-05:00';
    expect(clockUTC(isoOtherOffset)).toBe(clockUTC(iso));
  });
});

describe('WeekCalendar renders timezone-independent strings until mounted', () => {
  const src = read('components/WeekCalendar.tsx');

  test('is a client component (hydrates on the client, same as its "use client" parent CommsTabs)', () => {
    expect(src.trimStart().startsWith("'use client';")).toBe(true);
  });

  test('tracks a hydrated flag that starts false and flips in useEffect', () => {
    expect(src).toMatch(/const \[hydrated, setHydrated\] = useState\(false\)/);
    expect(src).toMatch(/useEffect\(\(\) => setHydrated\(true\), \[\]\)/);
  });

  test('the weekday header and event time render through the hydrated ternary', () => {
    expect(src).toMatch(/\{hydrated \? weekdayLocal\(c\.date\) : weekdayUTC\(c\.date\)\}/);
    expect(src).toMatch(/\{hydrated \? fmtTimeLocal\(ev\.start\) : fmtTimeUTC\(ev\.start\)\}/);
  });

  test('fmtTimeUTC and weekdayUTC pin an explicit UTC timezone', () => {
    expect(src).toMatch(/function fmtTimeUTC[\s\S]*?timeZone:\s*'UTC'/);
    expect(src).toMatch(/function weekdayUTC[\s\S]*?timeZone:\s*'UTC'/);
  });
});
