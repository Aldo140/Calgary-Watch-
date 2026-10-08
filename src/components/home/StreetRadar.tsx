import type { ExampleReport } from '../../lib/homeClaims';
import { BOW, COLOR, ELBOW } from '../community/CityMap';

/**
 * Calgary's own origin: every address is measured from Centre Street and
 * Centre Avenue, which is also where the four quadrants meet. The radar is
 * centred there and plots the live map's real pins from the last 24 hours by
 * their true bearing and distance. Distance is drawn on a square-root scale
 * so the inner city doesn't collapse into a dot; the ring labels stay true.
 */
const ORIGIN = { lat: 51.0486, lng: -114.0708 };
const KM_PER_LAT = 111.32;
const KM_PER_LNG = 111.32 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const C = 160;
const OUTER = 146;
const MAX_KM = 20;
const RINGS = [3, 10, 20];
/** Quadrant labels sit on the diagonals, inside the outer ring. */
const QUAD_AT = OUTER * 0.6;

function project(lat: number, lng: number): [number, number] | null {
  const x = (lng - ORIGIN.lng) * KM_PER_LNG;
  const y = (lat - ORIGIN.lat) * KM_PER_LAT;
  const d = Math.hypot(x, y);
  if (d > MAX_KM * 1.08) return null;
  const r = d ? (OUTER * Math.sqrt(Math.min(d, MAX_KM) / MAX_KM)) / d : 0;
  return [C + x * r, C - y * r];
}
const ringR = (km: number) => OUTER * Math.sqrt(km / MAX_KM);
const path = (pts: [number, number][]) => pts.map(([lat, lng], i) => {
  const p = project(lat, lng) ?? (() => {
    const x = (lng - ORIGIN.lng) * KM_PER_LNG, y = (lat - ORIGIN.lat) * KM_PER_LAT, d = Math.hypot(x, y);
    return [C + (x / d) * OUTER * 1.1, C - (y / d) * OUTER * 1.1] as [number, number];
  })();
  return `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
}).join('');
const RIVER = path(BOW);
const ELBOW_PATH = path(ELBOW);

export function StreetRadar({ pins, className = '' }: { pins: readonly ExampleReport[]; className?: string }) {
  const placed = pins
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map(p => ({ p, xy: project(p.lat!, p.lng!) }))
    .filter((x): x is { p: ExampleReport; xy: [number, number] } => x.xy !== null);
  const newest = placed.reduce<(typeof placed)[number] | undefined>((a, b) => (!a || b.p.timestamp > a.p.timestamp ? b : a), undefined);

  return (
    <svg className={`h-radar ${className}`} viewBox="0 0 320 320" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="h-radar-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#123465" />
          <stop offset=".75" stopColor="#0a2147" />
          <stop offset="1" stopColor="#071a38" />
        </radialGradient>
        <linearGradient id="h-radar-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#00c2e0" stopOpacity="0" />
          <stop offset="1" stopColor="#00c2e0" stopOpacity=".42" />
        </linearGradient>
        <pattern id="h-radar-grid" width="11" height="11" patternUnits="userSpaceOnUse"><path d="M11,0H0V11" fill="none" stroke="rgba(255,255,255,.06)" /></pattern>
        <clipPath id="h-radar-clip"><circle cx={C} cy={C} r={OUTER} /></clipPath>
      </defs>
      <circle cx={C} cy={C} r={OUTER} fill="url(#h-radar-bg)" />
      <g clipPath="url(#h-radar-clip)">
        <rect width="320" height="320" fill="url(#h-radar-grid)" />
        <path className="h-radar-river" d={RIVER} />
        <path className="h-radar-elbow" d={ELBOW_PATH} />
        <g className="h-radar-sweep"><path d={`M${C},${C}L${C + OUTER},${C}A${OUTER},${OUTER} 0 0 0 ${C + OUTER * Math.cos(-0.9)},${C + OUTER * Math.sin(-0.9)}Z`} fill="url(#h-radar-sweep)" /></g>
      </g>
      {RINGS.map(km => <circle key={km} className="h-radar-ring" cx={C} cy={C} r={ringR(km)} />)}
      <circle className="h-radar-edge" cx={C} cy={C} r={OUTER} />
      <path className="h-radar-axis" d={`M${C},${C - OUTER - 6}V${C + OUTER + 6}M${C - OUTER - 6},${C}H${C + OUTER + 6}`} />
      {RINGS.map(km => (
        <text key={km} className="h-radar-km" x={C + 4} y={C - ringR(km) + 11}>{km} km</text>
      ))}
      {(['NW', 'NE', 'SW', 'SE'] as const).map((q, i) => (
        <text key={q} className="h-radar-quad" x={C + (i % 2 ? 1 : -1) * QUAD_AT} y={C + (i < 2 ? -1 : 1) * QUAD_AT + 6} textAnchor="middle">{q}</text>
      ))}
      {placed.map(({ p, xy: [x, y] }, i) => (
        <g key={p.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
          <g className="h-radar-pin" style={{ animationDelay: `${0.25 + (i % 14) * 0.09}s` }}>
            {p === newest?.p ? <circle className="h-radar-ping" r="6" fill={COLOR[p.category] ?? '#00c2e0'} /> : null}
            <circle r="5" fill={COLOR[p.category] ?? '#00c2e0'} stroke="#fff" strokeWidth="1.6" />
          </g>
        </g>
      ))}
      <g transform={`translate(${C} ${C})`} className="h-radar-origin">
        <rect x="-6" y="-6" width="12" height="12" rx="2" transform="rotate(45)" />
      </g>
    </svg>
  );
}

/** A Calgary street blade. The quadrant suffix cycles, because yours could be any of them. */
export function StreetBlade() {
  return (
    <span className="h-blade" aria-hidden="true">
      <span className="h-blade-name">Your St</span>
      <span className="h-blade-quad"><i>SE</i><i>NW</i><i>NE</i><i>SW</i></span>
    </span>
  );
}
