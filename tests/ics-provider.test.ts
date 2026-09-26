import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { icsDate, mapIcsEvents, parseIcs } from '../scripts/discovery/providers';
import domain from '../functions/discovery-domain.cjs';

const source = {
  id: 'library', name: 'Calgary Public Library events', approved: true, kind: 'official' as const,
  hosts: ['calgarylibrary.ca', 'events.calgarylibrary.ca'], provider: 'ics' as const, feedUrl: 'https://calgarylibrary.ca/events.ics',
  ics: { organizer: 'Calgary Public Library', fallbackUrl: 'https://calgarylibrary.ca/events/', categories: ['family'], pricing: 'free' as const },
};
const now = Date.parse('2026-09-24T12:00:00-06:00');

const feed = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'UID:a1', 'SUMMARY:Family storytime', 'DTSTART;TZID=America/Edmonton:20261001T103000', 'DTEND;TZID=America/Edmonton:20261001T113000',
  'LOCATION:Central Library\\, 800 3 St SE\\, Calgary', 'URL:https://calgarylibrary.ca/events/storytime',
  'DESCRIPTION:<p>Songs and stories for kids 0-5. Drop in\\, no registration.</p>', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:a2', 'SUMMARY:Author talk', 'DTSTART:20261005T010000Z', 'DTEND:20261005T023000Z', 'LOCATION:Memorial Park Library',
  'URL:https://elsewhere.example.com/x', 'STATUS:CANCELLED', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:old', 'SUMMARY:Last month', 'DTSTART:20260801T180000Z', 'DTEND:20260801T190000Z', 'LOCATION:Somewhere', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:far', 'SUMMARY:Far future', 'DTSTART:20270601T180000Z', 'LOCATION:Somewhere', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:folded', 'SUMMARY:A very long title that is fol', ' ded across lines', 'DTSTART;VALUE=DATE:20261010', 'LOCATION:Fish Creek Library', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('iCalendar feeds', () => {
  it('reads Calgary, UTC and all-day times with the right offsets', () => {
    assert.equal(icsDate('20261001T103000', 'America/Edmonton')?.iso, '2026-10-01T10:30:00-06:00');
    assert.equal(icsDate('20251205T103000', 'America/Edmonton')?.iso, '2025-12-05T10:30:00-07:00');
    assert.equal(icsDate('20261005T010000Z')?.iso, '2026-10-04T19:00:00-06:00');
    assert.deepEqual(icsDate('20261010'), { iso: '2026-10-10T00:00:00-06:00', allDay: true });
    assert.equal(icsDate('20261001T103000', 'Europe/London'), null);
  });

  it('turns upcoming events into valid listings and drops past and far-future ones', () => {
    const records = mapIcsEvents(parseIcs(feed), source, now);
    assert.deepEqual(records.map(r => r.input.title), ['Family storytime', 'Author talk', 'A very long title that is folded across lines']);
    for (const r of records) assert.doesNotThrow(() => domain.normalizeRecord(r.input, source, r.id));
    const [story, talk] = records;
    assert.equal(story.input.address, 'Central Library, 800 3 St SE, Calgary');
    assert.equal(story.input.sourceUrl, 'https://calgarylibrary.ca/events/storytime');
    assert.equal(story.input.summary, 'Songs and stories for kids 0-5.');
    assert.equal(talk.input.sourceUrl, 'https://calgarylibrary.ca/events/', 'off-host links fall back to the organizer page');
    assert.equal(talk.cancelled, true);
  });
});
