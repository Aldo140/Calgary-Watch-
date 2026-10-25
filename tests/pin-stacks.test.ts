import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stackByPoint } from '../src/lib/pinStacks';
import type { Incident } from '../src/types';

function inc(p: Partial<Incident>): Incident {
  return {
    id: 'x', title: 't', description: 'd', category: 'crime', neighborhood: 'Beltline', lat: 51.0471, lng: -114.0508,
    timestamp: 0, name: 'n', verified_status: 'unverified', report_count: 1, ...p,
  } as Incident;
}

test('reports on one point make one stack; others stay alone', () => {
  const stacks = stackByPoint([
    inc({ id: 'a', timestamp: 1 }), inc({ id: 'b', timestamp: 3 }), inc({ id: 'c', timestamp: 2, lat: 51.0471004 }),
    inc({ id: 'far', lat: 51.06 }),
  ]);
  assert.equal(stacks.length, 2);
  const big = stacks.find((s) => s.members.length === 3)!;
  assert.deepEqual(big.members.map((i) => i.id), ['b', 'c', 'a']);
  assert.equal(big.lead.id, 'b');
});

test('an emergency leads its stack even when older', () => {
  const [s] = stackByPoint([inc({ id: 'new', timestamp: 9 }), inc({ id: 'sos', category: 'emergency', timestamp: 1 })]);
  assert.equal(s.lead.id, 'sos');
});

test('bad coordinates are skipped', () => {
  assert.equal(stackByPoint([inc({ lat: Number.NaN })]).length, 0);
});

test('tidyIncidentText drops the doubled word in old 311 titles', async () => {
  const { tidyIncidentText } = await import('../src/lib/crimeBoard');
  assert.equal(tidyIncidentText({ title: 'Disturbance reported reported in Beltline', description: 'd' }).title, 'Disturbance reported in Beltline');
});
