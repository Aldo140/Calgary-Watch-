import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Footprints, MapPin, Navigation } from 'lucide-react';
import type { Business, DiscoveryEntity, Event, Guide, Market, MarketOccurrence, Neighbourhood } from '../../types/discovery';
import { entityPath, LOCAL_CATEGORIES } from '../../lib/discovery';
import { hoodOf, localLinks, type LocalLinks } from '../../lib/localLinks';
import { LOCAL_NOTES } from '../../data/localNotes';
import { ShopArt } from './ListingArt';
import { LocalHero } from './LocalHero';
import { ServicesDirectory, ServicesIndex } from './LocalServices';
import { TEAR } from '../home/HomeHero';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';

const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });

const QUADRANT_BOX: Record<string, [number, number]> = { NW: [0, 0], NE: [1, 0], SW: [0, 1], SE: [1, 1] };

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

const shortName = (title: string) => title.split(/\s+[—–-]\s+/)[0];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const pad = (n: number) => String(n).padStart(2, '0');
const directions = (p: Business) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.title}, ${p.address}`)}`;

function Stamp({ partner }: { partner?: boolean }) {
  return partner
    ? <span className="cw-loc-stamp cw-loc-stamp-partner">Featured partner</span>
    : <span className="cw-loc-stamp" aria-label="CalgaryWatch pick"><small>CalgaryWatch</small>Pick</span>;
}

function nextLabel(n: NonNullable<LocalLinks['next']>) {
  return n.here ? 'Market here' : n.kind === 'market' ? 'Market nearby' : 'On nearby';
}

/** A round arrow, as on the homepage cards. */
const Go = () => <span className="lx-go" aria-hidden="true"><ArrowUpRight size={18} /></span>;

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

