/**
 * Place a news story or police release in the Calgary community it names.
 *
 * The newsroom feeds were matched against an 81-name shortlist, so a story set
 * in Saddle Ridge, Marlborough or Rundle had nowhere to go and was dropped: in
 * the 2026-10-21 snapshot only 4 of the map's newest 60 records were crime
 * stories. The City's community boundary dataset (surr-xmvs, the same one the
 * neighbourhood layer uses) names every community, so each run loads it once
 * and pins a story at the centre of the community its text names.
 *
 * Nothing is guessed. A story is placed only when its text names a community
 * or a quadrant; a pin at a community's centre means "somewhere in this
 * community", which is what the story says. Stories set in another town are
 * refused even when a Calgary community shares the name (Sherwood Park is not
 * Sherwood).
 */

import { NEIGHBOURHOOD_COORDS } from '../../../src/data/neighbourhoodCoords.js';
import { toCommunityBoundary, type CommunityBoundary } from '../../../src/lib/communityLookup.js';

export interface PlacedLocation {
  neighborhood: string;
  lat: number;
  lng: number;
}

export interface CommunityPoint extends PlacedLocation {
  /** Lowercased phrase to look for in story text. */
  phrase: string;
}

const BOUNDARIES_URL = 'https://data.calgary.ca/resource/surr-xmvs.json?$limit=500';

/**
 * Community names that are also ordinary words or other places. They count
 * only with a cue that makes them a place: "in Legacy", "Legacy community",
 * "Mission SW".
 */
const NEEDS_CONTEXT = new Set([
  'legacy', 'mission', 'temple', 'homestead', 'cornerstone', 'crossroads', 'citadel', 'sundance',
  'belmont', 'redstone', 'livingston', 'parkland', 'richmond', 'fairview', 'lakeview', 'westgate',
  'woodlands', 'mayfair', 'patterson', 'palliser', 'evergreen', 'dover', 'queensland', 'belvedere',
  'lucas', 'walden', 'rundle', 'glendale', 'oakridge', 'bayview', 'chaparral', 'seton', 'kingsland',
  'riverbend', 'southview', 'hidden valley', 'signal hill', 'highland park', 'downtown', 'montgomery',
  'ogden', 'harvest hills', 'silverado', 'parkdale', 'rosedale', 'rosemont', 'highwood', 'cambrian heights',
  'university heights', 'hotchkiss', 'wildwood', 'elboya', 'meadowlark park', 'windsor park', 'scarboro',
  'collingwood', 'greenview', 'renfrew', 'haysboro', 'acadia', 'dalhousie', 'brentwood', 'sherwood',
  'braeside', 'erlton', 'south calgary', 'garrison green', 'currie barracks', 'banff trail', 'pine creek',
]);

/** Places reporters write in lower case ("in downtown Calgary"). */
const LOWERCASE_OK = new Set(['downtown', 'east village', 'chinatown']);

