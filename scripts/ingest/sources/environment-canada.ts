/**
 * Environment and Climate Change Canada — active Calgary weather alerts.
 *
 * Uses the current anonymous MSC GeoMet OGC API. The previous WFS collection
 * names were retired and returned XML service errors with HTTP 200, which made
 * JSON parsing fail during every scheduled ingestion.
 *
 * Official docs:
 * https://eccc-msc.github.io/open-data/msc-data/alerts/readme_alerts-geomet_en/
 */

import type { NormalizedIncident } from '../types.js';

export type { NormalizedIncident };

interface EcProperties {
  alert_name_en?: string;
  alert_short_name_en?: string;
  alert_text_en?: string;
  alert_type?: string;
  confidence_en?: string | null;
  expiration_datetime?: string;
  event_end_datetime?: string;
  feature_name_en?: string;
  impact_en?: string | null;
  publication_datetime?: string;
  status_en?: string;
  validity_datetime?: string;
}

interface EcFeature {
  id: string;
  type: 'Feature';
  geometry: {
    type: 'Point' | 'Polygon' | 'MultiPolygon';
    coordinates: number[] | number[][][] | number[][][][];
  } | null;
  properties: EcProperties;
}

interface EcFeatureCollection {
  type: 'FeatureCollection';
  features?: EcFeature[];
}

const CALGARY_BBOX = '-114.4,50.8,-113.8,51.25';
const CALGARY_LAT = 51.0447;
const CALGARY_LNG = -114.0719;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const API_URL = 'https://api.weather.gc.ca/collections/weather-alerts/items';

function parseTime(value: string | undefined, fallback: number): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function flattenPoints(value: unknown, points: number[][] = []): number[][] {
  if (!Array.isArray(value)) return points;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    points.push(value as number[]);
    return points;
  }
  for (const child of value) flattenPoints(child, points);
  return points;
}

function centroid(feature: EcFeature): { lat: number; lng: number } {
  const points = flattenPoints(feature.geometry?.coordinates);
  if (!points.length) return { lat: CALGARY_LAT, lng: CALGARY_LNG };

  const sums = points.reduce(
    (total, point) => ({ lng: total.lng + point[0], lat: total.lat + point[1] }),
    { lat: 0, lng: 0 },
  );
  return { lat: sums.lat / points.length, lng: sums.lng / points.length };
}

function titleFor(properties: EcProperties): string {
  const name = properties.alert_name_en ?? properties.alert_short_name_en ?? 'Weather alert';
  const type = properties.alert_type?.trim();
  const normalized = name.charAt(0).toUpperCase() + name.slice(1);
  if (!type || normalized.toLowerCase().includes(type.toLowerCase())) return normalized;
  return `${normalized} — ${type}`;
}

export async function fetchEnvironmentCanadaAlerts(): Promise<NormalizedIncident[]> {
  const url = new URL(API_URL);
  url.searchParams.set('f', 'json');
  url.searchParams.set('bbox', CALGARY_BBOX);
  url.searchParams.set('limit', '100');
  url.searchParams.set('filter', "properties.status_en<>'ended'");

  const response = await fetch(url, {
    headers: {
      Accept: 'application/geo+json, application/json',
      'User-Agent': 'CalgaryWatch/1.0 (community safety app; contact jorti104@mtroyal.ca)',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Environment Canada OGC API returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) {
    throw new Error(`Environment Canada OGC API returned ${contentType || 'an unknown content type'}`);
  }

  const data = (await response.json()) as EcFeatureCollection;
  const now = Date.now();

  return (data.features ?? []).flatMap((feature): NormalizedIncident[] => {
    const properties = feature.properties;
    if (properties.status_en?.toLowerCase() === 'ended') return [];

    const expiresAt = parseTime(
      properties.expiration_datetime ?? properties.event_end_datetime,
      now + DEFAULT_TTL_MS,
    );
    if (expiresAt <= now) return [];

    const publishedAt = parseTime(
      properties.publication_datetime ?? properties.validity_datetime,
      now,
    );
    const location = centroid(feature);
    const area = properties.feature_name_en?.trim() || 'Calgary';
    const details = [
      properties.alert_text_en,
      properties.impact_en ? `Impact: ${properties.impact_en}` : '',
      properties.confidence_en ? `Confidence: ${properties.confidence_en}` : '',
    ].filter(Boolean).join('\n\n');

    return [{
      title: titleFor(properties).slice(0, 100),
      description: (details || titleFor(properties)).slice(0, 1000),
      timestamp: publishedAt,
      category: 'weather',
      neighborhood: area.slice(0, 100),
      lat: location.lat,
      lng: location.lng,
      source_name: 'Environment Canada',
      source_url: 'https://weather.gc.ca/warnings/index_e.html',
      source_type: 'env_canada_weather',
      data_source: 'official',
      dedup_key: `env_canada_weather:${feature.id}`,
      expires_at: expiresAt,
      verified_status: 'community_confirmed',
      report_count: 1,
      email: 'system@calgarywatch.app',
      name: 'Environment Canada',
      anonymous: false,
    }];
  });
}
