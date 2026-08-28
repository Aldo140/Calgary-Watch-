import type {
  TrafficCondition,
  TrafficDemand,
  TrafficFlowMode,
  TrafficFlowSnapshot,
  TrafficSegmentState,
  TrafficTrend,
} from '../types/trafficFlow.js';

export const TRAFFIC_FLOW_COLLECTION = 'live_data';
export const TRAFFIC_FLOW_DOC_ID = 'traffic_flow';
export const TRAFFIC_FLOW_REFRESH_MS = 5 * 60 * 1000;
export const TRAFFIC_FLOW_STALE_MS = 12 * 60 * 1000;

export const CALGARY_TRAFFIC_VOLUME_URL =
  'https://data.calgary.ca/resource/cauu-7hnw.json?$select=section_name,volume,multilinestring&$limit=500';

const FORBIDDEN_KEYS = new Set([
  'advertising_id', 'advertisingid', 'device_id', 'deviceid', 'face_id', 'faceid',
  'hashed_device_id', 'identifier', 'imei', 'license_plate', 'licence_plate', 'mac_address',
  'mobile_ad_id', 'person_id', 'plate', 'trajectory', 'trip_id', 'vehicle_id', 'vehicleid',
]);

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampNumber(value: unknown): number | null {
  const numeric = finiteNumber(value);
  if (numeric !== null) return numeric;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[-\s]/g, '_');
}

/** Reject rather than silently carry identity-shaped provider records. */
export function containsForbiddenTrafficIdentity(value: unknown, depth = 0): boolean {
  if (depth > 4 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((entry) => containsForbiddenTrafficIdentity(entry, depth + 1));
  }
  return Object.entries(value as UnknownRecord).some(([key, child]) => (
    FORBIDDEN_KEYS.has(normalizedKey(key)) || containsForbiddenTrafficIdentity(child, depth + 1)
  ));
}

export function trafficConditionFromSpeeds(
  averageSpeedKph: number | null,
  freeFlowSpeedKph: number | null,
): TrafficCondition {
  if (averageSpeedKph === null || freeFlowSpeedKph === null || freeFlowSpeedKph <= 0) return 'unknown';
  const ratio = averageSpeedKph / freeFlowSpeedKph;
  if (ratio >= 0.78) return 'free';
  if (ratio >= 0.52) return 'moderate';
  if (ratio >= 0.25) return 'heavy';
  return 'stopped';
}

function trafficTrend(value: unknown): TrafficTrend {
  return value === 'improving' || value === 'stable' || value === 'worsening' ? value : 'unknown';
}

function trafficMode(value: unknown): TrafficFlowMode {
  return value === 'observed' || value === 'estimated' || value === 'baseline' ? value : 'observed';
}

function demandForVolume(volume: number, cuts: [number, number, number]): TrafficDemand {
  if (volume <= cuts[0]) return 'low';
  if (volume <= cuts[1]) return 'medium';
  if (volume <= cuts[2]) return 'high';
  return 'very_high';
}

function quantile(sorted: number[], amount: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * amount))];
}

function lineFromGeoJson(value: unknown): Array<[number, number]> {
  const geometryRecord = record(value);
  const geometry = geometryRecord?.geometry && record(geometryRecord.geometry)
    ? record(geometryRecord.geometry)
    : geometryRecord;
  const rawCoordinates = geometry?.coordinates;
  if (!Array.isArray(rawCoordinates)) return [];

  let line: unknown[] = rawCoordinates;
  if (geometry?.type === 'MultiLineString' || Array.isArray(rawCoordinates[0]?.[0])) {
    const candidates = rawCoordinates.filter(Array.isArray) as unknown[][];
    line = candidates.sort((a, b) => b.length - a.length)[0] ?? [];
  }

  const points: Array<[number, number]> = [];
  for (const point of line) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const lng = finiteNumber(point[0]);
    const lat = finiteNumber(point[1]);
    if (lat === null || lng === null || lat < 49 || lat > 53 || lng < -116 || lng > -112) continue;
    points.push([lat, lng]);
  }
  return simplifyLine(points, 180);
}

