/**
 * Build side of "Popular right now": turns the anonymous search_demand rows
 * into a short list of places on the site that Calgary keeps asking for.
 *
 * Privacy rule: nothing a person typed is published as typed. A term only
 * makes the list when it lands on something the site already names (a Best
 * of Calgary list, a safety topic, a listing, a community, a landmark, a
 * starter search) and the label shown is that thing's own name. Terms that
 * found nothing never ship: they stay in the job log for docs/search-gap-profiles.md.
 */
import type { DiscoveryEntity, MarketOccurrence } from '../types/discovery';
import { CALGARY_COMMUNITIES } from '../data/calgaryCommunities';
import { BEST_CATEGORIES, type BestCategory } from '../content/bestOf';
import { bestForQuery, bestPath } from './bestOf';
import { safetyForQuery, safetyPath } from './safety';
import { entityPath } from './discovery';
import { searchListings } from './listingSearch';
import { LANDMARKS, normalizeWords } from './searchIntent';
import { demandQuery, type SearchDemandRecord } from './searchDemand';
import type { SearchTrend, SearchTrendsFile } from './searchTrends';

/** Days of searches that count, and how fast an old search fades (half-life). */
export const TREND_WINDOW_DAYS = 30;
const HALF_LIFE_DAYS = 7;
/** A destination needs this many searches in the window before it's shown. */
export const MIN_SEARCHES = 2;
export const MAX_TRENDS = 12;

const KIND_NOTE: Record<string, string> = { event: 'Event', market: 'Market', business: 'Local', guide: 'Guide', neighbourhood: 'Neighbourhood' };
const key = (s: string) => normalizeWords(s).join(' ');
const FILLER = new Set(['the', 'in', 'calgary', 'yyc', 'near', 'me', 'a', 'at']);
/** The words that say what someone wants, without "the" or "calgary". */
const core = (s: string) => normalizeWords(s).filter(w => !FILLER.has(w)).join(' ');

/** Fixed searches the site already offers as one-tap starters, by their own words. */
export const STARTER_SEARCHES: Array<{ q: string; label: string; note: string }> = [
  { q: 'police tonight', label: 'Police and safety tonight', note: 'Live reports' },
  { q: 'yesterday', label: 'What happened yesterday', note: 'Live reports' },
  { q: 'crime this week', label: 'Crime reports this week', note: 'Live reports' },
  { q: 'traffic today', label: 'Traffic and road closures', note: 'Live reports' },
  { q: 'power outage', label: 'Power outages', note: 'Live reports' },
  { q: 'free this weekend', label: 'Free this weekend', note: 'Events' },
  { q: 'this weekend', label: 'Things to do this weekend', note: 'Events' },
];
const STARTER_TO: Record<string, string> = { 'this weekend': '/events/this-weekend' };

const COMMUNITY_INDEX = new Map<string, { name: string; quadrant: string }>();
for (const c of CALGARY_COMMUNITIES) for (const raw of [c.name, ...(c.aliases ?? [])]) {
  const k = core(raw);
  if (k && !COMMUNITY_INDEX.has(k)) COMMUNITY_INDEX.set(k, { name: c.name, quadrant: c.quadrant });
}

const bestLabel = (c: BestCategory) => c.kind === 'food' ? `Best ${c.noun} in Calgary` : `${c.label} in Calgary`;

export interface Destination { label: string; note: string; to: string }

/**
 * Where a search term lands, named by the site, or null when it doesn't land
 * on one thing we can name. Order matches what /search leads with.
 */
