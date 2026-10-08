/**
 * Event interests and the "picks" a reader gets for them.
 *
 * One pure module feeds three surfaces, so they can never disagree:
 *   - the /plans page preview ("your picks this week"),
 *   - the Thursday events email (scripts/digest/events.ts),
 *   - the badge that counts how many kinds of plans somebody has made.
 *
 * Inventory categories are sparse and inconsistent across sources (one feed
 * says "arts", another only puts "Symphony" in the title), so an interest
 * matches on the listing's categories and tags first and its words second.
 * Nothing here invents a listing, a rank or a count: picks are real published
 * events and market dates, ordered by how well they fit what the reader asked
 * for and how close they are to home.
 */

import type { DiscoveryEntity, Event, Market, MarketOccurrence } from '../types/discovery';
import { NEIGHBOURHOOD_COORDS } from '../data/neighbourhoodCoords';
import { entityPath } from './discovery';
import { calgaryDateTimeFormat } from './calgaryTz';

export type EventInterestId =
  | 'music' | 'arts' | 'family' | 'food' | 'sports'
  | 'outdoors' | 'markets' | 'free' | 'learning' | 'community';

export interface EventInterest {
  id: EventInterestId;
  label: string;
  /** One line under the chip, in the reader's words, not ours. */
  note: string;
}

export const EVENT_INTERESTS: readonly EventInterest[] = [
  { id: 'music', label: 'Live music', note: 'Concerts, the symphony, a band on a Tuesday' },
  { id: 'arts', label: 'Arts & theatre', note: 'Stages, galleries, film and comedy' },
  { id: 'family', label: 'Family & kids', note: 'Things you can bring everyone to' },
  { id: 'food', label: 'Food & drink', note: 'Tastings, food halls, festivals' },
  { id: 'markets', label: 'Markets', note: 'Farmers’ and makers’ markets' },
  { id: 'sports', label: 'Sports', note: 'Flames, Stamps, Wranglers and the rest' },
  { id: 'outdoors', label: 'Outdoors', note: 'Walks, parks and the river' },
  { id: 'learning', label: 'Talks & workshops', note: 'Lectures, classes, authors' },
  { id: 'community', label: 'Community', note: 'Fundraisers, clean-ups, local causes' },
  { id: 'free', label: 'Free', note: 'No ticket needed' },
];

export const EVENT_INTEREST_IDS = EVENT_INTERESTS.map((i) => i.id);
const INTEREST_SET = new Set<string>(EVENT_INTEREST_IDS);

/** Keep only known ids, once each, in canonical order. Profiles are loose bags. */
export function normalizeInterests(value: unknown): EventInterestId[] {
  if (!Array.isArray(value)) return [];
  const picked = new Set(value.filter((v): v is string => typeof v === 'string' && INTEREST_SET.has(v)));
  return EVENT_INTEREST_IDS.filter((id) => picked.has(id));
}

export function interestLabel(id: EventInterestId): string {
  return EVENT_INTERESTS.find((i) => i.id === id)?.label ?? id;
}

const TAGS: Record<Exclude<EventInterestId, 'free' | 'markets'>, RegExp> = {
  music: /^(music|concerts?|nightlife|live music)$/,
  arts: /^(arts?|theatre|theater|film|culture|comedy|dance|museums?)$/,
  family: /^(family|kids|children|all ages)$/,
  food: /^(food|drinks?|food & drink|dining)$/,
  sports: /^(sports?|athletics)$/,
  outdoors: /^(outdoors?|parks?|nature)$/,
  learning: /^(learning|talks?|workshops?|education|lectures?)$/,
  community: /^(community|charity|volunteering|fundraisers?)$/,
};

