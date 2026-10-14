import type { DiscoveryEntity, EntityKind, MarketOccurrence } from '../types/discovery';
import { calgaryDate } from './discovery';
import { matchesTonight } from './discoveryCalendar';
import { communityByName, editDistance, normalizeWords } from './searchIntent';
import { CALGARY_COMMUNITIES } from '../data/calgaryCommunities';
import { verifiedBoost } from './verified';

/**
 * Listing search for /search: what people type, not what a database wants.
 *
 * "free this weekend", "markets saturday", "jazz tonight", "kensinton cafes":
 * time words and "free" become filters, "events" or "markets" say which kind to
 * lead with, plurals and one-letter typos still match, and results are ranked
 * (title over tags over summary) with the soonest event first on a tie.
 */

export type ListingWhen = 'today' | 'tonight' | 'tomorrow' | 'this-weekend' | 'this-week'
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface ListingQuery {
  /** Content words, stemmed: every one must match. */
  words: string[];
  /** Kinds the person named ("events", "markets"); led with, not filtered to. */
  kinds: EntityKind[];
  when?: ListingWhen;
  free: boolean;
}

export interface ListingResults {
  /** Ranked, grouped by kind, best group first. */
  groups: Partial<Record<EntityKind, DiscoveryEntity[]>>;
  total: number;
  /** Nothing matched every word, so these are the closest partial matches. */
  partial: boolean;
  /** A corrected query when a word looks misspelled and the fix finds more. */
  didYouMean?: string;
}

const STOP = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'near', 'by', 'of', 'for', 'to', 'and', 'or', 'with', 'from', 'around',
  'calgary', 'yyc', 'ab', 'alberta', 'what', 'whats', 'where', 'is', 'are', 'any', 'some', 'my', 'me', 'i', 'us', 'we',
  'thing', 'do', 'stuff', 'go', 'happening', 'on', 'good', 'best', 'fun', 'cool', 'there', 'open', 'now', 'this', 'next', 'neighbourhood', 'neighborhood', 'area']);

const KIND_WORDS: Record<string, EntityKind> = {
  event: 'event', concert: 'event', show: 'event', festival: 'event', festivals: 'event',
  market: 'market', farmer: 'market', farmers: 'market',
  place: 'business', shop: 'business', store: 'business', business: 'business', local: 'business',
  guide: 'guide', walk: 'guide', itinerary: 'guide',
  neighbourhood: 'neighbourhood', neighborhood: 'neighbourhood', community: 'neighbourhood',
};
/** Kind words that are only a hint: they still have to match as words too. */
const KIND_AND_WORD = new Set(['concert', 'show', 'festival', 'festivals', 'farmer', 'farmers', 'shop', 'store', 'walk']);

/** A word on the left also matches any word on the right. */
const SYNONYMS: Record<string, string[]> = {
  kid: ['family', 'children'], child: ['family', 'kid'], children: ['family', 'kid'], family: ['kid'],
  concert: ['music', 'live'], gig: ['music', 'live'], band: ['music'], music: ['concert', 'band', 'jazz', 'symphony'],
  eat: ['food', 'restaurant'], brunch: ['breakfast', 'cafe'], breakfast: ['brunch', 'cafe'], food: ['restaurant', 'eat', 'bakery', 'cafe'], restaurant: ['food'], coffee: ['cafe', 'coffee'], cafe: ['coffee'],
  beer: ['brewery', 'pub', 'craft'], brewery: ['beer'], drink: ['bar', 'pub', 'cocktail', 'brewery'],
  art: ['arts', 'gallery', 'museum'], theatre: ['theater', 'stage', 'play'], theater: ['theatre'], comedy: ['standup', 'improv'],
  outdoor: ['outdoors', 'park', 'trail', 'hike'], hike: ['trail', 'outdoors'], dog: ['pet', 'dogs'], pet: ['dog'],
  sport: ['sports', 'game', 'hockey', 'football', 'soccer'], hockey: ['flames', 'hitmen', 'wranglers'], football: ['stampeders'],
  talk: ['lecture', 'learning', 'workshop'], workshop: ['class', 'learning'], class: ['workshop'],
};

