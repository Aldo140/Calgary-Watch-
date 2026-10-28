import type { DiscoveryEntity, Event, Guide, GuideStop, Market, MarketOccurrence, Neighbourhood } from '../types/discovery';
import { calgaryDateTimeFormat } from './calgaryTz';
import { toSlug } from './communityRank';
import { NEIGHBOURHOOD_COORDS } from '../data/neighbourhoodCoords';

/**
 * Helpers behind the Markets pages: when a market is on, where it is, and the
 * other parts of CalgaryWatch it connects to (its neighbourhood, the 311 rank
 * for its community, the markets guide, events the same day).
 */

const fmt = (opts: Intl.DateTimeFormatOptions) => calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...opts });
export const dayKey = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
export const weekdayShort = fmt({ weekday: 'short' });
export const weekdayLong = fmt({ weekday: 'long' });
export const monthShort = fmt({ month: 'short' });
export const monthDay = fmt({ month: 'short', day: 'numeric' });
export const dayNum = fmt({ day: 'numeric' });
export const clock = fmt({ hour: 'numeric', minute: '2-digit' });
const hm = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const DAY_MS = 86_400_000;
export const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "9 a.m." rather than "9:00 a.m."; minutes only when they matter. */
export function shortClock(iso: string | Date) {
  return clock.format(new Date(iso)).replace(':00', '');
}

export function hours(o: Pick<MarketOccurrence, 'start' | 'end'>) {
  return `${shortClock(o.start)}–${shortClock(o.end)}`;
}

export function upcoming(market: Market, occurrences: readonly MarketOccurrence[], now: Date) {
  return occurrences
    .filter(o => o.marketId === market.id && Date.parse(o.end) > now.getTime())
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function nextOpen(market: Market, occurrences: readonly MarketOccurrence[], now: Date) {
  return upcoming(market, occurrences, now).find(o => !o.cancelled);
}

export function isOpen(o: MarketOccurrence | undefined, now: Date) {
  return !!o && Date.parse(o.start) <= now.getTime() && Date.parse(o.end) > now.getTime();
}

export function relativeDay(iso: string, now: Date) {
  const key = dayKey.format(new Date(iso));
  if (key === dayKey.format(now)) return 'Today';
  if (key === dayKey.format(new Date(now.getTime() + DAY_MS))) return 'Tomorrow';
  return weekdayLong.format(new Date(iso));
}

/** Calgary calendar days from now until a date: 0 today, 1 tomorrow. */
export function daysUntil(iso: string, now: Date) {
  const day = (d: Date) => Date.parse(`${dayKey.format(d)}T12:00:00Z`);
  return Math.round((day(new Date(iso)) - day(now)) / DAY_MS);
}

/** How far off a date is, for a ticket: "Open now", "Today", "In 4 days", "In 5 weeks". */
export function countdown(o: Pick<MarketOccurrence, 'start' | 'end'>, now: Date) {
  if (Date.parse(o.start) <= now.getTime() && Date.parse(o.end) > now.getTime()) return 'Open now';
  const n = daysUntil(o.start, now);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 14) return `In ${n} days`;
  return `In ${Math.round(n / 7)} weeks`;
}

/** One line a person reads before deciding: open now, or when it's next on. */
export function statusLine(next: MarketOccurrence | undefined, now: Date) {
  if (!next) return 'No dates listed yet';
  if (isOpen(next, now)) return `Open now until ${shortClock(next.end)}`;
  const day = relativeDay(next.start, now);
  const far = Date.parse(next.start) - now.getTime() > 6 * DAY_MS;
  return `${far ? `${weekdayShort.format(new Date(next.start))}, ${monthDay.format(new Date(next.start))}` : day} · ${hours(next)}`;
}

