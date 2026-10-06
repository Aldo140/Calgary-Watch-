/**
 * "Add to calendar" for a listing: an .ics file (Apple, Outlook, most phones)
 * and a Google Calendar link. Pure, so the escaping is tested.
 */

const ics = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export interface CalendarEvent { id: string; title: string; start: string; end: string; location?: string; description?: string; url: string }

export function icsFile(e: CalendarEvent, now = new Date()): string {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CalgaryWatch//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@calgarywatch.ca`,
    `DTSTAMP:${ics(now.toISOString())}`,
    `DTSTART:${ics(e.start)}`,
    `DTEND:${ics(e.end)}`,
    `SUMMARY:${escape(e.title)}`,
    ...(e.location ? [`LOCATION:${escape(e.location)}`] : []),
    `DESCRIPTION:${escape([e.description, `Details: ${e.url}`].filter(Boolean).join('\n\n'))}`,
    `URL:${e.url}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${ics(e.start)}/${ics(e.end)}`, details: `${e.description ? `${e.description}\n\n` : ''}${e.url}`, ...(e.location ? { location: e.location } : {}) });
  return `https://calendar.google.com/calendar/render?${p}`;
}
