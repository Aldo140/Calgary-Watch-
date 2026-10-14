import type { DiscoveryEntity, Guide, MarketOccurrence, Neighbourhood } from '../types/discovery';
import { NEIGHBOURHOOD_COORDS } from '../data/neighbourhoodCoords';
import { filterInventory, upcomingOccurrences } from './discoveryCalendar';
import { isCampusOnly } from './eventRank';
import { byVerified } from './verified';

/**
 * Ties a neighbourhood page to the rest of the site. Neighbourhood documents
 * rarely list their own `entityIds`, so this works out what belongs to (or is
 * near) each one from what listings already say about themselves: their
 * neighbourhood field, venue, address, title and tags, and coordinates.
 */

export type LatLng = [number, number];

/** Extra names a listing might use for each neighbourhood, and a centre point. */
const HOODS: Record<string, { at: LatLng; names: string[] }> = {
  inglewood: { at: [51.0406, -114.0201], names: ['inglewood', '9 ave se', '9 avenue se', 'bird sanctuary'] },
  kensington: { at: [51.0560, -114.0890], names: ['kensington', 'hillhurst', 'sunnyside', '10 st nw', 'riley park'] },
  beltline: { at: [51.0381, -114.0680], names: ['beltline', 'victoria park', '17 ave sw', '17th ave', 'red mile', 'central memorial park'] },
  'bridgeland-riverside': { at: [51.0560, -114.0412], names: ['bridgeland', 'riverside', '1 ave ne', 'murdoch park', 'murdock park', 'centre ave ne'] },
  'marda-loop': { at: [51.0215, -114.1010], names: ['marda loop', 'south calgary', 'altadore', '33 ave sw', '34 ave sw', 'cspace', '29 ave sw'] },
  bowness: { at: [51.0900, -114.1900], names: ['bowness'] },
  ramsay: { at: [51.0300, -114.0360], names: ['ramsay', 'scotsman'] },
};

