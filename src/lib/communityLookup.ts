/**
 * Resolve a coordinate to the City of Calgary community that contains it.
 *
 * Why this exists: crime statistics and the choropleth are both keyed by
 * official community name from the City's boundary dataset (surr-xmvs). The
 * personalized area report, however, started from a street address and tried to
 * reach those stats by fuzzy string matching — stripping street suffixes,
 * comparing word overlap, and so on. An address string simply does not contain
 * the community name, so that frequently failed and the panel fell back to
 * "Detailed breakdown not available for this community."
 *
 * A coordinate does determine the community, exactly. We already download the
 * boundary polygons for the choropleth, so testing which polygon contains the
 * geocoded point gives the authoritative name — the same key the stats use —
 * with no guessing.
 */

/**
 * Normalize a Calgary street address for geocoding.
 *
 * Calgary's grid is numbered, so people naturally type "16th Ave SW" — but the
 * geocoder returns nothing for ordinal suffixes and resolves the same address
 * fine without them:
 *
 *   "1624 16th Ave SW"  -> no result
 *   "1624 16 Ave SW"    -> 51.0389, -114.0985
 *
 * Stripping the suffix is what makes the personalized area report work for
 * addresses on numbered streets, which in Calgary is most of them.
 */
export function normalizeCalgaryAddress(address: string): string {
  return address
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A GeoJSON ring: array of [lng, lat] pairs. */
type Ring = [number, number][];
/** Polygon = outer ring followed by any holes. */
type Polygon = Ring[];

export interface CommunityBoundary {
  /** Lowercased official community name — the exact crimeStats key. */
  name: string;
  polygons: Polygon[];
  /** [minLng, minLat, maxLng, maxLat] — cheap rejection before ray casting. */
  bbox: [number, number, number, number];
}

/** City of Calgary community boundaries, the same source the choropleth uses. */
const BOUNDARIES_URL = 'https://data.calgary.ca/resource/surr-xmvs.json?$limit=500';

function computeBbox(polygons: Polygon[]): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const polygon of polygons) {
    for (const [lng, lat] of polygon[0] ?? []) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Normalize one raw row from the boundary dataset.
 * Returns null for rows without usable geometry.
 */
export function toCommunityBoundary(row: unknown): CommunityBoundary | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, any>;

  const rawName = record.name ?? record.comm_name ?? record.community_name ?? '';
  const name = typeof rawName === 'string' ? rawName.trim().toLowerCase() : '';
  if (!name) return null;

  const geometry = record.multipolygon;
  if (!geometry || typeof geometry !== 'object') return null;

  let polygons: Polygon[];
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    polygons = geometry.coordinates as Polygon[];
  } else if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    polygons = [geometry.coordinates as Polygon];
  } else {
    return null;
  }

  polygons = polygons.filter((p) => Array.isArray(p) && Array.isArray(p[0]) && p[0].length > 2);
  if (!polygons.length) return null;

  return { name, polygons, bbox: computeBbox(polygons) };
}

/**
 * Ray-casting point-in-ring test.
 * Ring coordinates are GeoJSON order: [lng, lat].
 */
export function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function pointInPolygon(lng: number, lat: number, polygon: Polygon): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !pointInRing(lng, lat, outer)) return false;
  return !holes.some((hole) => pointInRing(lng, lat, hole));
}

/**
 * Find the community containing a coordinate.
 *
 * @returns the lowercased official community name, or null if the point falls
 *          outside every Calgary community (e.g. an address in Airdrie).
 */
export function findCommunityAt(
  lat: number,
  lng: number,
  boundaries: CommunityBoundary[],
): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  for (const boundary of boundaries) {
    const [minLng, minLat, maxLng, maxLat] = boundary.bbox;
    // Bounding box first — rejects almost every community in a single compare.
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
    if (boundary.polygons.some((polygon) => pointInPolygon(lng, lat, polygon))) {
      return boundary.name;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared fetch
// ---------------------------------------------------------------------------

let boundariesPromise: Promise<CommunityBoundary[]> | null = null;

/**
 * Fetch and parse the community boundaries once per session.
 *
 * Memoized at module scope so the map choropleth and the address lookup share a
 * single network request rather than each pulling ~500 polygons.
 */
export function fetchCommunityBoundaries(): Promise<CommunityBoundary[]> {
  if (!boundariesPromise) {
    boundariesPromise = fetch(BOUNDARIES_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((rows) => {
        if (!Array.isArray(rows)) return [];
        return rows
          .map(toCommunityBoundary)
          .filter((b): b is CommunityBoundary => b !== null);
      })
      .catch((error) => {
        console.warn('[CalgaryWatch] Community boundaries fetch failed:', error);
        // Allow a later retry rather than caching the failure forever.
        boundariesPromise = null;
        return [];
      });
  }
  return boundariesPromise;
}
