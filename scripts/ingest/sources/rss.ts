/**
 * News RSS feeds — Calgary newsrooms (CTV, CBC, Global, CityNews, LiveWire)
 *
 * Fetches and parses RSS/Atom XML feeds from Calgary local news outlets,
 * filters for safety-relevant stories, and normalises them.
 *
 * No API key required.
 * Dedup key: news_rss:<sha1-of-link>
 * Crime stories remain available for the weekly digest; time-sensitive road,
 * weather and service items retain short expiry windows.
 */

import { createHash } from 'crypto';
import type { IncidentCategory } from '../../../src/types/index.js';
import type { NormalizedIncident } from '../types.js';
import { NEWS_FEEDS } from '../../../src/content/newsFeeds.js';
import { cleanText } from '../../../src/lib/cleanText.js';
import { isSetElsewhere, loadCommunityPoints, locateInText, type CommunityPoint } from './community-locator.js';

// ---------------------------------------------------------------------------
// Feed definitions
// ---------------------------------------------------------------------------

// Calgary Police releases have their own source (calgary-police-news.ts).
interface IngestFeed { id: string; name: string; urls: string[]; aggregator?: boolean }

/**
 * Google News searches for Calgary crime. The newsroom feeds list their last
 * 10-50 stories of every kind, so a week of Calgary crime rarely survives in
 * them (the 2026-10-24 06:25 run parsed 85 items and kept none). A search
 * returns crime stories only, from every Calgary outlet, and each item names
 * its outlet in <source>, which is who the map credits. Stories are still
 * placed only when they name a Calgary community or quadrant.
 */
