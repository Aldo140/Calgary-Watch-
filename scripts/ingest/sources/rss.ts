/**
 * News RSS feeds — CTV Calgary & Global News Calgary
 *
 * Fetches and parses RSS/Atom XML feeds from Calgary local news outlets,
 * filters for safety-relevant stories, and normalises them.
 *
 * No API key required.
 * Dedup key: news_rss:<sha1-of-link>
 * TTL: 12 hours from ingest (news stories stay relevant longer than Reddit posts)
 */

import { createHash } from 'crypto';
import type { IncidentCategory } from '../../../src/types/index.js';
import type { NormalizedIncident } from '../types.js';
import { NEIGHBOURHOOD_COORDS } from '../../../src/data/neighbourhoodCoords.js';

// ---------------------------------------------------------------------------
// Feed definitions
// ---------------------------------------------------------------------------

const FEEDS = [
  {
    name: 'CTV News Calgary',
    url: 'https://calgary.ctvnews.ca/rss/ctv-news-calgary-1.822551',
  },
  {
    name: 'Global News Calgary',
    url: 'https://globalnews.ca/calgary/feed/',
  },
  {
    name: 'CBC Calgary',
    url: 'https://www.cbc.ca/cmlink/rss-canada-calgary',
  },
];

// ---------------------------------------------------------------------------
// Keyword → category (ordered: first match wins)
// ---------------------------------------------------------------------------

const RULES: { patterns: RegExp[]; category: IncidentCategory }[] = [
  {
    category: 'crime',
    patterns: [
      /\b(shooting|gunshot|firearms?|shots? fired)\b/i,
      /\b(stabbing|knife attack|homicide|murder|manslaughter|killed|death investigation)\b/i,
      /\b(robbery|break.?in|theft|stolen|carjacking|fraud|sexual assault|sex assault)\b/i,
      /\b(arrest(ed)?|charged|suspect|police seek|RCMP|Calgary Police|CPS)\b/i,
      /\b(missing (person|child|woman|man|teen)|amber alert)\b/i,
      /\b(drug (bust|seizure|trafficking)|fentanyl|overdose|poisoning)\b/i,
    ],
  },
  {
    category: 'emergency',
    patterns: [
      /\b(structure fire|house fire|apartment fire|building fire|blaze|arson)\b/i,
      /\b(explosion|blast|gas leak|evacuate|evacuation order|hazmat|chemical)\b/i,
      /\b(flood(ing| warning| watch| advisory)?|wildfire|emergency declaration)\b/i,
    ],
  },
  {
    category: 'traffic',
    patterns: [
      /\b(fatal crash|fatal collision|fatal accident|deadly crash)\b/i,
      /\b(multi.?vehicle|serious collision|pedestrian (struck|hit|killed)|cyclist (struck|hit|killed))\b/i,
      /\b(road closed|highway (closure|blocked)|Deerfoot|Crowchild|Glenmore|Stoney Trail)\b/i,
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

// ---------------------------------------------------------------------------
// Location extraction
// ---------------------------------------------------------------------------

function extractLocationFromText(text: string): { neighborhood: string; lat: number; lng: number } | null {
  const lower = text.toLowerCase();
  for (const [name, coords] of Object.entries(NEIGHBOURHOOD_COORDS)) {
    if (lower.includes(name)) {
      return {
        neighborhood: name.replace(/\b\w/g, (c) => c.toUpperCase()),
        lat: coords[0],
        lng: coords[1],
      };
    }
  }
  if (/\bnw\s+calgary|\bcalgary[,\s]+nw\b/i.test(text)) {
    return { neighborhood: 'Northwest Calgary', lat: 51.128, lng: -114.190 };
  }
  if (/\bne\s+calgary|\bcalgary[,\s]+ne\b/i.test(text)) {
    return { neighborhood: 'Northeast Calgary', lat: 51.128, lng: -113.980 };
  }
  if (/\bsw\s+calgary|\bcalgary[,\s]+sw\b/i.test(text)) {
    return { neighborhood: 'Southwest Calgary', lat: 50.975, lng: -114.180 };
  }
  if (/\bse\s+calgary|\bcalgary[,\s]+se\b/i.test(text)) {
    return { neighborhood: 'Southeast Calgary', lat: 50.975, lng: -113.980 };
  }
  return null;
}

function classifyText(title: string, description: string): IncidentCategory | null {
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

  await Promise.allSettled(
    FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: {
            'User-Agent': 'CalgaryWatch-Ingest/1.0 (community safety aggregator)',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          console.warn(`[rss] ${feed.name} responded ${res.status}`);
          return;
        }

        const xml = await res.text();
        const items = parseRssItems(xml);

        for (const item of items) {
          // Only look at items from the last 24 hours
          const pubMs = item.pubDate ? new Date(item.pubDate).getTime() : now;
          if (isNaN(pubMs) || now - pubMs > 24 * 60 * 60 * 1000) continue;

          const category = classifyText(item.title, item.description);
          if (!category) continue;

          const location = extractLocationFromText(`${item.title} ${item.description}`);
          if (!location) continue;

          // Build a clean description from the RSS snippet (strip HTML noise)
          const cleanDesc = item.description.slice(0, 400).trim() ||
            `${category.charAt(0).toUpperCase() + category.slice(1)} reported in Calgary. See full article for details.`;

          results.push({
            title: item.title.slice(0, 100),
            description: cleanDesc,
            category,
            neighborhood: location.neighborhood,
            lat: location.lat,
            lng: location.lng,
            source_name: feed.name,
            source_url: item.link,
            source_type: 'news_rss',
            data_source: 'official',
            dedup_key: dedupeKey(item.link),
            expires_at: pubMs + 12 * 60 * 60 * 1000, // 12 hours from article publish
            verified_status: 'community_confirmed',
            report_count: 1,
            email: 'ingest@calgarywatch.app',
            name: feed.name,
            anonymous: false,
          });
        }

        console.log(`[rss] ${feed.name}: ${items.length} items parsed, ${results.filter(r => r.source_name === feed.name).length} matched.`);
      } catch (err) {
        console.warn(`[rss] ${feed.name} failed:`, err);
      }
    })
  );

  return results;
}