/** Towns and cities near Calgary whose stories run in the Calgary feeds. */
const ELSEWHERE = /\b(edmonton|red deer|lethbridge|medicine hat|airdrie|cochrane|chestermere|okotoks|strathmore|high river|banff|canmore|sherwood park|st\.? albert|fort mcmurray|grande prairie|lloydminster|camrose|brooks|olds|didsbury|calgary-area rcmp|rocky view county|foothills county|tsuut'?ina|stoney nakoda|siksika|saskatchewan|british columbia|b\.c\.|montana|ontario|toronto|vancouver|winnipeg|regina|saskatoon)\b/i;

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Average of the outer ring of the largest polygon — inside for every Calgary community shape. */
export function communityCentre(boundary: CommunityBoundary): [number, number] {
  const largest = [...boundary.polygons].sort((a, b) => (b[0]?.length ?? 0) - (a[0]?.length ?? 0))[0];
  const ring = largest?.[0] ?? [];
  let lat = 0;
  let lng = 0;
  for (const [x, y] of ring) { lng += x; lat += y; }
  const n = Math.max(ring.length, 1);
  return [lat / n, lng / n];
}

/** The shortlist that has always shipped with the site, as a fallback when the City is unreachable. */
export function shortlistPoints(): CommunityPoint[] {
  return Object.entries(NEIGHBOURHOOD_COORDS).map(([phrase, [lat, lng]]) => ({
    phrase, neighborhood: titleCase(phrase), lat, lng,
  }));
}

/** Every phrase a community can be named by: its name and each half of a "A/B" name. */
export function pointsFromBoundaries(rows: unknown[]): CommunityPoint[] {
  const points: CommunityPoint[] = [];
  for (const row of rows) {
    const boundary = toCommunityBoundary(row);
    if (!boundary) continue;
    const [lat, lng] = communityCentre(boundary);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const neighborhood = titleCase(boundary.name);
    const phrases = new Set([boundary.name, ...boundary.name.split('/').map((p) => p.trim())]);
    for (const phrase of phrases) if (phrase.length >= 4) points.push({ phrase, neighborhood, lat, lng });
  }
  return points;
}

let cached: Promise<CommunityPoint[]> | null = null;

/**
 * City boundaries merged over the shortlist (City names win). Loaded once per
 * run; on failure the shortlist alone still places what it always placed.
 */
export function loadCommunityPoints(fetchImpl: typeof fetch = fetch): Promise<CommunityPoint[]> {
  if (cached) return cached;
  cached = (async () => {
    const byPhrase = new Map(shortlistPoints().map((p) => [p.phrase, p]));
    try {
      const res = await fetchImpl(BOUNDARIES_URL, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (Array.isArray(rows)) for (const p of pointsFromBoundaries(rows)) byPhrase.set(p.phrase, p);
    } catch (err) {
      console.warn('[locator] Community boundaries unavailable, using the shortlist:', err instanceof Error ? err.message : err);
    }
    return [...byPhrase.values()];
  })();
  return cached;
}

/** True when the story is set somewhere other than Calgary. */
export function isSetElsewhere(title: string, text: string): boolean {
  const titleElsewhere = ELSEWHERE.test(title) && !/\bcalgary\b/i.test(title);
  const nowhereCalgary = ELSEWHERE.test(text) && !/\bcalgary\b/i.test(text);
  return titleElsewhere || nowhereCalgary;
}

function quadrant(text: string): PlacedLocation | null {
  if (/\b(?:northwest|n\.?w\.?)\s+(?:calgary|community|area)\b|\bcalgary'?s northwest\b|\bcalgary,?\s+nw\b/i.test(text)) {
    return { neighborhood: 'Northwest Calgary', lat: 51.128, lng: -114.190 };
  }
  if (/\b(?:northeast|n\.?e\.?)\s+(?:calgary|community|area)\b|\bcalgary'?s northeast\b|\bcalgary,?\s+ne\b/i.test(text)) {
    return { neighborhood: 'Northeast Calgary', lat: 51.128, lng: -113.980 };
  }
  if (/\b(?:southwest|s\.?w\.?)\s+(?:calgary|community|area)\b|\bcalgary'?s southwest\b|\bcalgary,?\s+sw\b/i.test(text)) {
    return { neighborhood: 'Southwest Calgary', lat: 50.975, lng: -114.180 };
  }
  if (/\b(?:southeast|s\.?e\.?)\s+(?:calgary|community|area)\b|\bcalgary'?s southeast\b|\bcalgary,?\s+se\b/i.test(text)) {
    return { neighborhood: 'Southeast Calgary', lat: 50.975, lng: -113.980 };
  }
  return null;
}

/**
 * The community a story names first (the headline outranks the body), else
 * the quadrant it names, else null. Names are matched as written ("Saddle
 * Ridge", not "saddle ridge" inside another word); ambiguous ones need a cue.
 */
export function locateInText(text: string, points: CommunityPoint[]): PlacedLocation | null {
  let best: { index: number; length: number; point: CommunityPoint } | null = null;
  for (const point of points) {
    const name = escapeRe(point.phrase).replace(/\\ /g, '\\s+').replace(/ /g, '\\s+');
    const re = NEEDS_CONTEXT.has(point.phrase)
      ? new RegExp(`(?:\\b(?:in|of|near|around|from)\\s+(?:the\\s+)?(${name})\\b(?!\\s+park\\b)|\\b(${name})\\s+(?:community|neighbourhood|neighborhood|area|n\\.?[ew]\\.?|s\\.?[ew]\\.?)\\b)`, 'i')
      : new RegExp(`\\b(${name})\\b(?!\\s+park\\b)`, 'i');
    const match = re.exec(text);
    if (!match) continue;
    const matched = match[1] ?? match[2] ?? '';
    // Written as a name, not a common word: "Legacy" counts, "legacy" doesn't.
    if (!LOWERCASE_OK.has(point.phrase) && !/^[A-Z0-9]/.test(matched.trim())) continue;
    const index = match.index + match[0].indexOf(matched);
    // Earliest wins; at the same spot the longer name wins ("Saddle Ridge" over "Ridge").
    if (!best || index < best.index || (index === best.index && point.phrase.length > best.length)) {
      best = { index, length: point.phrase.length, point };
    }
  }
  if (best) return { neighborhood: best.point.neighborhood, lat: best.point.lat, lng: best.point.lng };
  return quadrant(text);
}
