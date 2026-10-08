import { useEffect, useMemo, useState } from 'react';
import { Gamepad2, RotateCcw, X } from 'lucide-react';
import {
  formatInterval,
  guessVerdict,
  ladder,
  minutesBetweenReports,
  type CommunityRank,
} from '../../lib/communityRank';
import { BAND_COLOUR, fmt, ShareActions, useCountTo, useScrollLock } from './shared';
import { Cover } from './Cover';
import { BAND_DUOTONE } from '../../lib/coverArt';

/**
 * Phones: your community, wrapped. A full-screen story you tap through, one
 * big fact per screen, with the guess built in and a card to post at the end.
 */

type SlideId = 'cover' | 'guess' | 'reveal' | 'cadence' | 'mix' | 'trend' | 'ladder' | 'share';

function RevealNumber({ rank, from }: { rank: number; from: number }) {
  const n = useCountTo(rank, from, 1400);
  return <>#{n}</>;
}

export function Wrapped({ r, rankings, shape, shapes, onClose, onPlay, onAnother }: {
  r: CommunityRank;
  rankings: CommunityRank[];
  shape?: string;
  shapes: Map<string, string>;
  onClose: () => void;
  onPlay: () => void;
  onAnother: () => void;
}) {
  useScrollLock(true);
  const [i, setI] = useState(0);
  const [guess, setGuess] = useState(Math.round(r.count / 2));
  const [locked, setLocked] = useState<number | null>(null);
  const band = BAND_COLOUR[r.band];
  const minutes = minutesBetweenReports(r.total, r.year, new Date());
  const rungs = ladder(rankings, r.key, 2);
  const mixTotal = Math.max(1, r.safety + r.property + r.other);

  const slides = useMemo<SlideId[]>(() => ['cover', 'guess', 'reveal', ...(minutes ? ['cadence' as const] : []), 'mix', ...(r.change ? ['trend' as const] : []), 'ladder', 'share'], [minutes, r.change]);
  const id = slides[i];
  const go = (d: number) => setI((x) => Math.max(0, Math.min(slides.length - 1, x + d)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && id !== 'guess') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Taps on the left third go back, anywhere else goes forward, except on the guess.
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, a')) return;
    if (id === 'guess') return;
    const x = e.clientX / window.innerWidth;
    go(x < 0.3 ? -1 : 1);
  };

  return (
    <div className={`cyc-wr is-${id} ${r.change && r.change.pct > 0 ? 'is-busier' : ''}`} style={{ '--band': band, '--from': BAND_DUOTONE[r.band].from, '--to': BAND_DUOTONE[r.band].to } as React.CSSProperties} role="dialog" aria-modal="true" aria-label={`${r.name}, wrapped`} onClick={onTap}>
      <div className="cyc-wr-progress" aria-hidden="true">
        {slides.map((s, n) => <span key={s} className={n < i ? 'is-done' : n === i ? 'is-now' : ''} />)}
      </div>
      <div className="cyc-wr-top">
        <span className="cyc-wr-brand">CalgaryWatch · Wrapped</span>
        <button type="button" className="cyc-wr-close" onClick={onClose} aria-label="Close"><X size={24} /></button>
      </div>

      <div className="cyc-wr-slide" key={id}>
        {id === 'cover' && (
          <>
            <Cover r={r} shape={shape} label="?" className="cyc-wr-art" />
            <p className="cyc-wr-kicker">Your {r.year} so far</p>
            <h2 className="cyc-wr-mega">{r.name.split(/[\s/-]+/).map((w, n) => <span key={n} style={{ animationDelay: `${n * 120}ms` }}>{w}</span>)}</h2>
            <p className="cyc-wr-sub">{r.count} Calgary communities, ranked by 311 calls. Let's see where yours lands.</p>
            <p className="cyc-wr-hint">Tap to start →</p>
          </>
        )}

        {id === 'guess' && (
          <>
            <p className="cyc-wr-kicker">Your call</p>
            <h2 className="cyc-wr-q">Out of {r.count}, where does {r.name} rank for 311 requests?</h2>
            <p className="cyc-wr-guess" aria-hidden="true">#{guess}</p>
            <div className="cyc-wr-scale">
              <input
                type="range"
                min={1}
                max={r.count}
                value={guess}
                onChange={(e) => setGuess(Number(e.target.value))}
                aria-label={`Your guess, 1 to ${r.count}`}
                aria-valuetext={`#${guess}`}
              />
              <div><span>#1 · most</span><span>#{r.count} · fewest</span></div>
            </div>
            <button type="button" className="cyc-wr-cta" onClick={() => { setLocked(guess); go(1); }}>Lock in #{guess}</button>
            <button type="button" className="cyc-wr-skip" onClick={() => { setLocked(null); go(1); }}>Skip the guess</button>
          </>
        )}

        {id === 'reveal' && (
          <>
            <div className="cyc-wr-burst" aria-hidden="true">{Array.from({ length: 12 }, (_, n) => <i key={n} style={{ '--n': n } as React.CSSProperties} />)}</div>
            <p className="cyc-wr-kicker">{r.name} is</p>
            <p className="cyc-wr-rank"><RevealNumber rank={r.rank} from={locked ?? r.count} /></p>
            <p className="cyc-wr-of">of {r.count} Calgary communities</p>
            <p className="cyc-wr-verdict">{locked === null ? `${r.band}.` : `You said #${locked}. ${guessVerdict(locked, r.rank)}`}</p>
          </>
        )}

        {id === 'cadence' && minutes && (
          <>
            <p className="cyc-wr-kicker">Someone in {r.name} contacted 311</p>
            <p className="cyc-wr-big">every<br /><b>{formatInterval(minutes)}</b></p>
            <p className="cyc-wr-sub">{fmt(r.total)} requests since January 1, day and night.</p>
          </>
        )}

        {id === 'mix' && (
          <>
            <p className="cyc-wr-kicker">What it was about</p>
            <div className="cyc-wr-mix">
              {[
                ['Safety and disorder', r.safety, 'red'],
                ['Property damage and theft', r.property, 'yellow'],
                ['Everything else', r.other, 'blue'],
              ].map(([label, v, tone], n) => (
                <div key={label as string} className={`cyc-wr-mix-${tone}`} style={{ flexGrow: Math.max(0.12, (v as number) / mixTotal), animationDelay: `${n * 140}ms` }}>
                  <b>{Math.round(((v as number) / mixTotal) * 100)}%</b>
                  <span>{label} · {fmt(v as number)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {id === 'trend' && r.change && (
          <>
            <p className="cyc-wr-kicker">{r.change.fromYear} → {r.change.toYear}</p>
            <p className={`cyc-wr-arrow ${r.change.pct <= 0 ? 'is-down' : 'is-up'}`} aria-hidden="true">{r.change.pct <= 0 ? '↓' : '↑'}</p>
            <p className="cyc-wr-big"><b>{r.change.pct > 0 ? '+' : ''}{r.change.pct}%</b></p>
            <p className="cyc-wr-sub">{r.change.pct < 0 ? `${r.name} got quieter: ${fmt(r.change.from)} requests down to ${fmt(r.change.to)}.` : r.change.pct > 0 ? `${r.name} got busier: ${fmt(r.change.from)} requests up to ${fmt(r.change.to)}.` : 'Exactly level.'}</p>
          </>
        )}

        {id === 'ladder' && (
          <>
            <p className="cyc-wr-kicker">Your rivals</p>
            <ol className="cyc-wr-ladder">
              {rungs.map((x, n) => (
                <li key={x.key} className={x.key === r.key ? 'is-you' : ''} style={{ animationDelay: `${n * 90}ms` }}>
                  <b>{x.rank}</b><Cover r={x} shape={shapes.get(x.key)} label="" className="is-mini" /><span>{x.name}</span><small>{fmt(x.total)}</small>
                </li>
              ))}
            </ol>
          </>
        )}

        {id === 'share' && (
          <>
            <p className="cyc-wr-kicker">Your card</p>
            <Cover r={r} shape={shape} showRank className="cyc-wr-card" label={`Calgary · 311 · ${r.year}`} />
            <ShareActions r={r} rankings={rankings} shape={shape} />
            <div className="cyc-wr-more">
              <button type="button" onClick={onPlay}><Gamepad2 size={18} aria-hidden="true" /> Play Higher or Lower</button>
              <button type="button" onClick={onAnother}><RotateCcw size={18} aria-hidden="true" /> Wrap another community</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
