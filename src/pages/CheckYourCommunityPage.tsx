import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, Download, Link2, MapPin, Share2 } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useCrimeStats } from '../hooks/useCrimeStats';
import {
  barHeight,
  buildRankings,
  findBySlug,
  guessVerdict,
  ladder,
  movers,
  searchCommunities,
  shareText,
  teasers,
  type CommunityRank,
} from '../lib/communityRank';
import { drawShareCard } from '../lib/shareCard';
import '../styles/check-community.css';

const PATH = '/check-your-community';
const fmt = (n: number) => n.toLocaleString('en-CA');
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function pageLink(r: CommunityRank): string {
  return `${window.location.origin}${PATH}?c=${r.slug}`;
}

/** Counts a number from `from` to `to` once, easing out. */
function useCountTo(to: number, from: number): number {
  const [value, setValue] = useState(reducedMotion() ? to : from);
  useEffect(() => {
    if (reducedMotion()) { setValue(to); return; }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1100);
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, from]);
  return value;
}

function CommunityPicker({ rankings, onPick, placeholder, autoFocus, size = 'lg' }: {
  rankings: CommunityRank[];
  onPick: (r: CommunityRank) => void;
  placeholder: string;
  autoFocus?: boolean;
  size?: 'lg' | 'sm';
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const matches = useMemo(() => searchCommunities(rankings, query), [rankings, query]);
  const listId = `cyc-matches-${size}`;
  const pick = (r: CommunityRank) => { setQuery(''); onPick(r); };

  return (
    <div className={`cyc-picker cyc-picker-${size}`}>
      <MapPin className="cyc-picker-icon" size={size === 'lg' ? 22 : 18} aria-hidden="true" />
      <input
        className="cyc-input"
        type="search"
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-controls={listId}
        disabled={rankings.length === 0}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]); }
        }}
      />
      {matches.length > 0 && (
        <ul className="cyc-matches" id={listId} role="listbox">
          {matches.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'is-active' : ''} onClick={() => pick(r)}>
                <span>{r.name}</span>
                <small>Guess its rank <ArrowRight size={14} aria-hidden="true" /></small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The hero's skyline: every Calgary community as one bar, A to Z, so the city
 * reads as a silhouette. Hover to see a name, click to play that community.
 */
function Skyline({ rankings, selectedKey, onPick }: { rankings: CommunityRank[]; selectedKey?: string; onPick: (r: CommunityRank) => void }) {
  const bars = useMemo(() => [...rankings].sort((a, b) => a.key.localeCompare(b.key)), [rankings]);
  const max = rankings[0]?.total ?? 1;
  const [hover, setHover] = useState<number | null>(null);
  if (!bars.length) return <div className="cyc-skyline cyc-skyline-empty" aria-hidden="true" />;
  const n = bars.length;
  const hovered = hover !== null ? bars[hover] : undefined;

  return (
    <div className="cyc-skyline" onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${n * 4} 200`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Every Calgary community as a bar, A to Z. Taller bars had more 311 reports. ${n} communities.`}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - box.left) / box.width) * n))));
        }}
        onClick={() => hovered && onPick(hovered)}
      >
        {bars.map((r, i) => {
          const h = Math.max(3, barHeight(r.total, max) * 192);
          const cls = r.key === selectedKey ? 'is-selected' : i === hover ? 'is-hover' : `cyc-sky-${r.band.toLowerCase()}`;
          return <rect key={r.key} className={cls} x={i * 4} y={200 - h} width={3} height={h} style={{ '--i': i } as CSSProperties} />;
        })}
      </svg>
      {hovered && (
        <div className="cyc-skyline-tip" style={{ left: `${((hover! + 0.5) / n) * 100}%` }} aria-hidden="true">
          <b>{hovered.name}</b> Tap to guess
        </div>
      )}
    </div>
  );
}

