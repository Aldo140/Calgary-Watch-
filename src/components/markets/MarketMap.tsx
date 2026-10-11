import { Link } from 'react-router-dom';
import type { Market } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { marketCoords, shortName } from '../../lib/marketDays';

// The drawing's window onto Calgary, in degrees. 300×400 keeps the city's real proportions.
const N = 51.2, S = 50.88, W = -114.27, E = -113.92;
const VW = 300, VH = 400;
const project = ([lat, lng]: [number, number]) => [((lng - W) / (E - W)) * VW, ((N - lat) / (N - S)) * VH] as const;
const line = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${project(p).map(n => n.toFixed(1)).join(' ')}`).join(' ');

const BOW: [number, number][] = [[51.118, -114.27], [51.098, -114.21], [51.088, -114.175], [51.072, -114.142], [51.062, -114.11], [51.056, -114.084], [51.054, -114.062], [51.049, -114.042], [51.04, -114.026], [51.018, -114.02], [50.99, -114.014], [50.95, -114.022], [50.91, -114.01], [50.88, -114.0]];
const ELBOW: [number, number][] = [[50.97, -114.2], [50.985, -114.14], [50.995, -114.105], [51.012, -114.085], [51.028, -114.072], [51.037, -114.052], [51.043, -114.036]];
const CENTRE_X = project([51, -114.0625])[0];
const BOW_Y = project([51.05, -114])[1];

/**
 * A hand-drawn Calgary: the Bow and the Elbow, the four quadrants, and a pin
 * for each market. Pins are numbered to match the list beside it.
 */
export function MarketMap({ markets, openIds, focusId }: { markets: Market[]; openIds?: Set<string>; focusId?: string }) {
  const pins = markets.map((m, i) => ({ m, n: i + 1, at: marketCoords(m) })).filter((p): p is { m: Market; n: number; at: [number, number] } => !!p.at);
  const [dx, dy] = project([51.0478, -114.0625]);
  return (
    <figure className="mk-map">
      <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Map of ${pins.length} Calgary markets by quadrant`}>
        <defs>
          <pattern id="mk-dots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" className="mk-map-dot" /></pattern>
        </defs>
        <path className="mk-map-city" d="M70 30 C110 14 150 26 190 16 C230 8 268 30 278 62 C290 100 272 132 284 170 C296 214 270 246 278 288 C286 332 256 374 210 384 C170 392 140 376 104 386 C64 396 30 364 32 322 C34 284 14 258 20 216 C26 170 8 136 22 98 C32 62 40 40 70 30 Z" />
        <path className="mk-map-city-dots" d="M70 30 C110 14 150 26 190 16 C230 8 268 30 278 62 C290 100 272 132 284 170 C296 214 270 246 278 288 C286 332 256 374 210 384 C170 392 140 376 104 386 C64 396 30 364 32 322 C34 284 14 258 20 216 C26 170 8 136 22 98 C32 62 40 40 70 30 Z" fill="url(#mk-dots)" />
        <ellipse className="mk-map-water" cx={project([50.985, -114.13])[0]} cy={project([50.985, -114.13])[1]} rx="16" ry="9" />
        <path className="mk-map-river" d={line(BOW)} />
        <path className="mk-map-river mk-map-elbow" d={line(ELBOW)} />
        <line className="mk-map-axis" x1={CENTRE_X} y1="14" x2={CENTRE_X} y2="392" />
        <line className="mk-map-axis" x1="10" y1={BOW_Y} x2="292" y2={BOW_Y} />
        <text className="mk-map-q" x="24" y="46">NW</text>
        <text className="mk-map-q" x="250" y="46">NE</text>
        <text className="mk-map-q" x="24" y="374">SW</text>
        <text className="mk-map-q" x="250" y="374">SE</text>
        <text className="mk-map-river-label" x={project([51.078, -114.2])[0]} y={project([51.078, -114.2])[1] + 16} transform={`rotate(-28 ${project([51.078, -114.2])[0]} ${project([51.078, -114.2])[1] + 16})`}>Bow River</text>
        <g className="mk-map-dt" transform={`translate(${dx} ${dy})`}>
          <rect x="-3" y="-15" width="6" height="15" /><rect x="-9" y="-9" width="5" height="9" /><rect x="4" y="-11" width="5" height="11" />
          
        </g>
        {pins.map(({ m, n, at }) => {
          const [x, y] = project(at);
          const open = openIds?.has(m.id);
          return (
            <Link key={m.id} to={entityPath(m)} className={`mk-pin${open ? ' is-open' : ''}${focusId === m.id ? ' is-focus' : ''}`} aria-label={`${n}. ${m.title}`} data-pin={m.id}>
              <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
                <path className="mk-pin-shadow" d="M3 3 C-8 -8 -12 -14 -12 -21 a14 14 0 1 1 28 0 c0 7 -4 13 -13 24 Z" />
                <path className="mk-pin-body" d="M0 0 C-11 -11 -14 -17 -14 -24 a14 14 0 1 1 28 0 c0 7 -3 13 -14 24 Z" />
                <text className="mk-pin-n" y="-19.5">{focusId ? '' : n}</text>
                {focusId === m.id ? <circle className="mk-pin-core" cy="-24" r="5" /> : null}
              </g>
              <title>{shortName(m)}</title>
            </Link>
          );
        })}
      </svg>
    </figure>
  );
}
