import { formatDistance as formatDistanceBetween } from 'date-fns';

/**
 * A timestamp as a resident would read it, relative to now.
 *
 * Keeps the direction date-fns knows but the old call sites threw away: they
 * wrote `formatDistanceToNow(t) + ' ago'`, which is fine for the past but reads
 * a *future* time ("1 day") as "1 day ago". Planned power outages are
 * timestamped at their future start, so that pattern showed work scheduled for
 * tomorrow as if it had already happened. With the suffix, past reads
 * "5 minutes ago" and future reads "in 1 day".
 *
 * `now` is injectable so the phrasing is testable without mocking the clock.
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  return formatDistanceBetween(timestamp, now, { addSuffix: true });
}

/**
 * Distance as a resident would say it.
 *
 * Metres are rounded to the nearest ten: a report's pin carries GPS jitter of
 * several metres, so "437 m" claims precision the coordinate does not have.
 * Above a kilometre the unit changes rather than the digit count growing.
 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  const metres = Math.round((km * 1000) / 10) * 10;
  if (metres <= 0) return 'here';
  if (metres < 1000) return `${metres} m`;
  if (km < 10) {
    const rounded = Math.round(km * 10) / 10;
    return `${rounded.toFixed(1)} km`;
  }
  return `${Math.round(km)} km`;
}
