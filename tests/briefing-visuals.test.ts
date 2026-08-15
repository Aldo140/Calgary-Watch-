/**
 * Geometry behind the briefing's plan view, the assessment sparkline, and the
 * traffic-volume join.
 *
 * The plan view claims a dot sits at a report's real bearing and real distance
 * from someone's home. That is a strong claim to make about a person's own
 * street, so the maths is pinned down here rather than eyeballed.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bearingDegrees, plotPoint } from '../src/components/BriefingRadar.tsx';
import { buildPath, totalChangePct } from '../src/components/BriefingSparkline.tsx';
import { segmentMidpoint, volumeAt, normalizeVolumes } from '../src/hooks/useTrafficVolumes.ts';

const HOME = { lat: 51.0447, lng: -114.0719 };

describe('bearingDegrees', () => {
  it('reads north as 0 and south as 180', () => {
    assert.ok(Math.abs(bearingDegrees(HOME.lat, HOME.lng, HOME.lat + 0.01, HOME.lng)) < 0.5);
    assert.ok(Math.abs(bearingDegrees(HOME.lat, HOME.lng, HOME.lat - 0.01, HOME.lng) - 180) < 0.5);
  });

  it('reads east as 90 and west as 270', () => {
    assert.ok(Math.abs(bearingDegrees(HOME.lat, HOME.lng, HOME.lat, HOME.lng + 0.01) - 90) < 0.5);
    assert.ok(Math.abs(bearingDegrees(HOME.lat, HOME.lng, HOME.lat, HOME.lng - 0.01) - 270) < 0.5);
  });

  it('always returns a positive bearing, never a negative one', () => {
    for (const [dLat, dLng] of [[1, -1], [-1, -1], [-1, 1], [1, 1]] as const) {
      const b = bearingDegrees(HOME.lat, HOME.lng, HOME.lat + dLat * 0.01, HOME.lng + dLng * 0.01);
      assert.ok(b >= 0 && b < 360, `bearing out of range: ${b}`);
    }
  });
});

describe('plotPoint', () => {
  const SIZE = 200;
  const CENTRE = 100;

  it('puts the address itself at the centre', () => {
    const p = plotPoint(0, 0, 400, SIZE);
    assert.equal(Math.round(p.x), CENTRE);
    assert.equal(Math.round(p.y), CENTRE);
  });

  it('puts due north at the top and due east at the right', () => {
    const north = plotPoint(400, 0, 400, SIZE);
    assert.equal(Math.round(north.x), CENTRE);
    assert.ok(north.y < CENTRE, 'north must be above the centre');

    const east = plotPoint(400, 90, 400, SIZE);
    assert.ok(east.x > CENTRE, 'east must be right of the centre');
    assert.equal(Math.round(east.y), CENTRE);
  });

  it('scales linearly, so the picture stays truthful', () => {
    const near = plotPoint(100, 90, 400, SIZE);
    const far = plotPoint(200, 90, 400, SIZE);
    assert.ok(Math.abs((far.x - CENTRE) - 2 * (near.x - CENTRE)) < 0.01);
  });

  it('clamps beyond the ring rather than drawing outside it', () => {
    const edge = plotPoint(400, 90, 400, SIZE);
    const past = plotPoint(4000, 90, 400, SIZE);
    assert.equal(past.x, edge.x);
  });
});

describe('sparkline', () => {
  it('baselines on the lowest year, not zero, so movement is visible', () => {
    // With a zero baseline these three values would be a flat line near the top.
    const d = buildPath([500_000, 550_000, 600_000], 100, 50);
    const ys = [...d.matchAll(/[ML]\S+ (\S+)/g)].map((m) => parseFloat(m[1]));
    assert.ok(Math.max(...ys) - Math.min(...ys) > 30, `range too flat: ${ys}`);
  });

  it('draws left to right across the full width', () => {
    const d = buildPath([1, 2, 3], 100, 50, 4);
    assert.ok(d.startsWith('M4.0'));
    assert.ok(d.includes('L96.0'));
  });

  it('returns nothing for a series too short to have a direction', () => {
    assert.equal(buildPath([1], 100, 50), '');
    assert.equal(totalChangePct([1]), null);
  });

  it('reports total change across the series', () => {
    assert.equal(totalChangePct([100, 150]), 50);
    assert.equal(totalChangePct([200, 100]), -50);
  });

  it('does not divide by zero on a zero first year', () => {
    assert.equal(totalChangePct([0, 100]), null);
  });
});

describe('traffic volumes', () => {
  it('reads a segment midpoint as [lng, lat]', () => {
    const mid = segmentMidpoint([[[-114.09, 50.97], [-114.08, 50.98], [-114.07, 50.99]]]);
    assert.equal(mid?.lat, 50.98);
    assert.equal(mid?.lng, -114.08);
  });

  it('returns null for empty geometry rather than plotting null island', () => {
    assert.equal(segmentMidpoint(undefined), null);
    assert.equal(segmentMidpoint([[]]), null);
  });

  it('drops rows with no usable volume', () => {
    assert.equal(normalizeVolumes([
      { section_name: 'A', volume: '0', multilinestring: { coordinates: [[[-114, 51]]] } },
      { section_name: 'B', volume: 'x', multilinestring: { coordinates: [[[-114, 51]]] } },
      { section_name: 'C', volume: '1000' },
    ]).length, 0);
  });

  it('only quotes a volume when the camera sits on the counted segment', () => {
    const volumes = [{ section: 'NEAR', volume: 11_000, lat: 51.0413, lng: -114.0584 }];
    assert.equal(volumeAt(51.0412, -114.0584, volumes), 11_000);
    // A kilometre away is a different road; claiming this number would be a fabrication.
    assert.equal(volumeAt(51.0500, -114.0584, volumes), null);
  });

  it('picks the nearest segment when several are in range', () => {
    const volumes = [
      { section: 'FAR', volume: 5_000, lat: 51.0422, lng: -114.0584 },
      { section: 'NEAR', volume: 9_000, lat: 51.0413, lng: -114.0584 },
    ];
    assert.equal(volumeAt(51.0412, -114.0584, volumes), 9_000);
  });
});
