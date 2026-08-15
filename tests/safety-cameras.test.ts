/**
 * Intersection safety camera parsing.
 *
 * The 57 published records use at least eight different shapes to express the
 * same two facts. Every fixture below is copied verbatim from dv2f-necx; a
 * parser that only handles the common `\nDirection:` form silently drops
 * cameras, and a dropped enforcement camera is exactly the one a driver needed
 * to know about.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseCameraDescription,
  normalizeSafetyCameras,
  findSafetyCamerasNear,
} from '../src/hooks/useSafetyCameras.ts';

const LIVE_DESCRIPTIONS = [
  'Macleod Trail and 12 Avenue S.E.\nDirection: Northbound',
  '14 Street and Heritage Drive S.W.Direction: Northbound',
  '11 Avenue & 4 Street SW Westbound',
  '52 ST & Peigan TR SE SB',
  'Country Hills BV & Shaganappi TR NW NB',
  'Crowchild Trail and 12 Mile Coulee Road NW Direction: Eastbound',
  'Macleod Tr SW and 58 Av SW Direction : Southbound',
  'Macleod Tr SW and Southland Dr SW Direction:Southbound',
  '1 Street and 17 Avenue S.E. \nDirection: Southbound',
];

describe('parseCameraDescription', () => {
  it('resolves a direction for every published shape', () => {
    for (const raw of LIVE_DESCRIPTIONS) {
      const { intersection, direction } = parseCameraDescription(raw);
      assert.ok(intersection.length > 0, `no intersection from ${JSON.stringify(raw)}`);
      assert.ok(direction.length > 0, `no direction from ${JSON.stringify(raw)}`);
    }
  });

  it('expands the abbreviated forms', () => {
    assert.equal(parseCameraDescription('52 ST & Peigan TR SE SB').direction, 'Southbound');
    assert.equal(parseCameraDescription('Country Hills BV & Shaganappi TR NW NB').direction, 'Northbound');
  });

  it('normalises "&" to "and" so both spellings read alike', () => {
    assert.equal(
      parseCameraDescription('11 Avenue & 4 Street SW Westbound').intersection,
      '11 Avenue and 4 Street SW',
    );
  });

  it('keeps the direction out of the intersection', () => {
    const { intersection } = parseCameraDescription('14 Street and Heritage Drive S.W.Direction: Northbound');
    assert.equal(intersection, '14 Street and Heritage Drive S.W.');
    assert.ok(!/Direction/i.test(intersection));
  });

  it('keeps the record when there is no direction at all', () => {
    const { intersection, direction } = parseCameraDescription('Some Road and Another Road NW');
    assert.equal(intersection, 'Some Road and Another Road NW');
    assert.equal(direction, '');
  });

  it('survives an empty description', () => {
    assert.deepEqual(parseCameraDescription(''), { intersection: '', direction: '' });
  });
});

describe('normalizeSafetyCameras', () => {
  const row = (description: string, coordinates: [number, number]) => ({
    description, quadrant: 'SE', community: 'BELTLINE', ward: '11',
    point: { type: 'Point', coordinates },
  });

  it('reads GeoJSON as [lng, lat] — reversing it puts Calgary in Somalia', () => {
    const [cam] = normalizeSafetyCameras([row('A and B SE Northbound', [-114.058, 51.041])]);
    assert.equal(cam.lat, 51.041);
    assert.equal(cam.lng, -114.058);
  });

  it('gives opposing cameras at one intersection distinct ids', () => {
    const cams = normalizeSafetyCameras([
      row('A and B SE Northbound', [-114.058, 51.041]),
      row('A and B SE Southbound', [-114.058, 51.041]),
    ]);
    assert.equal(cams.length, 2);
    assert.notEqual(cams[0].id, cams[1].id);
  });

  it('drops rows with no usable point rather than plotting them at null island', () => {
    assert.equal(normalizeSafetyCameras([
      { description: 'A and B SE Northbound' },
      { description: 'C and D SE Northbound', point: { coordinates: [NaN, 51] } as never },
    ]).length, 0);
  });
});

describe('findSafetyCamerasNear', () => {
  const cameras = normalizeSafetyCameras([
    { description: 'Close and St SE Northbound', point: { coordinates: [-114.0584, 51.0413] } },
    { description: 'Far and Ave NW Westbound', point: { coordinates: [-114.20, 51.15] } },
  ] as never);

  it('returns only cameras inside the radius, nearest first', () => {
    const found = findSafetyCamerasNear(51.0412, -114.0584, cameras, 1000);
    assert.equal(found.length, 1);
    assert.equal(found[0].camera.intersection, 'Close and St SE');
    assert.ok(found[0].distanceM < 100);
  });

  it('returns nothing when the radius excludes everything', () => {
    assert.equal(findSafetyCamerasNear(51.0412, -114.0584, cameras, 10).length, 0);
  });
});
