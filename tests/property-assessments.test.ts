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

import { parseAssessedValue } from '../src/hooks/usePropertyAssessments.js';

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
