/**
 * The /map time switch: Tonight, Last 24h, Yesterday, 7 days, All.
 *
 * Search data shows people arrive asking about "police tonight" and "police
 * yesterday", so the windows follow the Calgary clock (via searchIntent's
 * `timeWindow`) rather than rolling hour counts wherever the words name a
 * night or a day. One definition feeds the feed, the map and `?when=`.
 */
import { timeWindow } from '@/src/lib/searchIntent';

export type MapTimeWindow = 'tonight' | '24h' | 'yesterday' | '7d' | 'all';

export const MAP_TIME_WINDOWS: { id: MapTimeWindow; label: string; short: string; hint: string }[] = [
  { id: 'tonight', label: 'Tonight', short: 'Tonight', hint: 'Since 5 pm (or the last 6 hours during the day)' },
  { id: '24h', label: 'Last 24 hours', short: '24h', hint: 'Reports from the last 24 hours' },
  { id: 'yesterday', label: 'Yesterday', short: 'Yesterday', hint: 'Midnight to midnight yesterday, Calgary time' },
  { id: '7d', label: 'Last 7 days', short: '7 days', hint: 'Reports from the last 7 days' },
  { id: 'all', label: 'Everything loaded', short: 'All', hint: 'Everything currently on the map' },
];

const HOUR = 3_600_000;

/** The [from, to) range for a window, or null for "all". */
export function mapTimeRange(w: MapTimeWindow, now: number): { from: number; to: number } | null {
  switch (w) {
    case 'tonight': { const t = timeWindow('tonight', now); return { from: t.from, to: now + HOUR }; }
    case 'yesterday': { const t = timeWindow('yesterday', now); return { from: t.from, to: t.to }; }
    case '24h': return { from: now - 24 * HOUR, to: now + HOUR };
    case '7d': return { from: now - 168 * HOUR, to: now + HOUR };
    case 'all': return null;
  }
}

export function inMapTimeWindow(timestamp: number, w: MapTimeWindow, now: number): boolean {
  const r = mapTimeRange(w, now);
  return !r || (timestamp >= r.from && timestamp < r.to);
}

/** Reads `?when=`; accepts the words people search with. */
export function parseWhenParam(raw: string | null | undefined): MapTimeWindow | null {
  const v = (raw ?? '').toLowerCase().trim().replace(/[\s_]+/g, '-');
  if (!v) return null;
  if (v === 'tonight' || v === 'now' || v === 'last-night') return 'tonight';
  if (v === 'today' || v === '24h' || v === '24-hours') return '24h';
  if (v === 'yesterday') return 'yesterday';
  if (v === 'week' || v === '7d' || v === '7-days' || v === 'this-week') return '7d';
  if (v === 'all') return 'all';
  return null;
}
