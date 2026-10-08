// The Scout's arithmetic: what a watched Calgary account is doing lately, and
// which accounts it credits that we aren't watching yet. Pure functions over
// Business Discovery results, so the ranking is testable without the network.

import type { AccountMedia, DiscoveredAccount } from './instagram';

const DAY = 86_400_000;

export interface ScoutEntry {
  handle: string;
  kind: string;
  followers: number;
  /** Posts in the last 30 days. */
  posts30: number;
  daysSinceLastPost: number | null;
  /** Median likes + comments over the recent posts read. */
  medianEngagement: number;
  /** medianEngagement / followers, as a percentage. */
  engagementRate: number;
  reelShare: number;
  active: boolean;
  top: { permalink: string; caption: string; engagement: number; reel: boolean; at: number } | null;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const isReel = (m: AccountMedia) => m.productType === 'REELS' || (m.productType === null && m.mediaType === 'VIDEO');
const engagement = (m: AccountMedia) => m.likes + m.comments;

/** An account counts as active when it posted in the last 14 days. */
export function summarize(account: DiscoveredAccount, kind: string, now: number): ScoutEntry {
  const media = account.media.filter(m => Number.isFinite(m.timestamp));
  const newest = media.reduce((t, m) => Math.max(t, m.timestamp), 0);
  const daysSinceLastPost = newest ? Math.floor((now - newest) / DAY) : null;
  const med = median(media.map(engagement));
  const best = [...media].sort((a, b) => engagement(b) - engagement(a))[0];
  return {
    handle: account.username.toLowerCase(),
    kind,
    followers: account.followers,
    posts30: media.filter(m => now - m.timestamp <= 30 * DAY).length,
    daysSinceLastPost,
    medianEngagement: med,
    engagementRate: account.followers ? Math.round((med / account.followers) * 10_000) / 100 : 0,
    reelShare: media.length ? Math.round((media.filter(isReel).length / media.length) * 100) / 100 : 0,
    active: daysSinceLastPost !== null && daysSinceLastPost <= 14,
    top: best ? { permalink: best.permalink, caption: best.caption.replace(/\s+/g, ' ').slice(0, 140), engagement: engagement(best), reel: isReel(best), at: best.timestamp } : null,
  };
}

/**
 * Active accounts first, then by median engagement: who Calgary is actually
 * watching this month, not who was big in 2021.
 */
export function rank(entries: ScoutEntry[]): ScoutEntry[] {
  return [...entries].sort((a, b) => Number(b.active) - Number(a.active) || b.medianEngagement - a.medianEngagement || b.followers - a.followers);
}

// "📸 @someone", "🎥: @someone", "via @someone", "credit @someone", "video by @someone", "w/ @someone".
// Emoji often carry an invisible variation selector (U+FE0F), so it's allowed after each one.
const CREDITED = /(?:(?:📸|📷|🎥|📹|🎬|🎞)\uFE0F?|\bvia|\bcredits?|\bcred|\b(?:video|filmed|shot|photo|footage|clip) by|\bw\/)\s*[:\-–]?\s*@([a-z0-9._]{2,30})/giu;

/** Handles that watched accounts credit for their content: creators we may want on the Bench. */
export function creditedHandles(captions: string[], exclude: Iterable<string>): string[] {
  const skip = new Set([...exclude].map(h => h.toLowerCase()));
  const found = new Map<string, number>();
  for (const c of captions) {
    for (const m of c.matchAll(CREDITED)) {
      const h = m[1].toLowerCase().replace(/\.$/, '');
      if (!skip.has(h)) found.set(h, (found.get(h) ?? 0) + 1);
    }
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([h]) => h);
}

export interface OwnAccount {
  handle: string;
  business: string;
  followers: number;
  mediaCount: number;
  posts30: number;
  daysSinceLastPost: number | null;
  medianEngagement: number;
  engagementRate: number;
  reelShare: number;
  recent: Array<{ permalink: string; caption: string; mediaUrl: string | null; reel: boolean; likes: number; comments: number; at: number }>;
}

/** One of our own accounts (@calgarydaily, @calgarywatch, @vowmotion, @arctoslaunchpad) as HQ shows it. */
export function ownSummary(account: DiscoveredAccount, business: string, now: number): OwnAccount {
  const s = summarize(account, 'own', now);
  return {
    handle: s.handle, business, followers: s.followers, mediaCount: account.mediaCount, posts30: s.posts30,
    daysSinceLastPost: s.daysSinceLastPost, medianEngagement: s.medianEngagement, engagementRate: s.engagementRate, reelShare: s.reelShare,
    recent: account.media.slice(0, 12).map(m => ({
      permalink: m.permalink, caption: m.caption.replace(/\s+/g, ' ').slice(0, 220), mediaUrl: m.mediaUrl ?? null,
      reel: isReel(m), likes: m.likes, comments: m.comments, at: m.timestamp,
    })),
  };
}

export interface Outperformer {
  handle: string;
  permalink: string;
  caption: string;
  mediaUrl: string | null;
  reel: boolean;
  engagement: number;
  /** Times the account's own median: what beat its usual, not just what's big. */
  lift: number;
  at: number;
}

/**
 * Posts from the last 30 days that did best against their own account's
 * usual, so a small account's breakout counts as much as a big account's
 * ordinary post. At most `perAccount` from one account.
 */
export function outperformers(accounts: DiscoveredAccount[], now: number, limit = 24, perAccount = 3): Outperformer[] {
  const out: Outperformer[] = [];
  for (const a of accounts) {
    const media = a.media.filter(m => Number.isFinite(m.timestamp));
    const med = Math.max(1, median(media.map(engagement)));
    out.push(...media
      .filter(m => now - m.timestamp <= 30 * DAY)
      .map(m => ({
        handle: a.username.toLowerCase(), permalink: m.permalink, caption: m.caption.replace(/\s+/g, ' ').slice(0, 400),
        mediaUrl: m.mediaUrl ?? null, reel: isReel(m), engagement: engagement(m), lift: Math.round((engagement(m) / med) * 10) / 10, at: m.timestamp,
      }))
      .sort((x, y) => y.lift - x.lift)
      .slice(0, perAccount));
  }
  return out.filter(o => o.lift >= 1.2).sort((x, y) => y.lift - x.lift || y.engagement - x.engagement).slice(0, limit);
}
