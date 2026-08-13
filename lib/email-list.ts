import type { FounderDb } from '@/lib/db';
import { growthOver, growthAllTime, type GrowthPoint } from '@/lib/growth';
import type { SocialGrowth } from '@/lib/schemas';

export type EmailListSummary = {
  subscribers: number | null;
  asOf: string | null;
  growth: SocialGrowth;
  series: { date: string; subscribers: number }[];
};

/**
 * The email-list audience card: current subscribers, growth windows, and a
 * trailing series — same shape as a social platform so the Social tab renders
 * it alongside the others. Empty until a real subscriber source records
 * snapshots — no invented history.
 */
export function buildEmailList(db: FounderDb): EmailListSummary {
  const snapshots = db.emailList.snapshots();
  const points: GrowthPoint[] = snapshots.map((s) => ({ capturedAt: s.capturedAt, value: s.subscribers }));
  const latest = snapshots.at(-1) ?? null;
  return {
    subscribers: latest?.subscribers ?? null,
    asOf: latest?.capturedAt ?? null,
    growth: {
      d7: growthOver(points, 7),
      d30: growthOver(points, 30),
      d60: growthOver(points, 60),
      allTime: growthAllTime(points),
    },
    series: snapshots.slice(-90).map((s) => ({ date: s.capturedAt, subscribers: s.subscribers })),
  };
}
