import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Baby, BookOpen, CalendarDays, Coffee, Eye, Footprints, Landmark, Mail, MapPin, Moon, Mountain, Palette, Radio,
  ShoppingBag, ShoppingBasket, Sparkles, Store, Trees, UtensilsCrossed, type LucideIcon,
} from 'lucide-react';
import type { DiscoveryEntity, MarketOccurrence, Neighbourhood } from '../../types/discovery';
import { QUADRANTS, entityPath } from '../../lib/discovery';
import { closeCount, hoodCentre, linksFor, vibes, type HoodLinks, type Linked } from '../../lib/neighbourhoods';
import { toSlug } from '../../lib/communityRank';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { TEAR } from '../home/HomeHero';
import { H, HoodMap, W, project } from './HoodMap';
import { ProfileCover } from '../discovery/ProfileCover';
import { ProfileRibbon, StorySpread, useSectionReveal } from '../discovery/ProfileSections';
import { shelfOf, SHELVES, type Shelf } from '../../lib/localShelves';
import '../../styles/neighbourhoods.css';
import '../../styles/local-directory.css';
import '../../styles/local-profile.css';
import '../../styles/story-pages.css';
import '../../styles/neighbourhoods-atlas.css';

// The community awareness game, already part of the Neighbourhoods pages.
const RankStrip = lazy(() => import('../check/RankStrip'));

const QUAD_NAME: Record<string, string> = { NW: 'Northwest', NE: 'Northeast', SW: 'Southwest', SE: 'Southeast' };
const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short' });
const dayNum = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', day: 'numeric' });
const month = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short' });
const clock = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });
const decode = (s: string) => s.replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/&amp;/g, '&');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const longDay = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'long', day: 'numeric', year: 'numeric' });

/** Each quadrant's colour, as a cover "shelf", so a neighbourhood's cover and ribbon wear it. */
const QUAD_TONE: Record<string, [string, string]> = { NW: ['#00c2e0', '#151515'], SW: ['#1554d1', '#fff'], SE: ['#ff8a65', '#151515'], NE: ['#ffdf4f', '#151515'] };
export function hoodShelf(h: Neighbourhood): Shelf {
  const [tone, ink] = QUAD_TONE[h.quadrant] ?? QUAD_TONE.NE;
  return { id: 'community', label: QUAD_NAME[h.quadrant] ? `${QUAD_NAME[h.quadrant]} Calgary` : 'Central Calgary', line: '', tone, ink };
}
const toneStyle = (s: Shelf) => ({ '--tone': s.tone, '--tink': s.ink }) as CSSProperties;

/** A neighbourhood's drawn cover: the river through its street grid, in its quadrant's colour. */
function HoodCover({ hood, number, mini }: { hood: Neighbourhood; number?: number; mini?: boolean }) {
  return <ProfileCover id={hood.id} title={hood.title} shelf={hoodShelf(hood)} number={number} mini={mini} brand="Neighbourhoods" motif="streets" />;
}

const VIBE_ICONS: Record<string, LucideIcon> = {
  Heritage: Landmark, Walkable: Footprints, 'Food & drink': UtensilsCrossed, Shopping: ShoppingBag, Arts: Palette, Nightlife: Moon,
  Parks: Trees, Outdoors: Mountain, Family: Baby, Views: Mountain, Markets: Store,
};

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

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function useMedia(query: string) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return on;
}

/** Steps through 0..n-1 every `ms`, unless paused or the reader prefers no motion. */
function useCycle(n: number, ms: number, paused: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (paused || n < 2 || reduceMotion()) return;
    const t = window.setTimeout(() => setI(x => (x + 1) % n), ms);
    return () => window.clearTimeout(t);
  }, [i, n, ms, paused]);
  return [Math.min(i, Math.max(n - 1, 0)), setI] as const;
}

