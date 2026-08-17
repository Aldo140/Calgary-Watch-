/**
 * Release decision for the map sheet drag.
 *
 * The sheet has two states and one rule: a drag commits if it travelled far
 * enough or was flung hard enough, otherwise it springs back to where it
 * started. Movement that would push past the end the sheet already sits at
 * can never commit anything.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clampOffset, exceedsDragSlop, resolveDragEnd } from '../src/hooks/useSheetDrag.ts';

const TRAVEL = 600; // px between rail and raised

describe('exceedsDragSlop', () => {
  it('bidirectional: arms past the slop in either direction (the masthead)', () => {
    assert.equal(exceedsDragSlop(7, true), true);
    assert.equal(exceedsDragSlop(-7, true), true);
  });

  it('bidirectional: does not arm at or under the slop', () => {
    assert.equal(exceedsDragSlop(6, true), false);
    assert.equal(exceedsDragSlop(-6, true), false);
    assert.equal(exceedsDragSlop(3, true), false);
    assert.equal(exceedsDragSlop(0, true), false);
  });

  it('downward-only: arms past the slop going down (the list)', () => {
    assert.equal(exceedsDragSlop(7, false), true);
  });

  it('downward-only: never arms on upward movement, however large', () => {
    assert.equal(exceedsDragSlop(-7, false), false);
    assert.equal(exceedsDragSlop(-500, false), false);
  });

  it('downward-only: does not arm at or under the slop', () => {
    assert.equal(exceedsDragSlop(6, false), false);
    assert.equal(exceedsDragSlop(0, false), false);
  });
});

describe('resolveDragEnd from raised', () => {
  const from = 'raised' as const;

  it('commits to rail once the drag passes a quarter of the travel', () => {
    assert.equal(resolveDragEnd({ deltaY: 150, velocity: 0, travel: TRAVEL, state: from }), 'rail');
    assert.equal(resolveDragEnd({ deltaY: 400, velocity: 0, travel: TRAVEL, state: from }), 'rail');
  });

  it('springs back when the drag is short of the threshold', () => {
    assert.equal(resolveDragEnd({ deltaY: 149, velocity: 0, travel: TRAVEL, state: from }), 'raised');
    assert.equal(resolveDragEnd({ deltaY: 20, velocity: 0, travel: TRAVEL, state: from }), 'raised');
  });

  it('commits on a downward fling that never reached the threshold', () => {
    assert.equal(resolveDragEnd({ deltaY: 40, velocity: 0.9, travel: TRAVEL, state: from }), 'rail');
  });

  it('ignores an upward fling — it is already raised', () => {
    assert.equal(resolveDragEnd({ deltaY: -40, velocity: -0.9, travel: TRAVEL, state: from }), 'raised');
  });

  it('cannot be dragged further open', () => {
    assert.equal(resolveDragEnd({ deltaY: -400, velocity: 0, travel: TRAVEL, state: from }), 'raised');
  });
});

describe('resolveDragEnd from rail', () => {
  const from = 'rail' as const;

  it('commits to raised once the upward drag passes a quarter of the travel', () => {
    assert.equal(resolveDragEnd({ deltaY: -150, velocity: 0, travel: TRAVEL, state: from }), 'raised');
  });

  it('springs back when the upward drag is short', () => {
    assert.equal(resolveDragEnd({ deltaY: -149, velocity: 0, travel: TRAVEL, state: from }), 'rail');
  });

  it('commits on an upward fling that never reached the threshold', () => {
    assert.equal(resolveDragEnd({ deltaY: -30, velocity: -0.9, travel: TRAVEL, state: from }), 'raised');
  });

  it('cannot be dragged further closed', () => {
    assert.equal(resolveDragEnd({ deltaY: 400, velocity: 0.9, travel: TRAVEL, state: from }), 'rail');
  });
});

describe('resolveDragEnd degenerate input', () => {
  it('holds state when there is no travel to measure against', () => {
    assert.equal(resolveDragEnd({ deltaY: 500, velocity: 2, travel: 0, state: 'raised' }), 'raised');
    assert.equal(resolveDragEnd({ deltaY: -500, velocity: -2, travel: 0, state: 'rail' }), 'rail');
  });

  it('holds state on a tap that did not move', () => {
    assert.equal(resolveDragEnd({ deltaY: 0, velocity: 0, travel: TRAVEL, state: 'rail' }), 'rail');
    assert.equal(resolveDragEnd({ deltaY: 0, velocity: 0, travel: TRAVEL, state: 'raised' }), 'raised');
  });
});

describe('clampOffset from raised', () => {
  const from = 'raised' as const;

  it('clamps offset to [0, travel]', () => {
    assert.equal(clampOffset(0, from, TRAVEL), 0);
    assert.equal(clampOffset(300, from, TRAVEL), 300);
    assert.equal(clampOffset(600, from, TRAVEL), 600);
    assert.equal(clampOffset(800, from, TRAVEL), 600);
  });

  it('prevents upward drag when raised', () => {
    assert.equal(clampOffset(-100, from, TRAVEL), 0);
  });
});

describe('clampOffset from rail', () => {
  const from = 'rail' as const;

  it('clamps offset to [-travel, 0]', () => {
    assert.equal(clampOffset(0, from, TRAVEL), 0);
    assert.equal(clampOffset(-300, from, TRAVEL), -300);
    assert.equal(clampOffset(-600, from, TRAVEL), -600);
    assert.equal(clampOffset(-800, from, TRAVEL), -600);
  });

  it('prevents downward drag when rail', () => {
    assert.equal(clampOffset(100, from, TRAVEL), 0);
  });
});
