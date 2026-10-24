import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isSetElsewhere,
  locateInText,
  pointsFromBoundaries,
  shortlistPoints,
} from '../scripts/ingest/sources/community-locator.js';
import { classifyText } from '../scripts/ingest/sources/rss.js';

const square = (lng: number, lat: number) => ({
  type: 'MultiPolygon',
  coordinates: [[[[lng, lat], [lng + 0.01, lat], [lng + 0.01, lat + 0.01], [lng, lat + 0.01], [lng, lat]]]],
});
const CITY = pointsFromBoundaries([
  { name: 'MARLBOROUGH', multipolygon: square(-113.97, 51.05) },
  { name: 'MARLBOROUGH PARK', multipolygon: square(-113.96, 51.04) },
  { name: 'LEGACY', multipolygon: square(-114.0, 50.87) },
  { name: 'SHERWOOD', multipolygon: square(-114.13, 51.17) },
  { name: 'RUNDLE', multipolygon: square(-113.95, 51.07) },
]);
const POINTS = [...shortlistPoints(), ...CITY];

describe('news and police locator', () => {
  it('places stories in communities the shortlist never knew', () => {
    assert.equal(locateInText('Man charged after stabbing in Marlborough on Tuesday', POINTS)?.neighborhood, 'Marlborough');
    assert.equal(locateInText('Break-in at a Marlborough Park home', POINTS)?.neighborhood, 'Marlborough Park');
  });

  it('needs a place cue for names that are ordinary words', () => {
    assert.equal(locateInText('A legacy of violence, police say', POINTS), null);
    assert.equal(locateInText('Police investigate shooting in Legacy', POINTS)?.neighborhood, 'Legacy');
    assert.equal(locateInText('Rundle community hit by thefts', POINTS)?.neighborhood, 'Rundle');
  });

  it('does not mistake Sherwood Park for Sherwood', () => {
    assert.equal(locateInText('Robbery in Sherwood Park', POINTS), null);
    assert.ok(isSetElsewhere('Sherwood Park man charged', 'Sherwood Park man charged after an RCMP investigation'));
    assert.ok(!isSetElsewhere('Calgary man charged in Edmonton fraud', 'Calgary police said'));
  });

  it('falls back to a named quadrant and never invents one', () => {
    assert.equal(locateInText('Fire tears through southeast Calgary strip mall', POINTS)?.neighborhood, 'Southeast Calgary');
    assert.equal(locateInText('Province announces new policing grant', POINTS), null);
  });
});

describe('news classifier', () => {
  it('files a traffic death as traffic even when police are quoted', () => {
    assert.equal(classifyText('70-year-old man struck and killed on Deerfoot Trail shoulder', 'Calgary police say a pick-up hit him.'), 'traffic');
  });

  it('files offences as crime and skips court and opinion pieces', () => {
    assert.equal(classifyText('Youth charged in armed robberies', ''), 'crime');
    assert.equal(classifyText('Police seek suspect after downtown assault', ''), 'crime');
    assert.equal(classifyText('Man sentenced for 2023 murder', ''), null);
  });
});
