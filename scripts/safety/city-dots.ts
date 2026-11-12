/**
 * Builds src/generated/calgary-dots.json: Calgary drawn as a dot matrix, one
 * dot per ~450 m cell, each dot tagged with the community whose City boundary
 * (Open Calgary surr-xmvs) contains it. The /safety hero lights a community's
 * dots when a headline names it.
 *
 * Boundaries change rarely, so this is run by hand and the output committed:
 *   npm run safety:dots
 */
import { writeFileSync } from 'node:fs';

const URL = 'https://data.calgary.ca/resource/surr-xmvs.json?$limit=500';
const STEP_LAT = 0.004; // ~445 m
const STEP_LON = STEP_LAT / Math.cos((51.05 * Math.PI) / 180);

type Ring = number[][];
interface Row { name: string; multipolygon?: { type: string; coordinates: Ring[][] } | string }

const title = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase()).replace(/\bMc(\p{L})/gu, (_, c: string) => `Mc${c.toUpperCase()}`);

function inRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPoly = (x: number, y: number, poly: Ring[]) => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h));

async function main() {
  const rows = (await (await fetch(URL)).json()) as Row[];
  const shapes = rows.flatMap(r => {
    const mp = typeof r.multipolygon === 'string' ? JSON.parse(r.multipolygon.replace(/'/g, '"')) : r.multipolygon;
    return mp?.coordinates ? [{ name: title(r.name), polys: mp.coordinates as Ring[][] }] : [];
  });
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of shapes) for (const p of s.polys) for (const [x, y] of p[0]) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const w = Math.ceil((maxX - minX) / STEP_LON) + 1;
  const h = Math.ceil((maxY - minY) / STEP_LAT) + 1;
  const cells = new Map<string, number[]>();
  for (let iy = 0; iy < h; iy++) {
    const y = maxY - iy * STEP_LAT; // row 0 is north
    for (let ix = 0; ix < w; ix++) {
      const x = minX + ix * STEP_LON;
      const s = shapes.find(sh => sh.polys.some(p => inPoly(x, y, p)));
      if (s) cells.set(s.name, [...(cells.get(s.name) ?? []), iy * w + ix]);
    }
  }
  // Small communities that no cell centre fell into still get their middle dot.
  for (const s of shapes) {
    if (cells.has(s.name)) continue;
    const ring = s.polys[0][0];
    const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
    cells.set(s.name, [Math.round((maxY - cy) / STEP_LAT) * w + Math.round((cx - minX) / STEP_LON)]);
  }
  const names = [...cells.keys()].sort();
  // geo: [west lon, north lat, lon step, lat step] so a lat/lng can be placed on the grid.
  const out = { w, h, geo: [minX, maxY, STEP_LON, STEP_LAT], names, cells: names.map(n => cells.get(n)!) };
  writeFileSync('src/generated/calgary-dots.json', JSON.stringify(out));
  console.log(`${names.length} communities, ${out.cells.flat().length} dots, grid ${w}×${h}`);
}

main();
