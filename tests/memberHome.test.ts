/**
 * The signed-in /plans home: setup steps, what arrives when, and near-home reports.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emailPlan, nearHome, nextSend, partOfDay, setupPercent, setupSteps } from '../src/lib/memberHome.ts';

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
