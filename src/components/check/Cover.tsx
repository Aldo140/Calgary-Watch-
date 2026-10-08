import { useEffect, useState } from 'react';
import { fetchCommunityBoundaries } from '../../lib/communityLookup';
import { BAND_DUOTONE, ringToPath, type Pt } from '../../lib/coverArt';
import type { CommunityRank } from '../../lib/communityRank';

/** Community key → silhouette path in a 100×100 box, fetched once per visit. */
let shapesPromise: Promise<Map<string, string>> | null = null;
function loadShapes(): Promise<Map<string, string>> {
  if (!shapesPromise) {
    shapesPromise = fetchCommunityBoundaries().then((bs) => {
      const out = new Map<string, string>();
      for (const b of bs) {
        const outer = [...b.polygons].sort((p, q) => (q[0]?.length ?? 0) - (p[0]?.length ?? 0))[0]?.[0] ?? [];
        const d = ringToPath(outer as Pt[]);
        if (d) out.set(b.name, d);
      }
      if (!out.size) shapesPromise = null;
      return out;
    });
  }
  return shapesPromise;
}

export function useShapes(): Map<string, string> {
  const [shapes, setShapes] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let live = true;
    loadShapes().then((m) => live && setShapes(m)).catch(() => {});
    return () => { live = false; };
  }, []);
  return shapes;
}

/** A soft blob for communities with no boundary on file. */
const FALLBACK = 'M50 14C70 14 86 28 86 48S72 86 50 86 14 72 14 50 30 14 50 14Z';

/**
 * Album-style cover. `rank` hides behind a "?" until it's earned, so the
 * covers can sit on the page before anyone has guessed.
 */
export function Cover({ r, shape, showRank = false, label, className = '' }: {
  r: CommunityRank;
  shape?: string;
  showRank?: boolean;
  label?: string;
  className?: string;
}) {
  const tone = BAND_DUOTONE[r.band];
  const gid = `cyc-g-${r.slug}`;
  return (
    <div className={`cyc-cover ${showRank ? 'has-rank' : ''} ${className}`} style={{ '--from': tone.from, '--to': tone.to, '--ink': tone.ink } as React.CSSProperties}>
      <svg viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={tone.from} />
            <stop offset="1" stopColor={tone.to} />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${gid})`} />
        <g transform={showRank ? 'translate(46 20) scale(.5)' : 'translate(14 16) scale(.86)'}>
          <path d={shape || FALLBACK} fill={tone.ink} opacity=".16" transform="translate(5 5)" />
          <path d={shape || FALLBACK} fill={tone.ink} />
        </g>
      </svg>
      <span className="cyc-cover-label">{label ?? `311 · ${r.year}`}</span>
      {showRank && <b className="cyc-cover-rank">#{r.rank}</b>}
      <span className="cyc-cover-name">{r.name}</span>
    </div>
  );
}
