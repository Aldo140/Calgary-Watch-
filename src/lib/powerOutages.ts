/**
 * Client-side helpers for ENMAX power outages.
 *
 * Fetching and normalization happen server-side (scripts/ingest/enmax/*), so
 * the ENMAX endpoint URL never appears in the frontend bundle. This module
 * classifies and formats already-normalized records, and adapts them into
 * ordinary Calgary Watch incidents.
 */

import type { Incident } from '@/src/types';
import type { OutageGroup, PowerOutage } from '@/src/types/powerOutage';

export const CALGARY_TIME_ZONE = 'America/Edmonton';

/** Public ENMAX portal — surfaced as the incident's official source link. */
export const ENMAX_PORTAL_URL = 'https://powerservices.enmax.com/';

/** Wording used wherever outage data is surfaced, so attribution stays consistent. */
export const ENMAX_DISCLAIMER =
  'Official outage information provided by ENMAX. Status and restoration estimates may change.';

/** Refresh cadence — matches the ingest cron, never faster. */
export const OUTAGE_REFRESH_MS = 5 * 60 * 1000;

/**
 * Firestore location of the snapshot published by the ingest pipeline
 * (scripts/ingest/power-outages.ts). Read-only for every client.
 */
export const OUTAGE_COLLECTION = 'live_data';
export const OUTAGE_DOC_ID = 'power_outages';

/**
 * How old a snapshot may get before the UI calls it stale. The cron aims for
 * five minutes, but GitHub Actions delays scheduled runs under load, so this is
 * deliberately forgiving — it flags a genuinely stuck pipeline, not a late tick.
 */
export const OUTAGE_STALE_AFTER_MS = 20 * 60 * 1000;

/** Status/state wording that means the outage is over and should leave the map. */
const RESOLVED_PATTERN = /\b(closed|restored|complete|completed|cancel|cancelled|canceled|resolved)\b/i;

function isResolved(outage: PowerOutage): boolean {
  return RESOLVED_PATTERN.test(outage.state) || RESOLVED_PATTERN.test(outage.status);
}

function startTime(outage: PowerOutage): number | null {
  if (!outage.startedAt) return null;
  const ms = Date.parse(outage.startedAt);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Bucket an outage by planned/unplanned and by whether it has actually begun.
 *
 * Returns null when the record should not be shown at all — it has been closed
 * or restored, or it is an unplanned outage dated in the future (contradictory
 * data we would rather drop than mislabel as happening now).
 *
 * `state: "open"` alone is deliberately NOT treated as "happening now": ENMAX
 * marks future planned work as open too.
 */
export function classifyOutage(outage: PowerOutage, now: number = Date.now()): OutageGroup | null {
  if (isResolved(outage)) return null;

  const start = startTime(outage);

  if (outage.type === 'planned') {
    if (start !== null && start > now) return 'upcoming_planned';
    if (start === null) return null; // a planned outage with no start time isn't actionable
    return 'active_planned';
  }

  // Unplanned: live once it has started. A missing start date means ENMAX did
  // not record one, which in practice means it is already underway.
  if (start !== null && start > now) return null;
  return 'active_unplanned';
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CALGARY_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: CALGARY_TIME_ZONE,
  timeStyle: 'short',
});

/**
 * Format an ISO timestamp as Calgary local date + time.
 * Missing or unparseable values return the fallback — never "Invalid Date".
 */
export function formatOutageDateTime(iso: string | null | undefined, fallback = 'Not provided'): string {
  if (!iso) return fallback;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return fallback;
  return DATE_TIME_FORMATTER.format(new Date(ms));
}

/** Format an ISO timestamp as a Calgary time-of-day, e.g. "2:25 p.m.". */
export function formatOutageTime(iso: string | null | undefined, fallback = 'Unknown'): string {
  if (!iso) return fallback;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return fallback;
  return TIME_FORMATTER.format(new Date(ms));
}

/** "1,141 customers affected" — thousands separated, singular-aware. */
export function formatCustomersAffected(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return 'Customers affected not reported';
  const formatted = new Intl.NumberFormat('en-CA').format(Math.round(count));
  return `${formatted} customer${count === 1 ? '' : 's'} affected`;
}

/** Human-readable area list, truncated so popups stay compact. */
export function formatAreasAffected(areas: string[], limit = 4): string {
  if (!areas.length) return 'Area not specified';
  if (areas.length <= limit) return areas.join(', ');
  return `${areas.slice(0, limit).join(', ')} +${areas.length - limit} more`;
}

