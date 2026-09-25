import { INCIDENT_CATEGORIES } from '../../constants';
import type { ExampleReport } from '../../lib/homeClaims';

export const COLOR: Record<string, string> = Object.fromEntries(INCIDENT_CATEGORIES.map(c => [c.value, c.color]));

/** Calgary's box, projected flat: good enough to show where things cluster. */
const BOX = { n: 51.215, s: 50.842, w: -114.315, e: -113.86 };
export const px = (lng: number) => ((lng - BOX.w) / (BOX.e - BOX.w)) * 400;
export const py = (lat: number) => ((BOX.n - lat) / (BOX.n - BOX.s)) * 440;

const line = (pts: [number, number][]) => pts.map(([lat, lng], i) => `${i ? 'L' : 'M'}${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join('');
const OUTLINE: [number, number][] = [[51.2, -114.26], [51.212, -114.15], [51.21, -114.05], [51.19, -113.92], [51.12, -113.87], [51.02, -113.88], [50.95, -113.9], [50.87, -113.94], [50.85, -114.05], [50.86, -114.16], [50.9, -114.23], [50.98, -114.28], [51.08, -114.3], [51.15, -114.29]];
const STONEY: [number, number][] = [[51.16, -114.22], [51.175, -114.1], [51.17, -113.98], [51.11, -113.93], [51.03, -113.935], [50.93, -113.95], [50.885, -114.03], [50.885, -114.14], [50.93, -114.2], [51.0, -114.215], [51.08, -114.235], [51.16, -114.22]];
const BOW: [number, number][] = [[51.105, -114.3], [51.092, -114.21], [51.08, -114.16], [51.066, -114.118], [51.055, -114.085], [51.052, -114.06], [51.047, -114.035], [51.037, -114.02], [51.012, -114.002], [50.97, -113.99], [50.92, -113.985], [50.86, -113.975]];
const ELBOW: [number, number][] = [[50.96, -114.19], [50.975, -114.15], [50.99, -114.115], [51.005, -114.09], [51.022, -114.073], [51.035, -114.058], [51.045, -114.045]];
/** [name, lat, lng, label dx, label dy, anchor] — the downtown cluster fans out so labels don't collide. */
const PLACES: [string, number, number, number?, number?, ('start' | 'end')?][] = [['Downtown', 51.0478, -114.0593, 6, 14], ['Kensington', 51.0529, -114.0913, -6, -5, 'end'], ['Bridgeland', 51.0545, -114.0391, 6, -6], ['Inglewood', 51.0369, -114.0189], ['Marda Loop', 51.0232, -114.1062], ['Bowness', 51.0906, -114.2083], ['Forest Lawn', 51.0419, -113.9636], ['Airport', 51.1215, -114.0076], ['Chinook', 50.9981, -114.0733], ['Shawnessy', 50.9086, -114.0717], ['Tuscany', 51.1255, -114.2515]];

export function CityMap({ pins, className = 'cm-city', labels = true, quads = true, viewBox = '0 0 400 440' }: { pins: ExampleReport[]; className?: string; labels?: boolean; quads?: boolean; viewBox?: string }) {
  return (
    <svg className={className} viewBox={viewBox} preserveAspectRatio="xMidYMid slice" role="img" aria-label={pins.length ? `Map of Calgary with ${pins.length} reports from the last 24 hours` : 'Map of Calgary'}>
      <defs>
        <pattern id="cm-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16,0H0V16" fill="none" stroke="rgba(255,255,255,.05)" /></pattern>
      </defs>
      <path className="cm-city-land" d={line(OUTLINE) + 'Z'} />
      <path d={line(OUTLINE) + 'Z'} fill="url(#cm-grid)" />
      <path className="cm-city-ring" d={line(STONEY)} />
      <path className="cm-city-axis" d={`M${px(-114.063)},${py(51.21)}V${py(50.85)}M${px(-114.29)},${py(51.048)}H${px(-113.875)}`} />
      <path className="cm-city-bow" d={line(BOW)} />
      <path className="cm-city-elbow" d={line(ELBOW)} />
      <ellipse className="cm-city-lake" cx={px(-114.128)} cy={py(50.985)} rx="12" ry="7" />
      {labels && PLACES.map(([name, lat, lng, dx = 6, dy = 3.5, anchor = 'start']) => (
        <g key={name} transform={`translate(${px(lng).toFixed(1)} ${py(lat).toFixed(1)})`} className="cm-place">
          <circle r="2.5" />
          <text x={dx} y={dy} textAnchor={anchor}>{name}</text>
        </g>
      ))}
      {quads ? <><text className="cm-quad" x="34" y="44">NW</text><text className="cm-quad" x="340" y="44">NE</text><text className="cm-quad" x="34" y="420">SW</text><text className="cm-quad" x="340" y="420">SE</text></> : null}
      {pins.map((p, i) => (
        <g key={p.id} transform={`translate(${px(p.lng!).toFixed(1)} ${py(p.lat!).toFixed(1)})`}>
          <g className="cm-pin" style={{ animationDelay: `${(i % 12) * 0.12}s` }}>
            <circle r="10" fill={COLOR[p.category] ?? '#00c2e0'} opacity=".22" />
            <circle r="5.5" fill={COLOR[p.category] ?? '#00c2e0'} stroke="#fff" strokeWidth="1.8" />
          </g>
        </g>
      ))}
    </svg>
  );
}

