import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { eveningsThisWeek, resolvePicks } from '../src/lib/dateNight';
import { DATE_PICKS } from '../src/content/dateNight';
import type { DiscoveryEntity } from '../src/types/discovery';

const ev = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'event', slug: id, title: `Show ${id}`, start, end, categories: ['arts'], address: 'x', sources: [], ...extra }) as unknown as DiscoveryEntity;

describe('date night', () => {
  const now = Date.parse('2026-10-14T12:00:00-06:00');
  it('keeps upcoming and running picks, soonest first, and drops expired ones', () => {
    const picks = [
      { sourceId: 's', recordId: 'late', vibe: 'Dress up' as const, take: 't' },
      { sourceId: 's', recordId: 'soon', vibe: 'Dress up' as const, take: 't' },
      { sourceId: 's', recordId: 'gone', vibe: 'Dress up' as const, take: 't' },
      { sourceId: 's', recordId: 'run', vibe: 'Dress up' as const, take: 't' },
    ];
    const entities = [
      ev('late', '2026-12-11T19:00:00-07:00', '2026-12-11T21:00:00-07:00', { sourceId: 's', sourceRecordId: 'late' }),
      ev('soon', '2026-10-16T19:30:00-06:00', '2026-10-16T21:00:00-06:00', { sourceId: 's', sourceRecordId: 'soon' }),
      ev('gone', '2026-10-01T19:30:00-06:00', '2026-10-01T21:00:00-06:00', { sourceId: 's', sourceRecordId: 'gone' }),
      ev('run', '2026-09-29T19:30:00-06:00', '2026-10-25T16:00:00-06:00', { sourceId: 's', sourceRecordId: 'run' }),
    ];
    const r = resolvePicks(entities, [], now, picks);
    assert.deepEqual(r.map(p => p.entity.id), ['run', 'soon', 'late']);
    assert.equal(r[0].onNow, true);
    assert.ok(r[0].until);
  });
  it('lists evening arts and nights out this week, without kids’ or daytime events', () => {
    const list = eveningsThisWeek([
      ev('eve', '2026-10-15T19:00:00-06:00', '2026-10-15T21:00:00-06:00'),
      ev('day', '2026-10-15T10:00:00-06:00', '2026-10-15T12:00:00-06:00'),
      ev('kids', '2026-10-15T18:00:00-06:00', '2026-10-15T19:00:00-06:00', { categories: ['arts', 'family'] }),
      ev('far', '2026-10-30T19:00:00-06:00', '2026-10-30T21:00:00-06:00'),
    ], now, new Set());
    assert.deepEqual(list.map(e => e.id), ['eve']);
  });
  it('every pick points at a reviewed record that exists', () => {
    const batches = JSON.parse(readFileSync('scripts/discovery/reviewed-sources.json', 'utf8')) as { source: { id: string }; records?: { id: string }[] }[];
    const known = new Set(batches.flatMap(b => (b.records ?? []).map(r => `${b.source.id}/${r.id}`)));
    for (const p of DATE_PICKS) assert.ok(known.has(`${p.sourceId}/${p.recordId}`), `${p.sourceId}/${p.recordId}`);
  });
});
