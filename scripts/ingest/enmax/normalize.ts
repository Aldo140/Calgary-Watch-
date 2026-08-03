/**
 * ENMAX → Calgary Watch normalization layer.
 *
 * All knowledge of the raw ENMAX payload shape lives here. The feed is
 * undocumented, so every field is treated as untrusted: wrong types, nulls and
 * missing keys are expected, and a single malformed record is dropped rather
 * than being allowed to fail the whole response.
 */

import type { PowerOutage } from '../../../src/types/powerOutage.js';
import { ENMAX_PORTAL_URL } from './config.js';
import { toCalgaryIso } from './time.js';

/** Shown when ENMAX gives us a blank/absent status. */
export const DEFAULT_STATUS = 'Active';
/** Shown when ENMAX gives us a blank/absent cause. */
export const DEFAULT_CAUSE = 'Under investigation';

/**
 * Placeholder strings the live feed uses in place of a real JSON null.
 * `status` in particular arrives as the four-character string "null", which
 * must never reach the UI.
 */
const NULLISH_STRINGS = new Set(['null', 'undefined', 'n/a', 'na', '-', 'none']);

function asTrimmedString(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return NULLISH_STRINGS.has(trimmed.toLowerCase()) ? '' : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function asCoordinate(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function asCustomerCount(value: unknown): number {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/**
 * Split the comma-delimited `areasAffected` blob into individual area names.
 * Null / non-string input yields an empty array.
 */
export function splitAreasAffected(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((area) => area.trim())
    .filter((area) => area.length > 0);
}

/**
 * Decide planned vs unplanned.
 *
 * `isPlanned === true` is taken at face value. The subtlety is the false case:
 * on the live feed the overwhelming majority of scheduled outages arrive as
 * `isPlanned: false` alongside `outageType: "Planned"` and a start date days or
 * months out. Trusting `isPlanned` alone would file all of that scheduled work
 * as unplanned and, once the "has it started yet" check ran, drop it from the
 * map entirely. So a `outageType` of "Planned" is allowed to override a false
 * `isPlanned`; only when both signals say unplanned do we call it unplanned.
 */
export function resolveOutageType(record: Record<string, unknown>): 'planned' | 'unplanned' {
  if (record.isPlanned === true) return 'planned';

  const outageType = asTrimmedString(record.outageType);
  const saysPlanned = /planned/i.test(outageType) && !/unplanned/i.test(outageType);
  return saysPlanned ? 'planned' : 'unplanned';
}

/**
 * Reject coordinates that cannot plausibly be an outage location. Null Island
 * (0, 0) is the usual signal for "ENMAX had no location for this record".
 */
function hasUsableCoordinates(lat: number | null, lng: number | null): lat is number {
  if (lat === null || lng === null) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Normalize one raw ENMAX record.
 * Returns null when the record is unusable (bad shape, no id, no coordinates).
 */
export function normalizeOutage(raw: unknown): PowerOutage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  const referenceNumber = asTrimmedString(record.incidentName) || null;
  const id = asTrimmedString(record.incidentID) || (referenceNumber ? `enmax-${referenceNumber}` : '');
  if (!id) return null;

  const latitude = asCoordinate(record.latitude);
  const longitude = asCoordinate(record.longitude);
  if (!hasUsableCoordinates(latitude, longitude)) return null;

  return {
    id,
    referenceNumber,
    type: resolveOutageType(record),
    status: asTrimmedString(record.status) || DEFAULT_STATUS,
    state: asTrimmedString(record.state).toLowerCase() || 'unknown',
    areasAffected: splitAreasAffected(record.areasAffected),
    customersAffected: asCustomerCount(record.customersAffected),
    latitude: latitude as number,
    longitude: longitude as number,
    cause: asTrimmedString(record.outageCause) || DEFAULT_CAUSE,
    startedAt: toCalgaryIso(record.outageStart),
    estimatedRestorationAt: toCalgaryIso(record.estimatedRestoration),
    requestDate: toCalgaryIso(record.requestDate),
    source: 'ENMAX',
    sourceUrl: ENMAX_PORTAL_URL,
    isOfficial: true,
  };
}

/**
 * Normalize a full ENMAX response.
 *
 * Throws when the payload is not an array — that means the feed changed shape
 * and we should serve the previous snapshot instead of an empty map layer.
 * Individual bad records are skipped without affecting their neighbours, and
 * duplicate incident IDs are collapsed so the map never gets duplicate keys.
 */
export function normalizeOutages(raw: unknown): PowerOutage[] {
  if (!Array.isArray(raw)) {
    throw new Error('ENMAX response was not an array');
  }

  const byId = new Map<string, PowerOutage>();
  for (const record of raw) {
    let outage: PowerOutage | null = null;
    try {
      outage = normalizeOutage(record);
    } catch {
      outage = null; // one malformed record must never sink the batch
    }
    if (outage) byId.set(outage.id, outage);
  }

  return [...byId.values()];
}
