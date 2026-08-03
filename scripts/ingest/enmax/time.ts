/**
 * Calgary-local time helpers.
 *
 * ENMAX timestamps arrive without a timezone designator
 * (e.g. "2026-08-02T17:00:00"). They are Calgary wall-clock times. Parsing them
 * with `new Date(...)` in a UTC container would shift them by 6-7 hours, so we
 * resolve the America/Edmonton offset that applies at that moment and emit a
 * fully-qualified ISO string instead.
 */

export const CALGARY_TIME_ZONE = 'America/Edmonton';

const OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: CALGARY_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Naive `YYYY-MM-DDTHH:mm:ss(.sss)` with no trailing Z or ±HH:mm. */
const NAIVE_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/;

/** Milliseconds Calgary is behind UTC at `instant` (MST = -420, MDT = -360). */
function calgaryOffsetMs(instant: number): number {
  const parts = OFFSET_FORMATTER.formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // `hour: '2-digit'` with hour12:false renders midnight as 24 in some ICU builds.
  const hour = get('hour') % 24;
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asIfUtc - instant;
}

/**
 * Convert a Calgary wall-clock timestamp into a real instant.
 *
 * Two passes: the first guesses the offset by pretending the wall clock was
 * UTC, the second re-resolves it at the corrected instant so timestamps within
 * a couple of hours of a DST transition land on the right side of the change.
 */
function calgaryWallClockToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
): number {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  let instant = asIfUtc - calgaryOffsetMs(asIfUtc);
  instant = asIfUtc - calgaryOffsetMs(instant);
  return instant;
}

/** Render `+HH:mm` / `-HH:mm` for an offset expressed in milliseconds. */
function formatOffset(offsetMs: number): string {
  const sign = offsetMs < 0 ? '-' : '+';
  const totalMinutes = Math.abs(Math.round(offsetMs / 60_000));
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

/**
 * Normalize an ENMAX timestamp to ISO-8601 with an explicit offset.
 *
 * - Naive strings are interpreted as Calgary local time.
 * - Strings that already carry `Z` or an offset are respected as-is.
 * - Anything unparseable returns null so the UI can say "Not provided" rather
 *   than rendering "Invalid Date".
 */
export function toCalgaryIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const naive = NAIVE_TIMESTAMP.exec(trimmed);
  if (naive) {
    const [, y, mo, d, h, mi, s, frac] = naive;
    const ms = frac ? Number(frac.padEnd(3, '0')) : 0;
    const instant = calgaryWallClockToInstant(
      Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s ?? '0'), ms,
    );
    if (!Number.isFinite(instant)) return null;
    const offsetMs = calgaryOffsetMs(instant);
    // Re-render the wall clock we were given, tagged with the resolved offset.
    const local = new Date(instant + offsetMs);
    return `${local.toISOString().slice(0, 23)}${formatOffset(offsetMs)}`;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
