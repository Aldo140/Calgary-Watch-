/**
 * Shared contract for the ENMAX power-outage layer.
 *
 * This file is the single source of truth for the shape that travels between
 * the Cloud Function (`functions/src/enmax/*`) and the map. The function
 * imports it with `import type`, so nothing from the frontend bundle is
 * pulled into the deployed function.
 *
 * ENMAX does not publish a documented API — treat every field as best-effort.
 */

/** A single normalized outage record as served by /api/power-outages. */
export interface PowerOutage {
  /** ENMAX incidentID — stable enough to use as a React key / marker key. */
  id: string;
  /** ENMAX incidentName, shown to users as a reference number. */
  referenceNumber: string | null;
  type: 'planned' | 'unplanned';
  status: string;
  state: string;
  areasAffected: string[];
  customersAffected: number;
  latitude: number;
  longitude: number;
  cause: string;
  /** ISO-8601 with an explicit Calgary offset, or null when ENMAX omitted it. */
  startedAt: string | null;
  estimatedRestorationAt: string | null;
  requestDate: string | null;
  source: 'ENMAX';
  sourceUrl: string;
  isOfficial: true;
}

/** Envelope returned by the Calgary Watch power-outage endpoint. */
export interface PowerOutagesResponse {
  outages: PowerOutage[];
  /** ISO timestamp of the ENMAX fetch these records came from. */
  updatedAt: string;
  /** True when ENMAX was unreachable and we served the last good snapshot. */
  stale: boolean;
  source: 'ENMAX';
  sourceUrl: string;
}

/**
 * Time-based bucket for an outage. Derived on the client so a planned outage
 * flips from `upcoming` to `active_planned` as soon as its start time passes,
 * without waiting for the five-minute server cache to roll over.
 */
export type OutageGroup = 'active_unplanned' | 'active_planned' | 'upcoming_planned';
