import { CALGARY_COMMUNITIES, type Quadrant } from '../data/calgaryCommunities';

/**
 * Home areas as members type them: "copperfield", "Seton SE", "Varsity,
 * Calgary", and now and then a full street address in the neighbourhood box.
 * One reading for all of them, so admin tallies, saved profiles and the
 * Thursday email agree on what an area is called.
 */

export type HomeArea =
  | { kind: 'community'; name: string; quadrant: Quadrant }
  | { kind: 'nearby'; name: string }
  | { kind: 'address' }
  | { kind: 'other'; name: string };

/** Towns around Calgary that members give as home. Not Calgary communities. */
const NEARBY = ['Airdrie', 'Chestermere', 'Cochrane', 'Okotoks', 'Strathmore', 'High River', 'Canmore', 'Banff', 'Bragg Creek', 'Langdon', 'Crossfield', 'Didsbury', 'Black Diamond', 'Turner Valley', 'Rocky View County', 'Foothills County', 'Priddis', 'De Winton', 'Springbank'];

const key = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9/]+/g, ' ').trim();

const COMMUNITY = new Map<string, { name: string; quadrant: Quadrant }>();
for (const c of CALGARY_COMMUNITIES) {
  for (const n of [c.name, ...(c.aliases ?? [])]) if (!COMMUNITY.has(key(n))) COMMUNITY.set(key(n), { name: c.name, quadrant: c.quadrant });
}
// Springbank Hill is a Calgary community; plain "Springbank" is the acreage area west of the city.
COMMUNITY.delete('springbank');
const TOWN = new Map(NEARBY.map((n) => [key(n), n]));

/** A house number then a street, or a street type with a number: "8948 elbow drive", "12 Ave SW 400". */
export function looksLikeStreetAddress(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (/^\d{1,6}[a-z]?\s+[a-z0-9]/.test(s)) return true;
  return /\d/.test(s) && /\b(st|street|ave|avenue|dr|drive|rd|road|blvd|boulevard|trail|tr|way|cres|crescent|close|court|ct|place|pl|gate|green|lane|ln|hill|hts|heights|mews|terrace|point|bay|circle|cir)\b/.test(s) && s.split(/\s+/).length >= 3;
}

/** Strip "Calgary", province and quadrant noise, collapse spaces. */
function bare(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
    .replace(/,?\s*(calgary|yyc)\b.*$/i, '')
    .replace(/,?\s*(alberta|ab)\.?$/i, '')
    .replace(/\s+(nw|ne|sw|se)\.?$/i, '')
    .replace(/[,.\s]+$/, '')
    .trim();
}

/** Title case for text typed in all lower or all upper case; mixed case is left as the person wrote it. */
function tidyCase(s: string): string {
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
}

export function readHomeArea(raw: string | undefined | null): HomeArea | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  if (looksLikeStreetAddress(text)) return { kind: 'address' };
  const b = bare(text) || text;
  const hit = COMMUNITY.get(key(b)) ?? COMMUNITY.get(key(b.split('/')[0]));
  if (hit) return { kind: 'community', ...hit };
  const town = TOWN.get(key(b));
  if (town) return { kind: 'nearby', name: town };
  return { kind: 'other', name: tidyCase(b) };
}

/**
 * The neighbourhood to store from what was typed. A Calgary community or a
 * nearby town gets its proper spelling ("copperfield" becomes "Copperfield");
 * anything else keeps the person's words, tidied. Aliases stay as typed so
 * "Kensington" isn't silently renamed "Hillhurst" on someone's profile.
 */
export function canonicalNeighborhood(raw: string): string {
  const area = readHomeArea(raw);
  if (!area || area.kind === 'address') return raw.trim();
  if (area.kind === 'nearby') return area.name;
  if (area.kind === 'community') {
    const b = bare(raw);
    const exact = key(b) === key(area.name);
    return exact ? area.name : tidyCase(b);
  }
  return area.name;
}

/** How a home area reads in the admin tally. Street addresses are never shown, only counted. */
export function homeAreaLabel(area: HomeArea): string {
  if (area.kind === 'address') return 'Street address (hidden)';
  return area.name;
}
