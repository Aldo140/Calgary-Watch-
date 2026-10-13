import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, CalendarPlus, Check, Clock, ExternalLink, Map as MapIcon, MapPin, Navigation, Phone, Quote,
  Share2, ShieldCheck, Sparkles, Store, Tag, Ticket, User,
} from 'lucide-react';
import type { Business, DiscoveryEntity, Event } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { googleCalendarUrl, icsFile } from '../../lib/calendarFile';
import { interestLabel, interestsFor, pickWhen, type EventInterestId } from '../../lib/eventPicks';
import { communityFor, directionsUrl, eventsSameDay, neighbourhoodFor } from '../../lib/marketDays';
import { LOCAL_NOTES } from '../../data/localNotes';
import { EventArt, ShopArt } from '../discovery/ListingArt';
import { TEAR } from '../home/HomeHero';
import { ClaimCta, VerifiedMark } from './ClaimCta';
import { SourceBadge } from './EntityDetail';
import { GoingButton } from '../plans/GoingButton';
import { ThursdayNudge } from '../plans/ThursdayNudge';
import '../../styles/home.css';
import '../../styles/home-board.css';
import '../../styles/markets.css';
import '../../styles/plans.css';
import '../../styles/listing-detail.css';

const dayLong = calgaryDateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
const dayKey = calgaryDateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
const weekday = calgaryDateTimeFormat('en-CA', { weekday: 'long' });
const time = calgaryDateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' });
const quadrant = (address = '') => address.match(/\b(NW|NE|SW|SE)\b/)?.[1] ?? null;
const cleanAddress = (a = '') => a.replace(/,?\s*Calgary,?\s*AB.*$/i, '').replace(/,\s*AB$/, '');

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

/** The navy hero every listing page opens on: status, title, where, the actions, and the art. */
function Hero({ crumb, status, live, title, verifiedId, lead, where, actions, art }: {
  crumb: { to: string; label: string; current: string }; status: ReactNode; live?: boolean; title: string; verifiedId: string;
  lead: string; where: ReactNode; actions: ReactNode; art: ReactNode;
}) {
  return (
    <section className={`mk-dhero ld-hero${live ? ' is-open' : ''}`} aria-labelledby="ld-title">
      <div className="cw-wrap mk-dhero-in">
        <nav className="mk-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to={crumb.to}>{crumb.label}</Link><span aria-hidden="true">/</span><span aria-current="page">{crumb.current}</span></nav>
        <div className="mk-dhero-copy">
          <p className={`mk-status${live ? ' is-open' : ''}`}>{status}</p>
          <h1 id="ld-title">{title}</h1>
          <VerifiedMark entityId={verifiedId} />
          {lead ? <p className="mk-dlead">{lead}</p> : null}
          <p className="mk-dwhere">{where}</p>
          <div className="mk-dactions">{actions}</div>
        </div>
        <figure className="mk-dart ld-art">{art}</figure>
      </div>
      <svg className="h-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={TEAR} transform="translate(0 -5)" className="h-tear-shade" />
        <path d={TEAR} className="h-tear-paper" />
      </svg>
    </section>
  );
}

