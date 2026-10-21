import { useState, type CSSProperties } from 'react';
import { eventArtwork, listingImageSrc, organizerProfile } from '../../lib/organizations';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, CalendarPlus, Check, Clock, ExternalLink, Map as MapIcon, MapPin, Navigation,
  Share2, ShieldCheck, Tag, Ticket, User,
} from 'lucide-react';
import { calendarDateForDisplay, lastEventDate } from '../../lib/eventSchedule';
import { moreAtVenue, moreLikeThis } from '../../lib/listingSeo';
import { eventTheme } from '../../lib/eventTheme';
import { countdown } from '../../lib/marketDays';
import { shelfOf, SHELVES } from '../../lib/localShelves';
import { isOwnerVerified } from '../../lib/verified';
import { useSectionReveal } from '../discovery/ProfileSections';
import { Seal } from '../discovery/LocalDirectory';
import { EventScene } from './EventScene';
import { OrganizerDesk } from './OrganizerDesk';
import type { Business, DiscoveryEntity, Event } from '../../types/discovery';
import { entityPath, startClock } from '../../lib/discovery';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { googleCalendarUrl, icsFile } from '../../lib/calendarFile';
import { interestLabel, interestsFor, pickWhen, type EventInterestId } from '../../lib/eventPicks';
import { communityFor, directionsUrl, eventsSameDay, neighbourhoodFor } from '../../lib/marketDays';
import { EventArt } from '../discovery/ListingArt';
import { TEAR } from '../home/HomeHero';
import { VerifiedMark } from './ClaimCta';
import { SourceBadge } from './EntityDetail';
import { GoingButton } from '../plans/GoingButton';
import { ThursdayNudge } from '../plans/ThursdayNudge';
import '../../styles/home.css';
import '../../styles/home-board.css';
import '../../styles/markets.css';
import '../../styles/plans.css';
import '../../styles/listing-detail.css';
import '../../styles/local-directory.css';
import '../../styles/event-detail.css';

const dayLong = calgaryDateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
const dayKey = calgaryDateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
const weekday = calgaryDateTimeFormat('en-CA', { weekday: 'long' });
const time = calgaryDateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' });
const wkShort = calgaryDateTimeFormat('en-CA', { weekday: 'short' });
const dNum = calgaryDateTimeFormat('en-CA', { day: 'numeric' });
const monShort = calgaryDateTimeFormat('en-CA', { month: 'short' });
/** The drawn art follows the page's theme first, so a jazz night gets the record, not the gallery frame. */
const THEME_ART: Record<string, string[]> = { music: ['music'], stage: ['theatre'], gallery: ['art'], sports: ['sports'], family: ['family'], food: ['food'], market: ['food'], talks: [], outdoors: [], community: [], other: [] };
const hour24 = calgaryDateTimeFormat('en-CA', { hour: '2-digit', hourCycle: 'h23' });
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
 * One event's page, dressed for what kind of event it is (lib/eventTheme.ts):
 * a gig gets the record and the equalizer, a play the curtain, a match the
 * pitch and a scoreboard ticket. Underneath it's the same board as a market:
 * when and what it costs, how to get tickets, who's behind it, then what else
 * is on that day, at that venue and like it, so a visit from search has
 * somewhere to go.
 */
