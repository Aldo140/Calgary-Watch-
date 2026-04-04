/**
 * Environment Canada — Active weather alerts for Calgary
 *
 * Uses the MSC GeoMet WFS service (no auth, no rate limit mentioned).
 * Docs: https://eccc-msc.github.io/open-data/msc-geomet/readme_en/
 *
 * Bounding box: Calgary Metro roughly -115.2, 50.7, -113.5, 51.7
 */

import type { IncidentCategory } from '../../../src/types/index.js';
import type { NormalizedIncident } from '../types.js';

export type { NormalizedIncident };

// ---------------------------------------------------------------------------
// GeoJSON feature shape returned by MSC GeoMet
// ---------------------------------------------------------------------------

interface EcFeature {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'Point' | 'Polygon' | 'MultiPolygon';
    coordinates: number[] | number[][][] | number[][][][];
  } | null;
  properties: {
    identifier: string;
    headline: string;
    description?: string;
    event?: string;
    severity?: string;
    certainty?: string;
    effective?: string;
    expires?: string;
    // The centroid lon/lat when geometry is a polygon
    lon?: number;
    lat?: number;
  };
}

interface EcFeatureCollection {
  type: 'FeatureCollection';
  features: EcFeature[];
}

// ---------------------------------------------------------------------------
// Calgary bounding box constants
// ---------------------------------------------------------------------------

const CALGARY_BBOX = '-115.2,50.7,-113.5,51.7';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const EC_BASE = 'https://geo.weather.gc.ca/geomet';

// Centroid of Calgary — used when the alert has no geometry.
const CALGARY_LAT = 51.0447;
const CALGARY_LNG = -114.0719;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

function extractCentroid(feature: EcFeature): { lat: number; lng: number } {
  // Some features provide lon/lat directly on properties (MSC GeoMet behaviour).
  if (feature.properties.lat !== undefined && feature.properties.lon !== undefined) {
    return { lat: feature.properties.lat, lng: feature.properties.lon };
  }
  if (!feature.geometry) return { lat: CALGARY_LAT, lng: CALGARY_LNG };

  if (feature.geometry.type === 'Point') {
    const [lng, lat] = feature.geometry.coordinates as number[];
    return { lat, lng };
  }

  // For polygon/multipolygon take a rough centroid from the first ring.
  if (feature.geometry.type === 'Polygon') {
    const ring = (feature.geometry.coordinates as number[][][])[0];
    const avgLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const avgLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    return { lat: avgLat, lng: avgLng };
  }

  // MultiPolygon: use first polygon first ring.
  if (feature.geometry.type === 'MultiPolygon') {
    const ring = (feature.geometry.coordinates as number[][][][])[0][0];
    const avgLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const avgLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    return { lat: avgLat, lng: avgLng };
  }

  return { lat: CALGARY_LAT, lng: CALGARY_LNG };
}

function toUnixMs(iso: string | undefined, fallback: number): number {
  if (!iso) return fallback;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? fallback : t;
}

function mapToCategory(_event: string | undefined): IncidentCategory {
  const ev = (_event ?? '').toLowerCase();
  if (ev.includes('wind') || ev.includes('tornado') || ev.includes('hail') ||
      ev.includes('blizzard') || ev.includes('snow') || ev.includes('rain') ||
      ev.includes('frost') || ev.includes('fog') || ev.includes('storm')) {
    return 'weather';
  }
  return 'weather'; // all EC alerts are weather-related
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchEnvironmentCanadaAlerts(): Promise<NormalizedIncident[]> {
  const url =
    `${EC_BASE}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=ALERTS&outputFormat=application/json` +
    `&BBOX=${CALGARY_BBOX},EPSG:4326`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'CalgaryWatch/1.0 (community safety app; contact jorti104@mtroyal.ca)' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Environment Canada WFS returned HTTP ${res.status}`);
  }

  const data: EcFeatureCollection = await res.json() as EcFeatureCollection;

  const now = Date.now();
  const results: NormalizedIncident[] = [];

  for (const feature of data.features ?? []) {
    const p = feature.properties;
    if (!p.headline) continue;

    const { lat, lng } = extractCentroid(feature);
    const expiresAt = toUnixMs(p.expires, now + DEFAULT_TTL_MS);

    // Skip already-expired alerts that GeoMet occasionally returns.
    if (expiresAt < now) continue;

    const descriptionLines = [
      p.description ?? p.headline,
      p.severity ? `Severity: ${p.severity}` : '',
      p.certainty ? `Certainty: ${p.certainty}` : '',
    ].filter(Boolean);

    results.push({
      title: p.headline.slice(0, 100),
      description: descriptionLines.join(' · ').slice(0, 1000),
      category: mapToCategory(p.event),
      neighborhood: 'Calgary',
      lat,
      lng,
      source_name: 'Environment Canada',
      source_url: 'https://weather.gc.ca/city/pages/ab-52_metric_e.html',
      source_type: 'env_canada_weather',
      data_source: 'official',
      dedup_key: `env_canada_weather:${p.identifier ?? feature.id}`,
      expires_at: expiresAt,
      verified_status: 'community_confirmed',
      report_count: 1,
      email: 'system@calgarywatch.app',
      name: 'Environment Canada',
      anonymous: false,
    });
  }

  return results;
}
