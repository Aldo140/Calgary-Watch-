/**
 * City of Calgary 311 — property crime reports
 *
 * Why this source exists: Calgary publishes no live, geocoded, per-incident
 * crime feed. The Community Crime Statistics dataset (78gh-n26t) now requires
 * a login, Social Disorder Statistics (4evm-wx9a) carries no location at all,
 * and Calgary Police have no public incident feed. Without this, the map has no
 * crime pins whatsoever.
 *
 * 311 does publish geocoded property-crime reports, in volume and current:
 * roughly 150 graffiti and vandalism reports a week, every one with
 * coordinates. Those are real mischief and property-damage offences reported by
 * residents to the City, so they belong on a community safety map.
 *
 * Deliberately excluded: "Encampment Concerns", which is the other high-volume
 * category here. Living rough is not a crime, and plotting encampments as crime
 * pins would be both factually wrong and harmful to the people involved.
 *
 * Everything here is genuine City data. Nothing is generated.
 */

import type { NormalizedIncident } from '../types.js';

export type { NormalizedIncident };

const DATASET = 'iahh-g8bj';
const DATASET_URL = `https://data.calgary.ca/resource/${DATASET}.json`;
const SOURCE_URL = 'https://data.calgary.ca/Services-and-Amenities/311-Service-Requests/arf6-qysm';

/** How far back to look. 311 rows appear within a day or so of being filed. */
const LOOKBACK_DAYS = 7;

/** How long a report stays on the map. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 311 service_name values that describe an actual property crime.
 * Matched case-insensitively as SQL LIKE patterns against upper(service_name).
 */
const CRIME_SERVICES = ['%GRAFFITI%', '%VANDAL%'];

interface ServiceRequest {
  service_request_id?: string;
  requested_date?: string;
  status_description?: string;
  service_name?: string;
  address?: string;
  comm_name?: string;
  latitude?: string | number;
  longitude?: string | number;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n !== 0 ? n : null;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "Corporate - Graffiti Concerns" → "Graffiti" */
function shortLabel(serviceName: string): string {
  if (/graffiti/i.test(serviceName)) return 'Graffiti';
  if (/vandal/i.test(serviceName)) return 'Vandalism';
  return 'Property damage';
}

function buildTitle(row: ServiceRequest): string {
  const label = shortLabel(row.service_name ?? '');
  const where = row.comm_name ? titleCase(row.comm_name) : 'Calgary';
  return `${label} reported in ${where}`.slice(0, 100);
}

function buildDescription(row: ServiceRequest): string {
  const label = shortLabel(row.service_name ?? '');
  const parts = [`${label} reported to City of Calgary 311.`];
  // 311 publishes a block-level address, never a precise civic address.
  if (row.address) parts.push(`Near ${titleCase(row.address)}.`);
  if (row.status_description) parts.push(`Status: ${row.status_description}.`);
  parts.push('Reported by a resident via 311 — not a police-confirmed offence.');
  return parts.join(' ').slice(0, 1000);
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
}

/**
 * Fetch recent geocoded property-crime reports from 311.
 * Throws on transport or HTTP failure so the pipeline logs it rather than
 * silently contributing zero.
 */
export async function fetchCalgary311Crime(): Promise<NormalizedIncident[]> {
  const likeClause = CRIME_SERVICES
    .map((pattern) => `upper(service_name) like '${pattern}'`)
    .join(' OR ');
  const where = `requested_date > '${sinceIso(LOOKBACK_DAYS)}' AND (${likeClause})`;

  const url =
    `${DATASET_URL}?$where=${encodeURIComponent(where)}` +
    `&$order=${encodeURIComponent('requested_date DESC')}&$limit=300`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'CalgaryWatch/1.0 (community safety app)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Calgary 311 returned HTTP ${res.status}`);

  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) throw new Error('Calgary 311 response was not an array');

  const results: NormalizedIncident[] = [];

  for (const raw of rows as ServiceRequest[]) {
    const lat = toNumber(raw.latitude);
    const lng = toNumber(raw.longitude);
    if (lat === null || lng === null) continue;

    const id = raw.service_request_id;
    if (!id) continue;

    const reported = raw.requested_date ? Date.parse(raw.requested_date) : Date.now();

    results.push({
      title: buildTitle(raw),
      description: buildDescription(raw),
      category: 'crime',
      neighborhood: raw.comm_name ? titleCase(raw.comm_name) : 'Calgary',
      lat,
      lng,
      source_name: 'City of Calgary 311',
      source_url: SOURCE_URL,
      source_type: 'calgary_open_data',
      data_source: 'official',
      dedup_key: `calgary_311_crime:${id}`,
      expires_at: (Number.isFinite(reported) ? reported : Date.now()) + TTL_MS,
      verified_status: 'community_confirmed',
      report_count: 1,
      email: 'system@calgarywatch.app',
      name: 'City of Calgary 311',
      anonymous: false,
    });
  }

  return results;
}
