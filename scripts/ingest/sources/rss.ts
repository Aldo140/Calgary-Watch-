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
import { isSetElsewhere, loadCommunityPoints, locateInText } from './community-locator.js';

// ---------------------------------------------------------------------------
// Feed definitions
// ---------------------------------------------------------------------------

// Calgary Police releases have their own source (calgary-police-news.ts).
const FEEDS = NEWS_FEEDS.filter((feed) => !feed.police);

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
const NOT_AN_INCIDENT = /\b(opinion|editorial|column|podcast|letters?:|sentenc(ed|ing)|trial|pleads? guilty|appeal|parole|inquiry|budget|study finds|report finds|statistics|crime rate|crime severity index|year in review)\b/i;

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
  return match[1]
    .replace(/<[^>]+>/g, ' ')  // strip any nested tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

interface RssItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

function parseRssItems(xml: string): RssItem[] {
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
    if (title && link) {
      items.push({ title, description, link, pubDate });
    }
  }
  return items;
}

function dedupeKey(link: string): string {
  return 'news_rss:' + createHash('sha1').update(link).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchNewsFeedsCalgary(): Promise<NormalizedIncident[]> {
  const now = Date.now();
  const results: NormalizedIncident[] = [];
  const failures: string[] = [];
  const points = await loadCommunityPoints();

  await Promise.allSettled(
    FEEDS.map(async (feed) => {
      try {
        // Feeds that move keep their old address as a fallback; the first that answers wins.
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

        if (!res) {
          failures.push(`${feed.name} could not be reached`);
          console.warn(`[rss] ${feed.name} could not be reached`);
          return;
        }
        if (!res.ok) {
          const message = `${feed.name} responded HTTP ${res.status}`;
          failures.push(message);
          console.warn(`[rss] ${message}`);
          return;
        }

        const xml = await res.text();
        const items = parseRssItems(xml);

        for (const item of items) {
          const pubMs = item.pubDate ? new Date(item.pubDate).getTime() : now;
          if (isNaN(pubMs) || now - pubMs > LOOKBACK_MS || pubMs > now + 60 * 60 * 1000) continue;

          const category = classifyText(item.title, item.description);
          if (!category) continue;

          const text = `${item.title} ${item.description}`;
          if (isSetElsewhere(item.title, text)) continue;
          const location = locateInText(text, points);
          if (!location) continue;

          // Build a clean description from the RSS snippet (strip HTML noise)
          const cleanDesc = item.description.slice(0, 400).trim() ||
            `${category.charAt(0).toUpperCase() + category.slice(1)} reported in Calgary. See full article for details.`;

          results.push({
            title: item.title.slice(0, 100),
            description: cleanDesc,
            timestamp: pubMs,
            category,
            neighborhood: location.neighborhood,
            lat: location.lat,
            lng: location.lng,
            source_name: feed.name,
            source_url: item.link,
            source_type: 'news_rss',
            data_source: 'official',
            dedup_key: dedupeKey(item.link),
            expires_at: pubMs + (category === 'crime'
              ? 28 * 24 * 60 * 60 * 1000
              : category === 'emergency'
                ? 3 * 24 * 60 * 60 * 1000
                : 2 * 24 * 60 * 60 * 1000),
            verified_status: 'community_confirmed',
            report_count: 1,
            email: 'ingest@calgarywatch.app',
            name: feed.name,
            anonymous: false,
          });
        }

        console.log(`[rss] ${feed.name}: ${items.length} items parsed, ${results.filter(r => r.source_name === feed.name).length} matched.`);
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err ?? 'Unknown error'));
        console.warn(`[rss] ${feed.name} failed:`, err);
      }
    })
  );

  if (failures.length === FEEDS.length) {
    throw new Error(`Every configured news feed failed: ${failures.join('; ')}`);
  }

  return results;
}
