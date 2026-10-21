import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inMapTimeWindow, mapTimeRange, parseWhenParam } from '../src/lib/mapTimeWindow.ts';

// 2026-10-21 22:00 in Calgary (MDT, UTC-6) = 04:00 UTC on the 22nd.
const NIGHT = Date.UTC(2026, 9, 22, 4, 0, 0);
const HOUR = 3_600_000;

test('?when= accepts the words people search with', () => {
  assert.equal(parseWhenParam('tonight'), 'tonight');
  assert.equal(parseWhenParam('Yesterday'), 'yesterday');
  assert.equal(parseWhenParam('today'), '24h');
  assert.equal(parseWhenParam('this week'), '7d');
  assert.equal(parseWhenParam('bogus'), null);
  assert.equal(parseWhenParam(null), null);
});

test('tonight starts at 5 pm Calgary time', () => {
  const r = mapTimeRange('tonight', NIGHT)!;
  assert.equal(NIGHT - r.from, 5 * HOUR);
  assert.ok(inMapTimeWindow(NIGHT - 2 * HOUR, 'tonight', NIGHT));
  assert.ok(!inMapTimeWindow(NIGHT - 6 * HOUR, 'tonight', NIGHT));
});

test('yesterday is the previous Calgary calendar day', () => {
  const r = mapTimeRange('yesterday', NIGHT)!;
  assert.equal(r.to - r.from, 24 * HOUR);
  assert.equal(NIGHT - r.to, 22 * HOUR);
  assert.ok(inMapTimeWindow(NIGHT - 30 * HOUR, 'yesterday', NIGHT));
  assert.ok(!inMapTimeWindow(NIGHT - 1 * HOUR, 'yesterday', NIGHT));
});

test('all keeps everything', () => {
  assert.equal(mapTimeRange('all', NIGHT), null);
  assert.ok(inMapTimeWindow(0, 'all', NIGHT));
});
