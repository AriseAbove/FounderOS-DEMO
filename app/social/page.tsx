import Link from 'next/link';
import { Facebook, Instagram, Linkedin, Mail, Music2, Store, Twitter, Youtube, type LucideIcon } from 'lucide-react';
import { getDb } from '@/lib/data';
import {
  audienceGrowth,
  audienceSeries,
  audienceTotal,
  buildSocialDashboard,
  dmGrowth,
  dmThreads,
  totalDms,
  PLATFORM_LABELS,
} from '@/lib/social';
import type { SocialPlatform } from '@/lib/schemas';
import { PageHeader } from '@/components/PageHeader';
import { Badge, SectionHead } from '@/components/terminal';
import { formatFollowers, formatPct } from '@/components/SocialStats';
import { SocialStatStrip } from '@/components/SocialStatStrip';
import { AudienceConsistencyLazy } from '@/components/AudienceConsistencyLazy';
import { AudiencePie } from '@/components/AudiencePie';
import { PostComposer } from '@/components/PostComposer';

export const dynamic = 'force-dynamic';

const PLATFORM_ICONS: Record<SocialPlatform, LucideIcon> = {
  instagram: Instagram,
  tiktok: Music2,
  twitter: Twitter,
  youtube: Youtube,
  linkedin: Linkedin,
  facebook: Facebook,
  googlebusiness: Store, // no literal Google Business mark in lucide — same stand-in convention as Music2/TikTok
};

// Human label for a raw platform string (falls back to capitalising it).
function platformLabel(platform: string): string {
  return (PLATFORM_LABELS as Record<string, string>)[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
}

/** Recency grade for a post box: one dot per post in the set, lit count =
 * how recent (all lit = newest, one lit = oldest). */
function RecencyDots({ rank, of }: { rank: number; of: number }) {
  const lit = of - rank;
  return (
    <div className="mt-1.5 flex items-center gap-1" title={`#${rank + 1} most recent of ${of}`}>
      {Array.from({ length: of }, (_, d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: d < lit ? 'var(--accent)' : 'var(--surface-3)',
            opacity: d < lit ? 0.45 + 0.55 * (lit / of) : 1,
          }}
        />
      ))}
    </div>
  );
}

// Relative "2h"/"3d" from a published-at ISO timestamp (server-rendered).
function agoFrom(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default async function SocialPage() {
  const db = getDb();
  // Honest, DB-only view: no posting/analytics source is connected, so every
  // figure below comes from real recorded snapshots — none exist yet.
  const dash = buildSocialDashboard(db);
  const posts = db.socialPosts.all();
  const livePosts: { platform: string; publishedAt: string; caption: string; status: string; url: string | null }[] = [];
  const recentLive = false;

  const total = audienceTotal(db);
  const queued = posts.filter((p) => p.status === 'queued').length;
  const dmInbox = dmThreads(db); // DM inbox — empty until a DM source is wired

  const audiencePoints = audienceSeries(db).all.points;
  const postDays: import("@/lib/posting-activity").PostDay[] = [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        eyebrow="audience"
        title="Social"
        right={<Badge tone="warn" ghost>no posting source connected</Badge>}
      />

      {/* Every account on the first screen — compact row, one cell per channel.
          Click through for the platform detail. */}
      <SectionHead label="Accounts" count={`${formatFollowers(total)} total`} />
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {dash.platforms.map((p) => {
          const Icon = PLATFORM_ICONS[p.platform];
          const share = total > 0 && p.followers != null ? (p.followers / total) * 100 : 0;
          return (
            <Link
              key={p.platform}
              href={`/social/${p.platform}`}
              title={`${share.toFixed(0)}% of reach`}
              className="hoverable group rounded-lg-t border border-os-border bg-os-surface px-4 py-4"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-os-text" />
                <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim">
                  {PLATFORM_LABELS[p.platform]}
                </span>
                <span
                  className={`ml-auto shrink-0 font-mono text-[10px] ${
                    p.growth.d7 == null ? 'text-os-dim' : p.growth.d7 >= 0 ? 'text-os-ok' : 'text-os-err'
                  }`}
                  title="7-day growth"
                >
                  {formatPct(p.growth.d7)}
                </span>
              </div>
              <div className="mt-3 font-mono text-[26px] font-semibold leading-none tracking-[-0.02em]">
                {formatFollowers(p.followers)}
              </div>
              <div className="mt-1.5 truncate font-mono text-[9.5px] text-os-dim">{p.handle}</div>
              <div className="mt-3 h-1 overflow-hidden rounded-sm-t bg-os-surface2">
                <div className="h-full bg-os-accent opacity-60" style={{ width: `${share}%` }} />
              </div>
            </Link>
          );
        })}

      </div>

      {/* Summary strip — Total reach + Audience-growth + Total-DMs interactive
          tiles, and the Instagram DMs tile (click to open the inbox and reply).
          The old "Top platform" tile was retired as a dead metric. */}
      <SocialStatStrip
        audienceTotal={total}
        audienceGrowth={audienceGrowth(db)}
        totalDms={totalDms(db)}
        dmGrowth={dmGrowth(db)}
        platformsCount={dash.platforms.length}
        dmThreads={dmInbox}
        nowMs={Date.now()}
      />

      {/* Charts left, audience-share pie riding the right of the same card;
          Recent posts live underneath as a row of boxes. */}
      <div className="mb-6">
        <AudienceConsistencyLazy
          audience={audiencePoints}
          postDays={postDays}
          today={today}
          aside={
            <AudiencePie
              framed={false}
              stacked
              donutPx={172}
              items={dash.platforms.map((p) => ({
                key: p.platform,
                label: PLATFORM_LABELS[p.platform],
                value: p.followers,
              }))}
              total={total}
            />
          }
        />
      </div>

      {/* Recent posts — box row, newest first; the dot strip grades recency
          (all dots lit = most recent, fading down to the oldest). */}
      <section className="mb-6">
        <SectionHead label="Recent posts" count={recentLive ? `${livePosts.length} live` : 'none'} />
        {recentLive ? (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
            {livePosts.map((p, i) => (
              <div
                key={`${p.url}-${i}`}
                className="hoverable flex flex-col rounded-lg-t border border-os-border bg-os-surface px-3.5 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-os-accent">
                    {platformLabel(p.platform)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-os-dim">{agoFrom(p.publishedAt)}</span>
                </div>
                <RecencyDots rank={i} of={livePosts.length} />
                <div className="mt-2 line-clamp-3 text-[12px] [text-wrap:pretty]">{p.caption.split('\n')[0]}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg-t border border-dashed border-os-border bg-os-surface px-4 py-5 text-center font-mono text-[11.5px] text-os-dim">
            No published posts on record — connect a posting source to fill this in.
          </p>
        )}
      </section>

      {/* Publish — compose a post that queues for the Social agent */}
      <section className="mt-10">
        <SectionHead label="Publish" count={`${queued} queued`} link="Social agent" href="/agents" />
        <PostComposer initialPosts={posts} />
      </section>
    </div>
  );
}
