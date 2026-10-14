import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Bus, CalendarPlus, Car, Check, Clock, Dog, ExternalLink, Map as MapIcon, MapPin, Navigation, Quote, Share2, ShieldCheck, Sparkles, Users } from 'lucide-react';
import type { DiscoveryEntity, Market, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { googleCalendarUrl, icsFile } from '../../lib/calendarFile';
import { pickWhen } from '../../lib/eventPicks';
import {
  communityFor, dayNum, directionsUrl, eventsSameDay, guideTake, hours, isOpen, monthShort, neighbourhoodFor, nextOpen,
  quadrantOf, relativeDay, schedulePattern, season, shortName, statusLine, upcoming, weekdayLong, weekdayShort,
} from '../../lib/marketDays';
import { MarketCover } from '../discovery/ListingArt';
import { TEAR } from '../home/HomeHero';
import { ClaimCta, VerifiedMark } from '../entity/ClaimCta';
import { SourceBadge } from '../entity/EntityDetail';
import { MarketLineup } from '../entity/MarketLineup';
import { MarketMap } from './MarketMap';
import '../../styles/home.css';
import '../../styles/home-board.css';
import '../../styles/markets.css';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One market's page: is it on, when, how to get there, and what's around it.
 * The facts come first, then the connections out to the rest of the site.
 */
export function MarketDetail({ market, all, occurrences }: { market: Market; all: readonly DiscoveryEntity[]; occurrences: readonly MarketOccurrence[] }) {
  const [now] = useState(() => new Date());
  const [shared, setShared] = useState(false);
  const dates = upcoming(market, occurrences, now);
  const next = nextOpen(market, occurrences, now);
  const open = isOpen(next, now);
  const pattern = schedulePattern(dates);
  const kind = season(market);
  const q = quadrantOf(market);
  const take = guideTake(market, all);
  const hood = neighbourhoodFor(market, all);
  const community = communityFor(market);
  const sameDay = next ? eventsSameDay(next.start, all, market.neighbourhood) : [];
  const url = `https://calgarywatch.ca${entityPath(market)}`;
  const cal = next ? { id: `${market.id}-${next.id}`, title: market.title, start: next.start, end: next.end, location: [market.venue, market.address].filter(Boolean).join(', '), description: market.summary, url } : null;
  const organizerSite = market.sources.find(s => s.kind === 'official')?.url;
  const others = all
    .filter((e): e is Market => e.kind === 'market' && e.id !== market.id)
    .map(m => ({ m, n: nextOpen(m, occurrences, now) }))
    .filter((x): x is { m: Market; n: MarketOccurrence } => !!x.n)
    .sort((a, b) => Date.parse(a.n.start) - Date.parse(b.n.start))
    .slice(0, 4);

  const download = () => {
    if (!cal) return;
    const blob = new Blob([icsFile(cal)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${market.slug}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: market.title, text: next ? `${market.title}, ${statusLine(next, now)}` : market.title, url });
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2500); }
    } catch { /* dismissed */ }
  };

  const goodFor = [
    market.familyFriendly ? 'Families' : null,
    ...market.amenities.filter(a => /accessible|kids/i.test(a)).map(a => cap(a)),
  ].filter(Boolean) as string[];

  return (
    <div className="mk mk-detail cw-home2">
      <section className={`mk-dhero${open ? ' is-open' : ''}`} aria-labelledby="mk-d-title">
        <div className="cw-wrap mk-dhero-in">
          <nav className="mk-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to="/markets">Markets</Link><span aria-hidden="true">/</span><span aria-current="page">{shortName(market)}</span></nav>
          <div className="mk-dhero-copy">
            <p className={`mk-status${open ? ' is-open' : ''}`}>{open ? <span className="cw-lb-pulse mk-pulse" aria-hidden="true" /> : <Clock size={15} aria-hidden="true" />}{next ? (open ? statusLine(next, now) : `Next: ${statusLine(next, now)}`) : 'No upcoming dates confirmed'}</p>
            <h1 id="mk-d-title">{market.title}</h1>
            <VerifiedMark entityId={market.id} verifiedAt={market.ownerVerifiedAt} />
            <p className="mk-dlead">{market.summary}</p>
            <p className="mk-dwhere"><MapPin size={16} aria-hidden="true" />{market.venue && !market.title.includes(market.venue) ? `${market.venue}, ` : ''}{market.neighbourhood}{q ? ` ${q}` : ''}{kind ? <span className="mk-tag is-light">{kind}</span> : null}</p>
            <div className="mk-dactions">
              <a className="mk-btn mk-btn-sun" href={directionsUrl(market)} target="_blank" rel="noopener noreferrer"><Navigation size={17} aria-hidden="true" /> Directions</a>
              {cal ? <button type="button" className="mk-btn" onClick={download}><CalendarPlus size={17} aria-hidden="true" /> Add {relativeDay(next!.start, now).toLowerCase() === 'today' ? 'today' : weekdayShort.format(new Date(next!.start))} to calendar</button> : null}
              <button type="button" className="mk-btn" onClick={() => void share()}>{shared ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />} {shared ? 'Link copied' : 'Share'}</button>
            </div>
          </div>
          <figure className="mk-dart"><MarketCover market={market} eager day={next ? weekdayShort.format(new Date(next.start)) : undefined} /></figure>
        </div>
        <svg className="h-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d={TEAR} transform="translate(0 -5)" className="h-tear-shade" />
          <path d={TEAR} className="h-tear-paper" />
        </svg>
      </section>

      <div className="cw-wrap mk-page mk-dgrid">
        <div className="mk-dmain">
          <dl className="mk-facts">
            <div><dt><Clock size={16} aria-hidden="true" /> Usually</dt><dd>{pattern ? <>{pattern.dayText}<span>{pattern.hours}</span></> : 'Check with the organizer'}</dd></div>
            <div><dt><MapPin size={16} aria-hidden="true" /> Where</dt><dd>{market.venue || market.title}<span>{market.address.replace(/, Calgary, AB$/, '')}</span></dd></div>
            <div><dt><Car size={16} aria-hidden="true" /> Parking</dt><dd>{market.parking ? market.parking.replace(/\.$/, '') : market.amenities.some(a => /parking/i.test(a)) ? 'Free parking' : 'Street parking nearby'}</dd></div>
            {market.transit ? <div><dt><Bus size={16} aria-hidden="true" /> Transit</dt><dd>{market.transit}</dd></div> : null}
            {goodFor.length ? <div><dt><Users size={16} aria-hidden="true" /> Good for</dt><dd>{goodFor.join(' · ')}</dd></div> : null}
            {market.petFriendly !== undefined ? <div><dt><Dog size={16} aria-hidden="true" /> Dogs</dt><dd>{market.petFriendly ? 'Welcome' : 'Not permitted'}</dd></div> : null}
          </dl>

          <section className="mk-dsec" aria-labelledby="mk-dates-title">
            <header className="mk-sec-head"><h2 id="mk-dates-title"><span>Upcoming dates</span></h2><p>{dates.length ? `${dates.filter(o => !o.cancelled).length} confirmed · Calgary time` : 'None confirmed yet'}</p></header>
            {dates.length ? (
              <ol className="mk-dates">
                {dates.slice(0, 12).map((o, i) => (
                  <li key={o.id} className={`${o.cancelled ? 'is-cancelled' : ''}${i === 0 && !o.cancelled ? ' is-next' : ''}${isOpen(o, now) ? ' is-open' : ''}`}>
                    <span className="mk-date-day">{weekdayShort.format(new Date(o.start))}</span>
                    <b>{dayNum.format(new Date(o.start))}</b>
                    <span className="mk-date-mon">{monthShort.format(new Date(o.start))}</span>
                    <small>{o.cancelled ? 'Cancelled' : isOpen(o, now) ? 'Open now' : hours(o)}</small>
                  </li>
                ))}
              </ol>
            ) : <p className="mk-muted">The organizer hasn’t published dates yet. {organizerSite ? <a href={organizerSite} target="_blank" rel="noopener noreferrer">Check their site</a> : null}</p>}
            {dates.length > 12 ? <p className="mk-muted">And {dates.length - 12} more dates after that.</p> : null}
          </section>

          <section className="mk-dsec mk-about" aria-labelledby="mk-about-title">
            <header className="mk-sec-head"><h2 id="mk-about-title"><span>What you’ll find</span></h2></header>
            <p>{market.description}</p>
            {market.amenities.length ? <p className="mk-amenities">{market.amenities.map(a => <span key={a} className="mk-tag">{cap(a)}</span>)}</p> : null}
            {organizerSite ? <a className="mk-organizer" href={organizerSite} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> {market.organizer}’s site</a> : null}
            {market.image?.credit ? <p className="mk-muted mk-photo-credit">Top image supplied by the organizer. {market.image.credit}</p> : null}
          </section>

          {take ? (
            <Link className="mk-take" to={entityPath(take.guide)}>
              <Quote size={26} aria-hidden="true" />
              <span className="mk-take-kicker">Our take, from the guide</span>
              <span className="mk-take-note">{take.stop.note}</span>
              {take.stop.tip ? <span className="mk-take-tip"><Sparkles size={15} aria-hidden="true" /> {take.stop.tip}</span> : null}
              <span className="mk-take-go">{take.guide.title} <ArrowRight size={15} aria-hidden="true" /></span>
            </Link>
          ) : null}

          <MarketLineup marketId={market.id} />

          {next && sameDay.length ? (
            <section className="mk-dsec" aria-labelledby="mk-same-title">
              <header className="mk-sec-head"><h2 id="mk-same-title"><span>Also on {relativeDay(next.start, now).toLowerCase() === 'today' ? 'today' : weekdayLong.format(new Date(next.start))}</span></h2><p>Make a day of it.</p></header>
              <ul className="mk-same">
                {sameDay.map(e => (
                  <li key={e.id}><Link to={entityPath(e)}><time dateTime={e.start}>{pickWhen(e.start)}</time><strong>{e.title}</strong><span>{e.venue || e.neighbourhood}{e.pricing === 'free' ? <em className="mk-free">Free</em> : null}</span><ArrowUpRight size={17} aria-hidden="true" /></Link></li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="mk-dside" aria-label="Around this market">
          <div className="mk-side-card">
            <p className="mk-side-kicker"><MapIcon size={15} aria-hidden="true" /> {market.neighbourhood}{q ? `, ${q} Calgary` : ''}</p>
            <MarketMap markets={[market]} focusId={market.id} />
            <a className="mk-btn mk-btn-ink mk-wide" href={directionsUrl(market)} target="_blank" rel="noopener noreferrer"><Navigation size={16} aria-hidden="true" /> Get directions</a>
          </div>
          <div className="mk-side-card mk-around">
            <p className="mk-side-kicker">Around the market</p>
            <ul>
              {hood ? <li><Link to={entityPath(hood.hood)}><b>{hood.nearby ? `Next door: ${hood.hood.title}` : hood.hood.title}</b><span>Places, plans and what’s new {hood.nearby ? 'a short walk away' : 'in the neighbourhood'}</span><ArrowUpRight size={16} aria-hidden="true" /></Link></li> : null}
              {community ? <li><Link to={`/check-your-community?c=${community.slug}`}><b><ShieldCheck size={15} aria-hidden="true" /> How {community.name} ranks</b><span>Its 311 reports against every Calgary community</span><ArrowUpRight size={16} aria-hidden="true" /></Link></li> : null}
              <li><Link to="/map"><b>Live map</b><span>Traffic, weather and reports before you head out</span><ArrowUpRight size={16} aria-hidden="true" /></Link></li>
            </ul>
          </div>
          {others.length ? (
            <div className="mk-side-card mk-others">
              <p className="mk-side-kicker">Other markets coming up</p>
              <ul>
                {others.map(({ m, n }) => (
                  <li key={m.id}><Link to={entityPath(m)}><span className="mk-others-day"><small>{weekdayShort.format(new Date(n.start))}</small><b>{dayNum.format(new Date(n.start))}</b></span><span><strong>{shortName(m)}</strong><small>{isOpen(n, now) ? 'Open now' : hours(n)} · {m.neighbourhood}</small></span></Link></li>
                ))}
              </ul>
              <Link className="mk-tile-link" to="/markets">Every market <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          ) : null}
        </aside>

        <div className="mk-dfoot">
          <SourceBadge entity={market} />
          <ClaimCta entityId={market.id} title={market.title} kind="market" verifiedAt={market.ownerVerifiedAt} />
        </div>
      </div>

      <div className="mk-dock" role="group" aria-label="Plan your visit">
        <a href={directionsUrl(market)} target="_blank" rel="noopener noreferrer" className="is-main"><Navigation size={18} aria-hidden="true" /> Directions</a>
        {cal ? <a href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer"><CalendarPlus size={18} aria-hidden="true" /> Save</a> : null}
        <button type="button" onClick={() => void share()}>{shared ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />} {shared ? 'Copied' : 'Share'}</button>
      </div>
    </div>
  );
}