const WORDS: Record<Exclude<EventInterestId, 'free' | 'markets'>, RegExp> = {
  music: /\b(concerts?|live music|symphon(y|ic)|orchestra|philharmonic|calgary phil|opera|jazz|blues|choir|band|dj set|recital|quartet|songwriters?|in concert)\b/,
  arts: /\b(theatre|theater|gallery|exhibit(ion)?|film|cinema|ballet|dance|comedy|improv|museum|art show|art walk|play)\b/,
  family: /\b(family|kids?|children|all[- ]ages|storytime|toddlers?)\b/,
  food: /\b(food|beer|wine|brew(ery|ing)?|tasting|dinner|brunch|culinary|cocktails?|chili|bbq|feast)\b/,
  sports: /\b(flames|stampeders|stamps|hitmen|wranglers|roughnecks|cavalry|surge|hockey|soccer|football|basketball|lacrosse|marathon|tournament|vs\.?)\b/,
  // Not "park" or "river": Heritage Park and Riverside are venues, not outdoor plans.
  outdoors: /\b(hikes?|hiking|trails?|outdoors?|open[- ]air|nature walk|skating|skiing|snowshoe\w*|paddl\w+|canoe\w*|bike ride|cycling)\b/,
  // Not bare "class": "world class band" is not a workshop.
  learning: /\b(talks?|lectures?|workshops?|masterclass|classes|seminars?|panel discussion|authors?|book launch|science|webinar)\b/,
  // Not bare "community": it names associations and halls, which host everything.
  community: /\b(volunteer\w*|fundraiser|charity|clean[- ]?up|town hall|food drive|block party|potluck|community (festival|celebration|day|cleanup))\b/,
};

/** Every interest a listing satisfies. Businesses, guides and neighbourhoods have none. */
export function interestsFor(entity: DiscoveryEntity): EventInterestId[] {
  if (entity.kind !== 'event' && entity.kind !== 'market') return [];
  const tags = [...entity.categories, ...entity.tags].map((t) => t.toLowerCase().trim());
  const text = `${entity.title} ${entity.summary}`.toLowerCase();
  const out = new Set<EventInterestId>();
  if (entity.kind === 'market' || tags.some((t) => /^markets?$/.test(t))) out.add('markets');
  if (entity.kind === 'event' && entity.pricing === 'free') out.add('free');
  for (const id of Object.keys(TAGS) as Array<keyof typeof TAGS>) {
    if (tags.some((t) => TAGS[id].test(t)) || WORDS[id].test(text)) out.add(id);
  }
  return EVENT_INTEREST_IDS.filter((id) => out.has(id));
}

// ── Place ───────────────────────────────────────────────────────────────────

export interface Point { lat: number; lng: number }

/** A neighbourhood name to its centre, tolerant of case and "Calgary" suffixes. */
export function neighbourhoodPoint(name: string | undefined | null): Point | null {
  if (!name) return null;
  const key = name.toLowerCase().replace(/,?\s*calgary.*$/, '').replace(/\s+/g, ' ').trim();
  const hit = NEIGHBOURHOOD_COORDS[key] ?? NEIGHBOURHOOD_COORDS[key.split('/')[0].trim()];
  return hit ? { lat: hit[0], lng: hit[1] } : null;
}

function metresBetween(a: Point, b: Point): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── Picks ───────────────────────────────────────────────────────────────────

export interface PickItem {
  /** Unique per dated item: the event id, or the market occurrence id. */
  key: string;
  /** The listing id an "I'm going" is recorded against. */
  entityId: string;
  kind: 'event' | 'market';
  title: string;
  summary: string;
  path: string;
  start: string;
  end: string;
  venue?: string;
  neighbourhood?: string;
  free: boolean;
  interests: EventInterestId[];
  /** Interests this item shares with the reader. */
  matched: EventInterestId[];
  /** Straight-line metres from the reader's home area, when both ends are known. */
  distanceM: number | null;
  /** Markets only: the organizer's published lineup for this date (Market HQ). */
  lineup?: { summary: string; note: string };
}

export interface EventPicks {
  /** Things the reader said they're going to inside the window, soonest first. */
  going: PickItem[];
  /** Best-fitting other items inside the window. */
  picks: PickItem[];
  /** Upcoming dated items considered, before ranking. Honest denominator. */
  considered: number;
}

export interface PickOptions {
  entities: readonly DiscoveryEntity[];
  occurrences: readonly MarketOccurrence[];
  interests: readonly EventInterestId[];
  home?: Point | null;
  /** The reader's home neighbourhood name, for a same-area bonus without coordinates. */
  homeArea?: string;
  goingIds?: ReadonlySet<string>;
  now?: Date;
  /** Window length. The Thursday email looks 10 days ahead to cover next weekend. */
  days?: number;
  limit?: number;
}

