// What's working on @calgarydaily. Once a day: pull Instagram's numbers for
// every post published in the last three weeks, count followers, and write a
// summary (ops_health/performance) that the admin shows, the morning email
// quotes, and the drafting step learns from (bestCaptions).

import type { Firestore } from 'firebase-admin/firestore';
import type { BrandId, OpsPerformance, OpsPost, PerformanceRow, PostInsights } from '../../../src/types/ops';
import { BRANDS, brandKit } from '../lib/brand';
import { COLLECTIONS } from '../lib/firebase';
import { accountStats, mediaInsights } from '../lib/instagram';
import { calgaryDate } from '../lib/time';
import { currentToken } from './igTokens';

type Log = (m: string) => void;
const DAY = 86_400_000;

const formatOf = (p: OpsPost) => (p.videoUrl ? 'reel' : (p.imageUrls?.length ?? 0) > 1 ? 'carousel' : 'image');
const FORMAT_LABEL: Record<string, string> = { reel: 'Reels', carousel: 'Carousels', image: 'Single images' };
const kindOf = (p: OpsPost) => {
  const fp = p.fingerprint;
  if (fp.includes('|weekend-reel|')) return ['weekend', 'Weekend Reel'];
  if (fp.includes('|today|')) return ['today', 'Today roundup'];
  if (fp.includes('|tonight|')) return ['tonight', 'Tonight roundup'];
  if (fp.includes('|draft|')) return [p.template, p.template === 'take' ? 'Our take' : p.template === 'news' ? 'News' : 'Hand-written'];
  return ['spotlight', 'Spotlight'];
};
const hourOf = (ms: number) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));

function rows(posts: OpsPost[], keyOf: (p: OpsPost) => [string, string]): PerformanceRow[] {
  const groups = new Map<string, { label: string; list: PostInsights[] }>();
  for (const p of posts) {
    const [key, label] = keyOf(p);
    const g = groups.get(key) ?? { label, list: [] };
    g.list.push(p.insights!);
    groups.set(key, g);
  }
  return [...groups.entries()].map(([key, g]) => ({
    key, label: g.label, posts: g.list.length,
    avgReach: Math.round(g.list.reduce((s, i) => s + i.reach, 0) / g.list.length),
    avgSavesShares: Math.round(10 * g.list.reduce((s, i) => s + i.saves + i.shares, 0) / g.list.length) / 10,
  })).sort((a, b) => b.avgReach - a.avgReach);
}

/** The summary, from posts that already have numbers. Pure, so it is tested. */
export function computePerformance(posts: OpsPost[], followers: Record<string, number>, now: number): OpsPerformance {
  const measured = posts.filter(p => p.status === 'published' && p.insights && (p.publishedAt ?? 0) > now - 30 * DAY);
  const late = posts.filter(p => p.status === 'published' && p.scheduledFor && p.publishedAt && p.publishedAt > now - 7 * DAY && String(p.reviewedByEmail ?? '').startsWith('auto'));
  const slotLabel = (h: number) => (h < 11 ? 'Morning (before 11)' : h < 15 ? 'Midday (11 to 3)' : h < 19 ? 'Late afternoon (3 to 7)' : 'Evening (after 7)');
  const slotKey = (h: number) => (h < 11 ? 'a-morning' : h < 15 ? 'b-midday' : h < 19 ? 'c-afternoon' : 'd-evening');
  return {
    updatedAt: now,
    followers,
    byFormat: rows(measured, p => [formatOf(p), FORMAT_LABEL[formatOf(p)]]),
    bySlot: rows(measured, p => { const h = hourOf(p.publishedAt!); return [slotKey(h), slotLabel(h)]; }),
    byKind: rows(measured, p => kindOf(p) as [string, string]),
    top: [...measured].sort((a, b) => b.insights!.reach - a.insights!.reach).slice(0, 5).map(p => ({
      headline: p.imageText.headline, permalink: p.permalink ?? '', reach: p.insights!.reach,
      savesShares: p.insights!.saves + p.insights!.shares, format: formatOf(p),
    })),
    avgDelayMinutes: late.length ? Math.round(late.reduce((s, p) => s + Math.max(0, p.publishedAt! - p.scheduledFor!), 0) / late.length / 60_000) : null,
  };
}

/**
 * Captions of the best-performing listing posts (by saves and shares, then reach),
 * handed to the writer as extra voice examples. News and opinion are left out:
 * they're written by hand and their facts don't carry over.
 */
export function bestCaptions(posts: OpsPost[], brand: BrandId, now: number, n = 2): string[] {
  return posts
    .filter(p => p.brand === brand && p.status === 'published' && p.insights && !p.fingerprint.includes('|draft|') && (p.publishedAt ?? 0) > now - 30 * DAY)
    .sort((a, b) => (b.insights!.saves + b.insights!.shares) - (a.insights!.saves + a.insights!.shares) || b.insights!.reach - a.insights!.reach)
    .slice(0, n)
    .map(p => p.caption);
}

export async function collectInsights(db: Firestore, now: number, log: Log): Promise<void> {
  const perfRef = db.collection(COLLECTIONS.health).doc('performance');
  const followers: Record<string, number> = { ...(((await perfRef.get()).get('followers')) ?? {}) };
  const published = (await db.collection(COLLECTIONS.posts).where('status', '==', 'published').get()).docs;
  for (const brand of BRANDS) {
    const token = await currentToken(db, brand);
    if (!token) continue;
    try {
      const a = await accountStats(token, brandKit(brand).handle);
      followers[calgaryDate(now)] = a.followers;
      log(`${brand}: ${a.followers} followers`);
    } catch (e) { log(`${brand}: follower count failed: ${e instanceof Error ? e.message : e}`); }

    let updated = 0, failures = 0;
    for (const d of published) {
      const p = d.data() as OpsPost;
      // Numbers settle after a few weeks; stop refreshing after 21 days.
      if (p.brand !== brand || !p.igMediaId || (p.publishedAt ?? 0) < now - 21 * DAY) continue;
      try {
        const m = await mediaInsights(token, p.igMediaId);
        const insights: PostInsights = {
          reach: m.reach ?? 0, views: m.views ?? null, likes: m.likes ?? 0, comments: m.comments ?? 0,
          saves: m.saved ?? 0, shares: m.shares ?? 0, fetchedAt: now,
        };
        await d.ref.update({ insights });
        updated++;
      } catch (e) {
        if (++failures === 1) log(`${brand}: insights failed (${e instanceof Error ? e.message : e}). The token may lack instagram_business_manage_insights.`);
      }
    }
    log(`${brand}: numbers refreshed for ${updated} posts`);
  }
  // Keep 400 days of follower counts.
  for (const k of Object.keys(followers).sort().slice(0, -400)) delete followers[k];
  const posts = (await db.collection(COLLECTIONS.posts).where('status', '==', 'published').get()).docs.map(d => d.data() as OpsPost);
  await perfRef.set(computePerformance(posts, followers, now));
}
