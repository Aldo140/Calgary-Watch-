import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Coffee, Eye, Mail, MapPin, Radio, ShoppingBasket } from 'lucide-react';
import type { DiscoveryEntity, MarketOccurrence, Neighbourhood } from '../../types/discovery';
import { QUADRANTS, entityPath } from '../../lib/discovery';
import { closeCount, hoodCentre, linksFor, vibes, type HoodLinks, type Linked } from '../../lib/neighbourhoods';
import { toSlug } from '../../lib/communityRank';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { TEAR } from '../home/HomeHero';
import { SourceBadge } from '../entity/EntityDetail';
import { HoodMap } from './HoodMap';
import '../../styles/neighbourhoods.css';

// The community awareness game, already part of the Neighbourhoods pages.
const RankStrip = lazy(() => import('../check/RankStrip'));

const QUAD_NAME: Record<string, string> = { NW: 'Northwest', NE: 'Northeast', SW: 'Southwest', SE: 'Southeast' };
const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short' });
const dayNum = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', day: 'numeric' });
const month = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short' });
const clock = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });
const decode = (s: string) => s.replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&amp;/g, '&');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Tear({ className = '' }: { className?: string }) {
  return (
    <svg className={`nb-tear ${className}`} viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="nb-tear-shade" d={TEAR} transform="translate(0 -5)" />
      <path className="nb-tear-paper" d={TEAR} />
    </svg>
  );
}

function QuadTag({ q, long = false }: { q: string; long?: boolean }) {
  return <span className={`nb-quad q-${q.toLowerCase()}`}>{long ? `${QUAD_NAME[q] ?? q} · ${q}` : q}</span>;
}

/* ───────────────────────── The index ───────────────────────── */