function lineFromProvider(row: UnknownRecord): Array<[number, number]> {
  if (row.geometry) return lineFromGeoJson(row.geometry);
  if (Array.isArray(row.coordinates)) {
    const order = row.coordinateOrder === 'lat_lng' ? 'lat_lng' : 'lng_lat';
    const points: Array<[number, number]> = [];
    for (const point of row.coordinates) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const first = finiteNumber(point[0]);
      const second = finiteNumber(point[1]);
      if (first === null || second === null) continue;
      const lat = order === 'lat_lng' ? first : second;
      const lng = order === 'lat_lng' ? second : first;
      if (lat >= 49 && lat <= 53 && lng >= -116 && lng <= -112) points.push([lat, lng]);
    }
    return simplifyLine(points, 180);
  }
  return [];
}

/** Even sampling controls Firestore document size without changing endpoints. */
export function simplifyLine(points: Array<[number, number]>, maxPoints: number): Array<[number, number]> {
  if (points.length <= maxPoints) return points;
  const simplified: Array<[number, number]> = [];
  for (let i = 0; i < maxPoints; i += 1) {
    simplified.push(points[Math.round((i * (points.length - 1)) / (maxPoints - 1))]);
  }
  return simplified;
}

function providerRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = record(payload);
  if (!root) return [];
  if (Array.isArray(root.segments)) return root.segments;
  if (Array.isArray(root.features)) {
    return root.features.map((feature) => {
      const featureRecord = record(feature) ?? {};
      return { ...(record(featureRecord.properties) ?? {}), geometry: featureRecord.geometry };
    });
  }
  return [];
}

/**
 * Normalize a provider payload into the only shape Calgary Watch publishes.
 * Supported input is an array, `{segments: []}`, or a GeoJSON FeatureCollection.
 */
export function normalizeTrafficProviderPayload(
  payload: unknown,
  now = Date.now(),
  source = 'Aggregate mobility provider',
): TrafficSegmentState[] {
  const out: TrafficSegmentState[] = [];
  for (const candidate of providerRows(payload).slice(0, 500)) {
    const row = record(candidate);
    if (!row || containsForbiddenTrafficIdentity(row)) continue;
    const geometry = lineFromProvider(row);
    if (geometry.length < 2) continue;

    const idValue = row.segmentId ?? row.segment_id ?? row.id;
    const id = typeof idValue === 'string' || typeof idValue === 'number' ? String(idValue).slice(0, 160) : '';
    if (!id) continue;

    const averageSpeedKph = finiteNumber(row.averageSpeedKph ?? row.average_speed_kph ?? row.speedKph ?? row.speed_kph);
    const freeFlowSpeedKph = finiteNumber(row.freeFlowSpeedKph ?? row.free_flow_speed_kph ?? row.freeFlowKph);
    const vehicleCount = finiteNumber(row.vehicleCount ?? row.vehicle_count);
    const annualDailyVolume = finiteNumber(row.annualDailyVolume ?? row.annual_daily_volume);
    const confidence = clamp(finiteNumber(row.confidence) ?? 0.7, 0, 1);
    const updatedAt = timestampNumber(row.updatedAt ?? row.updated_at ?? row.timestamp) ?? now;
    const nameValue = row.name ?? row.roadName ?? row.road_name;
    const name = typeof nameValue === 'string' && nameValue.trim() ? nameValue.trim().slice(0, 180) : `Road segment ${id}`;
    const sources = Array.isArray(row.sources)
      ? row.sources.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : [source];

    out.push({
      id,
      name,
      geometry,
      updatedAt,
      mode: trafficMode(row.mode),
      condition: trafficConditionFromSpeeds(averageSpeedKph, freeFlowSpeedKph),
      trend: trafficTrend(row.trend),
      demand: 'unknown',
      confidence,
      averageSpeedKph,
      freeFlowSpeedKph,
      vehicleCount,
      annualDailyVolume,
      sources: sources.length ? sources : [source],
    });
  }
  return out;
}

type AnnualVolumeRow = {
  section_name?: unknown;
  volume?: unknown;
  multilinestring?: unknown;
};

