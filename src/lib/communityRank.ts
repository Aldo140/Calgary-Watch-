import type { CrimeStatEntry, CrimeYearEntry } from '../hooks/useCrimeStats';

/**
 * Rankings behind /check-your-community.
 *
 * Same distribution the map's choropleth and community panel use (311 totals
 * for the latest year, Calgary only), so a rank quoted here matches the rank
 * the map shows for the same community.
 */

export interface CommunityRank {
  key: string;
  slug: string;
  name: string;
  /** All 311 requests in the latest (usually partial) year. */
  total: number;
  /** Public-safety-shaped requests. */
  safety: number;
  /** Property-damage-shaped requests. */
  property: number;
  /** Everything else people called 311 about. */
  other: number;
  /** 1 = most reports. */
  rank: number;
  count: number;
  band: RankBand;
  year: number;
  /** Last full year vs the one before it, or null when there's too little to compare. */
  change: { pct: number; from: number; to: number; fromYear: number; toYear: number } | null;
}

export type RankBand = 'Hot' | 'High' | 'Elevated' | 'Calm';

/** Below this, a year-over-year percentage is mostly noise. */
export const MIN_CHANGE_BASE = 100;

export function bandFor(rank: number, count: number): RankBand {
  const pct = rank / Math.max(count, 1);
  return pct <= 0.1 ? 'Hot' : pct <= 0.25 ? 'High' : pct <= 0.5 ? 'Elevated' : 'Calm';
}

export function toSlug(key: string): string {
  return key.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function displayName(key: string): string {
  return key
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMc(\w)/g, (_, c: string) => `Mc${c.toUpperCase()}`);
}

function yearChange(years: CrimeYearEntry[] | undefined, latestYear: number): CommunityRank['change'] {
  // The latest year is still in progress, so compare the two most recent full years.
  const full = (years ?? []).filter((y) => y.year < latestYear).sort((a, b) => a.year - b.year);
  if (full.length < 2) return null;
  const prev = full[full.length - 2];
  const last = full[full.length - 1];
  const from = prev.crime + prev.disorder;
  const to = last.crime + last.disorder;
  if (from < MIN_CHANGE_BASE) return null;
  return { pct: Math.round(((to - from) / from) * 100), from, to, fromYear: prev.year, toYear: last.year };
}

export function buildRankings(
  stats: Map<string, CrimeStatEntry>,
  yearly: Map<string, CrimeYearEntry[]>,
): CommunityRank[] {
  // Namespaced keys (edmonton:…) belong to other cities.
  const rows = [...stats.entries()]
    .filter(([key, e]) => !key.includes(':') && e.crime + e.disorder > 0)
    .map(([key, e]) => ({ key, e, total: e.crime + e.disorder }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));

  const count = rows.length;
  let rank = 0;
  return rows.map((row, i) => {
    // Ties share the better rank, as on the map.
    if (i === 0 || row.total !== rows[i - 1].total) rank = i + 1;
    return {
      key: row.key,
      slug: toSlug(row.key),
      name: displayName(row.key),
      total: row.total,
      safety: row.e.violent,
      property: row.e.property,
      other: row.e.disorder,
      rank,
      count,
      band: bandFor(rank, count),
      year: row.e.year,
      change: yearChange(yearly.get(row.key), row.e.year),
    };
  });
}

export function findBySlug(rankings: CommunityRank[], slug: string | null | undefined): CommunityRank | undefined {
  if (!slug) return undefined;
  const s = toSlug(slug);
  return rankings.find((r) => r.slug === s);
}

/** Prefix matches first, then anywhere in the name. */
export function searchCommunities(rankings: CommunityRank[], query: string, limit = 6): CommunityRank[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const starts = rankings.filter((r) => r.key.startsWith(q) || r.key.split(' ').some((w) => w.startsWith(q)));
  const rest = rankings.filter((r) => !starts.includes(r) && r.key.includes(q));
  return [...starts, ...rest].slice(0, limit);
}

/** The communities directly above and below, for the "just ahead of / just behind" line. */
export function neighbours(rankings: CommunityRank[], key: string): { above?: CommunityRank; below?: CommunityRank } {
  const i = rankings.findIndex((r) => r.key === key);
  if (i === -1) return {};
  return { above: rankings[i - 1], below: rankings[i + 1] };
}

