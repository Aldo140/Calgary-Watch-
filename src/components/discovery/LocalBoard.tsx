import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Footprints, MapPin, Navigation } from 'lucide-react';
import type { Business, DiscoveryEntity, Event, Guide, Market, MarketOccurrence, Neighbourhood } from '../../types/discovery';
import { entityPath, LOCAL_CATEGORIES } from '../../lib/discovery';
import { hoodOf, localLinks, type LocalLinks } from '../../lib/localLinks';
import { LOCAL_NOTES } from '../../data/localNotes';
import { ShopArt } from './ListingArt';
import { LocalHero } from './LocalHero';
import { ServicesDirectory, ServicesIndex } from './LocalServices';
import { ComingUpBoard, ShelfDirectory, ShelfRibbon } from './LocalDirectory';
import { boardRows, programmeOf, shelfOf, type ShelfId } from '../../lib/localShelves';
import '../../styles/local-directory.css';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { byVerified } from '../../lib/verified';

const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });

/** Pins per quadrant before the rest fold into "+N more". */
const PINS = 3;

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
 * Local: CalgaryWatch's directory of profiles, the organizers and independents behind the
 * city, each on one shelf with what it has coming up. Picks are editorial and never sold;
 * a paid placement is always labelled "Featured partner" and never stamped a pick.
 */
export function LocalBoard({ items, all, occurrences, category }: { items: DiscoveryEntity[]; all: DiscoveryEntity[]; occurrences: readonly MarketOccurrence[]; category?: string }) {
  const [now] = useState(() => Date.now());
  const hoods = all.filter((e): e is Neighbourhood => e.kind === 'neighbourhood');
  const everyPlace = useMemo(() => all.filter((e): e is Business => e.kind === 'business'), [all]);
  const places = items.filter((e): e is Business => e.kind === 'business')
    .sort((a, b) => Number(b.partner) - Number(a.partner) || Number(b.editorialSelection) - Number(a.editorialSelection) || byVerified(a, b, now) || a.title.localeCompare(b.title));
  const linksFor = new Map(everyPlace.map(p => [p.id, localLinks(p, all, occurrences, LOCAL_NOTES[p.id], now)]));
  // The neighbourhood's quadrant, else the one in the street address ("1235 26 Avenue SE").
  const quadOf = (p: Business) => hoodOf(p, hoods)?.quadrant ?? p.address?.match(/\b(NW|NE|SW|SE)\b/)?.[1];
  const picks = places.filter(p => p.editorialSelection && !p.partner);
  const week = isoWeek(new Date());
  const feature = !category && picks.length ? picks[week % picks.length] : undefined;
  const featureNote = feature ? LOCAL_NOTES[feature.id] : undefined;
  const shelfOfId = useMemo(() => new Map(everyPlace.map(p => [p.id, shelfOf(p)])), [everyPlace]);
  const shelfCounts = new Map<ShelfId, number>();
  for (const p of places) shelfCounts.set(shelfOfId.get(p.id)!, (shelfCounts.get(shelfOfId.get(p.id)!) ?? 0) + 1);
  const programmes = useMemo(() => new Map(everyPlace.map(p => [p.id, programmeOf(p.id, all, occurrences, now)])), [everyPlace, all, occurrences, now]);
  const rows = boardRows(everyPlace, programmes);
  const totalDates = [...programmes.values()].reduce((n, x) => n + x.count, 0);
  const withDates = [...programmes.values()].filter(x => x.count).length;
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
      <LocalHero places={category ? places : everyPlace} category={category} counts={counts} areas={areas} shelfCounts={category ? undefined : shelfCounts} />
      <ShelfRibbon counts={shelfCounts} />
      {!category ? <ComingUpBoard rows={rows} now={now} shelfOfId={shelfOfId} stats={{ profiles: everyPlace.length, shelves: shelfCounts.size, dates: totalDates, organizers: withDates }} /> : null}

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

        {places.length ? <ShelfDirectory profiles={places} shelfOfId={shelfOfId} programmes={programmes} now={now} category={category} />
          : <p className="cw-loc-empty">Nothing in this category yet. <Link to="/submit">Know a place we should add?</Link></p>}
      </div>

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
                const here = places.filter(p => quadOf(p) === q && !p.tags.includes('outside-calgary'));
                const hoodCount = hoods.filter(h => h.quadrant === q).length;
                return (
                  <div key={q} className={`lx-quad lx-quad-${q.toLowerCase()}${here.length ? ' has' : ''}`} style={{ gridColumn: QUADRANT_BOX[q][0] + 1, gridRow: QUADRANT_BOX[q][1] + 1 }}>
                    <Link className="lx-quad-label" to={`/neighbourhoods?quadrant=${q}`}>
                      <b>{q}</b>{hoodCount ? <small>{hoodCount} {hoodCount === 1 ? 'neighbourhood' : 'neighbourhoods'} <ArrowUpRight size={12} aria-hidden="true" /></small> : null}
                    </Link>
                    <div className="lx-pins">
                      {here.slice(0, PINS).map(p => (
                        <Link key={p.id} to={entityPath(p)} className="lx-pin">
                          <span className="lx-pin-dot" aria-hidden="true"><MapPin size={16} /></span>
                          <span>{shortName(p.title)}<small>{p.neighbourhood}</small></span>
                        </Link>
                      ))}
                      {here.length > PINS ? <a className="lx-pin lx-pin-more" href="#ld-dir"><span>+{here.length - PINS} more<small>on the shelves</small></span></a> : null}
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

        <section className="lx-pitch ld-pitch" aria-labelledby="lx-pitch">
          <div className="lx-pitch-copy">
            <p className="lx-eyebrow lx-eyebrow-ink">For Calgary organizers and owners <span className="lx-free">Free</span></p>
            <h2 id="lx-pitch">Is one of these <em>yours?</em></h2>
            <p>Every profile is free. Claim yours and it becomes a verified organizer profile: you keep the details right, and every event and market you run carries your name.</p>
            <div className="lx-actions">
              <Link className="lx-btn" to="/partners">Claim your profile <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <Link className="lx-text-link" to="/submit">Suggest someone we’re missing</Link>
            </div>
          </div>
          <ol className="ld-steps">
            <li><b>01</b><h3>Find your profile</h3><p>Open it from the shelves above and press “Claim this listing”.</p></li>
            <li><b>02</b><h3>We check it’s you</h3><p>We check every claim by hand and match you to the organization.</p></li>
            <li><b>03</b><h3>Run it yourself</h3><p>Keep your dates, hours and links right yourself. Your events show “Verified organizer”.</p></li>
          </ol>
          <p className="ld-pitch-foot">Our picks can’t be bought. Paid placement is always labelled “Featured partner”. <a href="mailto:aldo@calgarywatch.ca?subject=Featured%20partner%20on%20CalgaryWatch%20Local">Ask about featured partner</a></p>
        </section>
      </div>
    </div>
  );
}
