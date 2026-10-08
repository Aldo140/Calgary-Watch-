import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Gamepad2, Play, Sparkles } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useCrimeStats } from '../hooks/useCrimeStats';
import {
  buildRankings,
  findBySlug,
  formatInterval,
  guessVerdict,
  ladder,
  minutesBetweenReports,
  movers,
  teasers,
  type CommunityRank,
} from '../lib/communityRank';
import { BAND_DUOTONE } from '../lib/coverArt';
import { Cover, useShapes } from '../components/check/Cover';
import { HigherLower } from '../components/check/HigherLower';
import { Wrapped } from '../components/check/Wrapped';
import { CommunityPicker, fmt, reducedMotion, ShareActions, shuffled, useCountTo, useMedia, useScrollLock } from '../components/check/shared';
import '../styles/check-community.css';

type Shapes = Map<string, string>;

/** A name sealed behind a tap. Not knowing is the point. */
function Teaser({ label, detail, r, onOpen, tone }: { label: string; detail: (r: CommunityRank) => string; r?: CommunityRank; onOpen: (r: CommunityRank) => void; tone: string }) {
  const [shown, setShown] = useState(false);
  if (!r) return null;
  return (
    <li className={`cyc-teaser is-${tone} ${shown ? 'is-open' : ''}`}>
      <span className="cyc-teaser-label">{label}</span>
      {shown ? (
        <button type="button" className="cyc-teaser-name" onClick={() => onOpen(r)}>
          {r.name}<small>{detail(r)}</small>
        </button>
      ) : (
        <button type="button" className="cyc-teaser-seal" onClick={() => setShown(true)} aria-label={`Reveal ${label.toLowerCase()}`}>
          <span aria-hidden="true" /> Tap to unseal
        </button>
      )}
    </li>
  );
}

function Teasers({ rankings, onOpen }: { rankings: CommunityRank[]; onOpen: (r: CommunityRank) => void }) {
  const t = useMemo(() => teasers(rankings), [rankings]);
  if (!rankings.length) return null;
  return (
    <ul className="cyc-teasers" aria-label="Sealed surprises">
      <Teaser tone="hot" label="#1 in Calgary" r={t.top} detail={(r) => `${fmt(r.total)} requests`} onOpen={onOpen} />
      <Teaser tone="cool" label="Biggest drop" r={t.biggestDrop} detail={(r) => `${r.change!.pct}% last year`} onOpen={onOpen} />
      <Teaser tone="warm" label="Biggest jump" r={t.biggestJump} detail={(r) => `+${r.change!.pct}% last year`} onOpen={onOpen} />
    </ul>
  );
}