const TIME_PHRASES: Array<[ListingWhen, string[][]]> = [
  ['this-weekend', [['this', 'weekend'], ['weekend']]],
  ['this-week', [['this', 'week'], ['week']]],
  ['tonight', [['tonight'], ['this', 'evening'], ['tonite']]],
  ['tomorrow', [['tomorrow']]],
  ['today', [['today']]],
  ...(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map(d => [d, [[d], [d.slice(0, 3)]]] as [ListingWhen, string[][]]),
];
const WEEKDAYS: ListingWhen[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Plural and possessive forms down to one stem, so "markets" finds "Market". */
export function stem(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}

export function parseListingQuery(q: string): ListingQuery {
  const raw = normalizeWords(q);
  const used = raw.map(() => false);
  let when: ListingWhen | undefined;
  for (const [key, phrases] of TIME_PHRASES) {
    for (const p of phrases) {
      for (let i = 0; i + p.length <= raw.length && !when; i++) {
        if (p.every((w, j) => raw[i + j] === w && !used[i + j])) { when = key; p.forEach((_, j) => { used[i + j] = true; }); }
      }
    }
    if (when) break;
  }
  let free = false;
  const kinds: EntityKind[] = [];
  const words: string[] = [];
  raw.forEach((w, i) => {
    if (used[i]) return;
    if (w === 'free') { free = true; return; }
    const kind = KIND_WORDS[w] ?? KIND_WORDS[stem(w)];
    if (kind && !kinds.includes(kind)) kinds.push(kind);
    if (kind && !KIND_AND_WORD.has(w)) return;
    if (STOP.has(w) || STOP.has(stem(w))) return;
    words.push(stem(w));
  });
  return { words, kinds, when, free };
}

// ─── Matching ──────────────────────────────────────────────────────────────

interface Indexed { e: DiscoveryEntity; fields: Array<[number, string[], string]> }
const FIELD = { title: 10, place: 6, tag: 5, summary: 2, body: 1 };

function tokens(s: string | undefined): string[] {
  return s ? normalizeWords(s).map(stem) : [];
}

function index(e: DiscoveryEntity): Indexed {
  const place = [e.neighbourhood, 'venue' in e ? e.venue : '', 'quadrant' in e ? e.quadrant : ''].filter(Boolean).join(' ');
  const body = e.kind === 'guide' ? [e.description, e.introduction, ...(e.stops ?? []).map(s => `${s.name} ${s.area}`)].join(' ') : e.description;
  return {
    e,
    fields: [
      [FIELD.title, tokens(e.title), normalizeWords(e.title).join(' ')],
      [FIELD.place, tokens(place), ''],
      [FIELD.tag, tokens([...e.categories, ...e.tags, e.kind === 'business' ? e.services.join(' ') : ''].join(' ')), ''],
      [FIELD.summary, tokens(e.summary), ''],
      [FIELD.body, tokens(body), ''],
    ],
  };
}

const cache = new WeakMap<DiscoveryEntity, Indexed>();
const indexed = (e: DiscoveryEntity) => cache.get(e) ?? (cache.set(e, index(e)), cache.get(e)!);

/** How well one query word matches one indexed word: 1 exact, .8 prefix, .55 typo, 0 none. */
function wordMatch(q: string, t: string, loose: boolean): number {
  if (q === t) return 1;
  if (!loose) return 0;
  if (q.length >= 3 && t.startsWith(q)) return 0.8;
  if (q.length < 5 || q[0] !== t[0]) return 0;
  const max = q.length >= 8 ? 2 : 1;
  return editDistance(q, t, max) <= max ? 0.55 : 0;
}

/**
 * Best score of one query word against an entity. Prefixes and typos count in
 * the short fields only; the long description and synonyms need an exact word,
 * so "panorama" doesn't find a page that mentions a panoramic view.
 */
function scoreWord(x: Indexed, w: string): { score: number; strong: boolean } {
  const alts = [[w, 1] as const, ...(SYNONYMS[w] ?? []).map(s => [stem(s), 0.7] as const)];
  let score = 0; let strong = false;
  for (const [weight, toks] of x.fields) {
    for (const [alt, factor] of alts) {
      for (const t of toks) {
        const m = wordMatch(alt, t, factor === 1 && weight > FIELD.body) * weight * factor;
        if (m > score) score = m;
        if (m > 0 && weight > FIELD.body) strong = true;
      }
    }
  }
  return { score, strong };
}

// ─── Time ──────────────────────────────────────────────────────────────────

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/** The Calgary calendar days a time word covers, first to last. */
export function daysFor(when: ListingWhen, now: Date): [string, string] {
  const today = calgaryDate(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (when === 'today' || when === 'tonight') return [today, today];
  if (when === 'tomorrow') return [addDays(today, 1), addDays(today, 1)];
  if (when === 'this-week') return [today, addDays(today, 6)];
  if (when === 'this-weekend') {
    const fri = addDays(today, weekday === 0 ? -2 : weekday === 6 ? -1 : (5 - weekday + 7) % 7);
    return [fri < today ? today : fri, addDays(fri, 2)];
  }
  const target = addDays(today, (WEEKDAYS.indexOf(when) - weekday + 7) % 7);
  return [target, target];
}

function inWindow(start: string, end: string, when: ListingWhen, now: Date): boolean {
  if (Date.parse(end) <= now.getTime()) return false;
  if (when === 'tonight') return matchesTonight(start, end, now);
  const [from, to] = daysFor(when, now);
  return calgaryDate(new Date(start)) <= to && calgaryDate(new Date(end)) >= from;
}

/** When the listing next happens inside the window, or null if it doesn't. */
function nextTime(e: DiscoveryEntity, occurrences: readonly MarketOccurrence[], when: ListingWhen | undefined, now: Date): number | null {
  if (e.kind === 'event') {
    if (e.cancelled || Date.parse(e.end) <= now.getTime()) return null;
    return !when || inWindow(e.start, e.end, when, now) ? Date.parse(e.start) : null;
  }
  if (e.kind === 'market') {
    const next = occurrences
      .filter(o => o.marketId === e.id && !o.cancelled && (when ? inWindow(o.start, o.end, when, now) : Date.parse(o.end) > now.getTime()))
      .map(o => Date.parse(o.start)).sort((a, b) => a - b)[0];
    return next ?? null;
  }
  return when ? null : Infinity;
}

function isFree(e: DiscoveryEntity): boolean {
  if (e.kind === 'event') return e.pricing === 'free';
  return [...e.categories, ...e.tags].some(t => /\bfree\b/i.test(t));
}

// ─── Search ────────────────────────────────────────────────────────────────

/** Every community name and alias, as normalized phrases. */
const COMMUNITY_PHRASES = new Set(CALGARY_COMMUNITIES.flatMap(c => [c.name, ...(c.aliases ?? [])]).map(n => normalizeWords(n).join(' ')));

const KIND_ORDER: EntityKind[] = ['event', 'market', 'business', 'guide', 'neighbourhood'];

export function searchListings(entities: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], q: string, now = new Date()): ListingResults {
  const query = parseListingQuery(q);
  const empty: ListingResults = { groups: {}, total: 0, partial: false };
  if (!query.words.length && !query.kinds.length && !query.when && !query.free) return empty;

  type Hit = { e: DiscoveryEntity; score: number; matched: number; at: number };
  const hits: Hit[] = [];
  const phrase = normalizeWords(q).join(' ');
  // "Panorama Hills" is a place, not two keywords: listings have to name it.
  const placeName = query.words.length > 1 && COMMUNITY_PHRASES.has(phrase) ? phrase : null;
  for (const e of entities) {
    const at = nextTime(e, occurrences, query.when, now);
    if (at === null) continue;
    if (query.free && !isFree(e)) continue;
    // Only kind words ("markets", "events this weekend"): every listing of that kind.
    if (!query.words.length && query.kinds.length && !query.kinds.includes(e.kind)) continue;
    const x = indexed(e);
    let score = 0; let matched = 0; let strong = false;
    for (const w of query.words) { const s = scoreWord(x, w); if (s.score > 0) { matched++; score += s.score; strong ||= s.strong; } }
    // At least one word has to land in the title, place, tags or summary.
    if (query.words.length && (!matched || !strong)) continue;
    if (placeName && !normalizeWords([e.title, e.neighbourhood, 'venue' in e ? e.venue : '', e.summary, ...e.tags].join(' ')).join(' ').includes(placeName)) continue;
    if (query.kinds.includes(e.kind)) score += 6;
    const title = x.fields[0][2];
    if (phrase.length > 2 && title.includes(phrase)) score += title.startsWith(phrase) ? 12 : 8;
    score += Math.min(3, (e.scores?.featured ?? 0) + (e.scores?.editorial ?? 0));
    // Verified by the organization: a notch up, never past a better match (verified.ts).
    score += verifiedBoost(e, 'search', now.getTime());
    hits.push({ e, score, matched, at });
  }
  const need = query.words.length;
  let chosen = hits.filter(h => h.matched === need);
  let partial = false;
  // Nothing matched every word: show listings that match most of them, strongest first.
  if (!chosen.length && need >= 2) {
    const most = Math.max(0, ...hits.map(h => h.matched));
    chosen = most >= Math.ceil(need / 2) ? hits.filter(h => h.matched === most && h.score >= FIELD.tag).slice(0, 12) : [];
    partial = chosen.length > 0;
  }
  // Ties (same score band) go to whatever happens soonest.
  chosen.sort((a, b) => Math.round(b.score) - Math.round(a.score) || a.at - b.at || a.e.title.localeCompare(b.e.title));
  const best = new Map<EntityKind, number>();
  for (const h of chosen) if (!best.has(h.e.kind)) best.set(h.e.kind, h.score + (query.kinds.includes(h.e.kind) ? 100 : 0));
  const order = [...best.keys()].sort((a, b) => best.get(b)! - best.get(a)! || KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));
  const groups: ListingResults['groups'] = {};
  for (const kind of order) groups[kind] = chosen.filter(h => h.e.kind === kind).map(h => h.e);
  const result: ListingResults = { groups, total: chosen.length, partial };
  if (!result.total || partial) {
    const fixed = correctQuery(q, entities);
    if (fixed && fixed !== normalizeWords(q).join(' ')) {
      const retry = searchListings(entities, occurrences, fixed, now);
      if (retry.total && !retry.partial) result.didYouMean = fixed;
    }
  }
  return result;
}

// ─── Did you mean ──────────────────────────────────────────────────────────

let vocabFor: readonly DiscoveryEntity[] | null = null;
let vocab = new Set<string>();
function vocabulary(entities: readonly DiscoveryEntity[]): Set<string> {
  if (vocabFor === entities) return vocab;
  vocab = new Set<string>();
  for (const e of entities) for (const t of normalizeWords([e.title, e.neighbourhood, ...e.tags, ...e.categories].join(' '))) if (t.length >= 4) vocab.add(t);
  for (const c of CALGARY_COMMUNITIES) for (const t of normalizeWords(c.name)) if (t.length >= 4) vocab.add(t);
  vocabFor = entities;
  return vocab;
}

/** Each unknown word swapped for the nearest known one, or null when nothing changes. */
export function correctQuery(q: string, entities: readonly DiscoveryEntity[]): string | null {
  const words = vocabulary(entities);
  let changed = false;
  const out = normalizeWords(q).map(w => {
    if (w.length < 4 || words.has(w) || STOP.has(w) || KIND_WORDS[w] || /\d/.test(w)) return w;
    let best: [string, number] | null = null;
    const max = w.length >= 8 ? 2 : 1;
    for (const t of words) {
      if (t[0] !== w[0] && t[1] !== w[1]) continue;
      const d = editDistance(w, t, max);
      if (d <= max && (!best || d < best[1])) best = [t, d];
    }
    if (best) { changed = true; return best[0]; }
    return w;
  });
  return changed ? out.join(' ') : null;
}

// ─── Nearby ────────────────────────────────────────────────────────────────

/**
 * Listings in the same quadrant, soonest first, for a community search that
 * found no listing of its own ("Seton" → what's on in the SE).
 */
export function nearbyListings(entities: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], quadrant: string, now = new Date(), max = 6): DiscoveryEntity[] {
  const quadrantOf = (e: DiscoveryEntity) => e.kind === 'neighbourhood' ? e.quadrant : e.neighbourhood ? communityByName(e.neighbourhood)?.community.quadrant : undefined;
  return entities
    .filter(e => !e.developmentOnly && e.kind !== 'guide' && quadrantOf(e) === quadrant)
    .map(e => ({ e, at: nextTime(e, occurrences, undefined, now) }))
    .filter((h): h is { e: DiscoveryEntity; at: number } => h.at !== null)
    .sort((a, b) => (a.e.kind === 'neighbourhood' ? 1 : 0) - (b.e.kind === 'neighbourhood' ? 1 : 0) || a.at - b.at)
    .filter((h, i, all) => all.findIndex(o => o.e.title === h.e.title) === i)
    .slice(0, max).map(h => h.e);
}