/** Convert Calgary's annual road counts into an honest non-live fallback. */
export function normalizeAnnualTrafficVolumes(rows: unknown[], now = Date.now()): TrafficSegmentState[] {
  const parsed = rows.flatMap((candidate) => {
    const row = (record(candidate) ?? {}) as AnnualVolumeRow;
    const volume = finiteNumber(row.volume);
    const geometry = lineFromGeoJson(row.multilinestring);
    if (volume === null || volume <= 0 || geometry.length < 2) return [];
    const name = typeof row.section_name === 'string' && row.section_name.trim()
      ? row.section_name.trim()
      : 'Measured Calgary road';
    return [{ name, volume, geometry }];
  });
  const sorted = parsed.map((row) => row.volume).sort((a, b) => a - b);
  const cuts: [number, number, number] = [quantile(sorted, 0.25), quantile(sorted, 0.55), quantile(sorted, 0.82)];

  return parsed.map((row, index) => ({
    id: `calgary-volume:${row.name}:${index}`,
    name: row.name,
    geometry: row.geometry,
    updatedAt: now,
    mode: 'baseline',
    condition: 'unknown',
    trend: 'unknown',
    demand: demandForVolume(row.volume, cuts),
    confidence: 1,
    averageSpeedKph: null,
    freeFlowSpeedKph: null,
    vehicleCount: null,
    annualDailyVolume: row.volume,
    sources: ['City of Calgary annual traffic volume'],
  }));
}

export function makeTrafficFlowSnapshot(
  segments: TrafficSegmentState[],
  source: string,
  updatedAt = Date.now(),
  sourceUrl?: string,
): TrafficFlowSnapshot {
  const mode = segments.some((segment) => segment.mode === 'observed')
    ? 'observed'
    : segments.some((segment) => segment.mode === 'estimated') ? 'estimated' : 'baseline';
  return { schemaVersion: 1, updatedAt, mode, source, ...(sourceUrl ? { sourceUrl } : {}), segments };
}

export function parseTrafficFlowSnapshot(value: unknown): TrafficFlowSnapshot | null {
  const root = record(value);
  if (!root || root.schemaVersion !== 1 || !Array.isArray(root.segments)) return null;
  const updatedAt = finiteNumber(root.updatedAt);
  if (updatedAt === null) return null;
  const segments = normalizeStoredSegments(root.segments);
  if (segments.length === 0) return null;
  return {
    schemaVersion: 1,
    updatedAt,
    mode: trafficMode(root.mode),
    source: typeof root.source === 'string' ? root.source : 'Aggregate traffic flow',
    ...(typeof root.sourceUrl === 'string' ? { sourceUrl: root.sourceUrl } : {}),
    segments,
  };
}

function normalizeStoredSegments(values: unknown[]): TrafficSegmentState[] {
  const out: TrafficSegmentState[] = [];
  for (const value of values.slice(0, 500)) {
    const row = record(value);
    if (!row || containsForbiddenTrafficIdentity(row)) continue;
    const id = typeof row.id === 'string' ? row.id : '';
    const name = typeof row.name === 'string' ? row.name : '';
    if (!id || !name || !Array.isArray(row.geometry)) continue;
    const geometry = row.geometry.flatMap((point) => {
      if (!Array.isArray(point) || point.length < 2) return [];
      const lat = finiteNumber(point[0]);
      const lng = finiteNumber(point[1]);
      return lat !== null && lng !== null ? [[lat, lng] as [number, number]] : [];
    });
    if (geometry.length < 2) continue;
    const averageSpeedKph = finiteNumber(row.averageSpeedKph);
    const freeFlowSpeedKph = finiteNumber(row.freeFlowSpeedKph);
    out.push({
      id,
      name,
      geometry,
      updatedAt: finiteNumber(row.updatedAt) ?? Date.now(),
      mode: trafficMode(row.mode),
      condition: trafficConditionFromSpeeds(averageSpeedKph, freeFlowSpeedKph),
      trend: trafficTrend(row.trend),
      demand: row.demand === 'low' || row.demand === 'medium' || row.demand === 'high' || row.demand === 'very_high'
        ? row.demand : 'unknown',
      confidence: clamp(finiteNumber(row.confidence) ?? 0, 0, 1),
      averageSpeedKph,
      freeFlowSpeedKph,
      vehicleCount: finiteNumber(row.vehicleCount),
      annualDailyVolume: finiteNumber(row.annualDailyVolume),
      sources: Array.isArray(row.sources)
        ? row.sources.filter((item): item is string => typeof item === 'string').slice(0, 5)
        : [],
    });
  }
  return out;
}
