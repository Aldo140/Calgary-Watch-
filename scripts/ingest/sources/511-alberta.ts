/**
 * 511 Alberta — Real-time traffic events for the Calgary region
 *
 * The 511 Alberta open API returns events province-wide.
 * We filter to a tight bounding box around Calgary Metro.
 *
 * API base: https://511.alberta.ca/api/v2
 * Requires an ALBERTA_511_API_KEY from the official developer portal.
 */

import type { IncidentCategory } from '../../../src/types/index.js';
import type { NormalizedIncident } from '../types.js';

export type { NormalizedIncident };

// ---------------------------------------------------------------------------
// 511 API shape
// ---------------------------------------------------------------------------

/**
 * Actual v2 response shape, verified against the live endpoint.
 *
 * This previously described a GeoJSON `Geography` object plus `Status`,
 * `Headline`, `Area` and `ExpectedEndDate`. None of those fields exist on the
 * live feed — coordinates are flat `Latitude`/`Longitude` and dates are Unix
 * seconds. Every event therefore failed coordinate extraction and the source
 * silently contributed nothing while reporting success.
 */
interface AlbertaEvent {
  ID?: number | string;
  SourceId?: string;
  Organization?: string;
  RoadwayName?: string;
  DirectionOfTravel?: string;
  Description?: string;
  /** Unix seconds. */
  Reported?: number;
  /** Unix seconds. */
  LastUpdated?: number;
  /** Unix seconds. */
  StartDate?: number;
  /** Unix seconds, or null when open-ended. */
  PlannedEndDate?: number | null;
  LanesAffected?: string;
  Latitude?: number;
  Longitude?: number;
  EventType?: string;
  EventSubType?: string;
  IsFullClosure?: boolean;
  Severity?: string;
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

/**
 * Cap on long-running roadwork.
 *
 * Most Calgary 511 events are construction projects that started months ago and
 * run for months more. All 25 of them on the map at once buries everything else
 * and fills a "recent incidents" view with things that are not recent. Genuine
 * incidents — closures, crashes, weather events — are never capped.
 */
const ROADWORK_CAP = 5;

const TRAFFIC_TTL_MS  = 6 * 60 * 60 * 1000;  // 6 hours
const CLOSURE_TTL_MS  = 12 * 60 * 60 * 1000; // 12 hours

const API_URL = 'https://511.alberta.ca/api/v2/get/event';

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
  const lat = Number(event.Latitude);
  const lng = Number(event.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function mapEventTypeToCategory(event: AlbertaEvent): IncidentCategory {
  const t = `${event.EventType ?? ''} ${event.EventSubType ?? ''}`.toLowerCase();
  if (t.includes('weather') || t.includes('wind') || t.includes('ice') || t.includes('snow')) return 'weather';
  // Roadwork and construction are infrastructure; incidents and closures are traffic.
  if (t.includes('roadwork') || t.includes('construction') || t.includes('maintenance')) return 'infrastructure';
  return 'traffic';
}

function ttlForEvent(event: AlbertaEvent): number {
  // PlannedEndDate is Unix seconds, and is null for open-ended events.
  if (typeof event.PlannedEndDate === 'number' && event.PlannedEndDate > 0) {
    const end = event.PlannedEndDate * 1000;
    if (end > Date.now()) return end;
  }
  const t = (event.EventType ?? '').toLowerCase();
  return Date.now() + (t.includes('closure') ? CLOSURE_TTL_MS : TRAFFIC_TTL_MS);
}

function getNeighborhood(event: AlbertaEvent): string {
  // The feed has no area field; the roadway is the most useful locator we get.
  return (event.RoadwayName ?? 'Calgary').slice(0, 80);
}

/** Readable headline, since the feed has no Headline field. */
function buildHeadline(event: AlbertaEvent): string {
  const road = event.RoadwayName?.trim();
  const kind = event.IsFullClosure
    ? 'Full closure'
    : event.EventSubType === 'constructionWork'
      ? 'Construction'
      : (event.EventType ?? 'Traffic event');
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  return (road ? `${label} on ${road}` : label).slice(0, 100);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * A report may not be dated in the future.
 *
 * 511 publishes planned work, so StartDate is routinely days ahead. Since the
 * feed sorts newest-first with a page limit, an unclamped future timestamp
 * permanently outranks every genuine report.
 */
export function clampToNow(ms: number, now: number = Date.now()): number {
  return Number.isFinite(ms) && ms > now ? now : ms;
}

export async function fetch511AlbertaEvents(): Promise<NormalizedIncident[]> {
  const apiKey = process.env.ALBERTA_511_API_KEY?.trim();
  if (!apiKey) {
    console.log('[511 Alberta] Skipped — optional ALBERTA_511_API_KEY is not configured.');
    return [];
  }

  const url = new URL(API_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url, {
    headers: { 'User-Agent': 'CalgaryWatch/1.0 (community safety app; contact jorti104@mtroyal.ca)' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`511 Alberta API returned HTTP ${res.status}`);
  }

  const events: AlbertaEvent[] = await res.json() as AlbertaEvent[];
  const results: NormalizedIncident[] = [];

  for (const event of events ?? []) {
    const coords = extractCoords(event);
    if (!coords) continue;
    if (!inCalgaryBounds(coords.lat, coords.lng)) continue;

    // Skip anything whose planned end has already passed.
    if (typeof event.PlannedEndDate === 'number' && event.PlannedEndDate > 0 &&
        event.PlannedEndDate * 1000 < Date.now()) {
      continue;
    }

    const headline = buildHeadline(event);
    const description = (event.Description?.trim() || headline).slice(0, 1000);
    const eventId = String(event.ID ?? event.SourceId ?? `${event.RoadwayName ?? ''}:${event.StartDate ?? ''}`);
    const sourceUrl = 'https://511.alberta.ca';

    results.push({
      title: headline,
      description,
      // Reported/StartDate are Unix seconds.
      //
      // Clamped to now because 511 publishes *planned* work: a restriction
      // scheduled for next week carries a StartDate days in the future. The
      // feed is ordered newest-first with a page limit, so future-dated records
      // sat permanently at the top and pushed real community reports out of the
      // loaded window — they appeared neither as pins nor in the feed. A report
      // cannot be newer than the moment it was read.
      timestamp: clampToNow(
        typeof event.Reported === 'number' && event.Reported > 0
          ? event.Reported * 1000
          : typeof event.StartDate === 'number' && event.StartDate > 0
            ? event.StartDate * 1000
            : Date.now(),
      ),
      category: mapEventTypeToCategory(event),
      neighborhood: getNeighborhood(event),
      lat: coords.lat,
      lng: coords.lng,
      source_name: '511 Alberta',
      source_url: sourceUrl,
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

  // Keep every real incident, but only the most recently reported roadwork.
  const isRoadwork = (i: NormalizedIncident) => i.category === 'infrastructure';
  const byNewest = (a: NormalizedIncident, b: NormalizedIncident) =>
    (b.timestamp ?? 0) - (a.timestamp ?? 0);

  const incidents = results.filter((i) => !isRoadwork(i));
  const roadwork = results.filter(isRoadwork).sort(byNewest).slice(0, ROADWORK_CAP);

  return [...incidents, ...roadwork];
}
