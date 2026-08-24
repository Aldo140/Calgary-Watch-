/**
 * Calgary Police Service news releases, from the official City newsroom feed.
 *
 * This is the closest public source Calgary offers to a live police incident
 * feed. It is not a dispatch log: each row is an attributed CPS release, keeps
 * the release timestamp, links to the original, and is placed only when the
 * text names a Calgary community or quadrant. Nothing is geocoded by guessing
 * from a person's identity or a private address.
 */

import { createHash } from 'node:crypto';
import { NEIGHBOURHOOD_COORDS } from '../../../src/data/neighbourhoodCoords.js';
import type { IncidentCategory } from '../../../src/types/index.js';
import type { NormalizedIncident } from '../types.js';

const FEED_URL = 'https://newsroom.calgary.ca/tagfeed/en/tags/police';
const RETENTION_MS = 35 * 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 35 * 24 * 60 * 60 * 1000;

interface FeedItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function cleanMarkup(value: string, maxLength = 1_000): string {
  return decodeEntities(value)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function tag(chunk: string, name: string): string {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(chunk);
  return match ? cleanMarkup(match[1], name === 'description' ? 4_000 : 500) : '';
}

export function parseCalgaryPoliceFeed(xml: string): FeedItem[] {
  return [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)]
    .map((match) => ({
      title: tag(match[1], 'title'),
      description: tag(match[1], 'description'),
      link: tag(match[1], 'link'),
      pubDate: tag(match[1], 'pubDate'),
    }))
    .filter((item) => Boolean(item.title && item.link && item.pubDate));
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const LOCATION_ALIASES: Record<string, { neighborhood: string; lat: number; lng: number }> = {
  'saddle ridge': { neighborhood: 'Saddle Ridge', lat: 51.1494, lng: -113.9670 },
  'spruce cliff': { neighborhood: 'Spruce Cliff', lat: 51.0451, lng: -114.1342 },
  'edworthy park': { neighborhood: 'Spruce Cliff', lat: 51.0610, lng: -114.1550 },
  'somerset-bridlewood': { neighborhood: 'Somerset-Bridlewood', lat: 50.8980, lng: -114.1160 },
  'somerset': { neighborhood: 'Somerset', lat: 50.8980, lng: -114.1360 },
  'bridlewood': { neighborhood: 'Bridlewood', lat: 50.8990, lng: -114.1120 },
};

export function locateCalgaryPoliceRelease(text: string): { neighborhood: string; lat: number; lng: number } | null {
  const lower = text.toLowerCase();
  const matches: Array<{ index: number; location: { neighborhood: string; lat: number; lng: number } }> = [];
  for (const [phrase, location] of Object.entries(LOCATION_ALIASES)) {
    const index = lower.indexOf(phrase);
    if (index >= 0) matches.push({ index, location });
  }
  for (const name of Object.keys(NEIGHBOURHOOD_COORDS)) {
    const index = lower.indexOf(name);
    if (index < 0) continue;
    const [lat, lng] = NEIGHBOURHOOD_COORDS[name];
    matches.push({ index, location: { neighborhood: titleCase(name), lat, lng } });
  }
  if (matches.length > 0) return matches.sort((a, b) => a.index - b.index)[0].location;
  if (/\b(?:southwest|s\.?w\.?)\s+(?:calgary|community|area)|\bcalgary'?s southwest\b/i.test(text)) {
    return { neighborhood: 'Southwest Calgary', lat: 50.975, lng: -114.180 };
  }
  if (/\b(?:southeast|s\.?e\.?)\s+(?:calgary|community|area)|\bcalgary'?s southeast\b/i.test(text)) {
    return { neighborhood: 'Southeast Calgary', lat: 50.975, lng: -113.980 };
  }
  if (/\b(?:northwest|n\.?w\.?)\s+(?:calgary|community|area)|\bcalgary'?s northwest\b/i.test(text)) {
    return { neighborhood: 'Northwest Calgary', lat: 51.128, lng: -114.190 };
  }
  if (/\b(?:northeast|n\.?e\.?)\s+(?:calgary|community|area)|\bcalgary'?s northeast\b/i.test(text)) {
    return { neighborhood: 'Northeast Calgary', lat: 51.128, lng: -113.980 };
  }
  return null;
}

function classify(title: string, description: string): IncidentCategory {
  if (/\b(active shooter|evacuat|public safety emergency|missing child|amber alert)\b/i.test(title)) return 'emergency';
  if (/\b(collision|crash|traffic enforcement|traffic safety|vehicle chase|dirt bike chase)\b/i.test(title)) return 'traffic';
  if (/\b(active shooter|evacuat|amber alert)\b/i.test(description.slice(0, 500))) return 'emergency';
  return 'crime';
}

function isIncidentRelease(title: string): boolean {
  if (/photo enforcement locations|beyond the badge|recruit|award|annual report/i.test(title)) return false;
  return /\b(want(?:ed)?|charg(?:ed|es)|warrants?|arrest(?:ed)?|investigat(?:e|ion|ing)|shoot(?:ing)?|collisions?|crash|rob(?:bery|bed)?|assault(?:ed)?|vandalis(?:m|ed)|missing|body|seiz(?:ed|ure)|crime|fraud|homicide|stol(?:en|e)|theft|chase)\b/i.test(title);
}

function storyKey(title: string): string {
  return title.toLowerCase()
    .replace(/update\s*#?\d*\s*:?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function conciseDescription(value: string): string {
  const firstTwoSentences = value.match(/^.*?[.!?](?:\s+.*?[.!?])?/s)?.[0] ?? value;
  return firstTwoSentences.replace(/\s+/g, ' ').trim().slice(0, 600);
}

export function normalizeCalgaryPoliceFeed(xml: string, now = Date.now()): NormalizedIncident[] {
  const results: NormalizedIncident[] = [];
  const stories = new Set<string>();
  for (const item of parseCalgaryPoliceFeed(xml)) {
    const timestamp = Date.parse(item.pubDate);
    if (!Number.isFinite(timestamp) || timestamp > now + 60 * 60 * 1000 || now - timestamp > MAX_AGE_MS) continue;
    if (!isIncidentRelease(item.title)) continue;
    const story = storyKey(item.title);
    if (stories.has(story)) continue;
    const location = locateCalgaryPoliceRelease(`${item.title} ${item.description.slice(0, 1_200)}`);
    if (!location) continue;
    const category = classify(item.title, item.description);
    const key = createHash('sha256').update(item.link).digest('hex').slice(0, 24);
    results.push({
      title: item.title.slice(0, 100),
      description: conciseDescription(item.description),
      timestamp,
      category,
      ...location,
      source_name: 'Calgary Police Service',
      source_url: item.link,
      source_type: 'calgary_police_crime',
      data_source: 'official',
      dedup_key: `calgary_police_news:${key}`,
      expires_at: timestamp + RETENTION_MS,
      verified_status: 'community_confirmed',
      report_count: 1,
      email: 'system@calgarywatch.app',
      name: 'Calgary Police Service',
      anonymous: false,
    });
    stories.add(story);
  }
  return results;
}

export async function fetchCalgaryPoliceNews(): Promise<NormalizedIncident[]> {
  const response = await fetch(FEED_URL, {
    headers: {
      'User-Agent': 'CalgaryWatch/1.0 (community safety aggregator)',
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Calgary Police newsroom returned HTTP ${response.status}`);
  return normalizeCalgaryPoliceFeed(await response.text());
}
