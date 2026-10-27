/**
 * The member dashboard's lead card: what it shows for each kind of member.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PickItem, PlanEntry, PlanTimeline } from '../src/lib/eventPicks.ts';
import { spotlightFor, startsIn } from '../src/lib/memberHome.ts';

const NOW = Date.parse('2026-10-12T16:00:00Z'); // Monday 10:00 Calgary
const H = 3600_000;
const item = (key: string, start: number, end = start + 2 * H): PickItem => ({
  key, entityId: key, kind: 'event', title: key, summary: '', path: `/events/${key}`,
  start: new Date(start).toISOString(), end: new Date(end).toISOString(), free: false, interests: [], matched: [], distanceM: null,
} as PickItem);
const ahead = (i: PickItem, status: PlanEntry['status'], days: number): PlanEntry => ({ item: i, status, days, when: '' });
const plans = (a: PlanEntry[], past = 0): PlanTimeline => ({ ahead: a, past: Array.from({ length: past }, (_, n) => ahead(item(`p${n}`, NOW - 50 * H), 'past', -2)) });

describe('dashboard spotlight', () => {
  const tonight = ahead(item('tonight', NOW + 9 * H), 'upcoming', 0);
  const friday = ahead(item('friday', NOW + 4 * 24 * H), 'upcoming', 4);
  const run = ahead(item('run', NOW - 30 * 24 * H, NOW + 20 * 24 * H), 'live', 0);
  const show = ahead(item('show', NOW - H, NOW + H), 'live', 0);

  it('leads with something happening right now', () => {
    const s = spotlightFor(plans([show, tonight, friday]), [], NOW);
    assert.equal(s.kind, 'now');
    assert.equal(s.kind === 'now' && s.more, 2);
  });
  it('leads with a plan later today over one later this week', () => {
    assert.equal(spotlightFor(plans([run, friday, tonight]), [], NOW).kind, 'today');
  });
  it('leads with the next dated plan before an open run', () => {
    const s = spotlightFor(plans([run, friday]), [], NOW);
    assert.equal(s.kind, 'soon');
    assert.equal(s.kind === 'soon' && s.entry.item.key, 'friday');
  });
  it('falls back to a run when that is all there is', () => {
    assert.equal(spotlightFor(plans([run]), [], NOW).kind, 'run');
  });
  it('suggests a first plan, and remembers past ones', () => {
    const pick = item('pick', NOW + 30 * H);
    const fresh = spotlightFor(plans([]), [pick], NOW);
    assert.deepEqual(fresh.kind === 'starter' && [fresh.pick.key, fresh.been], ['pick', 0]);
    const back = spotlightFor(plans([], 3), [pick], NOW);
    assert.equal(back.kind === 'starter' && back.been, 3);
  });
  it('says so honestly when nothing matches', () => {
    assert.deepEqual(spotlightFor(plans([], 1), [], NOW), { kind: 'quiet', been: 1 });
  });
  it('counts down to a plan later today', () => {
    assert.equal(startsIn(NOW + 45 * 60_000, NOW), 'in 45 min');
    assert.equal(startsIn(NOW + 200 * 60_000, NOW), 'in 3 h 20 min');
    assert.equal(startsIn(NOW + 6.5 * H, NOW), 'in 6 h');
    assert.equal(startsIn(NOW - 1000, NOW), 'starting now');
  });
});
