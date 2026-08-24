/**
 * Regression tests for the 511 Alberta mapper.
 *
 * The source silently produced zero incidents for weeks because it was written
 * against a response shape the API does not return. These fixtures are copied
 * verbatim from the live endpoint.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

import { clampToNow } from '../scripts/ingest/sources/511-alberta.js';

const SRC = readFileSync('scripts/ingest/sources/511-alberta.ts', 'utf8');

/** Real record from https://511.alberta.ca/api/v2/get/event */
const LIVE_EVENT = {
  ID: 7,
  SourceId: '57604',
  RoadwayName: 'Deerfoot Trl',
  Description: 'Construction Work on Deerfoot Trl Both Directions from South',
  Reported: 1723917420,
  StartDate: 1723917420,
  PlannedEndDate: null,
  Latitude: 51.0447,
  Longitude: -114.0719,
  EventType: 'roadwork',
  EventSubType: 'constructionWork',
  IsFullClosure: false,
  Severity: 'None',
};

describe('511 Alberta source shape', () => {
  it('requires the official developer key and uses documented parameters', () => {
    assert.match(SRC, /process\.env\.ALBERTA_511_API_KEY/);
    assert.match(SRC, /searchParams\.set\('lang', 'en'\)/);
    assert.match(SRC, /searchParams\.set\('key', apiKey\)/);
    assert.doesNotMatch(SRC, /lang=English/);
  });

  it('reads flat Latitude/Longitude, not a GeoJSON Geography object', () => {
    // The original bug: every record was dropped because Geography is absent.
    assert.match(SRC, /event\.Latitude/);
    assert.match(SRC, /event\.Longitude/);
    assert.doesNotMatch(SRC, /event\.Geography/);
  });

  it('does not filter on fields the API never returns', () => {
    for (const absent of [/event\.Status/, /event\.Headline/, /event\.Area/, /ExpectedEndDate\b(?!.*never)/]) {
      const body = SRC.slice(SRC.indexOf('export async function'));
      assert.doesNotMatch(body, absent, `mapper must not read ${absent}`);
    }
  });

  it('treats PlannedEndDate as Unix seconds', () => {
    assert.match(SRC, /PlannedEndDate \* 1000/);
  });

  it('the live fixture has the fields the mapper depends on', () => {
    assert.equal(typeof LIVE_EVENT.Latitude, 'number');
    assert.equal(typeof LIVE_EVENT.Longitude, 'number');
    assert.equal('Geography' in LIVE_EVENT, false);
    assert.equal('Status' in LIVE_EVENT, false);
  });
});

describe('511 Alberta categorisation', () => {
  it('files roadwork as infrastructure and incidents as traffic', () => {
    // Construction on Deerfoot is not a traffic *incident*; it is infrastructure.
    assert.match(SRC, /roadwork.*infrastructure|infrastructure.*roadwork/s);
  });

  it('still recognises weather events', () => {
    assert.match(SRC, /'weather'/);
  });
});

describe('clampToNow', () => {
  const NOW = 1_700_000_000_000;

  it('leaves a past report time untouched', () => {
    assert.equal(clampToNow(NOW - 3_600_000, NOW), NOW - 3_600_000);
  });

  it('clamps a future report time to now', () => {
    // 511 publishes planned work: a restriction scheduled for next week
    // carries a StartDate days ahead of the ingest run.
    assert.equal(clampToNow(NOW + 4 * 86_400_000, NOW), NOW);
  });

  it('stops planned work outranking reports filed after the ingest run', () => {
    // The feed is ordered newest-first with a page limit. Unclamped, a
    // restriction planned for next week outranks every report filed between
    // now and then, pushing genuine community posts out of the loaded window.
    const raw = NOW + 5 * 86_400_000;          // planned five days out
    const filedTomorrow = NOW + 86_400_000;    // a neighbour reports a day later

    assert.ok(raw > filedTomorrow, 'unclamped, planned work buries the later report');
    assert.ok(clampToNow(raw, NOW) < filedTomorrow, 'clamped, the real report wins');
  });
});