/** A name sealed behind a tap. Not knowing is the point. */
function Teaser({ label, detail, r, onOpen, tone }: { label: string; detail: (r: CommunityRank) => string; r?: CommunityRank; onOpen: (r: CommunityRank) => void; tone: string }) {
  const [shown, setShown] = useState(false);
  if (!r) return null;
  return (
    <li className={`cyc-teaser cyc-teaser-${tone} ${shown ? 'is-open' : ''}`}>
      <span className="cyc-teaser-label">{label}</span>
      {shown ? (
        <button type="button" className="cyc-teaser-name" onClick={() => onOpen(r)}>
          {r.name} <small>{detail(r)} · see it <ArrowRight size={12} aria-hidden="true" /></small>
        </button>
      ) : (
        <button type="button" className="cyc-teaser-seal" onClick={() => setShown(true)} aria-label={`Reveal ${label.toLowerCase()}`}>
          <span aria-hidden="true">████████</span> Tap to reveal
        </button>
      )}
    </li>
  );
}

/**
 * Every community sorted from most to fewest reports. In guess mode a pin
 * rides on top; in reveal mode the guess pin stays as a ghost and the real
 * position lights up, with the gap between them measured.
 */
function Spectrum({ rankings, target, guess, onGuess }: { rankings: CommunityRank[]; target: CommunityRank; guess: number | null; onGuess?: (n: number) => void }) {
  const n = rankings.length;
  const max = rankings[0]?.total ?? 1;
  const pos = (rank: number) => ((rank - 0.5) / n) * 100;
  const revealing = !onGuess;
  const lo = guess === null ? target.rank : Math.min(guess, target.rank);
  const hi = guess === null ? target.rank : Math.max(guess, target.rank);

  return (
    <div className={`cyc-spectrum ${revealing ? 'is-reveal' : 'is-guess'}`}>
      <svg viewBox={`0 0 ${n * 4} 120`} preserveAspectRatio="none" aria-hidden="true">
        {rankings.map((r, i) => {
          const h = Math.max(3, barHeight(r.total, max) * 116);
          const isTarget = revealing && r.key === target.key;
          const inGap = revealing && guess !== null && r.rank > lo && r.rank < hi;
          const nearPin = !revealing && guess !== null && Math.abs(r.rank - guess) <= Math.max(1, Math.round(n / 80));
          return <rect key={r.key} x={i * 4} y={120 - h} width={3} height={h} className={isTarget ? 'is-target' : nearPin ? 'is-near' : inGap ? 'is-gap' : ''} />;
        })}
      </svg>
      {revealing && guess !== null && guess !== target.rank && (
        <div className="cyc-gap" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }}>
          <span>{Math.abs(guess - target.rank)} spots</span>
        </div>
      )}
      {guess !== null && (
        <div className={`cyc-pin cyc-pin-guess ${revealing ? 'is-ghost' : ''}`} style={{ left: `${pos(guess)}%` }}>
          <span>{revealing ? 'You' : `#${guess}`}</span>
        </div>
      )}
      {revealing && (
        <div className="cyc-pin cyc-pin-actual" style={{ left: `${pos(target.rank)}%` }}>
          <span>#{target.rank}</span>
        </div>
      )}
      {onGuess && guess !== null && (
        <input
          className="cyc-spectrum-range"
          type="range"
          min={1}
          max={n}
          value={guess}
          onChange={(e) => onGuess(Number(e.target.value))}
          aria-label={`Your guess for ${target.name}'s rank, 1 to ${n}`}
          aria-valuetext={`#${guess}`}
        />
      )}
      <div className="cyc-spectrum-ends" aria-hidden="true"><span>← Most reports</span><span>Fewest →</span></div>
    </div>
  );
}

