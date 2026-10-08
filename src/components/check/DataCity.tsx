import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCommunityBoundaries } from '../../lib/communityLookup';
import { barHeight, type CommunityRank } from '../../lib/communityRank';
import { depthOrder, projectGround, simplifyRing, toLocalKm, wallLight, type CityBlock, type Pt } from '../../lib/isoCity';
import { BAND_COLOUR, fmt, reducedMotion } from './shared';

/**
 * Desktop hero: Calgary's real community boundaries laid on a tilted table
 * and pushed up into blocks by their 311 counts. Hover a block to read it,
 * click to play it. While guessing, the chosen block's height follows the
 * guess; on the reveal it grows or sinks to the truth and leaves a ghost
 * outline where the guess was.
 */

export type CityMode = 'idle' | 'guess' | 'reveal';

const SELECT = '#ffe14d';

/** Largest ring of each community, simplified, in local km. */
export function useCityBlocks(keys: string[]): CityBlock[] {
  const [boundaryBlocks, setBoundaryBlocks] = useState<CityBlock[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchCommunityBoundaries()
      .then((bs) => {
        if (!live) return;
        const rings = bs.map((b) => {
          const outer = [...b.polygons].sort((p, q) => (q[0]?.length ?? 0) - (p[0]?.length ?? 0))[0]?.[0] ?? [];
          return { key: b.name, ring: simplifyRing(outer as Pt[], 28) };
        }).filter((r) => r.ring.length > 2);
        setBoundaryBlocks(rings.length ? toLocalKm(rings) : []);
      })
      .catch(() => live && setBoundaryBlocks([]));
    return () => { live = false; };
  }, []);

  return useMemo(() => {
    if (boundaryBlocks && boundaryBlocks.length) return boundaryBlocks;
    if (boundaryBlocks === null || !keys.length) return [];
    // No boundaries: a tidy grid of plots, A to Z, still extruded.
    const cols = Math.ceil(Math.sqrt(keys.length * 1.3));
    const sorted = [...keys].sort();
    return sorted.map((key, i) => {
      const x = (i % cols) * 1.2 - cols * 0.6;
      const y = -Math.floor(i / cols) * 1.2 + (sorted.length / cols) * 0.6;
      const ring: Pt[] = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
      return { key, ring, centroid: [x + 0.5, y + 0.5] as Pt };
    });
  }, [boundaryBlocks, keys]);
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

