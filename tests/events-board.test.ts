import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardCount, buildEventsBoard, daysLeft, dedupeShows, initialDayCount } from '../src/lib/eventsBoard';
import { cleanBlock, cleanText } from '../src/lib/cleanText';
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

  it('shows one listing when two sources list the same show', () => {
    const kept = dedupeShows([
      ev('Buena Vista Orchestra', '2026-10-28T20:30:00-06:00', '2026-10-28T23:00:00-06:00', { venue: 'Bella Concert Hall - Mount Royal University', image: { src: 'https://x/y.jpg', alt: '' } }),
      ev('Live Nation Presents Buena Vista Orchestra', '2026-10-28T20:30:00-06:00', '2026-10-28T23:00:00-06:00', { venue: 'Bella Concert Hall' }),
      ev('The Smashing Pumpkins: The Rats In A Cage Tour', '2026-11-03T20:00:00-07:00', '2026-11-03T23:00:00-07:00', { venue: 'Scotiabank Saddledome' }),
      ev('Smashing Pumpkins: The Rats In A Cage Tour', '2026-11-03T21:00:00-07:00', '2026-11-03T23:00:00-07:00', { venue: 'Scotiabank Saddledome', pricing: 'paid', neighbourhood: 'Beltline' }),
      ev('Alberta Ballet in The Nutcracker', '2026-12-19T13:00:00-07:00', '2026-12-19T15:00:00-07:00', { venue: 'Jubilee' }),
      ev('Alberta Ballet in The Nutcracker', '2026-12-19T18:00:00-07:00', '2026-12-19T20:00:00-07:00', { venue: 'Jubilee' }),
    ]);
    assert.deepEqual(kept.map(e => e.title), ['Buena Vista Orchestra', 'Smashing Pumpkins: The Rats In A Cage Tour', 'Alberta Ballet in The Nutcracker', 'Alberta Ballet in The Nutcracker']);
  });
});

describe('feed text', () => {
  it('decodes entities, including double-encoded ones, and drops mojibake', () => {
    assert.equal(cleanText('Carnival of Curiosities &#8211; Adult Night'), 'Carnival of Curiosities – Adult Night');
    assert.equal(cleanText('Ghouls&#8217; Night Out'), 'Ghouls’ Night Out');
    assert.equal(cleanText('Tom &amp;amp; Jerry &amp;#8211; live'), 'Tom & Jerry – live');
    assert.equal(cleanText('🎃👻 Frozen Frights — Halloween on Ice \uFFFD🦇'), '🎃👻 Frozen Frights — Halloween on Ice 🦇');
    assert.equal(cleanText('Meet at theÂ Warehouse.'), 'Meet at the Warehouse.');
    assert.equal(cleanText('Whethan \u00c2\u0080\u0093 Warehouse.wavs Tour'), 'Whethan – Warehouse.wavs Tour');
    assert.equal(cleanText('CafÃ© Rouge'), 'Café Rouge');
    assert.equal(cleanBlock('One.\n\nTwo&nbsp;&nbsp;words.'), 'One.\n\nTwo words.');
  });
});
