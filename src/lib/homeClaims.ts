import type { AgendaDay } from './discoveryCalendar';
import { isDemoIncident, isPubliclyVisible, type Incident, type IncidentCategory } from '../types';

/**
 * Every sentence and number the homepage states about Calgary is produced here,
 * from published listings or public reports only — kept pure so the "never
 * fabricate an activity signal" rule is enforced by tests, not by review.
 */

export const isWeekend = (date: string) => [0, 5, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());

/** The first Fri–Sun run in the window: "this weekend", even when today is part of it. */
export function weekendDays(days: AgendaDay[]) {
  const start = days.findIndex(d => isWeekend(d.date));
  if (start < 0) return [];
  const run: AgendaDay[] = [];
  for (let i = start; i < days.length && isWeekend(days[i].date); i++) run.push(days[i]);
  return run;
}

export function summarize(days: AgendaDay[]) {
  const today = days[0]?.items ?? [];
  const unique = new Set(weekendDays(days).flatMap(d => d.items.map(i => i.to)));
  const todayLine = !today.length
    ? 'Nothing is on our calendar today'
    : today.length === 1 ? `${today[0].title} is on today` : `${today[0].title} and ${today.length - 1} more are on today`;
  const weekendLine = unique.size ? `${unique.size} ${unique.size === 1 ? 'plan' : 'plans'} for the weekend` : 'the weekend is still open';
  return `${todayLine}; ${weekendLine}.`;
}

export const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function summarizeReports(incidents: Incident[], now: number, sampleSize: number) {
  const recent = incidents.filter(i =>
    isPubliclyVisible(i) && !isDemoIncident(i) && i.timestamp > now - REPORT_WINDOW_MS && !(i.expires_at && i.expires_at < now));
  const byCategory: Partial<Record<IncidentCategory, number>> = {};
  for (const i of recent) byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;
  // A full sample that is entirely inside the window means there may be more
  // than we fetched, so the UI says "60+" rather than a number we know is low.
  const capped = incidents.length >= sampleSize && incidents.every(i => i.timestamp > now - REPORT_WINDOW_MS);
  return { total: recent.length, capped, byCategory };
}
