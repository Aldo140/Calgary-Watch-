import type { Event as EventEntity } from '../types/discovery';
import { calgaryDate } from './discovery';
import { interestScore } from './eventRank';

/**
 * Shapes the /events listing. Two kinds of listing live in one feed: dated events
 * (a show at 7 p.m. on Friday) and runs that are already under way (an exhibition
 * that opened in June, a play in its third week). Grouping a run under its opening
 * day put June exhibitions at the top of every page, so runs get their own shelf
 * and the day list starts today.
 */

/** One row on a day: an event, or several showings of the same thing that day. */
export interface DayEntry { key: string; event: EventEntity; starts: string[]; score: number }
export interface EventDay { date: string; entries: DayEntry[]; count: number; lead?: DayEntry }
export interface EventsBoardModel { running: EventEntity[]; days: EventDay[] }

/** "Calgary Hitmen v Red Deer Rebels - Sunday Funday" and "…vs. Red Deer Rebels presented by …" are one outing. */
export const titleKey = (t: string) => t.toLowerCase().replace(/\s+(presented by|-|–|—|\|)\s.*$/, '').replace(/\bv\b\.?/g, 'vs').replace(/[^a-z0-9]+/g, ' ').trim();

const DAY = 86400000;

export function buildEventsBoard(events: readonly EventEntity[], now = new Date()): EventsBoardModel {
  const today = calgaryDate(now);
  const sorted = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  // Under way before today and still on: an exhibition, a theatre run, a multi-day fair.
  const runningAll = sorted.filter(e => calgaryDate(new Date(e.start)) < today && Date.parse(e.end) > now.getTime());
  const seenRun = new Set<string>();
  const running = runningAll
    .filter(e => { const k = titleKey(e.title); if (seenRun.has(k)) return false; seenRun.add(k); return true; })
    .sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
  // A feed that also lists a run day by day ("Churn, Earn, Burn…" every afternoon)
  // shouldn't repeat it on each day while it is already on the shelf.
  const runEnds = new Map(running.map(e => [titleKey(e.title), Date.parse(e.end)]));
  const dated = sorted.filter(e => !runningAll.includes(e) && !((runEnds.get(titleKey(e.title)) ?? 0) >= Date.parse(e.start)));

  const days = new Map<string, EventDay>();
  for (const e of dated) {
    const date = calgaryDate(new Date(e.start));
    const day = days.get(date) ?? days.set(date, { date, entries: [], count: 0 }).get(date)!;
    day.count++;
    const k = titleKey(e.title);
    const same = day.entries.find(x => x.key === k && (x.event.venue ?? '') === (e.venue ?? ''));
    if (same) { same.starts.push(e.start); continue; }
    day.entries.push({ key: k, event: e, starts: [e.start], score: interestScore(e, e.start) });
  }
  for (const day of days.values()) {
    // Lead each busy day with the thing most people would go to, if anything stands out.
    if (day.entries.length >= 3) {
      const best = [...day.entries].sort((a, b) => b.score - a.score || Date.parse(a.event.start) - Date.parse(b.event.start))[0];
      if (best.score >= 3) day.lead = best;
    }
  }
  return { running, days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

/** How many days to show before "Show more": at least a week's worth, about forty rows. */
export function initialDayCount(days: readonly EventDay[], rows = 40, minDays = 7): number {
  let total = 0;
  for (let i = 0; i < days.length; i++) {
    total += days[i].entries.length;
    if (i + 1 >= minDays && total >= rows) return i + 1;
  }
  return days.length;
}

/** Whole days a run has left, counting today: 0 means it closes today. */
export function daysLeft(end: string, now = new Date()): number {
  return Math.round((Date.parse(`${calgaryDate(new Date(end))}T12:00:00Z`) - Date.parse(`${calgaryDate(now)}T12:00:00Z`)) / DAY);
}

/** What the page will show for these events: each run once, plus each dated listing. */
export function boardCount(events: readonly EventEntity[], now = new Date()): number {
  const { running, days } = buildEventsBoard(events, now);
  return running.length + days.reduce((n, d) => n + d.count, 0);
}