function sameArea(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const n = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  return n(a) === n(b);
}

/** Dated items (events, and each market's next date) that are live inside the window. */
function datedItems(entities: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], from: number, to: number) {
  const out: Array<{ entity: Event | Market; key: string; start: string; end: string }> = [];
  for (const e of entities) {
    if (e.kind === 'event') {
      const s = Date.parse(e.start); const en = Date.parse(e.end);
      if (!e.cancelled && en > from && s < to) out.push({ entity: e, key: e.id, start: e.start, end: e.end });
    } else if (e.kind === 'market') {
      const next = occurrences
        .filter((o) => o.marketId === e.id && !o.cancelled && Date.parse(o.end) > from && Date.parse(o.start) < to)
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
      if (next) out.push({ entity: e, key: next.id, start: next.start, end: next.end });
    }
  }
  return out;
}

export function buildEventPicks(options: PickOptions): EventPicks {
  const now = options.now ?? new Date();
  const from = now.getTime();
  const to = from + (options.days ?? 7) * 86_400_000;
  const limit = options.limit ?? 8;
  const wanted = new Set(options.interests);
  const goingIds = options.goingIds ?? new Set<string>();
  const home = options.home ?? neighbourhoodPoint(options.homeArea);

  const items = datedItems(options.entities, options.occurrences, from, to).map(({ entity, key, start, end }) => {
    const interests = interestsFor(entity);
    const where = neighbourhoodPoint(entity.neighbourhood);
    const item: PickItem = {
      key,
      entityId: entity.id,
      kind: entity.kind,
      title: entity.title,
      summary: entity.summary,
      path: entityPath(entity),
      start,
      end,
      venue: entity.venue,
      neighbourhood: entity.neighbourhood,
      free: entity.kind === 'event' && entity.pricing === 'free',
      interests,
      matched: interests.filter((i) => wanted.has(i)),
      distanceM: home && where ? Math.round(metresBetween(home, where)) : null,
    };
    return item;
  });

  const bySoonest = (a: PickItem, b: PickItem) => Date.parse(a.start) - Date.parse(b.start);
  const going = items.filter((i) => goingIds.has(i.entityId)).sort(bySoonest);

  const score = (i: PickItem) => {
    let s = i.matched.length * 3;
    if (sameArea(i.neighbourhood, options.homeArea)) s += 3;
    else if (i.distanceM !== null) s += i.distanceM <= 3000 ? 2 : i.distanceM <= 8000 ? 1 : 0;
    // A little preference for sooner, never enough to beat a real match.
    s += Math.max(0, 1 - (Date.parse(i.start) - from) / (to - from));
    return s;
  };

  // A run of dated listings with one title (a ghost tour every night) is one
  // pick, at its soonest date — eight picks should be eight different plans.
  const titleKey = (i: PickItem) => i.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const firstOfTitle = new Map<string, PickItem>();
  for (const i of [...items].sort(bySoonest)) if (!firstOfTitle.has(titleKey(i))) firstOfTitle.set(titleKey(i), i);

  const candidates = items
    .filter((i) => firstOfTitle.get(titleKey(i)) === i)
    .filter((i) => !goingIds.has(i.entityId))
    // With interests chosen, only items that match at least one. With none, everything.
    .filter((i) => wanted.size === 0 || i.matched.length > 0);

  const picks = candidates
    .map((i) => ({ i, s: score(i) }))
    .sort((a, b) => b.s - a.s || bySoonest(a.i, b.i))
    .slice(0, limit)
    .map(({ i }) => i)
    .sort(bySoonest);

  return { going, picks, considered: items.length };
}

/** "Thu Oct 9 · 7:30 p.m." in Calgary time; "All day" for a date-only listing. */
export function pickWhen(iso: string): string {
  const d = new Date(iso);
  const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' }).format(d);
  const hm = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  if (hm === '00:00') return `${day} · All day`;
  const time = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' }).format(d);
  return `${day} · ${time}`;
}

export function pickDistance(metres: number | null): string | null {
  if (metres === null) return null;
  if (metres < 1000) return 'In your area';
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km from home`;
}
