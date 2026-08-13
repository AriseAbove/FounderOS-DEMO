/**
 * The global business filter — the "AAC / Apps / Combined" switcher in the
 * Topbar. Persisted as a cookie (not localStorage) so server components
 * (org chart, funnel — anything that filters data server-side) can read the
 * current selection on the same request that renders them.
 *
 * Client-safe: no `next/headers` import here, so client components (the
 * switcher itself) can share these types/constants. Server components read
 * the actual cookie via `readBusinessFilterCookie` in
 * `lib/business-filter-server.ts` — importing `next/headers` from a module a
 * client component pulls in breaks the client bundle.
 */
import type { BusinessId } from '@/lib/businesses';
import { BUSINESSES } from '@/lib/businesses';

export const BUSINESS_FILTER_COOKIE = 'os_business';

export type BusinessFilter = BusinessId | 'all';

export function isBusinessFilter(value: unknown): value is BusinessFilter {
  return value === 'all' || BUSINESSES.some((b) => b.id === value);
}

/** Cookie value wins if valid, otherwise 'all' (combined view). */
export function resolveBusinessFilter(stored: string | null | undefined): BusinessFilter {
  return isBusinessFilter(stored) ? stored : 'all';
}
