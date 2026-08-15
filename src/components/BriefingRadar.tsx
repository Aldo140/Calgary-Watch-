import { motion } from 'motion/react';
import type { Incident } from '@/src/types';

/**
 * The walk around someone's address, drawn to scale.
 *
 * Every report inside the walking ring is plotted at its true bearing and its
 * true distance from their door. It is a real plan view of their block, not a
 * chart of it — north is up, the centre is the address, and a dot at the edge
 * really is four times further away than one at the first ring.
 *
 * This is the one visual in the briefing that only works because we know where
 * they live, which is the whole argument for the screen existing.
 */

export interface RadarPoint {
  incident: Incident;
  distanceM: number;
  /** Degrees clockwise from north. */
  bearing: number;
}

/** Degrees clockwise from north, from one coordinate to another. */
export function bearingDegrees(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(toLng - fromLng);
  const y = Math.sin(dLng) * Math.cos(toRad(toLat));
  const x =
    Math.cos(toRad(fromLat)) * Math.sin(toRad(toLat)) -
    Math.sin(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/**
 * Where a report sits on the plot.
 *
 * Distance is linear so the picture stays truthful — a log scale would flatter
 * a block that is genuinely busy right up against the house. Anything at or
 * past the ring edge is clamped rather than drawn outside it.
 */
export function plotPoint(
  distanceM: number,
  bearing: number,
  radiusM: number,
  size: number,
): { x: number; y: number } {
  const centre = size / 2;
  const usable = centre - 10;
  const r = Math.min(distanceM / radiusM, 1) * usable;
  const rad = (bearing * Math.PI) / 180;
  return { x: centre + r * Math.sin(rad), y: centre - r * Math.cos(rad) };
}

const CATEGORY_COLOR: Record<string, string> = {
  emergency: '#C0392B',
  crime: '#C0392B',
  traffic: '#C77F18',
  infrastructure: '#2F855A',
  weather: '#7C5CBF',
  gas: '#0F8B8D',
};

const T = { ink: '#1C2B3A', navy: '#24466B', bow: '#2E8B7A', paper: '#F7F3EA', line: '#D9D2C3' };

export default function BriefingRadar({
  points, radiusM, size = 200, still = false, onSelect,
}: {
  points: RadarPoint[];
  radiusM: number;
  size?: number;
  still?: boolean;
  onSelect?: (incident: Incident) => void;
}) {
  const centre = size / 2;
  const usable = centre - 10;
  const ringFractions = [0.25, 0.5, 0.75, 1];

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ background: `linear-gradient(150deg, ${T.ink} 0%, ${T.navy} 100%)` }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" role="img"
        aria-label={`Plan view of ${points.length} reports within ${radiusM} metres of your address`}>
        <defs>
          <linearGradient id="cw-plot-sweep" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={T.bow} stopOpacity="0" />
            <stop offset="100%" stopColor={T.bow} stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {ringFractions.map((f, i) => (
          <circle key={f} cx={centre} cy={centre} r={usable * f}
            fill="none" stroke={T.bow} strokeWidth="1" opacity={0.34 - i * 0.05} />
        ))}
        <line x1={centre} y1={centre - usable} x2={centre} y2={centre + usable} stroke={T.bow} strokeWidth="0.75" opacity="0.16" />
        <line x1={centre - usable} y1={centre} x2={centre + usable} y2={centre} stroke={T.bow} strokeWidth="0.75" opacity="0.16" />

        {/* One sweep on entry, matching the locate button's scan. */}
        {!still && (
          <motion.g
            style={{ transformOrigin: `${centre}px ${centre}px` }}
            initial={{ rotate: 0 }} animate={{ rotate: 360 }}
            transition={{ duration: 1.6, ease: 'easeInOut' }}
          >
            <motion.path
              d={`M${centre} ${centre} L${centre} ${centre - usable} A${usable} ${usable} 0 0 1 ${centre + usable * 0.71} ${centre - usable * 0.71} Z`}
              fill="url(#cw-plot-sweep)"
              initial={{ opacity: 0.9 }} animate={{ opacity: 0 }}
              transition={{ duration: 1.9, ease: 'easeIn' }}
            />
            <line x1={centre} y1={centre} x2={centre} y2={centre - usable}
              stroke={T.bow} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          </motion.g>
        )}

        {/* North, so the plot reads as a plan rather than a diagram. */}
        {/* Sized in viewBox units: the plot scales to its container, so these
            must stay legible at the smallest width it is rendered at. */}
        <text x={centre} y="12" textAnchor="middle" fill={T.bow} fillOpacity="0.7"
          style={{ font: "bold 10px 'IBM Plex Mono', monospace", letterSpacing: '0.12em' }}>N</text>
        {/* Bottom-left, not on the east axis: a report due east of the house
            lands exactly where this label used to sit. */}
        <text x="7" y={size - 7} textAnchor="start" fill={T.bow} fillOpacity="0.5"
          style={{ font: "bold 10px 'IBM Plex Mono', monospace" }}>{radiusM}m</text>

        {points.map(({ incident, distanceM, bearing }, i) => {
          const { x, y } = plotPoint(distanceM, bearing, radiusM, size);
          const color = CATEGORY_COLOR[incident.category] ?? T.bow;
          return (
            <motion.g
              key={incident.id}
              initial={still ? false : { opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: still ? 0 : 1.0 + i * 0.06, type: 'spring', stiffness: 400, damping: 20 }}
              style={{ transformOrigin: `${x}px ${y}px`, cursor: onSelect ? 'pointer' : undefined }}
              onClick={onSelect ? () => onSelect(incident) : undefined}
            >
              <circle cx={x} cy={y} r="6.5" fill={color} opacity="0.22" />
              <circle cx={x} cy={y} r="3.2" fill={color} stroke="#FFFDF8" strokeWidth="1.1" />
            </motion.g>
          );
        })}

        {/* Their address. Drawn last so nothing covers it. */}
        <circle cx={centre} cy={centre} r="7" fill={T.bow} opacity="0.22" />
        <circle cx={centre} cy={centre} r="3" fill="#FFFDF8" />
      </svg>
    </div>
  );
}
