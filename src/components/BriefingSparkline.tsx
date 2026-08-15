import { motion } from 'motion/react';
import type { PropertyYearEntry } from '@/src/hooks/usePropertyAssessments';

/**
 * Assessed value in this community, year by year.
 *
 * The briefing already fetched six years of assessments and showed only the
 * newest one, which threw away the part people actually want: whether it is
 * going up. One number is a fact; six is a direction.
 *
 * The baseline is the lowest year rather than zero. Assessments never approach
 * zero, so a zero baseline compresses every real movement into a flat line at
 * the top of the box.
 */

const T = { ink: '#2A2420', inkSoft: '#6E6357', line: '#E4DACA', panel: '#FFFCF6', bow: '#2E8B7A', critical: '#B0503A' };

export function buildPath(values: number[], width: number, height: number, pad = 4): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (width - pad * 2);
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Percentage change across the whole series, for the label. */
export function totalChangePct(values: number[]): number | null {
  if (values.length < 2 || values[0] === 0) return null;
  return ((values[values.length - 1] - values[0]) / values[0]) * 100;
}

export default function BriefingSparkline({
  data, still = false,
}: {
  data: PropertyYearEntry[];
  still?: boolean;
}) {
  if (data.length < 2) return null;
  const W = 260;
  const H = 56;
  const values = data.map((d) => d.avgValue);
  const path = buildPath(values, W, H);
  const change = totalChangePct(values);
  const latest = data[data.length - 1];
  const rising = (change ?? 0) >= 0;
  const stroke = rising ? T.bow : T.critical;

  return (
    <div className="rounded-2xl border px-3.5 py-3" style={{ borderColor: T.line, background: T.panel }}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[1.5rem] font-extrabold leading-none tabular-nums" style={{ color: T.ink }}>
            ${Math.round(latest.avgValue).toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] font-semibold leading-tight" style={{ color: T.inkSoft }}>
            Average home assessment here · {latest.year}
          </p>
        </div>
        {change !== null && (
          <span
            className="shrink-0 rounded-full px-2 py-1 font-mono text-[10px] font-bold tabular-nums"
            style={{ background: `${stroke}1f`, color: stroke }}
          >
            {rising ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="mt-2.5 block" role="img"
        aria-label={`Average assessed value from ${data[0].year} to ${latest.year}`}>
        <motion.path
          d={path} fill="none" stroke={stroke} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          initial={still ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: still ? 0 : 0.2 }}
        />
      </svg>

      <div className="flex items-center justify-between font-mono text-[9.5px] font-bold tabular-nums" style={{ color: T.inkSoft }}>
        <span>{data[0].year}</span>
        <span>{latest.sampleCount.toLocaleString()} properties</span>
        <span>{latest.year}</span>
      </div>
    </div>
  );
}