/**
 * How far ahead a planned outage may start and still count as an incident.
 *
 * An "incident" is something happening now or imminently. ENMAX publishes
 * scheduled work months out; surfacing all of it would bury the live feed under
 * work that has not started. Active outages always qualify regardless.
 *
 * 48h is the tuning point: against the live feed, 24h surfaced nothing at all,
 * 48h surfaces the next few days of work, and a week surfaced ~16 records that
 * read as clutter rather than incidents. Widen or narrow here in one place.
 */
export const OUTAGE_INCIDENT_HORIZON_MS = 48 * 60 * 60 * 1000;

/** Fallback lifetime when ENMAX gives no restoration estimate. */
const DEFAULT_OUTAGE_DURATION_MS = 8 * 60 * 60 * 1000;

function outageTitle(outage: PowerOutage, group: OutageGroup): string {
  // Many records carry no areasAffected at all — appending a generic
  // " — Calgary" there just reads as filler, so drop the suffix entirely.
  const area = outage.areasAffected[0];
  const suffix = area ? ` — ${area}` : '';
  if (group === 'active_unplanned') return `Power outage${suffix}`;
  if (group === 'active_planned') return `Planned power outage${suffix}`;
  return `Planned power outage starts ${formatOutageTime(outage.startedAt, 'soon')}${suffix}`;
}

function outageDescription(outage: PowerOutage): string {
  const parts = [
    formatCustomersAffected(outage.customersAffected),
    `Cause: ${outage.cause}`,
  ];
  if (outage.estimatedRestorationAt) {
    parts.push(`Estimated restoration: ${formatOutageDateTime(outage.estimatedRestorationAt)}`);
  }
  if (outage.areasAffected.length > 1) {
    parts.push(`Areas: ${formatAreasAffected(outage.areasAffected)}`);
  }
  if (outage.referenceNumber) parts.push(`ENMAX reference ${outage.referenceNumber}`);
  parts.push(ENMAX_DISCLAIMER);
  return parts.join('. ').replace(/\.\./g, '.');
}

/**
 * Adapt an ENMAX outage into a Calgary Watch incident.
 *
 * Outages are modelled as `infrastructure` incidents rather than getting their
 * own category or map layer — a power outage is infrastructure, and this keeps
 * them inside the filtering, feed and detail UI that already exists instead of
 * adding another control users have to discover.
 *
 * Provenance fields (`data_source: 'official'`, `source_name: 'ENMAX'`,
 * `source_url`) drive the existing official-source badge and attribution in
 * IncidentDetailPanel, so ENMAX is credited without bespoke UI.
 *
 * Returns null when the outage is not currently incident-worthy — restored,
 * closed, or scheduled beyond the horizon.
 */
export function powerOutageToIncident(outage: PowerOutage, now: number = Date.now()): Incident | null {
  const group = classifyOutage(outage, now);
  if (!group) return null;

  const startedAtMs = outage.startedAt ? Date.parse(outage.startedAt) : NaN;
  const startMs = Number.isFinite(startedAtMs) ? startedAtMs : now;

  if (group === 'upcoming_planned' && startMs - now > OUTAGE_INCIDENT_HORIZON_MS) return null;

  const restorationMs = outage.estimatedRestorationAt
    ? Date.parse(outage.estimatedRestorationAt)
    : NaN;
  const expiresAt = Number.isFinite(restorationMs)
    ? restorationMs + 60 * 60 * 1000
    : startMs + DEFAULT_OUTAGE_DURATION_MS;

  return {
    // Namespaced so an ENMAX id can never collide with a Firestore document id.
    id: `enmax-${outage.id}`,
    title: outageTitle(outage, group),
    description: outageDescription(outage),
    category: 'infrastructure',
    neighborhood: outage.areasAffected[0] ?? 'Calgary',
    lat: outage.latitude,
    lng: outage.longitude,
    timestamp: startMs,
    email: 'outages@enmax.com',
    name: 'ENMAX',
    anonymous: false,
    verified_status: 'community_confirmed',
    report_count: 1,
    data_source: 'official',
    source_type: 'enmax_power_outage',
    source_name: 'ENMAX',
    source_url: ENMAX_PORTAL_URL,
    // Never outlive the restoration estimate — the existing expiry machinery
    // sweeps these off the map without any outage-specific code.
    expires_at: Math.max(expiresAt, now + 60 * 1000),
  };
}

/** Adapt a batch, dropping anything not currently incident-worthy. */
export function powerOutagesToIncidents(outages: PowerOutage[], now: number = Date.now()): Incident[] {
  const incidents: Incident[] = [];
  for (const outage of outages) {
    const incident = powerOutageToIncident(outage, now);
    if (incident) incidents.push(incident);
  }
  return incidents;
}
