/**
 * Feed ordering policy for the mobile sheet.
 *
 * Emergencies pin to the top in every mode. 'nearest' is the default once the
 * reader's location is known, but a stored 'nearest' must not strand the feed
 * in a mode it cannot compute when permission is later denied.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Incident } from '../src/types/index.ts';
import { isRecentIncident, isSortBy, resolveDefaultSort, shouldAutoResolveNearest, sortIncidents } from '../src/lib/feed.ts';

const DOWNTOWN = { lat: 51.0447, lng: -114.0719 };

function incident(over: Partial<Incident> & { id: string }): Incident {
  return {
    title: 'Report',
    description: 'Description',
    category: 'crime',
    neighborhood: 'Beltline',
    lat: DOWNTOWN.lat,
    lng: DOWNTOWN.lng,
    timestamp: 1_700_000_000_000,
    name: 'Ana',
    verified_status: 'unverified',
    report_count: 1,
    ...over,
  } as Incident;
}

const ids = (list: Incident[]) => list.map((i) => i.id);

describe('isSortBy', () => {
  it('accepts every mode the control offers', () => {
    for (const v of ['newest', 'oldest', 'verified', 'nearest']) assert.equal(isSortBy(v), true);
  });

  it('rejects anything else, including junk from localStorage', () => {
    for (const v of ['', 'closest', null, undefined, 7, {}]) assert.equal(isSortBy(v), false);
  });
});

describe('resolveDefaultSort', () => {
  it('honours a valid persisted preference', () => {
    assert.equal(resolveDefaultSort('oldest', true), 'oldest');
    assert.equal(resolveDefaultSort('verified', false), 'verified');
    assert.equal(resolveDefaultSort('nearest', true), 'nearest');
  });

  it('falls back to nearest when nothing is persisted and location is known', () => {
    assert.equal(resolveDefaultSort(null, true), 'nearest');
    assert.equal(resolveDefaultSort('rubbish', true), 'nearest');
  });

  it('falls back to newest when location is unknown', () => {
    assert.equal(resolveDefaultSort(null, false), 'newest');
    assert.equal(resolveDefaultSort('rubbish', false), 'newest');
  });

  it('does not strand the feed in nearest when location is unavailable', () => {
    assert.equal(resolveDefaultSort('nearest', false), 'newest');
  });
});

describe('isRecentIncident', () => {
  const NOW = 1_700_000_000_000;
  const HOUR = 60 * 60 * 1000;

  it('accepts incidents from within the last two hours', () => {
    assert.equal(isRecentIncident(incident({ id: 'a', timestamp: NOW }), NOW), true);
    assert.equal(isRecentIncident(incident({ id: 'b', timestamp: NOW - HOUR }), NOW), true);
    assert.equal(isRecentIncident(incident({ id: 'c', timestamp: NOW - 2 * HOUR }), NOW), true);
  });

  it('rejects incidents older than two hours', () => {
    assert.equal(isRecentIncident(incident({ id: 'd', timestamp: NOW - 2 * HOUR - 1 }), NOW), false);
    assert.equal(isRecentIncident(incident({ id: 'e', timestamp: NOW - 24 * HOUR }), NOW), false);
  });

  it('rejects future-dated incidents — a planned outage that starts tomorrow is not "recent"', () => {
    // Regression: a bare `age <= 2h` check treats a negative age as recent, so
    // planned power outages (timestamped at their future start, up to 48h out)
    // leaked into the "Recent 2h" feed reading "1 day ago".
    assert.equal(isRecentIncident(incident({ id: 'f', timestamp: NOW + HOUR }), NOW), false);
    assert.equal(isRecentIncident(incident({ id: 'g', timestamp: NOW + 24 * HOUR }), NOW), false);
  });
});

describe('shouldAutoResolveNearest', () => {
  it('resolves for a first-time visitor (nothing persisted) at rail', () => {
    assert.equal(shouldAutoResolveNearest(null, true), true);
    assert.equal(shouldAutoResolveNearest('rubbish', true), true);
  });

  it('resolves for a stored nearest that could only have fallen back, at rail', () => {
    assert.equal(shouldAutoResolveNearest('nearest', true), true);
  });

  it('never resolves while the sheet is raised, regardless of what is stored', () => {
    assert.equal(shouldAutoResolveNearest(null, false), false);
    assert.equal(shouldAutoResolveNearest('nearest', false), false);
    assert.equal(shouldAutoResolveNearest('oldest', false), false);
  });

  it('leaves an explicit non-nearest preference alone even at rail', () => {
    assert.equal(shouldAutoResolveNearest('oldest', true), false);
    assert.equal(shouldAutoResolveNearest('newest', true), false);
    assert.equal(shouldAutoResolveNearest('verified', true), false);
  });
});

describe('sortIncidents', () => {
  it('pins emergencies to the top in every mode', () => {
    const list = [
      incident({ id: 'old-crime', timestamp: 1 }),
      incident({ id: 'sos', category: 'emergency', timestamp: 0 }),
      incident({ id: 'new-crime', timestamp: 9 }),
    ];
    for (const mode of ['newest', 'oldest', 'verified', 'nearest'] as const) {
      assert.equal(ids(sortIncidents(list, mode, DOWNTOWN))[0], 'sos', mode);
    }
  });

  it('orders by recency for newest and reverses it for oldest', () => {
    const list = [
      incident({ id: 'b', timestamp: 200 }),
      incident({ id: 'a', timestamp: 100 }),
      incident({ id: 'c', timestamp: 300 }),
    ];
    assert.deepEqual(ids(sortIncidents(list, 'newest', null)), ['c', 'b', 'a']);
    assert.deepEqual(ids(sortIncidents(list, 'oldest', null)), ['a', 'b', 'c']);
  });

  it('orders by verification strength, then recency', () => {
    const list = [
      incident({ id: 'unverified', verified_status: 'unverified', timestamp: 300 }),
      incident({ id: 'confirmed', verified_status: 'community_confirmed', timestamp: 100 }),
      incident({ id: 'multiple', verified_status: 'multiple_reports', timestamp: 200 }),
    ];
    assert.deepEqual(ids(sortIncidents(list, 'verified', null)), ['confirmed', 'multiple', 'unverified']);
  });

  it('orders by true distance from the reader', () => {
    const list = [
      incident({ id: 'far', lat: 51.29, lng: -114.01 }),
      incident({ id: 'near', lat: 51.045, lng: -114.072 }),
      incident({ id: 'mid', lat: 51.09, lng: -114.13 }),
    ];
    assert.deepEqual(ids(sortIncidents(list, 'nearest', DOWNTOWN)), ['near', 'mid', 'far']);
  });

  it('degrades nearest to newest when location is unknown, without throwing', () => {
    const list = [
      incident({ id: 'a', timestamp: 100, lat: 51.045, lng: -114.072 }),
      incident({ id: 'b', timestamp: 200, lat: 51.29, lng: -114.01 }),
    ];
    assert.deepEqual(ids(sortIncidents(list, 'nearest', null)), ['b', 'a']);
  });

  it('breaks distance ties by recency', () => {
    const list = [
      incident({ id: 'older', timestamp: 100 }),
      incident({ id: 'newer', timestamp: 200 }),
    ];
    assert.deepEqual(ids(sortIncidents(list, 'nearest', DOWNTOWN)), ['newer', 'older']);
  });

  it('does not mutate the list it is given', () => {
    const list = [incident({ id: 'a', timestamp: 100 }), incident({ id: 'b', timestamp: 200 })];
    const before = ids(list);
    sortIncidents(list, 'newest', DOWNTOWN);
    assert.deepEqual(ids(list), before);
  });
});
