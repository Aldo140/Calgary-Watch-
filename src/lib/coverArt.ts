import type { CommunityRank } from './communityRank';

/**
 * Every community gets an album-style cover: a two-colour gradient picked by
 * its band, with its real boundary drawn flat on top as a silhouette. Pure
 * helpers so the page, the share card and the tests all agree.
 */

export type Pt = [number, number];

export interface Duotone {
  /** Gradient start and end. */
  from: string;
  to: string;
  /** Silhouette and text that read on top of the gradient. */
  ink: string;
}

export const BAND_DUOTONE: Record<CommunityRank['band'], Duotone> = {
  Hot: { from: '#f037a5', to: '#ff4632', ink: '#ffe3f1' },
  High: { from: '#ff6437', to: '#ffc864', ink: '#3d0d00' },
  Elevated: { from: '#7358ff', to: '#b49bc8', ink: '#f1ecff' },
  Calm: { from: '#1e3264', to: '#509bf5', ink: '#d9ebff' },
};

/** Keep about `max` evenly spaced vertices; plenty for a silhouette. */
export function simplifyRing(ring: Pt[], max = 60): Pt[] {
  const open = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  if (open.length <= max) return open;
  const step = open.length / max;
  const out: Pt[] = [];
  for (let i = 0; i < max; i++) out.push(open[Math.floor(i * step)]);
  return out;
}

/**
 * [lng, lat] ring → an SVG path centred in a `box`×`box` square with `pad` to
 * spare, north up, longitude squeezed by latitude so shapes keep their
 * proportions.
 */
export function ringToPath(ring: Pt[], box = 100, pad = 10): string {
  const pts = simplifyRing(ring);
  if (pts.length < 3) return '';
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map(([lng, lat]) => [lng * k, -lat] as Pt);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const s = (box - pad * 2) / span;
  const ox = (box - (maxX - minX) * s) / 2;
  const oy = (box - (maxY - minY) * s) / 2;
  return xy.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + (x - minX) * s).toFixed(1)} ${(oy + (y - minY) * s).toFixed(1)}`).join('') + 'Z';
}
