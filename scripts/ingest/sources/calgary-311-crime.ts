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

import type { IncidentCategory } from '../../../src/types/index.js';
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
 * Which 311 request types to surface, how to categorise them, and how many of
 * each to publish per run.
 *
 * The caps exist for balance. Graffiti alone runs ~390 reports a fortnight and
 * would otherwise bury every other kind of incident on the map — which is what
 * happened when this source shipped with graffiti and vandalism only. Each rule
 * takes its most recent N, so the mix stays varied and current.
 *
 * `like` is matched by the API against upper(service_name); `match` re-checks
 * client-side, since one LIKE pattern can catch neighbouring request types.
 */
interface ServiceRule {
  like: string;
  match: RegExp;
  category: IncidentCategory;
  label: string;
  cap: number;
}

const SERVICE_RULES: ServiceRule[] = [
  // ── Property crime ──────────────────────────────────────────────────────
  { like: '%GRAFFITI%', match: /graffiti/i, category: 'crime', label: 'Graffiti', cap: 12 },
  { like: '%VANDAL%', match: /vandal/i, category: 'crime', label: 'Vandalism', cap: 10 },
  { like: '%DERELICT%', match: /derelict|unsecure/i, category: 'crime', label: 'Derelict or unsecured property', cap: 6 },
  // ── Infrastructure ──────────────────────────────────────────────────────
  { like: '%WATER MAIN%', match: /water main/i, category: 'infrastructure', label: 'Water main break', cap: 10 },
  { like: '%STREETLIGHT%', match: /streetlight/i, category: 'infrastructure', label: 'Streetlight damage', cap: 8 },
  { like: '%DEBRIS ON STREET%', match: /debris/i, category: 'infrastructure', label: 'Debris on the road', cap: 6 },
  // ── Traffic ─────────────────────────────────────────────────────────────
  { like: '%SIGNS - MISSING%', match: /sign/i, category: 'traffic', label: 'Missing or damaged road sign', cap: 8 },
];

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

function ruleFor(serviceName: string): ServiceRule | null {
  return SERVICE_RULES.find((rule) => rule.match.test(serviceName)) ?? null;
}

function buildTitle(row: ServiceRequest, rule: ServiceRule): string {
  const where = row.comm_name ? titleCase(row.comm_name) : 'Calgary';
  return `${rule.label} reported in ${where}`.slice(0, 100);
}

function buildDescription(row: ServiceRequest, rule: ServiceRule): string {
  const parts = [`${rule.label} reported to City of Calgary 311.`];
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
  const likeClause = SERVICE_RULES
    .map((rule) => `upper(service_name) like '${rule.like}'`)
    .join(' OR ');
  const where = `requested_date > '${sinceIso(LOOKBACK_DAYS)}' AND (${likeClause})`;

  const url =
    `${DATASET_URL}?$where=${encodeURIComponent(where)}` +
    `&$order=${encodeURIComponent('requested_date DESC')}&$limit=1000`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'CalgaryWatch/1.0 (community safety app)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Calgary 311 returned HTTP ${res.status}`);

  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) throw new Error('Calgary 311 response was not an array');

  const results: NormalizedIncident[] = [];
  // Rows arrive newest-first, so counting up to each cap keeps the most recent.
  const published = new Map<string, number>();

  for (const raw of rows as ServiceRequest[]) {
    const lat = toNumber(raw.latitude);
    const lng = toNumber(raw.longitude);
    if (lat === null || lng === null) continue;

    const id = raw.service_request_id;
    if (!id) continue;

    const rule = ruleFor(raw.service_name ?? '');
    if (!rule) continue;

    const used = published.get(rule.label) ?? 0;
    if (used >= rule.cap) continue;
    published.set(rule.label, used + 1);

    const reported = raw.requested_date ? Date.parse(raw.requested_date) : Date.now();
    const reportedAt = Number.isFinite(reported) ? reported : Date.now();

    results.push({
      title: buildTitle(raw, rule),
      description: buildDescription(raw, rule),
      timestamp: reportedAt,
      category: rule.category,
      neighborhood: raw.comm_name ? titleCase(raw.comm_name) : 'Calgary',
      lat,
      lng,
      source_name: 'City of Calgary 311',
      source_url: SOURCE_URL,
      source_type: 'calgary_open_data',
      data_source: 'official',
      dedup_key: `calgary_311_crime:${id}`,
      expires_at: reportedAt + TTL_MS,
      verified_status: 'community_confirmed',
      report_count: 1,
      email: 'system@calgarywatch.app',
      name: 'City of Calgary 311',
      anonymous: false,
    });
  }

  return results;
}