const SEARCH_FEEDS: IngestFeed[] = [
  'calgary police charged OR arrested OR "police say"',
  'calgary stabbing OR shooting OR robbery OR homicide OR carjacking',
  'calgary break-in OR theft OR stolen OR assault OR fraud',
].map((q, n) => ({
  id: `google-news-${n + 1}`,
  name: 'Google News',
  aggregator: true,
  urls: [`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:7d`)}&hl=en-CA&gl=CA&ceid=CA:en`],
}));

const FEEDS: IngestFeed[] = [...NEWS_FEEDS.filter((feed) => !feed.police), ...SEARCH_FEEDS];

// ---------------------------------------------------------------------------
// Keyword → category (ordered: first match wins)
// ---------------------------------------------------------------------------

// Stories are read for a week, not a day: a feed lists its last 20-50 items,
// and a 24-hour window threw most of a story's life away whenever a run was
// delayed. Re-reading an old item is harmless; it upserts by link.
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;


/**
 * Specific crime words first, then serious collisions, then fires and
 * hazards, and only then the generic police vocabulary. The generic words used
 * to come first, so "Calgary police say a pick-up struck a man on Deerfoot"
 * was filed as a crime because the story quoted the police.
 */
const RULES: { patterns: RegExp[]; category: IncidentCategory }[] = [
  {
    category: 'crime',
    patterns: [
      /\b(shooting|shot (dead|and killed)|gunshot|firearms?|shots? fired|gunfire)\b/i,
      /\b(stabb(ing|ed)|knife attack|homicide|murder|manslaughter|death investigation|suspicious death)\b/i,
      /\b(robbery|robbed|break.?ins?|broke into|theft|thefts|stolen|carjack(ing|ed)?|fraud|scam(med)?|extortion|sexual assault|sex assault|assault(ed)?|kidnap(ping|ped)?|abduct(ion|ed)|arson|vandal(ism|ized)|hate crime|human trafficking)\b/i,
      /\b(missing (person|child|woman|man|teen|girl|boy|senior)|amber alert)\b/i,
      /\b(drug (bust|seizure|trafficking)|fentanyl|cocaine|meth(amphetamine)?)\b/i,
      /\b(attack(ed|s)?|bear.?spray(ed)?|swarm(ed|ing)|brawl|machete|armed|hostage|standoff|threat(s|ened)|weapons?|home invasion|smash.and.grab|break and enter|catalytic converters?|auto theft|car prowl(ing)?|luring|child (sexual )?exploitation|voyeurism|hold.and.secure|lockdown)\b/i,
    ],
  },
  {
    category: 'traffic',
    patterns: [
      /\b(fatal (crash|collision|accident)|deadly crash|killed in (a )?(crash|collision))\b/i,
      /\b(struck and killed|hit and run|hit-and-run|multi.?vehicle|serious (collision|crash)|pedestrian (struck|hit|killed)|cyclist (struck|hit|killed))\b/i,
      /\b(road closed|highway (closure|blocked)|Deerfoot|Crowchild|Glenmore|Stoney Trail)\b/i,
    ],
  },
  {
    category: 'emergency',
    patterns: [
      /\b(structure fire|house fire|apartment fire|building fire|blaze|fire crews|firefighters)\b/i,
      /\b(explosion|blast|gas leak|evacuate|evacuation order|hazmat|chemical)\b/i,
      /\b(flood(ing| warning| watch| advisory)?|wildfire|emergency declaration)\b/i,
    ],
  },
  {
    category: 'crime',
    patterns: [
      /\b(arrest(ed)?|charged|charges laid|suspects?|police seek|wanted|warrants?)\b/i,
    ],
  },
  {
    category: 'weather',
    patterns: [
      /\b(tornado|funnel cloud|severe thunderstorm warning|hailstorm|blizzard)\b/i,
      /\b(freezing rain|ice storm|snowfall warning|winter storm|extreme cold)\b/i,
      /\b(power outage|blackout|utilities (down|affected))\b/i,
    ],
  },
  {
    category: 'infrastructure',
    patterns: [
      /\b(water main (break|burst)|water (advisory|restriction|outage))\b/i,
      /\b(CTrain|LRT|transit (disruption|delay|suspension))\b/i,
      /\b(bridge (closed|collapse|damage)|sinkhole)\b/i,
    ],
  },
];

/** Court, policy and opinion pieces use crime words without being an incident on a street. */
const NOT_AN_INCIDENT = /\b(opinion|editorial|column|podcast|letters?:|sentenc(ed|ing)|trial|pleads? guilty|appeal|parole|inquiry|budget|study finds|report finds|statistics|crime rate|crime severity index|year in review|court|judge|jury|verdict|convicted|acquitted|bail hearing|lawsuit|class action|ruling|inquest|years? (ago|later)|anniversary|cold case|documentary|tips to|how to|what to know|watch:|video:|listen:)\b/i;

export function classifyText(title: string, description: string): IncidentCategory | null {
  if (NOT_AN_INCIDENT.test(title)) return null;
  const combined = `${title} ${description}`;
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(combined))) return rule.category;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Minimal XML parser (no external deps)
// ---------------------------------------------------------------------------

function extractXmlTag(xml: string, tag: string): string {
  // Handles <tag>...</tag> and CDATA sections
  const re = new RegExp(`<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*<\\/${tag}>`, 'i');
  const match = re.exec(xml);
  if (!match) return '';
  return tidyFeedText(match[1]);
}

/**
 * Feed text to one clean line. Entities are decoded before tags are stripped,
 * because many feeds escape their HTML ("&lt;p&gt;"), and every entity is
 * decoded, numeric ones too: "&#8216;Got ripped off&#8217;" reached the map
 * as written.
 */
export function tidyFeedText(value: string): string {
  return cleanText(cleanText(value.replace(/<!\[CDATA\[|\]\]>/g, ''))
    .replace(/<[^>]+>/g, ' '));
}

export interface RssItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  /** The outlet an aggregator item came from (<source>). */
  outlet?: string;
}

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  // Split on <item> or <entry> boundaries
  const itemPattern = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(xml)) !== null) {
    const chunk = match[1];
    const title = extractXmlTag(chunk, 'title');
    const description = extractXmlTag(chunk, 'description') ||
                        extractXmlTag(chunk, 'summary') ||
                        extractXmlTag(chunk, 'content');
    const link = extractXmlTag(chunk, 'link') ||
                 (/<link[^>]*href="([^"]+)"/i.exec(chunk)?.[1] ?? '');
    const pubDate = extractXmlTag(chunk, 'pubDate') ||
                    extractXmlTag(chunk, 'published') ||
                    extractXmlTag(chunk, 'updated');
    const outlet = extractXmlTag(chunk, 'source') || undefined;
    if (title && link) {
      items.push({ title, description, link, pubDate, outlet });
    }
  }
  return items;
}

function dedupeKey(link: string): string {
  return 'news_rss:' + createHash('sha1').update(link).digest('hex').slice(0, 16);
}

/** "Headline - Calgary Herald" → "Headline", for aggregator items. */
function stripOutlet(title: string, outlet?: string): string {
  if (!outlet) return title;
  const suffix = ` - ${outlet}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title.replace(/\s+[-–|]\s+[^-–|]{2,60}$/, '').trim();
}

/** A headline reduced to its words, so the same story from two feeds matches. */
export function headlineKey(title: string): string {
  return title.toLowerCase().replace(/[‘’'"“”]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Outlets an aggregator item may be credited to: Calgary and national newsrooms, not blogs or wires of wires. */
const TRUSTED_OUTLET = /\b(calgary herald|calgary sun|ctv|cbc|global news|citynews|livewire calgary|calgary journal|the canadian press|cp24|toronto star|national post|the globe and mail|edmonton journal|rdnewsnow|calgary city news|660 news|cityline|the weather network)\b/i;

export type NewsDecision =
  | { keep: true; incident: NormalizedIncident }
  | { keep: false; reason: string };

/** One feed item in, one decision out (kept, or the reason it was dropped). Shared by the ingest and the audit. */
export function judgeNewsItem(feed: IngestFeed, item: RssItem, points: CommunityPoint[], now = Date.now()): NewsDecision {
  const pubMs = item.pubDate ? new Date(item.pubDate).getTime() : now;
  if (isNaN(pubMs) || pubMs > now + 60 * 60 * 1000) return { keep: false, reason: 'no usable date' };
  if (now - pubMs > LOOKBACK_MS) return { keep: false, reason: 'older than a week' };
  if (feed.aggregator && !(item.outlet && TRUSTED_OUTLET.test(item.outlet))) {
    return { keep: false, reason: `outlet not on the list (${item.outlet ?? 'none'})` };
  }
  const title = stripOutlet(item.title, item.outlet);
  const category = classifyText(title, item.description);
  if (!category) return { keep: false, reason: 'not an incident' };

  const text = `${title} ${item.description}`;
  if (isSetElsewhere(title, text)) return { keep: false, reason: 'set outside Calgary' };
  const location = locateInText(text, points);
  if (!location) return { keep: false, reason: 'names no Calgary community or quadrant' };

  const source = feed.aggregator ? item.outlet! : feed.name;
  const description = item.description && headlineKey(item.description) !== headlineKey(title) && !item.description.startsWith(title)
    ? item.description.slice(0, 400).trim()
    : `${source} reported this story. Open the article for details.`;

  return {
    keep: true,
    incident: {
      title: title.slice(0, 100),
      description,
      timestamp: pubMs,
      category,
      neighborhood: location.neighborhood,
      lat: location.lat,
      lng: location.lng,
      source_name: source,
      source_url: item.link,
      source_type: 'news_rss',
      data_source: 'official',
      // The same story from a newsroom feed and a search shares a headline, so
      // keying on the headline (not the link) writes it once.
      dedup_key: dedupeKey(headlineKey(title)),
      expires_at: pubMs + (category === 'crime'
        ? NEWS_CRIME_TTL_MS
        : category === 'emergency'
          ? 3 * 24 * 60 * 60 * 1000
          : 2 * 24 * 60 * 60 * 1000),
      verified_status: 'community_confirmed',
      report_count: 1,
      email: 'ingest@calgarywatch.app',
      name: source,
      anonymous: false,
    },
  };
}

/** News crime stays 45 days, so "All" on the map holds a month and a half of stories. */
export const NEWS_CRIME_TTL_MS = 45 * 24 * 60 * 60 * 1000;

export interface FeedRead { feed: IngestFeed; items: RssItem[]; error?: string }

/** Fetch every feed; a feed that moved keeps its old address as a fallback. */
export async function readNewsFeeds(): Promise<FeedRead[]> {
  return Promise.all(FEEDS.map(async (feed): Promise<FeedRead> => {
    let res: Response | null = null;
    for (const url of feed.urls) {
      res = await fetch(url, {
        headers: {
          'User-Agent': 'CalgaryWatch-Ingest/1.0 (community safety aggregator)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (res?.ok) break;
    }
    if (!res) return { feed, items: [], error: `${feed.name} could not be reached` };
    if (!res.ok) return { feed, items: [], error: `${feed.name} responded HTTP ${res.status}` };
    try {
      return { feed, items: parseRssItems(await res.text()) };
    } catch (err) {
      return { feed, items: [], error: err instanceof Error ? err.message : String(err) };
    }
  }));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchNewsFeedsCalgary(): Promise<NormalizedIncident[]> {
  const now = Date.now();
  const points = await loadCommunityPoints();
  const reads = await readNewsFeeds();
  const byKey = new Map<string, NormalizedIncident>();
  const failures: string[] = [];

  // Newsroom feeds first, so a story both carry is credited with the outlet's own link.
  for (const read of [...reads].sort((a, b) => Number(Boolean(a.feed.aggregator)) - Number(Boolean(b.feed.aggregator)))) {
    if (read.error) {
      failures.push(read.error);
      console.warn(`[rss] ${read.error}`);
      continue;
    }
    let kept = 0;
    for (const item of read.items) {
      const decision = judgeNewsItem(read.feed, item, points, now);
      if (!decision.keep || byKey.has(decision.incident.dedup_key)) continue;
      byKey.set(decision.incident.dedup_key, decision.incident);
      kept++;
    }
    console.log(`[rss] ${read.feed.name} (${read.feed.id}): ${read.items.length} items parsed, ${kept} matched.`);
  }

  if (failures.length === FEEDS.length) {
    throw new Error(`Every configured news feed failed: ${failures.join('; ')}`);
  }
  return [...byKey.values()];
}
