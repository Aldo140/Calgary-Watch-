/**
 * Calgary wall-clock formatting that is right on every runtime.
 *
 * Alberta moved to UTC-6 all year from 8 March 2026 (tzdata 2026c). A runtime
 * whose time-zone data predates that — the Node on CI runners and Cloud
 * Functions, older phones — still falls back to UTC-7 every November, which
 * put winter event times, email times and ops slots an hour out, and failed
 * the tests that pin the new rule.
 *
 * `calgaryDateTimeFormat` is a drop-in for `new Intl.DateTimeFormat` with
 * `timeZone: 'America/Edmonton'`. Instants before the change use the named
 * zone (every runtime agrees about those). Instants after it use the named
 * zone when the runtime already knows the rule, and the fixed `Etc/GMT+6`
 * (POSIX sign: UTC-6) when it doesn't.
 */

export const CALGARY_TZ = 'America/Edmonton';
/** 2026-03-08 02:00 MST: the last spring-forward, after which Calgary stays at UTC-6. */
export const YEAR_ROUND_UTC6_FROM = Date.UTC(2026, 2, 8, 9);

function runtimeIsStale(): boolean {
  try {
    const hour = new Intl.DateTimeFormat('en-CA', { timeZone: CALGARY_TZ, hour: '2-digit', hourCycle: 'h23' })
      .format(new Date(Date.UTC(2026, 11, 1, 18)));
    return hour !== '12';
  } catch {
    return false;
  }
}
const STALE = runtimeIsStale();

export type CalgaryFormat = Pick<Intl.DateTimeFormat, 'format' | 'formatToParts' | 'resolvedOptions'>;

/** Options may name a zone; anything but Calgary passes straight through to Intl. */
export function calgaryDateTimeFormat(locale?: string | string[], options: Intl.DateTimeFormatOptions = {}): CalgaryFormat {
  const zone = options.timeZone ?? CALGARY_TZ;
  const named = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone });
  if (!STALE || !/^America\/(Edmonton|Calgary)$/.test(zone)) return named;
  const fixed = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'Etc/GMT+6' });
  const pick = (d?: Date | number) => ((d === undefined ? Date.now() : +d) >= YEAR_ROUND_UTC6_FROM ? fixed : named);
  return {
    format: (d?: Date | number) => pick(d).format(d),
    formatToParts: (d?: Date | number) => pick(d).formatToParts(d),
    resolvedOptions: () => named.resolvedOptions(),
  };
}
