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
const CREDITED = /(?:📸|🎥|📹|🎬|via|credit(?:s)?|cred|video by|filmed by|shot by|photo by|w\/)\s*:?\s*@([a-z0-9._]{2,30})/gi;

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
