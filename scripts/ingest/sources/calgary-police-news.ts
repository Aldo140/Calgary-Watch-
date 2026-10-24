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
import type { IncidentCategory } from '../../../src/types/index.js';
import type { NormalizedIncident } from '../types.js';
import { loadCommunityPoints, locateInText, shortlistPoints, type CommunityPoint, type PlacedLocation } from './community-locator.js';

const FEED_URL = 'https://newsroom.calgary.ca/tagfeed/en/tags/police';
// Kept 60 days so the map's "All" view holds two months of releases; the feed
// itself only lists the newest ~20, so retention is what builds the history.
const RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
// The feed lists ~50 releases (about two months); all of them count.
const MAX_AGE_MS = RETENTION_MS;

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

const LOCATION_ALIASES: CommunityPoint[] = [
  { phrase: 'saddle ridge', neighborhood: 'Saddle Ridge', lat: 51.1494, lng: -113.9670 },
  { phrase: 'spruce cliff', neighborhood: 'Spruce Cliff', lat: 51.0451, lng: -114.1342 },
  { phrase: 'edworthy park', neighborhood: 'Spruce Cliff', lat: 51.0610, lng: -114.1550 },
  { phrase: 'somerset-bridlewood', neighborhood: 'Somerset-Bridlewood', lat: 50.8980, lng: -114.1160 },
  { phrase: 'somerset', neighborhood: 'Somerset', lat: 50.8980, lng: -114.1360 },
  { phrase: 'bridlewood', neighborhood: 'Bridlewood', lat: 50.8990, lng: -114.1120 },
];

/**
 * The community a release names (via the shared locator), else its quadrant,
 * else null. `points` defaults to the bundled shortlist; a run passes the
 * City's full community list.
 */
export function locateCalgaryPoliceRelease(text: string, points: CommunityPoint[] = shortlistPoints()): PlacedLocation | null {
  return locateInText(text, [...LOCATION_ALIASES, ...points]);
}

function classify(title: string, description: string): IncidentCategory {
  if (/\b(active shooter|evacuat|public safety emergency|missing child|amber alert)\b/i.test(title)) return 'emergency';
  if (/\b(collision|crash|traffic enforcement|traffic safety|vehicle chase|dirt bike chase)\b/i.test(title)) return 'traffic';
  if (/\b(fire|blaze|explosion)\b/i.test(title) && !/\barson\b/i.test(title)) return 'emergency';
  if (/\b(active shooter|evacuat|amber alert)\b/i.test(description.slice(0, 500))) return 'emergency';
  return 'crime';
}

/**
 * A release about something that happened somewhere, not a programme or a
 * report. The 2026-10-24 audit found "Charge laid in Falconridge stabbing",
 * "Seeking public assistance in series of northeast break-ins" and "Police
 * respond to serious bus fire" all refused for missing a word here.
 */
export function isIncidentRelease(title: string): boolean {
  if (/photo enforcement|beyond the badge|recruit|award|annual report|drone|trial|begins|launch|vehicle inspection|recommendations|review|survey|town hall|community (meeting|event)|safety tips?|reminds|campaign/i.test(title)) return false;
  return /\b(want(?:ed)?|charg(?:e|ed|es)|laid|warrants?|arrest(?:ed|s)?|investigat(?:e|ion|ing)|shoot(?:ing)?|shot|stabb(?:ing|ed)?|collisions?|crash|rob(?:bery|beries|bed)?|assault(?:ed)?|vandalis(?:m|ed)|missing|body|seiz(?:ed|ure)|crime|fraud(?:ulent)?|scam|extortion|homicide|stol(?:en|e)|theft|chase|break.?ins?|burglar(?:y|ies)|fire|arson|trafficking|weapons?|firearms?|offender|suspects?|identify|public assistance|dashcam|hate.motivated|sexual|drugging|carjack(?:ing|ings)?)\b/i.test(title);
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

export function normalizeCalgaryPoliceFeed(xml: string, now = Date.now(), points: CommunityPoint[] = shortlistPoints()): NormalizedIncident[] {
  const results: NormalizedIncident[] = [];
  const stories = new Set<string>();
  for (const item of parseCalgaryPoliceFeed(xml)) {
    const timestamp = Date.parse(item.pubDate);
    if (!Number.isFinite(timestamp) || timestamp > now + 60 * 60 * 1000 || now - timestamp > MAX_AGE_MS) continue;
    if (!isIncidentRelease(item.title)) continue;
    const story = storyKey(item.title);
    if (stories.has(story)) continue;
    const location = locateCalgaryPoliceRelease(`${item.title} ${item.description.slice(0, 1_200)}`, points);
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
  return normalizeCalgaryPoliceFeed(await response.text(), Date.now(), await loadCommunityPoints());
}
