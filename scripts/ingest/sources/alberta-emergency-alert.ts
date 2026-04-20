/**
 * Alberta Emergency Alert — official emergency alerts feed
 *
 * Uses the public Alberta Emergency Alert Atom feed.
 * Feed: https://www.alberta.ca/data/aea/rss/feed-full.atom
 *
 * We only keep alerts relevant to Calgary or Alberta-wide notices.
 */

import { createHash } from 'crypto';
import type { NormalizedIncident } from '../types.js';

interface AlertEntry {
  id: string;
  title: string;
  summary: string;
  updated: string;
  published: string;
  point: string;
  areaDesc: string;
  expires: string;
  severity: string;
  urgency: string;
  instruction: string;
  link: string;
}

const FEED_URL = 'https://www.alberta.ca/data/aea/rss/feed-full.atom';
const CALGARY_CENTER = { lat: 51.0447, lng: -114.0719 };
const CALGARY_BOUNDS = {
  minLat: 50.8,
  maxLat: 51.3,
  minLng: -114.5,
  maxLng: -113.8,
};
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

function extractXmlTag(xml: string, tag: string): string {
  const escapedTag = tag.replace(':', '\\:');
  const re = new RegExp(`<${escapedTag}[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*<\\/${escapedTag}>`, 'i');
  const match = re.exec(xml);
  if (!match) return '';
  return match[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseEntries(xml: string): AlertEntry[] {
  const entries: AlertEntry[] = [];
  const entryPattern = /<entry[\s\S]*?>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;

  while ((match = entryPattern.exec(xml)) !== null) {
    const chunk = match[1];
    const linkHref = /<link[^>]*href="([^"]+)"/i.exec(chunk)?.[1] ?? '';
    entries.push({
      id: extractXmlTag(chunk, 'id'),
      title: extractXmlTag(chunk, 'title'),
      summary: extractXmlTag(chunk, 'summary') || extractXmlTag(chunk, 'content'),
      updated: extractXmlTag(chunk, 'updated'),
      published: extractXmlTag(chunk, 'published'),
      point: extractXmlTag(chunk, 'georss:point'),
      areaDesc: extractXmlTag(chunk, 'cap:areaDesc'),
      expires: extractXmlTag(chunk, 'cap:expires'),
      severity: extractXmlTag(chunk, 'cap:severity'),
      urgency: extractXmlTag(chunk, 'cap:urgency'),
      instruction: extractXmlTag(chunk, 'cap:instruction'),
      link: linkHref,
    });
  }

  return entries;
}

function parsePoint(point: string): { lat: number; lng: number } | null {
  const [latRaw, lngRaw] = point.trim().split(/\s+/);
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function inCalgaryBounds(lat: number, lng: number): boolean {
  return (
    lat >= CALGARY_BOUNDS.minLat && lat <= CALGARY_BOUNDS.maxLat &&
    lng >= CALGARY_BOUNDS.minLng && lng <= CALGARY_BOUNDS.maxLng
  );
}

function isRelevantToCalgary(entry: AlertEntry, coords: { lat: number; lng: number } | null): boolean {
  if (coords && inCalgaryBounds(coords.lat, coords.lng)) return true;

  const combined = `${entry.title} ${entry.summary} ${entry.areaDesc}`.toLowerCase();
  return (
    combined.includes('calgary') ||
    combined.includes('alberta-wide') ||
    combined.includes('provincewide') ||
    combined.includes('province wide') ||
    entry.areaDesc.trim().toLowerCase() === 'alberta'
  );
}

function getNeighborhood(entry: AlertEntry): string {
  const area = entry.areaDesc || entry.title;
  if (/northwest calgary|calgary nw|\bnw calgary\b/i.test(area)) return 'Northwest Calgary';
  if (/northeast calgary|calgary ne|\bne calgary\b/i.test(area)) return 'Northeast Calgary';
  if (/southwest calgary|calgary sw|\bsw calgary\b/i.test(area)) return 'Southwest Calgary';
  if (/southeast calgary|calgary se|\bse calgary\b/i.test(area)) return 'Southeast Calgary';
  if (/calgary/i.test(area)) return 'Calgary';
  if (/alberta/i.test(area)) return 'Alberta';
  return 'Calgary';
}

function getExpiresAt(entry: AlertEntry, now: number): number {
  const expiry = Date.parse(entry.expires);
  if (!Number.isNaN(expiry) && expiry > now) return expiry;
  return now + DEFAULT_TTL_MS;
}

function buildDescription(entry: AlertEntry): string {
  return [
    entry.summary,
    entry.instruction ? `Action: ${entry.instruction}` : '',
    entry.severity ? `Severity: ${entry.severity}` : '',
    entry.urgency ? `Urgency: ${entry.urgency}` : '',
    entry.areaDesc ? `Area: ${entry.areaDesc}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 1000);
}

export async function fetchAlbertaEmergencyAlerts(): Promise<NormalizedIncident[]> {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'CalgaryWatch/1.0 (community safety app; contact jorti104@mtroyal.ca)' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Alberta Emergency Alert feed returned HTTP ${res.status}`);
  }

  const xml = await res.text();
  const entries = parseEntries(xml);
  const now = Date.now();

  return entries
    .map((entry) => {
      const coords = parsePoint(entry.point);
      return { entry, coords };
    })
    .filter(({ entry, coords }) => isRelevantToCalgary(entry, coords))
    .map(({ entry, coords }) => {
      const safeCoords = coords ?? CALGARY_CENTER;
      const dedupSeed = entry.id || entry.link || entry.title;

      return {
        title: entry.title.slice(0, 100) || 'SOS Alert',
        description: buildDescription(entry) || 'Emergency alert issued for Calgary-area residents.',
        category: 'emergency' as const,
        neighborhood: getNeighborhood(entry),
        lat: safeCoords.lat,
        lng: safeCoords.lng,
        source_name: 'Alberta Emergency Alert',
        source_url: entry.link || 'https://www.alberta.ca/alberta-emergency-alert.aspx',
        source_type: 'alberta_emergency_alert' as const,
        data_source: 'official' as const,
        dedup_key: `alberta_emergency_alert:${createHash('sha1').update(dedupSeed).digest('hex').slice(0, 16)}`,
        expires_at: getExpiresAt(entry, now),
        verified_status: 'community_confirmed' as const,
        report_count: 1 as const,
        email: 'system@calgarywatch.app',
        name: 'Alberta Emergency Alert',
        anonymous: false as const,
      };
    });
}