function Guess({ r, rankings, onDone }: { r: CommunityRank; rankings: CommunityRank[]; onDone: (guess: number | null) => void }) {
  const [value, setValue] = useState(Math.round(rankings.length / 2));
  return (
    <section className="cyc-stage cyc-guess" aria-labelledby="cyc-guess-title">
      <p className="cyc-step">Step 1 of 2 · Make your call</p>
      <h2 id="cyc-guess-title">Where does <em>{r.name}</em> land?</h2>
      <p className="cyc-stage-sub">Every bar below is a Calgary community, busiest on the left. Drag the pin to where you think {r.name} sits.</p>
      <p className="cyc-guess-value" aria-hidden="true">#{value}<small> of {rankings.length}</small></p>
      <Spectrum rankings={rankings} target={r} guess={value} onGuess={setValue} />
      <div className="cyc-actions">
        <button type="button" className="cyc-btn cyc-btn-primary" onClick={() => onDone(value)}>Lock in #{value}</button>
        <button type="button" className="cyc-btn cyc-btn-ghost" onClick={() => onDone(null)}>Skip, just show me</button>
      </div>
    </section>
  );
}

function ChangeLine({ r }: { r: CommunityRank }) {
  if (!r.change) return <span className="cyc-muted">Too little history to compare</span>;
  const { pct, fromYear, toYear } = r.change;
  if (pct === 0) return <span>Flat, {fromYear} to {toYear}</span>;
  const Icon = pct < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span className={pct < 0 ? 'cyc-down' : 'cyc-up'}>
      <Icon size={18} aria-hidden="true" /> {pct < 0 ? 'Down' : 'Up'} {Math.abs(pct)}% <small>{fromYear}→{toYear}</small>
    </span>
  );
}

/** The collectible: what people screenshot. */
function RankCard({ r, guess }: { r: CommunityRank; guess: number | null }) {
  const shown = useCountTo(r.rank, guess ?? r.count);
  const parts = [
    { label: 'Safety and disorder', value: r.safety, tone: 'red' },
    { label: 'Property damage and theft', value: r.property, tone: 'yellow' },
    { label: 'Everything else', value: r.other, tone: 'blue' },
  ];
  return (
    <article className={`cyc-card cyc-band-${r.band.toLowerCase()}`}>
      <div className="cyc-card-inner">
        <header className="cyc-card-head">
          <span>Calgary · 311 · {r.year}</span>
          <span className="cyc-card-band">{r.band}</span>
        </header>
        <h2 className="cyc-card-name">{r.name}</h2>
        <p className="cyc-card-rank" aria-label={`Rank ${r.rank} of ${r.count}`}><span aria-hidden="true">#{shown}</span><small aria-hidden="true">of {r.count}</small></p>
        {r.rank === 1 && <p className="cyc-card-crown">The most 311 reports in Calgary</p>}
        <dl className="cyc-card-stats">
          <div><dt>Reports this year</dt><dd>{fmt(r.total)}</dd></div>
          <div><dt>Last full year</dt><dd><ChangeLine r={r} /></dd></div>
        </dl>
        <div className="cyc-bar" role="img" aria-label={parts.map((p) => `${p.label}: ${fmt(p.value)}`).join(', ')}>
          {parts.map((p) => p.value > 0 && <span key={p.label} className={`cyc-fill-${p.tone}`} style={{ flexGrow: p.value }} />)}
        </div>
        <ul className="cyc-legend">
          {parts.map((p) => <li key={p.label}><i className={`cyc-fill-${p.tone}`} aria-hidden="true" />{p.label}<b>{fmt(p.value)}</b></li>)}
        </ul>
        <footer className="cyc-card-foot">calgarywatch.ca</footer>
      </div>
    </article>
  );
}

