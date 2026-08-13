'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BUSINESSES } from '@/lib/businesses';
import { BUSINESS_FILTER_COOKIE, type BusinessFilter } from '@/lib/business-filter';

/** AAC / Apps / Combined — the global business lens, lives in the Topbar. */
export function BusinessSwitcher({ initial }: { initial: BusinessFilter }) {
  const router = useRouter();
  const [value, setValue] = useState<BusinessFilter>(initial);

  function pick(next: BusinessFilter) {
    setValue(next);
    // 1-year cookie, readable by both client and server components.
    document.cookie = `${BUSINESS_FILTER_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 rounded-sm-t border border-os-border bg-os-surface p-0.5">
      <button
        onClick={() => pick('all')}
        title="Combined — both businesses"
        className={`rounded-[3px] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors ${
          value === 'all' ? 'bg-os-text text-os-bg' : 'text-os-muted hover:text-os-text'
        }`}
      >
        Combined
      </button>
      {BUSINESSES.map((b) => {
        const active = value === b.id;
        return (
          <button
            key={b.id}
            onClick={() => pick(b.id)}
            title={b.detail}
            className={`flex items-center gap-1 rounded-[3px] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors ${
              active ? 'text-black' : 'text-os-muted hover:text-os-text'
            }`}
            style={active ? { background: b.color } : undefined}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? '#000000' : b.color }} />
            {b.id === 'aac' ? 'AAC' : 'Apps'}
          </button>
        );
      })}
    </div>
  );
}
