/**
 * City of Calgary 311 — safety-relevant service requests
 *
 * Why this source exists: Calgary publishes no live, geocoded, per-incident
 * crime feed. Community Crime Statistics (78gh-n26t) now requires a login,
 * Social Disorder Statistics (4evm-wx9a) carries no location column at all, and
 * Calgary Police have no public incident feed. 311 is the only real-time,
 * geocoded, municipal incident data Calgary publishes.
 *
 * ─── How the rules below were derived ──────────────────────────────────────
 *
 * A 30-day sample contained 47,643 requests across 385 distinct service types,
 * grouped under agency prefixes:
 *
 *   WRS 8183 · Roads 7967 · Bylaw 7719 · Parks 7023 · WATS 3955
 *   AT 1971 · Corporate 1675 · CT 1177 · AS 1090 · DBBS 995 · CFD 989
 *
 * Most of that is not safety data — long grass (3,603), tree concerns (2,332),
 * dead animal pickup (892), waste carts, property tax enquiries. Loose keyword
 * matching pulls those in, which is why the earlier approach gave an
 * unpredictable mix dominated by graffiti.
 *
 * These rules therefore name EXACT service_name values, each verified to exist
 * and to be 100% geocoded in a 14-day sample. Nothing is guessed.
 *
 * ─── Deliberate exclusions ─────────────────────────────────────────────────
 *
 *   Corporate - Encampment Concerns (645/30d) — living rough is not a crime,
 *     and mapping encampments as incidents would be wrong and harmful.
 *   Bylaw - Noise Concerns (1004/30d) — quality-of-life rather than safety, and
 *     the volume would swamp everything else.
 *   Bylaw - Long Grass, Parks - Tree Concern, Roads - Dead Animal, WRS carts —
 *     maintenance, not incidents.
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
 * Exact 311 service_name → category, display label, and per-run cap.
 *
 * Caps keep the mix balanced and current. Graffiti alone runs ~1,000 reports a
 * month and would otherwise be the entire map — which is what happened when
 * this source shipped matching only graffiti and vandalism. Each rule takes its
 * most recent N, so every type stays represented and recent.
 *
 * Volumes in trailing comments are per 30 days, from the sample above.
 */
interface ServiceRule {
  service: string;
  category: IncidentCategory;
  label: string;
  cap: number;
}

const SERVICE_RULES: ServiceRule[] = [
  // ── Crime: property offences and disorder ───────────────────────────────
  { service: 'Bylaw - Disturbance and Behavioural Concerns', category: 'crime', label: 'Disturbance reported', cap: 10 }, // 510
  { service: 'Corporate - Graffiti Concerns', category: 'crime', label: 'Graffiti', cap: 8 }, // 1030
  { service: 'Bylaw - Vehicle Concerns', category: 'crime', label: 'Abandoned or problem vehicle', cap: 5 }, // 204
  { service: 'Bylaw - Vandalism and Property Damage Concerns', category: 'crime', label: 'Vandalism', cap: 5 }, // 40
  { service: 'DBBS - Unsafe Derelict or Unsecure Property', category: 'crime', label: 'Derelict or unsecured property', cap: 4 }, // 34
  { service: 'CT - Transit Safety / Public Etiquette', category: 'crime', label: 'Transit safety concern', cap: 4 }, // 32

  // ── Infrastructure: failures and hazards ────────────────────────────────
  { service: 'WATS - Water Main Break or Leak', category: 'infrastructure', label: 'Water main break', cap: 6 }, // 394
  { service: 'Roads - Debris on Street/Sidewalk/Boulevard', category: 'infrastructure', label: 'Debris on the road', cap: 5 }, // 825
  { service: 'WATS - Sewage Back-up', category: 'infrastructure', label: 'Sewage back-up', cap: 4 }, // 442
  { service: 'WATS - Water Outage', category: 'infrastructure', label: 'Water outage', cap: 4 }, // 144
  { service: 'Roads - Streetlight Damage', category: 'infrastructure', label: 'Streetlight damage', cap: 4 }, // 26
  { service: 'DBBS - Safety Response', category: 'infrastructure', label: 'Building safety response', cap: 4 }, // 72
  { service: 'WATS - Spills Entering Storm System', category: 'infrastructure', label: 'Spill into storm system', cap: 3 }, // 119

  // ── Traffic ─────────────────────────────────────────────────────────────
  { service: 'Roads - Traffic or Pedestrian Light Repair', category: 'traffic', label: 'Traffic or pedestrian signal fault', cap: 6 }, // 371
  { service: 'Roads - Signs - Missing - Damaged', category: 'traffic', label: 'Missing or damaged road sign', cap: 5 }, // 446
  { service: 'Roads - Pothole Maintenance', category: 'traffic', label: 'Pothole', cap: 4 }, // 744
];

const RULES_BY_SERVICE = new Map(SERVICE_RULES.map((r) => [r.service, r]));

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
 * Fetch recent geocoded safety-relevant 311 requests.
 *
 * Throws on transport, HTTP or shape failure so the pipeline logs it rather
 * than silently contributing zero — the failure mode that hid a broken 511
 * source for weeks.
 */
export async function fetchCalgary311Crime(): Promise<NormalizedIncident[]> {
  // Exact-match IN list rather than LIKE patterns: 385 service types share
  // words, and loose matching is what made the earlier results unpredictable.
  const inList = SERVICE_RULES
    .map((rule) => `'${rule.service.replace(/'/g, "''")}'`)
    .join(', ');
  const where = `requested_date > '${sinceIso(LOOKBACK_DAYS)}' AND service_name in (${inList})`;

  const url =
    `${DATASET_URL}?$where=${encodeURIComponent(where)}` +
    `&$order=${encodeURIComponent('requested_date DESC')}&$limit=2000`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'CalgaryWatch/1.0 (community safety app)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Calgary 311 returned HTTP ${res.status}`);

  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) throw new Error('Calgary 311 response was not an array');

  const results: NormalizedIncident[] = [];
  // Rows arrive newest-first, so counting up to each cap keeps the most recent.
  const published = new Map<string, number>();

  for (const raw of rows as ServiceRequest[]) {
    const rule = RULES_BY_SERVICE.get(raw.service_name ?? '');
    if (!rule) continue;

    const lat = toNumber(raw.latitude);
    const lng = toNumber(raw.longitude);
    if (lat === null || lng === null) continue;

    const id = raw.service_request_id;
    if (!id) continue;

    const used = published.get(rule.service) ?? 0;
    if (used >= rule.cap) continue;
    published.set(rule.service, used + 1);

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
