import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarDays, Car, Compass, Map as MapIcon, MapPin, ShieldAlert, Sparkles, Store, Zap, Clock3, Heart, BookOpen, Trophy, ShieldCheck, ExternalLink } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { GlobalSearch, type Suggestion } from './GlobalSearch';
import { SearchAnswers, type BestAnswer } from './SearchAnswers';
import { PageHero } from './PageHero';
import type { SearchIntent } from '../../lib/searchIntent';
import type { DiscoveryEntity } from '../../types/discovery';
import type { SafetyHeadline } from '../../lib/safetyNews';
import { DISCOVERY_SECTIONS, entityPath } from '../../lib/discovery';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import '../../styles/search-page.css';

/** One-tap searches for what people most often come looking for. */
const STARTERS: Array<{ label: string; note: string; to: string; icon: ReactNode; tone: string }> = [
  { label: 'Police and safety tonight', note: 'What neighbours and police posted', to: '/search?q=police+tonight', icon: <ShieldAlert size={22} />, tone: 'navy' },
  { label: 'What happened yesterday', note: 'Every report from yesterday', to: '/search?q=yesterday', icon: <Clock3 size={22} />, tone: 'red' },
  { label: 'Crime reports this week', note: 'The last seven days, citywide', to: '/search?q=crime+this+week', icon: <MapPin size={22} />, tone: 'purple' },
  { label: 'Traffic and road closures', note: 'Collisions and closures today', to: '/search?q=traffic+today', icon: <Car size={22} />, tone: 'blue' },
  { label: 'Power outages', note: 'Where ENMAX says the power’s out', to: '/search?q=power+outage', icon: <Zap size={22} />, tone: 'yellow' },
  { label: 'Things to do this weekend', note: 'Events, day by day', to: '/events/this-weekend', icon: <Sparkles size={22} />, tone: 'green' },
];

const BROWSE: Array<{ to: string; label: string; note: string; icon: ReactNode }> = [
  { to: '/events', label: 'Events', note: 'What’s on, day by day', icon: <CalendarDays size={20} /> },
  { to: '/markets', label: 'Markets', note: 'Farmers’ and makers’', icon: <Store size={20} /> },
  { to: '/date-night', label: 'Date night', note: 'Our picks for two', icon: <Heart size={20} /> },
  { to: '/neighbourhoods', label: 'Neighbourhoods', note: 'Quadrant by quadrant', icon: <Compass size={20} /> },
  { to: '/guides', label: 'Guides', note: 'Self-guided days out', icon: <BookOpen size={20} /> },
  { to: '/local', label: 'Local', note: 'Places worth knowing', icon: <MapPin size={20} /> },
  { to: '/best', label: 'Best of Calgary', note: 'Pho, pizza and trades, cited', icon: <Trophy size={20} /> },
  { to: '/safety', label: 'Safety news', note: 'Calgary crime headlines by topic', icon: <ShieldCheck size={20} /> },
];

const TRY = ['Beltline', '17 Ave SW', 'police yesterday', 'jazz', 'Kensington', 'free this weekend'];

const when = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
const KIND: Record<string, string> = { event: 'Event', market: 'Market', business: 'Local', guide: 'Guide', neighbourhood: 'Neighbourhood' };
const KIND_ICON: Record<string, ReactNode> = {
  event: <CalendarDays size={26} />, market: <Store size={26} />, business: <MapPin size={26} />, guide: <BookOpen size={26} />, neighbourhood: <Compass size={26} />,
};
/** Rows a group shows before "Show all", when every kind is on screen. */
const PER_GROUP = 6;

function detail(e: DiscoveryEntity) {
  const place = e.kind === 'event' || e.kind === 'market' || e.kind === 'business' ? e.neighbourhood || e.venue || e.address
    : e.kind === 'neighbourhood' ? `${e.quadrant} Calgary` : null;
  const date = e.kind === 'event' && e.start ? when.format(new Date(e.start)) : null;
  return { place, date };
}

function imageOf(e: DiscoveryEntity) {
  return e.image ?? ('images' in e ? e.images?.[0] : undefined);
}

/** A run that repeats ("Frozen", eight shows) is one row, at its soonest date, with the rest counted. */
export function collapseRepeats(entities: DiscoveryEntity[]): Array<{ e: DiscoveryEntity; more: number }> {
  const out: Array<{ e: DiscoveryEntity; more: number }> = [];
  const at = new Map<string, number>();
  for (const e of entities) {
    const key = `${e.kind}:${e.title.trim().toLowerCase()}`;
    const i = at.get(key);
    if (i === undefined) { at.set(key, out.length); out.push({ e, more: 0 }); } else out[i].more++;
  }
  return out;
}

