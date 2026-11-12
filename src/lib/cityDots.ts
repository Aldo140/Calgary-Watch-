import dots from '../generated/calgary-dots.json';

/*
 * Calgary as a dot matrix, one dot per ~450 m, from the City's community
 * boundaries (scripts/safety/city-dots.ts). Shared by the /safety city and the
 * /map city pulse, so both draw the same city.
 */

export const D = dots as { w: number; h: number; geo: [number, number, number, number]; names: string[]; cells: number[][] };

const KEY = new Map<string, number>();
D.names.forEach((n, i) => {
  KEY.set(n.toUpperCase(), i);
  const first = n.split('/')[0].trim().toUpperCase();
  if (!KEY.has(first)) KEY.set(first, i);
});
/** Community index for a name, matching "Bridgeland" to "Bridgeland/Riverside". */
export const indexOf = (community?: string) =>
  community ? KEY.get(community.toUpperCase()) ?? KEY.get(community.split('/')[0].trim().toUpperCase()) : undefined;

/** Which community owns each grid cell (-1 = outside the city). */
export const OWNER = new Int16Array(D.w * D.h).fill(-1);
D.cells.forEach((cs, i) => cs.forEach(c => { OWNER[c] = i; }));
export const ALL: number[] = [];
for (let c = 0; c < OWNER.length; c++) if (OWNER[c] >= 0) ALL.push(c);
/** A stable 0–1 phase per cell, for twinkles that don't move together. */
export const PHASE = new Float32Array(OWNER.length).map((_, c) => ((c * 2654435761) % 1000) / 1000);
export const CENTRE = D.cells.map(cs => {
  let x = 0, y = 0;
  for (const c of cs) { x += c % D.w; y += Math.floor(c / D.w); }
  return [x / cs.length, y / cs.length] as const;
});

// Distance of every dot from downtown, 0–1, for the power-on reveal.
const CORE = indexOf('Downtown Commercial Core');
const [DX, DY] = CORE !== undefined ? CENTRE[CORE] : [D.w / 2, D.h / 2];
export const DIST = new Float32Array(OWNER.length);
{
  let max = 0;
  for (const c of ALL) { DIST[c] = Math.hypot((c % D.w) - DX, Math.floor(c / D.w) - DY); max = Math.max(max, DIST[c]); }
  for (const c of ALL) DIST[c] /= max;
}

/**
 * The city dot nearest a coordinate, or undefined when it's more than ~1 km
 * outside the city (Airdrie, Chestermere, a bad geocode).
 */
export function cellAt(lat: number, lng: number): number | undefined {
  const [west, north, stepLon, stepLat] = D.geo;
  const ix = Math.round((lng - west) / stepLon), iy = Math.round((north - lat) / stepLat);
  let best: number | undefined, bestD = 9;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = ix + dx, y = iy + dy;
    if (x < 0 || y < 0 || x >= D.w || y >= D.h) continue;
    const c = y * D.w + x;
    if (OWNER[c] < 0) continue;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
