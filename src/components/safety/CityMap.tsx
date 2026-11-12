import { useEffect, useMemo, useRef, useState } from 'react';

/*
 * Calgary at night, as a dot matrix: one dot per ~450 m, from the City's
 * community boundaries (scripts/safety/city-dots.ts). Windows twinkle, the
 * communities named in recent headlines glow cyan, and the one in focus fills
 * in yellow from its middle with a slow ripple and a name tag. A headline with
 * no community sends a soft sweep across the whole city instead.
 *
 * It's decoration that follows the wire, so it's aria-hidden; the page says
 * the same things in text. Reduced motion draws still frames only.
 */

import { D, indexOf, OWNER, ALL, PHASE, CENTRE, DIST } from '../../lib/cityDots';

const BOOT = 1.6; // seconds for the city to light up from downtown

export function CityMap({ lit = [], focus, sweep = false, className = '' }: { lit?: string[]; focus?: string; sweep?: boolean; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [visible, setVisible] = useState(true);
  const [reduce, setReduce] = useState(false);
  const litSet = useMemo(() => new Set(lit.map(indexOf).filter((i): i is number => i !== undefined)), [lit]);
  const fi = indexOf(focus);
  const boot = useRef(0);
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setBooted(true), window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : BOOT * 1000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    setReduce(!!mq?.matches);
    const on = () => setReduce(!!mq?.matches);
    mq?.addEventListener?.('change', on);
    const el = wrap.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height })) : undefined;
    ro?.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => setVisible(e.isIntersecting)) : undefined;
    io?.observe(el);
    return () => { ro?.disconnect(); io?.disconnect(); mq?.removeEventListener?.('change', on); };
  }, []);

  // Grid → pixels, fitted and centred.
  const s = box.w && box.h ? Math.min(box.w / D.w, box.h / D.h) : 0;
  const ox = (box.w - s * D.w) / 2, oy = (box.h - s * D.h) / 2;
  const tag = fi !== undefined && s ? { x: ox + (CENTRE[fi][0] + 0.5) * s, y: oy + (CENTRE[fi][1] + 0.5) * s } : undefined;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !s) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = Math.max(1, s * 0.34);
    const px = (c: number) => ox + ((c % D.w) + 0.5) * s;
    const py = (c: number) => oy + (Math.floor(c / D.w) + 0.5) * s;
    const focusCells = fi !== undefined ? [...D.cells[fi]].sort((a, b) => {
      const [cx, cy] = CENTRE[fi];
      return Math.hypot(a % D.w - cx, Math.floor(a / D.w) - cy) - Math.hypot(b % D.w - cx, Math.floor(b / D.w) - cy);
    }) : [];
    const start = performance.now();
    if (!boot.current) boot.current = start;
    let raf = 0;

    const dot = (c: number) => { ctx.moveTo(px(c) + r, py(c)); ctx.arc(px(c), py(c), r, 0, Math.PI * 2); };
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, box.w, box.h);
      // City lights: four brightness buckets so the twinkle costs four fills.
      const buckets: number[][] = [[], [], [], []];
      const on = reduce ? 2 : (now - boot.current) / 1000 / BOOT;
      for (const c of ALL) {
        if (DIST[c] > on) continue;
        if (OWNER[c] === fi || litSet.has(OWNER[c])) continue;
        const tw = reduce ? PHASE[c] : 0.5 + 0.5 * Math.sin(t * (0.6 + PHASE[c]) + PHASE[c] * 40);
        buckets[Math.min(3, Math.floor(tw * tw * 4))].push(c);
      }
      if (on < 1.15) {
        ctx.beginPath();
        for (const c of ALL) if (Math.abs(DIST[c] - on) < 0.06) dot(c);
        ctx.fillStyle = 'rgba(255,240,180,.95)'; ctx.fill();
      }
      [0.2, 0.32, 0.46, 0.7].forEach((a, k) => {
        ctx.beginPath(); buckets[k].forEach(dot); ctx.fillStyle = `rgba(127,178,255,${a})`; ctx.fill();
      });
      // Sweep for citywide headlines.
      if (sweep && !reduce) {
        const y = oy + ((t * 0.35) % 1.2) * s * D.h;
        const g = ctx.createLinearGradient(0, y - 60, 0, y);
        g.addColorStop(0, 'rgba(0,194,224,0)'); g.addColorStop(1, 'rgba(0,194,224,.22)');
        ctx.fillStyle = g; ctx.fillRect(ox, y - 60, s * D.w, 60);
        ctx.beginPath();
        for (const c of ALL) if (Math.abs(py(c) - y) < s * 0.8) dot(c);
        ctx.fillStyle = 'rgba(0,194,224,.9)'; ctx.fill();
      }
      // Communities named in recent headlines.
      ctx.beginPath();
      litSet.forEach(i => { if (i !== fi) D.cells[i].forEach(c => { if (DIST[c] <= on) dot(c); }); });
      ctx.save(); ctx.shadowColor = 'rgba(0,194,224,.8)'; ctx.shadowBlur = s; ctx.fillStyle = '#2fd8f2'; ctx.fill(); ctx.restore();
      // Focus: fills in from the middle, glows, ripples.
      if (fi !== undefined && on >= 1) {
        if (tag) {
          const pulse = reduce ? 1 : 0.85 + 0.15 * Math.sin(t * 2.2);
          const halo = ctx.createRadialGradient(tag.x, tag.y, 0, tag.x, tag.y, s * 8 * pulse);
          halo.addColorStop(0, 'rgba(255,223,79,.45)'); halo.addColorStop(1, 'rgba(255,223,79,0)');
          ctx.fillStyle = halo; ctx.fillRect(tag.x - s * 9, tag.y - s * 9, s * 18, s * 18);
        }
        const shown = reduce ? focusCells.length : Math.ceil(focusCells.length * Math.min(1, t / 0.7));
        ctx.save();
        ctx.shadowColor = 'rgba(255,223,79,.9)'; ctx.shadowBlur = s * 1.6;
        ctx.beginPath(); focusCells.slice(0, shown).forEach(dot); ctx.fillStyle = '#ffdf4f'; ctx.fill();
        ctx.restore();
        if (tag && !reduce) {
          for (let k = 0; k < 2; k++) {
            const p = ((t + k * 1.3) % 2.6) / 2.6;
            ctx.beginPath(); ctx.arc(tag.x, tag.y, s * (1.5 + p * 12), 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,223,79,${0.55 * (1 - p)})`; ctx.lineWidth = 1.5; ctx.stroke();
          }
        }
      }
      if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [box.w, box.h, s, ox, oy, fi, litSet, sweep, reduce, visible, tag?.x, tag?.y]);

  const flip = tag && tag.x > box.w * 0.62;
  return (
    <div ref={wrap} className={`sf-city ${className}`} aria-hidden="true">
      <canvas ref={canvas} />
      {s ? (
        <>
          <span className="sf-city-q" style={{ left: ox + 6, top: oy + 4 }}>NW</span>
          <span className="sf-city-q" style={{ right: ox + 6, top: oy + 4 }}>NE</span>
          <span className="sf-city-q" style={{ left: ox + 6, bottom: oy + 4 }}>SW</span>
          <span className="sf-city-q" style={{ right: ox + 6, bottom: oy + 4 }}>SE</span>
        </>
      ) : null}
      {tag && focus && booted ? (
        <span key={focus} className={`sf-city-tag${flip ? ' is-flip' : ''}`} style={{ left: tag.x, top: tag.y }}>
          <i />{focus}
        </span>
      ) : null}
      {sweep && fi === undefined && s && booted ? <span className="sf-city-tag is-wide" style={{ left: box.w / 2, top: oy + 6 }}>Citywide</span> : null}
    </div>
  );
}

/** True when the dot map knows this community, so callers can skip the sweep. */
export const onCityMap = (community?: string) => indexOf(community) !== undefined;

/*
 * Still images of the city for covers and locator thumbnails, drawn once per
 * look and cached as data URLs. Browser only; returns '' during prerender.
 */
const STILLS = new Map<string, string>();
export function cityStill({ lit = [], focus, size, accent = '#ffdf4f', base = 'rgba(127,178,255,.28)', pad = 0.06 }: {
  lit?: string[]; focus?: string; size: number; accent?: string; base?: string; pad?: number;
}): string {
  if (typeof document === 'undefined') return '';
  const key = [lit.join('|'), focus, size, accent, base, pad].join('#');
  const hit = STILLS.get(key);
  if (hit !== undefined) return hit;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr);
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  ctx.scale(dpr, dpr);
  const inner = size * (1 - pad * 2);
  const s = Math.min(inner / D.w, inner / D.h);
  const ox = (size - s * D.w) / 2, oy = (size - s * D.h) / 2;
  const r = Math.max(0.6, s * 0.34);
  const litIdx = new Set(lit.map(indexOf).filter((i): i is number => i !== undefined));
  const fi = indexOf(focus);
  const draw = (cells: number[], fill: string, glow = 0) => {
    ctx.save();
    if (glow) { ctx.shadowColor = fill; ctx.shadowBlur = glow; }
    ctx.beginPath();
    for (const c of cells) { const x = ox + ((c % D.w) + 0.5) * s, y = oy + (Math.floor(c / D.w) + 0.5) * s; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
    ctx.fillStyle = fill; ctx.fill(); ctx.restore();
  };
  draw(ALL.filter(c => OWNER[c] !== fi && !litIdx.has(OWNER[c])), base);
  draw([...litIdx].filter(i => i !== fi).flatMap(i => D.cells[i]), accent, s * 1.2);
  if (fi !== undefined) {
    const [cx, cy] = CENTRE[fi];
    const x = ox + (cx + 0.5) * s, y = oy + (cy + 0.5) * s;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 9);
    g.addColorStop(0, 'rgba(255,223,79,.55)'); g.addColorStop(1, 'rgba(255,223,79,0)');
    ctx.fillStyle = g; ctx.fillRect(x - s * 10, y - s * 10, s * 20, s * 20);
    draw(D.cells[fi], '#ffdf4f', s * 2);
  }
  const url = cv.toDataURL('image/png');
  STILLS.set(key, url);
  return url;
}
