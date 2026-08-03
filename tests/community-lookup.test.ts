/**
 * Point-in-polygon community resolution tests.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  findCommunityAt,
  normalizeCalgaryAddress,
  pointInPolygon,
  pointInRing,
  toCommunityBoundary,
} from '../src/lib/communityLookup.js';

describe('normalizeCalgaryAddress', () => {
  it('strips ordinal suffixes the geocoder cannot handle', () => {
    // "1624 16th Ave SW" returns no geocode result; "1624 16 Ave SW" resolves.
    assert.equal(normalizeCalgaryAddress('1624 16th Ave SW'), '1624 16 Ave SW');
    assert.equal(normalizeCalgaryAddress('101 1st Street NE'), '101 1 Street NE');
    assert.equal(normalizeCalgaryAddress('22 2nd Ave NW'), '22 2 Ave NW');
    assert.equal(normalizeCalgaryAddress('33 3rd Ave SE'), '33 3 Ave SE');
  });

  it('leaves non-numeric words containing those letters alone', () => {
    assert.equal(normalizeCalgaryAddress('12 Strathcona Blvd SW'), '12 Strathcona Blvd SW');
    assert.equal(normalizeCalgaryAddress('9 Northmount Dr NW'), '9 Northmount Dr NW');
  });

  it('collapses stray whitespace', () => {
    assert.equal(normalizeCalgaryAddress('  1624   16th  Ave SW '), '1624 16 Ave SW');
  });
});

/** Square from (0,0) to (10,10) in [lng, lat] order. */
const SQUARE: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];

/** Square with a hole in the middle (4,4)-(6,6). */
const HOLE: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];

function boundaryRow(name: string, coordinates: unknown, type = 'MultiPolygon') {
  return { name, multipolygon: { type, coordinates } };
}

describe('pointInRing', () => {
  it('detects points inside and outside', () => {
    assert.equal(pointInRing(5, 5, SQUARE), true);
    assert.equal(pointInRing(15, 5, SQUARE), false);
    assert.equal(pointInRing(-1, 5, SQUARE), false);
  });
});

describe('pointInPolygon', () => {
  it('excludes points that fall inside a hole', () => {
    const polygon = [SQUARE, HOLE];
    assert.equal(pointInPolygon(2, 2, polygon), true, 'inside outer, outside hole');
    assert.equal(pointInPolygon(5, 5, polygon), false, 'inside the hole is outside the polygon');
  });
});

describe('toCommunityBoundary', () => {
  it('lowercases the name so it matches the crimeStats key space', () => {
    const boundary = toCommunityBoundary(boundaryRow('SUNALTA', [[SQUARE]]));
    assert.equal(boundary?.name, 'sunalta');
  });

  it('accepts Polygon as well as MultiPolygon geometry', () => {
    assert.ok(toCommunityBoundary(boundaryRow('beltline', SQUARE_POLYGON(), 'Polygon')));
  });

  it('computes a bounding box covering the geometry', () => {
    const boundary = toCommunityBoundary(boundaryRow('x', [[SQUARE]]));
    assert.deepEqual(boundary?.bbox, [0, 0, 10, 10]);
  });

  it('rejects rows without a usable name or geometry', () => {
    assert.equal(toCommunityBoundary(null), null);
    assert.equal(toCommunityBoundary({ name: 'no geometry' }), null);
    assert.equal(toCommunityBoundary(boundaryRow('', [[SQUARE]])), null);
    assert.equal(toCommunityBoundary({ name: 'bad', multipolygon: { type: 'Point', coordinates: [1, 2] } }), null);
  });

  function SQUARE_POLYGON() {
    return [SQUARE];
  }
});

describe('findCommunityAt', () => {
  const boundaries = [
    toCommunityBoundary(boundaryRow('west side', [[[[0, 0], [5, 0], [5, 10], [0, 10], [0, 0]]]]))!,
    toCommunityBoundary(boundaryRow('east side', [[[[5, 0], [10, 0], [10, 10], [5, 10], [5, 0]]]]))!,
  ];

  it('returns the community containing the point', () => {
    // findCommunityAt takes (lat, lng); rings are [lng, lat].
    assert.equal(findCommunityAt(5, 2, boundaries), 'west side');
    assert.equal(findCommunityAt(5, 8, boundaries), 'east side');
  });

  it('returns null for a point outside every community', () => {
    // An address in Airdrie should not be forced into a Calgary community.
    assert.equal(findCommunityAt(50, 50, boundaries), null);
  });

  it('returns null for non-finite coordinates', () => {
    assert.equal(findCommunityAt(Number.NaN, 2, boundaries), null);
    assert.equal(findCommunityAt(5, Number.POSITIVE_INFINITY, boundaries), null);
  });

  it('handles an empty boundary list without throwing', () => {
    assert.equal(findCommunityAt(5, 2, []), null);
  });
});
