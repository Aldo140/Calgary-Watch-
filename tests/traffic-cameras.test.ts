/**
 * Traffic camera normalisation.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractCameraUrl, normalizeCameras, toSecureImageUrl } from '../src/hooks/useTrafficCameras.js';

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
