import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Gamepad2, Sparkles, X } from 'lucide-react';
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
  rankForTotal,
  teasers,
  type CommunityRank,
} from '../lib/communityRank';
import { DataCity, useCityBlocks, type CityMode } from '../components/check/DataCity';
import { HigherLower } from '../components/check/HigherLower';
import { Wrapped } from '../components/check/Wrapped';
import { BAND_COLOUR, CommunityPicker, fmt, reducedMotion, ShareActions, useCountTo, useMedia, useScrollLock } from '../components/check/shared';
import '../styles/check-community.css';

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

function Boards({ rankings, onOpen }: { rankings: CommunityRank[]; onOpen: (r: CommunityRank) => void }) {
  const lists: [string, string, CommunityRank[], (r: CommunityRank) => string][] = [
    ['hot', 'Most 311 requests', rankings.slice(0, 10), (r) => fmt(r.total)],
    ['cool', 'Biggest drops', movers(rankings, 'down'), (r) => `${r.change!.pct}%`],
    ['warm', 'Biggest jumps', movers(rankings, 'up'), (r) => `+${r.change!.pct}%`],
  ];
  return (
    <div className="cyc-boards">
      {lists.map(([tone, title, items, value]) => items.length > 0 && (
        <section key={title} className={`cyc-board is-${tone}`}>
          <h3>{title}</h3>
          <ol>
            {items.map((r, i) => (
              <li key={r.key}><button type="button" onClick={() => onOpen(r)}><i>{String(i + 1).padStart(2, '0')}</i><span>{r.name}</span><b>{value(r)}</b></button></li>
            ))}
          </ol>
        </section>
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

// ── Desktop ──────────────────────────────────────────────────────────────────

/** Slider position 0–1000 ↔ report count, on a log scale so quiet communities get room. */
function useLogScale(rankings: CommunityRank[]) {
  const lo = Math.max(1, rankings[rankings.length - 1]?.total ?? 1);
  const hi = Math.max(lo + 1, rankings[0]?.total ?? 2);
  return {
    toTotal: (pos: number) => Math.round(Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * (pos / 1000))),
    toPos: (total: number) => Math.round(((Math.log(Math.max(lo, total)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * 1000),
  };
}

function DeskGuess({ r, rankings, pos, setPos, toTotal, onLock, onSkip }: {
  r: CommunityRank; rankings: CommunityRank[]; pos: number; setPos: (n: number) => void; toTotal: (n: number) => number; onLock: () => void; onSkip: () => void;
}) {
  const total = toTotal(pos);
  const asRank = rankForTotal(rankings, total, r.key);
  return (
    <div className="cyc-d-guess">
      <p className="cyc-eyebrow">Round 1 · Build it</p>
      <h2>Raise <em>{r.name}</em> to where you think it stands.</h2>
      <p className="cyc-d-sub">Its block is lit on the map. Drag it up or down until it's as tall, next to its neighbours, as you think its 311 count is.</p>
      <div className="cyc-d-lift">
        <input
          className="cyc-d-vslider"
          type="range"
          min={0}
          max={1000}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`Your guess for ${r.name}'s 311 requests`}
          aria-valuetext={`${fmt(total)} requests, rank ${asRank}`}
        />
        <div className="cyc-d-readout">
          <span>Your guess</span>
          <b>{fmt(total)}</b>
          <small>requests</small>
          <span className="cyc-d-would">That would make it <strong>#{asRank}</strong> of {r.count}</span>
        </div>
      </div>
      <div className="cyc-d-buttons">
        <button type="button" className="cyc-btn cyc-btn-hot" onClick={onLock}>Lock it in</button>
        <button type="button" className="cyc-btn cyc-btn-line" onClick={onSkip}>Just show me</button>
      </div>
    </div>
  );
}

function DeskReveal({ r, rankings, guessRank, onOpen, onPlay }: { r: CommunityRank; rankings: CommunityRank[]; guessRank: number | null; onOpen: (r: CommunityRank) => void; onPlay: () => void }) {
  const shown = useCountTo(r.rank, guessRank ?? r.count, 1300);
  const minutes = minutesBetweenReports(r.total, r.year, new Date());
  const mix = [
    ['Safety and disorder', r.safety, 'red'],
    ['Property damage and theft', r.property, 'yellow'],
    ['Everything else', r.other, 'blue'],
  ] as const;
  return (
    <div className="cyc-d-reveal">
      <p className="cyc-eyebrow">{guessRank === null ? 'The answer' : 'Round 2 · The truth'}</p>
      <h2 className="cyc-d-verdict">{guessRank === null ? `${r.name}.` : guessVerdict(guessRank, r.rank)}</h2>
      <div className="cyc-d-rankrow">
        <p className="cyc-d-rank" aria-label={`Rank ${r.rank} of ${r.count}`}><span aria-hidden="true">#{shown}</span></p>
        <div className="cyc-d-rankmeta">
          <span className="cyc-chip" style={{ background: BAND_COLOUR[r.band] }}>{r.band}</span>
          <span>of {r.count} Calgary communities</span>
        </div>
      </div>
      <dl className="cyc-d-facts">
        <div><dt>Requests this year</dt><dd>{fmt(r.total)}</dd></div>
        {minutes && <div><dt>One every</dt><dd>{formatInterval(minutes)}</dd></div>}
        <div>
          <dt>Last full year</dt>
          <dd>{r.change ? (
            <span className={r.change.pct <= 0 ? 'cyc-good' : 'cyc-bad'}>{r.change.pct <= 0 ? <ArrowDownRight size={18} aria-hidden="true" /> : <ArrowUpRight size={18} aria-hidden="true" />}{r.change.pct > 0 ? '+' : ''}{r.change.pct}%</span>
          ) : <span className="cyc-dim">n/a</span>}</dd>
        </div>
      </dl>
      <div className="cyc-mix" role="img" aria-label={mix.map(([l, v]) => `${l}: ${fmt(v)}`).join(', ')}>
        {mix.map(([l, v, tone]) => v > 0 && <span key={l} className={`is-${tone}`} style={{ flexGrow: v }}><em>{l}</em></span>)}
      </div>
      <ol className="cyc-d-ladder">
        {ladder(rankings, r.key, 2).map((x) => (
          <li key={x.key} className={x.key === r.key ? 'is-you' : ''}>
            {x.key === r.key ? <span><b>#{x.rank}</b>{x.name}<small>you</small></span> : <button type="button" onClick={() => onOpen(x)}><b>#{x.rank}</b>{x.name}<small>{fmt(x.total)}</small></button>}
          </li>
        ))}
      </ol>
      <ShareActions r={r} rankings={rankings} />
      <button type="button" className="cyc-d-play" onClick={onPlay}><Gamepad2 size={18} aria-hidden="true" /> Play Higher or Lower starting from {r.name} <ArrowRight size={16} aria-hidden="true" /></button>
    </div>
  );
}

function Desktop({ rankings, isLoading }: { rankings: CommunityRank[]; isLoading: boolean }) {
  const [params, setParams] = useSearchParams();
  const selected = findBySlug(rankings, params.get('c'));
  const [mode, setMode] = useState<CityMode>(selected ? 'reveal' : 'idle');
  const [pos, setPos] = useState(500);
  const [lockedTotal, setLockedTotal] = useState<number | null>(null);
  const [gameStart, setGameStart] = useState<CommunityRank | undefined>();
  const [gameKey, setGameKey] = useState(0);
  const gameRef = useRef<HTMLElement>(null);
  const keys = useMemo(() => rankings.map((r) => r.key), [rankings]);
  const blocks = useCityBlocks(keys);
  const { toTotal } = useLogScale(rankings);

  useEffect(() => { if (selected && mode === 'idle') setMode('reveal'); }, [selected, mode]);
  useEffect(() => {
    if (params.get('play') && rankings.length) gameRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [params, rankings.length]);

  const open = (r: CommunityRank, withGuess = true) => {
    setLockedTotal(null);
    setPos(500);
    setMode(withGuess ? 'guess' : 'reveal');
    setParams({ c: r.slug });
  };
  const close = () => { setMode('idle'); setLockedTotal(null); setParams({}); };
  const play = (from?: CommunityRank) => { setGameStart(from); setGameKey((k) => k + 1); gameRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' }); };

  const guessTotal = mode === 'guess' ? toTotal(pos) : lockedTotal;
  const guessRank = selected && lockedTotal !== null ? rankForTotal(rankings, lockedTotal, selected.key) : null;

  return (
    <div className="cyc cyc-desk">
      <section className={`cyc-d-hero ${selected ? 'has-panel' : ''}`} aria-labelledby="cyc-title">
        <div className="cyc-d-sky" aria-hidden="true" />
        <DataCity rankings={rankings} blocks={blocks} selectedKey={selected?.key} mode={selected ? mode : 'idle'} guessTotal={guessTotal} onPick={(r) => open(r)} />
        <div className="cyc-d-intro">
          <p className="cyc-kicker"><span className="cyc-live" aria-hidden="true" />Live from City of Calgary 311 data</p>
          <h1 id="cyc-title">Calgary,<br />built from its<br /><span>311 calls.</span></h1>
          <p className="cyc-d-lead">Every block is a real community, raised by how often its people called the City this year{rankings[0] ? ` (${rankings[0].year})` : ''}. Find yours. Guess how tall it is. Then see the truth.</p>
          <CommunityPicker rankings={rankings} onPick={(r) => open(r)} placeholder={isLoading && !rankings.length ? 'Loading the city…' : 'Find your community'} hint="Build it" className="is-desk" />
          {!selected && <Teasers rankings={rankings} onOpen={(r) => open(r, false)} />}
        </div>
        <div className="cyc-d-legend" aria-hidden="true">
          {(['Hot', 'High', 'Elevated', 'Calm'] as const).map((b) => <span key={b}><i style={{ background: BAND_COLOUR[b] }} />{b}</span>)}
          <em>Hover a block · click to play</em>
        </div>
        {selected && (
          <aside className="cyc-d-panel" key={`${selected.key}-${mode}`} aria-live="polite">
            <button type="button" className="cyc-d-close" onClick={close} aria-label="Close"><X size={20} /></button>
            {mode === 'guess' ? (
              <DeskGuess r={selected} rankings={rankings} pos={pos} setPos={setPos} toTotal={toTotal} onLock={() => { setLockedTotal(toTotal(pos)); setMode('reveal'); }} onSkip={() => { setLockedTotal(null); setMode('reveal'); }} />
            ) : (
              <DeskReveal r={selected} rankings={rankings} guessRank={guessRank} onOpen={(r) => open(r)} onPlay={() => play(selected)} />
            )}
          </aside>
        )}
      </section>

      <section ref={gameRef} className="cyc-d-game" aria-labelledby="cyc-game-title">
        <div className="cw-wrap">
          <div className="cyc-d-game-head">
            <p className="cyc-eyebrow is-dark">The game</p>
            <h2 id="cyc-game-title">Which community called 311 more?</h2>
            <p>Two communities. One count is showing. Call it, keep the streak alive, then send it to the friend who swears their neighbourhood is quiet.</p>
          </div>
          {rankings.length > 0 && <HigherLower key={gameKey} rankings={rankings} start={gameStart} layout="side" />}
        </div>
      </section>

      <div className="cw-wrap cyc-d-lower">
        {selected && mode === 'reveal' && <Boards rankings={rankings} onOpen={(r) => open(r)} />}
        <FinePrint />
      </div>
    </div>
  );
}

// ── Mobile ───────────────────────────────────────────────────────────────────

function Marquee({ rankings }: { rankings: CommunityRank[] }) {
  const rows = useMemo(() => {
    const names = rankings.map((r) => r.name);
    if (!names.length) return [];
    const third = Math.ceil(names.length / 3);
    return [names.slice(0, third), names.slice(third, third * 2), names.slice(third * 2)].map((row) => (row.length ? row : names).slice(0, 40));
  }, [rankings]);
  return (
    <div className="cyc-m-marquee" aria-hidden="true">
      {rows.map((row, i) => (
        <div key={i} className={`cyc-m-row is-${i}`}>
          <span>{row.join(' · ')} · </span><span>{row.join(' · ')} · </span>
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
  useScrollLock(gameOpen);

  useEffect(() => { if (selected && !seen) { setWrapOpen(true); setSeen(true); } }, [selected, seen]);
  useEffect(() => { if (params.get('play') && rankings.length) setGameOpen(true); }, [params, rankings.length]);

  const open = (r: CommunityRank) => { setParams({ c: r.slug }); setWrapOpen(true); setSeen(true); };

  return (
    <div className="cyc cyc-mob">
      <section className="cyc-m-hero" aria-labelledby="cyc-title">
        <Marquee rankings={rankings} />
        <div className="cyc-m-inner">
          <p className="cyc-kicker"><span className="cyc-live" aria-hidden="true" />Calgary 311 · {rankings[0]?.year ?? 'this year'}</p>
          <h1 id="cyc-title" className="cyc-m-title">
            <span>Your</span><span>community,</span><span className="is-hot">wrapped.</span>
          </h1>
          <p className="cyc-m-lead">{rankings.length || 'Every'} Calgary communities, ranked by 311 requests. Guess where yours lands, then get the card.</p>
          <div ref={pickerRef}>
            <CommunityPicker rankings={rankings} onPick={open} placeholder={isLoading && !rankings.length ? 'Loading…' : 'Type your community'} hint="Wrap it" className="is-mob" />
          </div>
          <button type="button" className="cyc-m-game" onClick={() => { setGameStart(undefined); setGameOpen(true); }} disabled={!rankings.length}>
            <Gamepad2 size={22} aria-hidden="true" />
            <span><b>Higher or Lower</b><small>Which community called 311 more?</small></span>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
          <Teasers rankings={rankings} onOpen={open} />
        </div>
      </section>

      <div className="cw-wrap cyc-m-lower">
        {selected && !wrapOpen && (
          <button type="button" className="cyc-m-rewrap" onClick={() => setWrapOpen(true)}><Sparkles size={18} aria-hidden="true" /> Replay {selected.name}, wrapped</button>
        )}
        {seen && <Boards rankings={rankings} onOpen={open} />}
        <FinePrint />
      </div>

      {wrapOpen && selected && (
        <Wrapped
          key={selected.key}
          r={selected}
          rankings={rankings}
          onClose={() => setWrapOpen(false)}
          onPlay={() => { setWrapOpen(false); setGameStart(selected); setGameOpen(true); }}
          onAnother={() => { setWrapOpen(false); setParams({}); requestAnimationFrame(() => pickerRef.current?.querySelector('input')?.focus()); }}
        />
      )}
      {gameOpen && (
        <div className="cyc-m-gamefs" role="dialog" aria-modal="true" aria-label="Higher or Lower">
          <HigherLower rankings={rankings} start={gameStart} layout="stack" onClose={() => setGameOpen(false)} />
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
