import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Accessibility, ArrowRight, ArrowUpRight, BadgeCheck, Bus, CalendarPlus, Car, Check, Clock, Copy, Dog, ExternalLink, Map as MapIcon, MapPin, Navigation, Quote, Share2, ShieldCheck, Sparkles, Store, Users, type LucideIcon } from 'lucide-react';
import type { Business, DiscoveryEntity, Market, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { googleCalendarUrl, icsFile } from '../../lib/calendarFile';
import { pickWhen } from '../../lib/eventPicks';
import {
  communityFor, countdown, dayNum, directionsUrl, eventsSameDay, guideTake, hours, isOpen, monthShort, neighbourhoodFor, nextOpen,
  quadrantOf, relativeDay, schedulePattern, season, shortName, statusLine, upcoming, weekdayLong, weekdayShort,
} from '../../lib/marketDays';
import { MarketCover } from '../discovery/ListingArt';
import { TEAR } from '../home/HomeHero';
import { VerifiedMark } from '../entity/ClaimCta';
import { CLAIM_BENEFIT } from '../entity/VerifiedBadge';
import { SourceBadge } from '../entity/EntityDetail';
import { MarketLineup } from '../entity/MarketLineup';
import { MarketMap } from './MarketMap';
import { Seal } from '../discovery/LocalDirectory';
import { ProfileCover } from '../discovery/ProfileCover';
import { iconFor, StorySpread, useSectionReveal } from '../discovery/ProfileSections';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { organizerMarkets } from '../../lib/organizations';
import { shelfOf, SHELVES } from '../../lib/localShelves';
import { isOwnerVerified, VERIFICATION_PRIORITY_ENABLED } from '../../lib/verified';
import { useVerifiedListing } from '../../lib/claimsApi';
import { organizationClaimPath } from '../../lib/claimOrganization';
import '../../styles/claim.css';
import '../../styles/home.css';
import '../../styles/home-board.css';
import '../../styles/markets.css';
import '../../styles/local-directory.css';
import '../../styles/local-profile.css';
import '../../styles/story-pages.css';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const longDay = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'long', day: 'numeric', year: 'numeric' });
const fullDay = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'long', day: 'numeric' });
const monthDayLong = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'long', day: 'numeric' });
/** The hero carries one sentence; the full write-up lives in the story below. */
const firstSentence = (text: string) => text.length <= 150 ? text : (text.split(/(?<=[.!?])\s+/)[0] || text);
const MARKETS_SHELF = SHELVES.find(s => s.id === 'markets')!;
const amenityIcon = (a: string): LucideIcon => /accessib/i.test(a) ? Accessibility : /dog|pet/i.test(a) ? Dog : /indoor|hut|floor/i.test(a) ? Store : iconFor(a);

/**
 * One market's page: is it on, when, how to get there, and what's around it.
 * The facts come first, then the connections out to the rest of the site.
 */
