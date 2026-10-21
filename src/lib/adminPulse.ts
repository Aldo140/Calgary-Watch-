/**
 * The numbers on the admin overview that come from the published catalogue
 * and from day-by-day counts. Pure, so they are tested without Firestore.
 */

import type { DiscoveryEntity, MarketOccurrence } from '../types/discovery';

const DAY = 86_400_000;

export interface CatalogueStats {
  eventsAhead: number;
  eventsThisWeek: number;
  freeAhead: number;
  markets: number;
  marketDatesAhead: number;
  places: number;
  verified: number;
  neighbourhoods: number;
  guides: number;
}

const ms = (iso: unknown) => {
  const t = Date.parse(String(iso ?? ''));
  return Number.isFinite(t) ? t : NaN;
};

export function catalogueStats(entities: readonly DiscoveryEntity[], occurrences: readonly MarketOccurrence[], now = Date.now()): CatalogueStats {
  const live = entities.filter((e) => e.status === 'published' && !e.developmentOnly);
  const events = live.filter((e): e is Extract<DiscoveryEntity, { kind: 'event' }> => e.kind === 'event');
  const ahead = events.filter((e) => {
    const end = ms(e.end);
    return (Number.isFinite(end) ? end : ms(e.start)) >= now;
  });
  const weekEnd = now + 7 * DAY;
  const marketIds = new Set(live.filter((e) => e.kind === 'market').map((e) => e.id));
  return {
    eventsAhead: ahead.length,
    eventsThisWeek: ahead.filter((e) => ms(e.start) < weekEnd).length,
    freeAhead: ahead.filter((e) => e.pricing === 'free').length,
    markets: marketIds.size,
    marketDatesAhead: occurrences.filter((o) => marketIds.has(o.marketId) && !o.cancelled && ms(o.start) >= now).length,
    places: live.filter((e) => e.kind === 'business').length,
    verified: live.filter((e) => Boolean((e as { ownerVerifiedAt?: unknown }).ownerVerifiedAt)).length,
    neighbourhoods: live.filter((e) => e.kind === 'neighbourhood').length,
    guides: live.filter((e) => e.kind === 'guide').length,
  };
}

/** Local midnights for the last `days` days, oldest first, ending today. */
export function dayStarts(days: number, now = Date.now()): number[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    return d.getTime();
  });
}

/** How many timestamps fall on each of the given days. */
export function bucketByDay(timestamps: readonly number[], starts: readonly number[]): number[] {
  const out = starts.map(() => 0);
  for (const t of timestamps) {
    for (let i = starts.length - 1; i >= 0; i--) {
      if (t >= starts[i]) {
        const next = starts[i + 1] ?? starts[i] + DAY;
        if (t < next) out[i]++;
        break;
      }
    }
  }
  return out;
}

/** Change of the last 7 days against the 7 before, or null without a base. */
export function weekOverWeek(series: readonly number[]): number | null {
  if (series.length < 14) return null;
  const last = series.slice(-7).reduce((a, b) => a + b, 0);
  const prior = series.slice(-14, -7).reduce((a, b) => a + b, 0);
  if (!prior) return null;
  return Math.round(((last - prior) / prior) * 100);
}