/** The "around here" card: the neighbourhood page, how the community ranks, and the live map. */
function Around({ place, all, title }: { place: Pick<Event, 'title' | 'venue' | 'neighbourhood' | 'address'>; all: readonly DiscoveryEntity[]; title: string }) {
  const hood = neighbourhoodFor(place, all);
  const community = communityFor(place);
  const q = quadrant(place.address);
  return (
    <div className="mk-side-card mk-around">
      <p className="mk-side-kicker"><MapIcon size={15} aria-hidden="true" /> {title}</p>
      <p className="ld-address"><b>{place.venue || place.title}</b><span>{cleanAddress(place.address)}{place.neighbourhood ? ` · ${place.neighbourhood}` : ''}{q ? ` ${q}` : ''}</span></p>
      <a className="mk-btn mk-btn-ink mk-wide" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer"><Navigation size={16} aria-hidden="true" /> Get directions</a>
      <ul>
        {hood ? <li><Link to={entityPath(hood.hood)}><b>{hood.nearby ? `Next door: ${hood.hood.title}` : hood.hood.title}</b><span>Places, plans and what’s new {hood.nearby ? 'a short walk away' : 'in the neighbourhood'}</span><ArrowUpRight size={16} aria-hidden="true" /></Link></li> : null}
        {community ? <li><Link to={`/check-your-community?c=${community.slug}`}><b><ShieldCheck size={15} aria-hidden="true" /> How {community.name} ranks</b><span>Its 311 reports against every Calgary community</span><ArrowUpRight size={16} aria-hidden="true" /></Link></li> : null}
        <li><Link to="/map"><b>Live map</b><span>Traffic, weather and reports before you head out</span><ArrowUpRight size={16} aria-hidden="true" /></Link></li>
      </ul>
    </div>
  );
}

function Rows({ items }: { items: Event[] }) {
  return (
    <ul className="mk-same">
      {items.map(e => (
        <li key={e.id}><Link to={entityPath(e)}><time dateTime={e.start}>{pickWhen(e.start)}</time><strong>{e.title}</strong><span>{e.venue || e.neighbourhood}{e.pricing === 'free' ? <em className="mk-free">Free</em> : null}</span><ArrowUpRight size={17} aria-hidden="true" /></Link></li>
      ))}
    </ul>
  );
}

/**
 * One event's page, on the same board as a market's: is it on and when, what
 * it costs, how to get the tickets or the details, then what else is on that
 * day and nearby, so a visit that lands here from search has somewhere to go.
 */
