/**
 * The astronomy and colour behind the homepage's live skyline. Pure and
 * deterministic: the sun's altitude and the moon's phase are computed, not
 * fetched, so the scene is right about day, dusk and night even before (or
 * without) a weather response.
 */

export const CALGARY = { lat: 51.0447, lng: -114.0719 };
const RAD = Math.PI / 180;

/** Solar altitude/azimuth in degrees (azimuth clockwise from north). Low-precision
 * almanac formulae, good to well under a degree, which is ample for a drawing. */
export function sunPosition(date: Date, lat = CALGARY.lat, lng = CALGARY.lng) {
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const ha = (gmst * 15 + lng) * RAD - ra;
  const phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { altitude: alt / RAD, azimuth: ((az / RAD) % 360 + 360) % 360 };
}

/** Fraction of the synodic month since new moon: 0 new, 0.25 first quarter, 0.5 full. */
export function moonPhase(date: Date) {
  const synodic = 29.530588853;
  const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  return ((days / synodic) % 1 + 1) % 1;
}

/** SVG path for the lit part of a moon disk at the given phase. */
export function moonPath(phase: number, cx: number, cy: number, r: number) {
  const k = Math.cos(phase * 2 * Math.PI); // 1 new … -1 full
  const waxing = phase < 0.5;
  const crescent = k > 0;
  const limb = waxing ? 1 : 0;
  const term = crescent ? (waxing ? 0 : 1) : (waxing ? 1 : 0);
  const rx = Math.max(0.01, Math.abs(k) * r);
  return `M${cx},${cy - r} A${r},${r} 0 0 ${limb} ${cx},${cy + r} A${rx},${r} 0 0 ${term} ${cx},${cy - r} Z`;
}

type Rgb = [number, number, number];
const hex = (h: string): Rgb => {
  const full = h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
  return [1, 3, 5].map(i => parseInt(full.slice(i, i + 2), 16)) as Rgb;
};
const toHex = (c: Rgb) => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
export function mix(a: string, b: string, t: number) {
  const x = hex(a), y = hex(b), k = Math.min(1, Math.max(0, t));
  return toHex([0, 1, 2].map(i => x[i] + (y[i] - x[i]) * k) as Rgb);
}

export interface SkyPalette {
  top: string; mid: string; horizon: string;
  far: string; near: string; hills: string;
  city: string; cityLit: string; ground: string; cloud: string;
  /** 0 full daylight … 1 full night; drives stars and window lights. */
  darkness: number;
  /** Which ink reads on this sky. */
  tone: 'dark' | 'light';
}

// Keyframes by solar altitude, low to high.
const KEYS: Array<[number, Omit<SkyPalette, 'darkness' | 'tone'>]> = [
  [-14, { top: '#040a1c', mid: '#0a1733', horizon: '#15254a', far: '#1a2848', near: '#111d38', hills: '#0c1629', city: '#0a1428', cityLit: '#132242', ground: '#07101f', cloud: '#1f2a45' }],
  [-6, { top: '#0c1638', mid: '#2a2f63', horizon: '#6b4a78', far: '#3a3a66', near: '#262a52', hills: '#1a1f3d', city: '#121a36', cityLit: '#1e2a4d', ground: '#0c1428', cloud: '#5a4f7a' }],
  [0, { top: '#23407a', mid: '#b06a8a', horizon: '#ff9a5c', far: '#7c6a94', near: '#51507c', hills: '#34395e', city: '#1f2a4f', cityLit: '#2f3f6a', ground: '#172340', cloud: '#f2b39a' }],
  [8, { top: '#2f66b8', mid: '#8fb2dc', horizon: '#ffd39a', far: '#8ea6c8', near: '#5f7ea8', hills: '#41608a', city: '#243f68', cityLit: '#33568a', ground: '#1f3d44', cloud: '#fff1e6' }],
  [25, { top: '#1f6fd6', mid: '#6fb0ea', horizon: '#cfe9f7', far: '#9dbcdb', near: '#6c90bb', hills: '#4a7197', city: '#25466f', cityLit: '#335d8f', ground: '#24503f', cloud: '#ffffff' }],
];
const GREY = { top: '#7d8fa3', mid: '#a9b6c3', horizon: '#d4dbe1', cloud: '#e6eaee' };

/** Sky colours for a solar altitude, desaturated toward grey as cloud cover rises. */
export function skyPalette(altitude: number, cloudCover = 0): SkyPalette {
  let i = KEYS.findIndex(([a]) => altitude < a);
  if (i === -1) i = KEYS.length;
  const [a0, p0] = KEYS[Math.max(0, i - 1)];
  const [a1, p1] = KEYS[Math.min(KEYS.length - 1, i)];
  const t = a1 === a0 ? 0 : (altitude - a0) / (a1 - a0);
  const out = Object.fromEntries(Object.keys(p0).map(k => [k, mix(p0[k as keyof typeof p0], p1[k as keyof typeof p1], t)])) as Omit<SkyPalette, 'darkness' | 'tone'>;
  const daylight = Math.min(1, Math.max(0, (altitude + 4) / 14));
  const overcast = Math.max(0, (cloudCover - 55) / 45) * 0.75 * daylight;
  for (const k of ['top', 'mid', 'horizon', 'cloud'] as const) out[k] = mix(out[k], GREY[k], overcast);
  const darkness = Math.min(1, Math.max(0, (2 - altitude) / 12));
  return { ...out, darkness, tone: altitude > 4 ? 'dark' : 'light' };
}
