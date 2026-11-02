import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { sunTimes } from '../../lib/sky';
import { daylight } from '../../lib/memberHome';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';

const clockFmt = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });
const clock = (t: number) => clockFmt.format(new Date(t)).replace(/\s?([ap])\.?\s?m\.?/i, (_, x: string) => ` ${x.toLowerCase()}m`);

/**
 * Phones: how much daylight is left today, as a little arc the sun travels
 * along between sunrise and sunset. In a Calgary November that's the real
 * question before going out ("will it be dark by then?"), and it keeps the
 * hero moving with the sky behind it. Computed, never fetched.
 */
export function SunRibbon({ now }: { now: number }) {
  const times = sunTimes(new Date(now));
  if (!times) return null;
  const d = daylight(now, times.rise, times.set, clock);
  // The arc: a flat ellipse; the sun rides it at `progress`, the moon sits at the end after dark.
  const x = 8 + d.progress * 184;
  const y = 30 - Math.sin(d.progress * Math.PI) * 22;
  const mins = Math.round((times.set - times.rise) / 60_000);
  return (
    <div className="pd-sun" data-phase={d.phase}>
      <p className="pd-sun-head"><b>{d.headline}</b><small>{Math.floor(mins / 60)} h {mins % 60} min of daylight</small></p>
      <span className="pd-sun-end"><Sunrise size={14} aria-hidden="true" /> {clock(times.rise)}</span>
      <span className="pd-sun-mid">
        <svg viewBox="0 0 200 34" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M8 30 Q100 -14 192 30" className="pd-sun-arc" />
          <path d="M8 30 Q100 -14 192 30" className="pd-sun-done" pathLength={1} strokeDasharray={`${d.progress} 1`} />
          <line x1="0" y1="30" x2="200" y2="30" className="pd-sun-horizon" />
        </svg>
        <span className="pd-sun-dot" style={{ left: `${(x / 200) * 100}%`, top: `${4 + (y / 34) * 24}px` }} aria-hidden="true">
          {d.phase === 'day' ? <Sun size={14} strokeWidth={2.6} /> : <Moon size={13} strokeWidth={2.6} />}
        </span>
      </span>
      <span className="pd-sun-end"><Sunset size={14} aria-hidden="true" /> {clock(times.set)}</span>
    </div>
  );
}
