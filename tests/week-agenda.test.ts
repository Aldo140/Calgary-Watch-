import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addCalgaryDays, weekAgenda } from '../src/lib/discoveryCalendar';
import { pickExampleReport, summarize, summarizeReports, timeAgo } from '../src/lib/homeClaims';
import { discoveryFixtures } from '../src/data/discovery';
import type { DiscoveryEntity, MarketOccurrence } from '../src/types/discovery';

const event = discoveryFixtures.find(e => e.kind === 'event')!;
const market = discoveryFixtures.find(e => e.kind === 'market')!;
const source = { name: 'Organizer', url: 'https://example.org', kind: 'official' as const };
const occurrence = (start: string, end: string, cancelled = false): MarketOccurrence =>
  ({ id: `o-${start}`, marketId: market.id, start, end, timezone: 'America/Edmonton', cancelled, source });
const withDates = (start: string, end: string, extra: Partial<DiscoveryEntity> = {}) =>
  ({ ...event, id: `e-${start}`, start, end, ...extra }) as DiscoveryEntity;

// Wednesday 23 September 2026, 10:00 in Calgary.
const now = new Date('2026-09-23T16:00:00Z');

describe('weekAgenda', () => {
  it('always returns seven consecutive Calgary dates, empty days included', () => {
    const week = weekAgenda([], [], 7, now);
    assert.deepEqual(week.map(d => d.date), ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29']);
    assert.ok(week.every(d => d.items.length === 0));
  });

  it('files a late-evening event under its Calgary date, not the UTC date', () => {
    const late = withDates('2026-09-25T21:00:00-06:00', '2026-09-25T23:30:00-06:00');
    const week = weekAgenda([late], [], 7, now);
    assert.equal(week.find(d => d.date === '2026-09-25')!.items.length, 1);
    assert.equal(week.find(d => d.date === '2026-09-26')!.items.length, 0);
  });

  it('shows a multi-day event on every day it runs', () => {
    const festival = withDates('2026-09-26T10:00:00-06:00', '2026-09-27T18:00:00-06:00');
    const days = weekAgenda([festival], [], 7, now).filter(d => d.items.length).map(d => d.date);
    assert.deepEqual(days, ['2026-09-26', '2026-09-27']);
  });

  it('drops finished and cancelled listings', () => {
    const over = withDates('2026-09-23T07:00:00-06:00', '2026-09-23T09:00:00-06:00');
    const cancelled = withDates('2026-09-24T10:00:00-06:00', '2026-09-24T12:00:00-06:00', { cancelled: true } as Partial<DiscoveryEntity>);
    assert.ok(weekAgenda([over, cancelled], [], 7, now).every(d => d.items.length === 0));
  });

  it('expands each live market occurrence and skips cancelled ones', () => {
    const occ = [
      occurrence('2026-09-24T15:00:00-06:00', '2026-09-24T19:00:00-06:00'),
      occurrence('2026-09-26T09:00:00-06:00', '2026-09-26T14:00:00-06:00', true),
    ];
    const week = weekAgenda([market], occ, 7, now);
    assert.deepEqual(week.filter(d => d.items.length).map(d => d.date), ['2026-09-24']);
    assert.equal(week[1].items[0].kind, 'market');
  });

  it('sorts a day by start time and carries indoor/free hints', () => {
    const evening = withDates('2026-09-26T19:00:00-06:00', '2026-09-26T21:00:00-06:00', { pricing: 'free', categories: ['indoor'] } as Partial<DiscoveryEntity>);
    const morning = withDates('2026-09-26T09:00:00-06:00', '2026-09-26T11:00:00-06:00');
    const [first, second] = weekAgenda([evening, morning], [], 7, now)[3].items;
    assert.equal(first.start, morning.kind === 'event' ? morning.start : '');
    assert.equal(second.free, true);
    assert.equal(second.indoor, true);
  });

  it('adds Calgary days across the November DST change', () => {
    assert.equal(addCalgaryDays('2026-10-31', 2), '2026-11-02');
  });
});

describe('homepage claims', () => {
  const item = (title: string, to = `/x/${title}`) => ({ key: title, kind: 'event' as const, title, to, start: '', end: '', free: false, indoor: false, outdoor: false });

  it('counts a listing once for the weekend even when it runs on two days', () => {
    const week = weekAgenda([], [], 7, now); // Wed..Tue; Fri 25 – Sun 27
    week[3].items.push(item('Fest')); week[4].items.push(item('Fest'));
    assert.equal(summarize(week), 'Nothing is on our calendar today; 1 plan for the weekend.');
  });

  it('says so plainly when nothing is listed', () => {
    assert.equal(summarize(weekAgenda([], [], 7, now)), 'Nothing is on our calendar today; the weekend is still open.');
  });

  it('never counts demo, hidden, stale or expired reports', () => {
    const t = now.getTime();
    const base = { visibility: 'public', category: 'traffic', timestamp: t - 3600000 } as any;
    const { total, byCategory, capped } = summarizeReports([
      base,
      { ...base, data_source: 'demo' },
      { ...base, visibility: 'hidden' },
      { ...base, timestamp: t - 2 * 86400000 },
      { ...base, expires_at: t - 1 },
      { ...base, category: 'weather' },
    ], t, 60);
    assert.deepEqual([total, byCategory, capped], [2, { traffic: 1, weather: 1 }, false]);
  });

  it('flags a full sample inside the window as a lower bound', () => {
    const t = now.getTime();
    const many = Array.from({ length: 3 }, () => ({ visibility: 'public', category: 'traffic', timestamp: t - 1000 }) as any);
    assert.equal(summarizeReports(many, t, 3).capped, true);
  });
});

describe('example report', () => {
  const t = now.getTime();
  const r = (o: object) => ({ id: 'x', title: 'Vandalism reported in Bowness', visibility: 'public', category: 'traffic', timestamp: t - 3600000, ...o }) as any;

  it('prefers the newest crime report, only from public, real, current rows', () => {
    const pick = pickExampleReport([
      r({ id: 'a', category: 'traffic', timestamp: t - 60000 }),
      r({ id: 'b', category: 'crime', timestamp: t - 7200000 }),
      r({ id: 'c', category: 'crime', timestamp: t - 60000, data_source: 'demo' }),
      r({ id: 'd', category: 'crime', timestamp: t - 60000, visibility: 'hidden' }),
    ], t);
    assert.equal(pick?.id, 'b');
  });

  it('falls back to the newest of any kind, and to nothing when all are stale', () => {
    assert.equal(pickExampleReport([r({ id: 'a' })], t)?.id, 'a');
    assert.equal(pickExampleReport([r({ timestamp: t - 2 * 86400000 })], t), null);
  });

  it('says how long ago plainly', () => {
    assert.equal(timeAgo(t - 5 * 60000, t), '5 min ago');
    assert.equal(timeAgo(t - 3 * 3600000, t), '3 h ago');
  });
});
