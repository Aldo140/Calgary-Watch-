import { interestsFor, type EventInterestId } from './eventPicks';
import { homeAreaLabel, readHomeArea } from './homeArea';
import type { DiscoveryEntity } from '../types/discovery';

/**
 * Admin > Members > Audience insights, as plain data in and plain data out so
 * the tallies can be tested without Firestore.
 */

export type Planned = { id: string; count: number; start: string };

/** Window for "what's listed" against what readers asked for: the Thursday email's reach and then some. */
export const SUPPLY_DAYS = 14;

/**
 * Tally "I'm going" from the RSVPs themselves (admins can read them), so every
 * plan carries its date and splits cleanly into coming up and already happened.
 * The public count docs carry no date, which left past listings unnamed and
 * mixed in with live ones.
 */
export function tallyPlans(rows: ReadonlyArray<{ eventId?: unknown; start?: unknown }>, now = Date.now()): { upcoming: Planned[]; past: Planned[] } {
  const byId = new Map<string, Planned>();
  for (const r of rows) {
    if (typeof r.eventId !== 'string' || !r.eventId) continue;
    const start = typeof r.start === 'string' ? r.start : '';
    const p = byId.get(r.eventId) ?? { id: r.eventId, count: 0, start };
    p.count += 1;
    if (!p.start && start) p.start = start;
    byId.set(r.eventId, p);
  }
  const all = [...byId.values()];
  // An event without a usable date counts as coming up rather than vanishing.
  const isPast = (p: Planned) => { const t = Date.parse(p.start); return Number.isFinite(t) && t < now - 6 * 3600000; };
  const order = (a: Planned, b: Planned) => b.count - a.count || Date.parse(a.start) - Date.parse(b.start);
  return { upcoming: all.filter((p) => !isPast(p)).sort(order), past: all.filter(isPast).sort((a, b) => b.count - a.count || Date.parse(b.start) - Date.parse(a.start)) };
}

/** For each interest: readers who chose it, and dated listings in the next SUPPLY_DAYS that match it. */
export function interestSupply(entities: readonly DiscoveryEntity[], occurrences: ReadonlyArray<{ marketId: string; start: string; end: string; cancelled?: boolean }>, now = Date.now()) {
  const to = now + SUPPLY_DAYS * 86400000;
  const listed = new Map<EventInterestId, number>();
  for (const e of entities) {
    const live = e.kind === 'event' ? !e.cancelled && Date.parse(e.end) > now && Date.parse(e.start) < to
      : e.kind === 'market' ? occurrences.some((o) => o.marketId === e.id && !o.cancelled && Date.parse(o.end) > now && Date.parse(o.start) < to)
      : false;
    if (live) for (const i of interestsFor(e)) listed.set(i, (listed.get(i) ?? 0) + 1);
  }
  return listed;
}

/** Home areas as one tally: communities by their proper names, addresses counted but never shown. */
export function tallyAreas(users: ReadonlyArray<{ neighborhood?: string; inferredNeighborhood?: string }>) {
  const tally = new Map<string, number>();
  const quadrants = new Map<string, number>();
  let addresses = 0;
  let unmatched = 0;
  for (const u of users) {
    const area = readHomeArea(u.neighborhood || u.inferredNeighborhood);
    if (!area) continue;
    if (area.kind === 'address') addresses += 1;
    if (area.kind === 'other') unmatched += 1;
    const label = homeAreaLabel(area);
    tally.set(label, (tally.get(label) ?? 0) + 1);
    const q = area.kind === 'community' ? area.quadrant : area.kind === 'nearby' ? 'Outside Calgary' : 'Unplaced';
    quadrants.set(q, (quadrants.get(q) ?? 0) + 1);
  }
  return {
    areas: [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    quadrants: [...quadrants.entries()].sort((a, b) => b[1] - a[1]),
    addresses, unmatched,
  };
}

