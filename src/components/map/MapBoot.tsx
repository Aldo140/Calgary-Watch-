import { useEffect, useState } from 'react';
import { CityPulse, type PulseHit } from './CityPulse';

/*
 * Opening the live map, once per visit: the city powers on from downtown as
 * the night dot matrix, every dot with a report in the window lights cyan,
 * the count rolls up, and the whole picture zooms forward and dissolves into
 * the real map underneath.
 *
 * It never blocks: pointer events pass straight through to the map, it waits
 * for the site splash to finish, and it's skipped under reduced motion.
 */

const KEY = 'cw_map_boot';
const HOLD = 2300; // ms before it starts to leave
const LEAVE = 650;

export function MapBoot({ hits, count, label }: { hits: PulseHit[]; count: number; label: string }) {
  const [phase, setPhase] = useState<'wait' | 'on' | 'out' | 'done'>('wait');
  const [roll, setRoll] = useState(0);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === '1'; } catch { /* private mode */ }
    if (seen || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setPhase('done'); return; }
    const html = document.documentElement;
    const go = () => {
      try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
      setPhase('on');
    };
    if (!html.classList.contains('cw-splashing')) { go(); return; }
    const mo = new MutationObserver(() => { if (!html.classList.contains('cw-splashing')) { mo.disconnect(); go(); } });
    mo.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  const live = phase === 'on' || phase === 'out';
  useEffect(() => {
    if (!live) return;
    const a = window.setTimeout(() => setPhase('out'), HOLD);
    const b = window.setTimeout(() => setPhase('done'), HOLD + LEAVE);
    // Roll the count up; it tracks the feed if reports arrive mid-roll.
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 1400);
      setRoll(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { window.clearTimeout(a); window.clearTimeout(b); cancelAnimationFrame(raf); };
  }, [live]);

  if (phase === 'wait' || phase === 'done') return null;
  return (
    <div className={`lv-boot${phase === 'out' ? ' is-out' : ''}`} aria-hidden="true">
      <div className="lv-boot-stage">
        <CityPulse hits={hits} boot={1.2} glow={1.5} className="lv-boot-city" />
        <div className="lv-boot-copy">
          <p className="lv-boot-kick"><i />Calgary · live</p>
          <p className="lv-boot-n">{Math.round(count * roll)}<small>{count === 1 ? 'report' : 'reports'}</small></p>
          <p className="lv-boot-w">{label}</p>
        </div>
      </div>
    </div>
  );
}
