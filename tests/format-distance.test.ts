/**
 * Distance formatting for the mobile feed row.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatDistance, formatRelativeTime } from '../src/lib/format.ts';

describe('formatDistance', () => {
  it('states sub-kilometre distances in metres, rounded to ten', () => {
    assert.equal(formatDistance(0.4), '400 m');
    assert.equal(formatDistance(0.404), '400 m');
    assert.equal(formatDistance(0.437), '440 m');
  });

  it('rounds away GPS jitter rather than implying precision the pin lacks', () => {
    assert.equal(formatDistance(0.4031), '400 m');
    assert.equal(formatDistance(0.4069), '410 m');
  });

  it('promotes to kilometres once rounding would reach 1000 m', () => {
    assert.equal(formatDistance(0.996), '1.0 km');
  });

  it('uses one decimal between one and ten kilometres', () => {
    assert.equal(formatDistance(1.24), '1.2 km');
    assert.equal(formatDistance(9.95), '10.0 km');
  });

  it('uses whole kilometres past ten', () => {
    assert.equal(formatDistance(12), '12 km');
    assert.equal(formatDistance(12.4), '12 km');
    assert.equal(formatDistance(147.6), '148 km');
  });

  it('says "here" rather than "0 m" when the reader is on top of it', () => {
    assert.equal(formatDistance(0), 'here');
    assert.equal(formatDistance(0.004), 'here');
  });

  it('returns an empty string for values it cannot state', () => {
    assert.equal(formatDistance(Number.NaN), '');
    assert.equal(formatDistance(Number.POSITIVE_INFINITY), '');
    assert.equal(formatDistance(-1), '');
  });
});

describe('formatRelativeTime', () => {
  const NOW = 1_700_000_000_000;
  const HOUR = 60 * 60 * 1000;

  it('reads a past time as "ago"', () => {
    assert.equal(formatRelativeTime(NOW - 5 * 60 * 1000, NOW), '5 minutes ago');
    assert.equal(formatRelativeTime(NOW - 24 * HOUR, NOW), '1 day ago');
  });

  it('reads a future time as "in", not "ago" — a planned outage that starts tomorrow has not happened', () => {
    // Regression: the old `formatDistanceToNow(t) + " ago"` pattern rendered a
    // future outage start as "1 day ago". Direction must survive.
    assert.equal(formatRelativeTime(NOW + 24 * HOUR, NOW), 'in 1 day');
    assert.equal(formatRelativeTime(NOW + 2 * HOUR, NOW), 'in about 2 hours');
  });
});
