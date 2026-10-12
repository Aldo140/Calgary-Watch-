import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, Footprints, MapPin, ShoppingBasket, Ticket, BookOpen, Map as MapIcon } from 'lucide-react';
import type { Business, DiscoveryEntity, Event, Guide, Market, MarketOccurrence, Neighbourhood } from '../../types/discovery';
import { entityPath, LOCAL_CATEGORIES } from '../../lib/discovery';
import { hoodOf, localLinks, type LocalLinks } from '../../lib/localLinks';
import { LOCAL_NOTES } from '../../data/localNotes';
import { ShopArt } from './ListingArt';
import { ServicesDirectory, ServicesIndex } from './LocalServices';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';

const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });

const QUADRANT_BOX: Record<string, [number, number]> = { NW: [0, 0], NE: [1, 0], SW: [0, 1], SE: [1, 1] };
const FAN_TILT = [-5, 4, 3, -4];

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

const shortName = (title: string) => title.split(/\s+[—–-]\s+/)[0];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function Stamp({ partner }: { partner?: boolean }) {
  return partner
    ? <span className="cw-loc-stamp cw-loc-stamp-partner">Featured partner</span>
    : <span className="cw-loc-stamp" aria-label="CalgaryWatch pick"><small>CalgaryWatch</small>Pick</span>;
}

function nextLabel(n: NonNullable<LocalLinks['next']>) {
  return n.here ? 'Market here' : n.kind === 'market' ? 'Market nearby' : 'On nearby';
}

/** Small links under each card: the neighbourhood, what's on nearby, and any guide that passes it. */
function LinkRail({ links }: { links: LocalLinks }) {
  if (!links.hood && !links.next && !links.guides.length) return null;
  return (
    <div className="cw-loc-rail">
      {links.hood ? <Link to={entityPath(links.hood)} className="cw-loc-tag cw-loc-tag-hood"><MapPin size={14} aria-hidden="true" />{links.hood.title}</Link> : null}
      {links.next ? <Link to={links.next.path} className="cw-loc-tag cw-loc-tag-next"><CalendarDays size={14} aria-hidden="true" /><span><b>{nextLabel(links.next)}</b> {day.format(new Date(links.next.start))}</span></Link> : null}
      {links.guides.slice(0, 1).map(g => <Link key={g.id} to={entityPath(g)} className="cw-loc-tag cw-loc-tag-guide"><Footprints size={14} aria-hidden="true" />In a guide</Link>)}
    </div>
  );
}

