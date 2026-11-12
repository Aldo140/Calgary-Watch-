import { useEffect, useMemo, useRef, useState } from 'react';
import type { Incident } from '@/src/types';
import { D, ALL, PHASE, DIST, cellAt } from '@/src/lib/cityDots';

/*
 * The /map city pulse: Calgary as the same night dot matrix as /safety, with
 * a cyan glow on every dot that has a report in the current window (bigger
 * where there are more), a ping on reports from the last three hours, and the
 * report in focus lit yellow with a ripple.
 *
 * It's a picture of what the list already says, so it's aria-hidden. Reduced
 * motion draws one still frame. It pauses offscreen and in a hidden tab, and
 * the small sheet version caps itself at ~30 fps to keep phones cool.
 */

export interface PulseHit { cell: number; n: number; fresh: boolean }

const FRESH_MS = 3 * 3600e3;

/** Group incidents onto city dots. Anything outside the city is left off. */
export function pulseHits(incidents: Incident[], now = Date.now()): PulseHit[] {
  const by = new Map<number, PulseHit>();
  for (const i of incidents) {
    if (typeof i.lat !== 'number' || typeof i.lng !== 'number') continue;
    const cell = cellAt(i.lat, i.lng);
    if (cell === undefined) continue;
    const h = by.get(cell) ?? { cell, n: 0, fresh: false };
    h.n += 1;
    if (now - i.timestamp < FRESH_MS) h.fresh = true;
    by.set(cell, h);
  }
  return [...by.values()];
}

export function CityPulse({
  hits, focus, boot = 1.4, fps = 60, className = '', glow = 1,
}: {
  hits: PulseHit[];
  /** Cell to light yellow (the headline being shown). */
  focus?: number;
  /** Seconds for the city to power on from downtown; 0 skips it. */
  boot?: number;
  fps?: number;
  className?: string;
  /** Scales glow and ring sizes; the boot screen uses more. */
  glow?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [visible, setVisible] = useState(true);
  const [reduce, setReduce] = useState(false);
  const born = useRef(0);
  const hitCells = useMemo(() => new Set(hits.map(h => h.cell)), [hits]);

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

  const s = box.w && box.h ? Math.min(box.w / D.w, box.h / D.h) : 0;
  const ox = (box.w - s * D.w) / 2, oy = (box.h - s * D.h) / 2;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !s) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = Math.max(0.55, s * 0.34);
    const px = (c: number) => ox + ((c % D.w) + 0.5) * s;
    const py = (c: number) => oy + (Math.floor(c / D.w) + 0.5) * s;
    const dot = (c: number, rr = r) => { ctx.moveTo(px(c) + rr, py(c)); ctx.arc(px(c), py(c), rr, 0, Math.PI * 2); };
    const start = performance.now();
    if (!born.current) born.current = start;
    const gap = 1000 / fps;
    let raf = 0, last = 0;

    const frame = (now: number) => {
      if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(frame);
      if (now - last < gap - 2) return;
      last = now;
      const t = (now - start) / 1000;
      const on = reduce || !boot ? 2 : (now - born.current) / 1000 / boot;
      ctx.clearRect(0, 0, box.w, box.h);

      // City lights in four brightness buckets so the twinkle costs four fills.
      const buckets: number[][] = [[], [], [], []];
      for (const c of ALL) {
        if (DIST[c] > on || hitCells.has(c)) continue;
        const tw = reduce ? PHASE[c] : 0.5 + 0.5 * Math.sin(t * (0.6 + PHASE[c]) + PHASE[c] * 40);
        buckets[Math.min(3, Math.floor(tw * tw * 4))].push(c);
      }
      [0.16, 0.26, 0.38, 0.6].forEach((a, k) => {
        ctx.beginPath(); buckets[k].forEach(c => dot(c)); ctx.fillStyle = `rgba(127,178,255,${a})`; ctx.fill();
      });
      if (on < 1.15) {
        ctx.beginPath();
        for (const c of ALL) if (Math.abs(DIST[c] - on) < 0.06) dot(c);
        ctx.fillStyle = 'rgba(255,240,180,.95)'; ctx.fill();
      }

      // Reports: a cyan glow per dot, bigger where there are more.
      ctx.save();
      ctx.shadowColor = 'rgba(0,194,224,.85)'; ctx.shadowBlur = Math.max(4, s * 1.4) * glow;
      ctx.fillStyle = '#2fd8f2';
      ctx.beginPath();
      for (const h of hits) if (DIST[h.cell] <= on && h.cell !== focus) dot(h.cell, r * (1.15 + 0.22 * Math.min(h.n, 5)));
      ctx.fill();
      ctx.restore();
      // Fresh reports ping.
      if (!reduce && on >= 1) {
        ctx.lineWidth = 1.2;
        for (const h of hits) {
          if (!h.fresh || h.cell === focus) continue;
          const p = ((t + PHASE[h.cell] * 2.4) % 2.4) / 2.4;
          ctx.beginPath(); ctx.arc(px(h.cell), py(h.cell), r * 1.6 + p * s * 5 * glow, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(47,216,242,${0.7 * (1 - p)})`; ctx.stroke();
        }
      }
      // Focus: yellow, haloed, rippling.
      if (focus !== undefined && on >= 1) {
        const x = px(focus), y = py(focus);
        const pulse = reduce ? 1 : 0.85 + 0.15 * Math.sin(t * 2.4);
        const R = Math.max(14, s * 7) * glow * pulse;
        const halo = ctx.createRadialGradient(x, y, 0, x, y, R);
        halo.addColorStop(0, 'rgba(255,223,79,.55)'); halo.addColorStop(1, 'rgba(255,223,79,0)');
        ctx.fillStyle = halo; ctx.fillRect(x - R, y - R, R * 2, R * 2);
        ctx.save(); ctx.shadowColor = 'rgba(255,223,79,.95)'; ctx.shadowBlur = Math.max(6, s * 2) * glow;
        ctx.beginPath(); dot(focus, Math.max(1.6, r * 2.1)); ctx.fillStyle = '#ffdf4f'; ctx.fill(); ctx.restore();
        if (!reduce) for (let k = 0; k < 2; k++) {
          const p = ((t + k * 1.1) % 2.2) / 2.2;
          ctx.beginPath(); ctx.arc(x, y, Math.max(2, r * 2) + p * Math.max(12, s * 10) * glow, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,223,79,${0.6 * (1 - p)})`; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [box.w, box.h, s, ox, oy, hits, hitCells, focus, boot, fps, glow, reduce, visible]);

  return (
    <div ref={wrap} className={`lv-citypulse ${className}`} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
