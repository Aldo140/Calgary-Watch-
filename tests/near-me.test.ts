import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryMix, compassFrom, distanceLabel, nearbyReports } from '../src/lib/nearMe';
import type { Incident } from '../src/types';

const me = { lat: 51.04, lng: -114.07 };
function inc(p: Partial<Incident>): Incident {
  return {
    id: 'x', title: 't', description: 'd', category: 'crime', neighborhood: 'Beltline', lat: 51.04, lng: -114.07,
    timestamp: 0, name: 'n', verified_status: 'unverified', report_count: 1, ...p,
  } as Incident;
}

test('compassFrom names the eight directions', () => {
  assert.equal(compassFrom(me, { lat: 51.05, lng: -114.07 }), 'N');
  assert.equal(compassFrom(me, { lat: 51.04, lng: -114.05 }), 'E');
  assert.equal(compassFrom(me, { lat: 51.03, lng: -114.085 }), 'SW');
});

test('distanceLabel uses metres under a kilometre', () => {
  assert.equal(distanceLabel(0.613), '610 m');
  assert.equal(distanceLabel(0.001), '10 m');
  assert.equal(distanceLabel(1.44), '1.4 km');
});

test('nearbyReports keeps the radius, puts emergencies first, then closest', () => {
  const list = nearbyReports([
    inc({ id: 'far', lat: 51.2 }),
    inc({ id: 'close', lat: 51.041 }),
    inc({ id: 'mid', lat: 51.05 }),
    inc({ id: 'sos', lat: 51.055, category: 'emergency' }),
  ], me);
  assert.deepEqual(list.map((i) => i.id), ['sos', 'close', 'mid']);
  assert.equal(list[1]._dir, 'N');
});

test('nearbyReports follows the map category filter', () => {
  const list = nearbyReports([inc({ id: 'a' }), inc({ id: 'b', category: 'traffic' })], me, 'traffic');
  assert.deepEqual(list.map((i) => i.id), ['b']);
});

test('categoryMix counts largest first', () => {
  assert.deepEqual(categoryMix([{ category: 'traffic' }, { category: 'crime' }, { category: 'crime' }]),
    [{ category: 'crime', count: 2 }, { category: 'traffic', count: 1 }]);
});