export interface Teasers {
  top?: CommunityRank;
  biggestDrop?: CommunityRank;
  biggestJump?: CommunityRank;
}

export function teasers(rankings: CommunityRank[]): Teasers {
  const changed = rankings.filter((r) => r.change);
  const byChange = [...changed].sort((a, b) => a.change!.pct - b.change!.pct);
  const drop = byChange[0];
  const jump = byChange[byChange.length - 1];
  return {
    top: rankings[0],
    biggestDrop: drop && drop.change!.pct < 0 ? drop : undefined,
    biggestJump: jump && jump.change!.pct > 0 ? jump : undefined,
  };
}

export function movers(rankings: CommunityRank[], direction: 'down' | 'up', limit = 5): CommunityRank[] {
  return rankings
    .filter((r) => r.change && (direction === 'down' ? r.change.pct < 0 : r.change.pct > 0))
    .sort((a, b) => (direction === 'down' ? a.change!.pct - b.change!.pct : b.change!.pct - a.change!.pct))
    .slice(0, limit);
}

/** How far off a guess was, in words. A lower rank number means more reports. */
export function guessVerdict(guess: number, actual: number): string {
  const off = Math.abs(guess - actual);
  if (off === 0) return 'Exactly right.';
  const spots = `${off} spot${off === 1 ? '' : 's'}`;
  if (off <= 5) return `So close: ${spots} off.`;
  return guess > actual
    ? `${spots} off. It's busier than you thought.`
    : `${spots} off. It's quieter than you thought.`;
}

export function shareText(r: CommunityRank): string {
  return `${r.name} is #${r.rank} of ${r.count} Calgary communities for 311 reports this year. Where does yours land?`;
}

/** Up to `span` communities either side, for the rank ladder. */
export function ladder(rankings: CommunityRank[], key: string, span = 2): CommunityRank[] {
  const i = rankings.findIndex((r) => r.key === key);
  if (i === -1) return [];
  const start = Math.max(0, Math.min(i - span, rankings.length - (span * 2 + 1)));
  return rankings.slice(start, start + span * 2 + 1);
}

/** Bar height from 0 to 1. Square root so quiet communities still show up next to downtown. */
export function barHeight(total: number, max: number): number {
  return max > 0 ? Math.sqrt(total / max) : 0;
}

/** The rank a community would have with `total` reports, against everyone else. */
export function rankForTotal(rankings: CommunityRank[], total: number, excludeKey?: string): number {
  return rankings.filter((r) => r.key !== excludeKey && r.total > total).length + 1;
}

/**
 * Average minutes between 311 requests so far this year, for "one every
 * 1h 44m" lines. `now` is passed in so the result is testable.
 */
export function minutesBetweenReports(total: number, year: number, now: Date): number | null {
  if (total <= 0) return null;
  const start = new Date(year, 0, 1).getTime();
  const end = Math.min(now.getTime(), new Date(year + 1, 0, 1).getTime());
  const minutes = (end - start) / 60000;
  return minutes > 0 ? minutes / total : null;
}

export function formatInterval(minutes: number): string {
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} seconds`;
  if (minutes < 60) return `${Math.round(minutes)} minute${Math.round(minutes) === 1 ? '' : 's'}`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (h >= 24) {
    const d = Math.round(h / 24);
    return `${d} day${d === 1 ? '' : 's'}`;
  }
  return m ? `${h}h ${m}m` : `${h} hour${h === 1 ? '' : 's'}`;
}

/**
 * Next community for Higher or Lower: never the current one, never a tie
 * (a tie has no right answer), and not one seen recently.
 */
export function pickChallenger(rankings: CommunityRank[], current: CommunityRank, seen: Set<string>, rand: () => number = Math.random): CommunityRank | undefined {
  const pool = rankings.filter((r) => r.key !== current.key && r.total !== current.total && !seen.has(r.key));
  const from = pool.length ? pool : rankings.filter((r) => r.key !== current.key && r.total !== current.total);
  return from[Math.floor(rand() * from.length)];
}
