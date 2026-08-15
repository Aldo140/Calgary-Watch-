import { useEffect, useState } from 'react';

/**
 * City of Calgary traffic cameras.
 *
 * Dataset k7p9-kppz — 211 cameras, every one carrying a point and a live JPEG.
 * The images are the city's own public feed, refreshed continuously.
 *
 * The dataset stores each image URL as `http://`, which a browser on an HTTPS
 * page refuses to load as mixed content. The host answers `https` correctly
 * (verified: 200, image/jpeg), so the scheme is upgraded here rather than
 * trusting what the record says. `trafficcam.calgary.ca` must also be present
 * in the `img-src` CSP directive in firebase.json or the images are blocked in
 * production while working fine in dev.
 */

export interface TrafficCamera {
  id: string;
  lat: number;
  lng: number;
  /** e.g. "5 Avenue / 7 Street SW" */
  location: string;
  /** NW | NE | SW | SE — Calgary's own addressing. */
  quadrant: string;
  imageUrl: string;
}

const DATASET_URL =
  'https://data.calgary.ca/resource/k7p9-kppz.json?$limit=500';

/** Session cache: the camera list is static, only the images move. */
let _cache: Promise<TrafficCamera[]> | null = null;

/** Upgrades the dataset's http:// image URL so it is not blocked as mixed content. */
export function toSecureImageUrl(raw: string): string {
  return raw.replace(/^http:\/\//i, 'https://');
}

type CameraRow = {
  camera_url?: { url?: string } | string;
  point?: { coordinates?: [number, number] };
  camera_location?: string;
  quadrant?: string;
};

/** Pulls the image URL out of a Socrata URL column, which may be object or string. */
export function extractCameraUrl(value: CameraRow['camera_url']): string | null {
  if (!value) return null;
  if (typeof value === 'object' && value.url) return toSecureImageUrl(value.url);
  if (typeof value === 'string') {
    const match = value.match(/https?:\/\/[^'"\s}]+/);
    return match ? toSecureImageUrl(match[0]) : null;
  }
  return null;
}

export function normalizeCameras(rows: CameraRow[]): TrafficCamera[] {
  const out: TrafficCamera[] = [];
  for (const row of rows) {
    const coords = row.point?.coordinates;
    const imageUrl = extractCameraUrl(row.camera_url);
    // GeoJSON is [lng, lat] — reversing this puts every camera in Somalia.
    if (!coords || coords.length !== 2 || !imageUrl) continue;
    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      id: imageUrl,
      lat,
      lng,
      location: row.camera_location ?? 'Calgary',
      quadrant: row.quadrant ?? '',
      imageUrl,
    });
  }
  return out;
}

function loadCameras(): Promise<TrafficCamera[]> {
  if (!_cache) {
    _cache = fetch(DATASET_URL)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: CameraRow[]) => normalizeCameras(Array.isArray(rows) ? rows : []))
      // A failed camera layer must never take the map down with it.
      .catch(() => []);
  }
  return _cache;
}

/** Loads the camera list the first time the layer is switched on. */
export function useTrafficCameras(enabled: boolean): TrafficCamera[] {
  const [cameras, setCameras] = useState<TrafficCamera[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadCameras().then((list) => {
      if (!cancelled) setCameras(list);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  return cameras;
}
