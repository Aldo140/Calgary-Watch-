/**
 * "Popular right now": the places on the site Calgary has been searching for,
 * built from anonymous search demand at deploy (scripts/discovery/search-trends.ts,
 * rules in searchTrendsBuild.ts). Labels are the site's own names for things,
 * never what someone typed. An empty file just means the boxes show nothing extra.
 */
import trends from '../generated/search-trends.json';

/** In order, most searched first. Counts stay out: the order is the signal. */
export interface SearchTrend { label: string; note: string; to: string }
export interface SearchTrendsFile { updatedAt: string | null; windowDays: number; items: SearchTrend[] }

/** Marks a search opened from a popular pick, so it isn't counted as demand again. */
export const POPULAR_VIA = 'popular';

/** A popular link's target; /search ones carry ?via=popular so they don't feed themselves. */
export function popularHref(to: string): string {
  if (!to.startsWith('/search?')) return to;
  return `${to}&via=${POPULAR_VIA}`;
}

export function readTrends(file: unknown): SearchTrend[] {
  const items = (file as Partial<SearchTrendsFile> | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.filter((t): t is SearchTrend => !!t && typeof t.label === 'string' && typeof t.to === 'string' && t.to.startsWith('/')
    && typeof t.note === 'string').map(({ label, note, to }) => ({ label, note, to }));
}

export const TRENDING: readonly SearchTrend[] = readTrends(trends);
const RANK = new Map(TRENDING.map((t, i) => [t.to, i]));

/** Where a destination sits in Popular right now (0 = most searched), or -1. */
export function trendRank(to: string): number {
  return RANK.get(to) ?? -1;
}

/**
 * Typeahead order with search demand: what Calgary searches for most moves
 * up, everything else keeps its place. Stable, so equal ranks don't shuffle.
 */
export function primeByDemand<T extends { to: string }>(options: readonly T[], rank: (to: string) => number = trendRank): T[] {
  return options.map((o, i) => ({ o, i, r: rank(o.to) }))
    .sort((a, b) => (a.r < 0 ? Infinity : a.r) - (b.r < 0 ? Infinity : b.r) || a.i - b.i)
    .map(x => x.o);
}

/** The /search hero's example chips: popular searches first, the fixed examples after, six in all. */
export function tryChips(popular: ReadonlyArray<{ label: string; to: string; note?: string }>, examples: readonly string[]): Array<{ label: string; to: string }> {
  const out = popular.slice(0, 4).map(p => ({ label: p.label, to: p.to }));
  const labels = new Set(out.map(o => o.label.toLowerCase()));
  for (const t of examples) {
    if (out.length >= 6) break;
    if (!labels.has(t.toLowerCase())) out.push({ label: t, to: `/search?q=${encodeURIComponent(t)}` });
  }
  return out;
}
