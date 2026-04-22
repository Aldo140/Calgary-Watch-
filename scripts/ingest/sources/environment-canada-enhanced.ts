/**
 * Enhanced Environment Canada Weather Alerts — with quadrant & directional data
 *
 * This extends the base EC weather data with:
 *  - Quadrant information (NE, NW, SE, SW)
 *  - Wind direction vectors (snow moving from SW, rain from NE, etc.)
 *  - Hyper-local directional descriptions
 *  - Separate handling for different weather event types
 */

import type { IncidentCategory } from '../../../src/types/index.js';
import type { NormalizedIncident } from '../types.js';
import { getQuadrant, formatWeatherDirection, formatQuadrantPrefix, getDirectionText, isInCalgarybounds } from './quadrant-utils.js';

export type { NormalizedIncident };

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
    lon?: number;
    lat?: number;
    areaDesc?: string;
  };
}

interface EcFeatureCollection {
  type: 'FeatureCollection';
  features: EcFeature[];
}

const CALGARY_BBOX = '-115.2,50.7,-113.5,51.7';
const WEATHER_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const WFS_URL_ALERTS =
  'https://geo.weather.gc.ca/geomet/features/collections/alert-cap-summary-current/items?f=json' +
  '&bbox=' +
  CALGARY_BBOX +
  '&limit=100';

/**
 * Determine wind/weather direction from description text
 * E.g., "Snow moving from northwest" -> "NW" -> arriving from "SW" perspective
 */
function extractWeatherDirection(description: string): string | null {
  const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const match = description?.toLowerCase().match(new RegExp(`(${directions.join('|')})`));

  if (match) {
    return match[1].toUpperCase().replace(/([A-Z])/g, '$1');
  }

  return null;
}

/**
 * Extract expected wind speed (km/h) from alert description
 */
function extractWindSpeed(description: string): number | null {
  const match = description?.match(/(\d{1,3})\s*(?:km\/h|kph|wnd)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Determine quadrant coverage of a weather event
 */
function determineEventCoverage(
  feature: EcFeature
): { primaryQuadrant: string; affectedArea: string; centroid: { lat: number; lng: number } | null } {
  const geo = feature.geometry;
  let centroid: { lat: number; lng: number } | null = null;

  // Handle Point geometry
  if (geo?.type === 'Point' && geo.coordinates && geo.coordinates.length >= 2) {
    const [lng, lat] = geo.coordinates as [number, number];
    centroid = { lat, lng };
  }

  // Handle Polygon geometry — find centroid
  if (geo?.type === 'Polygon' && geo.coordinates && (geo.coordinates as number[][][]).length > 0) {
    const ring = (geo.coordinates as number[][][])[0];
    let sumLat = 0,
      sumLng = 0;

    for (const [lng, lat] of ring) {
      sumLat += lat;
      sumLng += lng;
    }

    centroid = {
      lat: sumLat / ring.length,
      lng: sumLng / ring.length,
    };
  }

  // Fall back to properties
  if (!centroid && feature.properties.lat && feature.properties.lon) {
    centroid = { lat: feature.properties.lat, lng: feature.properties.lon };
  }

  const quadrant = centroid ? getQuadrant(centroid.lat, centroid.lng) : 'CENTER';
  const direction = centroid ? getDirectionText(centroid.lat, centroid.lng) : '';

  return {
    primaryQuadrant: quadrant,
    affectedArea: `${direction} (${quadrant})`,
    centroid,
  };
}

/**
 * Enhance weather alert with directional & quadrant information
 */
async function fetchEnhancedWeatherAlerts(): Promise<NormalizedIncident[]> {
  const incidents: NormalizedIncident[] = [];

  try {
    const response = await fetch(WFS_URL_ALERTS, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.error(`[EC Enhanced] HTTP ${response.status}: ${response.statusText}`);
      return incidents;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      const body = await response.text();
      console.error(`[EC Enhanced] Unexpected content-type "${contentType}": ${body.substring(0, 120)}`);
      return incidents;
    }

    const json: EcFeatureCollection = await response.json();
    const now = Date.now();

    if (!json.features || !Array.isArray(json.features)) {
      return incidents;
    }

    for (const feature of json.features) {
      if (feature.type !== 'Feature') continue;

      const props = feature.properties;
      const { primaryQuadrant, affectedArea, centroid } = determineEventCoverage(feature);

      if (!centroid || !isInCalgarybounds(centroid.lat, centroid.lng)) {
        continue;
      }

      const headline = props.headline || '';
      const description = props.description || '';
      const event = props.event || 'Weather Alert';
      const severity = props.severity || 'moderate';
      const expires = props.expires ? Date.parse(props.expires) : now + WEATHER_TTL_MS;

      // Extract directional info
      const weatherDirection = extractWeatherDirection(description);
      const windSpeed = extractWindSpeed(description);

      // Build enhanced title with quadrant
      const quadrantPrefix = formatQuadrantPrefix(centroid.lat, centroid.lng);
      let title = `${quadrantPrefix} ${headline.substring(0, 60)}`;

      if (weatherDirection) {
        title = `${quadrantPrefix} ${event} from ${weatherDirection}`;
      }

      // Build enhanced description with directional/quadrant context
      let enhancedDesc = description;

      if (weatherDirection) {
        enhancedDesc = `${event} arriving from the ${weatherDirection}. ${description}`;
      }

      if (windSpeed) {
        enhancedDesc = `${enhancedDesc} Expected wind speeds around ${windSpeed} km/h in the ${affectedArea}.`;
      } else {
        enhancedDesc = `${enhancedDesc} Primary impact area: ${affectedArea}.`;
      }

      const category: IncidentCategory = event.toLowerCase().includes('snow') ||
        event.toLowerCase().includes('rain') ||
        event.toLowerCase().includes('wind')
        ? 'weather'
        : 'emergency';

      const dedupKey = `env_canada_enhanced:${feature.id}:${Math.floor(expires / 1000)}`;

      incidents.push({
        title,
        description: enhancedDesc,
        category,
        neighborhood: affectedArea,
        lat: centroid.lat,
        lng: centroid.lng,
        source_name: 'Environment Canada (Enhanced)',
        source_url: 'https://weather.gc.ca/warnings/index_e.html',
        source_type: 'env_canada_weather',
        data_source: 'official',
        dedup_key: dedupKey,
        expires_at: expires,
        verified_status: 'community_confirmed',
        report_count: 1,
        email: 'system@calgary-watch.local',
        name: 'Environment Canada',
        anonymous: false,
      });
    }
  } catch (error) {
    console.error('[EC Enhanced] Fetch error:', error instanceof Error ? error.message : error);
  }

  return incidents;
}

export async function fetchEnvironmentCanadaEnhanced(): Promise<NormalizedIncident[]> {
  return await fetchEnhancedWeatherAlerts();
}