export function DataCity({ rankings, blocks, selectedKey, mode, guessTotal, onPick, onHover }: {
  rankings: CommunityRank[];
  blocks: CityBlock[];
  selectedKey?: string;
  mode: CityMode;
  guessTotal: number | null;
  onPick: (r: CommunityRank) => void;
  onHover?: (r: CommunityRank | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [beacon, setBeacon] = useState<{ x: number; y: number } | null>(null);
  const byKey = useMemo(() => new Map(rankings.map((r) => [r.key, r])), [rankings]);
  const ordered = useMemo(() => depthOrder(blocks), [blocks]);
  const max = rankings[0]?.total ?? 1;
  const hits = useRef<{ key: string; path: Path2D }[]>([]);

  // Animated values live in refs so the draw loop can read them without re-rendering React.
  const anim = useRef({ rise: reducedMotion() ? 1 : 0, zoom: 1, fx: 0, fy: 0, revealT: 1 });
  const target = useRef({ zoom: 1, fx: 0, fy: 0 });
  const anchor = { x: size.w * 0.4, y: size.h * 0.6 };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit the ground plan to the canvas once per size.
  const fit = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const b of blocks) for (const p of b.ring) {
      const [x, y] = projectGround(p);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (!isFinite(minX) || !size.w) return null;
    const towerRoom = size.h * 0.3;
    // The city sits right of centre; the headline and search live on the left.
    const scale = Math.min((size.w * 0.6) / (maxX - minX), (size.h - towerRoom - 40) / (maxY - minY));
    return { scale, ox: size.w * 0.64 - ((minX + maxX) / 2) * scale, oy: towerRoom + 10 + (size.h - towerRoom - 30) / 2 - ((minY + maxY) / 2) * scale, towerMax: size.h * 0.34 };
  }, [blocks, size]);

  // Camera target follows the selection.
  useEffect(() => {
    const block = blocks.find((b) => b.key === selectedKey);
    const idle = { zoom: 1, fx: size.w * 0.4, fy: size.h * 0.6 };
    if (anim.current.fx === 0 && anim.current.fy === 0) Object.assign(anim.current, { fx: idle.fx, fy: idle.fy });
    if (!block || !fit) { target.current = idle; return; }
    const [gx, gy] = projectGround(block.centroid);
    target.current = { zoom: 1.35, fx: gx * fit.scale + fit.ox, fy: gy * fit.scale + fit.oy - fit.towerMax * 0.2 };
  }, [selectedKey, blocks, fit, size]);

  // Kick off the reveal tween whenever we enter reveal mode.
  useEffect(() => { if (mode === 'reveal') anim.current.revealT = reducedMotion() ? 1 : 0; }, [mode, selectedKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fit) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const sel = selectedKey ? byKey.get(selectedKey) : undefined;

    const frame = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const a = anim.current;
      const t = target.current;
      const still = reducedMotion();
      a.rise = still ? 1 : Math.min(1, a.rise + dt / 1.6);
      const ease = still ? 1 : 1 - Math.pow(0.0015, dt);
      a.zoom += (t.zoom - a.zoom) * ease;
      a.fx += (t.fx - a.fx) * ease;
      a.fy += (t.fy - a.fy) * ease;
      if (mode === 'reveal') a.revealT = still ? 1 : Math.min(1, a.revealT + dt / 1.3);

      const riseEase = 1 - Math.pow(1 - a.rise, 3);
      const revealEase = 1 - Math.pow(1 - a.revealT, 4);
      const actualSelH = sel ? barHeight(sel.total, max) : 0;
      const guessSelH = guessTotal !== null ? barHeight(guessTotal, max) : actualSelH;
      const selH = mode === 'guess' ? guessSelH : mode === 'reveal' && guessTotal !== null ? guessSelH + (actualSelH - guessSelH) * revealEase : actualSelH;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      // Camera: put the focus point on the anchor, zoomed. Idle focus is the anchor itself, so idle is no transform.
      const z = a.zoom;
      ctx.translate(anchor.x, anchor.y);
      ctx.scale(z, z);
      ctx.translate(-a.fx, -a.fy);

      const toScreen = (p: Pt): Pt => {
        const [x, y] = projectGround(p);
        return [x * fit.scale + fit.ox, y * fit.scale + fit.oy];
      };

      // Ground glow under the city
      ctx.save();
      const glow = ctx.createRadialGradient(size.w / 2, size.h * 0.62, 10, size.w / 2, size.h * 0.62, size.w * 0.5);
      glow.addColorStop(0, 'rgba(70,198,224,.14)');
      glow.addColorStop(1, 'rgba(70,198,224,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size.w, size.h);
      ctx.restore();

      const newHits: { key: string; path: Path2D }[] = [];
      let beaconAt: { x: number; y: number } | null = null;
      let ghost: Pt[] | null = null;

      for (const block of ordered) {
        const r = byKey.get(block.key);
        const isSel = block.key === selectedKey;
        const isHover = hoverKey === block.key;
        const hNorm = isSel ? selH : r ? barHeight(r.total, max) : 0;
        const h = Math.max(1.5, hNorm * fit.towerMax * riseEase);
        const baseCol = isSel ? SELECT : r ? BAND_COLOUR[r.band] : '#1d3157';
        const dim = selectedKey && !isSel ? 0.55 : 1;
        const base = block.ring.map(toScreen);
        const top = base.map(([x, y]) => [x, y - h] as Pt);

        // Walls, back to front
        const walls = base.map((p, i) => {
          const q = base[(i + 1) % base.length];
          return { p, q, mid: (p[1] + q[1]) / 2 };
        }).sort((u, v) => u.mid - v.mid);
        for (const { p, q } of walls) {
          ctx.beginPath();
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(q[0], q[1]);
          ctx.lineTo(q[0], q[1] - h);
          ctx.lineTo(p[0], p[1] - h);
          ctx.closePath();
          ctx.fillStyle = shade(baseCol, wallLight(p, q) * 0.62 * dim);
          ctx.fill();
        }

        const roof = new Path2D();
        top.forEach(([x, y], i) => (i ? roof.lineTo(x, y) : roof.moveTo(x, y)));
        roof.closePath();
        ctx.fillStyle = isHover && !isSel ? '#ffffff' : shade(baseCol, (isSel ? 1 : 0.92) * dim);
        ctx.fill(roof);
        ctx.strokeStyle = isSel ? '#fff7c2' : `rgba(4,13,29,${0.55 * dim})`;
        ctx.lineWidth = isSel ? 1.4 / z : 0.7 / z;
        ctx.stroke(roof);
        newHits.push({ key: block.key, path: roof });

        if (isSel) {
          const [cx, cy] = toScreen(block.centroid);
          beaconAt = { x: cx, y: cy - h };
          if (mode === 'reveal' && guessTotal !== null) {
            const gh = barHeight(guessTotal, max) * fit.towerMax;
            ghost = base.map(([x, y]) => [x, y - gh] as Pt);
          }
        }
      }

      // Ghost of the guess, drawn over everything so it reads
      if (ghost) {
        ctx.save();
        ctx.setLineDash([5 / z, 4 / z]);
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 1.6 / z;
        ctx.beginPath();
        (ghost as Pt[]).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      // Beacon of light over the chosen block
      if (beaconAt) {
        const { x, y } = beaconAt;
        const beam = ctx.createLinearGradient(0, y - 220, 0, y);
        beam.addColorStop(0, 'rgba(255,225,77,0)');
        beam.addColorStop(1, 'rgba(255,225,77,.55)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(x - 2 / z, y);
        ctx.lineTo(x - 14 / z, y - 220);
        ctx.lineTo(x + 14 / z, y - 220);
        ctx.lineTo(x + 2 / z, y);
        ctx.fill();
      }

      hits.current = newHits;
      const m = ctx.getTransform();
      const scr = beaconAt ? { x: (m.a * beaconAt.x + m.e) / dpr, y: (m.d * beaconAt.y + m.f) / dpr } : null;
      setBeacon((prev) => (scr && prev && Math.abs(prev.x - scr.x) < 0.5 && Math.abs(prev.y - scr.y) < 0.5 ? prev : scr));

      const settling = a.rise < 1 || Math.abs(t.zoom - a.zoom) > 0.002 || Math.abs(t.fx - a.fx) > 0.3 || Math.abs(t.fy - a.fy) > 0.3 || (mode === 'reveal' && a.revealT < 1);
      if (settling) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [fit, size, ordered, byKey, max, selectedKey, mode, guessTotal, hoverKey]);

  const hitTest = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;
    const box = canvas.getBoundingClientRect();
    const dpr = canvas.width / box.width;
    const x = (e.clientX - box.left) * dpr;
    const y = (e.clientY - box.top) * dpr;
    for (let i = hits.current.length - 1; i >= 0; i--) {
      if (ctx.isPointInPath(hits.current[i].path, x, y)) return { key: hits.current[i].key, x: e.clientX - box.left, y: e.clientY - box.top };
    }
    return null;
  };

  const hovered = hoverKey ? byKey.get(hoverKey) : undefined;
  const selected = selectedKey ? byKey.get(selectedKey) : undefined;

  return (
    <div ref={wrapRef} className="cyc-city">
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, cursor: hovered ? 'pointer' : 'default' }}
        role="img"
        aria-label={`3D map of ${rankings.length} Calgary communities. Each block is a community's real shape, raised by how many 311 requests it had this year.`}
        onMouseMove={(e) => {
          const h = hitTest(e);
          const key = h?.key ?? null;
          if (key !== hoverKey) { setHoverKey(key); onHover?.(key ? byKey.get(key) ?? null : null); }
          setTip(h ? { x: h.x, y: h.y } : null);
        }}
        onMouseLeave={() => { setHoverKey(null); setTip(null); onHover?.(null); }}
        onClick={(e) => {
          const h = hitTest(e);
          const r = h && byKey.get(h.key);
          if (r) onPick(r);
        }}
      />
      {hovered && tip && hovered.key !== selectedKey && (
        <div className="cyc-city-tip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">
          <b>{hovered.name}</b>
          <span>#{hovered.rank} · {fmt(hovered.total)} reports</span>
          <em>Click to play</em>
        </div>
      )}
      {selected && beacon && (
        <div className="cyc-city-flag" style={{ left: beacon.x, top: beacon.y }} aria-hidden="true">
          <b>{selected.name}</b>
          {mode === 'guess' && guessTotal !== null && <span>Your guess: {fmt(guessTotal)}</span>}
          {mode === 'reveal' && <span>Actual: {fmt(selected.total)}</span>}
        </div>
      )}
    </div>
  );
}
