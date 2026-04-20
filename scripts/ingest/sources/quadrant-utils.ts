/**
 * Calgary Quadrant Utilities
 *
 * Helper functions to determine which quadrant/direction a location belongs to
 * and format directional text (e.g., "SW", "NE") for incident descriptions.
 */

export type Quadrant = 'NE' | 'NW' | 'SE' | 'SW' | 'CENTER';

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

// Calgary city center and approximate bounds
const CALGARY_CENTER = { lat: 51.0447, lng: -114.0719 };
const CALGARY_BOUNDS: BoundingBox = {
  minLat: 50.8,
  maxLat: 51.3,
  minLng: -114.5,
  maxLng: -113.8,
};

/**
 * Determine which quadrant a coordinate belongs to.
 * Returns the primary quadrant (NE, NW, SE, SW) or CENTER if very close to center.
 */
export function getQuadrant(lat: number, lng: number): Quadrant {
  const latDiff = lat - CALGARY_CENTER.lat;
  const lngDiff = lng - CALGARY_CENTER.lng;

  // If very close to center (within ~2km), mark as CENTER
  const latThreshold = 0.01; // ~1.1 km
  const lngThreshold = 0.01; // ~0.7 km at this latitude
  if (Math.abs(latDiff) < latThreshold && Math.abs(lngDiff) < lngThreshold) {
    return 'CENTER';
  }

  if (latDiff >= 0 && lngDiff >= 0) return 'NE';
  if (latDiff >= 0 && lngDiff < 0) return 'NW';
  if (latDiff < 0 && lngDiff >= 0) return 'SE';
  if (latDiff < 0 && lngDiff < 0) return 'SW';

  return 'CENTER';
}

/**
 * Get a more specific directional description based on lat/lng offset from center.
 * Returns strings like "NE", "E-NE", "N", etc. for more granular direction info.
 */
export function getDirectionText(lat: number, lng: number): string {
  const latDiff = lat - CALGARY_CENTER.lat;
  const lngDiff = lng - CALGARY_CENTER.lng;

  // Normalize to angles: lng -> horizontal, lat -> vertical
  const totalDiff = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  if (totalDiff < 0.005) return 'Downtown';

  // 8-point compass
  const angle = Math.atan2(latDiff, -lngDiff) * (180 / Math.PI);
  const normalizedAngle = ((angle + 360) % 360);

  // Each cardinal direction is 45°
  if (normalizedAngle < 22.5 || normalizedAngle >= 337.5) return 'N';
  if (normalizedAngle < 67.5) return 'NW';
  if (normalizedAngle < 112.5) return 'W';
  if (normalizedAngle < 157.5) return 'SW';
  if (normalizedAngle < 202.5) return 'S';
  if (normalizedAngle < 247.5) return 'SE';
  if (normalizedAngle < 292.5) return 'E';
  return 'NE';
}

/**
 * Format an incident location as a quadrant prefix for display.
 * E.g., "[NE] Heavy snow affecting Bridgeland..."
 */
export function formatQuadrantPrefix(lat: number, lng: number): string {
  const quadrant = getQuadrant(lat, lng);
  if (quadrant === 'CENTER') return '[Downtown]';
  return `[${quadrant}]`;
}

/**
 * Enhance a description with directional weather information.
 * E.g., "Snow moving from SW at 40 km/h"
 */
export function formatWeatherDirection(
  baseDescription: string,
  lat: number,
  lng: number,
  windSpeed?: number
): string {
  const direction = getDirectionText(lat, lng);
  const quadrant = getQuadrant(lat, lng);

  if (quadrant === 'CENTER') {
    return baseDescription;
  }

  let enhancedDesc = `${direction} quadrant: ${baseDescription}`;
  if (windSpeed && windSpeed > 0) {
    enhancedDesc += ` (Wind ${windSpeed} km/h)`;
  }

  return enhancedDesc;
}

/**
 * Check if a coordinate is within Calgary bounds.
 */
export function isInCalgarybounds(lat: number, lng: number): boolean {
  return (
    lat >= CALGARY_BOUNDS.minLat &&
    lat <= CALGARY_BOUNDS.maxLat &&
    lng >= CALGARY_BOUNDS.minLng &&
    lng <= CALGARY_BOUNDS.maxLng
  );
}

/**
 * Get approximate neighborhood based on quadrant and rough distance from center.
 */
export function estimateQuadrantArea(lat: number, lng: number): string {
  const quadrant = getQuadrant(lat, lng);
  const latDiff = Math.abs(lat - CALGARY_CENTER.lat);
  const lngDiff = Math.abs(lng - CALGARY_CENTER.lng);
  const totalDiff = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

  // Inner core (Downtown-adjacent): < 0.02
  // Inner ring: 0.02-0.05
  // Outer ring: > 0.05
  const ring = totalDiff < 0.02 ? 'Inner' : totalDiff < 0.05 ? 'Mid' : 'Outer';

  if (quadrant === 'CENTER') return 'Downtown/Central';
  return `${ring} ${quadrant}`;
}
