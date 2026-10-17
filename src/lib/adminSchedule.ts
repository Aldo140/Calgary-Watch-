import { calgaryDateTimeFormat } from "./calgaryTz";
import { calgaryInstant } from "./discoveryCalendar";
/** The field is labelled Calgary time, even when the admin's browser is elsewhere. */
export function formatAdminSchedule(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  const parts = calgaryDateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ms);
  const p = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
}
export function parseAdminSchedule(value: string): number {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m || +m[2] > 23 || +m[3] > 59) return NaN;
  try {
    const ms = calgaryInstant(m[1], +m[2] + +m[3] / 60);
    return Number.isFinite(ms) && formatAdminSchedule(ms) === value ? ms : NaN;
  } catch { return NaN; }
}
