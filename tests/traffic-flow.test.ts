import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  containsForbiddenTrafficIdentity,
  makeTrafficFlowSnapshot,
  normalizeAnnualTrafficVolumes,
  normalizeTrafficProviderPayload,
  parseTrafficFlowSnapshot,
  trafficConditionFromSpeeds,
} from '../src/lib/trafficFlow.js';

const geometry = {
  type: 'LineString',
  coordinates: [[-114.08, 51.04], [-114.07, 51.05], [-114.06, 51.06]],
};

describe('aggregate traffic privacy boundary', () => {
  it('recognizes identity and trajectory fields recursively', () => {
    assert.equal(containsForbiddenTrafficIdentity({ deviceId: 'abc' }), true);
    assert.equal(containsForbiddenTrafficIdentity({ metadata: { license_plate: 'ABC123' } }), true);
    assert.equal(containsForbiddenTrafficIdentity({ speedKph: 42, vehicleCount: 12 }), false);
  });

  it('drops an entire provider segment when it contains an identity field', () => {
    const segments = normalizeTrafficProviderPayload([
      { segmentId: 'safe', name: 'Safe Road', geometry, speedKph: 35, freeFlowKph: 50 },
      { segmentId: 'unsafe', name: 'Unsafe Road', geometry, speedKph: 20, vehicle_id: 'car-9' },
    ]);
    assert.deepEqual(segments.map((segment) => segment.id), ['safe']);
    assert.equal('vehicle_id' in segments[0], false);
  });
});

describe('traffic flow normalization', () => {
  it('classifies speed relative to free flow', () => {
    assert.equal(trafficConditionFromSpeeds(45, 50), 'free');
    assert.equal(trafficConditionFromSpeeds(30, 50), 'moderate');
    assert.equal(trafficConditionFromSpeeds(20, 50), 'heavy');
    assert.equal(trafficConditionFromSpeeds(8, 50), 'stopped');
    assert.equal(trafficConditionFromSpeeds(null, 50), 'unknown');
  });

  it('accepts GeoJSON and stores Leaflet coordinate order', () => {
    const [segment] = normalizeTrafficProviderPayload({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature', geometry,
        properties: { segmentId: 'memorial-1', name: 'Memorial Drive', speedKph: 32, freeFlowKph: 60 },
      }],
    }, 1000);
    assert.deepEqual(segment.geometry[0], [51.04, -114.08]);
    assert.equal(segment.condition, 'moderate');
    assert.equal(segment.updatedAt, 1000);
  });

  it('round-trips the public snapshot contract', () => {
    const segments = normalizeTrafficProviderPayload([
      { segmentId: 'one', name: 'One Street', geometry, speedKph: 25, freeFlowKph: 50 },
    ], 2000);
    const snapshot = makeTrafficFlowSnapshot(segments, 'Test provider', 2000);
    assert.deepEqual(parseTrafficFlowSnapshot(snapshot), snapshot);
  });

  it('turns annual volumes into a clearly labelled baseline', () => {
    const segments = normalizeAnnualTrafficVolumes([
      { section_name: '1 AV SW', volume: '12000', multilinestring: { type: 'MultiLineString', coordinates: [[[-114.08, 51.04], [-114.07, 51.05]]] } },
    ], 3000);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].mode, 'baseline');
    assert.equal(segments[0].condition, 'unknown');
    assert.equal(segments[0].annualDailyVolume, 12000);
  });
});