/** Where listings without coordinates are, from words in their address or place name. */
const PLACE_HINTS: Array<[RegExp, LatLng]> = [
  [/university heights|university of calgary|\bucalgary\b/i, [51.0700, -114.1340]],
  [/greenwood|greenbriar/i, [51.0870, -114.2150]],
  [/fairview/i, [50.9850, -114.0400]],
  [/south calgary/i, [51.0260, -114.0980]],
  [/roundup way|stampede park|bmo centre/i, [51.0370, -114.0530]],
  [/barclay parade|eau claire|prince'?s island/i, [51.0538, -114.0757]],
  [/26 ave se|crossroads/i, [51.0300, -114.0300]],
  [/77 ave se/i, [50.9850, -114.0500]],
  [/dalhart|dalhousie/i, [51.1050, -114.1600]],
  [/heritage park/i, [50.9850, -114.1050]],
  [/stephen ave|olympic plaza|downtown/i, [51.0460, -114.0640]],
];

/** True when `name` appears in `text` as whole words ("9 ave se" doesn't match "19 ave se"). */
const hasName = (text: string, name: string) => new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(text);
const norm = (s: string) => s.toLocaleLowerCase('en-CA').replace(/[’']/g, '').replace(/&#8217;/g, '');

/** Every name the neighbourhood answers to. */
export function hoodNames(hood: Pick<Neighbourhood, 'slug' | 'title'>): string[] {
  const own = norm(hood.title);
  const extra = HOODS[hood.slug]?.names ?? [];
  return [...new Set([own, ...own.split(/\s*[-/]\s*/).filter(p => p.length > 3), ...extra])];
}

export function hoodCentre(hood: Pick<Neighbourhood, 'slug' | 'title'>): LatLng | undefined {
  if (HOODS[hood.slug]) return HOODS[hood.slug].at;
  const key = norm(hood.title);
  return NEIGHBOURHOOD_COORDS[key] ?? NEIGHBOURHOOD_COORDS[key.split(/\s*[-/]\s*/)[0]];
}

/** Straight-line km between two points. */
export function km(a: LatLng, b: LatLng): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function listingText(e: DiscoveryEntity): string {
  return norm([e.title, e.neighbourhood, 'venue' in e ? e.venue : '', 'address' in e ? e.address : '', ...e.tags].filter(Boolean).join(' · '));
}

function placeName(e: DiscoveryEntity): string {
  return ('venue' in e && e.venue) || e.neighbourhood || ('address' in e ? e.address : '') || e.title;
}

/** Best guess at where a listing is. */
export function placeOf(e: DiscoveryEntity): LatLng | undefined {
  if ('coordinates' in e && e.coordinates) return [e.coordinates.lat, e.coordinates.lng];
  if (e.neighbourhood) {
    const key = norm(e.neighbourhood);
    const hit = NEIGHBOURHOOD_COORDS[key] ?? NEIGHBOURHOOD_COORDS[key.split('/')[0].trim()];
    if (hit) return hit;
  }
  const text = listingText(e);
  for (const [slug, h] of Object.entries(HOODS)) if (h.names.some(n => hasName(text, n)) || hasName(text, slug.replace(/-/g, ' '))) return h.at;
  for (const [re, at] of PLACE_HINTS) if (re.test(text)) return at;
  return undefined;
}

/** The quadrant a listing's address names, if any. */
export function quadrantOf(e: DiscoveryEntity): string | undefined {
  if (e.kind === 'neighbourhood') return e.quadrant;
  const m = ('address' in e ? e.address : '')?.toUpperCase().match(/\b(NW|NE|SW|SE)\b/);
  return m?.[1];
}

export type Closeness = 'here' | 'nearby' | 'quadrant';
export interface Linked<T extends DiscoveryEntity = DiscoveryEntity> { entity: T; closeness: Closeness; km?: number; when?: string }

const HERE_KM = 1.4;
const NEAR_KM = 3;

function closenessTo(hood: Neighbourhood, e: DiscoveryEntity): { closeness: Closeness; km?: number } | undefined {
  if (hood.entityIds.includes(e.id)) return { closeness: 'here' };
  const text = listingText(e);
  if (hoodNames(hood).some(n => n.length > 3 && hasName(text, n))) return { closeness: 'here' };
  const centre = hoodCentre(hood), at = placeOf(e);
  if (centre && at) {
    const d = km(centre, at);
    if (d <= HERE_KM) return { closeness: 'here', km: d };
    if (d <= NEAR_KM) return { closeness: 'nearby', km: d };
  }
  if (quadrantOf(e) === hood.quadrant) return { closeness: 'quadrant' };
  return undefined;
}

const RANK: Record<Closeness, number> = { here: 0, nearby: 1, quadrant: 2 };

export interface HoodLinks {
  events: Linked[];
  markets: Linked[];
  places: Linked[];
  guides: Guide[];
  /** Other neighbourhoods, nearest first. */
  neighbours: Array<{ hood: Neighbourhood; km?: number }>;
}

/** What's on, open and written about in and around a neighbourhood, nearest first. */
export function linksFor(hood: Neighbourhood, all: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], now = new Date()): HoodLinks {
  const live = filterInventory(all, occurrences, undefined, undefined, now);
  const linked = (kind: DiscoveryEntity['kind']) => live
    .filter(e => e.kind === kind && !(e.kind === 'event' && isCampusOnly(e)))
    .map(e => {
      const c = closenessTo(hood, e);
      if (!c) return undefined;
      const when = e.kind === 'event' ? e.start : e.kind === 'market' ? upcomingOccurrences(occurrences, e.id, now).find(o => !o.cancelled)?.start : undefined;
      return { entity: e, ...c, when } as Linked;
    })
    .filter((x): x is Linked => !!x)
    // Dated listings stay soonest first. Places have no date: a verified place
    // leads others equally close (verified.ts).
    .sort((a, b) => RANK[a.closeness] - RANK[b.closeness] || (a.when && b.when ? Date.parse(a.when) - Date.parse(b.when) : byVerified(a.entity, b.entity, now.getTime()) || (a.km ?? 9) - (b.km ?? 9)));
  // The same series (a ghost tour every night, "(Sundays)", "(Fridays)") shows once, at its next date.
  const series = (l: Linked) => norm(l.entity.title).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const once = linked('event').filter((l, i, list) => list.findIndex(o => series(o) === series(l)) === i);
  // Anything in or near comes first. Elsewhere in the quadrant only tops up a
  // thin list, one per venue, so a big venue across the quadrant can't fill it.
  const close = once.filter(l => l.closeness !== 'quadrant');
  const venues = new Set<string>();
  const wider = once.filter(l => {
    if (l.closeness !== 'quadrant') return false;
    const v = norm(placeName(l.entity));
    if (venues.has(v)) return false;
    venues.add(v);
    return true;
  });
  const events = [...close, ...wider.slice(0, Math.max(0, 4 - close.length))];
  const names = hoodNames(hood);
  const guides = all.filter((e): e is Guide => e.kind === 'guide' && (
    e.entries.some(x => x.entityId === hood.id) || (e.stops ?? []).some(s => names.some(n => norm(`${s.area} ${s.name}`).includes(n))) || names.some(n => norm(`${e.title} ${e.tags.join(' ')}`).includes(n))));
  const centre = hoodCentre(hood);
  const neighbours = all
    .filter((e): e is Neighbourhood => e.kind === 'neighbourhood' && e.id !== hood.id)
    .map(h => { const at = hoodCentre(h); return { hood: h, km: centre && at ? km(centre, at) : undefined }; })
    .sort((a, b) => (a.km ?? 99) - (b.km ?? 99) || (a.hood.quadrant === hood.quadrant ? -1 : 1));
  return { events, markets: linked('market'), places: linked('business'), guides, neighbours };
}

/** Counts for a neighbourhood card: things in it or within a short trip. */
export function closeCount(links: HoodLinks): { events: number; markets: number; places: number } {
  const close = (l: Linked) => l.closeness !== 'quadrant';
  return { events: links.events.filter(close).length, markets: links.markets.filter(close).length, places: links.places.filter(close).length };
}

/** A few words that describe the neighbourhood, from its categories. */
const VIBE: Record<string, string> = {
  heritage: 'Heritage', walkable: 'Walkable', food: 'Food & drink', shopping: 'Shopping', arts: 'Arts', nightlife: 'Nightlife',
  parks: 'Parks', outdoors: 'Outdoors', family: 'Family', scenic: 'Views', markets: 'Markets',
};
export function vibes(hood: Neighbourhood): string[] {
  return hood.categories.map(c => VIBE[c]).filter(Boolean);
}
