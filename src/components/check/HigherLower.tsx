import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, RotateCcw, Share2, X } from 'lucide-react';
import { pickChallenger, type CommunityRank } from '../../lib/communityRank';
import { BAND_COLOUR, fmt, pageLink, readBest, useCountTo, writeBest } from './shared';

/**
 * Higher or Lower, Calgary edition. One community's 311 count is showing;
 * call whether the next one had more or fewer. Keep the streak alive.
 * `layout` splits the screen side by side (desktop) or top and bottom (phone).
 */

type Phase = 'ask' | 'show' | 'over';

function Side({ r, shape, reveal, from, role, children }: { r: CommunityRank; shape?: string; reveal: boolean; from: number; role: 'known' | 'unknown'; children?: React.ReactNode }) {
  const shown = useCountTo(reveal ? r.total : from, from, 900);
  return (
    <div className={`cyc-hl-side is-${role}`} style={{ '--band': BAND_COLOUR[r.band] } as React.CSSProperties}>
      {shape && <svg className="cyc-hl-shape" viewBox="0 0 100 100" aria-hidden="true"><path d={shape} /></svg>}
      <div className="cyc-hl-name">{r.name}</div>
      {role === 'known' || reveal ? (
        <div className="cyc-hl-count"><b>{fmt(shown)}</b><span>reports this year</span></div>
      ) : (
        <div className="cyc-hl-count is-hidden"><b>?</b></div>
      )}
      {children}
    </div>
  );
}

export function HigherLower({ rankings, shapes, start, layout, onClose }: { rankings: CommunityRank[]; shapes?: Map<string, string>; start?: CommunityRank; layout: 'side' | 'stack'; onClose?: () => void }) {
  const pool = useMemo(() => rankings.filter((r) => r.total >= 20), [rankings]);
  const seen = useRef(new Set<string>());
  const first = () => start ?? pool[Math.floor(Math.random() * pool.length)];
  const [known, setKnown] = useState<CommunityRank | undefined>(first);
  const [next, setNext] = useState<CommunityRank | undefined>(() => (known ? pickChallenger(pool, known, seen.current) : undefined));
  const [phase, setPhase] = useState<Phase>('ask');
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(readBest);
  const [lastRight, setLastRight] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!known && pool.length) {
      const k = first();
      setKnown(k);
      setNext(pickChallenger(pool, k, seen.current));
    }
  }, [pool.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!known || !next) return null;

  const answer = (higher: boolean) => {
    if (phase !== 'ask') return;
    const right = higher ? next.total > known.total : next.total < known.total;
    setLastRight(right);
    setPhase('show');
    navigator.vibrate?.(right ? 18 : [30, 40, 30]);
    setTimeout(() => {
      if (right) {
        const s = streak + 1;
        setStreak(s);
        if (s > best) { setBest(s); writeBest(s); }
        seen.current.add(known.key);
        setKnown(next);
        setNext(pickChallenger(pool, next, seen.current));
        setPhase('ask');
        setLastRight(null);
      } else {
        setPhase('over');
      }
    }, 1500);
  };

  const restart = () => {
    seen.current.clear();
    const k = pool[Math.floor(Math.random() * pool.length)];
    setKnown(k);
    setNext(pickChallenger(pool, k, seen.current));
    setStreak(0);
    setPhase('ask');
    setLastRight(null);
  };

  const shareScore = async () => {
    const text = `I got a streak of ${streak} on Calgary Higher or Lower. Which community reported more to the City? Beat me:`;
    const url = pageLink(undefined, '?play=1');
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ text, url }); return; } catch { /* dismissed */ }
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ }
  };

  return (
    <div className={`cyc-hl is-${layout} ${phase === 'show' ? (lastRight ? 'is-right' : 'is-wrong') : ''}`}>
      <div className="cyc-hl-bar">
        <span className="cyc-hl-title">Higher <i>or</i> Lower</span>
        <span className="cyc-hl-score"><b>{streak}</b> streak · best {best}</span>
        {onClose && <button type="button" className="cyc-hl-close" onClick={onClose} aria-label="Close the game"><X size={22} /></button>}
      </div>
      <div className="cyc-hl-arena">
        <Side key={`k-${known.key}`} r={known} shape={shapes?.get(known.key)} reveal from={known.total} role="known" />
        <div className="cyc-hl-vs" aria-hidden="true">{phase === 'show' ? (lastRight ? <Check size={36} strokeWidth={3.5} /> : <X size={36} strokeWidth={3.5} />) : 'VS'}</div>
        <Side key={`n-${next.key}`} r={next} shape={shapes?.get(next.key)} reveal={phase !== 'ask'} from={0} role="unknown">
          {phase === 'ask' && (
            <div className="cyc-hl-choices">
              <p><b>More</b> or <b>fewer</b> reports than {known.name}?</p>
              <button type="button" className="cyc-hl-btn is-up" onClick={() => answer(true)}><ArrowUp size={20} aria-hidden="true" /> Higher</button>
              <button type="button" className="cyc-hl-btn is-down" onClick={() => answer(false)}><ArrowDown size={20} aria-hidden="true" /> Lower</button>
            </div>
          )}
        </Side>
      </div>
      {phase === 'over' && (
        <div className="cyc-hl-over" role="dialog" aria-label="Game over">
          <p className="cyc-hl-over-kicker">Streak over</p>
          <p className="cyc-hl-over-num">{streak}</p>
          <p className="cyc-hl-over-sub">{next.name} had {fmt(next.total)}. {known.name} had {fmt(known.total)}.{streak >= best && streak > 0 ? ' New personal best.' : ''}</p>
          <div className="cyc-hl-over-actions">
            <button type="button" className="cyc-btn cyc-btn-hot" onClick={restart}><RotateCcw size={18} aria-hidden="true" /> Play again</button>
            <button type="button" className="cyc-btn cyc-btn-line" onClick={shareScore}><Share2 size={18} aria-hidden="true" /> {copied ? 'Copied' : 'Challenge a friend'}</button>
          </div>
        </div>
      )}
      <p className="cyc-sr" aria-live="polite">{phase === 'show' ? (lastRight ? `Right. ${next.name} had ${next.total}.` : `Wrong. ${next.name} had ${next.total}.`) : ''}</p>
    </div>
  );
}
