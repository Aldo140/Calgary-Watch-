import type { Business, DiscoveryEntity, Event, Guide, Market, MarketOccurrence, Neighbourhood } from '../types/discovery';
import type { LocalNote } from '../data/localNotes';
import { entityPath } from './discovery';

export interface NextNearby { kind: 'market' | 'event'; title: string; path: string; start: string; here: boolean }
/** What a Local place connects to elsewhere on the site: its neighbourhood, the guides that pass it, and what's on nearby next. */
export interface LocalLinks { hood?: Neighbourhood; guides: Guide[]; next?: NextNearby }

const lc = (s?: string) => (s ?? '').toLowerCase().trim();

/** The neighbourhood page for a place ("Bridgeland" finds "Bridgeland-Riverside"). */
export function hoodOf(b: Pick<Business, 'neighbourhood'>, hoods: Neighbourhood[]): Neighbourhood | undefined {
  const n = lc(b.neighbourhood);
  if (!n) return undefined;
  return hoods.find(h => { const t = lc(h.title); return t === n || t.startsWith(n) || n.startsWith(t); });
}

export function localLinks(b: Business, all: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], note?: LocalNote, now = Date.now()): LocalLinks {
  const hoods = all.filter((e): e is Neighbourhood => e.kind === 'neighbourhood');
  const hood = hoodOf(b, hoods);
  const guides = all.filter((e): e is Guide => e.kind === 'guide' && (
    e.entries.some(x => x.entityId === b.id || (hood && x.entityId === hood.id))
    || !!e.stops?.some(s => s.entityId === b.id)));

  // Nearby means the same neighbourhood, or one next door that the notes name.
  const areas = new Set([lc(b.neighbourhood), lc(hood?.title), ...(note?.nearby ?? []).map(lc)].filter(Boolean));
  const near = (e: DiscoveryEntity) => areas.has(lc(e.neighbourhood));
  const here = (m: Market) => !!note?.marketMatch && lc(`${m.title} ${m.venue ?? ''}`).includes(note.marketMatch);

  const options: NextNearby[] = [];
  for (const m of all.filter((e): e is Market => e.kind === 'market' && (near(e) || here(e)))) {
    const o = occurrences.filter(x => x.marketId === m.id && !x.cancelled && Date.parse(x.end) > now).sort((a, c) => Date.parse(a.start) - Date.parse(c.start))[0];
    if (o) options.push({ kind: 'market', title: m.title, path: entityPath(m), start: o.start, here: here(m) });
  }
  for (const e of all.filter((x): x is Event => x.kind === 'event' && !x.cancelled && near(x) && Date.parse(x.end) > now)) {
    options.push({ kind: 'event', title: e.title, path: entityPath(e), start: e.start, here: false });
  }
  // A market held at the place itself wins; otherwise whatever's on soonest.
  options.sort((a, c) => Number(c.here) - Number(a.here) || Date.parse(a.start) - Date.parse(c.start));
  return { hood, guides, next: options[0] };
}
