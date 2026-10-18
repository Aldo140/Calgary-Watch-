import '../../styles/profile-category.css';
import '../../styles/local-directory.css';
import '../../styles/local-profile.css';
import { claimPresentation } from '../../lib/claimPresentation';
import { ListingArtwork } from '../entity/ListingArtwork';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Check, Clock, ExternalLink, Globe, Layers, MapPin, Navigation, Phone, Mail, Quote, Search, Share2, Store, Ticket } from 'lucide-react';
import type { Business, DiscoveryEntity, Event, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { organizerEvents, organizerMarkets, organizationVisitAddress, publicOrganizationEvents } from '../../lib/organizations';
import { localLinks } from '../../lib/localLinks';
import { communityFor, directionsUrl } from '../../lib/marketDays';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { LOCAL_NOTES } from '../../data/localNotes';
import { ShopArt } from './ListingArt';
import { LiveSky, SkyDateline, Traffic, Upper } from './LocalHero';
import { ClaimCta, VerifiedMark } from '../entity/ClaimCta';
import { SourceBadge } from '../entity/EntityDetail';
import { programmeOf, seriesOf, shelfOf, SHELVES } from '../../lib/localShelves';
import { CountUp, Seal, useSeen } from './LocalDirectory';
import { MarketLocations, MeanwhileBoard, NextUp, ProfileSpread, ProfileTabs, ShelfMates, type ProfileTab } from './ProfileSections';

const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
const short = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric' });
const mon = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short' });
const dnum = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', day: 'numeric' });
const wday = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short' });
const hm = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });

const quadrant = (address = '') => address.match(/\b(NW|NE|SW|SE)\b/)?.[1] ?? null;
const cleanAddress = (a = '') => a.replace(/,?\s*Calgary,?\s*AB.*$/i, '').replace(/,\s*AB$/, '');
const pad = (n: number) => String(n).padStart(2, '0');
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

const Go = () => <span className="lx-go" aria-hidden="true"><ArrowUpRight size={18} /></span>;

function useShare(title: string, text: string, url: string) {
  const [shared, setShared] = useState(false);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2500); }
    } catch { /* dismissed */ }
  };
  return { shared, share };
}

/** A street lamp beside the storefront; it glows after dark. */
function Lamp() {
  return (
    <svg className="lp-lamp" viewBox="0 0 60 300" aria-hidden="true" focusable="false">
      <circle className="lp-lamp-glow" cx="30" cy="34" r="30" />
      <path d="M26,60H34V296H26Z" fill="#151515" />
      <path d="M18,292H42V300H18Z" fill="#151515" />
      <path d="M14,50L30,18L46,50Z" fill="#151515" />
      <rect className="lp-lamp-bulb" x="20" y="36" width="20" height="16" rx="3" stroke="#151515" strokeWidth="3" />
    </svg>
  );
}

/**
 * One Local place, as its own storefront on its own street: under the live sky,
 * then our take, the essentials, its story, what's on there, how to make a day
 * of it, and the rest of the block next door. Paid placement is labelled, never a pick.
 */
