/**
 * Traffic camera normalisation.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  extractCameraUrl, normalizeCameras, toSecureImageUrl, findNearestCamera, distanceMeters,
} from '../src/hooks/useTrafficCameras.js';

// Shape copied verbatim from data.calgary.ca/resource/k7p9-kppz.json
const LIVE_ROW = {
  camera_url: { url: 'http://trafficcam.calgary.ca/loc75.jpg', description: 'Camera 76' },
  point: { coordinates: [-114.0786008, 51.04882] as [number, number] },
  camera_location: '5 Avenue / 7 Street SW',
  quadrant: 'SW',
};

describe('toSecureImageUrl', () => {
  it('upgrades the http URL the dataset stores', () => {
    // The page is served over HTTPS, so an http image is blocked as mixed
    // content. The host answers https correctly.
    assert.equal(
      toSecureImageUrl('http://trafficcam.calgary.ca/loc75.jpg'),
      'https://trafficcam.calgary.ca/loc75.jpg',
    );
  });

  it('leaves an already secure URL alone', () => {
    assert.equal(
      toSecureImageUrl('https://trafficcam.calgary.ca/loc75.jpg'),
      'https://trafficcam.calgary.ca/loc75.jpg',
    );
  });
});

describe('extractCameraUrl', () => {
  it('reads the Socrata URL column when it arrives as an object', () => {
    assert.equal(extractCameraUrl(LIVE_ROW.camera_url), 'https://trafficcam.calgary.ca/loc75.jpg');
  });

  it('reads it when it arrives as a stringified record', () => {
    const raw = "{'url': 'http://trafficcam.calgary.ca/loc12.jpg', 'description': 'Camera 13'}";
    assert.equal(extractCameraUrl(raw), 'https://trafficcam.calgary.ca/loc12.jpg');
  });

  it('returns null rather than a broken image source', () => {
    assert.equal(extractCameraUrl(undefined), null);
    assert.equal(extractCameraUrl('no url in here'), null);
  });
});

describe('normalizeCameras', () => {
  it('maps GeoJSON coordinates the right way round', () => {
    // GeoJSON is [lng, lat]. Reversing it puts every Calgary camera in Somalia.
    const [cam] = normalizeCameras([LIVE_ROW]);
    assert.ok(cam.lat > 50 && cam.lat < 52, `latitude should be Calgary, got ${cam.lat}`);
    assert.ok(cam.lng < -113 && cam.lng > -115, `longitude should be Calgary, got ${cam.lng}`);
  });

  it('carries the location and quadrant through', () => {
    const [cam] = normalizeCameras([LIVE_ROW]);
    assert.equal(cam.location, '5 Avenue / 7 Street SW');
    assert.equal(cam.quadrant, 'SW');
  });

  it('drops rows that cannot be plotted instead of emitting bad markers', () => {
    assert.equal(normalizeCameras([{ camera_url: LIVE_ROW.camera_url }]).length, 0);
    assert.equal(normalizeCameras([{ point: LIVE_ROW.point }]).length, 0);
  });
});

describe('findNearestCamera', () => {
  const CAMS = normalizeCameras([
    { camera_url: { url: 'http://trafficcam.calgary.ca/a.jpg' },
      point: { coordinates: [-114.0786, 51.0488] }, camera_location: 'Close corner', quadrant: 'SW' },
    { camera_url: { url: 'http://trafficcam.calgary.ca/b.jpg' },
      point: { coordinates: [-114.1500, 51.1200] }, camera_location: 'Across town', quadrant: 'NW' },
  ]);

  it('picks the closest camera and reports the distance', () => {
    const hit = findNearestCamera(51.0489, -114.0787, CAMS);
    assert.ok(hit, 'expected a nearby camera');
    assert.equal(hit.camera.location, 'Close corner');
    assert.ok(hit.distanceM < 100, `expected a short distance, got ${Math.round(hit.distanceM)}m`);
  });

  it('returns nothing when the nearest camera is a different intersection', () => {
    // Beyond the radius a camera points somewhere else entirely, and showing it
    // beside a report would imply a connection that does not exist.
    assert.equal(findNearestCamera(51.0000, -114.0000, CAMS), null);
  });

  it('respects the proximity limit exactly', () => {
    const far = findNearestCamera(51.0489, -114.0787, CAMS, 1);
    assert.equal(far, null, 'a 1m radius must exclude a camera ~10m away');
  });

  it('measures real Calgary distances sanely', () => {
    // Calgary Tower to the Saddledome is roughly 1.2km.
    const d = distanceMeters(51.0447, -114.0631, 51.0374, -114.0519);
    assert.ok(d > 900 && d < 1600, `expected ~1.2km, got ${Math.round(d)}m`);
  });
});