export function EventDetail({ event, all }: { event: Event; all: readonly DiscoveryEntity[] }) {
  const [now] = useState(() => Date.now());
  const url = `https://calgarywatch.ca${entityPath(event)}`;
  const { shared, share } = useShare(event.title, `${event.title}, ${pickWhen(event.start)}`, url);
  const start = new Date(event.start), end = new Date(event.end);
  const past = end.getTime() <= now;
  const on = !past && start.getTime() <= now && !event.cancelled;
  const today = dayKey.format(start) === dayKey.format(new Date(now));
  const sameDay = dayKey.format(start) === dayKey.format(end);
  const status = event.cancelled ? 'Cancelled by the organizer' : past ? 'This event has finished'
    : on ? `On now · until ${time.format(end)}` : `${today ? 'Today' : dayLong.format(start)} · ${time.format(start)}`;
  const price = event.cancelled ? 'Cancelled' : event.pricing === 'free' ? 'Free' : event.priceRange ? `$${event.priceRange[0]}${event.priceRange[1] !== event.priceRange[0] ? `–$${event.priceRange[1]}` : ''}` : event.pricing === 'paid' ? 'Ticketed' : 'Check with the organizer';
  const cal = { id: event.id, title: event.title, start: event.start, end: event.end, location: [event.venue, event.address].filter(Boolean).join(', '), description: event.summary, url };
  const organizerSite = event.sources.find(s => s.kind === 'official')?.url ?? event.sources[0]?.url;
  const interests: EventInterestId[] = interestsFor(event).filter(i => i !== 'free');
  const open = !past && !event.cancelled;
  const photo = /^https:\/\//.test(event.image?.src ?? '') ? event.image : undefined;

  const alsoOn = eventsSameDay(event.start, all.filter(e => e.id !== event.id), event.neighbourhood, 4);
  const seen = new Set([event.id, ...alsoOn.map(e => e.id)]);
  const more = all
    .filter((e): e is Event => e.kind === 'event' && !seen.has(e.id) && !e.cancelled && Date.parse(e.end) > now)
    .map(e => ({ e, score: interestsFor(e).filter(i => interests.includes(i)).length * 2 + (e.neighbourhood && e.neighbourhood === event.neighbourhood ? 1 : 0) + (e.title === event.title ? -3 : 0) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(a.e.start) - Date.parse(b.e.start))
    .slice(0, 4).map(x => x.e);

  const download = () => {
    const blob = new Blob([icsFile(cal)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${event.slug}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const primary = event.tickets
    ? <a className="mk-btn mk-btn-sun" href={event.tickets} target="_blank" rel="noopener noreferrer"><Ticket size={17} aria-hidden="true" /> {event.pricing === 'free' ? 'Register' : 'Get tickets'}</a>
    : organizerSite ? <a className="mk-btn mk-btn-sun" href={organizerSite} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" /> Organizer’s page</a> : null;

  return (
    <div className="mk mk-detail cw-home2 ld">
      <Hero
        crumb={{ to: '/events', label: 'Events', current: event.title }}
        status={<>{on ? <span className="cw-lb-pulse mk-pulse" aria-hidden="true" /> : <Clock size={15} aria-hidden="true" />}{status}</>}
        live={on}
        title={event.title}
        verifiedId={event.id}
        lead={event.summary && event.summary !== event.title && !event.summary.startsWith(`${event.title}, listed by`) ? event.summary : ''}
        where={<><MapPin size={16} aria-hidden="true" />{event.venue || event.neighbourhood || cleanAddress(event.address)}{event.venue && event.neighbourhood ? `, ${event.neighbourhood}` : ''}<span className={`mk-tag is-light${event.pricing === 'free' ? ' ld-free' : ''}`}>{price}</span></>}
        actions={open ? <>
          {primary}
          <button type="button" className="mk-btn" onClick={download}><CalendarPlus size={17} aria-hidden="true" /> Add to calendar</button>
          <button type="button" className="mk-btn" onClick={() => void share()}>{shared ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />} {shared ? 'Link copied' : 'Share'}</button>
        </> : <Link className="mk-btn mk-btn-sun" to="/events">See what’s on instead <ArrowRight size={17} aria-hidden="true" /></Link>}
        art={photo ? <img className="ld-photo" src={photo.src} alt={photo.alt} width="1200" height="677" /> : <EventArt id={event.id} title={event.title} categories={event.categories} />}
      />

      <div className="cw-wrap mk-page mk-dgrid">
        <div className="mk-dmain">
          <dl className="mk-facts">
            <div><dt><Clock size={16} aria-hidden="true" /> When</dt><dd>{dayLong.format(start)}<span>{time.format(start)}{event.endTimeEstimated ? '' : ` – ${sameDay ? '' : `${dayLong.format(end)}, `}${time.format(end)}`}</span></dd></div>
            <div><dt><MapPin size={16} aria-hidden="true" /> Where</dt><dd>{event.venue || event.neighbourhood || 'See the organizer'}<span>{cleanAddress(event.address)}</span></dd></div>
            <div><dt><Tag size={16} aria-hidden="true" /> Price</dt><dd>{price}{event.pricing === 'unknown' ? <span>Not listed yet</span> : null}</dd></div>
            <div><dt><User size={16} aria-hidden="true" /> Organizer</dt><dd>{event.organizer}</dd></div>
          </dl>

          {open && !event.developmentOnly ? <div className="ld-going"><GoingButton eventId={event.id} start={event.start} /></div> : null}

          <section className="mk-dsec mk-about" aria-labelledby="ld-about">
            <header className="mk-sec-head"><h2 id="ld-about"><span>What to expect</span></h2></header>
            <p>{event.description}</p>
            {interests.length ? <p className="mk-amenities">{interests.map(i => <Link key={i} className="mk-tag" to={`/events?filter=${i === 'outdoors' ? 'outdoor' : i === 'learning' ? 'talks' : i}`}>{interestLabel(i)}</Link>)}</p> : null}
            {organizerSite ? <a className="mk-organizer" href={organizerSite} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> {event.organizer}’s page</a> : null}
          </section>

          {open && !event.developmentOnly ? <ThursdayNudge interests={interests} /> : null}

          {alsoOn.length ? (
            <section className="mk-dsec" aria-labelledby="ld-same">
              <header className="mk-sec-head"><h2 id="ld-same"><span>Also on {today ? 'today' : weekday.format(start)}</span></h2><p>Make a night of it.</p></header>
              <Rows items={alsoOn} />
            </section>
          ) : null}

          {more.length ? (
            <section className="mk-dsec" aria-labelledby="ld-more">
              <header className="mk-sec-head"><h2 id="ld-more"><span>More like this</span></h2><p><Link to="/plans">Get picks like these every Thursday</Link></p></header>
              <Rows items={more} />
            </section>
          ) : null}
        </div>

        <aside className="mk-dside" aria-label="Around this event">
          <Around place={event} all={all} title={event.neighbourhood ? `${event.neighbourhood}${quadrant(event.address) ? `, ${quadrant(event.address)} Calgary` : ''}` : 'Getting there'} />
          <div className="mk-side-card ld-explore">
            <p className="mk-side-kicker">Keep exploring</p>
            <ul>
              <li><Link to="/events/today"><b>Everything on today</b><ArrowRight size={16} aria-hidden="true" /></Link></li>
              <li><Link to="/events/this-weekend"><b>This weekend</b><ArrowRight size={16} aria-hidden="true" /></Link></li>
              <li><Link to="/date-night"><b>Date night picks</b><ArrowRight size={16} aria-hidden="true" /></Link></li>
              <li><Link to="/markets"><b>Market days</b><ArrowRight size={16} aria-hidden="true" /></Link></li>
            </ul>
          </div>
        </aside>

        <div className="mk-dfoot">
          <SourceBadge entity={event} />
          <ClaimCta entityId={event.id} title={event.title} kind="event" />
        </div>
      </div>

      {open ? (
        <div className="mk-dock" role="group" aria-label="Plan it">
          {event.tickets || organizerSite
            ? <a href={event.tickets || organizerSite} target="_blank" rel="noopener noreferrer" className="is-main">{event.tickets ? <Ticket size={18} aria-hidden="true" /> : <ExternalLink size={18} aria-hidden="true" />} {event.tickets ? (event.pricing === 'free' ? 'Register' : 'Tickets') : 'Details'}</a>
            : <a href={directionsUrl(event)} target="_blank" rel="noopener noreferrer" className="is-main"><Navigation size={18} aria-hidden="true" /> Directions</a>}
          <a href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer"><CalendarPlus size={18} aria-hidden="true" /> Save</a>
          <button type="button" onClick={() => void share()}>{shared ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />} {shared ? 'Copied' : 'Share'}</button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One Local place: why we picked it and what not to miss, then how to get
 * there and what's around it. Paid placement is labelled, never a pick.
 */
export function PlaceDetail({ place, all }: { place: Business; all: readonly DiscoveryEntity[] }) {
  const url = `https://calgarywatch.ca${entityPath(place)}`;
  const { shared, share } = useShare(place.title, place.summary, url);
  const note = LOCAL_NOTES[place.id];
  const site = place.website || place.sources.find(s => s.kind === 'official')?.url;
  const others = all.filter((e): e is Business => e.kind === 'business' && e.id !== place.id && (!e.developmentOnly || !!place.developmentOnly)).slice(0, 4);
  const hours = place.hours ? Object.entries(place.hours) : [];

  return (
    <div className="mk mk-detail cw-home2 ld">
      <Hero
        crumb={{ to: '/local', label: 'Local', current: place.title }}
        status={<><Sparkles size={15} aria-hidden="true" />{place.partner ? 'Featured partner' : note?.pick ?? (place.editorialSelection ? 'Picked by CalgaryWatch' : 'Local organization')}</>}
        title={place.title}
        verifiedId={place.id}
        lead={place.summary}
        where={<><MapPin size={16} aria-hidden="true" />{place.neighbourhood || cleanAddress(place.address)}{quadrant(place.address) ? ` ${quadrant(place.address)}` : ''}{note?.since ? <span className="mk-tag is-light">{note.since}</span> : null}</>}
        actions={<>
          <a className="mk-btn mk-btn-sun" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer"><Navigation size={17} aria-hidden="true" /> Directions</a>
          {site ? <a className="mk-btn" href={site} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" /> Their site</a> : null}
          <button type="button" className="mk-btn" onClick={() => void share()}>{shared ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />} {shared ? 'Link copied' : 'Share'}</button>
        </>}
        art={<ShopArt id={place.id} title={place.title} tags={place.tags} categories={place.categories} />}
      />

      <div className="cw-wrap mk-page mk-dgrid">
        <div className="mk-dmain">
          <dl className="mk-facts">
            <div><dt><MapPin size={16} aria-hidden="true" /> Where</dt><dd>{cleanAddress(place.address)}<span>{place.neighbourhood}</span></dd></div>
            {note?.since ? <div><dt><Store size={16} aria-hidden="true" /> Since</dt><dd>{note.since}</dd></div> : null}
            {place.phone ? <div><dt><Phone size={16} aria-hidden="true" /> Phone</dt><dd><a href={`tel:${place.phone.replace(/[^\d+]/g, '')}`}>{place.phone}</a></dd></div> : null}
            {hours.length ? <div><dt><Clock size={16} aria-hidden="true" /> Hours</dt><dd>{hours.slice(0, 2).map(([d, h]) => `${d} ${h}`).join(' · ')}{hours.length > 2 ? <span>More on their site</span> : null}</dd></div> : null}
          </dl>

          {note && !place.partner ? (
            <div className="mk-take ld-take">
              <Quote size={26} aria-hidden="true" />
              <span className="mk-take-kicker">{note.pick}</span>
              <span className="mk-take-note">{note.note}</span>
              {note.dontMiss.length ? <span className="ld-dontmiss"><b>Don’t miss</b>{note.dontMiss.map(d => <span key={d} className="mk-tag">{d}</span>)}</span> : null}
            </div>
          ) : null}
          {place.partner ? <p className="cw-preview-note">Sponsored · {place.sponsorshipDisclosure || 'Featured partner placement. Payment does not imply editorial selection.'}</p> : null}

          <section className="mk-dsec mk-about" aria-labelledby="ld-about">
            <header className="mk-sec-head"><h2 id="ld-about"><span>The story</span></h2></header>
            <p>{place.description}</p>
            {place.services?.length ? <p className="mk-amenities">{place.services.map(s => <span key={s} className="mk-tag">{s}</span>)}</p> : null}
          </section>

          {others.length ? (
            <section className="mk-dsec" aria-labelledby="ld-others">
              <header className="mk-sec-head"><h2 id="ld-others"><span>More places worth knowing</span></h2><p><Link to="/local">The whole little black book</Link></p></header>
              <ul className="ld-places">
                {others.map(o => (
                  <li key={o.id}><Link to={entityPath(o)}><span className="ld-places-art" aria-hidden="true"><ShopArt id={o.id} title={o.title} tags={o.tags} categories={o.categories} /></span><strong>{o.title}</strong><small>{o.neighbourhood}</small></Link></li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="mk-dside" aria-label="Around this place">
          <Around place={place} all={all} title={place.neighbourhood ? `${place.neighbourhood}${quadrant(place.address) ? `, ${quadrant(place.address)} Calgary` : ''}` : 'Getting there'} />
        </aside>

        <div className="mk-dfoot">
          <SourceBadge entity={place} />
          <ClaimCta entityId={place.id} title={place.title} kind="business" />
        </div>
      </div>

      <div className="mk-dock" role="group" aria-label="Visit">
        <a href={directionsUrl(place)} target="_blank" rel="noopener noreferrer" className="is-main"><Navigation size={18} aria-hidden="true" /> Directions</a>
        {site ? <a href={site} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} aria-hidden="true" /> Site</a> : null}
        <button type="button" onClick={() => void share()}>{shared ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />} {shared ? 'Copied' : 'Share'}</button>
      </div>
    </div>
  );
}
