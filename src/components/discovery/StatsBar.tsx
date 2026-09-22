import { useEffect, useRef, useState } from 'react';

/**
 * Every number here has to be true, not just plausible — PRODUCT.md rules out invented
 * activity/popularity signals, which is exactly what sank the old "Trending in Calgary"
 * section. Page views are the real, current site total; the rest are directly countable
 * from this codebase (scripts/ingest/sources/ + power-outages.ts + traffic-flow.ts = 7
 * live pipelines, DISCOVERY_SECTIONS + Live = 6 ways in). Update the page-view figure
 * here as it grows — never let it go stale in the other direction.
 */
const STATS: { countTo?: number; suffix?: string; display?: string; label: string; color: 'cyan' | 'green' | 'purple' | 'orange' }[] = [
  { countTo: 100, suffix: 'K+', label: 'Page views and counting', color: 'cyan' },
  { countTo: 7, label: 'Live city data sources tracked', color: 'green' },
  { countTo: 6, label: 'Ways to know your city, one site', color: 'purple' },
  { display: '24/7', label: 'Community reporting, always on', color: 'orange' },
];

/** Fires once, the first time the element scrolls into view. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); observer.disconnect(); }
    }, { threshold: 0.35 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, inView] as const;
}

function useCountUp(target: number, active: boolean, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setValue(target); return; }
    let raf = 0; const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round((1 - (1 - progress) ** 3) * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return value;
}

function StatValue({ stat, active }: { stat: (typeof STATS)[number]; active: boolean }) {
  const counted = useCountUp(stat.countTo ?? 0, active && stat.countTo !== undefined);
  return <>{stat.countTo !== undefined ? `${counted}${stat.suffix ?? ''}` : stat.display}</>;
}

export function StatsBar() {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <section className="cw-stats" aria-label="CalgaryWatch by the numbers">
      <div className="cw-wrap cw-stats-lead">
        <p className="cw-eyebrow">CalgaryWatch, by the numbers</p>
        <h2>Real Calgary. Real numbers.</h2>
      </div>
      <div className={`cw-stats-grid${inView ? ' cw-stats-in-view' : ''}`} ref={ref}>
        {STATS.map((s, i) => (
          <div className={`cw-stat cw-stat-${s.color}`} key={s.label} style={{ transitionDelay: `${i * 90}ms` }}>
            <b><StatValue stat={s} active={inView} /></b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
