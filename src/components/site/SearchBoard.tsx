import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarDays, Car, Compass, Map as MapIcon, MapPin, ShieldAlert, Sparkles, Store, Search, TrendingUp, Zap, Clock3, Heart, BookOpen, Trophy, ShieldCheck, BadgeCheck, ExternalLink, ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { SearchNeighbourhoods } from './SearchNeighbourhoods';
import { GlobalSearch, type Suggestion } from './GlobalSearch';
import { SearchAnswers, type BestAnswer } from './SearchAnswers';
import type { SearchIntent } from '../../lib/searchIntent';
import type { DiscoveryEntity } from '../../types/discovery';
import type { SafetyHeadline } from '../../lib/safetyNews';
import { DISCOVERY_SECTIONS, entityPath } from '../../lib/discovery';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { tryChips } from '../../lib/searchTrends';
import { PickBoard } from '../picks/PickBoard';
import type { Shelf } from '../../lib/cwPicks';
import { bestPath } from '../../lib/bestOf';
import '../../styles/brand-page.css';
import '../../styles/search-page.css';

/** One-tap searches for what people most often come looking for. */
const STARTERS: Array<{ label: string; note: string; to: string; icon: ReactNode; tone: string; scene: string; art?: string }> = [
  { label: 'Police and safety tonight', note: 'What neighbours and police posted', to: '/search?q=police+tonight', icon: <ShieldAlert size={22} />, tone: 'navy', scene: 'safety', art: 'search-explore-live.webp' },
  { label: 'What happened yesterday', note: 'See reports from the previous day', to: '/search?q=yesterday', icon: <Clock3 size={22} />, tone: 'red', scene: 'yesterday', art: 'search-quick-yesterday.webp' },
  { label: 'Crime reports this week', note: 'The last seven days, citywide', to: '/search?q=crime+this+week', icon: <MapPin size={22} />, tone: 'purple', scene: 'weekly', art: 'search-quick-weekly.webp' },
  { label: 'Traffic and road closures', note: 'Collisions and closures today', to: '/search?q=traffic+today', icon: <Car size={22} />, tone: 'blue', scene: 'traffic', art: 'search-quick-traffic.webp' },
  { label: 'Power outages', note: 'Where ENMAX says the power’s out', to: '/search?q=power+outage', icon: <Zap size={22} />, tone: 'yellow', scene: 'outage' },
  { label: 'Things to do this weekend', note: 'Events, day by day', to: '/events/this-weekend', icon: <Sparkles size={22} />, tone: 'green', scene: 'weekend', art: 'search-explore-weekend.webp' },
];

const BROWSE: Array<{ to: string; label: string; note: string; icon: ReactNode }> = [
  { to: '/events', label: 'Events', note: 'What’s on, day by day', icon: <CalendarDays size={20} /> },
  { to: '/markets', label: 'Markets', note: 'Farmers’ and makers’', icon: <Store size={20} /> },
  { to: '/date-night', label: 'Date night', note: 'Our picks for two', icon: <Heart size={20} /> },
  { to: '/neighbourhoods', label: 'Neighbourhoods', note: 'Quadrant by quadrant', icon: <Compass size={20} /> },
  { to: '/guides', label: 'Guides', note: 'Self-guided days out', icon: <BookOpen size={20} /> },
  { to: '/local', label: 'Local', note: 'Places worth knowing', icon: <MapPin size={20} /> },
  { to: '/picks', label: 'Who to call', note: 'Plumbers to snow removal, checked', icon: <BadgeCheck size={20} /> },
  { to: '/best', label: 'Best of Calgary', note: 'Pho, pizza and trades, cited', icon: <Trophy size={20} /> },
  { to: '/safety', label: 'Safety news', note: 'Calgary crime headlines by topic', icon: <ShieldCheck size={20} /> },
];