function Ladder({ r, rankings, onOpen }: { r: CommunityRank; rankings: CommunityRank[]; onOpen: (r: CommunityRank) => void }) {
  const rows = ladder(rankings, r.key, 2);
  return (
    <section className="cyc-ladder" aria-labelledby="cyc-ladder-title">
      <h3 id="cyc-ladder-title">Your neighbours on the ladder</h3>
      <ol>
        {rows.map((x) => (
          <li key={x.key} className={x.key === r.key ? 'is-you' : ''}>
            {x.key === r.key ? (
              <span className="cyc-ladder-row"><b>#{x.rank}</b><span>{x.name}</span><em>You</em></span>
            ) : (
              <button type="button" className="cyc-ladder-row" onClick={() => onOpen(x)}><b>#{x.rank}</b><span>{x.name}</span><small>{fmt(x.total)}</small></button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ShareBar({ r, rankings }: { r: CommunityRank; rankings: CommunityRank[] }) {
  const [state, setState] = useState<'' | 'copied' | 'saving' | 'saved'>('');
  const flash = (s: typeof state) => { setState(s); setTimeout(() => setState(''), 2200); };
  const canShare = typeof navigator.share === 'function';

  const shareLink = async () => {
    const text = shareText(r);
    const url = pageLink(r);
    if (canShare) {
      try { await navigator.share({ title: `${r.name}: #${r.rank} of ${r.count}`, text, url }); return; } catch { /* dismissed */ }
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); flash('copied'); } catch { /* clipboard blocked */ }
  };

  const saveCard = async () => {
    setState('saving');
    const blob = await drawShareCard(r, rankings);
    if (!blob) { setState(''); return; }
    const file = new File([blob], `${r.slug}-calgary-rank.png`, { type: 'image/png' });
    if (canShare && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], text: `${shareText(r)} ${pageLink(r)}` }); setState(''); return; } catch { /* dismissed: fall through to download */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    flash('saved');
  };

  return (
    <div className="cyc-actions">
      <button type="button" className="cyc-btn cyc-btn-primary" onClick={saveCard} disabled={state === 'saving'}>
        {state === 'saved' ? <Check size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
        {state === 'saving' ? 'Making your card…' : state === 'saved' ? 'Card saved' : 'Get the card'}
      </button>
      <button type="button" className="cyc-btn" onClick={shareLink}>
        {state === 'copied' ? <Check size={18} aria-hidden="true" /> : canShare ? <Share2 size={18} aria-hidden="true" /> : <Link2 size={18} aria-hidden="true" />}
        {state === 'copied' ? 'Link copied' : 'Share link'}
      </button>
      <Link className="cyc-btn cyc-btn-ghost" to="/map">Live map <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  );
}

function Compare({ a, rankings, onOpen }: { a: CommunityRank; rankings: CommunityRank[]; onOpen: (r: CommunityRank) => void }) {
  const [b, setB] = useState<CommunityRank | undefined>();
  useEffect(() => setB(undefined), [a.key]);
  const rows: [string, (r: CommunityRank) => number | null, (v: number) => string, 'low' | 'high'][] = [
    ['Rank', (r) => r.rank, (v) => `#${v}`, 'high'],
    ['311 reports this year', (r) => r.total, fmt, 'low'],
    ['Safety and disorder', (r) => r.safety, fmt, 'low'],
    ['Property damage and theft', (r) => r.property, fmt, 'low'],
    ['Change last full year', (r) => r.change?.pct ?? null, (v) => `${v > 0 ? '+' : ''}${v}%`, 'low'],
  ];
  // "Quieter" wins each row: fewer reports, a bigger rank number, a bigger drop.
  const winner = (va: number | null, vb: number | null, better: 'low' | 'high') =>
    va === null || vb === null || va === vb ? null : (better === 'low' ? va < vb : va > vb) ? 'a' : 'b';
  const score = b ? rows.reduce((s, [, get, , better]) => { const w = winner(get(a), get(b), better); return w ? { ...s, [w]: s[w] + 1 } : s; }, { a: 0, b: 0 }) : null;

  return (
    <section className="cyc-versus" aria-labelledby="cyc-versus-title">
      <h3 id="cyc-versus-title">Head to head</h3>
      <p className="cyc-muted">Pick a rival. The quieter number wins each round.</p>
      <CommunityPicker rankings={rankings.filter((r) => r.key !== a.key)} onPick={setB} placeholder="Type a rival community" size="sm" />
      {b && score && (
        <div className="cyc-vs">
          <div className="cyc-vs-head">
            <span className={score.a > score.b ? 'is-win' : ''}>{a.name}<b>{score.a}</b></span>
            <i>vs</i>
            <button type="button" className={score.b > score.a ? 'is-win' : ''} onClick={() => onOpen(b)}><b>{score.b}</b>{b.name}</button>
          </div>
          <ul>
            {rows.map(([label, get, show, better]) => {
              const va = get(a);
              const vb = get(b);
              const w = winner(va, vb, better);
              return (
                <li key={label}>
                  <span className={w === 'a' ? 'is-win' : ''}>{va === null ? 'n/a' : show(va)}</span>
                  <small>{label}</small>
                  <span className={w === 'b' ? 'is-win' : ''}>{vb === null ? 'n/a' : show(vb)}</span>
                </li>
              );
            })}
          </ul>
          <p className="cyc-vs-verdict">{score.a === score.b ? 'Dead even.' : `${score.a > score.b ? a.name : b.name} takes it ${Math.max(score.a, score.b)}–${Math.min(score.a, score.b)}.`}</p>
        </div>
      )}
    </section>
  );
}

function Reveal({ r, guess, rankings, onOpen }: { r: CommunityRank; guess: number | null; rankings: CommunityRank[]; onOpen: (r: CommunityRank) => void }) {
  return (
    <section className="cyc-stage cyc-reveal" aria-live="polite" aria-labelledby="cyc-reveal-title">
      <p className="cyc-step">{guess === null ? 'The answer' : 'Step 2 of 2 · The reveal'}</p>
      <h2 id="cyc-reveal-title" className="cyc-verdict">{guess === null ? `${r.name} is #${r.rank}.` : guessVerdict(guess, r.rank)}</h2>
      <Spectrum rankings={rankings} target={r} guess={guess} />
      <div className="cyc-reveal-grid">
        <RankCard r={r} guess={guess} />
        <div className="cyc-reveal-side">
          <ShareBar r={r} rankings={rankings} />
          <Ladder r={r} rankings={rankings} onOpen={onOpen} />
          <Compare a={r} rankings={rankings} onOpen={onOpen} />
        </div>
      </div>
    </section>
  );
}

function Scoreboard({ title, items, value, onOpen, tone }: { title: string; items: CommunityRank[]; value: (r: CommunityRank) => string; onOpen: (r: CommunityRank) => void; tone: string }) {
  if (items.length === 0) return null;
  return (
    <section className={`cyc-board cyc-board-${tone}`}>
      <h3>{title}</h3>
      <ol>
        {items.map((r, i) => (
          <li key={r.key}>
            <button type="button" onClick={() => onOpen(r)}><i>{String(i + 1).padStart(2, '0')}</i><span>{r.name}</span><b>{value(r)}</b></button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function CheckYourCommunityPage() {
  const { stats, yearlyStats, isLoading } = useCrimeStats();
  const rankings = useMemo(() => buildRankings(stats, yearlyStats), [stats, yearlyStats]);
  const [params, setParams] = useSearchParams();
  const selected = findBySlug(rankings, params.get('c'));
  // A shared link skips the guess; you came to see the answer.
  const [guessing, setGuessing] = useState(false);
  const [guess, setGuess] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const t = useMemo(() => teasers(rankings), [rankings]);
  const year = rankings[0]?.year;

  const scrollToStage = () => requestAnimationFrame(() => stageRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }));
  const open = (r: CommunityRank, withGuess = false) => {
    setGuess(null);
    setGuessing(withGuess);
    setParams({ c: r.slug }, { replace: false });
    scrollToStage();
  };

  return (
    <SiteLayout>
      <div className="cyc">
        <section className="cyc-hero" aria-labelledby="cyc-title">
          <div className="cyc-stars" aria-hidden="true" />
          <div className="cw-wrap cyc-hero-inner">
            <p className="cyc-kicker"><span className="cyc-live" aria-hidden="true" />City of Calgary 311 data{year ? ` · ${year} so far` : ''}</p>
            <h1 id="cyc-title">How does your <span>community</span> stack up?</h1>
            <p className="cyc-lead">
              {rankings.length ? `${rankings.length} Calgary communities, ranked.` : 'Every Calgary community, ranked.'} Guess where yours lands before you look.
            </p>
            <CommunityPicker rankings={rankings} onPick={(r) => open(r, true)} placeholder={isLoading && !rankings.length ? 'Loading communities…' : 'Type your community'} autoFocus={!params.get('c')} />
            {rankings.length > 0 && (
              <ul className="cyc-teasers" aria-label="Sealed surprises">
                <Teaser tone="red" label="#1 in Calgary" r={t.top} detail={(r) => `${fmt(r.total)} reports`} onOpen={(r) => open(r)} />
                <Teaser tone="green" label="Biggest drop last year" r={t.biggestDrop} detail={(r) => `${r.change!.pct}%`} onOpen={(r) => open(r)} />
                <Teaser tone="yellow" label="Biggest jump last year" r={t.biggestJump} detail={(r) => `+${r.change!.pct}%`} onOpen={(r) => open(r)} />
              </ul>
            )}
          </div>
          <Skyline rankings={rankings} selectedKey={selected?.key} onPick={(r) => open(r, true)} />
        </section>

        <div className="cw-wrap cyc-body">
          <div ref={stageRef} className="cyc-stage-anchor">
            {selected && (guessing
              ? <Guess key={selected.key} r={selected} rankings={rankings} onDone={(g) => { setGuess(g); setGuessing(false); scrollToStage(); }} />
              : <Reveal key={`${selected.key}-${guess}`} r={selected} guess={guess} rankings={rankings} onOpen={(r) => open(r)} />)}
            {!selected && params.get('c') && rankings.length > 0 && (
              <p className="cyc-muted">We couldn't find that community. Try typing it above.</p>
            )}
          </div>

          {/* The full lists would spoil the teasers and the guess, so they wait for a first reveal. */}
          {selected && !guessing && (
            <div className="cyc-boards">
              <Scoreboard tone="red" title="Most 311 reports" items={rankings.slice(0, 10)} value={(r) => fmt(r.total)} onOpen={(r) => open(r)} />
              <Scoreboard tone="green" title="Biggest drops" items={movers(rankings, 'down')} value={(r) => `${r.change!.pct}%`} onOpen={(r) => open(r)} />
              <Scoreboard tone="yellow" title="Biggest jumps" items={movers(rankings, 'up')} value={(r) => `+${r.change!.pct}%`} onOpen={(r) => open(r)} />
            </div>
          )}

          <section className="cyc-method" aria-labelledby="cyc-method-title">
            <h2 id="cyc-method-title">The fine print</h2>
            <ul>
              <li><b>Source.</b> City of Calgary Open Data, 311 service requests by community, refreshed daily. These are requests residents made, not police crime statistics.</li>
              <li><b>Totals, not per resident.</b> Big, busy communities rank higher partly because more people live, work and pass through them. Downtown, the airport and areas around hospitals and LRT stations get a lot of reports for that reason.</li>
              <li><b>Trend.</b> This compares the last two full years. Communities with fewer than 100 reports a year are left out of trends because small numbers swing wildly.</li>
              <li><b>Not official.</b> CalgaryWatch isn't affiliated with the City of Calgary or Calgary Police. In an emergency, call 911.</li>
            </ul>
          </section>
        </div>
      </div>
    </SiteLayout>
  );
}
