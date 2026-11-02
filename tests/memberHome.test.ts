/**
 * The signed-in /plans home: setup steps, what arrives when, and near-home reports.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { daylight, deckFor, emailPlan, nearHome, nextSend, partOfDay, setupPercent, setupSteps } from '../src/lib/memberHome.ts';

const MON_8AM = Date.parse('2026-10-12T14:00:00Z'); // Monday 08:00 Calgary (UTC-6)
const MON_10AM = Date.parse('2026-10-12T16:00:00Z');
const TUE = Date.parse('2026-10-06T09:00:00Z'); // Tuesday 03:00 Calgary

describe('setup checklist', () => {
  it('counts steps and names the badge each earns', () => {
    const steps = setupSteps({ hasHomeArea: true, weekly: true, events: false, interestCount: 2, goingCount: 0 });
    assert.equal(steps.length, 6);
    assert.deepEqual(steps.filter((s) => s.done).map((s) => s.id), ['home', 'monday']);
    assert.equal(setupPercent(steps), 33);
    assert.equal(steps.find((s) => s.id === 'interests')!.badge, 'tuned-in');
  });
  it('treats either a report or a suggested event as sharing', () => {
    const base = { hasHomeArea: true, weekly: true, events: true, interestCount: 3, goingCount: 1 };
    assert.equal(setupPercent(setupSteps({ ...base, submissionCount: 1 })), 100);
    assert.equal(setupPercent(setupSteps({ ...base, reportCount: 1 })), 100);
    assert.equal(setupPercent(setupSteps(base)), 83);
  });
});

describe('what arrives, and when', () => {
  it('names the combined email when both lists are on', () => {
    const p = emailPlan(true, true, TUE);
    assert.equal(p.kind, 'combined');
    assert.equal(p.name, 'Your week');
    assert.equal(new Date(p.next!).toISOString(), '2026-10-12T15:00:00.000Z');
  });
  it('sends Thursday-only readers on Thursday at 8', () => {
    const p = emailPlan(false, true, TUE);
    assert.equal(p.kind, 'thursday');
    assert.equal(new Date(p.next!).toISOString(), '2026-10-08T14:00:00.000Z');
  });
  it('rolls to next week once this Monday’s send has passed', () => {
    assert.equal(new Date(nextSend(MON_8AM, 1, 9)).toISOString(), '2026-10-12T15:00:00.000Z');
    assert.equal(new Date(nextSend(MON_10AM, 1, 9)).toISOString(), '2026-10-19T15:00:00.000Z');
  });
  it('has no next send with no list on', () => {
    assert.equal(emailPlan(false, false, TUE).next, null);
  });
});

describe('near home', () => {
  const home = { lat: 51.0447, lng: -114.0719 };
  const r = (id: string, lat: number, ts: number, hood = 'Beltline') => ({ id, title: id, category: 'crime' as const, timestamp: ts, lat, lng: home.lng, neighborhood: hood });
  it('keeps reports within the radius, newest first', () => {
    const out = nearHome([r('far', home.lat + 0.1, 3), r('a', home.lat + 0.005, 1), r('b', home.lat, 2)], home, 'Beltline');
    assert.deepEqual(out.map((x) => x.id), ['b', 'a']);
    assert.ok(out[1].distanceM! > 500 && out[1].distanceM! < 600);
  });
  it('falls back to the neighbourhood name without a home point', () => {
    const out = nearHome([{ ...r('x', NaN, 1), lat: undefined }, { ...r('y', NaN, 2, 'Bowness'), lat: undefined }], null, 'beltline');
    assert.deepEqual(out.map((x) => x.id), ['x']);
  });
  it('greets by the Calgary clock', () => {
    assert.equal(partOfDay(MON_8AM), 'Morning');
    assert.equal(partOfDay(Date.parse('2026-10-12T21:00:00Z')), 'Afternoon');
  });
});

describe('phone swipe deck', () => {
  const item = (id: string, kind: 'event' | 'market', start: string, end: string, key = id) => ({
    key, entityId: id, kind, title: id, summary: '', path: `/events/${id}`, start, end, free: false, interests: [], matched: [], distanceM: null,
  });
  const NOW = Date.parse('2026-11-02T20:00:00Z');
  it('keeps unanswered events in rank order, once each, and drops markets, plans and finished ones', () => {
    const picks = [
      item('a', 'event', '2026-11-03T02:00:00Z', '2026-11-03T05:00:00Z'),
      item('m', 'market', '2026-11-04T16:00:00Z', '2026-11-04T22:00:00Z'),
      item('b', 'event', '2026-11-04T02:00:00Z', '2026-11-04T05:00:00Z'),
      item('a', 'event', '2026-11-05T02:00:00Z', '2026-11-05T05:00:00Z', 'a-2'),
      item('old', 'event', '2026-11-01T02:00:00Z', '2026-11-01T05:00:00Z'),
      item('c', 'event', '2026-11-06T02:00:00Z', '2026-11-06T05:00:00Z'),
    ];
    assert.deepEqual(deckFor(picks, new Set(['b']), NOW).map((p) => p.key), ['a', 'c']);
    assert.equal(deckFor(picks, new Set(), NOW, 2).length, 2);
  });
});

describe('sun ribbon', () => {
  const clock = (t: number) => new Date(t - 6 * 3600_000).toISOString().slice(11, 16);
  const rise = Date.parse('2026-11-02T14:30:00Z'), set = Date.parse('2026-11-02T23:52:00Z');
  it('counts down to sunrise, then sunset, then says when it got dark', () => {
    assert.deepEqual(daylight(Date.parse('2026-11-02T13:50:00Z'), rise, set, clock), { phase: 'before', progress: 0, headline: 'Sunrise in 40 min' });
    const day = daylight(Date.parse('2026-11-02T21:11:00Z'), rise, set, clock);
    assert.equal(day.headline, 'Sunset in 2 h 41 min');
    assert.ok(day.progress > 0.7 && day.progress < 0.72);
    assert.equal(daylight(Date.parse('2026-11-03T02:00:00Z'), rise, set, clock).headline, 'Dark since 17:52');
  });
});
