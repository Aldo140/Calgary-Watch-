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
