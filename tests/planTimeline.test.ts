/**
 * The member dashboard's plans, split at today: on now and coming up, then
 * already passed.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Event, Market, MarketOccurrence } from '../src/types/discovery.ts';
import { buildPlanTimeline, nextUp, pickWhenAt, planWhen } from '../src/lib/eventPicks.ts';

function event(over: Partial<Event> & Pick<Event, 'id' | 'title' | 'start'>): Event {
  return {
    kind: 'event', slug: over.id, summary: '', description: '', categories: [], tags: [],
    sources: [{ name: 'Organizer', url: 'https://example.org', kind: 'official' }],
    status: 'published', verification: 'source-feed', updatedAt: '2026-10-01',
    end: new Date(Date.parse(over.start) + 2 * 3600_000).toISOString(),
    timezone: 'America/Edmonton', pricing: 'paid', organizer: 'Org', address: 'Calgary',
    ...over,
  } as Event;
}

const NOW = new Date('2026-10-12T16:00:00Z'); // Monday 10:00 Calgary
const tonight = event({ id: 'tonight', title: 'Jazz at the Ironwood', start: '2026-10-13T02:00:00Z' }); // Mon 20:00
const thursday = event({ id: 'thu', title: 'Flames vs. Oilers', start: '2026-10-16T01:30:00Z' }); // Thu 19:30
const march = event({ id: 'march', title: 'Spring symphony', start: '2027-03-06T02:00:00Z' });
const run = event({ id: 'run', title: 'Exhibition', start: '2026-09-01T16:00:00Z', end: '2026-11-01T00:00:00Z' });
const saturday = event({ id: 'yday', title: 'Comedy night', start: '2026-10-11T03:00:00Z' }); // Sat 21:00
const lastMonth = event({ id: 'sep', title: 'Ghost tour', start: '2026-09-20T03:00:00Z' });
const longAgo = event({ id: 'old', title: 'Stampede', start: '2026-07-05T18:00:00Z' });
const notMine = event({ id: 'other', title: 'Not going', start: '2026-10-14T02:00:00Z' });
const market = { kind: 'market', id: 'mkt', slug: 'mkt', title: 'Crossroads Market', summary: '', categories: [], tags: [] } as unknown as Market;
const occ = (id: string, start: string): MarketOccurrence => ({ id, marketId: 'mkt', start, end: new Date(Date.parse(start) + 5 * 3600_000).toISOString() } as MarketOccurrence);

describe('plan timeline', () => {
  const entities = [tonight, thursday, march, run, saturday, lastMonth, longAgo, notMine, market];
  const goingIds = new Set(['tonight', 'thu', 'march', 'run', 'yday', 'sep', 'old', 'mkt']);
  const t = buildPlanTimeline({ entities, occurrences: [occ('m1', '2026-10-03T16:00:00Z'), occ('m2', '2026-10-17T16:00:00Z')], goingIds, now: NOW });

  it('puts on-now first, then the rest soonest first, with no 10-day cut-off', () => {
    assert.deepEqual(t.ahead.map((p) => p.item.entityId), ['run', 'tonight', 'thu', 'mkt', 'march']);
    assert.deepEqual(t.ahead.map((p) => p.when), ['On now', 'Tonight', 'In 3 days', 'In 5 days', 'In 5 months']);
  });
  it('lists what already happened most recent first, inside the window', () => {
    assert.deepEqual(t.past.map((p) => p.item.entityId), ['yday', 'sep']);
    assert.deepEqual(t.past.map((p) => p.when), ['2 days ago', '3 weeks ago']);
  });
  it('uses a market’s next date while it has one, its last once it doesn’t', () => {
    assert.equal(t.ahead.find((p) => p.item.entityId === 'mkt')!.item.key, 'm2');
    const later = buildPlanTimeline({ entities: [market], occurrences: [occ('m1', '2026-10-03T16:00:00Z')], goingIds, now: NOW });
    assert.equal(later.past[0].item.key, 'm1');
    assert.equal(later.ahead.length, 0);
  });
  it('words distances the way people say them', () => {
    assert.equal(planWhen('upcoming', 0, Date.parse('2026-10-12T19:00:00Z')), 'Today');
    assert.equal(planWhen('upcoming', 1, 0), 'Tomorrow');
    assert.equal(planWhen('upcoming', 9, 0), 'Next week');
    assert.equal(planWhen('past', 0, 0), 'Earlier today');
    assert.equal(planWhen('past', -1, 0), 'Yesterday');
    assert.equal(planWhen('past', -10, 0), 'Last week');
  });
});

describe('runs that are already open', () => {
  const N = NOW.getTime();
  const closingSoon = event({ id: 'soon', title: 'Closing soon', start: '2026-06-04T16:00:00Z', end: '2026-10-25T00:00:00Z' });

  it('reads by its closing date, never the opening day months ago', () => {
    assert.equal(pickWhenAt(run, N), 'On now · until Oct 31');
    assert.match(pickWhenAt(thursday, N), /^Thu, Oct 15/);
  });
  it('lists open runs closing soonest first', () => {
    const t = buildPlanTimeline({ entities: [run, closingSoon], occurrences: [], goingIds: new Set(['run', 'soon']), now: NOW });
    assert.deepEqual(t.ahead.map((p) => p.item.entityId), ['soon', 'run']);
  });
  it('leads with a dated plan this week over an exhibition you can visit any day', () => {
    const items = [run, tonight, march].map((e) => ({ start: e.start, end: e.end, id: e.id }));
    assert.equal(nextUp(items, N)?.id, 'tonight');
    assert.equal(nextUp([run, march].map((e) => ({ start: e.start, end: e.end, id: e.id })), N)?.id, 'run');
  });
});