/** The usual pattern from the dates we hold: "Fri–Sun · 9 a.m.–5 p.m.". */
export function schedulePattern(dates: readonly MarketOccurrence[]) {
  const live = dates.filter(o => !o.cancelled);
  if (!live.length) return null;
  const raw = [...new Set(live.map(o => WEEK.indexOf(weekdayShort.format(new Date(o.start)))))].filter(d => d >= 0);
  // A weekend market reads Fri–Sun, not Sun, Fri, Sat: Sunday follows Saturday when both ends of the week are in.
  const days = raw.map(d => (d === 0 && raw.includes(6) ? 7 : d)).sort((a, b) => a - b);
  const byHours = new Map<string, number>();
  for (const o of live) { const k = hours(o); byHours.set(k, (byHours.get(k) ?? 0) + 1); }
  const usual = [...byHours.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const consecutive = days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const dayText = live.length === 1 ? `${weekdayLong.format(new Date(live[0].start))} only`
    : consecutive ? `${WEEK[days[0] % 7]}–${WEEK[days[days.length - 1] % 7]}`
    : days.map(d => WEEK[d % 7]).join(', ');
  return { days: days.map(d => d % 7), dayText, hours: usual, weekly: live.length > 1 };
}

export function season(market: Market) {
  const t = market.tags.join(' ').toLowerCase();
  if (/christmas|holiday/.test(t) || market.categories.includes('holiday')) return 'Holiday';
  if (/year-round/.test(t)) return 'Year-round';
  if (/seasonal/.test(t)) return 'Seasonal';
  return null;
}

export function hasFreeParking(market: Market) {
  return market.amenities.some(a => /parking/i.test(a)) || /free parking/i.test(market.parking ?? '');
}

export function isIndoor(market: Market) {
  return market.tags.some(t => /indoor|food hall/i.test(t)) || market.amenities.some(a => /food hall/i.test(a));
}

/** Filter chips on /markets (?type=). */
export const MARKET_TYPES: { id: string; label: string; test: (m: Market) => boolean }[] = [
  { id: 'year-round', label: 'Year-round', test: m => season(m) === 'Year-round' },
  { id: 'farmers', label: 'Farmers’ markets', test: m => m.tags.some(t => /farmers/i.test(t)) },
  { id: 'makers', label: 'Makers & artists', test: m => m.tags.some(t => /makers|artists/i.test(t)) || m.amenities.some(a => /makers/i.test(a)) },
  { id: 'holiday', label: 'Holiday', test: m => season(m) === 'Holiday' },
  { id: 'indoor', label: 'Indoors', test: isIndoor },
  { id: 'parking', label: 'Free parking', test: hasFreeParking },
  { id: 'pets', label: 'Dogs welcome', test: m => !!m.petFriendly },
];

export function directionsUrl(market: Pick<Market, 'venue' | 'address'>) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([market.venue, market.address].filter(Boolean).join(', '))}`;
}

/** Where each market sits, from its street address. Keyed by the feed's record id so it survives re-imports. */
const MARKET_COORDS: Record<string, [number, number]> = {
  'hillhurst-sunnyside-farmers-market': [51.0566, -114.0907],
  'bridgeland-riverside-farmers-market': [51.0537, -114.0452],
  'calgary-farmers-market-west': [51.0868, -114.2005],
  'calgary-farmers-market-south': [50.9847, -114.0452],
  'crossroads-market': [51.0302, -114.0282],
  'farmers-makers-market-marda-loop': [51.0286, -114.0987],
  'calgary-winter-market': [51.0537, -114.0705],
  'holiday-market-collective': [51.0376, -114.0531],
  'dalhousie-harvest-farmers-market': [51.1062, -114.1601],
  'fresh-and-local-market': [50.944, -114.07],
};

/**
 * Markets the feed lists by street address only, keyed by the address up to its first comma.
 * Close enough for the hand-drawn quadrant map; markets outside city limits are left off it.
 */
const ADDRESS_COORDS: Record<string, [number, number]> = {
  '101 barclay parade sw': [51.0537, -114.0705],
  '3625 shaganappi trail nw': [51.0853, -114.1556],
  '324 8 avenue sw': [51.0461, -114.0679],
  '100 anderson road se': [50.9585, -114.0662],
  '1833 crowchild trail nw': [51.0712, -114.121],
  '224 shawmeadows road sw': [50.912, -114.086],
  '1235 26 avenue se': [51.0302, -114.0282],
  '400-333 shawville boulevard se': [50.9035, -114.064],
  '4995 market street se': [50.884, -113.955],
  '108 quarry park road se': [50.9686, -114.0005],
  '11300 rocky ridge road nw': [51.1442, -114.238],
  '7904 43 avenue nw': [51.088, -114.219],
  '240 90 avenue se': [50.97, -114.059],
  '5720 silver ridge drive nw': [51.104, -114.189],
};

export function marketCoords(market: Market): [number, number] | null {
  if (market.coordinates) return [market.coordinates.lat, market.coordinates.lng];
  const known = market.sourceRecordId ? MARKET_COORDS[market.sourceRecordId] : undefined;
  if (known) return known;
  const street = ADDRESS_COORDS[market.address.split(',')[0].trim().toLowerCase()];
  if (street) return street;
  const hood = market.neighbourhood?.toLowerCase();
  return hood && NEIGHBOURHOOD_COORDS[hood] ? NEIGHBOURHOOD_COORDS[hood] : null;
}

/** True when the pin is only the neighbourhood's centre, not the market's own address. */
export function coordsApprox(market: Market): boolean {
  return !market.coordinates && !(market.sourceRecordId && MARKET_COORDS[market.sourceRecordId]);
}

/** NW / NE / SW / SE from Centre Street and the Bow, the way Calgarians split the city. */
export function quadrantOf(market: Market): string | null {
  const m = market.address.match(/\b(NW|NE|SW|SE)\b/);
  if (m) return m[1];
  const c = marketCoords(market);
  if (!c) return null;
  return `${c[0] >= 51.045 ? 'N' : 'S'}${c[1] <= -114.0625 ? 'W' : 'E'}`;
}

/** Communities CalgaryWatch has a neighbourhood page for, and their nearest neighbour where the market sits just outside one. */
const HOOD_ALIASES: Record<string, string> = { hillhurst: 'kensington', sunnyside: 'kensington', 'victoria park': 'beltline', 'south calgary': 'marda loop' };

export function neighbourhoodFor(market: Pick<Market, 'title' | 'venue' | 'neighbourhood' | 'address'>, all: readonly DiscoveryEntity[]): { hood: Neighbourhood; nearby: boolean } | null {
  const hoods = all.filter((e): e is Neighbourhood => e.kind === 'neighbourhood');
  const own = (market.neighbourhood ?? '').toLowerCase();
  const haystack = [market.title, market.venue, market.neighbourhood, market.address].filter(Boolean).join(' ').toLowerCase();
  const direct = hoods.find(h => own === h.title.toLowerCase()) ?? hoods.find(h => haystack.includes(h.title.toLowerCase()));
  if (direct) return { hood: direct, nearby: false };
  const alias = HOOD_ALIASES[own];
  const near = alias ? hoods.find(h => h.title.toLowerCase() === alias) : undefined;
  return near ? { hood: near, nearby: true } : null;
}

/** The community name the City's 311 data uses, as /check-your-community?c= expects it. */
const COMMUNITY_ALIASES: Record<string, string> = { bridgeland: 'bridgeland/riverside', 'bridgeland-riverside': 'bridgeland/riverside' };

export function communityFor(market: Pick<Market, 'neighbourhood'>): { name: string; slug: string } | null {
  if (!market.neighbourhood) return null;
  const name = market.neighbourhood;
  const key = COMMUNITY_ALIASES[name.toLowerCase()] ?? name;
  return { name, slug: toSlug(key) };
}

/** A guide stop that points at this market: our own short take on it. */
export function guideTake(market: Market, all: readonly DiscoveryEntity[]): { guide: Guide; stop: GuideStop } | null {
  for (const e of all) {
    if (e.kind !== 'guide') continue;
    const stop = e.stops?.find(s => s.entityId === market.id);
    if (stop) return { guide: e, stop };
  }
  return null;
}

/** Events on the same Calgary day as a market date, best first: same neighbourhood, then free and daytime. */
export function eventsSameDay(iso: string, all: readonly DiscoveryEntity[], near?: string, limit = 3) {
  const key = dayKey.format(new Date(iso));
  return all
    .filter((e): e is Event => e.kind === 'event' && !e.cancelled && dayKey.format(new Date(e.start)) === key)
    .map(e => ({ e, score: (near && e.neighbourhood === near ? 3 : 0) + (e.pricing === 'free' ? 1 : 0) + (Number(hm.format(new Date(e.start)).slice(0, 2)) < 17 ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || Date.parse(a.e.start) - Date.parse(b.e.start))
    .slice(0, limit)
    .map(x => x.e);
}

/** The next seven Calgary days, each with the markets open that day. */
export function marketWeek(markets: readonly Market[], occurrences: readonly MarketOccurrence[], now: Date) {
  const ids = new Set(markets.map(m => m.id));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() + i * DAY_MS);
    const key = dayKey.format(date);
    const on = occurrences
      .filter(o => ids.has(o.marketId) && !o.cancelled && dayKey.format(new Date(o.start)) === key && Date.parse(o.end) > now.getTime() - DAY_MS)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .map(o => ({ o, market: markets.find(m => m.id === o.marketId)! }));
    return { key, date, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekdayShort.format(date), on };
  });
}

/** A short name for tight spaces: "CFM South", "Hillhurst Sunnyside". */
export function shortName(market: Market) {
  return market.title
    .replace(/^Calgary Farmers[’'] Market/, 'CFM')
    .replace(/ Farmers[’'] Market$/, '')
    .replace(/^Farmers & Makers Market at /, '')
    .replace(/ Market$/, '');
}
