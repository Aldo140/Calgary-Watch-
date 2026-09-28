// Everything @calgarydaily has ever posted, not only the agent's posts: views,
// reach, likes, comments, saves and shares per post, ranked, and grouped by
// format, topic, weekday and hour. Written to ops_health/account_history for
// /admin and the morning email, and printed in the Actions log.
//
// Instagram allows about 200 calls an hour per account, so insights are filled
// in over several runs (INSIGHT_CALLS_PER_RUN) and old posts, whose numbers no
// longer move, are only read once.

import type { Firestore } from 'firebase-admin/firestore';
import type { AccountHistory, HistoryGroup, HistoryRow } from '../../../src/types/ops';
import { brandKit } from '../lib/brand';
import { COLLECTIONS } from '../lib/firebase';
import { listAllMedia, mediaInsights, type AccountMedia } from '../lib/instagram';
import { currentToken } from './igTokens';

type Log = (m: string) => void;
const DAY = 86_400_000;
const INSIGHT_CALLS_PER_RUN = 90;

// First match wins, so the more specific topics come first.
const TOPICS: Array<[string, string, RegExp]> = [
  ['wildlife', 'Wildlife', /\b(bears?|elk|deer|moose|coyotes?|cougars?|wolf|wolves|geese|goose|owls?|bighorn|sheep|wildlife|porcupine|fox|magpie)\b/i],
  ['weather', 'Weather & sky', /\b(snow|storm|hail|chinook|tornado|thunder|lightning|rain|flood|blizzard|smoke|wildfire|northern lights|aurora|weather|cold|heat)\b/i],
  ['traffic', 'Traffic & crashes', /\b(crash|collision|traffic|deerfoot|stoney|c-?train|road closed|closure|construction|pothole)\b/i],
  ['police', 'Police & safety', /\b(police|cps|arrest|stabbing|shooting|fire|firefighters|ems|emergency|missing|theft|stolen)\b/i],
  ['sports', 'Sports', /\b(flames|stampeders|wranglers|roughnecks|cavalry|hitmen|oilers|nhl|cfl|game day|playoffs?)\b/i],
  ['stampede', 'Stampede', /\bstampede\b/i],
  ['food', 'Food & drink', /\b(restaurant|food|eats?|pizza|coffee|brunch|burger|bakery|brewery|patio|menu|opening)\b/i],
  ['events', 'Events & things to do', /\b(tonight|this weekend|today in calgary|festival|concert|market|show|tickets|free event|things to do|events?)\b/i],
  ['humour', 'Humour & relatable', /\b(pov|when you|calgarians be|only in calgary|alberta things|meme|lol|😂|🤣)\b/i],
  ['news', 'City news', /\b(city council|council|city of calgary|mayor|province|alberta government|budget|tax|housing|rent|transit)\b/i],
];

// Credited reposts: "🎥 @someone", "via @someone", "credit: @someone", "📹: @someone".
const CREDIT = /(?:🎥|📹|📸|🎬|via|credit|cred|video by|filmed by|dm for credit)\s*:?\s*@?[\w.]+/i;

export const topicOf = (caption: string): [string, string] => {
  for (const [key, label, re] of TOPICS) if (re.test(caption)) return [key, label];
  return ['other', 'Other'];
};
export const isRepost = (caption: string) => CREDIT.test(caption);
const formatOf = (m: Pick<AccountMedia, 'mediaType' | 'productType'>) =>
  m.productType === 'REELS' || m.mediaType === 'VIDEO' ? 'Reels' : m.mediaType === 'CAROUSEL_ALBUM' ? 'Carousels' : 'Single images';
const calgary = (ms: number, part: 'weekday' | 'hour') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...(part === 'weekday' ? { weekday: 'long' } : { hour: '2-digit', hourCycle: 'h23' }) }).format(new Date(ms));

/** Views where Instagram reports them (every format since 2025), else reach, else likes. */
export const reachOf = (r: HistoryRow) => r.views ?? r.reach ?? r.likes * 10;
const engagementOf = (r: HistoryRow) => r.likes + r.comments + (r.saves ?? 0) + (r.shares ?? 0);

function group(rows: HistoryRow[], keyOf: (r: HistoryRow) => [string, string]): HistoryGroup[] {
  const groups = new Map<string, { label: string; list: HistoryRow[] }>();
  for (const r of rows) {
    const [key, label] = keyOf(r);
    const g = groups.get(key) ?? { label, list: [] };
    g.list.push(r);
    groups.set(key, g);
  }
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  return [...groups.entries()].map(([key, g]) => ({
    key, label: g.label, posts: g.list.length,
    medianViews: median(g.list.map(reachOf)),
    medianEngagement: median(g.list.map(engagementOf)),
    best: Math.max(...g.list.map(reachOf)),
  })).sort((a, b) => b.medianViews - a.medianViews);
}