export function NeighbourhoodsBoard({ hoods, all, occurrences, quadrant }: {
  hoods: Neighbourhood[]; all: readonly DiscoveryEntity[]; occurrences: readonly MarketOccurrence[]; quadrant: string | null;
}) {
  const [hover, setHover] = useState<string>();
  const everyHood = useMemo(() => all.filter((e): e is Neighbourhood => e.kind === 'neighbourhood'), [all]);
  const counts = useMemo(() => new Map(everyHood.map(h => [h.id, closeCount(linksFor(h, all, occurrences))])), [everyHood, all, occurrences]);
  const shown = quadrant ? hoods.filter(h => h.quadrant === quadrant) : hoods;
  const preview = shown.some(h => h.developmentOnly);
  const perQuad = Object.fromEntries(QUADRANTS.map(q => [q, everyHood.filter(h => h.quadrant === q).length]));

  return (
    <div className="nb">
      <section className="nb-hero" aria-labelledby="nb-title">
        <div className="nb-wrap nb-hero-grid">
          <div className="nb-hero-text">
            <p className="nb-dateline"><span className="nb-pulse" aria-hidden="true" />Neighbourhoods · {plural(everyHood.length, 'pocket')} of the city</p>
            <h1 id="nb-title">{quadrant ? <>{QUAD_NAME[quadrant]} <span>Calgary.</span></> : <>Know your <span>neighbourhood.</span></>}</h1>
            <p className="nb-lead">Where to walk, eat and wander, what’s on nearby this week, and what neighbours are keeping an eye on. Tap a pin or pick a quadrant.</p>
            <nav className="nb-quads" aria-label="Filter by quadrant">
              <Link to="/neighbourhoods" aria-current={!quadrant ? 'page' : undefined}>All <b>{everyHood.length}</b></Link>
              {QUADRANTS.map(q => (
                <Link key={q} to={`/neighbourhoods?quadrant=${q}`} className={`q-${q.toLowerCase()}`} aria-current={quadrant === q ? 'page' : undefined}>
                  <i aria-hidden="true" />{q} <b>{perQuad[q]}</b>
                </Link>
              ))}
            </nav>
          </div>
          <figure className="nb-hero-map">
            <HoodMap hoods={everyHood} active={hover} quadrant={quadrant} onHover={setHover} numbered />
            <figcaption><MapPin size={13} aria-hidden="true" /> Inner city · pins at each neighbourhood’s heart</figcaption>
          </figure>
        </div>
        <Tear />
      </section>

      <div className="nb-wrap">
        {preview && <p className="cw-preview-note">Illustrative design previews. These are not confirmed listings.</p>}
        {shown.length ? (
          <ol className="nb-grid">
            {shown.map((h, i) => {
              const c = counts.get(h.id) ?? { events: 0, markets: 0, places: 0 };
              return (
                <li key={h.id} className={hover === h.slug ? 'is-hover' : undefined} onMouseEnter={() => setHover(h.slug)} onMouseLeave={() => setHover(undefined)}>
                  <Link to={entityPath(h)} className={`nb-card q-${h.quadrant.toLowerCase()}`}>
                    <span className="nb-card-photo">
                      <img src={h.image?.src || '/images/photo/calgary1.webp'} alt="" loading={i < 3 ? 'eager' : 'lazy'} width="720" height="480" />
                      <QuadTag q={h.quadrant} />
                      <span className="nb-card-n" aria-hidden="true">{String(everyHood.indexOf(h) + 1).padStart(2, '0')}</span>
                    </span>
                    <span className="nb-card-body">
                      <strong>{h.title}</strong>
                      <span className="nb-card-sum">{h.summary}</span>
                      <span className="nb-vibes">{vibes(h).slice(0, 3).map(v => <em key={v}>{v}</em>)}</span>
                      {/* Only what's there: a row of zeros reads as a dead neighbourhood. */}
                      <span className="nb-card-counts">
                        {c.events ? <span title="Events in or near it"><CalendarDays size={15} aria-hidden="true" />{plural(c.events, 'event')}</span> : null}
                        {c.markets ? <span title="Markets in or near it"><ShoppingBasket size={15} aria-hidden="true" />{plural(c.markets, 'market')}</span> : null}
                        {c.places ? <span title="Local places"><Coffee size={15} aria-hidden="true" />{plural(c.places, 'place')}</span> : null}
                        {!c.events && !c.markets && !c.places ? <span>Walks, history and what’s nearby</span> : null}
                      </span>
                    </span>
                    <span className="nb-card-go" aria-hidden="true"><ArrowUpRight size={20} /></span>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="nb-empty"><h2>Nothing in {quadrant} yet.</h2><p>We’re adding neighbourhoods a few at a time.</p><Link className="nb-btn" to="/neighbourhoods">See every neighbourhood <ArrowRight size={16} aria-hidden="true" /></Link></div>
        )}
      </div>

      <section className="nb-wrap nb-connect" aria-labelledby="nb-connect-title">
        <h2 id="nb-connect-title">Look out for <span>your block.</span></h2>
        <ul>
          <li><Link to="/map" className="nb-tile is-live"><Radio size={22} aria-hidden="true" /><b>The live map</b><span>Weather, traffic, outages and what neighbours reported, with the source on every pin.</span><i>Open the map <ArrowRight size={15} aria-hidden="true" /></i></Link></li>
          <li><Link to="/plans?email=monday#emails" className="nb-tile is-mail"><Mail size={22} aria-hidden="true" /><b>Monday, near home</b><span>A free email with what was reported within a walk, 3 km and 10 km of you.</span><i>Get it free <ArrowRight size={15} aria-hidden="true" /></i></Link></li>
          <li><Link to="/calgary-neighbourhood-watch" className="nb-tile is-watch"><Eye size={22} aria-hidden="true" /><b>Start a block watch</b><span>A plain guide to looking out for each other, and who to call for what.</span><i>Read the guide <ArrowRight size={15} aria-hidden="true" /></i></Link></li>
        </ul>
      </section>

      <div className="nb-wrap nb-rank"><Suspense fallback={null}><RankStrip /></Suspense></div>
    </div>
  );
}

/* ───────────────────────── One neighbourhood ───────────────────────── */

function whereLabel(l: Linked, hood: Neighbourhood) {
  if (l.closeness === 'here') return `In ${hood.title}`;
  if (l.closeness === 'nearby') return l.km !== undefined ? `${l.km < 1 ? '<1' : l.km.toFixed(1)} km away` : 'Nearby';
  return `Around ${hood.quadrant}`;
}

function placeName(e: DiscoveryEntity) {
  return ('venue' in e && e.venue) || e.neighbourhood || ('address' in e ? e.address : '') || '';
}

function EventRow({ l, hood }: { l: Linked; hood: Neighbourhood }) {
  const at = new Date(l.when ?? (l.entity.kind === 'event' ? l.entity.start : Date.now()));
  return (
    <li>
      <Link to={entityPath(l.entity)} className="nb-row">
        <span className="nb-date"><small>{day.format(at)}</small><b>{dayNum.format(at)}</b><small>{month.format(at)}</small></span>
        <span className="nb-row-main">
          <strong>{decode(l.entity.title)}</strong>
          <span>{clock.format(at)}{placeName(l.entity) ? ` · ${decode(placeName(l.entity))}` : ''}</span>
        </span>
        <span className={`nb-near is-${l.closeness}`}>{whereLabel(l, hood)}</span>
        <ArrowUpRight className="nb-row-go" size={18} aria-hidden="true" />
      </Link>
    </li>
  );
}

function ListingTile({ l, hood, icon }: { l: Linked; hood: Neighbourhood; icon: 'market' | 'place' }) {
  const at = l.when ? new Date(l.when) : undefined;
  return (
    <li>
      <Link to={entityPath(l.entity)} className={`nb-listing is-${icon}`}>
        <span className="nb-listing-icon" aria-hidden="true">{icon === 'market' ? <ShoppingBasket size={20} /> : <Coffee size={20} />}</span>
        <strong>{decode(l.entity.title)}</strong>
        <span className="nb-listing-sum">{l.entity.summary}</span>
        <span className="nb-listing-foot">
          <span className={`nb-near is-${l.closeness}`}>{whereLabel(l, hood)}</span>
          {at ? <span className="nb-listing-when">Next: {day.format(at)} {dayNum.format(at)} {month.format(at)}</span> : null}
        </span>
      </Link>
    </li>
  );
}

function Section({ id, title, count, more, children }: { id: string; title: string; count?: string; more?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="nb-sec" id={id} aria-labelledby={`${id}-title`}>
      <header><h2 id={`${id}-title`}>{title}</h2>{count ? <span className="nb-sec-count">{count}</span> : null}{more ? <Link to={more.to} className="nb-more">{more.label} <ArrowRight size={15} aria-hidden="true" /></Link> : null}</header>
      {children}
    </section>
  );
}

export function NeighbourhoodDetail({ hood, all, occurrences }: { hood: Neighbourhood; all: readonly DiscoveryEntity[]; occurrences: readonly MarketOccurrence[] }) {
  const links: HoodLinks = useMemo(() => linksFor(hood, all, occurrences), [hood, all, occurrences]);
  const everyHood = useMemo(() => all.filter((e): e is Neighbourhood => e.kind === 'neighbourhood'), [all]);
  const centre = hoodCentre(hood);
  const mapTo = centre ? `/map?lat=${centre[0]}&lng=${centre[1]}` : '/map';
  const events = links.events.slice(0, 6);
  const markets = links.markets.slice(0, 4);
  const places = links.places.slice(0, 4);
  const next = events[0] ?? markets[0];
  const c = closeCount(links);
  const tags = vibes(hood);

  return (
    <div className="nb nb-detail">
      <section className={`nb-hero nb-hood-hero q-${hood.quadrant.toLowerCase()}`} aria-labelledby="nb-hood-title">
        <img className="nb-hood-bg" src={hood.image?.src || '/images/photo/calgary1.webp'} alt="" aria-hidden="true" />
        <div className="nb-wrap nb-hood-grid">
          <div className="nb-hood-text">
            <Link to="/neighbourhoods" className="nb-back"><ArrowLeft size={15} aria-hidden="true" /> All neighbourhoods</Link>
            <p className="nb-dateline"><QuadTag q={hood.quadrant} long />{hood.developmentOnly ? <span className="nb-chip">Illustrative preview</span> : null}</p>
            <h1 id="nb-hood-title">{hood.title}<span className="nb-dot" aria-hidden="true">.</span></h1>
            <p className="nb-lead">{hood.summary}</p>
            {tags.length ? <p className="nb-vibes is-hero">{tags.map(v => <em key={v}>{v}</em>)}</p> : null}
            <div className="nb-actions">
              <Link to={mapTo} className="nb-btn is-yellow"><Radio size={17} aria-hidden="true" /> See it on the live map</Link>
              <a href="#nb-on" className="nb-btn is-ghost"><CalendarDays size={17} aria-hidden="true" /> What’s on nearby</a>
            </div>
          </div>
          <figure className="nb-hood-photo">
            <img src={hood.image?.src || '/images/photo/calgary1.webp'} alt={hood.image?.alt || hood.title} width="720" height="540" />
            <span className="nb-hood-map"><HoodMap hoods={[hood]} active={hood.slug} compact label={`Where ${hood.title} is in Calgary`} /></span>
          </figure>
        </div>
        <Tear />
      </section>

      <div className="nb-wrap">
        <div className="nb-glance" role="list" aria-label={`${hood.title} at a glance`}>
          <a role="listitem" href="#nb-on" className="nb-glance-next">
            <small>Up next nearby</small>
            {next ? <><b>{decode(next.entity.title)}</b><span>{next.when ? `${day.format(new Date(next.when))} ${dayNum.format(new Date(next.when))} ${month.format(new Date(next.when))} · ${clock.format(new Date(next.when))}` : ''}</span></> : <><b>Nothing listed yet</b><span>Browse the whole city’s week</span></>}
          </a>
          <a role="listitem" href="#nb-on"><b>{c.events}</b><small>{c.events === 1 ? 'event' : 'events'} in or near</small></a>
          <a role="listitem" href="#nb-markets"><b>{c.markets}</b><small>{c.markets === 1 ? 'market' : 'markets'} close by</small></a>
          <a role="listitem" href="#nb-places"><b>{c.places}</b><small>local {c.places === 1 ? 'place' : 'places'}</small></a>
        </div>

        <nav className="nb-jump" aria-label="On this page">
          <a href="#nb-on">What’s on</a><a href="#nb-markets">Markets</a><a href="#nb-places">Local</a>{links.guides.length ? <a href="#nb-guides">Guides</a> : null}<a href="#nb-watch">Look out</a><a href="#nb-next">Next door</a>
        </nav>

        <div className="nb-body">
          <div className="nb-main">
            <Section id="nb-on" title={`What’s on around ${hood.title}`} count={c.events ? `${c.events} in or near` : undefined} more={{ to: '/events', label: 'All events' }}>
              {events.length
                ? <ol className="nb-rows">{events.map(l => <EventRow key={l.entity.id} l={l} hood={hood} />)}</ol>
                : <p className="nb-none">Nothing is listed in or near {hood.title} right now. <Link to="/events/this-weekend">See this weekend across Calgary</Link>, or <Link to="/submit">tell us what’s on</Link>.</p>}
            </Section>

            <Section id="nb-markets" title="Markets close by" more={{ to: '/markets', label: 'All markets' }}>
              {markets.length
                ? <ul className="nb-listings">{markets.map(l => <ListingTile key={l.entity.id} l={l} hood={hood} icon="market" />)}</ul>
                : <p className="nb-none">No market with upcoming dates near {hood.title}. <Link to="/markets/this-weekend">Markets this weekend</Link>.</p>}
            </Section>

            <Section id="nb-places" title="Local places worth knowing" more={{ to: '/local', label: 'All local' }}>
              {places.length
                ? <ul className="nb-listings">{places.map(l => <ListingTile key={l.entity.id} l={l} hood={hood} icon="place" />)}</ul>
                : <p className="nb-none">We haven’t written up a place here yet. <Link to="/local">Browse local places</Link>, or <Link to="/submit">suggest one</Link>.</p>}
            </Section>

            {links.guides.length ? (
              <Section id="nb-guides" title="Guides that pass through">
                <ul className="nb-guides">{links.guides.map(g => (
                  <li key={g.id}><Link to={entityPath(g)} className="nb-guide" style={g.cover ? { background: `linear-gradient(135deg, ${g.cover.from}, ${g.cover.to})`, color: g.cover.ink } : undefined}>
                    <BookOpen size={20} aria-hidden="true" /><strong>{g.title}</strong>{g.facts ? <span>{g.facts.time} · {g.facts.cost}</span> : <span>{g.summary}</span>}<ArrowUpRight className="nb-row-go" size={18} aria-hidden="true" />
                  </Link></li>
                ))}</ul>
              </Section>
            ) : null}
          </div>

          <aside className="nb-side">
            <section className="nb-about" aria-labelledby="nb-about-title">
              <h2 id="nb-about-title">About {hood.title}</h2>
              <p>{hood.description}</p>
              <SourceBadge entity={hood} />
            </section>
            <section className="nb-watch" id="nb-watch" aria-labelledby="nb-watch-title">
              <p className="nb-watch-kicker"><span className="nb-pulse" aria-hidden="true" />Community awareness</p>
              <h2 id="nb-watch-title">Look out for {hood.title}.</h2>
              <p>What neighbours and the City reported nearby, kept in one place. Reports aren’t a score; they’re a reason to say hello to the people next door.</p>
              <ul>
                <li><Link to={mapTo}><Radio size={17} aria-hidden="true" /> Reports on the live map <ArrowRight size={15} aria-hidden="true" /></Link></li>
                <li><Link to={`/check-your-community?c=${toSlug(hood.title)}`}><Eye size={17} aria-hidden="true" /> How it compares this year <ArrowRight size={15} aria-hidden="true" /></Link></li>
                <li><Link to="/plans?email=monday#emails"><Mail size={17} aria-hidden="true" /> Monday email, near home <ArrowRight size={15} aria-hidden="true" /></Link></li>
                <li><Link to="/calgary-neighbourhood-watch"><BookOpen size={17} aria-hidden="true" /> Start a block watch <ArrowRight size={15} aria-hidden="true" /></Link></li>
              </ul>
            </section>
            <p className="nb-fix"><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction: ${hood.title}`)}`}>Suggest a correction</a></p>
          </aside>
        </div>
      </div>

      <div className="nb-wrap nb-rank"><Suspense fallback={null}><RankStrip focus={hood.title} /></Suspense></div>

      <section className="nb-wrap nb-next" id="nb-next" aria-labelledby="nb-next-title">
        <header className="nb-next-head">
          <h2 id="nb-next-title">Next <span>door.</span></h2>
          <Link to={`/neighbourhoods?quadrant=${hood.quadrant}`} className="nb-more">More in {hood.quadrant} <ArrowRight size={15} aria-hidden="true" /></Link>
        </header>
        <ul className="nb-next-list">
          {links.neighbours.slice(0, 4).map(({ hood: h, km: d }) => (
            <li key={h.id}><Link to={entityPath(h)} className={`nb-mini q-${h.quadrant.toLowerCase()}`}>
              <img src={h.image?.src || '/images/photo/calgary1.webp'} alt="" loading="lazy" width="320" height="220" />
              <span><QuadTag q={h.quadrant} />{d !== undefined ? <small>{d.toFixed(1)} km</small> : null}</span>
              <strong>{h.title}</strong>
            </Link></li>
          ))}
        </ul>
        {everyHood.length > 1 ? null : <p className="nb-none">More neighbourhoods are on the way.</p>}
      </section>
    </div>
  );
}
