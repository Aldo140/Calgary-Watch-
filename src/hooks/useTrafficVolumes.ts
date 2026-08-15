import { useEffect, useState } from 'react';
import { distanceMeters } from '@/src/hooks/useTrafficCameras';

/**
 * Annual average daily traffic volume, by road segment.
 *
 * Dataset cauu-7hnw — 334 measured segments for 2024, each with a volume and
 * the geometry of the stretch it was measured on.
 *
 * This exists because the obvious question about an enforcement camera — how
 * many tickets does it write — has no answer in open data. The City publishes
 * 416 datasets and not one of them carries ticket, violation or fine counts,
 * so any number we showed for that would be invented. What is published is how
 * many vehicles pass, which is the honest version of the same question: it
 * says how busy the intersection the camera watches actually is.
 */

export interface RoadVolume {
  /** City section code, e.g. "12AVS13". */
  section: string;
  /** Vehicles per day, annual average. */
  volume: number;
  lat: number;
  lng: number;
}

const DATASET_URL =
  'https://data.calgary.ca/resource/cauu-7hnw.json?$select=section_name,volume,multilinestring&$limit=400';

/**
 * How close a camera must sit to a measured segment before its volume can be
 * quoted for that camera.
 *
 * Segments are measured stretches of one road. At 150 m the camera is on the
 * stretch that was counted; much beyond that and the number belongs to a
 * different road, and attaching it to this camera would be a fabrication
 * dressed as data.
 */
export const VOLUME_MATCH_M = 150;

type VolumeRow = {
  section_name?: string;
  volume?: string;
  multilinestring?: { coordinates?: number[][][] };
};

/** Midpoint of a segment's geometry — the point the volume is attributed to. */
export function segmentMidpoint(coordinates: number[][][] | undefined): { lat: number; lng: number } | null {
  if (!coordinates) return null;
  const points = coordinates.flat();
  if (points.length === 0) return null;
  // GeoJSON is [lng, lat].
  const [lng, lat] = points[Math.floor(points.length / 2)];
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function normalizeVolumes(rows: VolumeRow[]): RoadVolume[] {
  const out: RoadVolume[] = [];
  for (const row of rows) {
    const mid = segmentMidpoint(row.multilinestring?.coordinates);
    const volume = parseFloat(row.volume ?? '');
    if (!mid || !Number.isFinite(volume) || volume <= 0) continue;
    out.push({ section: row.section_name ?? '', volume, lat: mid.lat, lng: mid.lng });
  }
  return out;
}

/** Volume for the segment a point sits on, or null when none is close enough. */
export function volumeAt(
  lat: number,
  lng: number,
  volumes: RoadVolume[],
  maxMeters: number = VOLUME_MATCH_M,
): number | null {
  let best: { volume: number; distanceM: number } | null = null;
  for (const v of volumes) {
    const distanceM = distanceMeters(lat, lng, v.lat, v.lng);
    if (distanceM <= maxMeters && (!best || distanceM < best.distanceM)) {
      best = { volume: v.volume, distanceM };
    }
  }
  return best ? best.volume : null;
}

/** Session cache: 334 segments counted once a year. */
let _cache: Promise<RoadVolume[]> | null = null;

export function useTrafficVolumes(enabled: boolean): RoadVolume[] {
  const [volumes, setVolumes] = useState<RoadVolume[]>([]);

  useEffect(() => {
    if (!enabled) return;
    if (!_cache) {
      _cache = fetch(DATASET_URL)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: VolumeRow[]) => normalizeVolumes(Array.isArray(rows) ? rows : []))
        .catch(() => []);
    }
    let cancelled = false;
    void _cache.then((list) => { if (!cancelled) setVolumes(list); });
    return () => { cancelled = true; };
  }, [enabled]);

  return volumes;
}