/** "Make a day of it": the pick's links as homepage-style tiles. */
function DayPlan({ place, links }: { place: Business; links: LocalLinks }) {
  const guide = links.guides[0];
  if (!links.hood && !links.next && !guide) return null;
  let n = 0;
  return (
    <div className="lx-day">
      <p className="lx-eyebrow">Make a day of it</p>
      <div className="lx-day-tiles">
        {links.hood ? (
          <Link to={entityPath(links.hood)} className="lx-tile lx-tile-sun">
            <small>{pad(++n)} · The neighbourhood</small>
            <strong>Inside {links.hood.title}</strong>
            <span>What’s around {shortName(place.title)}, and how the area’s doing</span>
            <Go />
          </Link>
        ) : null}
        {links.next ? (
          <Link to={links.next.path} className="lx-tile lx-tile-cyan">
            <small>{pad(++n)} · {nextLabel(links.next)}</small>
            <strong>{links.next.title}</strong>
            <span className="lx-tile-date"><CalendarDays size={15} aria-hidden="true" />{day.format(new Date(links.next.start))} · {links.next.here ? 'held right here' : `a short hop from ${shortName(place.title)}`}</span>
            <Go />
          </Link>
        ) : null}
        {guide ? (
          <Link to={entityPath(guide)} className="lx-tile lx-tile-guide" style={guide.cover ? { ['--from' as string]: guide.cover.from, ['--to' as string]: guide.cover.to, ['--gink' as string]: guide.cover.ink } : undefined}>
            <small>{pad(++n)} · Walk it</small>
            <strong>{guide.title}</strong>
            <span>{guide.facts ? `${guide.facts.time} · ${guide.facts.distance}` : 'A CalgaryWatch guide'}</span>
            <Go />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** The four quadrants, drawn as a little paper map with the Bow and Elbow running through. */
function QuadMap() {
  return (
    <svg className="lx-map-art" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="lx-map-river" d="M-20,250C90,215 180,300 300,262S470,190 560,236S700,300 790,268S930,214 1020,240" />
      <path className="lx-map-river lx-map-elbow" d="M690,580C700,500 640,440 660,380S640,300 600,252" />
      <path className="lx-map-axis" d="M500,0V560M0,280H1000" />
      <circle className="lx-map-centre" cx="500" cy="280" r="9" />
    </svg>
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
  const week = isoWeek(new Date());
  const feature = !category && picks.length ? picks[week % picks.length] : undefined;
  const featureNote = feature ? LOCAL_NOTES[feature.id] : undefined;
  const book = places.filter(p => p !== feature);
  const counts: Record<string, number> = { all: everyPlace.length };
  for (const c of LOCAL_CATEGORIES) counts[c] = everyPlace.filter(p => p.categories.includes(c)).length;
  const areas = new Set(everyPlace.map(p => p.neighbourhood).filter(Boolean)).size;

  // Guides that pass a Local place or its neighbourhood, and the rest of the site to keep going.
  const placeGuides = [...new Map(places.flatMap(p => linksFor.get(p.id)?.guides ?? []).map(g => [g.id, g])).values()];
  const upcomingMarkets = all.filter((e): e is Market => e.kind === 'market' && occurrences.some(o => o.marketId === e.id && !o.cancelled && Date.parse(o.end) > now)).length;
  const upcomingEvents = all.filter((e): e is Event => e.kind === 'event' && !e.cancelled && Date.parse(e.end) > now).length;
  const guideCount = all.filter((e): e is Guide => e.kind === 'guide').length;

  return (
    <div className="cw-loc">
      <LocalHero places={category ? places : everyPlace} category={category} counts={counts} areas={areas} />

      <div className="cw-wrap lx-wrap">
        {category === 'services' ? <ServicesDirectory places={everyPlace} /> : null}

        {feature ? (
          <section className="lx-pick" aria-labelledby="lx-pick">
            <header className="lx-head">
              <div>
                <p className="lx-eyebrow"><span className="lx-dot" aria-hidden="true" />Pick of the week · Week {week}</p>
                <h2 id="lx-pick">This week, go to <mark>{shortName(feature.title)}.</mark></h2>
              </div>
              <p>One place a week, chosen by us and checked against its own site. Nobody pays to be here.</p>
            </header>
            <article className="lx-pick-card">
              <div className="lx-pick-art">
                <ShopArt id={feature.id} title={feature.title} tags={feature.tags} categories={feature.categories} />
                <Stamp />
                {featureNote?.since ? <span className="lx-since">{featureNote.since}</span> : null}
              </div>
              <div className="lx-pick-copy">
                {featureNote ? <p className="lx-pickline">{featureNote.pick}</p> : null}
                <h3>{feature.title}</h3>
                <p className="lx-pick-note">{featureNote?.note ?? feature.summary}</p>
                {featureNote?.dontMiss.length ? (
                  <div className="lx-dontmiss">
                    <p className="lx-eyebrow">Don’t miss</p>
                    <ol>{featureNote.dontMiss.map((d, i) => <li key={d}><b>{pad(i + 1)}</b>{d}</li>)}</ol>
                  </div>
                ) : null}
                <p className="lx-meta"><MapPin size={16} aria-hidden="true" />{feature.address}</p>
                <div className="lx-actions">
                  <Link className="lx-btn" to={entityPath(feature)}>See the place <ArrowUpRight size={18} aria-hidden="true" /></Link>
                  <a className="lx-btn lx-btn-ghost" href={directions(feature)} target="_blank" rel="noopener noreferrer"><Navigation size={16} aria-hidden="true" />Directions</a>
                </div>
              </div>
            </article>
            <DayPlan place={feature} links={linksFor.get(feature.id)!} />
          </section>
        ) : null}
      </div>

      {book.length ? (
        <section className="lx-book" aria-labelledby="lx-book">
          <svg className="lx-edge lx-edge-top" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={TEAR} /></svg>
          <div className="cw-wrap">
            <header className="lx-head lx-head-dark">
              <div>
                <p className="lx-eyebrow"><span className="lx-dot" aria-hidden="true" />{book.length} {book.length === 1 ? 'place' : 'places'} · {category ? cap(category) : 'Every quadrant'}</p>
                <h2 id="lx-book">{category ? <>{cap(category)}, <mark>the locals’ way.</mark></> : <>The little <mark>black book.</mark></>}</h2>
              </div>
              <p>Where we’d send a friend. Every place is checked against its own official site before it goes in.</p>
            </header>
            <p className="lx-swipe" aria-hidden="true">Swipe the book <ArrowUpRight size={14} /></p>
            <ul className={`lx-grid${book.length % 3 === 2 ? ' lx-grid-bento' : ''}`}>
              {book.map((p, i) => {
                const note = LOCAL_NOTES[p.id];
                const quad = quadOf(p);
                return (
                  <li key={p.id} className="lx-card">
                    <Link to={entityPath(p)} className="lx-card-main">
                      <span className="lx-card-art">
                        <ShopArt id={p.id} title={p.title} tags={p.tags} categories={p.categories} />
                        <span className="lx-card-num">{pad(i + 1)}</span>
                        {p.partner || p.editorialSelection ? <Stamp partner={p.partner} /> : null}
                      </span>
                      <span className="lx-card-body">
                        <small className="lx-pickline">{note ? note.pick : `${cap(p.categories[0] ?? 'local')} · ${p.neighbourhood}`}</small>
                        <strong>{p.title}</strong>
                        <span className="lx-card-note">{note?.note ?? p.summary}</span>
                        {note?.dontMiss.length ? <span className="lx-chips">{note.dontMiss.slice(0, 3).map(d => <i key={d}>{d}</i>)}</span> : null}
                        <span className="lx-where"><MapPin size={14} aria-hidden="true" />{p.neighbourhood}{quad ? ` · ${quad}` : ''}{note?.since ? ` · ${note.since}` : ''}</span>
                      </span>
                    </Link>
                    <LinkRail links={linksFor.get(p.id)!} />
                  </li>
                );
              })}
            </ul>
          </div>
          <svg className="lx-edge lx-edge-bottom" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={TEAR} /></svg>
        </section>
      ) : !feature ? <div className="cw-wrap"><p className="cw-loc-empty">Nothing in this category yet. <Link to="/submit">Know a place we should add?</Link></p></div> : null}

      <div className="cw-wrap lx-wrap">
        {!category ? <ServicesIndex places={everyPlace} /> : null}

        {!category && places.length > 1 ? (
          <section className="lx-map" aria-labelledby="lx-map">
            <header className="lx-head">
              <div>
                <p className="lx-eyebrow">The map</p>
                <h2 id="lx-map">One in every <mark>corner of the city.</mark></h2>
              </div>
              <p>Centre Street splits east from west; the Bow and Centre Avenue split north from south. Tap a quadrant for its neighbourhoods.</p>
            </header>
            <div className="lx-quads">
              <QuadMap />
              {(['NW', 'NE', 'SW', 'SE'] as const).map(q => {
                const here = places.filter(p => quadOf(p) === q);
                const hoodCount = hoods.filter(h => h.quadrant === q).length;
                return (
                  <div key={q} className={`lx-quad lx-quad-${q.toLowerCase()}${here.length ? ' has' : ''}`} style={{ gridColumn: QUADRANT_BOX[q][0] + 1, gridRow: QUADRANT_BOX[q][1] + 1 }}>
                    <Link className="lx-quad-label" to={`/neighbourhoods?quadrant=${q}`}>
                      <b>{q}</b>{hoodCount ? <small>{hoodCount} {hoodCount === 1 ? 'neighbourhood' : 'neighbourhoods'} <ArrowUpRight size={12} aria-hidden="true" /></small> : null}
                    </Link>
                    <div className="lx-pins">
                      {here.map(p => (
                        <Link key={p.id} to={entityPath(p)} className="lx-pin">
                          <span className="lx-pin-dot" aria-hidden="true"><MapPin size={16} /></span>
                          <span>{shortName(p.title)}<small>{p.neighbourhood}</small></span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="lx-map-foot" aria-hidden="true">Centre St &amp; Centre Ave, where the quadrants meet</p>
            </div>
          </section>
        ) : null}

        {placeGuides.length ? (
          <section className="lx-guides" aria-labelledby="lx-guides">
            <header className="lx-head">
              <div>
                <p className="lx-eyebrow">On foot</p>
                <h2 id="lx-guides">Walk them <mark>in a guide.</mark></h2>
              </div>
              <p>Our routes pass these places. Follow one and the coffee stop is already planned.</p>
            </header>
            <ul className="lx-guide-row">
              {placeGuides.map(g => {
                const stops = places.filter(p => linksFor.get(p.id)?.guides.some(x => x.id === g.id));
                return (
                  <li key={g.id}>
                    <Link to={entityPath(g)} className="lx-guide" style={g.cover ? { ['--from' as string]: g.cover.from, ['--to' as string]: g.cover.to, ['--gink' as string]: g.cover.ink } : undefined}>
                      <span className="lx-guide-cover"><small>{g.cover?.label ?? 'Guide'}</small><strong>{g.title}</strong>{g.facts ? <em>{g.facts.time} · {g.facts.distance} · {g.facts.cost}</em> : null}<Go /></span>
                      <span className="lx-guide-foot"><Footprints size={16} aria-hidden="true" />Passes {stops.map(p => shortName(p.title)).join(' and ')}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="lx-more" aria-labelledby="lx-more">
          <header className="lx-head">
            <div>
              <p className="lx-eyebrow">Keep going</p>
              <h2 id="lx-more">The rest of <mark>the city.</mark></h2>
            </div>
          </header>
          <div className="lx-more-tiles">
            <Link to="/markets" className="lx-tile lx-tile-sun lx-tile-awning"><small>01</small><strong>Markets</strong><span>{upcomingMarkets ? `${upcomingMarkets} with dates coming up` : 'Farmers’ and makers’ markets'}</span><Go /></Link>
            <Link to="/events" className="lx-tile lx-tile-cyan"><small>02</small><strong>Events</strong><span>{upcomingEvents ? `${upcomingEvents} coming up` : 'What’s on in the city'}</span><Go /></Link>
            <Link to="/neighbourhoods" className="lx-tile"><small>03</small><strong>Neighbourhoods</strong><span>{hoods.length ? `${hoods.length} areas, with how each is doing` : 'How each area is doing'}</span><Go /></Link>
            <Link to="/guides" className="lx-tile lx-tile-lilac"><small>04</small><strong>Guides</strong><span>{guideCount ? `${guideCount} routes to follow` : 'Routes to follow'}</span><Go /></Link>
          </div>
        </section>

        <section className="lx-pitch" aria-labelledby="lx-pitch">
          <div className="lx-pitch-copy">
            <p className="lx-eyebrow lx-eyebrow-ink">For Calgary businesses <span className="lx-free">Free</span></p>
            <h2 id="lx-pitch">Run a place Calgarians <em>should know about?</em></h2>
            <p>Every place here gets an illustrated storefront, a spot on this street, insider notes, and links to its neighbourhood, guides and nearby markets.</p>
            <div className="lx-actions">
              <Link className="lx-btn" to="/submit">Suggest a place <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <a className="lx-text-link" href="mailto:aldo@calgarywatch.ca?subject=Featured%20partner%20on%20CalgaryWatch%20Local">Ask about featured partner</a>
            </div>
          </div>
          <div className="lx-paths">
            <div className="lx-path lx-path-pick">
              <span className="lx-path-badge">Free</span>
              <h3>Get picked</h3>
              <p>We check your details against your official site and write it up. Picks can’t be bought.</p>
            </div>
            <div className="lx-path lx-path-partner">
              <span className="lx-path-badge">Paid</span>
              <h3>Featured partner</h3>
              <p>A top spot with the same storefront, always labelled “Featured partner” and kept apart from our picks.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
