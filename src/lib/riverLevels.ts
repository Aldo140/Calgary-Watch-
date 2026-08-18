import type { Incident } from '@/src/types';

/**
 * The rivers, as measured — and deliberately not as a flood warning.
 *
 * 2013 is the reason this belongs on a Calgary map at all. But a public safety
 * map has to be careful about exactly which claim it is making: Alberta
 * Environment sets advisory and flood thresholds per gauge, we do not know
 * them, and printing "flood risk" against a number we invented a cutoff for
 * would be manufacturing an official reading. Alberta Emergency Alert already
 * carries the real warnings and this app already ingests it.
 *
 * So this layer states what the gauge says and how fast it is moving — both
 * derived from the published series, both checkable — and routes anyone who
 * wants a warning to the body that issues warnings. A sharp rise is a fact
 * worth surfacing on its own: it is the thing you would want to know before
 * walking the pathways or parking by the river, and it needs no threshold we
 * are not entitled to set.
 */

export interface RiverReading {
  /** Unix ms. */
  timestamp: number;
  levelM: number;
  flowCms: number;
}

export interface RiverStation {
  /** Water Survey of Canada station number, e.g. 05BH004. */
  id: string;
  label: string;
  lat: number;
  lng: number;
}

/** Metres of rise, within the window, that makes the gauge worth a marker. */
export const RISE_THRESHOLD_M = 0.3;
export const TREND_WINDOW_HOURS = 6;

/**
 * Rows arrive as `[timestamp, level, flow]` triples with nulls scattered
 * through the series where the gauge missed a reading.
 */
export function parseRiverRows(rows: unknown): RiverReading[] {
  if (!Array.isArray(rows)) return [];
  const out: RiverReading[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const [rawTime, rawLevel, rawFlow] = row;
    if (typeof rawTime !== 'string' || typeof rawLevel !== 'number') continue;
    // The feed publishes local Alberta time without an offset. Treating it as
    // UTC would shift every reading by six hours, which matters because the
    // whole output is a rate of change over a window.
    const timestamp = Date.parse(rawTime.replace(' ', 'T') + '-06:00');
    if (!Number.isFinite(timestamp) || !Number.isFinite(rawLevel)) continue;
    out.push({
      timestamp,
      levelM: rawLevel,
      flowCms: typeof rawFlow === 'number' && Number.isFinite(rawFlow) ? rawFlow : 0,
    });
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

export interface RiverTrend {
  latest: RiverReading;
  /** Positive means rising. Metres across the window. */
  changeM: number;
  direction: 'rising' | 'falling' | 'steady';
}

/**
 * Change across the trailing window, measured from the earliest reading that
 * still falls inside it rather than from a fixed row offset — the feed's
 * cadence is not guaranteed and gaps are common.
 */
export function riverTrend(readings: RiverReading[], windowHours = TREND_WINDOW_HOURS): RiverTrend | null {
  if (readings.length === 0) return null;
  const latest = readings[readings.length - 1];
  const cutoff = latest.timestamp - windowHours * 60 * 60 * 1000;
  const earliest = readings.find((r) => r.timestamp >= cutoff);
  if (!earliest || earliest === latest) {
    return { latest, changeM: 0, direction: 'steady' };
  }
  const changeM = latest.levelM - earliest.levelM;
  const direction = changeM >= 0.05 ? 'rising' : changeM <= -0.05 ? 'falling' : 'steady';
  return { latest, changeM, direction };
}

/**
 * Surface a marker only for a sustained rise.
 *
 * A falling or steady river is not news, and a gauge pinned to the map every
 * day is a gauge nobody reads on the day it moves.
 */
export function riverToIncident(
  station: RiverStation,
  readings: RiverReading[],
  now: number,
): Incident | null {
  const trend = riverTrend(readings);
  if (!trend || trend.direction !== 'rising' || trend.changeM < RISE_THRESHOLD_M) return null;

  return {
    id: `river-${station.id.toLowerCase()}`,
    title: `${station.label} Rising`,
    description:
      `Water level up ${trend.changeM.toFixed(2)} m in the last ${TREND_WINDOW_HOURS} hours, ` +
      `now ${trend.latest.levelM.toFixed(2)} m with flow around ${Math.round(trend.latest.flowCms)} m³/s. ` +
      'This is a gauge reading, not a flood warning — Alberta Emergency Alert issues those. ' +
      'Keep off pathways close to the bank and move anything parked near the water.',
    category: 'weather',
    neighborhood: station.label,
    lat: station.lat,
    lng: station.lng,
    timestamp: trend.latest.timestamp,
    email: 'rivers@alberta.ca',
    name: 'Alberta River Basins',
    anonymous: false,
    verified_status: 'community_confirmed',
    report_count: 1,
    data_source: 'official',
    source_name: 'Alberta River Basins (WSC gauge)',
    source_url: 'https://rivers.alberta.ca/',
    expires_at: now + 3 * 60 * 60 * 1000,
  };
}