/** "Make a day of it": the feature's links as big tiles. */
function DayPlan({ place, links }: { place: Business; links: LocalLinks }) {
  const guide = links.guides[0];
  if (!links.hood && !links.next && !guide) return null;
  return (
    <div className="cw-loc-day">
      <p className="cw-loc-day-head">Make a day of it</p>
      <div className="cw-loc-day-tiles">
        {links.hood ? (
          <Link to={entityPath(links.hood)} className="cw-loc-day-tile cw-loc-day-hood">
            <small>The neighbourhood</small>
            <strong>Inside {links.hood.title}</strong>
            <span>What’s around {shortName(place.title)}, and how the area’s doing</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        ) : null}
        {links.next ? (
          <Link to={links.next.path} className="cw-loc-day-tile cw-loc-day-next">
            <small>{nextLabel(links.next)} · {day.format(new Date(links.next.start))}</small>
            <strong>{links.next.title}</strong>
            <span>{links.next.here ? 'Held right here' : `A short hop from ${shortName(place.title)}`}</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        ) : null}
        {guide ? (
          <Link to={entityPath(guide)} className="cw-loc-day-tile cw-loc-day-guide" style={guide.cover ? { ['--from' as string]: guide.cover.from, ['--to' as string]: guide.cover.to, ['--gink' as string]: guide.cover.ink } : undefined}>
            <small>Walk it</small>
            <strong>{guide.title}</strong>
            <span>{guide.facts ? `${guide.facts.time} · ${guide.facts.distance}` : 'A CalgaryWatch guide'}</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Local: CalgaryWatch's own list of independent places. Picks are editorial and never
 * sold; a paid placement is always labelled "Featured partner" and never stamped a pick.
 */
export function LocalBoard({ items, all, occurrences, category }: { items: DiscoveryEntity[]; all: DiscoveryEntity[]; occurrences: readonly MarketOccurrence[]; category?: string }) {
  const now = Date.now();
  const hoods = all.filter((e): e is Neighbourhood => e.kind === 'neighbourhood');
  const everyPlace = all.filter((e): e is Business => e.kind === 'business');
  const places = items.filter((e): e is Business => e.kind === 'business')
    .sort((a, b) => Number(b.partner) - Number(a.partner) || Number(b.editorialSelection) - Number(a.editorialSelection) || a.title.localeCompare(b.title));
  const linksFor = new Map(everyPlace.map(p => [p.id, localLinks(p, all, occurrences, LOCAL_NOTES[p.id], now)]));
  const quadOf = (p: Business) => hoodOf(p, hoods)?.quadrant;
  const picks = places.filter(p => p.editorialSelection && !p.partner);
  const feature = !category && picks.length ? picks[isoWeek(new Date()) % picks.length] : undefined;
  const featureNote = feature ? LOCAL_NOTES[feature.id] : undefined;
  const book = places.filter(p => p !== feature);
  const quads = new Set(places.map(quadOf).filter(Boolean));
  const areas = new Set(places.map(p => p.neighbourhood).filter(Boolean));
  const fan = everyPlace.slice().sort((a, b) => a.title.localeCompare(b.title)).slice(0, 4);

  // Guides that pass a Local place or its neighbourhood, and the rest of the site to keep going.
  const placeGuides = [...new Map(places.flatMap(p => linksFor.get(p.id)?.guides ?? []).map(g => [g.id, g])).values()];
  const upcomingMarkets = all.filter((e): e is Market => e.kind === 'market' && occurrences.some(o => o.marketId === e.id && !o.cancelled && Date.parse(o.end) > now)).length;
  const upcomingEvents = all.filter((e): e is Event => e.kind === 'event' && !e.cancelled && Date.parse(e.end) > now).length;
  const guideCount = all.filter((e): e is Guide => e.kind === 'guide').length;

  return (
    <div className="cw-loc">
      <header className="cw-loc-hero">
        <div className="cw-loc-hero-copy">
          <p className="cw-loc-kicker"><span className="cw-loc-dot" aria-hidden="true" />CalgaryWatch Local</p>
          {category === 'services'
            ? <h1>The Calgarians to call <span>when something breaks.</span></h1>
            : <h1>The places Calgarians <span>keep to themselves.</span></h1>}
          <p className="cw-loc-lead">{category === 'services'
            ? 'Plumbers, furnace techs, snow removal and the other services every Calgary home needs, with what to ask before you hire. Picked by us, never sold.'
            : 'Independent spots worth crossing the city for, with how to do each one like a local. Picked by us, never sold.'}</p>
          <ul className="cw-loc-stats" aria-label="At a glance">
            <li><b>{places.length}</b> {places.length === 1 ? 'place' : 'places'}</li>
            <li><b>{areas.size}</b> {areas.size === 1 ? 'neighbourhood' : 'neighbourhoods'}</li>
            {quads.size ? <li><b>{quads.size}/4</b> quadrants</li> : null}
          </ul>
        </div>
        {fan.length ? (
          <ul className="cw-loc-fan" aria-label="Every place in the book">
            {fan.map((p, i) => (
              <li key={p.id} style={{ ['--r' as string]: `${FAN_TILT[i] ?? 0}deg`, ['--i' as string]: i }}>
                <Link to={entityPath(p)}>
                  <span className="cw-loc-fan-art"><ShopArt id={p.id} title={p.title} tags={p.tags} categories={p.categories} /></span>
                  <span className="cw-loc-fan-name">{shortName(p.title)}<small>{p.neighbourhood}</small></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <span className="cw-loc-hero-bow" aria-hidden="true" />
      </header>

      <nav className="cw-loc-cats" aria-label="Filter local places">
        <Link to="/local" aria-current={!category ? 'page' : undefined}>Everything <i>{everyPlace.length}</i></Link>
        {LOCAL_CATEGORIES.map(c => {
          const n = everyPlace.filter(p => p.categories.includes(c)).length;
          return <Link key={c} to={`/local/${c}`} aria-current={category === c ? 'page' : undefined}>{cap(c)} <i>{n}</i></Link>;
        })}
      </nav>

      {category === 'services' ? <ServicesDirectory places={everyPlace} /> : null}

      {feature ? (
        <section className="cw-loc-feature" aria-labelledby="loc-feature">
          <div className="cw-loc-feature-art">
            <ShopArt id={feature.id} title={feature.title} tags={feature.tags} categories={feature.categories} />
            <Stamp />
            <span className="cw-loc-tape" aria-hidden="true" />
          </div>
          <div className="cw-loc-feature-copy">
            <p className="cw-loc-eyebrow">Pick of the week</p>
            {featureNote ? <p className="cw-loc-pickline">{featureNote.pick}</p> : null}
            <h2 id="loc-feature">{feature.title}</h2>
            <p className="cw-loc-note">{featureNote?.note ?? feature.summary}</p>
            {featureNote?.dontMiss.length ? (
              <div className="cw-loc-dontmiss">
                <p>Don’t miss</p>
                <ul>{featureNote.dontMiss.map(d => <li key={d}><Check size={16} aria-hidden="true" />{d}</li>)}</ul>
              </div>
            ) : null}
            <p className="cw-loc-meta"><MapPin size={16} aria-hidden="true" />{feature.address}{featureNote?.since ? ` · ${featureNote.since}` : ''}</p>
            <Link className="cw-loc-btn" to={entityPath(feature)}>See the place <ArrowUpRight size={18} /></Link>
          </div>
          <DayPlan place={feature} links={linksFor.get(feature.id)!} />
        </section>
      ) : null}

      {book.length ? (
        <section className="cw-loc-book" aria-labelledby="loc-book">
          <div className="cw-loc-section-head">
            <h2 id="loc-book">{category ? `${cap(category)}, the locals’ way` : 'The little black book'}</h2>
            <p>Every place is checked against its own official site before it goes in.</p>
          </div>
          <p className="cw-loc-swipe" aria-hidden="true">Swipe the book <ArrowRight size={14} /> <span>{book.length} {book.length === 1 ? 'place' : 'places'}</span></p>
          <ul className="cw-loc-grid">
            {book.map((p, i) => {
              const note = LOCAL_NOTES[p.id];
              const quad = quadOf(p);
              return (
                <li key={p.id} className="cw-loc-card" style={{ ['--tilt' as string]: `${i % 2 ? 0.8 : -0.8}deg` }}>
                  <div className="cw-loc-card-box">
                    <Link to={entityPath(p)} className="cw-loc-card-main">
                      <span className="cw-loc-card-art">
                        <ShopArt id={p.id} title={p.title} tags={p.tags} categories={p.categories} />
                        {p.partner || p.editorialSelection ? <Stamp partner={p.partner} /> : null}
                      </span>
                      <span className="cw-loc-card-body">
                        {note ? <small className="cw-loc-pickline">{note.pick}</small> : null}
                        <strong>{p.title}</strong>
                        <span className="cw-loc-note">{note?.note ?? p.summary}</span>
                        {note?.dontMiss.length ? <span className="cw-loc-chips">{note.dontMiss.slice(0, 3).map(d => <i key={d}>{d}</i>)}</span> : null}
                        <span className="cw-loc-where"><MapPin size={14} aria-hidden="true" />{p.neighbourhood}{quad ? ` · ${quad}` : ''}{note?.since ? ` · ${note.since}` : ''}</span>
                      </span>
                    </Link>
                    <LinkRail links={linksFor.get(p.id)!} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : !feature ? <p className="cw-loc-empty">Nothing in this category yet. <Link to="/submit">Know a place we should add?</Link></p> : null}

      {!category ? <ServicesIndex places={everyPlace} /> : null}

      {!category && places.length > 1 ? (
        <section className="cw-loc-map" aria-labelledby="loc-map">
          <div className="cw-loc-section-head">
            <h2 id="loc-map">One in every corner of the city</h2>
            <p>Centre Street splits east from west; the Bow and Centre Avenue split north from south. Tap a quadrant for its neighbourhoods.</p>
          </div>
          <div className="cw-loc-quads">
            {(['NW', 'NE', 'SW', 'SE'] as const).map(q => {
              const here = places.filter(p => quadOf(p) === q);
              const hoodCount = hoods.filter(h => h.quadrant === q).length;
              return (
                <div key={q} className={`cw-loc-quad cw-loc-quad-${q.toLowerCase()}${here.length ? ' has' : ''}`} style={{ gridColumn: QUADRANT_BOX[q][0] + 1, gridRow: QUADRANT_BOX[q][1] + 1 }}>
                  <Link className="cw-loc-quad-label" to={`/neighbourhoods?quadrant=${q}`}>
                    <b>{q}</b>{hoodCount ? <small>{hoodCount} {hoodCount === 1 ? 'neighbourhood' : 'neighbourhoods'} <ArrowUpRight size={12} aria-hidden="true" /></small> : null}
                  </Link>
                  {here.map(p => (
                    <Link key={p.id} to={entityPath(p)} className="cw-loc-pin">
                      <MapPin size={18} aria-hidden="true" />
                      <span>{shortName(p.title)}<small>{p.neighbourhood}</small></span>
                    </Link>
                  ))}
                </div>
              );
            })}
            <span className="cw-loc-bow" aria-hidden="true" />
          </div>
        </section>
      ) : null}

      {placeGuides.length ? (
        <section className="cw-loc-guides" aria-labelledby="loc-guides">
          <div className="cw-loc-section-head">
            <h2 id="loc-guides">Walk them in a guide</h2>
            <p>Our routes pass these places. Follow one and the coffee stop is already planned.</p>
          </div>
          <ul className="cw-loc-guide-row">
            {placeGuides.map(g => {
              const stops = places.filter(p => linksFor.get(p.id)?.guides.some(x => x.id === g.id));
              return (
                <li key={g.id}>
                  <Link to={entityPath(g)} className="cw-loc-guide" style={g.cover ? { ['--from' as string]: g.cover.from, ['--to' as string]: g.cover.to, ['--gink' as string]: g.cover.ink } : undefined}>
                    <span className="cw-loc-guide-cover"><small>{g.cover?.label ?? 'Guide'}</small><strong>{g.title}</strong>{g.facts ? <em>{g.facts.time} · {g.facts.distance} · {g.facts.cost}</em> : null}</span>
                    <span className="cw-loc-guide-foot"><Footprints size={16} aria-hidden="true" />Passes {stops.map(p => shortName(p.title)).join(' and ')}<ArrowUpRight size={16} aria-hidden="true" /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="cw-loc-more" aria-labelledby="loc-more">
        <h2 id="loc-more">Keep exploring Calgary</h2>
        <div className="cw-loc-more-tiles">
          <Link to="/markets" className="cw-loc-more-tile cw-loc-more-markets"><ShoppingBasket size={26} aria-hidden="true" /><strong>Markets</strong><span>{upcomingMarkets ? `${upcomingMarkets} with dates coming up` : 'Farmers’ and makers’ markets'}</span></Link>
          <Link to="/neighbourhoods" className="cw-loc-more-tile cw-loc-more-hoods"><MapIcon size={26} aria-hidden="true" /><strong>Neighbourhoods</strong><span>{hoods.length ? `${hoods.length} areas, with how each is doing` : 'How each area is doing'}</span></Link>
          <Link to="/events" className="cw-loc-more-tile cw-loc-more-events"><Ticket size={26} aria-hidden="true" /><strong>Events</strong><span>{upcomingEvents ? `${upcomingEvents} coming up` : 'What’s on in the city'}</span></Link>
          <Link to="/guides" className="cw-loc-more-tile cw-loc-more-guides"><BookOpen size={26} aria-hidden="true" /><strong>Guides</strong><span>{guideCount ? `${guideCount} routes to follow` : 'Routes to follow'}</span></Link>
        </div>
      </section>

      <section className="cw-loc-pitch" aria-labelledby="loc-pitch">
        <div>
          <p className="cw-loc-eyebrow">For Calgary businesses</p>
          <h2 id="loc-pitch">Run a place Calgarians should know about?</h2>
          <p>Every place here gets an illustrated storefront, a pin on the city map, insider notes, and links to its neighbourhood, guides and nearby markets.</p>
        </div>
        <div className="cw-loc-paths">
          <div>
            <h3>Get picked</h3>
            <p className="cw-loc-price">Free</p>
            <p>Tell us about it. We check your details against your official site and write it up. Picks can’t be bought.</p>
            <Link className="cw-loc-btn cw-loc-btn-light" to="/submit">Suggest a place <ArrowUpRight size={18} /></Link>
          </div>
          <div>
            <h3>Featured partner</h3>
            <p className="cw-loc-price">Paid</p>
            <p>A top spot on this page with the same storefront treatment, always labelled “Featured partner” and kept separate from our picks.</p>
            <a className="cw-loc-btn" href="mailto:aldo@calgarywatch.ca?subject=Featured%20partner%20on%20CalgaryWatch%20Local">Talk to us <ArrowUpRight size={18} /></a>
          </div>
        </div>
      </section>
    </div>
  );
}