export function resolveDemandTerm(q: string, entities: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], now = new Date()): Destination | null {
  const term = demandQuery(q);
  if (!term) return null;
  const want = core(term);
  if (want.length < 2) return null;

  const starter = STARTER_SEARCHES.find(s => key(s.q) === key(term));
  if (starter) return { label: starter.label, note: starter.note, to: STARTER_TO[starter.q] ?? `/search?q=${encodeURIComponent(starter.q)}` };

  // "best pho", "pho", "pizza": a cited list, only when the whole term is that list's words.
  const best = bestForQuery(term);
  if (best.length === 1 && best[0].keywords.some(k => core(k) === want || core(`best ${k}`) === want)) return { label: bestLabel(best[0]), note: 'Best of Calgary', to: bestPath(best[0]) };
  if (best.length > 1 && BEST_CATEGORIES.length === best.length) return { label: 'Best of Calgary', note: 'Section', to: '/best' };

  const safety = safetyForQuery(term);
  if (safety.length === 1 && [safety[0].label, ...safety[0].keywords].some(k => core(k) === want)) return { label: `${safety[0].label} in Calgary`, note: 'Safety news', to: safetyPath(safety[0]) };

  const landmark = LANDMARKS.find(l => l.keys.some(k => core(k) === want));
  if (landmark) return { label: landmark.name, note: 'Landmark', to: `/search?q=${encodeURIComponent(landmark.name)}` };

  // A listing someone looked up by name: "hex", "the plaza theatre".
  const found = searchListings(entities, occurrences, term, now);
  if (!found.partial) {
    const named = Object.values(found.groups).flat().find(e => {
      const title = core(e!.title);
      return title === want || (want.length >= 3 && (title.startsWith(`${want} `) || title.endsWith(` ${want}`)));
    });
    if (named) return { label: named.title, note: KIND_NOTE[named.kind] ?? 'Listing', to: entityPath(named) };
  }

  const community = COMMUNITY_INDEX.get(want);
  if (community) return { label: community.name, note: community.quadrant === 'Centre' ? 'Community' : `Community · ${community.quadrant}`, to: `/search?q=${encodeURIComponent(community.name)}` };

  return null;
}

/** Weight of one search made `ageMs` ago: 1 today, ½ a week ago. */
const weight = (ageMs: number) => Math.pow(0.5, Math.max(0, ageMs) / (HALF_LIFE_DAYS * 86_400_000));

export interface TrendBuild { file: SearchTrendsFile; searches: Map<string, number>; unresolved: Array<{ q: string; searches: number; lastResults: number }> }

/**
 * Group searches by where they land and rank by recent searches. Several
 * spellings of one place ("beltline", "the beltline") count together.
 */
export function buildSearchTrends(rows: readonly SearchDemandRecord[], entities: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], now = new Date()): TrendBuild {
  const since = now.getTime() - TREND_WINDOW_DAYS * 86_400_000;
  const terms = new Map<string, { searches: number; score: number; lastResults: number; lastAt: number }>();
  for (const r of rows) {
    if (r.ts < since || r.ts > now.getTime() + 60_000) continue;
    const q = demandQuery(r.q);
    if (!q) continue;
    const t = terms.get(q) ?? { searches: 0, score: 0, lastResults: r.results, lastAt: 0 };
    t.searches += 1; t.score += weight(now.getTime() - r.ts);
    if (r.ts >= t.lastAt) { t.lastAt = r.ts; t.lastResults = r.results; }
    terms.set(q, t);
  }
  const by = new Map<string, Destination & { searches: number; score: number }>();
  const unresolved: TrendBuild['unresolved'] = [];
  for (const [q, t] of terms) {
    const d = resolveDemandTerm(q, entities, occurrences, now);
    if (!d) { unresolved.push({ q, searches: t.searches, lastResults: t.lastResults }); continue; }
    const row = by.get(d.to) ?? { ...d, searches: 0, score: 0 };
    row.searches += t.searches; row.score += t.score;
    by.set(d.to, row);
  }
  const items: SearchTrend[] = [...by.values()]
    .filter(r => r.searches >= MIN_SEARCHES)
    .sort((a, b) => b.score - a.score || b.searches - a.searches || a.label.localeCompare(b.label))
    .slice(0, MAX_TRENDS)
    .map(({ label, note, to }) => ({ label, note, to }));
  unresolved.sort((a, b) => b.searches - a.searches || a.q.localeCompare(b.q));
  return { file: { updatedAt: now.toISOString(), windowDays: TREND_WINDOW_DAYS, items }, searches: new Map([...by.values()].map(r => [r.to, r.searches])), unresolved };
}
