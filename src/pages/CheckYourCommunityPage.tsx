import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, Copy, MapPin, Share2 } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useCrimeStats } from '../hooks/useCrimeStats';
import {
  buildRankings,
  findBySlug,
  guessVerdict,
  movers,
  neighbours,
  searchCommunities,
  shareText,
  teasers,
  type CommunityRank,
} from '../lib/communityRank';
import '../styles/check-community.css';

const PATH = '/check-your-community';
const fmt = (n: number) => n.toLocaleString('en-CA');

function pageLink(r: CommunityRank): string {
  return `${window.location.origin}${PATH}?c=${r.slug}`;
}

function CommunityPicker({ rankings, onPick, placeholder, autoFocus }: {
  rankings: CommunityRank[];
  onPick: (r: CommunityRank) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const matches = useMemo(() => searchCommunities(rankings, query), [rankings, query]);
  const pick = (r: CommunityRank) => { setQuery(''); onPick(r); };

  return (
    <div className="cyc-picker">
      <input
        className="cyc-input"
        type="search"
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-controls="cyc-matches"
        disabled={rankings.length === 0}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]); }
        }}
      />
      {matches.length > 0 && (
        <ul className="cyc-matches" id="cyc-matches" role="listbox">
          {matches.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'is-active' : ''} onClick={() => pick(r)}>
                <MapPin size={15} aria-hidden="true" /> {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A name hidden behind a tap. The not-knowing is the point. */
function Teaser({ label, detail, r, onOpen }: { label: string; detail: (r: CommunityRank) => string; r?: CommunityRank; onOpen: (r: CommunityRank) => void }) {
  const [shown, setShown] = useState(false);
  if (!r) return null;
  return (
    <li className="cyc-teaser">
      <span className="cyc-teaser-label">{label}</span>
      {shown ? (
        <button type="button" className="cyc-teaser-name" onClick={() => onOpen(r)}>
          {r.name} <small>{detail(r)}</small>
        </button>
      ) : (
        <button type="button" className="cyc-teaser-hidden" onClick={() => setShown(true)} aria-label={`Reveal ${label.toLowerCase()}`}>
          Tap to reveal
        </button>
      )}
    </li>
  );
}

function ChangeLine({ r }: { r: CommunityRank }) {
  if (!r.change) return <span className="cyc-muted">Not enough history to compare years.</span>;
  const { pct, fromYear, toYear } = r.change;
  if (pct === 0) return <span>No change from {fromYear} to {toYear}.</span>;
  const Icon = pct < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span className={pct < 0 ? 'cyc-down' : 'cyc-up'}>
      <Icon size={16} aria-hidden="true" /> {pct < 0 ? 'Down' : 'Up'} {Math.abs(pct)}% from {fromYear} to {toYear}
    </span>
  );
}

function Breakdown({ r }: { r: CommunityRank }) {
  const parts = [
    { label: 'Safety and disorder', value: r.safety, tone: 'red' },
    { label: 'Property damage and theft', value: r.property, tone: 'yellow' },
    { label: 'Everything else', value: r.other, tone: 'blue' },
  ];
  return (
    <div className="cyc-breakdown">
      <div className="cyc-bar" role="img" aria-label={parts.map((p) => `${p.label}: ${fmt(p.value)}`).join(', ')}>
        {parts.map((p) => p.value > 0 && <span key={p.label} className={`cyc-bar-${p.tone}`} style={{ flexGrow: p.value }} />)}
      </div>
      <ul>
        {parts.map((p) => (
          <li key={p.label}><i className={`cyc-dot cyc-bar-${p.tone}`} aria-hidden="true" />{p.label}<b>{fmt(p.value)}</b></li>
        ))}
      </ul>
    </div>
  );
}

function ShareButton({ r }: { r: CommunityRank }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    const text = shareText(r);
    const url = pageLink(r);
    if (canShare) {
      try { await navigator.share({ title: `${r.name}: #${r.rank} of ${r.count}`, text, url }); return; } catch { /* dismissed */ }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };
  return (
    <button type="button" className="cyc-btn cyc-btn-primary" onClick={share}>
      {copied ? <Check size={17} aria-hidden="true" /> : canShare ? <Share2 size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
      {copied ? 'Copied' : 'Share your rank'}
    </button>
  );
}

function Compare({ a, rankings, onOpen }: { a: CommunityRank; rankings: CommunityRank[]; onOpen: (r: CommunityRank) => void }) {
  const [b, setB] = useState<CommunityRank | undefined>();
  useEffect(() => setB(undefined), [a.key]);
  const rows: [string, (r: CommunityRank) => string][] = [
    ['Rank', (r) => `#${r.rank}`],
    ['311 reports this year', (r) => fmt(r.total)],
    ['Safety and disorder', (r) => fmt(r.safety)],
    ['Property damage and theft', (r) => fmt(r.property)],
    ['Last year vs year before', (r) => (r.change ? `${r.change.pct > 0 ? '+' : ''}${r.change.pct}%` : 'n/a')],
  ];
  return (
    <section className="cyc-compare" aria-labelledby="cyc-compare-title">
      <h3 id="cyc-compare-title">Settle it with a neighbour</h3>
      <CommunityPicker rankings={rankings.filter((r) => r.key !== a.key)} onPick={setB} placeholder="Compare with another community" />
      {b && (
        <table className="cyc-table">
          <thead><tr><th scope="col"><span className="sr-only">Measure</span></th><th scope="col">{a.name}</th><th scope="col"><button type="button" onClick={() => onOpen(b)}>{b.name}</button></th></tr></thead>
          <tbody>
            {rows.map(([label, get]) => <tr key={label}><th scope="row">{label}</th><td>{get(a)}</td><td>{get(b)}</td></tr>)}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Reveal({ r, guess, rankings, onOpen }: { r: CommunityRank; guess: number | null; rankings: CommunityRank[]; onOpen: (r: CommunityRank) => void }) {
  const { above, below } = neighbours(rankings, r.key);
  return (
    <article className={`cyc-card cyc-band-${r.band.toLowerCase()}`} aria-live="polite">
      <p className="cyc-eyebrow">{r.name} · 311 reports in {r.year} so far</p>
      <p className="cyc-rank"><span>#{r.rank}</span> of {r.count}</p>
      <p className="cyc-band">{r.band}{r.rank === 1 ? ': the most reports in Calgary' : ''}</p>
      {guess !== null && <p className="cyc-verdict">You guessed #{guess}. {guessVerdict(guess, r.rank)}</p>}
      <dl className="cyc-stats">
        <div><dt>Reports this year</dt><dd>{fmt(r.total)}</dd></div>
        <div><dt>Trend</dt><dd><ChangeLine r={r} /></dd></div>
      </dl>
      <Breakdown r={r} />
      {(above || below) && (
        <p className="cyc-rivals">
          {above && <>Just behind <button type="button" onClick={() => onOpen(above)}>{above.name} (#{above.rank})</button></>}
          {above && below && '. '}
          {below && <>Just ahead of <button type="button" onClick={() => onOpen(below)}>{below.name} (#{below.rank})</button></>}
          .
        </p>
      )}
      <div className="cyc-actions">
        <ShareButton r={r} />
        <Link className="cyc-btn" to="/map">See it on the live map <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
      <Compare a={r} rankings={rankings} onOpen={onOpen} />
    </article>
  );
}

function Guess({ r, count, onDone }: { r: CommunityRank; count: number; onDone: (guess: number | null) => void }) {
  const [value, setValue] = useState(Math.round(count / 2));
  return (
    <article className="cyc-card cyc-guess">
      <p className="cyc-eyebrow">Before you look</p>
      <h2>Where do you think {r.name} ranks?</h2>
      <p className="cyc-muted">#1 has the most 311 reports in Calgary. #{count} has the fewest.</p>
      <p className="cyc-guess-value" aria-hidden="true">#{value}</p>
      <input
        className="cyc-range"
        type="range"
        min={1}
        max={count}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label={`Your guess for ${r.name}'s rank, 1 to ${count}`}
        aria-valuetext={`#${value}`}
      />
      <div className="cyc-range-ends" aria-hidden="true"><span>Most reports</span><span>Fewest</span></div>
      <div className="cyc-actions">
        <button type="button" className="cyc-btn cyc-btn-primary" onClick={() => onDone(value)}>Lock in #{value}</button>
        <button type="button" className="cyc-btn" onClick={() => onDone(null)}>Just show me</button>
      </div>
    </article>
  );
}

function Leaderboard({ title, items, value, onOpen }: { title: string; items: CommunityRank[]; value: (r: CommunityRank) => string; onOpen: (r: CommunityRank) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="cyc-board">
      <h3>{title}</h3>
      <ol>
        {items.map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => onOpen(r)}><span>{r.name}</span><b>{value(r)}</b></button>
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
  const resultRef = useRef<HTMLDivElement>(null);
  const t = useMemo(() => teasers(rankings), [rankings]);
  const year = rankings[0]?.year;

  const open = (r: CommunityRank, withGuess = false) => {
    setGuess(null);
    setGuessing(withGuess);
    setParams({ c: r.slug }, { replace: false });
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <SiteLayout>
      <div className="cyc">
        <section className="cyc-hero" aria-labelledby="cyc-title">
          <div className="cw-wrap">
            <p className="cyc-kicker">City of Calgary 311 data{year ? `, ${year} so far` : ''}</p>
            <h1 id="cyc-title">Where does your community <span>rank</span>?</h1>
            <p className="cyc-lead">
              Type your community and guess where it lands out of {rankings.length || 'every'} Calgary communities. Then see how close you were.
            </p>
            <CommunityPicker rankings={rankings} onPick={(r) => open(r, true)} placeholder={isLoading && !rankings.length ? 'Loading communities…' : 'Type your community'} autoFocus={!params.get('c')} />
            {rankings.length > 0 && (
              <ul className="cyc-teasers" aria-label="Surprises">
                <Teaser label="#1 in Calgary" r={t.top} detail={(r) => `${fmt(r.total)} reports`} onOpen={(r) => open(r)} />
                <Teaser label="Biggest drop last year" r={t.biggestDrop} detail={(r) => `${r.change!.pct}%`} onOpen={(r) => open(r)} />
                <Teaser label="Biggest jump last year" r={t.biggestJump} detail={(r) => `+${r.change!.pct}%`} onOpen={(r) => open(r)} />
              </ul>
            )}
          </div>
        </section>

        <div className="cw-wrap cyc-body">
          <div ref={resultRef} className="cyc-result">
            {selected && (guessing
              ? <Guess r={selected} count={selected.count} onDone={(g) => { setGuess(g); setGuessing(false); }} />
              : <Reveal r={selected} guess={guess} rankings={rankings} onOpen={(r) => open(r)} />)}
            {!selected && params.get('c') && rankings.length > 0 && (
              <p className="cyc-muted">We couldn't find that community. Try typing it above.</p>
            )}
          </div>

          {/* The full lists would spoil the teasers and the guess, so they wait for a first reveal. */}
          {selected && !guessing && (
            <div className="cyc-boards">
              <Leaderboard title="Most 311 reports" items={rankings.slice(0, 10)} value={(r) => fmt(r.total)} onOpen={(r) => open(r)} />
              <Leaderboard title="Biggest drops last year" items={movers(rankings, 'down')} value={(r) => `${r.change!.pct}%`} onOpen={(r) => open(r)} />
              <Leaderboard title="Biggest jumps last year" items={movers(rankings, 'up')} value={(r) => `+${r.change!.pct}%`} onOpen={(r) => open(r)} />
            </div>
          )}

          <section className="cyc-method" aria-labelledby="cyc-method-title">
            <h2 id="cyc-method-title">How this works</h2>
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
