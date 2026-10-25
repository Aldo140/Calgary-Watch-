/**
 * Calgary's four quadrants, for the "Across Calgary" board on the map.
 *
 * Addresses split at Centre Street (east/west) and roughly the Bow River
 * through downtown (north/south), so the downtown core and the Beltline fall
 * in SW, as they do on a Calgary address. The board exists so the whole city
 * is in view: a phone opened on the core used to make every report look like
 * it was downtown.
 */
import type { Incident } from '@/src/types';

export type Quadrant = 'NW' | 'NE' | 'SW' | 'SE';
export const QUADRANTS: Quadrant[] = ['NW', 'NE', 'SW', 'SE'];

const CENTRE_STREET_LNG = -114.0625;
const BOW_RIVER_LAT = 51.052;

/** Where the map flies when a quadrant is tapped (zoom 12 shows most of one). */
export const QUADRANT_VIEW: Record<Quadrant, { lat: number; lng: number; name: string }> = {
  NW: { lat: 51.112, lng: -114.155, name: 'Northwest' },
  NE: { lat: 51.100, lng: -113.975, name: 'Northeast' },
  SW: { lat: 50.985, lng: -114.130, name: 'Southwest' },
  SE: { lat: 50.935, lng: -113.995, name: 'Southeast' },
};

export function quadrantOf(lat: number, lng: number): Quadrant {
  return `${lat >= BOW_RIVER_LAT ? 'N' : 'S'}${lng >= CENTRE_STREET_LNG ? 'E' : 'W'}` as Quadrant;
}

export interface QuadrantSummary {
  quadrant: Quadrant;
  total: number;
  crime: number;
  /** Newest report title in the quadrant, for the tile's last line. */
  latest: string | null;
}

/** Counts per quadrant; Calgary only (Edmonton context rows are left out). */
export function summarizeQuadrants(incidents: Incident[]): QuadrantSummary[] {
  const out = new Map<Quadrant, QuadrantSummary & { latestAt: number }>(
    QUADRANTS.map((q) => [q, { quadrant: q, total: 0, crime: 0, latest: null, latestAt: 0 }]),
  );
  for (const i of incidents) {
    if (i.source_type === 'edmonton_open_data') continue;
    if (!Number.isFinite(i.lat) || !Number.isFinite(i.lng) || i.lat < 50.8 || i.lat > 51.3) continue;
    const s = out.get(quadrantOf(i.lat, i.lng))!;
    s.total += 1;
    if (i.category === 'crime' || i.category === 'emergency') s.crime += 1;
    if (i.timestamp > s.latestAt) { s.latestAt = i.timestamp; s.latest = i.title; }
  }
  return QUADRANTS.map((q) => {
    const { latestAt: _ignored, ...rest } = out.get(q)!;
    return rest;
  });
}