/**
 * /search: a branded front door that answers first. Before a search it shows
 * the questions people actually bring here and every section to browse; after
 * one it leads with the ready-made answer, then listings grouped by kind.
 */
export function SearchBoard({ q, intent, now, groups, listingCount, resultCount, answers, partial = false, didYouMean, suggest, nearby, best, bestLists = [], safety }: {
  q: string; intent: SearchIntent; now: number; groups: Record<string, DiscoveryEntity[]>;
  listingCount: number; resultCount: number; answers: number;
  partial?: boolean; didYouMean?: string; suggest?: (q: string) => Suggestion[];
  /** For a community search with no listings of its own: what's on nearby. */
  nearby?: { title: ReactNode; items: DiscoveryEntity[] };
  /** Listed places for a "best pho" search. */
  best?: BestAnswer;
  /** Best of Calgary lists the search asks for ("pho", "junk removal"). */
  bestLists?: Array<{ to: string; label: string; note: string }>;
  /** Safety topic pages and recent headlines for "car theft", "police news Bowness". */
  safety?: { topics: Array<{ to: string; label: string; note: string }>; headlines: SafetyHeadline[] };
}) {
  const [tab, setTab] = useState<string>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Places already ranked in the "best pho" card aren't listed twice.
  const picked = new Set(best?.picks.map(e => e.id));
  const kinds = Object.keys(groups).filter(k => groups[k].some(e => !picked.has(e.id)));
  const collapsed = Object.fromEntries(kinds.map(k => [k, collapseRepeats(groups[k].filter(e => !picked.has(e.id)))]));
  const distinct = kinds.reduce((n, k) => n + collapsed[k].length, 0);
  // The best match gets the spotlight, unless it's only a partial match.
  const top = !partial && !intent.best && kinds.length ? collapsed[kinds[0]][0] : undefined;
  const shown = tab === 'all' ? kinds : kinds.filter(k => k === tab);
  const listings = <><b>{distinct}</b> {partial ? 'close ' : ''}{distinct === 1 ? 'listing' : 'listings'}</>;
  const ready = <><b>{answers}</b> ready-made {answers === 1 ? 'answer' : 'answers'}</>;
  return (
    <div className={`bp sx${q ? ' sx-has-q' : ''}`}>
      <PageHero
        id="sx-title"
        kicker={q ? 'Search results' : 'Search CalgaryWatch'}
        title={q ? <>Results for <span>“{q}”</span></> : <>Ask about <span>Calgary.</span></>}
        lead={q ? undefined : 'A neighbourhood, a street, what happened last night, or something to do this weekend. Answers come from the live map and every listing on the site.'}
        ctas={<div className="sx-box"><GlobalSearch initial={q} suggest={suggest} /></div>}
        facts={<>{TRY.map(t => <li key={t}><Link to={`/search?q=${encodeURIComponent(t)}`}>{t}</Link></li>)}</>}
      />

      <div className="cw-wrap">
        {q ? (
          <>
            <div className="sx-bar">
              <p className="sx-count" role="status">
                {resultCount
                  ? <>{bestLists.length ? <><b>{bestLists.length}</b> Best of Calgary {bestLists.length === 1 ? 'list' : 'lists'}{answers || distinct ? ', ' : null}</> : null}{answers ? ready : null}{answers > 0 && distinct > 0 ? ' and ' : null}{distinct ? listings : null}{partial ? '. Nothing matched every word, so these match most of them.' : null}</>
                  : best && intent.best ? <>Nothing on CalgaryWatch for <b>“{intent.best.thing}”</b> yet. Here’s where to look.</>
                  : <>Nothing matched <b>“{q}”</b> yet. Try a neighbourhood, a street, or one of these.</>}
              </p>
              {kinds.length > 1 ? (
                <div className="sx-tabs" role="group" aria-label="Show results for">
                  <button type="button" aria-pressed={tab === 'all'} onClick={() => setTab('all')}>All <span>{distinct}</span></button>
                  {kinds.map(k => {
                    const section = DISCOVERY_SECTIONS.find(x => x.kind === k);
                    return <button type="button" key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{section?.label ?? KIND[k]} <span>{collapsed[k].length}</span></button>;
                  })}
                </div>
              ) : null}
            </div>
            {didYouMean ? <p className="sx-dym">Did you mean <Link to={`/search?q=${encodeURIComponent(didYouMean)}`}>{didYouMean}</Link>?</p> : null}
            {tab === 'all' ? <SearchAnswers intent={intent} now={now} best={best} /> : null}
            {bestLists.length && tab === 'all' ? (
              <section className="bp-section sx-group" aria-labelledby="sx-best">
                <div className="bp-head"><h2 id="sx-best">Best of <span>Calgary</span></h2><Link className="bp-link" to="/best">All lists <ArrowRight size={15} aria-hidden="true" /></Link></div>
                <ul className="sx-results">
                  {bestLists.map(b => (
                    <li key={b.to}>
                      <Link to={b.to} className="sx-result">
                        <span className="sx-thumb sx-thumb-best" aria-hidden="true"><Trophy size={26} /></span>
                        <span className="sx-result-copy"><span className="sx-kind sx-kind-best">List</span><strong>{b.label}</strong><small>{b.note}</small></span>
                        <ArrowUpRight size={20} aria-hidden="true" className="sx-arrow" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {safety && (safety.topics.length || safety.headlines.length) && tab === 'all' ? (
              <section className="bp-section sx-group" aria-labelledby="sx-safety">
                <div className="bp-head"><h2 id="sx-safety">Calgary <span>safety news</span></h2><Link className="bp-link" to="/safety">All topics <ArrowRight size={15} aria-hidden="true" /></Link></div>
                {safety.topics.length ? (
                  <ul className="sx-results">
                    {safety.topics.map(t => (
                      <li key={t.to}>
                        <Link to={t.to} className="sx-result">
                          <span className="sx-thumb sx-thumb-best" aria-hidden="true"><ShieldCheck size={26} /></span>
                          <span className="sx-result-copy"><span className="sx-kind sx-kind-safety">Topic</span><strong>{t.label}</strong><small>{t.note}</small></span>
                          <ArrowUpRight size={20} aria-hidden="true" className="sx-arrow" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {safety.headlines.length ? (
                  <ul className="sx-news">
                    {safety.headlines.map(h => (
                      <li key={h.url}>
                        <a href={h.url} target="_blank" rel="noopener noreferrer">
                          <strong>{h.title}</strong>
                          <small>{h.source} · {when.format(new Date(h.publishedAt))}{h.community ? ` · ${h.community}` : ''}</small>
                          <ExternalLink size={16} aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
            {top && tab === 'all' ? <TopHit e={top.e} more={top.more} /> : null}
            {shown.map(kind => {
              const section = DISCOVERY_SECTIONS.find(s => s.kind === kind);
              const rows = collapsed[kind].filter(r => !(tab === 'all' && r === top));
              if (!rows.length) return null;
              const limit = tab === 'all' && !open[kind] ? PER_GROUP : rows.length;
              return (
                <section className="bp-section sx-group" key={kind} aria-labelledby={`sx-${kind}`}>
                  <div className="bp-head">
                    <h2 id={`sx-${kind}`}>{section?.label} <small className="sx-n">{collapsed[kind].length}</small></h2>
                    {section ? <Link className="bp-link" to={section.path}>All {section.label.toLowerCase()} <ArrowRight size={15} aria-hidden="true" /></Link> : null}
                  </div>
                  <Rows rows={rows.slice(0, limit)} />
                  {rows.length > limit ? (
                    <button type="button" className="sx-more" onClick={() => setOpen(o => ({ ...o, [kind]: true }))}>
                      Show {rows.length - limit} more {(section?.label ?? '').toLowerCase()}
                    </button>
                  ) : null}
                </section>
              );
            })}
            {nearby?.items.length ? (
              <section className="bp-section sx-group" aria-labelledby="sx-nearby">
                <div className="bp-head"><h2 id="sx-nearby">{nearby.title}</h2><p>Nothing listed in this community yet, so here’s what’s closest.</p></div>
                <Rows rows={collapseRepeats(nearby.items)} />
              </section>
            ) : null}
            {!resultCount && !best ? <Starters title="Try one of these" /> : null}
          </>
        ) : (
          <>
            <Starters title={<>What people <span>ask most.</span></>} />
            <section className="bp-section" aria-labelledby="sx-browse">
              <div className="bp-head"><h2 id="sx-browse">Or just <span>browse.</span></h2><p>Every section, checked against its source.</p></div>
              <ul className="sx-browse">
                {BROWSE.map(b => (
                  <li key={b.to}><Link to={b.to}><span className="sx-browse-icon" aria-hidden="true">{b.icon}</span><strong>{b.label}</strong><small>{b.note}</small><ArrowUpRight size={18} aria-hidden="true" className="sx-arrow" /></Link></li>
                ))}
              </ul>
            </section>
          </>
        )}

        <section className="bp-banner sx-live">
          <div>
            <h2>Happening right now?</h2>
            <p>Weather, traffic, outages and what neighbours are reporting live on one map, each pin with its source.</p>
          </div>
          <div className="bp-ctas"><Link className="bp-btn bp-btn-navy" to="/map"><MapIcon size={18} aria-hidden="true" /> Open the live map</Link></div>
        </section>
      </div>
    </div>
  );
}

/** The picture, a date tile for an event without one, or the kind's icon. */
function Thumb({ e, big = false }: { e: DiscoveryEntity; big?: boolean }) {
  const [broken, setBroken] = useState(false);
  const img = broken ? undefined : imageOf(e);
  if (img) return <span className={`sx-thumb${big ? ' is-big' : ''}`}><img src={img.src} alt="" loading="lazy" onError={() => setBroken(true)} /></span>;
  if (e.kind === 'event' && e.start) {
    const parts = Object.fromEntries(when.formatToParts(new Date(e.start)).map(p => [p.type, p.value]));
    return <span className={`sx-thumb sx-thumb-date${big ? ' is-big' : ''}`} aria-hidden="true"><small>{parts.weekday}</small><b>{parts.day}</b><small>{parts.month}</small></span>;
  }
  return <span className={`sx-thumb sx-thumb-${e.kind}${big ? ' is-big' : ''}`} aria-hidden="true">{KIND_ICON[e.kind]}</span>;
}

function TopHit({ e, more }: { e: DiscoveryEntity; more: number }) {
  const { place, date } = detail(e);
  return (
    <section className="sx-top" aria-label="Best match">
      <Link to={entityPath(e)} className="sx-top-card">
        <Thumb e={e} big />
        <span className="sx-top-copy">
          <span className="sx-top-eyebrow"><span className={`sx-kind sx-kind-${e.kind}`}>{KIND[e.kind]}</span> Best match</span>
          <strong>{e.title}</strong>
          {date || place ? <small>{[date, place].filter(Boolean).join(' · ')}{more ? ` · +${more} more ${more === 1 ? 'date' : 'dates'}` : ''}</small> : null}
          {e.summary ? <span className="sx-top-summary">{e.summary}</span> : null}
          <span className="sx-top-go">Open <ArrowRight size={18} aria-hidden="true" /></span>
        </span>
      </Link>
    </section>
  );
}

function Rows({ rows }: { rows: Array<{ e: DiscoveryEntity; more: number }> }) {
  return (
    <ul className="sx-results">
      {rows.map(({ e, more }) => {
        const { place, date } = detail(e);
        return (
          <li key={e.id}>
            <Link to={entityPath(e)} className="sx-result">
              <Thumb e={e} />
              <span className="sx-result-copy">
                <span className={`sx-kind sx-kind-${e.kind}`}>{KIND[e.kind]}</span>
                <strong>{e.title}</strong>
                {date || place ? <small>{[date, place].filter(Boolean).join(' · ')}</small> : null}
                {more ? <small className="sx-more-dates">+{more} more {more === 1 ? 'date' : 'dates'}</small> : null}
              </span>
              <ArrowUpRight size={20} aria-hidden="true" className="sx-arrow" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Starters({ title }: { title: ReactNode }) {
  return (
    <section className="bp-section" aria-labelledby="sx-starters">
      <div className="bp-head"><h2 id="sx-starters">{title}</h2><p>One tap, real answers. When there’s nothing reported, it says so.</p></div>
      <ul className="sx-starters">
        {STARTERS.map(s => (
          <li key={s.to}>
            <Link to={s.to} className={`sx-starter bp-tone-${s.tone}`}>
              <span className="sx-starter-icon" aria-hidden="true">{s.icon}</span>
              <strong>{s.label}</strong>
              <small>{s.note}</small>
              <ArrowRight size={20} aria-hidden="true" className="sx-arrow" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