/** The summary, from the rows. Pure, so it is tested. */
export function summarizeHistory(rows: HistoryRow[], followers: number | null, now: number): AccountHistory {
  const withNumbers = rows.filter(r => r.fetchedAt);
  const byViews = [...rows].sort((a, b) => reachOf(b) - reachOf(a));
  return {
    updatedAt: now, followers, totalPosts: rows.length, measuredPosts: withNumbers.length,
    top: byViews.slice(0, 25),
    byFormat: group(rows, r => [r.format, r.format]),
    byTopic: group(rows, r => [r.topic, r.topicLabel]),
    byOrigin: group(rows, r => (r.repost ? ['repost', 'Credited reposts'] : ['original', 'Original posts'])),
    byWeekday: group(rows, r => [r.weekday, r.weekday]),
    byHour: group(rows, r => { const h = Number(r.hour); const k = h < 9 ? 'a' : h < 12 ? 'b' : h < 15 ? 'c' : h < 18 ? 'd' : h < 21 ? 'e' : 'f'; return [k, { a: 'Before 9', b: '9 to noon', c: 'Noon to 3', d: '3 to 6', e: '6 to 9', f: 'After 9' }[k]!]; }),
    rows: byViews.map(r => ({ ...r, caption: r.caption.slice(0, 160) })),
  };
}

export async function collectAccountHistory(db: Firestore, now: number, log: Log): Promise<AccountHistory | null> {
  const token = await currentToken(db, 'calgarydaily');
  if (!token) { log('No @calgarydaily token; account history skipped.'); return null; }
  const ref = db.collection(COLLECTIONS.health).doc('account_history');
  const previous = new Map(((((await ref.get()).get('rows')) ?? []) as HistoryRow[]).map(r => [r.id, r]));

  const media = await listAllMedia(token, brandKit('calgarydaily').handle);
  let calls = 0, failures = 0;
  const rows: HistoryRow[] = [];
  for (const m of media) {
    const old = previous.get(m.id);
    const [topic, topicLabel] = topicOf(m.caption);
    const row: HistoryRow = {
      id: m.id, permalink: m.permalink, caption: m.caption, timestamp: m.timestamp, format: formatOf(m),
      topic, topicLabel, repost: isRepost(m.caption), weekday: calgary(m.timestamp, 'weekday'), hour: calgary(m.timestamp, 'hour'),
      likes: m.likes, comments: m.comments,
      views: old?.views ?? null, reach: old?.reach ?? null, saves: old?.saves ?? null, shares: old?.shares ?? null, fetchedAt: old?.fetchedAt ?? null,
    };
    // New posts are re-read for three weeks; older ones once.
    const stale = !row.fetchedAt || (m.timestamp > now - 21 * DAY && row.fetchedAt < now - 20 * 3_600_000);
    if (stale && calls < INSIGHT_CALLS_PER_RUN && failures < 3) {
      calls++;
      try {
        const i = await mediaInsights(token, m.id);
        Object.assign(row, { views: i.views ?? null, reach: i.reach ?? null, saves: i.saved ?? 0, shares: i.shares ?? 0, fetchedAt: now });
      } catch (e) {
        if (++failures === 1) log(`account history: insights failed (${e instanceof Error ? e.message : e})`);
      }
    }
    rows.push(row);
  }
  const followers = (((await db.collection(COLLECTIONS.health).doc('performance').get()).get('followers')) ?? {}) as Record<string, number>;
  const latest = Object.keys(followers).sort().at(-1);
  const history = summarizeHistory(rows, latest ? followers[latest] : null, now);
  await ref.set(history);

  log(`account history: ${rows.length} posts, numbers for ${history.measuredPosts} (${calls} insight calls this run)`);
  const line = (g: HistoryGroup) => `  ${g.label}: ${g.posts} posts, median ${g.medianViews} views, median ${g.medianEngagement} interactions, best ${g.best}`;
  for (const [name, gs] of [['format', history.byFormat], ['topic', history.byTopic], ['origin', history.byOrigin], ['hour', history.byHour], ['weekday', history.byWeekday]] as const) {
    log(`by ${name}:`); gs.forEach(g => log(line(g)));
  }
  log('top 15:');
  history.top.slice(0, 15).forEach((r, i) => log(`  ${i + 1}. ${reachOf(r)} views · ${r.likes} likes · ${r.format} · ${r.topicLabel}${r.repost ? ' · repost' : ''} · ${r.permalink} · ${r.caption.replace(/\s+/g, ' ').slice(0, 70)}`));
  return history;
}