const TRY = ['Beltline', '17 Ave SW', 'police yesterday', 'plumber', 'Kensington', 'free this weekend'];

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
export function SearchBoard({ q, intent, now, groups, resultCount, answers, partial = false, didYouMean, suggest, popular = [], nearby, best, bestLists = [], safety, pickShelf }: {
  q: string; intent: SearchIntent; now: number; groups: Record<string, DiscoveryEntity[]>;
  resultCount: number; answers: number;
  partial?: boolean; didYouMean?: string; suggest?: (q: string) => Suggestion[];
  /** What Calgary searched for most lately (searchTrends.ts), most first. */
  popular?: Suggestion[];
  /** For a community search with no listings of its own: what's on nearby. */
  nearby?: { title: ReactNode; note?: string; items: DiscoveryEntity[] };
  /** Listed places for a "best pho" search. */
  best?: BestAnswer;
  /** Service lists the search asks for ("plumber"): shown as the Pick and the A–Z list. */
  /** "plumber", "snow removal": the service's Pick desk, compact. */
  pickShelf?: Shelf | null;
  /** Best of Calgary lists the search asks for ("pho", "junk removal"). */
  bestLists?: Array<{ to: string; label: string; note: string }>;
  /** Safety topic pages and recent headlines for "car theft", "police news Bowness". */
  safety?: { topics: Array<{ to: string; label: string; note: string }>; headlines: SafetyHeadline[] };
}) {
  const [tab, setTab] = useState<string>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Places already ranked in the "best pho" card aren't listed twice.
  const picked = new Set(best?.picks.map(e => e.id));
  // A Best list already shown as the service's Pick desk isn't listed (or counted) twice.
  const shownBest = bestLists.filter(b => !pickShelf?.bestSlug || b.to !== bestPath({ slug: pickShelf.bestSlug }));
  const deskCount = pickShelf?.contenders.length ?? 0;
  const kinds = Object.keys(groups).filter(k => groups[k].some(e => !picked.has(e.id)));
  const collapsed = Object.fromEntries(kinds.map(k => [k, collapseRepeats(groups[k].filter(e => !picked.has(e.id)))]));
  const distinct = kinds.reduce((n, k) => n + collapsed[k].length, 0);
  // The best match gets the spotlight, unless it's only a partial match.
  const top = !partial && !intent.best && kinds.length ? collapsed[kinds[0]][0] : undefined;
  const shown = tab === 'all' ? kinds : kinds.filter(k => k === tab);
  const listings = <><b>{distinct}</b> {partial ? 'close ' : ''}{distinct === 1 ? 'listing' : 'listings'}</>;
  const answerTotal = answers + (safety?.topics.length ?? 0) + (nearby?.items.length ? 1 : 0);
  const ready = <><b>{answerTotal}</b> {answerTotal === 1 ? 'answer' : 'answers'}</>;
  return (
    <div className={`bp sx${q ? ' sx-has-q' : ''}`}>
      <section className="sx-hero" aria-labelledby="sx-title">
        {!q && <div className="sx-city" aria-hidden="true">
          <picture>
            <source media="(max-width: 640px)" srcSet="/images/hero/search-calgary-pocket.webp" />
            <img
            src="/images/hero/search-calgary-1320.webp"
            srcSet="/images/hero/search-calgary-860.webp 860w, /images/hero/search-calgary-1320.webp 1320w"
            sizes="(max-width: 760px) 100vw, 62vw"
            width={1320}
            height={742}
            alt=""
            fetchPriority="high"
            />
          </picture>
          <div className="sx-pocket-route"><i /><i /><i /></div>
          <div className="sx-city-lens"><span /><span /><span /><span /></div>
          <span className="sx-city-point sx-city-point-tower" />
          <span className="sx-city-point sx-city-point-river" />
        </div>}
        <div className="cw-wrap sx-hero-inner">
          <div className="sx-hero-copy">
            <p className="sx-kicker"><Search size={16} aria-hidden="true" /> Search CalgaryWatch</p>
            <h1 id="sx-title">{q ? <>Results for <em>“{q}”</em></> : <>Find it <em>in Calgary.</em></>}</h1>
            {!q && <p className="sx-lead">Look up a street, check what happened nearby, or find something to do this weekend.</p>}
            <div className="sx-search-panel">
            <div className="sx-box"><GlobalSearch initial={q} suggest={suggest} popular={popular} showSubmitText placeholder="Street, place, or event" /></div>
            {!q && <div className="sx-try">
              <span>Try</span>
              <ul aria-label="Example searches">{tryChips(popular, TRY).slice(0, 4).map(t => <li key={t.to}><Link to={t.to}>{t.label}<CornerDownLeft size={12} aria-hidden="true" /></Link></li>)}</ul>
            </div>}
            </div>
          </div>
        </div>
      </section>

      <div className="cw-wrap sx-body">
        {q ? (
          <>
            <div className="sx-bar">
              <p className="sx-count" role="status">
                {resultCount
                  ? <>{deskCount ? <><b>{deskCount}</b> local {pickShelf!.service.label.toLowerCase()}{shownBest.length || answerTotal || distinct ? ', ' : null}</> : null}{shownBest.length ? <><b>{shownBest.length}</b> Best of Calgary {shownBest.length === 1 ? 'list' : 'lists'}{answerTotal || distinct ? ', ' : null}</> : null}{answerTotal ? ready : null}{answerTotal > 0 && distinct > 0 ? ' and ' : null}{distinct ? listings : null}{partial ? '. Nothing matched every word, so these match most of them.' : null}</>
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
            <div key={tab} className="sx-results-enter">
            {tab === 'all' ? <SearchAnswers intent={intent} now={now} best={best} /> : null}
            {pickShelf && tab === 'all' ? (
              <section className="bp-section sx-group" aria-labelledby="sx-pick">
                <div className="bp-head"><h2 id="sx-pick">{pickShelf.service.label} <span>in Calgary</span></h2><Link className="bp-link" to="/picks">How Picks work <ArrowRight size={15} aria-hidden="true" /></Link></div>
                <PickBoard shelf={pickShelf} via="search" compact />
              </section>
            ) : null}
            {shownBest.length && tab === 'all' ? (
              <section className="bp-section sx-group" aria-labelledby="sx-best">
                <div className="bp-head"><h2 id="sx-best">Best of <span>Calgary</span></h2><Link className="bp-link" to="/best">All lists <ArrowRight size={15} aria-hidden="true" /></Link></div>
                <ul className="sx-results">
                  {shownBest.map(b => (
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
                <div className="bp-head"><h2 id="sx-nearby">{nearby.title}</h2><p>{nearby.note ?? 'Nothing listed in this community yet, so here’s what’s closest.'}</p></div>
                <Rows rows={collapseRepeats(nearby.items)} />
              </section>
            ) : null}
            {!resultCount && !best ? <Starters title="Try one of these" /> : null}
            </div>
          </>
        ) : (
          <>
            <ExploreSearch />
            <Starters title="Quick answers" />
            <SearchNeighbourhoods />
            {popular.length ? <Popular items={popular} title="Popular searches" /> : null}
            <section className="bp-section" aria-labelledby="sx-browse">
              <div className="bp-head"><h2 id="sx-browse">Browse Calgary</h2></div>
              <ul className="sx-browse">
                {BROWSE.map(b => (
                  <li key={b.to}><Link to={b.to}><span className="sx-browse-icon" aria-hidden="true">{b.icon}</span><strong>{b.label}</strong><small>{b.note}</small><ArrowUpRight size={18} aria-hidden="true" className="sx-arrow" /></Link></li>
                ))}
              </ul>
            </section>
          </>
        )}

        <section className="sx-live">
          <div>
            <h2>See what’s happening now</h2>
            <p>Weather, traffic, outages and what neighbours are reporting live on one map, each pin with its source.</p>
          </div>
          <div className="bp-ctas"><Link className="sx-live-link" to="/map"><MapIcon size={18} aria-hidden="true" /> Open the live map</Link></div>
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

/** Popular right now: where recent searches landed, named by the site. */
function Popular({ items, title }: { items: Suggestion[]; title: ReactNode }) {
  return (
    <section className="bp-section" aria-labelledby="sx-popular">
      <div className="bp-head"><h2 id="sx-popular">{title}</h2></div>
      <ul className="sx-browse sx-popular">
        {items.map(p => (
          <li key={p.to}><Link to={p.to}><span className="sx-browse-icon" aria-hidden="true"><TrendingUp size={19} /></span><strong>{p.label}</strong><small>{p.note}</small><ArrowUpRight size={18} aria-hidden="true" className="sx-arrow" /></Link></li>
        ))}
      </ul>
    </section>
  );
}

const EXPLORE = [
  { to: '/check-your-community', label: 'Check your area', note: 'Find reports by neighbourhood', image: 'area', icon: MapPin },
  { to: '/events/this-weekend', label: 'Make weekend plans', note: 'See what’s on', image: 'weekend', icon: CalendarDays },
  { to: '/map', label: 'Open the live map', note: 'Traffic, outages and alerts', image: 'live', icon: MapIcon },
] as const;

function ExploreSearch() {
  const reduceMotion = useReducedMotion();
  return (
    <section className="sx-explore bp-section" aria-labelledby="sx-explore-title">
      <div className="bp-head"><h2 id="sx-explore-title">Where to?</h2></div>
      <ul className="sx-explore-grid">
        {EXPLORE.map(({ to, label, note, image, icon: Icon }, index) => (
          <motion.li
            key={to}
            initial={false}
            whileInView={reduceMotion ? undefined : { y: [9, 0] }}
            viewport={{ once: true, amount: .25 }}
            transition={{ duration: .4, delay: index * .065, ease: [.22, 1, .36, 1] }}
          >
            <Link to={to} className="sx-explore-link" data-art={image}>
              <span className="sx-explore-art" aria-hidden="true">
                <img src={"/images/hero/search-explore-" + image + ".webp"} alt="" loading="lazy" decoding="async" width={640} height={360} />
              </span>
              <span className="sx-explore-icon" aria-hidden="true"><Icon size={19} /></span>
              <span className="sx-explore-copy"><strong>{label}</strong><small>{note}</small></span>
              <span className="sx-explore-arrow" aria-hidden="true"><ArrowUpRight size={20} /></span>
            </Link>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

function Starters({ title }: { title: ReactNode }) {
  const rail = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState({ start: true, end: false, progress: 0, active: 0 });
  const move = (direction: number) => {
    const list = rail.current;
    if (!list) return;
    const behaviour = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    const card = list.firstElementChild?.getBoundingClientRect().width ?? list.clientWidth;
    list.scrollBy({ left: direction * (card + parseFloat(getComputedStyle(list).columnGap)), behavior: behaviour });
  };
  return (
    <section className="bp-section sx-quick" aria-labelledby="sx-starters">
      <div className="bp-head">
        <h2 id="sx-starters">{title}</h2>
        <div className="sx-rail-controls">
          <button type="button" onClick={() => move(-1)} disabled={position.start} aria-label="Previous quick answer"><ChevronLeft size={19} /></button>
          <button type="button" onClick={() => move(1)} disabled={position.end} aria-label="Next quick answer"><ChevronRight size={19} /></button>
        </div>
      </div>
      <ul className="sx-starters" ref={rail} onScroll={event => {
        const { scrollLeft, clientWidth, scrollWidth } = event.currentTarget;
        const start = scrollLeft <= 1, end = scrollLeft + clientWidth >= scrollWidth - 1;
        const list = event.currentTarget;
        const stride = (list.firstElementChild?.getBoundingClientRect().width ?? clientWidth) + parseFloat(getComputedStyle(list).columnGap);
        const active = end ? STARTERS.length - 1 : Math.max(0, Math.min(STARTERS.length - 1, Math.round(scrollLeft / stride)));
        setPosition({ start, end, active, progress: Math.max(0, Math.min(1, scrollLeft / Math.max(1, scrollWidth - clientWidth))) });
      }}>
        {STARTERS.map((s, index) => (
          <li key={s.to}>
            <Link to={s.to} className={"sx-starter bp-tone-" + s.tone} data-scene={s.scene} data-active={position.active === index || undefined}>
              <span className="sx-quick-scene" aria-hidden="true">
                {s.art ? <img src={"/images/hero/" + s.art} alt="" loading="lazy" decoding="async" width={560} height={300} /> : <Zap className="sx-grid-bolt" strokeWidth={1.25} />}
                <span className="sx-scene-motion"><i /><i /><i /></span>
              </span>
              <span className="sx-starter-icon" aria-hidden="true">{s.icon}</span>
              <strong>{s.label}</strong>
              <small>{s.note}</small>
              <ArrowRight size={20} aria-hidden="true" className="sx-arrow" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="sx-rail-track" aria-hidden="true"><span style={{ transform: "translateX(" + position.progress * 300 + "%)" }} /></div>
    </section>
  );
}
