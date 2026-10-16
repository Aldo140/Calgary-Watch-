import { ListingArtwork } from '../entity/ListingArtwork';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Check, Clock, ExternalLink, Globe, MapPin, Navigation, Phone, Quote, Share2, Store, Ticket } from 'lucide-react';
import type { Business, DiscoveryEntity, Event, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { organizerEvents, organizerMarkets } from '../../lib/organizations';
import { localLinks } from '../../lib/localLinks';
import { communityFor, directionsUrl, nextOpen } from '../../lib/marketDays';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { LOCAL_NOTES } from '../../data/localNotes';
import { ShopArt } from './ListingArt';
import { LiveSky, SkyDateline, Street, Traffic, Upper } from './LocalHero';
import { ClaimCta, VerifiedMark } from '../entity/ClaimCta';
import { SourceBadge } from '../entity/EntityDetail';
import { TEAR } from '../home/HomeHero';

const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
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
  const upcoming = organizerEvents(place.id, all, now);
  const markets = organizerMarkets(place.id, all, now);
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
  const others = all.filter((e): e is Business => e.kind === 'business' && e.id !== place.id && (!e.developmentOnly || !!place.developmentOnly))
    .sort((a, b) => Number(b.editorialSelection) - Number(a.editorialSelection) || a.title.localeCompare(b.title));
  const hours = place.hours ? Object.entries(place.hours) : [];
  const status = place.partner ? 'Featured partner' : note?.pick ?? (place.editorialSelection ? 'Picked by CalgaryWatch' : `${place.categories[0] ? `${place.categories[0][0].toUpperCase()}${place.categories[0].slice(1)} · ` : ''}Local organization`);
  let n = 0;

  return (
    <div className="cw-loc lp">
      <LiveSky className="lp-hero" labelledBy="lp-title">
        {sky => <>
          <div className="cw-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <nav className="lp-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to="/local">Local</Link><span aria-hidden="true">/</span><span aria-current="page">{name}</span></nav>
              <SkyDateline sky={sky} where={place.neighbourhood || 'Calgary'} />
              <p className={`lp-status${place.partner ? ' is-partner' : ''}`}>{status}</p>
              <h1 id="lp-title" className="lp-title">{name}{branch ? <em>{branch}</em> : null}</h1>
              <VerifiedMark entityId={place.id} verifiedAt={place.ownerVerifiedAt} />
              <p className="h-summary lp-lead">{place.summary}</p>
              <div className="lp-actions" ref={actions}>
                <a className="lp-btn lp-btn-sun" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer"><Navigation size={17} aria-hidden="true" />Directions</a>
                {site ? <a className="lp-btn" href={site} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true" />Their site</a> : null}
                <button type="button" className="lp-btn" onClick={() => void share()}>{shared ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />}{shared ? 'Link copied' : 'Share'}</button>
              </div>
            </div>
            <figure className="lp-building">
              <Lamp />
              <Upper floors={2} wall={place.editorialSelection ? '#d9634c' : '#2c5fc4'} seed={place.id.length} night={sky.night} />
              <span className="lx-shop-front lp-front">
                <ShopArt id={place.id} title={place.title} tags={place.tags} categories={place.categories} />
              </span>
              {place.partner ? <span className="cw-loc-stamp cw-loc-stamp-partner">Featured partner</span>
                : place.editorialSelection ? <span className="cw-loc-stamp" aria-label="CalgaryWatch pick"><small>CalgaryWatch</small>Pick</span> : null}
              <figcaption className="lp-plate"><MapPin size={14} aria-hidden="true" />{cleanAddress(place.address)}</figcaption>
            </figure>
          </div>
          <div className="lx-road lp-road" aria-hidden="true"><Traffic /></div>
        </>}
      </LiveSky>

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

        <section className="lp-essentials" aria-label="The essentials">
          <a className="lp-fact lp-fact-where" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer">
            <small><MapPin size={14} aria-hidden="true" />Where</small>
            <strong>{cleanAddress(place.address)}</strong>
            <span>{place.neighbourhood}{q ? ` · ${q} Calgary` : ''} · Get directions</span>
          </a>
          {note?.since ? <div className="lp-fact"><small><Store size={14} aria-hidden="true" />Since</small><strong>{note.since}</strong></div> : null}
          {place.phone ? <a className="lp-fact" href={`tel:${place.phone.replace(/[^\d+]/g, '')}`}><small><Phone size={14} aria-hidden="true" />Call</small><strong>{place.phone}</strong></a> : null}
          {site ? <a className="lp-fact" href={site} target="_blank" rel="noopener noreferrer"><small><Globe size={14} aria-hidden="true" />Online</small><strong>{host(site)}</strong></a> : null}
          {hours.length ? <div className="lp-fact"><small><Clock size={14} aria-hidden="true" />Hours</small><strong>{hours.slice(0, 2).map(([d, h]) => `${d} ${h}`).join(' · ')}</strong>{hours.length > 2 ? <span>More on their site</span> : null}</div> : null}
        </section>

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

        <section className="lp-story" aria-labelledby="lp-story">
          <header>
            <p className="lx-eyebrow">From their own site</p>
            <h2 id="lp-story">The <mark>story.</mark></h2>
          </header>
          <div className="lp-story-body">
            <p>{place.description}</p>
            {place.services?.length ? (
              <>
                <p className="lx-eyebrow">What you’ll find</p>
                <ul className="lp-services">{place.services.map(s => <li key={s}>{s}</li>)}</ul>
              </>
            ) : null}
            {season ? <a className="lx-text-link lp-season" href={season} target="_blank" rel="noopener noreferrer"><Ticket size={15} aria-hidden="true" /> Current season and tickets</a> : null}
            {experiences ? <a className="lx-text-link lp-season" href={experiences} target="_blank" rel="noopener noreferrer"><Ticket size={15} aria-hidden="true" /> Current and upcoming experiences</a> : null}
          </div>
        </section>

        {markets.length ? (
          <section className="lp-upcoming" aria-labelledby="lp-markets">
            <header className="lx-head"><div>
              <p className="lx-eyebrow">From this organization</p>
              <h2 id="lp-markets">Markets from <mark>{name}.</mark></h2>
              <p>Choose a location for its market days, directions and official information.</p>
            </div></header>
            <ul className="lp-dates">
              {markets.map(market => {
                const next = nextOpen(market, occurrences, new Date(now));
                return <li key={market.id}><Link to={entityPath(market)}>
                  {next ? <time dateTime={next.start}><small>{wday.format(new Date(next.start))}</small><b>{dnum.format(new Date(next.start))}</b><small>{mon.format(new Date(next.start))}</small></time> : <Store size={32} aria-hidden="true" />}
                  <span><strong>{market.title}</strong><em>{next ? `Next market: ${day.format(new Date(next.start))}` : 'Check the official website for upcoming dates'} · {market.address}</em></span>
                  <Go />
                </Link></li>;
              })}
            </ul>
          </section>
        ) : null}
        {!upcoming.length && place.categories.includes('arts') ? <p>No upcoming events are currently listed. Check the official website for the latest programme.</p> : null}
        {upcoming.length ? (
          <section className="lp-upcoming" aria-labelledby="lp-upcoming">
            <header className="lx-head">
              <div>
                <p className="lx-eyebrow"><span className="lx-dot" aria-hidden="true" />From the official season</p>
                <h2 id="lp-upcoming">Upcoming events from <mark>{name}.</mark></h2>
              </div>
            </header>
            <ul className="lp-dates">
              {upcoming.map(e => (
                <li key={e.id}>
                  <Link to={entityPath(e)}>
                    <time dateTime={e.start}><small>{wday.format(new Date(e.start))}</small><b>{dnum.format(new Date(e.start))}</b><small>{mon.format(new Date(e.start))}</small></time>
                    <span><strong>{e.title}</strong><em>{e.schedulePrecision==='date'?'Check official showtimes':hm.format(new Date(e.start))}{e.venue ? ` · ${e.venue}` : ''}</em></span>
                    <Go />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="lp-around" aria-labelledby="lp-around">
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
            <Link to="/map" className="lx-tile lx-tile-navy">
              <small>{pad(++n)} · Live</small>
              <strong>Check the live map</strong>
              <span>Traffic, weather and reports before you head out</span>
              <Go />
            </Link>
          </div>
        </section>
      </div>

      {others.length ? (
        <section className="lx-book lp-next" aria-labelledby="lp-next">
          <svg className="lx-edge lx-edge-top" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={TEAR} /></svg>
          <div className="cw-wrap">
            <header className="lx-head lx-head-dark">
              <div>
                <p className="lx-eyebrow"><span className="lx-dot" aria-hidden="true" />The rest of the block</p>
                <h2 id="lp-next">Next door <mark>on the street.</mark></h2>
              </div>
              <p>Every other place in the little black book. <Link className="lp-all" to="/local">See them all on Local</Link></p>
            </header>
          </div>
          <div className="lx-hero lp-night" data-night>
            <Street places={others} night label="More places in the book" />
          </div>
        </section>
      ) : null}

      <div className="cw-wrap lp-foot">
        <SourceBadge entity={place} />
        <ClaimCta entityId={place.id} title={place.title} kind="business" verifiedAt={place.ownerVerifiedAt} />
      </div>

      <div className="lp-dock" role="group" aria-label="Visit" data-show={docked || undefined}>
        <a href={directionsUrl(place)} target="_blank" rel="noopener noreferrer" className="is-main"><Navigation size={18} aria-hidden="true" /> Directions</a>
        {site ? <a href={site} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} aria-hidden="true" /> Site</a> : null}
        <button type="button" onClick={() => void share()}>{shared ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />} {shared ? 'Copied' : 'Share'}</button>
      </div>
    </div>
  );
}
