import type { Business, DiscoveryEntity, Event, MarketOccurrence } from '../types/discovery';
import { entityPath } from './discovery';
import { organizerEvents, organizerMarkets } from './organizations';

/**
 * Local is a directory of profiles: the organizations behind Calgary's stages, markets
 * and community halls, and the independent shops we'd send a friend to. Every profile
 * sits on exactly one shelf, so the page reads like a well-kept directory, not a pile.
 */
export type ShelfId = 'stages' | 'culture' | 'markets' | 'coffee' | 'days-out' | 'day-trips' | 'community' | 'seasonal';

export interface Shelf { id: ShelfId; label: string; line: string; tone: string; ink: string }

export const SHELVES: Shelf[] = [
  { id: 'stages', label: 'Stages', line: 'Theatre, opera, dance and the halls they play in.', tone: '#d8433f', ink: '#fff' },
  { id: 'culture', label: 'Galleries & culture', line: 'Galleries, heritage, books and languages.', tone: '#7b56c7', ink: '#fff' },
  { id: 'markets', label: 'Markets & makers', line: 'Farmers’ markets, makers’ fairs and the people who run them.', tone: '#3a8f74', ink: '#fff' },
  { id: 'coffee', label: 'Coffee & corner shops', line: 'Independents worth crossing the river for.', tone: '#c98a2e', ink: '#151515' },
  { id: 'days-out', label: 'Days out', line: 'Big days with the kids, the grandparents or both.', tone: '#00c2e0', ink: '#151515' },
  { id: 'community', label: 'Community groups', line: 'Community associations and the volunteers who run the neighbourhood.', tone: '#1554d1', ink: '#fff' },
  { id: 'day-trips', label: 'Day trips', line: 'Farms and fairgrounds a short drive out of town.', tone: '#ffdf4f', ink: '#151515' },
  { id: 'seasonal', label: 'Seasonal', line: 'Here for a season: haunted Octobers and Christmas markets.', tone: '#06162f', ink: '#fff' },
];

const has = (list: string[], ...words: string[]) => list.some(x => words.includes(x.toLowerCase()));

/** Which shelf a profile belongs on. The first rule that matches wins. */
export function shelfOf(p: Pick<Business, 'title' | 'categories' | 'tags'>): ShelfId {
  const { title, categories: c, tags: t } = p;
  if (has(t, 'outside-calgary', 'day-trip') || has(c, 'day-trip')) return 'day-trips';
  if (has(c, 'holiday', 'nightlife')) return 'seasonal';
  if (/community association|\bBIA\b|business improvement|\bYMCA\b/i.test(title)) return 'community';
  if (has(t, 'theatre', 'performing arts', 'live theatre', 'opera', 'ballet', 'dance') || /theatre|opera|ballet|werklund/i.test(title)) return 'stages';
  if (has(c, 'markets') || has(t, 'farmers-market', 'artisan-market', 'makers') || /market/i.test(title)) return 'markets';
  if (has(c, 'family') || has(t, 'zoo', 'attraction')) return 'days-out';
  if (has(t, 'coffee', 'espresso', 'organic coffee') || (has(c, 'food') && !has(t, 'organization', 'organizer'))) return 'coffee';
  if (has(c, 'community')) return 'community';
  return 'culture';
}

export interface ProfileNext { title: string; path: string; start: string; end: string; venue?: string; dateOnly: boolean }
/** What a profile has coming up: how many dates, and the next one. */
export interface Programme { count: number; next?: ProfileNext; onNow?: ProfileNext }

const asNext = (e: Event): ProfileNext => ({ title: e.title, path: entityPath(e), start: e.start, end: e.end, venue: e.venue ?? e.neighbourhood, dateOnly: e.schedulePrecision === 'date' });

/** A profile's programme: its own events, plus the open dates of markets it runs. */
export function programmeOf(id: string, all: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], now = Date.now()): Programme {
  const events = organizerEvents(id, all, now);
  const dates: ProfileNext[] = events.map(asNext);
  for (const m of organizerMarkets(id, all, now)) {
    for (const o of occurrences) {
      if (o.marketId !== m.id || o.cancelled || Date.parse(o.end) <= now) continue;
      dates.push({ title: m.title, path: entityPath(m), start: o.start, end: o.end, venue: m.venue ?? m.neighbourhood, dateOnly: false });
    }
  }
  dates.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { count: dates.length, next: dates.find(d => Date.parse(d.start) > now), onNow: dates.find(d => Date.parse(d.start) <= now) };
}

export interface BoardRow extends ProfileNext { profile: Business }

/**
 * "Coming up from Local": the next dated thing from each profile, soonest first, one row
 * per profile so one busy organizer can't fill the board.
 */
export function boardRows(profiles: readonly Business[], programmes: ReadonlyMap<string, Programme>, limit = 8): BoardRow[] {
  return profiles
    .flatMap(p => { const next = programmes.get(p.id)?.next; return next ? [{ ...next, profile: p }] : []; })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, limit);
}
