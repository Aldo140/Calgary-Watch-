import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardCount, buildEventsBoard, daysLeft, initialDayCount } from '../src/lib/eventsBoard';
import type { Event } from '../src/types/discovery';

const now = new Date('2026-10-10T18:30:00-06:00');
let n = 0;
const ev = (title: string, start: string, end: string, extra: Partial<Event> = {}): Event => ({
  id: `e${n++}`, kind: 'event', slug: `e${n}`, title, summary: '', description: '', categories: [], tags: [], sources: [], status: 'published',
  verification: 'source-feed', updatedAt: '2026-10-10', start, end, timezone: 'America/Edmonton', pricing: 'unknown', organizer: 'x', address: 'Calgary', ...extra,
} as Event);

describe('events board', () => {
  it('puts runs that opened before today on their own shelf instead of under their opening day', () => {
    const board = buildEventsBoard([
      ev('Ghazaleh Avarzamani: Of Manual', '2026-06-04T12:00:00-06:00', '2027-01-10T17:00:00-07:00', { venue: 'Contemporary Calgary' }),
      ev('Vertigo Theatre: The Lodger', '2026-09-26T19:30:00-06:00', '2026-10-25T22:00:00-06:00'),
      ev('ScreamFest at Stampede Park', '2026-10-10T19:00:00-06:00', '2026-10-10T23:00:00-06:00'),
      ev('Sunday Safari Brunch', '2026-10-11T09:00:00-06:00', '2026-10-11T11:00:00-06:00'),
    ], now);
    assert.deepEqual(board.running.map(e => e.title), ['Vertigo Theatre: The Lodger', 'Ghazaleh Avarzamani: Of Manual']);
    assert.deepEqual(board.days.map(d => d.date), ['2026-10-10', '2026-10-11']);
  });

  it('drops a daily listing of a run that is already on the shelf', () => {
    const board = buildEventsBoard([
      ev('Ghazaleh Avarzamani: Churn, Earn, Burn and then Return', '2026-06-04T12:00:00-06:00', '2027-01-10T17:00:00-07:00'),
      ev('Ghazaleh Avarzamani: Churn, Earn, Burn and then Return', '2026-10-10T12:00:00-06:00', '2026-10-10T17:00:00-06:00'),
      ev('Replay @ Common Saturdays', '2026-10-10T22:00:00-06:00', '2026-10-11T02:00:00-06:00'),
    ], now);
    assert.equal(board.running.length, 1);
    assert.deepEqual(board.days.flatMap(d => d.entries.map(x => x.event.title)), ['Replay @ Common Saturdays']);
    assert.equal(boardCount([...board.running, ...board.days.flatMap(d => d.entries.map(x => x.event))], now), 2);
  });

  it('folds two showings of the same thing on one day into one row', () => {
    const board = buildEventsBoard([
      ev('Alberta Ballet in The Nutcracker', '2026-12-19T13:00:00-07:00', '2026-12-19T15:00:00-07:00', { venue: 'Jubilee' }),
      ev('Alberta Ballet in The Nutcracker', '2026-12-19T18:00:00-07:00', '2026-12-19T20:00:00-07:00', { venue: 'Jubilee' }),
    ], now);
    assert.equal(board.days[0].entries.length, 1);
    assert.equal(board.days[0].entries[0].starts.length, 2);
    assert.equal(board.days[0].count, 2);
  });

  it('leads a busy day with its biggest draw', () => {
    const board = buildEventsBoard([
      ev('October | Open Studio for 55+', '2026-10-11T13:00:00-06:00', '2026-10-11T15:00:00-06:00'),
      ev('Calgary Flames vs. Vancouver Canucks', '2026-10-11T19:00:00-06:00', '2026-10-11T22:00:00-06:00', { venue: 'Scotiabank Saddledome' }),
      ev('Book club', '2026-10-11T10:00:00-06:00', '2026-10-11T11:00:00-06:00'),
    ], now);
    assert.equal(board.days[0].lead?.event.title, 'Calgary Flames vs. Vancouver Canucks');
  });

  it('shows at least a week and about forty rows before "Show more"', () => {
    const days = Array.from({ length: 20 }, (_, i) => ({ date: `d${i}`, count: 4, entries: Array.from({ length: 4 }) })) as never;
    assert.equal(initialDayCount(days), 10);
    assert.equal(daysLeft('2026-10-10T23:00:00-06:00', now), 0);
    assert.equal(daysLeft('2026-10-25T22:00:00-06:00', now), 15);
  });
});
