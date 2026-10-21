import { CALGARY_COMMUNITIES } from '../data/calgaryCommunities';
import { SAFETY_TOPICS } from '../content/safetyTopics';
import type { NewsFeed } from '../content/newsFeeds';

/**
 * Local crime and safety headlines for the /safety pages and search. Built at
 * deploy time by scripts/news/export-crime-news.ts from the feeds in
 * content/newsFeeds.ts, merged with what was already published, and bundled
 * as src/generated/crime-news.json.
 *
 * Only the headline, outlet, link, time and the topics and community it names
 * are kept. The summary is read to classify a story, then dropped.
 */

export interface SafetyHeadline {
  title: string;
  url: string;
  source: string;
  /** ISO time the outlet published it. */
  publishedAt: string;
  topics: string[];
  community?: string;
  police?: boolean;
}

export interface FeedStatus { id: string; name: string; ok: boolean; items: number; url?: string; error?: string }

export interface CrimeNewsFile { updatedAt: string | null; feeds: FeedStatus[]; items: SafetyHeadline[] }

export interface FeedItem { title: string; summary: string; link: string; published: string }

/** How long a headline stays listed, and how many the file keeps. */
export const KEEP_DAYS = 180;
export const KEEP_MAX = 600;

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gi, '&');
}

const clean = (value: string) => decode(decode(value).replace(/<[^>]+>/g, ' ')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function tag(chunk: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i').exec(chunk);
  return m ? clean(m[1]) : '';
}

/** RSS 2.0 items or Atom entries, with no XML dependency. */
export function parseFeed(xml: string): FeedItem[] {
  return [...xml.matchAll(/<(item|entry)[\s>]([\s\S]*?)<\/\1>/gi)].map(([, , chunk]) => ({
    title: tag(chunk, 'title'),
    summary: (tag(chunk, 'description') || tag(chunk, 'summary') || tag(chunk, 'content')).slice(0, 1500),
    link: tag(chunk, 'link') || (/<link[^>]*href="([^"]+)"/i.exec(chunk)?.[1] ?? ''),
    published: tag(chunk, 'pubDate') || tag(chunk, 'published') || tag(chunk, 'updated') || tag(chunk, 'dc:date'),
  })).filter(i => i.title && /^https?:\/\//.test(i.link));
}

// Sport and entertainment use the same words ("Flames' shooting woes").
const NOT_CRIME = /\b(?:Flames|Stampeders|Wranglers|Hitmen|Roughnecks|Cavalry|Surge|Oilers|NHL|CFL|WHL|goalie|hockey|playoffs?|power play|box office|film(?:ing)?|movie)\b/i;

/** Topic slugs a story belongs to, from its headline and summary. */
export function topicsFor(title: string, summary = ''): string[] {
  const text = `${title} ${summary}`;
  if (NOT_CRIME.test(title)) return [];
  const hits = SAFETY_TOPICS.filter(t => t.patterns.some(re => re.test(text))).map(t => t.slug);
  return hits.filter(slug => !SAFETY_TOPICS.find(t => t.slug === slug)?.notWith?.some(o => hits.includes(o)));
}

// Community names that are also ordinary words or other places.
const AMBIGUOUS = new Set(['Mission', 'Temple', 'Legacy', 'Dover', 'Citadel', 'Cornerstone', 'Crossroads', 'Richmond', 'Belmont', 'Hamptons', 'Fairview', 'Parkland', 'Lucas', 'Sherwood', 'Evergreen', 'Homestead', 'Redstone', 'Livingston', 'Cityscape', 'Highwood', 'Rosemont', 'Glendale', 'Lakeview', 'Mayfair', 'Somerset', 'Southview', 'Meridian', 'Manchester', 'Downtown', 'University', 'Discovery']);
const title = (s: string) => s.replace(/\b\p{Ll}/gu, c => c.toUpperCase());
const COMMUNITY_NAMES = CALGARY_COMMUNITIES
  .flatMap(c => [c.name, ...(c.aliases ?? [])].flatMap(n => n.split('/')).map(n => ({ name: title(n.trim()), community: c.name.split('/')[0] })))
  .filter(n => n.name.length > 3 && !AMBIGUOUS.has(n.name))
  .sort((a, b) => b.name.length - a.name.length)
  .map(n => ({ ...n, re: new RegExp(`(?<![\\p{L}])${n.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u') }));

/** The first Calgary community a story names, by its capitalized proper name. */
export function communityIn(text: string): string | undefined {
  let best: { at: number; community: string } | undefined;
  for (const n of COMMUNITY_NAMES) {
    const at = text.search(n.re);
    if (at >= 0 && (!best || at < best.at)) best = { at, community: n.community };
  }
  return best?.community;
}

/** True when a story is about Calgary, not only filed by a Calgary newsroom. */
export function isCalgaryStory(text: string, police = false): boolean {
  return police || /\b(?:Calgar(?:y|ian|ians)|YYC)\b/i.test(text) || !!communityIn(text);
}

/** A feed item as a headline, or null when it isn't a Calgary crime or safety story. */
export function toHeadline(item: FeedItem, feed: Pick<NewsFeed, 'name' | 'police'>): SafetyHeadline | null {
  const text = `${item.title} ${item.summary}`;
  const topics = topicsFor(item.title, item.summary);
  const at = Date.parse(item.published);
  if (!topics.length || Number.isNaN(at) || !isCalgaryStory(text, feed.police)) return null;
  const community = communityIn(text);
  return {
    title: item.title.replace(/\s+[|–-]\s+(?:CBC News|CTV News|Global News|CityNews)[^|]*$/i, '').slice(0, 220),
    url: item.link.trim(),
    source: feed.name,
    publishedAt: new Date(at).toISOString(),
    topics,
    ...(community ? { community } : {}),
    ...(feed.police ? { police: true } : {}),
  };
}

const titleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Fresh headlines folded into what's already published: one row per link and
 * per headline, newest first, nothing older than KEEP_DAYS or from the future.
 * Topics are recomputed from the headline when a pattern changes, but a row
 * keeps any topic it was given from its summary.
 */
export function mergeHeadlines(existing: readonly SafetyHeadline[], fresh: readonly SafetyHeadline[], now = Date.now()): SafetyHeadline[] {
  const byUrl = new Map<string, SafetyHeadline>();
  const titles = new Set<string>();
  const oldest = now - KEEP_DAYS * 86_400_000;
  for (const h of [...fresh, ...existing]) {
    const at = Date.parse(h.publishedAt);
    if (Number.isNaN(at) || at < oldest || at > now + 3_600_000) continue;
    const key = titleKey(h.title);
    if (byUrl.has(h.url) || titles.has(key)) continue;
    const topics = [...new Set([...topicsFor(h.title), ...h.topics])].filter(s => SAFETY_TOPICS.some(t => t.slug === s));
    if (!topics.length) continue;
    byUrl.set(h.url, { ...h, topics });
    titles.add(key);
  }
  return [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, KEEP_MAX);
}

export function headlinesFor(items: readonly SafetyHeadline[], slug?: string, limit = 40): SafetyHeadline[] {
  return (slug ? items.filter(h => h.topics.includes(slug)) : items).slice(0, limit);
}

/** Communities named most often in a topic's headlines, for "Where it's been reported". */
export function communitiesFor(items: readonly SafetyHeadline[], limit = 12): Array<{ community: string; count: number }> {
  const counts = new Map<string, number>();
  for (const h of items) if (h.community) counts.set(h.community, (counts.get(h.community) ?? 0) + 1);
  return [...counts].map(([community, count]) => ({ community, count }))
    .sort((a, b) => b.count - a.count || a.community.localeCompare(b.community)).slice(0, limit);
}

/** Headlines that contain every word of a search (ignoring "calgary" and filler). */
export function headlinesForQuery(items: readonly SafetyHeadline[], q: string, limit = 6): SafetyHeadline[] {
  const words = q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 2 && !['calgary', 'yyc', 'the', 'and', 'news', 'near', 'recent', 'latest'].includes(w));
  if (!words.length) return [];
  return items.filter(h => {
    const text = `${h.title} ${h.community ?? ''}`.toLowerCase();
    return words.every(w => new RegExp(`\\b${w}`).test(text));
  }).slice(0, limit);
}
