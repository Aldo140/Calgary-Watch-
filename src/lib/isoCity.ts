/**
 * Geometry for the desktop "data city": real community boundaries, laid flat
 * on a tilted plane and extruded upward by 311 volume. Pure functions so the
 * projection can be tested without a canvas.
 */

export type Pt = [number, number];

export interface CityBlock {
  key: string;
  /** Outer ring in local km, x east, y north. */
  ring: Pt[];
  centroid: Pt;
}

/** Keep about `max` evenly spaced vertices; enough for a silhouette, cheap to extrude. */
export function simplifyRing(ring: Pt[], max = 28): Pt[] {
  const open = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  if (open.length <= max) return open;
  const step = open.length / max;
  const out: Pt[] = [];
  for (let i = 0; i < max; i++) out.push(open[Math.floor(i * step)]);
  return out;
}

export function centroidOf(ring: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const [px, py] of ring) { x += px; y += py; }
  return [x / Math.max(ring.length, 1), y / Math.max(ring.length, 1)];
}

/** [lng, lat] rings → local kilometres around the city's middle. */
export function toLocalKm(rings: { key: string; ring: Pt[] }[]): CityBlock[] {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const { ring } of rings) for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const lng0 = (minLng + maxLng) / 2;
  const lat0 = (minLat + maxLat) / 2;
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110.57;
  return rings.map(({ key, ring }) => {
    const local = ring.map(([lng, lat]) => [(lng - lng0) * kx, (lat - lat0) * ky] as Pt);
    return { key, ring: local, centroid: centroidOf(local) };
  });
}

export interface View {
  /** Rotation of the city on the table, radians. */
  angle: number;
  /** How flat the table is tipped: 1 is a top-down map, smaller tips it away. */
  tilt: number;
}

export const DEFAULT_VIEW: View = { angle: (-24 * Math.PI) / 180, tilt: 0.52 };

/** Ground point → screen, before scaling. Screen y grows downward, so north recedes up the page. */
export function projectGround([x, y]: Pt, view: View = DEFAULT_VIEW): Pt {
  const c = Math.cos(view.angle);
  const s = Math.sin(view.angle);
  const rx = x * c - y * s;
  const ry = x * s + y * c;
  return [rx, -ry * view.tilt];
}

/** Painter's order: blocks further back (smaller screen y) draw first. */
export function depthOrder(blocks: CityBlock[], view: View = DEFAULT_VIEW): CityBlock[] {
  return [...blocks].sort((a, b) => projectGround(a.centroid, view)[1] - projectGround(b.centroid, view)[1]);
}

/**
 * Shade for a wall running from a to b on screen, 0 (dark) to 1 (lit). Walls
 * facing the viewer read as lit, walls turned sideways fall into shadow, and
 * the light leans in from the left so the two sides of a block differ.
 */
export function wallLight(a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const len = Math.hypot(dx, b[1] - a[1]) || 1;
  const facing = Math.abs(dx) / len;
  return Math.min(1, 0.42 + 0.46 * facing + (dx < 0 ? 0.12 : 0));
}