/** Covers with no rank on them: pick one to play. */
function Shelf({ rankings, shapes, onOpen, limit, title }: { rankings: CommunityRank[]; shapes: Shapes; onOpen: (r: CommunityRank) => void; limit: number; title: string }) {
  const [all, setAll] = useState(false);
  const list = useMemo(() => shuffled(rankings), [rankings]);
  if (!rankings.length) return null;
  const items = all ? [...rankings].sort((a, b) => a.name.localeCompare(b.name)) : list.slice(0, limit);
  return (
    <section className="cyc-shelf" aria-labelledby="cyc-shelf-title">
      <div className="cyc-shelf-head">
        <h2 id="cyc-shelf-title">{title}</h2>
        {rankings.length > limit && <button type="button" onClick={() => setAll((a) => !a)}>{all ? 'Show less' : `Show all ${rankings.length}`}</button>}
      </div>
      <ul className={`cyc-shelf-row ${all ? 'is-all' : ''}`}>
        {items.map((r) => (
          <li key={r.key}>
            <button type="button" className="cyc-card" onClick={() => onOpen(r)}>
              <Cover r={r} shape={shapes.get(r.key)} label="?" />
              <span className="cyc-card-play" aria-hidden="true"><Play size={20} fill="currentColor" /></span>
              <b>{r.name}</b>
              <small>Guess its rank</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Spotify-style tracklist: number, mini cover, name, count, a bar. */
function Tracklist({ title, items, shapes, value, you, onOpen, max }: {
  title?: string; items: CommunityRank[]; shapes: Shapes; value: (r: CommunityRank) => string; you?: string; onOpen: (r: CommunityRank) => void; max?: number;
}) {
  const top = max ?? Math.max(1, ...items.map((r) => r.total));
  return (
    <section className="cyc-tracks">
      {title && <h3>{title}</h3>}
      <ol>
        {items.map((r) => (
          <li key={r.key} className={r.key === you ? 'is-you' : ''}>
            <button type="button" onClick={() => onOpen(r)} disabled={r.key === you}>
              <i>{r.rank}</i>
              <Cover r={r} shape={shapes.get(r.key)} label="" className="is-mini" />
              <span><b>{r.name}</b><small>{r.key === you ? 'You' : r.band}</small></span>
              <em><span style={{ width: `${Math.max(4, (r.total / top) * 100)}%` }} /></em>
              <strong>{value(r)}</strong>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Boards({ rankings, shapes, onOpen }: { rankings: CommunityRank[]; shapes: Shapes; onOpen: (r: CommunityRank) => void }) {
  const lists: [string, CommunityRank[], (r: CommunityRank) => string][] = [
    ['Top 10 · most 311 requests', rankings.slice(0, 10), (r) => fmt(r.total)],
    ['Biggest drops', movers(rankings, 'down'), (r) => `${r.change!.pct}%`],
    ['Biggest jumps', movers(rankings, 'up'), (r) => `+${r.change!.pct}%`],
  ];
  return (
    <div className="cyc-boards">
      {lists.map(([title, items, value]) => items.length > 0 && (
        <Tracklist key={title} title={title} items={items} shapes={shapes} value={value} onOpen={onOpen} />
      ))}
    </div>
  );
}

function FinePrint() {
  return (
    <section className="cyc-fine" aria-labelledby="cyc-fine-title">
      <h2 id="cyc-fine-title">The fine print</h2>
      <ul>
        <li><b>Source.</b> City of Calgary Open Data: 311 service requests by community, refreshed daily. These are requests residents made, not police crime statistics.</li>
        <li><b>Totals, not per resident.</b> Big, busy communities rank higher partly because more people live, work and pass through them. Downtown, the airport and areas around hospitals and LRT stations collect a lot of requests for that reason.</li>
        <li><b>Trends</b> compare the last two full years and skip communities under 100 requests a year, where small numbers swing wildly.</li>
        <li><b>Not official.</b> CalgaryWatch isn't affiliated with the City of Calgary or Calgary Police. In an emergency, call 911.</li>
      </ul>
    </section>
  );
}

function Headline({ id = 'cyc-title' }: { id?: string }) {
  return <h1 id={id} className="cyc-headline">Calgary,<br />built from its<br /><span>311 calls.</span></h1>;
}

/** Four covers tiled like a playlist mosaic. */
function Mosaic({ rankings, shapes }: { rankings: CommunityRank[]; shapes: Shapes }) {
  const four = useMemo(() => shuffled(rankings).slice(0, 4), [rankings]);
  return (
    <div className="cyc-mosaic" aria-hidden="true">
      {four.length === 4 ? four.map((r) => <Cover key={r.key} r={r} shape={shapes.get(r.key)} label="" />) : <div className="cyc-mosaic-empty" />}
    </div>
  );
}

// ── Desktop ──────────────────────────────────────────────────────────────────

function DeskGuess({ r, guess, setGuess, onLock, onSkip }: { r: CommunityRank; guess: number; setGuess: (n: number) => void; onLock: () => void; onSkip: () => void }) {
  const pct = ((guess - 1) / Math.max(1, r.count - 1)) * 100;
  return (
    <section className="cyc-guess" aria-labelledby="cyc-guess-title">
      <p className="cyc-eyebrow">Round 1 · Your call</p>
      <h2 id="cyc-guess-title">Where does {r.name} rank?</h2>
      <p className="cyc-guess-sub">Out of {r.count} communities. #1 had the most 311 requests this year.</p>
      <p className="cyc-guess-num" aria-hidden="true">#{guess}</p>
      <div className="cyc-scrub" style={{ '--p': `${pct}%` } as React.CSSProperties}>
        <input type="range" min={1} max={r.count} value={guess} onChange={(e) => setGuess(Number(e.target.value))} aria-label={`Your guess, 1 to ${r.count}`} aria-valuetext={`#${guess}`} />
        <div><span>#1 · most</span><span>#{r.count} · fewest</span></div>
      </div>
      <div className="cyc-guess-actions">
        <button type="button" className="cyc-play-btn" onClick={onLock} aria-label={`Lock in #${guess}`}><Play size={26} fill="currentColor" /></button>
        <span className="cyc-guess-lock">Lock in <b>#{guess}</b></span>
        <button type="button" className="cyc-btn cyc-btn-line" onClick={onSkip}>Just show me</button>
      </div>
    </section>
  );
}

function DeskReveal({ r, rankings, shapes, guess, onOpen, onPlay }: { r: CommunityRank; rankings: CommunityRank[]; shapes: Shapes; guess: number | null; onOpen: (r: CommunityRank) => void; onPlay: () => void }) {
  const shown = useCountTo(r.rank, guess ?? r.count, 1300);
  const minutes = minutesBetweenReports(r.total, r.year, new Date());
  const mixTotal = Math.max(1, r.safety + r.property + r.other);
  const mix = [
    ['Safety and disorder', r.safety, 'hot'],
    ['Property damage and theft', r.property, 'warm'],
    ['Everything else', r.other, 'cool'],
  ] as const;
  const rungs = ladder(rankings, r.key, 3);
  return (
    <section className="cyc-reveal" aria-live="polite">
      <div className="cyc-bento">
        <article className="cyc-tile is-rank">
          <p className="cyc-eyebrow">{guess === null ? 'The answer' : `You said #${guess}`}</p>
          <p className="cyc-tile-rank" aria-label={`Rank ${r.rank} of ${r.count}`}><span aria-hidden="true">#{shown}</span></p>
          <p className="cyc-tile-of">of {r.count} Calgary communities · <b>{r.band}</b></p>
          <p className="cyc-tile-verdict">{guess === null ? `${fmt(r.total)} requests so far this year.` : guessVerdict(guess, r.rank)}</p>
        </article>
        {minutes && (
          <article className="cyc-tile is-every">
            <p className="cyc-eyebrow">Someone here contacted 311</p>
            <p className="cyc-tile-big">every <b>{formatInterval(minutes)}</b></p>
            <p className="cyc-tile-foot">{fmt(r.total)} requests since January 1, day and night.</p>
          </article>
        )}
        <article className="cyc-tile is-mix">
          <p className="cyc-eyebrow">What it was about</p>
          <ul>
            {mix.map(([label, v, tone]) => (
              <li key={label} className={`is-${tone}`}>
                <span><b>{Math.round((v / mixTotal) * 100)}%</b>{label}</span>
                <i style={{ width: `${Math.max(2, (v / mixTotal) * 100)}%` }} />
              </li>
            ))}
          </ul>
        </article>
        <article className={`cyc-tile is-trend ${r.change && r.change.pct > 0 ? 'is-up' : 'is-down'}`}>
          <p className="cyc-eyebrow">{r.change ? `${r.change.fromYear} → ${r.change.toYear}` : 'Last full year'}</p>
          {r.change ? (
            <>
              <p className="cyc-tile-big">{r.change.pct <= 0 ? <ArrowDownRight size={56} aria-hidden="true" /> : <ArrowUpRight size={56} aria-hidden="true" />}<b>{r.change.pct > 0 ? '+' : ''}{r.change.pct}%</b></p>
              <p className="cyc-tile-foot">{r.change.pct < 0 ? 'Quieter' : r.change.pct > 0 ? 'Busier' : 'Level'}: {fmt(r.change.from)} → {fmt(r.change.to)} requests.</p>
            </>
          ) : <p className="cyc-tile-foot">Too few requests to call a trend.</p>}
        </article>
      </div>

      <div className="cyc-reveal-row">
        <Tracklist title="Your rivals" items={rungs} shapes={shapes} you={r.key} value={(x) => fmt(x.total)} onOpen={onOpen} max={rankings[0]?.total} />
        <aside className="cyc-sharebox">
          <Cover r={r} shape={shapes.get(r.key)} showRank className="is-share" />
          <ShareActions r={r} rankings={rankings} shape={shapes.get(r.key)} />
          <button type="button" className="cyc-ghost" onClick={onPlay}><Gamepad2 size={18} aria-hidden="true" /> Play Higher or Lower from {r.name}</button>
        </aside>
      </div>
    </section>
  );
}

function Desktop({ rankings, isLoading }: { rankings: CommunityRank[]; isLoading: boolean }) {
  const [params, setParams] = useSearchParams();
  const selected = findBySlug(rankings, params.get('c'));
  const [phase, setPhase] = useState<'guess' | 'reveal'>('reveal');
  const [guess, setGuess] = useState(1);
  const [locked, setLocked] = useState<number | null>(null);
  const [gameStart, setGameStart] = useState<CommunityRank | undefined>();
  const [gameKey, setGameKey] = useState(0);
  const gameRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const shapes = useShapes();
  const totalRequests = useMemo(() => rankings.reduce((s, r) => s + r.total, 0), [rankings]);

  useEffect(() => {
    if (params.get('play') && rankings.length) gameRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [params, rankings.length]);

  const open = (r: CommunityRank, withGuess = true) => {
    setLocked(null);
    setGuess(Math.round(r.count / 2));
    setPhase(withGuess ? 'guess' : 'reveal');
    setParams({ c: r.slug });
    topRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const close = () => { setLocked(null); setParams({}); };
  const play = (from?: CommunityRank) => { setGameStart(from); setGameKey((k) => k + 1); gameRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' }); };
  const tint = selected ? BAND_DUOTONE[selected.band].from : '#5038a0';

  return (
    <div className="cyc cyc-desk" style={{ '--tint': tint } as React.CSSProperties} ref={topRef}>
      <header className="cyc-head" aria-labelledby="cyc-title">
        {selected ? (
          <div className="cyc-head-inner" key={selected.key}>
            <Cover r={selected} shape={shapes.get(selected.key)} showRank={phase === 'reveal'} className="is-hero" label={phase === 'reveal' ? undefined : '?'} />
            <div className="cyc-head-text">
              <button type="button" className="cyc-back" onClick={close}><ArrowLeft size={16} aria-hidden="true" /> All communities</button>
              <p className="cyc-head-type">Community</p>
              <h1 id="cyc-title" className="cyc-head-name">{selected.name}</h1>
              <p className="cyc-head-meta"><b>CalgaryWatch</b> · 311 requests · {selected.year} · {phase === 'reveal' ? `#${selected.rank} of ${selected.count}` : `? of ${selected.count}`}</p>
            </div>
          </div>
        ) : (
          <div className="cyc-head-inner">
            <Mosaic rankings={rankings} shapes={shapes} />
            <div className="cyc-head-text">
              <p className="cyc-head-type"><span className="cyc-live" aria-hidden="true" /> Public ranking · live from City of Calgary 311 data</p>
              <Headline />
              <p className="cyc-head-meta"><b>CalgaryWatch</b> · {rankings.length || '…'} communities · {totalRequests ? `${fmt(totalRequests)} requests` : 'loading'} in {rankings[0]?.year ?? 'this year'}</p>
            </div>
          </div>
        )}
      </header>

      <div className="cyc-bar">
        <button type="button" className="cyc-play-btn is-lg" onClick={() => play(selected)} disabled={!rankings.length} aria-label="Play Higher or Lower"><Play size={28} fill="currentColor" /></button>
        <span className="cyc-bar-label">Higher <i>or</i> Lower</span>
        <CommunityPicker rankings={rankings} onPick={(r) => open(r)} placeholder={isLoading && !rankings.length ? 'Loading the city…' : 'Find your community'} hint="Guess it" className="is-desk" />
      </div>

      <main className="cyc-body">
        {selected && phase === 'guess' && (
          <DeskGuess r={selected} guess={guess} setGuess={setGuess} onLock={() => { setLocked(guess); setPhase('reveal'); }} onSkip={() => { setLocked(null); setPhase('reveal'); }} />
        )}
        {selected && phase === 'reveal' && (
          <DeskReveal key={selected.key} r={selected} rankings={rankings} shapes={shapes} guess={locked} onOpen={(r) => open(r)} onPlay={() => play(selected)} />
        )}
        {!selected && <Teasers rankings={rankings} onOpen={(r) => open(r, false)} />}
        <Shelf rankings={rankings} shapes={shapes} onOpen={(r) => open(r)} limit={12} title={selected ? 'Guess another' : 'Pick a cover, guess its rank'} />

        <section ref={gameRef} className="cyc-game" aria-labelledby="cyc-game-title">
          <div className="cyc-shelf-head">
            <h2 id="cyc-game-title">Which community called 311 more?</h2>
          </div>
          {rankings.length > 0 && <HigherLower key={gameKey} rankings={rankings} shapes={shapes} start={gameStart} layout="side" />}
        </section>

        {selected && phase === 'reveal' && <Boards rankings={rankings} shapes={shapes} onOpen={(r) => open(r)} />}
        <FinePrint />
      </main>
    </div>
  );
}

// ── Mobile ───────────────────────────────────────────────────────────────────

const WALL_TONES = Object.values(BAND_DUOTONE);

/** Three rows of covers drifting in opposite directions: the phone opener. Placeholder tiles while data loads. */
function CoverWall({ rankings, shapes }: { rankings: CommunityRank[]; shapes: Shapes }) {
  const rows = useMemo(() => {
    const list = shuffled(rankings).slice(0, 30);
    return [0, 1, 2].map((i) => list.filter((_, n) => n % 3 === i));
  }, [rankings]);
  return (
    <div className="cyc-wall" aria-hidden="true">
      {rows.map((row, i) => (
        <div key={i} className={`cyc-wall-row is-${i}`}>
          {[0, 1].map((copy) => (
            <div key={copy} className="cyc-wall-track">
              {row.length
                ? row.map((r) => <Cover key={r.key} r={r} shape={shapes.get(r.key)} label="?" />)
                : Array.from({ length: 8 }, (_, n) => {
                    const t = WALL_TONES[(n + i) % WALL_TONES.length];
                    return <div key={n} className="cyc-cover is-blank" style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }} />;
                  })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Mobile({ rankings, isLoading }: { rankings: CommunityRank[]; isLoading: boolean }) {
  const [params, setParams] = useSearchParams();
  const selected = findBySlug(rankings, params.get('c'));
  const [wrapOpen, setWrapOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [gameStart, setGameStart] = useState<CommunityRank | undefined>();
  const [seen, setSeen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const shapes = useShapes();
  useScrollLock(gameOpen);

  useEffect(() => { if (selected && !seen) { setWrapOpen(true); setSeen(true); } }, [selected, seen]);
  useEffect(() => { if (params.get('play') && rankings.length) setGameOpen(true); }, [params, rankings.length]);

  const open = (r: CommunityRank) => { setParams({ c: r.slug }); setWrapOpen(true); setSeen(true); };

  return (
    <div className="cyc cyc-mob">
      <section className="cyc-m-hero" aria-labelledby="cyc-title">
        <CoverWall rankings={rankings} shapes={shapes} />
        <div className="cyc-m-copy">
        <p className="cyc-head-type"><span className="cyc-live" aria-hidden="true" /> Calgary 311 · {rankings[0]?.year ?? 'this year'}</p>
        <Headline />
        <p className="cyc-m-lead">{rankings.length ? `${rankings.length} communities` : 'Every community'}, ranked by how often their people called the City. Guess where yours lands, then get the card.</p>
        <div ref={pickerRef}>
          <CommunityPicker rankings={rankings} onPick={open} placeholder={isLoading && !rankings.length ? 'Loading…' : 'Find your community'} hint="Wrap it" className="is-mob" />
        </div>
        <button type="button" className="cyc-m-game" onClick={() => { setGameStart(undefined); setGameOpen(true); }} disabled={!rankings.length}>
          <span className="cyc-play-btn" aria-hidden="true"><Play size={20} fill="currentColor" /></span>
          <span><b>Higher or Lower</b><small>Which community called 311 more?</small></span>
          <ArrowRight size={20} aria-hidden="true" />
        </button>
        </div>
      </section>

      <div className="cyc-m-lower">
        {selected && !wrapOpen && (
          <button type="button" className="cyc-m-rewrap" onClick={() => setWrapOpen(true)}><Sparkles size={18} aria-hidden="true" /> Replay {selected.name}, wrapped</button>
        )}
        <Teasers rankings={rankings} onOpen={open} />
        <Shelf rankings={rankings} shapes={shapes} onOpen={open} limit={10} title="Or pick a cover" />
        {seen && <Boards rankings={rankings} shapes={shapes} onOpen={open} />}
        <FinePrint />
      </div>

      {wrapOpen && selected && (
        <Wrapped
          key={selected.key}
          r={selected}
          rankings={rankings}
          shape={shapes.get(selected.key)}
          shapes={shapes}
          onClose={() => setWrapOpen(false)}
          onPlay={() => { setWrapOpen(false); setGameStart(selected); setGameOpen(true); }}
          onAnother={() => { setWrapOpen(false); setParams({}); requestAnimationFrame(() => pickerRef.current?.querySelector('input')?.focus()); }}
        />
      )}
      {gameOpen && (
        <div className="cyc-m-gamefs" role="dialog" aria-modal="true" aria-label="Higher or Lower">
          <HigherLower rankings={rankings} shapes={shapes} start={gameStart} layout="stack" onClose={() => setGameOpen(false)} />
        </div>
      )}
    </div>
  );
}

export default function CheckYourCommunityPage() {
  const { stats, yearlyStats, isLoading } = useCrimeStats();
  const rankings = useMemo(() => buildRankings(stats, yearlyStats), [stats, yearlyStats]);
  const mobile = useMedia('(max-width: 760px)');
  return (
    <SiteLayout>
      {mobile ? <Mobile rankings={rankings} isLoading={isLoading} /> : <Desktop rankings={rankings} isLoading={isLoading} />}
    </SiteLayout>
  );
}
