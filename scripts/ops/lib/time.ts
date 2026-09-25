// Calgary wall-clock helpers. GitHub runners are UTC; every date a person reads
// or a schedule is set against is America/Edmonton.

export const TZ = 'America/Edmonton';

function parts(epoch: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(epoch))) out[p.type] = p.value;
  return out;
}

/** YYYY-MM-DD in Calgary. */
export function calgaryDate(epoch: number): string {
  const p = parts(epoch);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 0 = Sunday … 6 = Saturday, in Calgary. */
export function calgaryWeekday(epoch: number): number {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts(epoch).weekday);
}

export function calgaryMinutes(epoch: number): number {
  const p = parts(epoch);
  return Number(p.hour) * 60 + Number(p.minute);
}

/** Epoch ms for a Calgary wall-clock date and HH:mm, correct across DST. */
export function calgaryToEpoch(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Offset at the guess, then correct once more in case the guess crossed a DST edge.
  let epoch = guess;
  for (let i = 0; i < 2; i++) {
    const p = parts(epoch);
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    epoch += guess - asUtc;
  }
  return epoch;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** The next posting slot strictly after `now`, from HH:mm slots in Calgary time. */
export function nextSlot(now: number, slots: string[], skip = 0): number {
  const sorted = [...slots].sort();
  const found: number[] = [];
  let date = calgaryDate(now);
  for (let day = 0; day < 8 && found.length <= skip; day++) {
    for (const s of sorted) {
      const at = calgaryToEpoch(date, s);
      if (at > now + 15 * 60_000) found.push(at);
      if (found.length > skip) break;
    }
    date = addDays(date, 1);
  }
  return found[skip] ?? now + 60 * 60_000;
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
const longDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });

/** "Sat, Sep 27" */
export function shortDay(epoch: number): string {
  return dayFmt.format(new Date(epoch)).replace(/\./g, '');
}

/** "Saturday, September 27" */
export function longDay(epoch: number): string {
  return longDayFmt.format(new Date(epoch));
}

/** "7 pm", "7:30 pm" */
export function clock(epoch: number): string {
  return timeFmt.format(new Date(epoch)).replace(':00', '').replace(/\s?a\.?m\.?/i, ' am').replace(/\s?p\.?m\.?/i, ' pm');
}

export function timeRange(start: number, end: number | null): string {
  if (!end || calgaryDate(end) !== calgaryDate(start)) return clock(start);
  const a = clock(start), b = clock(end);
  // "3 pm to 7 pm" reads fine as "3 to 7 pm" when both share the meridiem.
  if (a.slice(-2) === b.slice(-2)) return `${a.slice(0, -3)} to ${b}`;
  return `${a} to ${b}`;
}