/** A number that counts up from zero the first time it is drawn. */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(() => (reduceMotion() ? to : 0));
  useEffect(() => {
    if (reduceMotion()) { setN(to); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1400);
      setN(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}</>;
}

/** The headline's last word: each neighbourhood's name, rising in a letter at a time. */
function RollingName({ hood }: { hood?: Neighbourhood }) {
  const name = hood ? `${hood.title}.` : 'neighbourhood.';
  return (
    <span className={`nb-roll q-${(hood?.quadrant ?? 'ne').toLowerCase()}`} style={{ '--len': Math.max(name.length, 8) } as CSSProperties} aria-hidden="true">
      <span className="nb-roll-word" key={name}>
        {[...name].map((ch, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{ch}</span>)}
      </span>
    </span>
  );
}

/** A fanned stack of postcards; the front one is the neighbourhood in the headline. */
function PostcardDeck({ hoods, active, onPick, numberOf }: { hoods: Neighbourhood[]; active: number; onPick: (i: number) => void; numberOf: (h: Neighbourhood) => number }) {
  const n = hoods.length;
  return (
    <div className="nb-deck">
      <ul className="nb-deck-stack">
        {hoods.map((h, i) => {
          const k = (i - active + n) % n;
          const pos = k === 0 ? 'front' : k === 1 ? 'two' : k === 2 ? 'three' : n > 3 && k === n - 1 ? 'gone' : 'back';
          return (
            <li key={h.id} className={`nb-deck-card is-${pos} q-${h.quadrant.toLowerCase()}`} aria-hidden={k !== 0}>
              <Link to={entityPath(h)} tabIndex={k === 0 ? 0 : -1}>
                <img src={h.image?.src || '/images/photo/calgary1.webp'} alt="" width="640" height="460" loading={k < 3 ? 'eager' : 'lazy'} />
                <span className="nb-deck-shade" aria-hidden="true" />
                <QuadTag q={h.quadrant} long />
                <span className="nb-deck-n" aria-hidden="true">{String(numberOf(h)).padStart(2, '0')}</span>
                <span className="nb-deck-title"><strong>{h.title}</strong><small>{h.summary}</small></span>
                <span className="nb-deck-stamp" aria-hidden="true"><HoodCover hood={h} mini /></span>
              </Link>
            </li>
          );
        })}
      </ul>
      {n > 1 ? (
        <div className="nb-deck-dots" role="group" aria-label="Pick a neighbourhood">
          {hoods.map((h, i) => (
            <button key={h.id} type="button" className={`q-${h.quadrant.toLowerCase()}`} aria-label={h.title} aria-pressed={i === active} onClick={() => onPick(i)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** One neighbourhood in the atlas: a big postcard that lights its pin as it scrolls by. */
function AtlasCard({ hood, number, count, on, onHover }: {
  hood: Neighbourhood; number: number; count: { events: number; markets: number; places: number }; on: boolean; onHover: (slug?: string) => void;
}) {
  const stats = ([['events', count.events, CalendarDays], ['markets', count.markets, ShoppingBasket], ['places', count.places, Coffee]] as const).filter(([, v]) => v);
  return (
    <li data-hood={hood.slug} data-reveal className={`nb-chap q-${hood.quadrant.toLowerCase()}${on ? ' is-on' : ''}`} onMouseEnter={() => onHover(hood.slug)}>
      <Link to={entityPath(hood)} className="nb-post">
        <span className="nb-post-photo">
          <img src={hood.image?.src || '/images/photo/calgary1.webp'} alt="" width="900" height="560" loading={number < 3 ? 'eager' : 'lazy'} />
          <QuadTag q={hood.quadrant} long />
          <span className="nb-post-n" aria-hidden="true">{String(number).padStart(2, '0')}</span>
          <span className="nb-post-stamp" aria-hidden="true"><HoodCover hood={hood} mini /></span>
        </span>
        <span className="nb-post-body">
          <strong>{hood.title}<i aria-hidden="true">.</i></strong>
          <span className="nb-post-sum">{hood.summary}</span>
          {vibes(hood).length ? <span className="nb-vibes">{vibes(hood).slice(0, 3).map(v => <em key={v}>{v}</em>)}</span> : null}
          {/* Only what's there: a row of zeros reads as a dead neighbourhood. */}
          <span className="nb-post-stats">
            {stats.length
              ? stats.map(([label, v, Icon]) => <span key={label}><Icon size={16} aria-hidden="true" /><b>{v}</b>{v === 1 ? label.slice(0, -1) : label}</span>)
              : <span className="is-quiet">Walks, history and what’s nearby</span>}
          </span>
          <span className="nb-post-go">Open {hood.title} <ArrowRight size={17} aria-hidden="true" /></span>
        </span>
      </Link>
    </li>
  );
}

/** The drawn map, flown in to whichever neighbourhood is in view. */
function AtlasLens({ hoods, active, quadrant, onHover }: { hoods: Neighbourhood[]; active?: string; quadrant: string | null; onHover: (slug?: string) => void }) {
  const phone = useMedia('(max-width: 700px)');
  const hood = hoods.find(h => h.slug === active);
  const at = hood ? hoodCentre(hood) : undefined;
  // The lens is the map's own shape on desktop and a wide letterbox on phones, so it zooms harder there.
  const aspect = phone ? 2.05 : W / H;
  const s = at ? (phone ? 2 : 1.45) : 1;
  const [px, py] = at ? project(at) : [W / 2, H / 2];
  const lensH = W / aspect;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const tx = clamp(W / 2 - s * px, W - s * W, 0);
  const ty = clamp(lensH / 2 - s * py, lensH - s * H, 0);
  return (
    <div className="nb-lens" style={{ aspectRatio: `${aspect}` }}>
      <div className="nb-lens-map" style={{ transform: `translate(${(tx / W) * 100}%, ${(ty / H) * 100}%) scale(${s})` }}>
        <HoodMap hoods={hoods} active={active} quadrant={quadrant} onHover={onHover} numbered />
      </div>
    </div>
  );
}

const QUAD_LINE: Record<string, string> = {
  NW: 'Bow River towns, Kensington cafés and the Peace Bridge.',
  NE: 'Escarpment views, Italian bakeries and riverside parks.',
  SW: 'Seventeenth Avenue, murals and village high streets.',
  SE: 'Red brick, breweries and the confluence of two rivers.',
};

export function NeighbourhoodsBoard({ hoods, all, occurrences, quadrant }: {
  hoods: Neighbourhood[]; all: readonly DiscoveryEntity[]; occurrences: readonly MarketOccurrence[]; quadrant: string | null;
}) {
  const everyHood = useMemo(() => all.filter((e): e is Neighbourhood => e.kind === 'neighbourhood'), [all]);
  const links = useMemo(() => new Map(everyHood.map(h => [h.id, linksFor(h, all, occurrences)])), [everyHood, all, occurrences]);
  const counts = useMemo(() => new Map([...links].map(([id, l]) => [id, closeCount(l)])), [links]);
  const shown = useMemo(() => (quadrant ? hoods.filter(h => h.quadrant === quadrant) : hoods), [hoods, quadrant]);
  // Totals count each listing once, however many of the shown neighbourhoods it sits near.
  const totals = useMemo(() => {
    const ids = { events: new Set<string>(), markets: new Set<string>(), places: new Set<string>() };
    for (const l of shown.map(h => links.get(h.id)).filter((x): x is HoodLinks => !!x)) for (const k of ['events', 'markets', 'places'] as const) l[k].forEach(x => { if (x.closeness !== 'quadrant') ids[k].add(x.entity.id); });
    return { events: ids.events.size, markets: ids.markets.size, places: ids.places.size };
  }, [links, shown]);
  const preview = shown.some(h => h.developmentOnly);
  const perQuad = Object.fromEntries(QUADRANTS.map(q => [q, everyHood.filter(h => h.quadrant === q)]));
  const numberOf = (h: Neighbourhood) => everyHood.indexOf(h) + 1;
  const revealRef = useSectionReveal(quadrant ?? 'all');
  const ribbon = [plural(everyHood.length, 'neighbourhood'), ...shown.map(h => `${h.title} · ${h.quadrant}`), 'CalgaryWatch Neighbourhoods'];

  // The hero: one name at a time, the deck following along.
  const [deckHold, setDeckHold] = useState(false);
  const [front, setFront] = useCycle(shown.length, 3200, deckHold);
  const heroHood = shown[front];

  // The atlas: whichever postcard crosses the middle of the screen lights its pin.
  const [active, setActive] = useState<string>();
  const atlasRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const els = [...(atlasRef.current?.querySelectorAll<HTMLElement>('[data-hood]') ?? [])];
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.hood); }), { rootMargin: '-45% 0px -50% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [quadrant, shown.length]);
  const activeHood = shown.find(h => h.slug === active);

  return (
    <div className="nb nb-index" ref={revealRef}>
      <section className="nb-hero nb-hx" aria-labelledby="nb-title">
        <span className="nb-hx-glow" aria-hidden="true" />
        <div className="nb-wrap nb-hx-grid">
          <div className="nb-hx-text">
            <p className="nb-dateline"><span className="nb-pulse" aria-hidden="true" />{quadrant ? `${QUAD_NAME[quadrant]} Calgary` : 'Neighbourhoods'} · {plural(shown.length, 'pocket')} of the city</p>
            <h1 id="nb-title">
              <span className="nb-hx-know">Know your</span>
              <span className="sr-only">{quadrant ? `${QUAD_NAME[quadrant]} Calgary neighbourhoods.` : 'neighbourhood.'}</span>
              <RollingName hood={heroHood} />
            </h1>
            {shown.length > 1 ? <span className="nb-hx-timer" key={`${front}-${deckHold}`} data-hold={deckHold || undefined} aria-hidden="true" /> : null}
            <p className="nb-lead">Where to walk, eat and wander, what’s on nearby this week, and what neighbours are keeping an eye on.</p>
            <dl className="nb-hx-stats">
              <div><dt>neighbourhoods</dt><dd><CountUp to={shown.length} /></dd></div>
              <div><dt>events nearby</dt><dd><CountUp to={totals.events} /></dd></div>
              <div><dt>markets</dt><dd><CountUp to={totals.markets} /></dd></div>
              <div><dt>local places</dt><dd><CountUp to={totals.places} /></dd></div>
            </dl>
            <nav className="nb-quads" aria-label="Filter by quadrant">
              <Link to="/neighbourhoods" aria-current={!quadrant ? 'page' : undefined}>All <b>{everyHood.length}</b></Link>
              {QUADRANTS.map(q => (
                <Link key={q} to={`/neighbourhoods?quadrant=${q}`} className={`q-${q.toLowerCase()}`} aria-current={quadrant === q ? 'page' : undefined}>
                  <i aria-hidden="true" />{q} <b>{perQuad[q].length}</b>
                </Link>
              ))}
            </nav>
          </div>
          {shown.length ? (
            <div className="nb-hx-deck" onMouseEnter={() => setDeckHold(true)} onMouseLeave={() => setDeckHold(false)} onFocus={() => setDeckHold(true)} onBlur={() => setDeckHold(false)}>
              <PostcardDeck hoods={shown} active={front} onPick={i => { setFront(i); setDeckHold(true); }} numberOf={numberOf} />
            </div>
          ) : null}
        </div>
        <Tear />
      </section>
      <ProfileRibbon items={ribbon} />

      <div className="nb-wrap">
        {preview && <p className="cw-preview-note">Illustrative design previews. These are not confirmed listings.</p>}
        {shown.length ? (
          <section className="nb-atlas" aria-labelledby="nb-atlas-title">
            <header className="nb-atlas-head" data-reveal>
              <p className="nb-kicker"><MapPin size={14} aria-hidden="true" /> The atlas · scroll the city</p>
              <h2 id="nb-atlas-title">{plural(shown.length, 'neighbourhood')}, <mark>one river.</mark></h2>
            </header>
            <div className="nb-atlas-grid">
              <div className="nb-atlas-map">
                <div className="nb-atlas-frame">
                  <AtlasLens hoods={everyHood} active={active} quadrant={quadrant} onHover={slug => slug && setActive(slug)} />
                  <div className={`nb-atlas-now${activeHood ? ` q-${activeHood.quadrant.toLowerCase()}` : ''}`} aria-live="polite">
                    {activeHood ? (
                      <>
                        <span className="nb-atlas-num">{String(numberOf(activeHood)).padStart(2, '0')}<small>/{String(everyHood.length).padStart(2, '0')}</small></span>
                        <span className="nb-atlas-name" key={activeHood.id}><strong>{activeHood.title}</strong><small>{QUAD_NAME[activeHood.quadrant] ?? 'Central'} Calgary</small></span>
                        <Link to={entityPath(activeHood)} className="nb-atlas-go" aria-label={`Open ${activeHood.title}`}><ArrowUpRight size={20} aria-hidden="true" /></Link>
                      </>
                    ) : (
                      <span className="nb-atlas-name"><strong>Inner-city Calgary</strong><small>Scroll, and the map follows</small></span>
                    )}
                  </div>
                </div>
              </div>
              <ol className="nb-chaps" ref={atlasRef}>
                {shown.map(h => (
                  <AtlasCard key={h.id} hood={h} number={numberOf(h)} count={counts.get(h.id) ?? { events: 0, markets: 0, places: 0 }} on={active === h.slug} onHover={slug => slug && setActive(slug)} />
                ))}
              </ol>
            </div>
          </section>
        ) : (
          <div className="nb-empty"><h2>Nothing in {quadrant} yet.</h2><p>We’re adding neighbourhoods a few at a time.</p><Link className="nb-btn" to="/neighbourhoods">See every neighbourhood <ArrowRight size={16} aria-hidden="true" /></Link></div>
        )}
      </div>

      <section className="nb-wrap nb-sides" data-reveal aria-labelledby="nb-sides-title">
        <h2 id="nb-sides-title">Four sides of <mark>the city.</mark></h2>
        <ul>
          {QUADRANTS.map(q => (
            <li key={q}>
              <Link to={`/neighbourhoods?quadrant=${q}`} className={`nb-side-tile q-${q.toLowerCase()}`} aria-current={quadrant === q ? 'page' : undefined}>
                <span className="nb-side-art" aria-hidden="true"><img src={`/images/quadrant/quadrant-${q.toLowerCase()}-collage.webp`} alt="" loading="lazy" width="480" height="480" /></span>
                <b className="nb-side-q" aria-hidden="true">{q}</b>
                <span className="nb-side-copy">
                  <strong>{QUAD_NAME[q]}</strong>
                  <span>{QUAD_LINE[q]}</span>
                  <small>{perQuad[q].length ? perQuad[q].map(h => h.title).join(' · ') : 'Coming soon'}</small>
                </span>
                <span className="nb-side-go" aria-hidden="true"><ArrowUpRight size={20} /></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="nb-wrap nb-connect" data-reveal aria-labelledby="nb-connect-title">
        <h2 id="nb-connect-title">Look out for <mark>your block.</mark></h2>
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

const coverShelf = (e: DiscoveryEntity) => SHELVES.find(x => x.id === (e.kind === 'business' ? shelfOf(e) : 'markets'))!;

function ListingTile({ l, hood, icon }: { l: Linked; hood: Neighbourhood; icon: 'market' | 'place' }) {
  const at = l.when ? new Date(l.when) : undefined;
  return (
    <li>
      <Link to={entityPath(l.entity)} className={`nb-listing is-${icon}`}>
        <span className="nb-listing-cover"><ProfileCover id={l.entity.id} title={l.entity.title} shelf={coverShelf(l.entity)} mini /></span>
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

function Section({ id, title, count, more, children }: { id: string; title: ReactNode; count?: string; more?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="nb-sec" id={id} data-reveal aria-labelledby={`${id}-title`}>
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
  const revealRef = useSectionReveal(hood.id);
  const shelf = hoodShelf(hood);
  const number = everyHood.indexOf(hood) + 1;
  const official = hood.sources.find(src => src.kind === 'official') ?? hood.sources[0];
  const nearest = links.neighbours[0];
  const ribbon = [
    hood.title, shelf.label, c.events ? plural(c.events, 'event') + ' in or near' : 'Walks and history',
    c.markets ? plural(c.markets, 'market') + ' close by' : null, c.places ? plural(c.places, 'local place') : null, ...tags, 'CalgaryWatch Neighbourhoods',
  ].filter((x): x is string => !!x);
  const facts: [string, ReactNode][] = [
    ['Quadrant', <Link key="q" to={`/neighbourhoods?quadrant=${hood.quadrant}`}>{shelf.label}</Link>],
    ['Close by', [c.events ? plural(c.events, 'event') : null, c.markets ? plural(c.markets, 'market') : null, c.places ? plural(c.places, 'place') : null].filter(Boolean).join(' · ') || 'Walks, history and views'],
    ...(nearest ? [['Next door', <Link key="n" to={entityPath(nearest.hood)}>{nearest.hood.title}{nearest.km !== undefined ? `, ${nearest.km.toFixed(1)} km` : ''}</Link>] as [string, ReactNode]] : []),
    ['Listed from', official ? <a key="o" href={official.url} target="_blank" rel="noopener noreferrer">{official.name}</a> : 'Public sources'],
    ['Last checked', longDay.format(new Date(hood.verifiedAt || hood.updatedAt))],
    ['On the map', <Link key="m" to={mapTo}>Live reports nearby</Link>],
  ];

  return (
    <div className="nb nb-detail" ref={revealRef} style={toneStyle(shelf)}>
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
      <ProfileRibbon items={ribbon} />

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
          <a href="#nb-story">Story</a><a href="#nb-on">What’s on</a><a href="#nb-markets">Markets</a><a href="#nb-places">Local</a>{links.guides.length ? <a href="#nb-guides">Guides</a> : null}<a href="#nb-watch">Look out</a><a href="#nb-next">Next door</a>
        </nav>

        <StorySpread
          id="nb-story" headingId="nb-story-title" name={hood.title} text={hood.description || hood.summary} offers={tags} iconOf={v => VIBE_ICONS[v] ?? Sparkles} facts={facts}
          cover={<HoodCover hood={hood} number={number} />}
          caption={`Cover art for ${hood.title}, drawn for CalgaryWatch Neighbourhoods.`}
          eyebrow={<><MapPin size={15} aria-hidden="true" />{QUAD_NAME[hood.quadrant] ?? hood.quadrant} Calgary · No. {String(number).padStart(2, '0')}</>}
        />

        <div className="nb-body">
          <div className="nb-main">
            <Section id="nb-on" title={<>What’s on around <mark>{hood.title}</mark></>} count={c.events ? `${c.events} in or near` : undefined} more={{ to: '/events', label: 'All events' }}>
              {events.length
                ? <ol className="nb-rows">{events.map(l => <EventRow key={l.entity.id} l={l} hood={hood} />)}</ol>
                : <p className="nb-none">Nothing is listed in or near {hood.title} right now. <Link to="/events/this-weekend">See this weekend across Calgary</Link>, or <Link to="/submit">tell us what’s on</Link>.</p>}
            </Section>

            <Section id="nb-markets" title={<>Markets <mark>close by</mark></>} more={{ to: '/markets', label: 'All markets' }}>
              {markets.length
                ? <ul className="nb-listings">{markets.map(l => <ListingTile key={l.entity.id} l={l} hood={hood} icon="market" />)}</ul>
                : <p className="nb-none">No market with upcoming dates near {hood.title}. <Link to="/markets/this-weekend">Markets this weekend</Link>.</p>}
            </Section>

            <Section id="nb-places" title={<>Local places <mark>worth knowing</mark></>} more={{ to: '/local', label: 'All local' }}>
              {places.length
                ? <ul className="nb-listings">{places.map(l => <ListingTile key={l.entity.id} l={l} hood={hood} icon="place" />)}</ul>
                : <p className="nb-none">We haven’t written up a place here yet. <Link to="/local">Browse local places</Link>, or <Link to="/submit">suggest one</Link>.</p>}
            </Section>

            {links.guides.length ? (
              <Section id="nb-guides" title={<>Guides that <mark>pass through</mark></>}>
                <ul className="nb-guides">{links.guides.map(g => (
                  <li key={g.id}><Link to={entityPath(g)} className="nb-guide" style={g.cover ? { background: `linear-gradient(135deg, ${g.cover.from}, ${g.cover.to})`, color: g.cover.ink } : undefined}>
                    <BookOpen size={20} aria-hidden="true" /><strong>{g.title}</strong>{g.facts ? <span>{g.facts.time} · {g.facts.cost}</span> : <span>{g.summary}</span>}<ArrowUpRight className="nb-row-go" size={18} aria-hidden="true" />
                  </Link></li>
                ))}</ul>
              </Section>
            ) : null}
          </div>

          <aside className="nb-side">
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

      <section className="nb-wrap nb-next" id="nb-next" data-reveal aria-labelledby="nb-next-title">
        <header className="nb-next-head">
          <h2 id="nb-next-title">Next <mark>door.</mark></h2>
          <Link to={`/neighbourhoods?quadrant=${hood.quadrant}`} className="nb-more">More in {hood.quadrant} <ArrowRight size={15} aria-hidden="true" /></Link>
        </header>
        <ul className="nb-next-list">
          {links.neighbours.slice(0, 4).map(({ hood: h, km: d }) => (
            <li key={h.id}><Link to={entityPath(h)} className={`nb-mini q-${h.quadrant.toLowerCase()}`}>
              <img src={h.image?.src || '/images/photo/calgary1.webp'} alt="" loading="lazy" width="320" height="220" />
              <span className="nb-mini-cover"><HoodCover hood={h} mini /></span>
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