export function MarketDetail({ market, all, occurrences }: { market: Market; all: readonly DiscoveryEntity[]; occurrences: readonly MarketOccurrence[] }) {
  const [now] = useState(() => new Date());
  const [shared, setShared] = useState(false);
  const [copied, setCopied] = useState(false);
  const [allDates, setAllDates] = useState(false);
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
  const calFor = (o: MarketOccurrence) => ({ id: `${market.id}-${o.id}`, title: market.title, start: o.start, end: o.end, location: [market.venue, market.address].filter(Boolean).join(', '), description: market.summary, url });
  const cal = next ? calFor(next) : null;
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
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* blocked */ }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: market.title, text: next ? `${market.title}, ${statusLine(next, now)}` : market.title, url });
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2500); }
    } catch { /* dismissed */ }
  };

  // The organization behind the market, and the other locations it runs.
  const org = market.organizerEntityId ? all.find((e): e is Business => e.kind === 'business' && e.id === market.organizerEntityId) : undefined;
  const orgShelf = org ? SHELVES.find(s => s.id === shelfOf(org))! : undefined;
  const sisters = org ? organizerMarkets(org.id, all, now.getTime()).filter(m => m.id !== market.id) : [];

  const revealRef = useSectionReveal(market.id);
  const everyMarket = all.filter(e => e.kind === 'market');
  const number = everyMarket.findIndex(m => m.id === market.id) + 1;
  const confirmed = dates.filter(o => !o.cancelled).length;
  const official = market.sources.find(s => s.kind === 'official') ?? market.sources[0];
  // The build stamp, or a claim approved since the last build: the same answer the badge gives.
  const verified = useVerifiedListing(market.id, isOwnerVerified(market));
  const claimPath = organizationClaimPath(market, all);
  const stamp = verified ? 'Verified' : open ? 'Open now' : kind ?? undefined;
  const facts: [string, ReactNode][] = [
    ['Run by', org ? <Link key="o" to={entityPath(org)}>{org.title}</Link> : market.organizer || 'The organizer'],
    ['Listed from', official ? <a key="l" href={official.url} target="_blank" rel="noopener noreferrer">{official.name}</a> : 'The organizer'],
    ['Last checked', longDay.format(new Date(market.verifiedAt || market.updatedAt))],
    ['Status', verified ? <span key="v" className="lp-ok"><BadgeCheck size={15} aria-hidden="true" />Claimed by the organizer</span> : <Link key="c" to={claimPath}>Not yet claimed</Link>],
  ];

  const goodFor = [
    market.familyFriendly ? 'Families' : null,
    ...market.amenities.filter(a => /accessible|kids/i.test(a)).map(a => cap(a)),
  ].filter(Boolean) as string[];

  return (
    <div className="mk mk-detail cw-home2" ref={revealRef} style={{ ['--tone' as string]: MARKETS_SHELF.tone, ['--tink' as string]: MARKETS_SHELF.ink } as CSSProperties}>
      <section className={`mk-dhero${open ? ' is-open' : ''}`} aria-labelledby="mk-d-title">
        <div className="cw-wrap mk-dhero-in">
          <nav className="mk-crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to="/markets">Markets</Link><span aria-hidden="true">/</span><span aria-current="page">{shortName(market)}</span></nav>
          <div className="mk-dhero-copy">
            {next && !open
              ? <p className="mk-dkicker"><img src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" width="22" height="22" />{kind ? `${kind} market` : 'Market'} · {[market.neighbourhood, q].filter(Boolean).join(' ') || 'Calgary'}</p>
              : <p className={`mk-status${open ? ' is-open' : ''}`}>{open ? <span className="cw-lb-pulse mk-pulse" aria-hidden="true" /> : <Clock size={15} aria-hidden="true" />}{next ? statusLine(next, now) : 'No upcoming dates confirmed'}</p>}
            <h1 id="mk-d-title">{market.title}</h1>
            <VerifiedMark entityId={market.id} verifiedAt={market.ownerVerifiedAt} />
            <p className="mk-dlead">{firstSentence(market.summary)}</p>
            <p className="mk-dwhere"><MapPin size={16} aria-hidden="true" />{market.venue && !market.title.includes(market.venue) ? `${market.venue}, ` : ''}{market.neighbourhood}{q ? ` ${q}` : ''}{kind && !(next && !open) ? <span className="mk-tag is-light">{kind}</span> : null}</p>
            {next ? (
              <a className={`mk-ticket${open ? ' is-open' : ''}`} href="#mk-dates-title">
                <span className="mk-ticket-stub"><small>{weekdayShort.format(new Date(next.start))}</small><b>{dayNum.format(new Date(next.start))}</b><small>{monthShort.format(new Date(next.start))}</small></span>
                <span className="mk-ticket-body">
                  <small>{open ? 'On right now' : 'Next market'}</small>
                  <strong>{fullDay.format(new Date(next.start))}</strong>
                  <span>{hours(next)}<em>{countdown(next, now)}</em></span>
                </span>
                {confirmed > 1 ? <span className="mk-ticket-more">+{confirmed - 1}<small>more</small></span> : null}
              </a>
            ) : null}
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
            <div><dt><MapPin size={16} aria-hidden="true" /> Where</dt><dd>{market.venue || market.title}<span>{market.address.replace(/,?\s*Calgary,?\s*AB.*$/i, '')}</span></dd></div>
            <div><dt><Car size={16} aria-hidden="true" /> Parking</dt><dd>{market.parking ? market.parking.replace(/\.$/, '') : market.amenities.some(a => /parking/i.test(a)) ? 'Free parking' : 'Street parking nearby'}</dd></div>
            {market.transit ? <div><dt><Bus size={16} aria-hidden="true" /> Transit</dt><dd>{market.transit}</dd></div> : null}
            {goodFor.length ? <div><dt><Users size={16} aria-hidden="true" /> Good for</dt><dd>{goodFor.join(' · ')}</dd></div> : null}
            {market.petFriendly !== undefined ? <div><dt><Dog size={16} aria-hidden="true" /> Dogs</dt><dd>{market.petFriendly ? 'Welcome' : 'Not permitted'}</dd></div> : null}
          </dl>

          <section className="mk-dsec" data-reveal aria-labelledby="mk-dates-title">
            <header className="mk-sec-head"><h2 id="mk-dates-title"><span>Upcoming dates</span></h2><p>{dates.length ? `${dates.filter(o => !o.cancelled).length} confirmed · Calgary time` : 'None confirmed yet'}</p></header>
            {dates.length ? (
              <ol className="mk-tickets">
                {dates.slice(0, allDates || dates.length <= 5 ? 12 : 4).map(o => {
                  const d = new Date(o.start), live = isOpen(o, now), isNext = o.id === next?.id;
                  return (
                    <li key={o.id} className={`${o.cancelled ? 'is-cancelled' : ''}${isNext ? ' is-next' : ''}${live ? ' is-open' : ''}`}>
                      <span className="mk-tk-date"><small>{weekdayShort.format(d)}</small><b>{dayNum.format(d)}</b><small>{monthShort.format(d)}</small></span>
                      <span className="mk-tk-info">
                        <small>{o.cancelled ? 'Cancelled' : live ? 'Open now' : isNext ? 'Next up' : countdown(o, now)}</small>
                        <strong>{weekdayLong.format(d)}, {monthDayLong.format(d)}</strong>
                        <span>{hours(o)}{isNext && !live ? ` · ${countdown(o, now)}` : ''}</span>
                      </span>
                      {o.cancelled ? null : <a className="mk-tk-cal" href={googleCalendarUrl(calFor(o))} target="_blank" rel="noopener noreferrer" aria-label={`Add ${fullDay.format(d)} to your calendar`}><CalendarPlus size={18} aria-hidden="true" /></a>}
                    </li>
                  );
                })}
              </ol>
            ) : <p className="mk-muted">The organizer hasn’t published dates yet. {organizerSite ? <a href={organizerSite} target="_blank" rel="noopener noreferrer">Check their site</a> : null}</p>}
            {dates.length > 5 && !allDates ? <button type="button" className="mk-btn mk-more-dates" onClick={() => setAllDates(true)}>See {Math.min(dates.length, 12) - 4} more dates</button> : null}
            {allDates && dates.length > 12 ? <p className="mk-muted">And {dates.length - 12} more dates after that.</p> : null}
          </section>

          <StorySpread
            id="mk-story" headingId="mk-about-title" name={shortName(market)} text={market.description || market.summary} compact
            offers={market.amenities.map(cap)} iconOf={amenityIcon} facts={facts}
            cover={<ProfileCover id={market.id} title={shortName(market)} shelf={{ ...MARKETS_SHELF, label: kind ? `${kind} market` : 'Market' }} number={number} stamp={stamp} brand="Markets" />}
            caption={`Cover art for ${shortName(market)}, drawn for CalgaryWatch Markets.`}
            eyebrow={<><MapPin size={15} aria-hidden="true" />{[market.neighbourhood, q].filter(Boolean).join(' ') || 'Calgary'} · No. {String(number).padStart(2, '0')}</>}
            links={organizerSite || market.image?.credit ? <p className="lp-spread-links">
              {organizerSite ? <a className="mk-organizer" href={organizerSite} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> {market.organizer}’s site</a> : null}
              {market.image?.credit ? <span className="mk-muted mk-photo-credit">Top image supplied by the organizer. {market.image.credit}</span> : null}
            </p> : undefined}
          />

          {org && orgShelf ? (
            <section className="mk-dsec mk-runby" data-reveal aria-labelledby="mk-runby-title" style={{ ['--tone' as string]: orgShelf.tone, ['--tink' as string]: orgShelf.ink } as CSSProperties}>
              <header className="mk-sec-head"><h2 id="mk-runby-title"><span>Who runs it</span></h2><p>{orgShelf.label} on Local</p></header>
              <Link className="mk-runby-card" to={entityPath(org)}>
                <Seal title={org.title} tone={orgShelf} />
                <span className="mk-runby-copy">
                  <small>{isOwnerVerified(org) ? 'Verified organizer' : 'The organizer'}</small>
                  <strong>{org.title}</strong>
                  <span>{org.summary}</span>
                </span>
                <span className="mk-runby-go">Their profile <ArrowUpRight size={16} aria-hidden="true" /></span>
              </Link>
              {sisters.length ? (
                <ul className="mk-runby-sisters" aria-label={`Other markets from ${org.title}`}>
                  {sisters.map(m => {
                    const n = nextOpen(m, occurrences, now);
                    return <li key={m.id}><Link to={entityPath(m)}><b>{shortName(m)}</b><small>{n ? (isOpen(n, now) ? 'Open now' : statusLine(n, now)) : 'Dates on their site'}{m.neighbourhood ? ` · ${m.neighbourhood}` : ''}</small><ArrowUpRight size={15} aria-hidden="true" /></Link></li>;
                  })}
                </ul>
              ) : null}
            </section>
          ) : null}

          {take ? (
            <Link className="mk-take" to={entityPath(take.guide)}>
              <Quote size={26} aria-hidden="true" />
              <span className="mk-take-kicker">Our take, from the guide</span>
              <span className="mk-take-note">{take.stop.note}</span>
              {take.stop.tip ? <span className="mk-take-tip"><Sparkles size={15} aria-hidden="true" /> {take.stop.tip}</span> : null}
              <span className="mk-take-go">{take.guide.title} <ArrowRight size={15} aria-hidden="true" /></span>
            </Link>
          ) : null}

          <MarketLineup marketId={market.id} sell={false} />

          <section className="mk-dsec mk-desk" data-reveal aria-labelledby="mk-desk-title">
            <header className="mk-sec-head"><h2 id="mk-desk-title"><span>Vendors &amp; organizers</span></h2><p>Free on CalgaryWatch</p></header>
            <div className="mk-desk-grid">
              <div className="mk-desk-card is-vendor">
                <p className="mk-desk-kicker"><Store size={15} aria-hidden="true" /> For vendors</p>
                <h3>Sell at {shortName(market)}.</h3>
                <p>Send {org?.title ?? (market.organizer || 'the organizer')} your application in a couple of minutes. It goes straight to them.</p>
                <Link className="mk-btn mk-btn-sun" to={`/apply/${encodeURIComponent(market.id)}`}>Apply as a vendor <ArrowUpRight size={16} aria-hidden="true" /></Link>
              </div>
              <div className={`mk-desk-card is-org${verified ? ' is-verified' : ''}`}>
                <p className="mk-desk-kicker"><BadgeCheck size={15} aria-hidden="true" /> For the organizer</p>
                {verified ? <>
                  <h3>This page is run by its organizer.</h3>
                  <p>{org?.title ?? market.organizer ?? 'The organizer'} claimed it and we confirmed them. Dates, hours and links come from their account.</p>
                  <Link className="mk-btn" to={claimPath}>Manage or request access <ArrowUpRight size={16} aria-hidden="true" /></Link>
                </> : <>
                  <h3>Run {shortName(market)}? Make this page yours.</h3>
                  <ul className="mk-desk-perks">
                    <li><Check size={16} aria-hidden="true" /> Keep dates, hours and links right yourself</li>
                    <li><Check size={16} aria-hidden="true" /> A Verified mark beside your name</li>
                    {VERIFICATION_PRIORITY_ENABLED ? <li><Check size={16} aria-hidden="true" /> More weight when we surface listings</li> : null}
                  </ul>
                  <p className="mk-desk-fine" title={CLAIM_BENEFIT}>Free. We check every claim by hand.</p>
                  <Link className="mk-btn mk-btn-sun" to={claimPath} aria-label={`Claim this listing for ${org?.title ?? market.title}`}>Claim this listing <ArrowUpRight size={16} aria-hidden="true" /></Link>
                </>}
                <div className="mk-desk-link">
                  <span><small>Put it in your bio</small>calgarywatch.ca{entityPath(market)}</span>
                  <button type="button" onClick={() => void copyLink()}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}</button>
                </div>
              </div>
            </div>
          </section>

          {next && sameDay.length ? (
            <section className="mk-dsec" data-reveal aria-labelledby="mk-same-title">
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
            <p className="mk-side-kicker"><MapIcon size={15} aria-hidden="true" /> {[market.neighbourhood, q ? `${q} Calgary` : null].filter(Boolean).join(', ') || 'Calgary'}</p>
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
                  <li key={m.id}><Link to={entityPath(m)}><span className="mk-others-day"><small>{weekdayShort.format(new Date(n.start))}</small><b>{dayNum.format(new Date(n.start))}</b></span><span><strong>{shortName(m)}</strong><small>{[isOpen(n, now) ? 'Open now' : hours(n), m.neighbourhood].filter(Boolean).join(' · ')}</small></span></Link></li>
                ))}
              </ul>
              <Link className="mk-tile-link" to="/markets">Every market <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          ) : null}
        </aside>

        <div className="mk-dfoot">
          <SourceBadge entity={market} />
          <p className="mk-correct"><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction: ${market.title}`)}`}>Spot something out of date? Suggest a correction</a></p>
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
