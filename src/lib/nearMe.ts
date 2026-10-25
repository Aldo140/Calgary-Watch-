/**
 * "What's near me": the reports inside a fixed radius of the reader's pin,
 * measured the same way the rest of the map counts them (same time window,
 * same category filter), so the near-me number never disagrees with the chips
 * and the count pill above it.
 */
import { getDistance } from '@/src/lib/geo';
import type { Incident } from '@/src/types';

export const NEAR_ME_RADIUS_KM = 3;

export type NearIncident = Incident & { _dist: number; _dir: string };

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Eight-point compass direction from one point to another ("NE"). */
export function compassFrom(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  const rad = Math.PI / 180;
  const dLng = (to.lng - from.lng) * rad;
  const y = Math.sin(dLng) * Math.cos(to.lat * rad);
  const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad)
    - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) / rad + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/** "350 m" under a kilometre, "1.4 km" above. */
export function distanceLabel(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Reports within the radius, emergencies first, then closest first.
 * `category` is the map's category filter ('all' for none).
 */
export function nearbyReports(
  incidents: Incident[],
  from: { lat: number; lng: number },
  category: string = 'all',
  radiusKm = NEAR_ME_RADIUS_KM,
): NearIncident[] {
  return incidents
    .filter((i) => category === 'all' || i.category === category)
    .map((i) => ({ i, dist: getDistance(from.lat, from.lng, i.lat, i.lng) }))
    .filter((x) => x.dist <= radiusKm)
    .sort((a, b) => {
      const ae = a.i.category === 'emergency' ? 0 : 1;
      const be = b.i.category === 'emergency' ? 0 : 1;
      return ae - be || a.dist - b.dist;
    })
    .map((x) => ({ ...x.i, _dist: x.dist, _dir: compassFrom(from, x.i) }));
}

/** Per-category counts, largest first, for the mix bar. */
export function categoryMix(reports: Pick<Incident, 'category'>[]): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of reports) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
