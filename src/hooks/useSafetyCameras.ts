import { useEffect, useState } from 'react';
import { distanceMeters } from '@/src/hooks/useTrafficCameras';

/**
 * City of Calgary intersection safety cameras.
 *
 * Dataset dv2f-necx — 57 fixed cameras, each with a point, the community and
 * ward it sits in, and a description carrying the intersection and the
 * direction of travel it watches.
 *
 * These are the cameras that issue tickets. Calgary runs them for red-light
 * running *and* for speeding through a green, so calling them "red light
 * cameras" understates them. They are a different thing from the traffic
 * cameras in `useTrafficCameras`, which are public webcams that watch traffic
 * and record nothing.
 *
 * Calgary does not publish mobile photo radar locations as open data, so this
 * is the complete set of fixed enforcement points and nothing more. Do not
 * describe the layer in a way that implies otherwise.
 */

export type Direction = 'Northbound' | 'Southbound' | 'Eastbound' | 'Westbound' | '';

export interface SafetyCamera {
  id: string;
  lat: number;
  lng: number;
  /** e.g. "Macleod Trail and 12 Avenue S.E." */
  intersection: string;
  /** Direction of travel the camera faces. */
  direction: Direction;
  /** Official community name, as published (upper case). */
  community: string;
  quadrant: string;
  ward: string;
}

const DATASET_URL = 'https://data.calgary.ca/resource/dv2f-necx.json?$limit=200';

const ABBREVIATED: Record<string, Direction> = {
  nb: 'Northbound', sb: 'Southbound', eb: 'Eastbound', wb: 'Westbound',
};

/**
 * Pulls the intersection and direction out of the description field.
 *
 * The 57 rows use at least eight different shapes for the same information —
 * `Direction:` with and without a preceding newline, with a space before the
 * colon, with no space after it, and a handful of records that just append a
 * bare `Westbound` or `SB`. Anything that only handles the common case drops
 * real cameras, so this handles all of them and falls back to keeping the
 * whole string as the intersection rather than losing the record.
 */
export function parseCameraDescription(raw: string): { intersection: string; direction: Direction } {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { intersection: '', direction: '' };

  const labelled = text.split(/\s*Direction\s*:\s*/i);
  if (labelled.length === 2) {
    return {
      intersection: cleanIntersection(labelled[0]),
      direction: normalizeDirection(labelled[1]),
    };
  }

  // No "Direction:" label — some records just end with the direction itself.
  const trailing = text.match(/\s+(Northbound|Southbound|Eastbound|Westbound|NB|SB|EB|WB)$/i);
  if (trailing) {
    return {
      intersection: cleanIntersection(text.slice(0, trailing.index ?? undefined)),
      direction: normalizeDirection(trailing[1]),
    };
  }

  return { intersection: cleanIntersection(text), direction: '' };
}

function normalizeDirection(value: string): Direction {
  const v = value.trim().toLowerCase();
  if (ABBREVIATED[v]) return ABBREVIATED[v];
  const full = (['northbound', 'southbound', 'eastbound', 'westbound'] as const)
    .find((d) => v.startsWith(d));
  return full ? ((full.charAt(0).toUpperCase() + full.slice(1)) as Direction) : '';
}

/** `&` is how half the records join the two streets; `and` is how the rest do. */
function cleanIntersection(value: string): string {
  return value.replace(/\s*&\s*/g, ' and ').replace(/[\s,]+$/, '').trim();
}

type CameraRow = {
  description?: string;
  quadrant?: string;
  community?: string;
  ward?: string;
  point?: { coordinates?: [number, number] };
};

export function normalizeSafetyCameras(rows: CameraRow[]): SafetyCamera[] {
  const out: SafetyCamera[] = [];
  for (const row of rows) {
    const coords = row.point?.coordinates;
    // GeoJSON is [lng, lat].
    if (!coords || coords.length !== 2) continue;
    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const { intersection, direction } = parseCameraDescription(row.description ?? '');
    if (!intersection) continue;
    out.push({
      // Two cameras watch the same intersection from opposite directions, so
      // the intersection alone is not unique.
      id: `${lat.toFixed(6)},${lng.toFixed(6)}|${direction}`,
      lat,
      lng,
      intersection,
      direction,
      community: row.community ?? '',
      quadrant: row.quadrant ?? '',
      ward: row.ward ?? '',
    });
  }
  return out;
}

/** Session cache: 57 fixed installations that do not move between page loads. */
let _cache: Promise<SafetyCamera[]> | null = null;

function loadSafetyCameras(): Promise<SafetyCamera[]> {
  if (!_cache) {
    _cache = fetch(DATASET_URL)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: CameraRow[]) => normalizeSafetyCameras(Array.isArray(rows) ? rows : []))
      // A failed layer must never take the map down with it.
      .catch(() => []);
  }
  return _cache;
}

export function useSafetyCameras(enabled: boolean): SafetyCamera[] {
  const [cameras, setCameras] = useState<SafetyCamera[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadSafetyCameras().then((list) => { if (!cancelled) setCameras(list); });
    return () => { cancelled = true; };
  }, [enabled]);

  return cameras;
}

/**
 * Safety cameras within `maxMeters` of a point, nearest first.
 *
 * 1 km rather than the 400 m used for traffic cameras: a webcam is only
 * relevant if it can see the place in question, but an enforcement camera on
 * your route matters from further away.
 */
export const SAFETY_CAMERA_RADIUS_M = 1000;

export function findSafetyCamerasNear(
  lat: number,
  lng: number,
  cameras: SafetyCamera[],
  maxMeters: number = SAFETY_CAMERA_RADIUS_M,
): Array<{ camera: SafetyCamera; distanceM: number }> {
  return cameras
    .map((camera) => ({ camera, distanceM: distanceMeters(lat, lng, camera.lat, camera.lng) }))
    .filter((c) => c.distanceM <= maxMeters)
    .sort((a, b) => a.distanceM - b.distanceM);
}
