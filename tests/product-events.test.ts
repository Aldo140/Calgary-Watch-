/**
 * Product-event sanitization.
 *
 * The activation funnel needs to know *that* a report was viewed or feedback
 * added, never *where* someone lives or *what* they wrote. sanitizeEventProps
 * is the gate: it strips anything that could identify a place or a person and
 * coarsens distance into a band, so a leak is impossible by construction rather
 * than by reviewer vigilance.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sanitizeEventProps } from '../src/lib/productEvents.ts';

describe('sanitizeEventProps', () => {
  it('drops address, text and raw coordinates', () => {
    const out = sanitizeEventProps({
      address: '123 Main St',
      description: 'someone broke in',
      title: 'Break-in',
      name: 'Ana',
      email: 'a@b.ca',
      lat: 51.04,
      lng: -114.07,
      section: 'community',
    });
    assert.deepEqual(out, { section: 'community' });
  });

  it('buckets a distance into a coarse band, never a raw metre value', () => {
    assert.equal(sanitizeEventProps({ distanceM: 240 }).distanceBucket, '0-500m');
    assert.equal(sanitizeEventProps({ distanceM: 700 }).distanceBucket, '500m-1km');
    assert.equal(sanitizeEventProps({ distanceM: 1500 }).distanceBucket, '1-2km');
    assert.equal(sanitizeEventProps({ distanceM: 5000 }).distanceBucket, '2km+');
    assert.equal(sanitizeEventProps({ distanceM: 240 }).distanceM, undefined);
  });

  it('keeps short enum-like strings and finite numbers', () => {
    assert.deepEqual(sanitizeEventProps({ kind: 'saw_it', count: 3 }), { kind: 'saw_it', count: 3 });
  });

  it('drops over-long strings that could smuggle free text', () => {
    const out = sanitizeEventProps({ note: 'x'.repeat(40), section: 'official' });
    assert.deepEqual(out, { section: 'official' });
  });

  it('drops non-finite numbers', () => {
    assert.deepEqual(sanitizeEventProps({ count: Number.NaN, ratio: Infinity }), {});
  });
});
