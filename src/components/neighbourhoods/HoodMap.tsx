import { Link } from 'react-router-dom';
import type { Neighbourhood } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { hoodCentre, type LatLng } from '../../lib/neighbourhoods';

/**
 * A drawn map of inner Calgary: the Bow and the Elbow, the quadrant lines, and
 * a pin for each neighbourhood we write about. Not to survey scale, but every
 * pin is placed from its real latitude and longitude, so it reads true.
 */
const W = 560, H = 420;
// Centred on Centre Street at the quadrant line, with a gentle fisheye: the
// close-together inner-city neighbourhoods spread out, the edges tuck in.
// Straight lines through the centre (the quadrant axes) stay straight.
const CENTRE: LatLng = [51.05, -114.0625];
const KM_LAT = 111.2, KM_LNG = 70.0, R_MAX = 12, PX_PER_KM = 25, BULGE = 0.55;
export const project = ([lat, lng]: LatLng): [number, number] => {
  const dx = (lng - CENTRE[1]) * KM_LNG, dy = (lat - CENTRE[0]) * KM_LAT;
  const r = Math.hypot(dx, dy);
  const f = r ? (R_MAX * (r / R_MAX) ** BULGE) / r : 1;
  return [W / 2 + dx * f * PX_PER_KM, H / 2 - dy * f * PX_PER_KM];
};
const line = (pts: LatLng[]) => {
  const p = pts.map(project);
  // A smooth curve through the points (Catmull-Rom as cubic Béziers).
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i], b = p[i], c = p[i + 1], e = p[i + 2] ?? c;
    d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)},${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)},${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
  }
  return d;
};
const BOW = line([[51.13, -114.30], [51.108, -114.222], [51.095, -114.205], [51.088, -114.186], [51.079, -114.168], [51.068, -114.148], [51.059, -114.124], [51.055, -114.100], [51.0545, -114.078], [51.0535, -114.062], [51.052, -114.046], [51.045, -114.033], [51.036, -114.022], [51.024, -114.012], [51.008, -114.004], [51.0, -114.0], [50.96, -113.99]]);
const ELBOW = line([[50.96, -114.15], [51.0, -114.128], [51.008, -114.112], [51.016, -114.096], [51.021, -114.082], [51.028, -114.071], [51.034, -114.058], [51.039, -114.047], [51.046, -114.040]]);
const [CX, CY] = project(CENTRE);
const QUAD_RECT: Record<string, [number, number, number, number]> = {
  NW: [0, 0, CX, CY], NE: [CX, 0, W - CX, CY], SW: [0, CY, CX, H - CY], SE: [CX, CY, W - CX, H - CY],
};
const DOWNTOWN = project([51.047, -114.066]);

export function HoodMap({ hoods, active, quadrant, onHover, compact = false, numbered = false, label = 'Map of the neighbourhoods we cover' }: {
  hoods: readonly Neighbourhood[]; numbered?: boolean; active?: string; quadrant?: string | null; onHover?: (slug?: string) => void; compact?: boolean; label?: string;
}) {
  const pins = hoods.map(h => ({ h, at: hoodCentre(h) })).filter((p): p is { h: Neighbourhood; at: LatLng } => !!p.at);
  // Inner-city pins sit close together, so labels step down until they stop overlapping.
  const boxes: Array<[number, number, number, number]> = [];
  const placed = pins.map(({ h, at }) => [h, ...project(at)] as const).sort((a, b) => a[2] - b[2]).map(([h, x, y]) => {
    const w = h.title.length * 7.4 + 16;
    const left = x > W - 150;
    const x0 = left ? x - 16 - w : x + 16;
    let dy = 0;
    const hits = (top: number) => boxes.some(([bx, by, bw, bh]) => x0 < bx + bw + 4 && x0 + w + 4 > bx && top < by + bh + 3 && top + 22 + 3 > by);
    while (hits(y - 30 + dy) && dy < 200) dy += 26;
    boxes.push([x0, y - 30 + dy, w, 22]);
    return { h, x, y, left, dy, w };
  });
  return (
    <svg className={`nb-map${compact ? ' is-compact' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <defs>
        <pattern id="nb-grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22,0H0V22" /></pattern>
        <pattern id="nb-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0V8" /></pattern>
      </defs>
      <rect width={W} height={H} className="nb-map-ground" />
      <rect width={W} height={H} fill="url(#nb-grid)" className="nb-map-grid" />
      {Object.entries(QUAD_RECT).map(([q, [x, y, w, h]]) => (
        <g key={q} className={`nb-map-quad q-${q.toLowerCase()}${quadrant === q ? ' is-on' : ''}`}>
          <rect x={x} y={y} width={w} height={h} />
          {quadrant === q ? <rect x={x} y={y} width={w} height={h} fill="url(#nb-hatch)" className="nb-map-hatch" /> : null}
        </g>
      ))}
      <path className="nb-map-river nb-map-river-edge" d={BOW} />
      <path className="nb-map-river" d={BOW} />
      <path className="nb-map-river nb-map-river-edge is-elbow" d={ELBOW} />
      <path className="nb-map-river is-elbow" d={ELBOW} />
      <path className="nb-map-axis" d={`M${CX},0V${H}M0,${CY}H${W}`} />
      <g className="nb-map-towers" transform={`translate(${DOWNTOWN[0] - 18} ${DOWNTOWN[1] - 30})`} aria-hidden="true">
        <rect x="0" y="12" width="8" height="18" /><rect x="10" y="0" width="9" height="30" /><rect x="21" y="7" width="7" height="23" /><rect x="30" y="16" width="7" height="14" />
      </g>
      <text className="nb-map-q" x="14" y="28">NW</text><text className="nb-map-q" x={W - 14} y="28" textAnchor="end">NE</text>
      <text className="nb-map-q" x="14" y={H - 14}>SW</text><text className="nb-map-q" x={W - 14} y={H - 14} textAnchor="end">SE</text>
      {placed.map(({ h, x, y, left, dy, w }) => {
        const on = active === h.slug;
        const pin = (
          <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} className={`nb-pin q-${h.quadrant.toLowerCase()}${on ? ' is-on' : ''}${quadrant && quadrant !== h.quadrant ? ' is-dim' : ''}`}>
            <path className="nb-pin-body" d="M0,0C-7,-9 -12,-15 -12,-22A12,12 0 1 1 12,-22C12,-15 7,-9 0,0Z" />
            {numbered
              ? <text className="nb-pin-n" y="-18" textAnchor="middle">{hoods.indexOf(h) + 1}</text>
              : <circle className="nb-pin-dot" cy="-22" r="4.2" />}
            {(!compact || on) && dy ? <path className="nb-pin-lead" d={`M${left ? -8 : 8},-24L${left ? -16 : 16},${dy - 19}`} /> : null}
            {(!compact || on) && <g className="nb-pin-label" transform={`translate(${left ? -16 : 16} ${dy - 30})`}>
              <rect x={left ? -w : 0} y="0" width={w} height="22" rx="11" />
              <text x={left ? -8 : 8} y="15" textAnchor={left ? 'end' : 'start'}>{h.title}</text>
            </g>}
          </g>
        );
        return onHover
          ? <Link key={h.id} to={entityPath(h)} aria-label={`${h.title}, ${h.quadrant}`} onMouseEnter={() => onHover(h.slug)} onMouseLeave={() => onHover(undefined)} onFocus={() => onHover(h.slug)} onBlur={() => onHover(undefined)}>{pin}</Link>
          : <g key={h.id}>{pin}</g>;
      })}
    </svg>
  );
}
