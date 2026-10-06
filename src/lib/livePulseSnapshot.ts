/**
 * The homepage's "right now" facts as one public document.
 *
 * The homepage and /community used to read the 60 newest reports on every
 * visit — 60 billed reads per page view, which on the free Firestore plan is
 * what exhausted the daily quota and took every scheduled job down with it.
 * The ingest job (every 30 minutes, admin credentials) now computes the same
 * summary with the same pure functions and writes it to `live_data/pulse`;
 * a visit costs one read. The page still falls back to the direct query when
 * the snapshot is missing or stale, so a stalled job never shows old numbers
 * as current.
 */

import { pickExampleReport, recentPins, summarizeReports, type ExampleReport } from './homeClaims';
import type { Incident, IncidentCategory } from '../types';

export const PULSE_SAMPLE = 60;
export const PULSE_DOC = { collection: 'live_data', id: 'pulse' } as const;
/** Older than this and the page queries reports itself instead. */
export const PULSE_MAX_AGE_MS = 75 * 60 * 1000;

export interface PulseSnapshot {
  checkedAt: number;
  total: number;
  capped: boolean;
  byCategory: Partial<Record<IncidentCategory, number>>;
  example: ExampleReport | null;
  recent: ExampleReport[];
}

export function buildPulseSnapshot(incidents: Incident[], now: number, sample = PULSE_SAMPLE): PulseSnapshot {
  // JSON round trip drops undefined fields, which Firestore refuses to store.
  return JSON.parse(JSON.stringify({
    checkedAt: now,
    ...summarizeReports(incidents, now, sample),
    example: pickExampleReport(incidents, now),
    recent: recentPins(incidents, now),
  }));
}

export function readPulseSnapshot(data: unknown, now: number): PulseSnapshot | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<PulseSnapshot>;
  if (typeof d.checkedAt !== 'number' || typeof d.total !== 'number') return null;
  if (now - d.checkedAt > PULSE_MAX_AGE_MS || d.checkedAt > now + 5 * 60 * 1000) return null;
  return {
    checkedAt: d.checkedAt,
    total: d.total,
    capped: d.capped === true,
    byCategory: d.byCategory && typeof d.byCategory === 'object' ? d.byCategory : {},
    example: d.example ?? null,
    recent: Array.isArray(d.recent) ? d.recent : [],
  };
}