export function LocalPlace({ place, all, occurrences }: { place: Business; all: readonly DiscoveryEntity[]; occurrences: readonly MarketOccurrence[] }) {
  const [now] = useState(() => Date.now());
  const upcoming = useMemo(() => organizerEvents(place.id, all, now), [place.id, all, now]);
  const markets = useMemo(() => organizerMarkets(place.id, all, now), [place.id, all, now]);
  const [eventSearch, setEventSearch] = useState('');
  const [eventDays, setEventDays] = useState(0);
  const [eventCount, setEventCount] = useState(8);
  useEffect(() => setEventCount(8), [eventSearch, eventDays, place.id]);
  const programme = useMemo(() => publicOrganizationEvents(upcoming, eventSearch, eventDays, now), [upcoming, eventSearch, eventDays, now]);
  // Repeat nights of one show read as one run with its dates underneath.
  const runs = useMemo(() => seriesOf(programme), [programme]);
  const ahead = useMemo(() => programmeOf(place.id, all, occurrences, now), [place.id, all, occurrences, now]);
  const shelf = SHELVES.find(s => s.id === shelfOf(place))!;
  const [glanceRef, glanceSeen] = useSeen<HTMLElement>(true);
  const presentation = claimPresentation(place);
  const hasVisitAddress = organizationVisitAddress(place.address);
  const url = `https://calgarywatch.ca${entityPath(place)}`;
  const { shared, share } = useShare(place.title, place.summary, url);
  // The phone's Visit dock appears once the hero's own buttons have scrolled away.
  const actions = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const el = actions.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setDocked(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const note = place.partner ? undefined : LOCAL_NOTES[place.id];
  const site = place.website || place.sources.find(s => s.kind === 'official')?.url;
  const season = place.socials.season;
  // Companies without a fixed season (Ghost River Theatre) point to their current projects instead.
  const experiences = place.socials.experiences;
  const q = quadrant(place.address);
  const [name, branch] = place.title.split(/\s+[—–]\s+/);
  const links = localLinks(place, all, occurrences, LOCAL_NOTES[place.id], now);
  const community = communityFor(place);
  const guide = links.guides[0];
  const hours = place.hours ? Object.entries(place.hours) : [];
  const status = place.partner ? 'Featured partner' : note?.pick ?? (place.editorialSelection ? 'Picked by CalgaryWatch' : `${place.categories[0] ? `${place.categories[0][0].toUpperCase()}${place.categories[0].slice(1)} · ` : ''}Local organization`);
  const spot = ahead.onNow ?? ahead.next;
  // A profile with nothing dated shows its shelf's board instead, unless it's a shop: nobody expects a coffee roaster's programme.
  const noDates = !upcoming.length && !markets.length && shelf.id !== 'coffee';
  // Each profile's number in the directory, A to Z, printed on its cover.
  const number = useMemo(() => all.filter(e => e.kind === 'business').sort((a, b) => a.title.localeCompare(b.title)).findIndex(e => e.id === place.id) + 1, [all, place.id]);
  const tabs: ProfileTab[] = [
    { id: 'lp-visitor-info', label: 'Overview' },
    ...(markets.length ? [{ id: 'lp-market-locations', label: 'Markets', count: markets.length }] : []),
    ...(upcoming.length ? [{ id: 'lp-programme', label: 'What’s on', count: upcoming.length }] : []),
    { id: 'lp-about', label: 'Story' },
    ...(noDates ? [{ id: 'lp-programme', label: 'What’s on' }] : []),
    { id: 'lp-around-here', label: 'Around here' },
    { id: 'lp-contact', label: 'Contact' },
  ];
  let n = 0;

  return (
    <div className="cw-loc lp" data-profile-category={presentation.key} style={{ ['--tone' as string]: shelf.tone, ['--tink' as string]: shelf.ink } as CSSProperties}>
      <LiveSky className="lp-hero" labelledBy="lp-title">
        {sky => <>
          <div className="cw-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <nav className="lp-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to="/local">Local</Link><span aria-hidden="true">/</span><span aria-current="page">{name}</span></nav>
              <SkyDateline sky={sky} where={place.neighbourhood || 'Calgary'} />
              <div className="lp-tags">
                <p className={`lp-status${place.partner ? ' is-partner' : ''}`}>{status}</p>
                <Link className="lp-shelf" to={`/local#shelf-${shelf.id}`}><Seal title={place.title} tone={shelf} size="s" />{shelf.label}</Link>
              </div>
              <h1 id="lp-title" className="lp-title">{name}{branch ? <em>{branch}</em> : null}</h1>
              <VerifiedMark entityId={place.id} verifiedAt={place.ownerVerifiedAt} />
              <p className="h-summary lp-lead">{place.summary}</p>
              <div className="lp-actions" ref={actions}>
                {upcoming.length ? <a className="lp-btn lp-btn-sun" href="#lp-programme"><CalendarDays size={17} aria-hidden="true" />What’s on</a> : markets.length ? <a className="lp-btn lp-btn-sun" href="#lp-market-locations"><Store size={17} aria-hidden="true" />Market locations</a> : null}
                {hasVisitAddress ? <a className="lp-btn" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer"><Navigation size={17} aria-hidden="true" />Directions</a> : null}
                {site ? <a className="lp-btn" href={site} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" />Their site</a> : null}
                <button type="button" className="lp-btn" onClick={() => void share()}>{shared ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />}{shared ? 'Link copied' : 'Share'}</button>
              </div>
            </div>
            <figure className="lp-building">
              <Lamp />
              <Upper floors={2} wall={shelf.tone} seed={place.id.length} night={sky.night} />
              <span className="lx-shop-front lp-front">
                <ShopArt id={place.id} title={place.title} tags={place.tags} categories={place.categories} />
              </span>
              {place.partner ? <span className="cw-loc-stamp cw-loc-stamp-partner">Featured partner</span>
                : place.editorialSelection ? <span className="cw-loc-stamp" aria-label="CalgaryWatch pick"><small>CalgaryWatch</small>Pick</span> : null}
              <figcaption className="lp-plate"><MapPin size={14} aria-hidden="true" />{hasVisitAddress ? cleanAddress(place.address) : 'Calgary organization'}</figcaption>
            </figure>
          </div>
          <div className="lx-road lp-road" aria-hidden="true"><Traffic /></div>
        </>}
      </LiveSky>

      <ProfileTabs tabs={tabs} tone={shelf} />
      <div className="cw-wrap lx-wrap">
        {note ? (
          <section className="lp-take" aria-labelledby="lp-take">
            <figure className="lp-quote">
              <Quote className="lp-quote-mark" size={64} aria-hidden="true" />
              <p className="lx-eyebrow lx-eyebrow-ink" id="lp-take">{note.pick}</p>
              <blockquote>{note.note}</blockquote>
              <figcaption>CalgaryWatch Local <span>Picked by us, never sold</span></figcaption>
            </figure>
            {note.dontMiss.length ? (
              <div className="lp-dontmiss">
                <p className="lx-eyebrow">Don’t miss</p>
                <ol>{note.dontMiss.map((d, i) => <li key={d} style={{ ['--k' as string]: i }}><b>{pad(i + 1)}</b><span>{d}</span></li>)}</ol>
              </div>
            ) : null}
          </section>
        ) : null}
        {place.partner ? <p className="lp-disclosure">Sponsored · {place.sponsorshipDisclosure || 'Featured partner placement. Payment does not imply editorial selection.'}</p> : null}

        <section id="lp-visitor-info" className="lp-essentials" aria-label="At a glance" ref={glanceRef} data-seen={glanceSeen || undefined}>
          <Link className="lp-fact lp-fact-shelf" to={`/local#shelf-${shelf.id}`}>
            <small><Layers size={14} aria-hidden="true" />On the shelf</small>
            <strong>{shelf.label}</strong>
            <span>{shelf.line}</span>
          </Link>
          {ahead.count ? <a className="lp-fact lp-fact-count" href={upcoming.length ? '#lp-programme' : '#lp-market-locations'}>
            <small><CalendarDays size={14} aria-hidden="true" />Coming up</small>
            <strong><b><CountUp to={ahead.count} on={glanceSeen} /></b> {ahead.count === 1 ? 'date' : 'dates'}</strong>
            <span>{[ahead.onNow ? 'On now' : null, ahead.next ? `Next: ${day.format(new Date(ahead.next.start))}` : null].filter(Boolean).join(' · ')}{runs.length > 1 ? ` · ${runs.length} listings` : ''}</span>
          </a> : null}
          {hasVisitAddress ? <a className="lp-fact lp-fact-where" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer">
            <small><MapPin size={14} aria-hidden="true" />Where</small>
            <strong>{cleanAddress(place.address)}</strong>
            <span>{[place.neighbourhood, q ? `${q} Calgary` : null, 'Get directions'].filter(Boolean).join(' · ')}</span>
          </a> : markets.length ? <a className="lp-fact" href="#lp-market-locations"><small><MapPin size={14} aria-hidden="true" />Locations</small><strong>{markets.length} {markets.length === 1 ? 'market' : 'markets'}</strong><span>{[...new Set(markets.map(m => m.neighbourhood || cleanAddress(m.address)).filter(Boolean))].slice(0, 3).join(' · ')}</span></a>
            : <div className="lp-fact"><small><MapPin size={14} aria-hidden="true" />Locations</small><strong>Check each event or market</strong><span>No single visitor address; each listing has its own.</span></div>}
          {note?.since ? <div className="lp-fact"><small><Store size={14} aria-hidden="true" />Since</small><strong>{note.since}</strong></div> : null}
          {place.phone || site || place.email ? <div className="lp-fact lp-fact-contact">
            <small><Phone size={14} aria-hidden="true" />Get in touch</small>
            <ul>
              {place.phone ? <li><a href={`tel:${place.phone.replace(/[^\d+]/g, '')}`}><Phone size={15} aria-hidden="true" />{place.phone}</a></li> : null}
              {site ? <li><a href={site} target="_blank" rel="noopener noreferrer"><Globe size={15} aria-hidden="true" />{host(site)}</a></li> : null}
              {place.email ? <li><a href={`mailto:${place.email}`}><Mail size={15} aria-hidden="true" />{place.email}</a></li> : null}
            </ul>
          </div> : null}
          {hours.length ? <div className="lp-fact lp-fact-hours"><small><Clock size={14} aria-hidden="true" />Hours</small><ul>{hours.slice(0, 3).map(([d, h]) => <li key={d}><b>{d}</b>{h}</li>)}</ul>{hours.length > 3 ? <span>More on their site</span> : null}</div> : null}
        </section>

        {spot ? <NextUp date={spot} now={now} count={ahead.count} onNow={spot === ahead.onNow} /> : null}

        {place.image?.presentation === 'poster' ? (
          <section className="lp-season-art" aria-labelledby="lp-season-art">
            <header>
              <p className="lx-eyebrow">From the company</p>
              <h2 id="lp-season-art">{place.id === 'biz-downstage' ? 'The 2026–27 season.' : 'Featured artwork.'}</h2>
              <p>{place.id === 'biz-downstage' ? 'Downstage’s season at a glance. Open the official season page for current dates, times and tickets.' : 'Artwork supplied or published by the organization.'}</p>
              {season ? <a className="lp-btn lp-btn-sun" href={season} target="_blank" rel="noopener noreferrer"><Ticket size={17} aria-hidden="true" />View the season</a> : null}
            </header>
            <ListingArtwork image={place.image} />
          </section>
        ) : null}


        {markets.length ? (
          <section id="lp-market-locations" className="lp-upcoming" aria-labelledby="lp-markets">
            <header className="lx-head"><div>
              <p className="lx-eyebrow">From this organization</p>
              <h2 id="lp-markets">Markets from <mark>{name}.</mark></h2>
            </div><p>{markets.length > 1 ? `${markets.length} locations, each with its own days.` : 'Its market days, directions and official information.'} Pick one for every date.</p></header>
            <MarketLocations markets={markets} occurrences={occurrences} now={now} />
          </section>
        ) : null}
        {upcoming.length ? (
          <section id="lp-programme" className="lp-upcoming" aria-labelledby="lp-upcoming">
            <header className="lx-head">
              <div>
                <p className="lx-eyebrow"><span className="lx-dot" aria-hidden="true" />From the official season</p>
                <h2 id="lp-upcoming">Upcoming events from <mark>{name}.</mark></h2>
              </div>
            </header>
            <div className="lp-programme-tools">
              <label className="lp-find"><Search size={17} aria-hidden="true" /><span className="lp-sr">Find an event</span><input type="search" value={eventSearch} placeholder="Find an event, venue or address" onChange={e => setEventSearch(e.target.value)} /></label>
              <div className="lp-when" role="group" aria-label="When">
                {([[0, 'All dates'], [7, 'Next 7 days'], [30, 'Next 30 days']] as const).map(([d, label]) => (
                  <button key={d} type="button" aria-pressed={eventDays === d} onClick={() => setEventDays(d)}>{label}</button>
                ))}
              </div>
            </div>
            <ul className="lp-dates lp-runs">
              {runs.slice(0, eventCount).map(run => {
                const e = run.dates[0];
                const last = run.dates[run.dates.length - 1];
                const on = Date.parse(e.start) < now;
                return (
                  <li key={e.id}>
                    <Link to={entityPath(e)}>
                      <time dateTime={e.start}><small>{wday.format(new Date(e.start))}</small><b>{dnum.format(new Date(e.start))}</b><small>{mon.format(new Date(e.start))}</small></time>
                      <span><strong>{run.title}</strong><em>{on ? <i className="lp-on">On now</i> : null}{run.dates.length > 1 ? `${run.dates.length} dates · ${short.format(new Date(e.start))} to ${short.format(new Date(last.start))}` : e.schedulePrecision === 'date' ? 'Check official showtimes' : hm.format(new Date(e.start))}{e.venue ? ` · ${e.venue}` : ''}</em></span>
                      <Go />
                    </Link>
                    {run.dates.length > 1 ? (
                      <ol className="lp-run-dates" aria-label={`Every date for ${run.title}`}>
                        {run.dates.slice(0, 10).map(d => <li key={d.id}><Link to={entityPath(d)}><b>{wday.format(new Date(d.start))} {dnum.format(new Date(d.start))}</b>{d.schedulePrecision === 'date' ? null : <small>{hm.format(new Date(d.start))}</small>}</Link></li>)}
                        {run.dates.length > 10 ? <li className="lp-run-more">+{run.dates.length - 10} more</li> : null}
                      </ol>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="lp-programme-footer"><p role="status">{programme.length ? `${programme.length} ${programme.length === 1 ? 'date' : 'dates'} across ${runs.length} ${runs.length === 1 ? 'listing' : 'listings'}${runs.length > eventCount ? `, showing the first ${eventCount}` : ''}` : 'No matching events. Try another search or all dates.'}</p>{runs.length > eventCount ? <button type="button" className="lp-btn" onClick={() => setEventCount(count => count + 8)}>Show more</button> : null}</div>
          </section>
        ) : null}

        <ProfileSpread place={place} name={name} shelf={shelf} number={number} quadrant={q} since={note?.since}
          links={season || experiences ? <p className="lp-spread-links">
            {season ? <a className="lx-text-link lp-season" href={season} target="_blank" rel="noopener noreferrer"><Ticket size={15} aria-hidden="true" /> Current season and tickets</a> : null}
            {experiences ? <a className="lx-text-link lp-season" href={experiences} target="_blank" rel="noopener noreferrer"><Ticket size={15} aria-hidden="true" /> Current and upcoming experiences</a> : null}
          </p> : null} />

        {noDates ? <MeanwhileBoard place={place} shelf={shelf} site={site} siteLabel={site ? host(site) : undefined} all={all} occurrences={occurrences} now={now} /> : null}

        <section id="lp-around-here" className="lp-around" aria-labelledby="lp-around">
          <header className="lx-head">
            <div>
              <p className="lx-eyebrow">{place.neighbourhood ? `Around ${place.neighbourhood}` : 'Around here'}</p>
              <h2 id="lp-around">Make a <mark>day of it.</mark></h2>
            </div>
            <p>What’s next door, what’s on nearby, and how the area is doing before you head out.</p>
          </header>
          <div className="lp-around-tiles">
            {links.hood ? (
              <Link to={entityPath(links.hood)} className="lx-tile lx-tile-sun">
                <small>{pad(++n)} · The neighbourhood</small>
                <strong>Inside {links.hood.title}</strong>
                <span>Places, plans and what’s new around {name}</span>
                <Go />
              </Link>
            ) : null}
            {links.next ? (
              <Link to={links.next.path} className="lx-tile lx-tile-cyan">
                <small>{pad(++n)} · {links.next.here ? 'Market here' : links.next.kind === 'market' ? 'Market nearby' : 'On nearby'}</small>
                <strong>{links.next.title}</strong>
                <span className="lx-tile-date"><CalendarDays size={15} aria-hidden="true" />{day.format(new Date(links.next.start))}</span>
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
            {community ? (
              <Link to={`/check-your-community?c=${community.slug}`} className="lx-tile">
                <small>{pad(++n)} · Safety</small>
                <strong>How {community.name} ranks</strong>
                <span>Its 311 reports against every Calgary community</span>
                <Go />
              </Link>
            ) : null}
            <Link to={`/local#shelf-${shelf.id}`} className="lx-tile lp-tile-shelf">
              <small>{pad(++n)} · On Local</small>
              <strong>More {shelf.label.toLowerCase()}</strong>
              <span>{shelf.line}</span>
              <Go />
            </Link>
            <Link to="/map" className="lx-tile lx-tile-navy">
              <small>{pad(++n)} · Live</small>
              <strong>Check the live map</strong>
              <span>Traffic, weather and reports before you head out</span>
              <Go />
            </Link>
          </div>
        </section>
      </div>

      <ShelfMates place={place} all={all} occurrences={occurrences} now={now} />

      <div id="lp-contact" className="cw-wrap lp-foot">
        <SourceBadge entity={place} />
        <ClaimCta entityId={place.id} title={place.title} kind="business" verifiedAt={place.ownerVerifiedAt} />
      </div>

      <div className="lp-dock" role="group" aria-label="Visit" data-show={docked || undefined}>
        {hasVisitAddress ? <a href={directionsUrl(place)} target="_blank" rel="noopener noreferrer" className="is-main"><Navigation size={18} aria-hidden="true" /> Directions</a> : upcoming.length ? <a href="#lp-programme" className="is-main"><CalendarDays size={18} aria-hidden="true" /> Events</a> : markets.length ? <a href="#lp-market-locations" className="is-main"><Store size={18} aria-hidden="true" /> Markets</a> : null}
        {site ? <a href={site} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} aria-hidden="true" /> Site</a> : null}
        <button type="button" onClick={() => void share()}>{shared ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />} {shared ? 'Copied' : 'Share'}</button>
      </div>
    </div>
  );
}
