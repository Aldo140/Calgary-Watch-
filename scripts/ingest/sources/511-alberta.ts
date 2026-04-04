/**
 * 511 Alberta — Real-time traffic events for the Calgary region
 *
 * The 511 Alberta open API returns events province-wide.
 * We filter to a tight bounding box around Calgary Metro.
 *
 * API base: https://511.alberta.ca/api/v2
 * No authentication required for read-only access.
 */

import type { IncidentCategory } from '../../../src/types/index.js';
import type { NormalizedIncident } from '../types.js';

export type { NormalizedIncident };

// ---------------------------------------------------------------------------
// 511 API shape
// ---------------------------------------------------------------------------

interface AlbertaEvent {
  ID?: string;
  EventType?: string;
  Severity?: string;
  Status?: string;
  Headline?: string;
  Description?: string;
  StartDate?: string;
  ExpectedEndDate?: string;
  Geography?: {
    type?: string;
    coordinates?: number[] | number[][];
  } | null;
  Area?: Array<{ Name?: string }>;
}

// ---------------------------------------------------------------------------
// Calgary bounding box
// ---------------------------------------------------------------------------

const CALGARY = {
  minLat: 50.8,
  maxLat: 51.3,
  minLng: -114.5,
  maxLng: -113.8,
};

const TRAFFIC_TTL_MS  = 6 * 60 * 60 * 1000;  // 6 hours
const CLOSURE_TTL_MS  = 12 * 60 * 60 * 1000; // 12 hours

const API_URL = 'https://511.alberta.ca/api/v2/get/event?lang=English&format=json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inCalgaryBounds(lat: number, lng: number): boolean {
  return (
    lat >= CALGARY.minLat && lat <= CALGARY.maxLat &&
    lng >= CALGARY.minLng && lng <= CALGARY.maxLng
  );
}

function extractCoords(event: AlbertaEvent): { lat: number; lng: number } | null {
  const geo = event.Geography;
  if (!geo) return null;

  if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
    const [lng, lat] = geo.coordinates as number[];
    return { lat, lng };
  }

  if (geo.type === 'LineString' && Array.isArray(geo.coordinates) && geo.coordinates.length > 0) {
    // Take the midpoint of the line.
    const mid = Math.floor((geo.coordinates as number[][]).length / 2);
    const [lng, lat] = (geo.coordinates as number[][])[mid];
    return { lat, lng };
  }

  return null;
}

function mapEventTypeToCategory(eventType: string | undefined): IncidentCategory {
  const t = (eventType ?? '').toLowerCase();
  if (t.includes('accident') || t.includes('collision') || t.includes('crash')) return 'traffic';
  if (t.includes('closure') || t.includes('construction') || t.includes('road work')) return 'traffic';
  if (t.includes('weather') || t.includes('wind') || t.includes('ice')) return 'weather';
  return 'traffic';
}

function ttlForEvent(event: AlbertaEvent): number {
  // Use the API's end date when available.
  if (event.ExpectedEndDate) {
    const t = Date.parse(event.ExpectedEndDate);
    if (!Number.isNaN(t) && t > Date.now()) return t;
  }
  const t = (event.EventType ?? '').toLowerCase();
  return Date.now() + (t.includes('closure') ? CLOSURE_TTL_MS : TRAFFIC_TTL_MS);
}

function getNeighborhood(event: AlbertaEvent): string {
  if (event.Area && event.Area.length > 0 && event.Area[0].Name) {
    return event.Area[0].Name.slice(0, 80);
  }
  return 'Calgary';
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetch511AlbertaEvents(): Promise<NormalizedIncident[]> {
  const res = await fetch(API_URL, {
    headers: { 'User-Agent': 'CalgaryWatch/1.0 (community safety app; contact jorti104@mtroyal.ca)' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`511 Alberta API returned HTTP ${res.status}`);
  }

  const events: AlbertaEvent[] = await res.json() as AlbertaEvent[];
  const results: NormalizedIncident[] = [];

  for (const event of events ?? []) {
    if (event.Status === 'Completed' || event.Status === 'Cancelled') continue;

    const coords = extractCoords(event);
    if (!coords) continue;
    if (!inCalgaryBounds(coords.lat, coords.lng)) continue;

    const headline = (event.Headline ?? event.EventType ?? 'Traffic incident').slice(0, 100);
    const description = (event.Description ?? headline).slice(0, 1000);
    const eventId = event.ID ?? `${event.Headline ?? ''}:${event.StartDate ?? ''}`;

    results.push({
      title: headline,
      description,
      category: mapEventTypeToCategory(event.EventType),
      neighborhood: getNeighborhood(event),
      lat: coords.lat,
      lng: coords.lng,
      source_name: '511 Alberta',
      source_url: 'https://511.alberta.ca',
      source_type: '511_alberta_traffic',
      data_source: 'official',
      dedup_key: `511_alberta_traffic:${eventId}`,
      expires_at: ttlForEvent(event),
      verified_status: 'community_confirmed',
      report_count: 1,
      email: 'system@calgarywatch.app',
      name: '511 Alberta' as string,
      anonymous: false,
    });
  }

  return results;
}
