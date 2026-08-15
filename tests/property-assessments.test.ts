/**
 * Regression tests for Calgary assessed-value parsing.
 *
 * The upstream dataset returns assessed_value as a formatted string and is not
 * consistent about it — some roll years arrive as "198,500", others as
 * "198500". parseFloat stops at the comma, so the formatted years were read as
 * hundreds of dollars.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAssessedValue, resolveCommunityName } from '../src/hooks/usePropertyAssessments.js';

describe('parseAssessedValue', () => {
  it('reads a comma-formatted value in full', () => {
    // parseFloat("198,500") returns 198 — the bug this exists to prevent.
    assert.equal(parseAssessedValue('198,500'), 198_500);
  });

  it('reads a value in the millions', () => {
    // Worse than a truncation: "1,250,000" parsed to 1, so a $1.25M property
    // counted for less than a $198k one and dragged averages down.
    assert.equal(parseAssessedValue('1,250,000'), 1_250_000);
  });

  it('still reads years that arrive unformatted', () => {
    assert.equal(parseAssessedValue('651153'), 651_153);
  });

  it('handles currency decoration', () => {
    assert.equal(parseAssessedValue('$ 376,139'), 376_139);
  });

  it('returns NaN for missing or unusable input so callers can skip the row', () => {
    assert.ok(Number.isNaN(parseAssessedValue(undefined)));
    assert.ok(Number.isNaN(parseAssessedValue('')));
  });

  it('keeps mixed-format years comparable', () => {
    // The trend line compared a comma year against an uncommaed year and
    // reported six-figure percentage growth.
    const formatted = parseAssessedValue('376,139');
    const plain = parseAssessedValue('651153');
    const growth = Math.round(((plain - formatted) / formatted) * 100);
    assert.ok(growth > 0 && growth < 200, `expected a plausible growth figure, got ${growth}%`);
  });
});

describe('resolveCommunityName', () => {
  // A slice of the real catalogue from Calgary Open Data 4ur7-wsgc.
  const CATALOGUE = [
    'BRIDGELAND/RIVERSIDE', 'SADDLE RIDGE', 'HILLHURST', 'WEST HILLHURST',
    'SUNNYSIDE', 'ALTADORE', 'FOREST LAWN', 'BELTLINE', 'UPPER MOUNT ROYAL',
    'LOWER MOUNT ROYAL', 'NOSE HILL PARK', 'ALBERT PARK/RADISSON HEIGHTS',
  ];

  it('matches ignoring case and punctuation', () => {
    assert.equal(resolveCommunityName('altadore', CATALOGUE), 'ALTADORE');
    assert.equal(resolveCommunityName('Forest Lawn', CATALOGUE), 'FOREST LAWN');
  });

  it('resolves a name the city files under a slash-combined community', () => {
    // The app stores "bridgeland"; the city files BRIDGELAND/RIVERSIDE.
    assert.equal(resolveCommunityName('bridgeland', CATALOGUE), 'BRIDGELAND/RIVERSIDE');
    assert.equal(resolveCommunityName('radisson heights', CATALOGUE), 'ALBERT PARK/RADISSON HEIGHTS');
  });

  it('resolves a spacing difference', () => {
    // "saddleridge" in the app, "SADDLE RIDGE" in the dataset.
    assert.equal(resolveCommunityName('saddleridge', CATALOGUE), 'SADDLE RIDGE');
  });

  it('maps a district people use to the community the city records', () => {
    // Kensington is a business district; the city files it under Hillhurst.
    assert.equal(resolveCommunityName('kensington', CATALOGUE), 'HILLHURST');
  });

  it('prefers the most specific containment match', () => {
    // HILLHURST must win over WEST HILLHURST for a bare "hillhurst".
    assert.equal(resolveCommunityName('hillhurst', CATALOGUE), 'HILLHURST');
  });

  it('returns null when nothing plausibly matches', () => {
    assert.equal(resolveCommunityName('false creek', CATALOGUE), null);
    assert.equal(resolveCommunityName('', CATALOGUE), null);
  });
});
