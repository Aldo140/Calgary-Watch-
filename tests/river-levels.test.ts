/**
 * River gauge parsing, trend, and the claim the marker is allowed to make.
 *
 * The last of those is the point: this layer must never present itself as a
 * flood warning, because Alberta Environment issues those against thresholds
 * this app does not know.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  RISE_THRESHOLD_M,
  parseRiverRows,
  riverToIncident,
  riverTrend,
  type RiverStation,
} from '../src/lib/riverLevels.ts';

const BOW: RiverStation = { id: '05BH004', label: 'Bow River at Calgary', lat: 51.05, lng: -114.0517 };

/** Rows in the feed's own shape: local Alberta time, [time, level, flow]. */
function rows(...entries: Array<[string, number | null, number | null]>) {
  return entries.map(([t, l, f]) => [t, l, f]);
}

describe('parseRiverRows', () => {
  it('reads the feed timestamps as Alberta time, not UTC', () => {
    const [r] = parseRiverRows(rows(['2026-08-18 01:05:00', 1.215, 98.3]));
    assert.equal(new Date(r.timestamp).toISOString(), '2026-08-18T07:05:00.000Z');
  });

  it('drops rows the gauge did not report', () => {
    const parsed = parseRiverRows(rows(
      ['2026-08-18 01:00:00', 1.2, 98],
      ['2026-08-18 01:05:00', null, null],
      ['2026-08-18 01:10:00', 1.21, 98.2],
    ));
    assert.equal(parsed.length, 2);
  });

  it('tolerates a missing flow while keeping the level', () => {
    const [r] = parseRiverRows(rows(['2026-08-18 01:00:00', 1.2, null]));
    assert.equal(r.levelM, 1.2);
    assert.equal(r.flowCms, 0);
  });

  it('returns nothing for a payload that is not rows', () => {
    for (const junk of [null, undefined, {}, 'rows', 42]) {
      assert.deepEqual(parseRiverRows(junk), []);
    }
  });

  it('orders oldest to newest whatever order it received', () => {
    const parsed = parseRiverRows(rows(
      ['2026-08-18 02:00:00', 1.3, 99],
      ['2026-08-18 01:00:00', 1.2, 98],
    ));
    assert.deepEqual(parsed.map((r) => r.levelM), [1.2, 1.3]);
  });
});

describe('riverTrend', () => {
  const series = (...levels: number[]) =>
    parseRiverRows(
      rows(...levels.map((l, i) => [`2026-08-18 ${String(i).padStart(2, '0')}:00:00`, l, 90] as [string, number, number])),
    );

  it('measures the change across the window', () => {
    const t = riverTrend(series(1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6));
    assert.equal(t?.direction, 'rising');
    assert.ok(Math.abs(t!.changeM - 0.6) < 1e-9);
  });

  it('calls a falling river falling', () => {
    assert.equal(riverTrend(series(2.0, 1.9, 1.7))?.direction, 'falling');
  });

  it('treats gauge noise as steady rather than movement', () => {
    assert.equal(riverTrend(series(1.2, 1.21, 1.22))?.direction, 'steady');
  });

  it('handles a single reading without inventing a trend', () => {
    const t = riverTrend(series(1.2));
    assert.equal(t?.changeM, 0);
    assert.equal(t?.direction, 'steady');
  });

  it('returns null when there is nothing to measure', () => {
    assert.equal(riverTrend([]), null);
  });

  it('ignores readings older than the window', () => {
    const old = parseRiverRows(rows(
      ['2026-08-17 00:00:00', 0.2, 90],
      ['2026-08-18 00:00:00', 1.2, 90],
      ['2026-08-18 01:00:00', 1.25, 90],
    ));
    // The day-old 0.2 m reading must not become the baseline for a 1 m "rise".
    assert.ok(riverTrend(old)!.changeM < 0.1);
  });
});

describe('riverToIncident', () => {
  const now = 1_700_000_000_000;
  const rising = parseRiverRows(rows(
    ['2026-08-18 00:00:00', 1.0, 90],
    ['2026-08-18 03:00:00', 1.25, 95],
    ['2026-08-18 05:00:00', 1.5, 110],
  ));

  it('says nothing about a steady river', () => {
    const steady = parseRiverRows(rows(
      ['2026-08-18 00:00:00', 1.2, 90],
      ['2026-08-18 05:00:00', 1.21, 90],
    ));
    assert.equal(riverToIncident(BOW, steady, now), null);
  });

  it('says nothing about a falling river', () => {
    const falling = parseRiverRows(rows(
      ['2026-08-18 00:00:00', 2.0, 200],
      ['2026-08-18 05:00:00', 1.2, 90],
    ));
    assert.equal(riverToIncident(BOW, falling, now), null);
  });

  it('stays quiet for a rise under the threshold', () => {
    const small = parseRiverRows(rows(
      ['2026-08-18 00:00:00', 1.0, 90],
      ['2026-08-18 05:00:00', 1.0 + RISE_THRESHOLD_M - 0.01, 92],
    ));
    assert.equal(riverToIncident(BOW, small, now), null);
  });

  it('surfaces a sustained rise with the measured numbers in it', () => {
    const incident = riverToIncident(BOW, rising, now)!;
    assert.match(incident.description, /0\.50 m/);
    assert.match(incident.description, /1\.50 m/);
    assert.match(incident.title, /Bow River at Calgary/);
  });

  it('never presents itself as a flood warning, and names who issues those', () => {
    const incident = riverToIncident(BOW, rising, now)!;
    assert.match(incident.description, /not a flood warning/i);
    assert.match(incident.description, /Alberta Emergency Alert/);
    assert.doesNotMatch(incident.title, /flood|warning/i);
  });

  it('is attributed, expires, and keeps a stable id per station', () => {
    const incident = riverToIncident(BOW, rising, now)!;
    assert.equal(incident.id, 'river-05bh004');
    assert.equal(incident.data_source, 'official');
    assert.match(incident.source_url!, /rivers\.alberta\.ca/);
    assert.equal(incident.expires_at, now + 3 * 60 * 60 * 1000);
  });
});
