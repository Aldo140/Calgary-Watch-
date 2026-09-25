import { motion } from 'motion/react';
import type { Incident } from '@/src/types';
import { categoryColor } from '@/src/lib/tokens';
import { CityMap, px, py } from '@/src/components/community/CityMap';

/**
 * Visual pieces for the personal report, in the site brand: navy, yellow, cyan and
 * 2px ink outlines. Each one is drawn only from data the report already has.
 */
export const B = {
  navy: '#06162f', navy2: '#0d2447', ink: '#151515', soft: '#4a4f57', paper: '#faf8f3', card: '#ffffff',
  line: 'rgba(21,21,21,.12)', yellow: '#ffdf4f', cyan: '#00c2e0', blue: '#1554d1', red: '#ff5a4e', green: '#1f8a4c',
} as const;

/** Where you live, on the same Calgary map the Community page uses. */
export function HomeOnCity({ home, points }: { home: { lat: number; lng: number }; points: { incident: Incident }[] }) {
  const hx = px(home.lng), hy = py(home.lat);
  // Zoomed to roughly 10 km across, centred on home.
  const vb = `${(hx - 60).toFixed(1)} ${(hy - 55).toFixed(1)} 120 110`;
  const pins = points
    .filter(p => Number.isFinite(p.incident.lat) && Number.isFinite(p.incident.lng))
    .map(p => ({ id: p.incident.id, title: p.incident.title, category: p.incident.category, timestamp: p.incident.timestamp, lat: p.incident.lat, lng: p.incident.lng }));
  return (
    <div className="br-city" aria-hidden="true">
      <CityMap pins={pins} className="br-city-map" labels quads={false} viewBox={vb} />
      <svg className="br-city-home" viewBox={vb} preserveAspectRatio="xMidYMid slice">
        <circle cx={hx} cy={hy} r="12" fill="none" stroke={B.yellow} strokeWidth="1.5" strokeDasharray="4 5" opacity=".7" />
        <circle cx={hx} cy={hy} r="6" fill={B.yellow} opacity=".22" className="br-ping" />
        <g transform={`translate(${hx} ${hy})`}>
          <circle r="4.2" fill={B.yellow} stroke={B.navy} strokeWidth="1.2" />
          <path d="M-1.9,1.3 V-0.4 L0,-2.1 L1.9,-0.4 V1.3 Z" fill={B.navy} />
        </g>
      </svg>
    </div>
  );
}

/**
 * All of Calgary's communities as a strip, busiest on the left, with theirs marked.
 * Says where they sit without calling anywhere safe or dangerous.
 */
export function RankStrip({ rank, count, label, still }: { rank: number; count: number; label: string; still: boolean }) {
  const busier = rank - 1;
  const quieter = count - rank;
  const pct = count > 1 ? (rank - 1) / (count - 1) : 0;
  return (
    <div className="br-rank">
      <div className="br-rank-strip" role="img" aria-label={`${label} is number ${rank} of ${count} Calgary communities by reported volume`}>
        {Array.from({ length: count }, (_, i) => (
          <i key={i} style={{ opacity: i === rank - 1 ? 1 : 0.18 + 0.5 * (1 - i / count), background: i === rank - 1 ? B.yellow : undefined }} className={i === rank - 1 ? 'on' : ''} />
        ))}
        <motion.span
          className="br-rank-pin" style={{ left: `${pct * 100}%` }}
          initial={still ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.4 }}
        >
          <b>#{rank}</b>
        </motion.span>
      </div>
      <div className="br-rank-ends"><span>Most reported</span><span>Least reported</span></div>
      <p className="br-rank-read">
        <strong>{busier}</strong> {busier === 1 ? 'community has' : 'communities have'} more reports than {label}; <strong>{quieter}</strong> {quieter === 1 ? 'has' : 'have'} fewer.
      </p>
    </div>
  );
}

/** Crime versus disorder, as one bar. */
export function SplitBar({ crime, disorder, year }: { crime: number; disorder: number; year: number }) {
  const total = crime + disorder;
  if (!total) return null;
  const c = Math.round((crime / total) * 100);
  return (
    <div className="br-split">
      <div className="br-split-bar" role="img" aria-label={`${c}% criminal offences, ${100 - c}% disorder calls in ${year}`}>
        <span style={{ width: `${c}%`, background: B.red }} />
        <span style={{ width: `${100 - c}%`, background: B.cyan }} />
      </div>
      <div className="br-split-key">
        <span><i style={{ background: B.red }} /><b>{crime.toLocaleString()}</b> criminal offences · {c}%</span>
        <span><i style={{ background: B.cyan }} /><b>{disorder.toLocaleString()}</b> disorder calls · {100 - c}%</span>
      </div>
    </div>
  );
}

/** When reports near them happened, by hour of day, as a 24-hour dial. */
export function HourDial({ incidents }: { incidents: Incident[] }) {
  if (incidents.length < 4) return null;
  const hours = new Array(24).fill(0) as number[];
  for (const i of incidents) {
    const h = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', hourCycle: 'h23' }).format(i.timestamp));
    if (Number.isFinite(h)) hours[h % 24] += 1;
  }
  const max = Math.max(...hours);
  const periods = [
    { name: 'overnight', from: 0, to: 6 }, { name: 'in the morning', from: 6, to: 12 },
    { name: 'in the afternoon', from: 12, to: 18 }, { name: 'in the evening', from: 18, to: 24 },
  ].map(p => ({ ...p, n: hours.slice(p.from, p.to).reduce((a, b) => a + b, 0) }));
  const top = [...periods].sort((a, b) => b.n - a.n)[0];
  const share = Math.round((top.n / incidents.length) * 100);
  const cx = 90, cy = 90, r0 = 34, r1 = 80;
  return (
    <div className="br-dial">
      <svg viewBox="0 0 180 180" role="img" aria-label={`Most reports near you arrive ${top.name}`}>
        <circle cx={cx} cy={cy} r={r1} fill={B.navy} />
        <circle cx={cx} cy={cy} r={r0 - 4} fill={B.navy2} stroke="rgba(255,255,255,.15)" />
        {hours.map((n, h) => {
          const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
          const len = n ? 6 + (n / max) * (r1 - r0 - 8) : 2;
          const x1 = cx + Math.cos(a) * r0, y1 = cy + Math.sin(a) * r0;
          const x2 = cx + Math.cos(a) * (r0 + len), y2 = cy + Math.sin(a) * (r0 + len);
          return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke={n ? B.yellow : 'rgba(255,255,255,.2)'} strokeWidth="5" strokeLinecap="round" />;
        })}
        {[['12a', 0], ['6a', 6], ['12p', 12], ['6p', 18]].map(([t, h]) => {
          const a = ((h as number) / 24) * Math.PI * 2 - Math.PI / 2;
          return <text key={t} x={cx + Math.cos(a) * 20} y={cy + Math.sin(a) * 20 + 3} textAnchor="middle" className="br-dial-t">{t}</text>;
        })}
      </svg>
      <p><strong>{share}%</strong> of the reports near you were posted {top.name}.</p>
    </div>
  );
}

/** Category mix of what's near them, as dots. */
export function CategoryDots({ incidents }: { incidents: Incident[] }) {
  const counts = new Map<string, number>();
  for (const i of incidents) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  if (counts.size === 0) return null;
  return (
    <ul className="br-cats">
      {[...counts].sort((a, b) => b[1] - a[1]).map(([c, n]) => (
        <li key={c}><i style={{ background: categoryColor(c as Incident['category']) }} />{c[0].toUpperCase() + c.slice(1)} <b>{n}</b></li>
      ))}
    </ul>
  );
}
