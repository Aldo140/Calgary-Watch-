/**
 * The "My Watch" feed engine.
 *
 * buildWatchFeed narrows the already-loaded incident set to what changed near
 * the reader since they last looked, sections it by signal strength, and
 * summarizes it in plain language. Pure — no Firestore, no DOM — so the map
 * panel and the weekly email can share one ranking.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Incident } from '../src/types/index.ts';
import { buildWatchFeed } from '../src/lib/watch.ts';

const NOW = 1_700_000_000_000;
const HOME = { lat: 51.0447, lng: -114.0719 };

function inc(over: Partial<Incident> & { id: string }): Incident {
  return {
    title: 'Report',
    description: '',
    category: 'crime',
    neighborhood: 'Beltline',
    lat: HOME.lat,
    lng: HOME.lng,
    timestamp: NOW - 60_000,
    name: 'Ana',
    verified_status: 'unverified',
    report_count: 1,
    ...over,
  } as Incident;
}

describe('buildWatchFeed — since window', () => {
  it('keeps only incidents newer than `since`', () => {
    const feed = buildWatchFeed({
      incidents: [
        inc({ id: 'new', timestamp: NOW - 10 * 60_000 }),
        inc({ id: 'old', timestamp: NOW - 5 * 60 * 60_000 }),
      ],
      home: HOME,
      since: NOW - 60 * 60_000,
      prefs: { radiusM: null, categories: [] },
      now: NOW,
    });
    assert.deepEqual(feed.items.map((i) => i.incident.id), ['new']);
  });

  it('with since=null returns everything (first visit)', () => {
    const feed = buildWatchFeed({
      incidents: [inc({ id: 'a' }), inc({ id: 'b', timestamp: NOW - 9e8 })],
      home: HOME,
      since: null,
      prefs: { radiusM: null, categories: [] },
      now: NOW,
    });
    assert.equal(feed.items.length, 2);
  });
});

describe('buildWatchFeed — sections, radius, categories', () => {
  it('orders emergency → community → official → routine', () => {
    const feed = buildWatchFeed({
      incidents: [
        inc({ id: 'routine', data_source: 'system', category: 'traffic', source_type: '511_alberta_traffic' }),
        inc({ id: 'community', data_source: 'community' }),
        inc({ id: 'emergency', category: 'emergency' }),
        inc({ id: 'official', data_source: 'official', category: 'infrastructure' }),
      ],
      home: HOME,
      since: null,
      prefs: { radiusM: null, categories: [] },
      now: NOW,
    });
    assert.deepEqual(
      feed.items.map((i) => i.section),
      ['emergency', 'community', 'official', 'routine'],
    );
    assert.deepEqual(feed.counts, { emergency: 1, community: 1, official: 1, routine: 1 });
  });

  it('drops incidents outside the radius but keeps name-only (null distance) ones', () => {
    const far = { lat: 51.2, lng: -114.4 }; // ~30 km from HOME
    const feed = buildWatchFeed({
      incidents: [inc({ id: 'near' }), inc({ id: 'far', lat: far.lat, lng: far.lng })],
      home: HOME,
      since: null,
      prefs: { radiusM: 2000, categories: [] },
      now: NOW,
    });
    assert.deepEqual(feed.items.map((i) => i.incident.id), ['near']);
  });

  it('applies the category filter when non-empty', () => {
    const feed = buildWatchFeed({
      incidents: [
        inc({ id: 'crime', category: 'crime' }),
        inc({ id: 'traffic', category: 'traffic' }),
      ],
      home: HOME,
      since: null,
      prefs: { radiusM: null, categories: ['crime'] },
      now: NOW,
    });
    assert.deepEqual(feed.items.map((i) => i.incident.id), ['crime']);
  });

  it('summarizes counts in plain language', () => {
    const feed = buildWatchFeed({
      incidents: [
        inc({ id: 'c1', data_source: 'community' }),
        inc({ id: 'c2', data_source: 'community' }),
        inc({ id: 'o1', data_source: 'official', category: 'infrastructure' }),
      ],
      home: HOME,
      since: null,
      prefs: { radiusM: null, categories: [] },
      now: NOW,
    });
    assert.equal(feed.sinceSummary, '2 neighbour reports and 1 official update near home');
  });

  it('returns an empty summary when nothing is new', () => {
    const feed = buildWatchFeed({
      incidents: [inc({ id: 'old', timestamp: NOW - 9e8 })],
      home: HOME,
      since: NOW - 60_000,
      prefs: { radiusM: null, categories: [] },
      now: NOW,
    });
    assert.equal(feed.sinceSummary, '');
    assert.equal(feed.items.length, 0);
  });

  it('omits "near home" when there is no home location', () => {
    const feed = buildWatchFeed({
      incidents: [inc({ id: 'c1', data_source: 'community' })],
      home: null,
      since: null,
      prefs: { radiusM: null, categories: [] },
      now: NOW,
    });
    assert.equal(feed.sinceSummary, '1 neighbour report');
  });
});
