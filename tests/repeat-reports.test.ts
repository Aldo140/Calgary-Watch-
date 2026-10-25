import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldRepeats } from '../src/lib/repeatReports';
import type { Incident } from '../src/types';

function inc(p: Partial<Incident>): Incident {
  return {
    id: 'x', title: 'Disturbance reported in Hillhurst', description: 'd', category: 'crime', neighborhood: 'Hillhurst',
    lat: 51.0536, lng: -114.0927, timestamp: 0, name: 'n', verified_status: 'unverified', report_count: 1,
    data_source: 'official', source_type: 'calgary_open_data', ...p,
  } as Incident;
}

test('identical 311 records at one spot fold into the newest, with a count', () => {
  const out = foldRepeats([inc({ id: 'b', timestamp: 3 }), inc({ id: 'a', timestamp: 1 }), inc({ id: 'c', timestamp: 2, title: 'Disturbance in Hillhurst' })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'b');
  assert.equal(out[0].repeat_count, 3);
  assert.equal(out[0].repeat_first, 1);
  assert.deepEqual(out[0].repeat_ids, ['c', 'a']);
});

test('different titles, sources or spots stay separate', () => {
  const out = foldRepeats([
    inc({ id: 'a' }),
    inc({ id: 'b', title: 'Vandalism reported in Hillhurst' }),
    inc({ id: 'c', source_type: 'news_rss' }),
    inc({ id: 'd', lat: 51.06 }),
  ]);
  assert.equal(out.length, 4);
  assert.ok(out.every((i) => i.repeat_count === undefined));
});

test("neighbours' posts and emergencies never fold", () => {
  const out = foldRepeats([
    inc({ id: 'm1', data_source: undefined, source_type: undefined }),
    inc({ id: 'm2', data_source: undefined, source_type: undefined }),
    inc({ id: 'e1', category: 'emergency' }),
    inc({ id: 'e2', category: 'emergency' }),
  ]);
  assert.equal(out.length, 4);
});

test('order is kept: a folded group sits where its newest record was', () => {
  const out = foldRepeats([inc({ id: 'top', title: 'Other', lat: 51.1 }), inc({ id: 'b', timestamp: 3 }), inc({ id: 'mid', title: 'Else', lat: 51.2 }), inc({ id: 'a', timestamp: 1 })]);
  assert.deepEqual(out.map((i) => i.id), ['top', 'b', 'mid']);
});
