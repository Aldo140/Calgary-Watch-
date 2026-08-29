import type { Incident } from '@/src/types';
import { getDistance } from '@/src/lib/geo';

/**
 * How the feed is ordered.
 *
 * All ordering policy lives here rather than inside the sheet, so the mobile
 * sheet and its tests read the same rules and a mode cannot mean two things.
 */
export type SortBy = 'newest' | 'oldest' | 'verified' | 'nearest';

const SORT_VALUES: readonly string[] = ['newest', 'oldest', 'verified', 'nearest'];

/** Type guard for values coming back out of localStorage. */
export function isSortBy(value: unknown): value is SortBy {
  return typeof value === 'string' && SORT_VALUES.includes(value);
}

/** The "Recent" feed filter's window: incidents from the last two hours. */
export const RECENT_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Whether an incident falls inside the "Recent 2h" window.
 *
 * The window is the *past* two hours, so the age must be non-negative. That
 * lower bound is the whole point of this helper: planned power outages carry a
 * future start time as their `timestamp` (up to 48h out), and a bare
 * `age <= 2h` check is also satisfied by a *negative* age, so scheduled work
 * would flood the recent view reading "1 day ago". Requiring `age >= 0` keeps
 * the filter to things that have actually happened.
 */
export function isRecentIncident(incident: Incident, now: number = Date.now()): boolean {
  const age = now - incident.timestamp;
  return age >= 0 && age <= RECENT_WINDOW_MS;
}

/** Verification strength, strongest first. */
const VERIFIED_SCORE: Record<string, number> = {
  community_confirmed: 3,
  multiple_reports: 2,
  pending_review: 1,
  unverified: 0,
};

/**
 * The mode the control should open in.
 *
 * A stored preference wins, with one exception: 'nearest' cannot be honoured
 * without a location. Permission can be granted on one visit and denied on the
 * next, and a stored 'nearest' must not leave the feed in a mode it is unable
 * to compute. The caller leaves the *stored* value alone in that case, so the
 * preference returns intact once location is available again.
 */
export function resolveDefaultSort(persisted: unknown, hasLocation: boolean): SortBy {
  if (isSortBy(persisted) && !(persisted === 'nearest' && !hasLocation)) return persisted;
  return hasLocation ? 'nearest' : 'newest';
}

/**
 * Whether the sheet's one-time "location just arrived" re-resolution should
 * actually resolve again. Two conditions, both required:
 *
 *  - the persisted value is either absent/invalid or exactly 'nearest' — an
 *    explicit stored choice of anything else (e.g. 'oldest') must survive
 *    untouched, so only an unset preference or one that could only have
 *    fallen back for lack of location is eligible;
 *  - the sheet is at rest on the rail — raised means the reader is already
 *    mid-read, and resolving again would resort the list under their thumb.
 *    They are left alone entirely rather than deferred, since a resort that
 *    pounces once they lower the sheet is the same surprise, just delayed.
 *
 * Pure and separate from the effect that calls it so the gate is testable
 * without a DOM, the same way resolveDefaultSort itself is.
 */
export function shouldAutoResolveNearest(persisted: unknown, sheetIsRail: boolean): boolean {
  return (!isSortBy(persisted) || persisted === 'nearest') && sheetIsRail;
}

/**
 * Order the feed. Never mutates the input — `incidents` upstream is memoized
 * and sorting it in place would corrupt every other consumer.
 *
 * Emergencies pin to the top in every mode: someone is in danger, and that
 * outranks whatever the reader asked to sort by.
 */
export function sortIncidents(
  list: Incident[],
  sortBy: SortBy,
  userLocation: { lat: number; lng: number } | null,
): Incident[] {
  const effective: SortBy = sortBy === 'nearest' && !userLocation ? 'newest' : sortBy;

  // Measured once per incident rather than inside the comparator, which would
  // recompute haversine O(n log n) times.
  const distance = new Map<string, number>();
  if (effective === 'nearest' && userLocation) {
    for (const i of list) {
      distance.set(i.id, getDistance(userLocation.lat, userLocation.lng, i.lat, i.lng));
    }
  }

  return [...list].sort((a, b) => {
    const aEmergency = a.category === 'emergency';
    const bEmergency = b.category === 'emergency';
    if (aEmergency !== bEmergency) return aEmergency ? -1 : 1;

    if (effective === 'nearest') {
      const byDistance =
        (distance.get(a.id) ?? Number.POSITIVE_INFINITY) -
        (distance.get(b.id) ?? Number.POSITIVE_INFINITY);
      return byDistance || b.timestamp - a.timestamp;
    }
    if (effective === 'oldest') return a.timestamp - b.timestamp;
    if (effective === 'verified') {
      const byStrength =
        (VERIFIED_SCORE[b.verified_status] ?? 0) - (VERIFIED_SCORE[a.verified_status] ?? 0);
      return byStrength || b.timestamp - a.timestamp;
    }
    return b.timestamp - a.timestamp;
  });
}
