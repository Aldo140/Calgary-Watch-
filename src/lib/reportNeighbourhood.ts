import { CALGARY_COMMUNITIES, type CalgaryCommunity, type Quadrant } from '../data/calgaryCommunities';
import { fetchCommunityBoundaries, findCommunityAt, type CommunityBoundary } from './communityLookup';

/**
 * Which neighbourhood a report belongs to.
 *
 * The report and SOS forms used to know 20 neighbourhood centres, so a pin in
 * Hillhurst, Ranchlands or Forest Lawn auto-detected nothing and the reporter
 * had to pick "Other" from a 20-row list. Reports now resolve against the City's
 * community polygons (the same boundaries the map's 311 layer and area panel
 * use), so the stored name matches the area panel and the 311 rankings. The old
 * centres stay as an offline fallback for when the boundaries can't load.
 */

const FALLBACK_CENTRES: ReadonlyArray<{ name: string; lat: number; lng: number }> = [
  { name: 'Downtown Commercial Core', lat: 51.0478, lng: -114.0625 },
  { name: 'Beltline', lat: 51.0381, lng: -114.0680 },
  { name: 'Hillhurst', lat: 51.0603, lng: -114.0903 },
  { name: 'Bridgeland/Riverside', lat: 51.0602, lng: -114.0412 },
  { name: 'Mission', lat: 51.0347, lng: -114.0670 },
  { name: 'Inglewood', lat: 51.0406, lng: -114.0201 },
  { name: 'Bowness', lat: 51.0975, lng: -114.1807 },
  { name: 'Saddle Ridge', lat: 51.1494, lng: -113.9670 },
  { name: 'Evanston', lat: 51.1902, lng: -114.0792 },
  { name: 'Mahogany', lat: 50.9011, lng: -113.9603 },
  { name: 'Auburn Bay', lat: 50.9099, lng: -114.0010 },
  { name: 'Signal Hill', lat: 51.0660, lng: -114.2161 },
  { name: 'Tuscany', lat: 51.1303, lng: -114.2208 },
  { name: 'Royal Oak', lat: 51.1303, lng: -114.1827 },
  { name: 'Panorama Hills', lat: 51.1655, lng: -114.0448 },
  { name: 'Midnapore', lat: 50.9497, lng: -114.0683 },
  { name: 'Shawnessy', lat: 50.9251, lng: -114.1245 },
  { name: 'McKenzie Towne', lat: 50.9083, lng: -113.9534 },
  { name: 'Cranston', lat: 50.8986, lng: -113.9836 },
  { name: 'Copperfield', lat: 50.9141, lng: -113.9951 },
];

const key = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const byKey = new Map(CALGARY_COMMUNITIES.map(c => [key(c.name), c]));

/** "bridgeland/riverside" from the boundary file becomes "Bridgeland/Riverside"; known names keep their spelling. */
export function displayCommunity(raw: string): string {
  const known = byKey.get(key(raw));
  if (known) return known.name;
  return raw.trim().toLowerCase()
    .replace(/(^|[\s/(-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, c: string) => `Mc${c.toUpperCase()}`)
    .replace(/\b(Nw|Ne|Sw|Se)\b/g, q => q.toUpperCase());
}

export function quadrantOf(name: string): Quadrant | undefined {
  return byKey.get(key(name))?.quadrant;
}

/** Nearest of the 20 bundled centres within ~3 km, or ''. Only used when the City polygons can't be had. */
export function nearestFallbackCentre(lat: number, lng: number): string {
  const MAX_DIST = 0.035;
  let best = { name: '', dist: Infinity };
  for (const n of FALLBACK_CENTRES) {
    const dLat = lat - n.lat;
    const dLng = (lng - n.lng) * Math.cos(n.lat * (Math.PI / 180));
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < MAX_DIST && dist < best.dist) best = { name: n.name, dist };
  }
  return best.name;
}

export interface ResolvedNeighbourhood { name: string; exact: boolean }

/**
 * The community containing a report's pin. `exact` is true when it came from the
 * City polygon rather than the nearest bundled centre. Empty name = outside Calgary
 * (or offline and nowhere near a known centre): the reporter picks.
 */
export async function resolveReportNeighbourhood(
  lat: number,
  lng: number,
  boundaries: () => Promise<CommunityBoundary[]> = fetchCommunityBoundaries,
): Promise<ResolvedNeighbourhood> {
  let list: CommunityBoundary[] = [];
  try { list = await boundaries(); } catch { list = []; }
  if (list.length) {
    const hit = findCommunityAt(lat, lng, list);
    return hit ? { name: displayCommunity(hit), exact: true } : { name: '', exact: true };
  }
  return { name: nearestFallbackCentre(lat, lng), exact: false };
}

/**
 * Communities matching what was typed, best first: name prefix, then a word in the
 * name starting with it, then an alias ("kensington" finds Hillhurst and Sunnyside,
 * "marda loop" finds Altadore and South Calgary), then anywhere in the name.
 */
export function matchCommunities(query: string, limit = 6): Array<CalgaryCommunity & { via?: string }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const k = key(q);
  const scored: Array<{ c: CalgaryCommunity; score: number; via?: string }> = [];
  for (const c of CALGARY_COMMUNITIES) {
    const name = c.name.toLowerCase();
    const alias = c.aliases?.find(a => a.startsWith(q) || key(a) === k);
    let score = 0;
    if (key(name).startsWith(k)) score = 4;
    else if (name.split(/[\s/-]+/).some(w => w.startsWith(q))) score = 3;
    else if (alias) score = 2;
    else if (k.length >= 3 && key(name).includes(k)) score = 1;
    if (score) scored.push({ c, score, ...(score === 2 && alias ? { via: alias } : {}) });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.c.name.length - b.c.name.length || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map(({ c, via }) => (via ? { ...c, via } : c));
}