export function EventDetail({ event, all }: { event: Event; all: readonly DiscoveryEntity[] }) {
  const [now] = useState(() => Date.now());
  const url = `https://calgarywatch.ca${entityPath(event)}`;
  const { shared, share } = useShare(event.title, `${event.title}, ${pickWhen(event.start)}`, url);
  const theme = eventTheme(event);
  const revealRef = useSectionReveal(event.id);
  const dateOnly = event.schedulePrecision === 'date';
  const start = dateOnly ? calendarDateForDisplay(event.start) : new Date(event.start);
  const end = dateOnly ? calendarDateForDisplay(lastEventDate(event.end)) : new Date(event.end);
  const past = Date.parse(event.end) <= now;
  const on = !past && Date.parse(event.start) <= now && !event.cancelled;
  const today = dayKey.format(start) === dayKey.format(new Date(now));
  const sameDay = dayKey.format(start) === dayKey.format(end);
  const clockLine = dateOnly
    ? `${sameDay ? 'All day' : `Through ${dayLong.format(end)}`} · Check official showtimes`
    : `${startClock(event.start, time)}${event.endTimeEstimated ? '' : ` – ${sameDay ? '' : `${dayLong.format(end)}, `}${time.format(end)}`}`;
  const status = event.cancelled ? 'Cancelled by the organizer' : past ? 'This event has finished'
    : on ? (dateOnly ? 'On now' : `On now · until ${time.format(end)}`) : `${today ? 'Today' : dayLong.format(start)} · ${dateOnly ? 'All day' : startClock(event.start, time)}`;
  const notOnSale = event.ticketSaleStatus === 'not-on-sale';
  const price = event.cancelled ? 'Cancelled' : notOnSale ? 'Not on sale yet' : event.pricing === 'free' ? 'Free' : event.priceRange ? `$${event.priceRange[0]}${event.priceRange[1] !== event.priceRange[0] ? `–$${event.priceRange[1]}` : ''}` : event.pricing === 'paid' ? 'Ticketed' : 'Check with the organizer';
  const cal = { dateOnly, id: event.id, title: event.title, start: event.start, end: event.end, location: [event.venue, event.address].filter(Boolean).join(', '), description: event.summary, url };
  const organizerSite = event.sources.find(s => s.kind === 'official')?.url ?? event.sources[0]?.url;
  const interests: EventInterestId[] = interestsFor(event).filter(i => i !== 'free');
  const open = !past && !event.cancelled;
  const photo = eventArtwork(event, all);
  const organization = organizerProfile(event, all);
  const orgShelf = organization ? SHELVES.find(sh => sh.id === shelfOf(organization)) : undefined;
  const lead = event.summary && event.summary !== event.title && !event.summary.startsWith(`${event.title}, listed by`) ? event.summary : '';
  const description = event.description && event.description !== event.summary ? event.description : lead || event.description;

  const alsoOn = eventsSameDay(event.start, all.filter(e => e.id !== event.id), event.neighbourhood, 4);
  const more = moreLikeThis(event, all, now, 5).filter(e => !alsoOn.some(a => a.id === e.id)).slice(0, 4);
  // Same venue, next dates first, without repeating the lists above (as on the prerendered page).
  const atVenue = moreAtVenue(event, all, now).filter(e => !more.some(m => m.id === e.id) && !alsoOn.some(a => a.id === e.id)).slice(0, 3);

  const download = () => {
    const blob = new Blob([icsFile(cal)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${event.slug}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const ticketUrl = event.tickets && !notOnSale ? event.tickets : undefined;
  const primary = ticketUrl
    ? <a className="mk-btn mk-btn-sun" href={ticketUrl} target="_blank" rel="noopener noreferrer"><Ticket size={17} aria-hidden="true" /> {event.pricing === 'free' ? 'Register' : 'Get tickets'}</a>
    : organizerSite ? <a className="mk-btn mk-btn-sun" href={organizerSite} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" /> Organizer’s page</a> : null;
  const where = event.venue || event.neighbourhood || cleanAddress(event.address);

  return (
    <div className={`mk mk-detail cw-home2 ld ev ev-${theme.id}`} ref={revealRef} style={orgShelf ? { ['--tone' as string]: orgShelf.tone, ['--tink' as string]: orgShelf.ink } as CSSProperties : undefined}>
      <section className={`mk-dhero ld-hero ev-hero${on ? ' is-open' : ''}`} aria-labelledby="ld-title">
        <EventScene theme={theme.id} />
        <div className="cw-wrap mk-dhero-in">
          <nav className="mk-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to="/events">Events</Link><span aria-hidden="true">/</span><span aria-current="page">{event.title}</span></nav>
          <div className="mk-dhero-copy">
            {open && !on
              ? <p className="ev-kicker"><span className="ev-kicker-dot" />{theme.label}{interests.length > 1 ? <small>{interests.filter(i => interestLabel(i) !== theme.label).slice(0, 2).map(interestLabel).join(' · ')}</small> : null}</p>
              : <p className={`mk-status${on ? ' is-open' : ''}`}>{on ? <span className="cw-lb-pulse mk-pulse" aria-hidden="true" /> : <Clock size={15} aria-hidden="true" />}{status}</p>}
            <h1 id="ld-title">{event.title}</h1>
            <VerifiedMark entityId={event.id} verifiedAt={event.ownerVerifiedAt} />
            {lead ? <p className="mk-dlead">{lead}</p> : null}
            <p className="mk-dwhere"><MapPin size={16} aria-hidden="true" />{where}{event.venue && event.neighbourhood ? `, ${event.neighbourhood}` : ''}</p>
            <a className={`mk-ticket ev-ticket${on ? ' is-open' : ''}${!open ? ' is-over' : ''}`} href="#ld-facts">
              <span className="mk-ticket-stub"><small>{wkShort.format(start)}</small><b>{dNum.format(start)}</b><small>{monShort.format(start)}</small></span>
              <span className="mk-ticket-body">
                <small>{event.cancelled ? 'Cancelled' : past ? 'Finished' : on ? 'On right now' : theme.admit}</small>
                <strong>{weekday.format(start)}, {monShort.format(start)} {dNum.format(start)}</strong>
                <span>{dateOnly ? (sameDay ? 'All day' : `Through ${monShort.format(end)} ${dNum.format(end)}`) : (startClock(event.start, time) === 'All day' ? 'All day' : `${theme.start} ${startClock(event.start, time)}`)}{open && !on ? <em>{countdown({ start: event.start, end: event.end }, new Date(now))}</em> : null}</span>
              </span>
              {price.length <= 12 ? <span className={`mk-ticket-more ev-ticket-price${event.pricing === 'free' && !event.cancelled ? ' is-free' : ''}`}>{price}</span> : null}
            </a>
            <div className="mk-dactions">
              {open ? <>
                {primary}
                <button type="button" className="mk-btn" onClick={download}><CalendarPlus size={17} aria-hidden="true" /> Add to calendar</button>
                <button type="button" className="mk-btn" onClick={() => void share()}>{shared ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />} {shared ? 'Link copied' : 'Share'}</button>
              </> : <Link className="mk-btn mk-btn-sun" to="/events">See what’s on instead <ArrowRight size={17} aria-hidden="true" /></Link>}
            </div>
          </div>
          <figure className="mk-dart ld-art ev-art">{photo ? <><img className={`ld-photo${photo.presentation === 'poster' ? ' is-poster' : ''}`} src={listingImageSrc(photo)} alt={photo.alt} width="1200" height="677" />{photo.credit ? <figcaption className="ld-photo-credit">{photo.credit}</figcaption> : null}</> : <EventArt id={event.id} title={event.title} categories={[...THEME_ART[theme.id], ...event.categories]} />}</figure>
        </div>
        <svg className="h-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d={TEAR} transform="translate(0 -5)" className="h-tear-shade" />
          <path d={TEAR} className="h-tear-paper" />
        </svg>
      </section>

      <div className="cw-wrap mk-page mk-dgrid">
        <div className="mk-dmain">
          <dl className="mk-facts" id="ld-facts">
            <div><dt><Clock size={16} aria-hidden="true" /> When</dt><dd>{dayLong.format(start)}<span>{clockLine}</span></dd></div>
            <div><dt><MapPin size={16} aria-hidden="true" /> Where</dt><dd>{event.venue || event.neighbourhood || 'See the organizer'}<span>{cleanAddress(event.address)}</span></dd></div>
            <div><dt><Tag size={16} aria-hidden="true" /> Price</dt><dd>{price}{event.pricing === 'unknown' && !notOnSale ? <span>Not listed yet</span> : null}</dd></div>
            <div><dt><User size={16} aria-hidden="true" /> Organizer</dt><dd>{organization ? <Link to={entityPath(organization)}>{event.organizer}</Link> : event.organizer}</dd></div>
          </dl>

          {open && !event.developmentOnly ? <div className="ld-going"><GoingButton eventId={event.id} start={event.start} /></div> : null}

          <section className="mk-dsec mk-about ev-about" data-reveal aria-labelledby="ld-about">
            <header className="mk-sec-head"><h2 id="ld-about"><span>{theme.about}</span></h2><p>{theme.label}{event.venue ? ` · ${event.venue}` : ''}</p></header>
            {description ? <p className="ev-story">{description}</p> : null}
            {interests.length ? <p className="mk-amenities">{interests.map(i => <Link key={i} className="mk-tag" to={`/events?filter=${i === 'outdoors' ? 'outdoor' : i === 'learning' ? 'talks' : i}`}>{interestLabel(i)}</Link>)}</p> : null}
            {organizerSite ? <a className="mk-organizer" href={organizerSite} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> {event.organizer}’s page</a> : null}
          </section>

          {organization && orgShelf ? (
            <section className="mk-dsec mk-runby" data-reveal aria-labelledby="ld-runby">
              <header className="mk-sec-head"><h2 id="ld-runby"><span>Who’s behind it</span></h2><p>{orgShelf.label} on Local</p></header>
              <Link className="mk-runby-card" to={entityPath(organization)}>
                <Seal title={organization.title} tone={orgShelf} />
                <span className="mk-runby-copy">
                  <small>{isOwnerVerified(organization) ? 'Verified organizer' : 'The organizer'}</small>
                  <strong>{organization.title}</strong>
                  <span>{organization.summary}</span>
                </span>
                <span className="mk-runby-go">Their profile <ArrowUpRight size={16} aria-hidden="true" /></span>
              </Link>
            </section>
          ) : null}

          {open && !event.developmentOnly ? <ThursdayNudge interests={interests} /> : null}

          {alsoOn.length ? (
            <section className="mk-dsec" data-reveal aria-labelledby="ld-same">
              <header className="mk-sec-head"><h2 id="ld-same"><span>Also on {today ? 'today' : weekday.format(start)}</span></h2><p>Make a {!dateOnly && Number(hour24.format(start)) >= 17 ? 'night' : 'day'} of it.</p></header>
              <Rows items={alsoOn} />
            </section>
          ) : null}

          {more.length ? (
            <section className="mk-dsec" data-reveal aria-labelledby="ld-more">
              <header className="mk-sec-head"><h2 id="ld-more"><span>{theme.more}</span></h2><p><Link to="/plans">Get picks like these every Thursday</Link></p></header>
              <Rows items={more} />
            </section>
          ) : null}

          {atVenue.length ? (
            <section className="mk-dsec" data-reveal aria-labelledby="ld-venue">
              <header className="mk-sec-head"><h2 id="ld-venue"><span>Also at {event.venue}</span></h2><p>Next dates first</p></header>
              <Rows items={atVenue} />
            </section>
          ) : null}

          {!event.developmentOnly ? <OrganizerDesk listing={event} all={all} name={event.title} organizer={organization?.title ?? event.organizer} /> : null}
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
          <p className="mk-correct"><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction: ${event.title}`)}`}>Spot something out of date? Suggest a correction</a></p>
        </div>
      </div>

      {open ? (
        <div className="mk-dock" role="group" aria-label="Plan it">
          {ticketUrl || organizerSite
            ? <a href={ticketUrl || organizerSite} target="_blank" rel="noopener noreferrer" className="is-main">{ticketUrl ? <Ticket size={18} aria-hidden="true" /> : <ExternalLink size={18} aria-hidden="true" />} {ticketUrl ? (event.pricing === 'free' ? 'Register' : 'Tickets') : 'Details'}</a>
            : <a href={directionsUrl(event)} target="_blank" rel="noopener noreferrer" className="is-main"><Navigation size={18} aria-hidden="true" /> Directions</a>}
          <a href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer"><CalendarPlus size={18} aria-hidden="true" /> Save</a>
          <button type="button" onClick={() => void share()}>{shared ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />} {shared ? 'Copied' : 'Share'}</button>
        </div>
      ) : null}
    </div>
  );
}
