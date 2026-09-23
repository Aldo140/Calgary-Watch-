import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mix, moonPhase, moonPath, skyPalette, sunPosition } from '../src/lib/sky';

describe('live sky astronomy', () => {
  it('puts the sun near 39° due south at Calgary solar noon on the equinox', () => {
    const { altitude, azimuth } = sunPosition(new Date('2026-09-23T19:26:00Z'));
    assert.ok(Math.abs(altitude - 38.9) < 1.5, `altitude ${altitude}`);
    assert.ok(Math.abs(azimuth - 180) < 3, `azimuth ${azimuth}`);
  });

  it('puts it well below the horizon at local midnight', () => {
    assert.ok(sunPosition(new Date('2026-09-24T07:26:00Z')).altitude < -30);
  });

  it('crosses the horizon around a known Calgary sunset', () => {
    // Sunset in Calgary on 2026-06-21 is about 21:58 MDT (03:58 UTC next day).
    assert.ok(sunPosition(new Date('2026-06-22T03:40:00Z')).altitude > 0);
    assert.ok(sunPosition(new Date('2026-06-22T04:20:00Z')).altitude < 0);
  });

  it('knows a real full moon (2026-03-03) and new moon (2026-02-17)', () => {
    assert.ok(Math.abs(moonPhase(new Date('2026-03-03T11:38:00Z')) - 0.5) < 0.03);
    const n = moonPhase(new Date('2026-02-17T12:01:00Z'));
    assert.ok(n < 0.03 || n > 0.97, `phase ${n}`);
  });

  it('draws a closed moon path for every phase', () => {
    for (const p of [0.02, 0.25, 0.5, 0.75, 0.98]) assert.match(moonPath(p, 10, 10, 5), /^M.*Z$/);
  });

  it('picks ink that reads on the sky, and greys an overcast day', () => {
    assert.equal(skyPalette(30).tone, 'dark');
    assert.equal(skyPalette(-10).tone, 'light');
    assert.equal(skyPalette(-20).darkness, 1);
    assert.notEqual(skyPalette(30, 100).top, skyPalette(30, 0).top);
    assert.equal(skyPalette(-20, 100).top, skyPalette(-20, 0).top); // no grey-out at night
  });
});

describe('sky colour mixing', () => {
  it('accepts short and long hex (a short one once rendered buildings black)', () => {
    assert.equal(mix('#000', '#ffffff', 0), '#000000');
    assert.equal(mix('#000000', '#fff', 1), '#ffffff');
    assert.equal(mix('#102030', '#305070', 0.5), '#203850');
  });
});
