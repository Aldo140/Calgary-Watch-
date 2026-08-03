/**
 * Client-side helpers for the ENMAX power-outage layer.
 *
 * Fetching and normalization happen server-side (see functions/src/enmax/*).
 * This module only classifies and formats already-normalized records, so the
 * ENMAX endpoint URL never appears in the frontend bundle.
 */

import type { OutageGroup, PowerOutage } from '@/src/types/powerOutage';

export const CALGARY_TIME_ZONE = 'America/Edmonton';

/** Public ENMAX portal — shown as the "official source" link in every popup. */
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

export interface OutageGroupStyle {
  /** Marker fill / accent colour. */
  color: string;
  /** Short label — always rendered as text so colour is never the only signal. */
  label: string;
  /** Longer phrase used in popups and screen-reader descriptions. */
  description: string;
  /** Distinct marker shape so the three states differ without relying on hue. */
  shape: 'filled' | 'ringed' | 'dashed';
}

/**
 * Visual treatment per group. Colour, wording and shape all vary, so the three
 * states remain distinguishable to colour-blind users and in greyscale.
 */
export const OUTAGE_GROUP_STYLES: Record<OutageGroup, OutageGroupStyle> = {
  active_unplanned: {
    color: '#dc2626',
    label: 'Unplanned · Active',
    description: 'Unplanned outage, currently active',
    shape: 'filled',
  },
  active_planned: {
    color: '#ea580c',
    label: 'Planned · Active',
    description: 'Planned outage, currently active',
    shape: 'ringed',
  },
  upcoming_planned: {
    color: '#2563eb',
    label: 'Planned · Upcoming',
    description: 'Planned outage, scheduled for later',
    shape: 'dashed',
  },
};

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
 * Screen-reader description for an outage marker. Explicitly says "power
 * outage" and names the affected area so the marker is identifiable without
 * sight of the icon or its colour.
 */
export function describeOutageForScreenReader(outage: PowerOutage, group: OutageGroup): string {
  const style = OUTAGE_GROUP_STYLES[group];
  return `Power outage. ${style.description}. ${formatAreasAffected(outage.areasAffected, 2)}. ${formatCustomersAffected(outage.customersAffected)}.`;
}
