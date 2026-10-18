import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Car, Map as MapIcon, Navigation, Plus, Search, ShieldCheck, Store, X } from 'lucide-react';
import type { DiscoveryEntity, Event as EventEntity, Guide, Market, MarketOccurrence } from '../../types/discovery';
import { entityPath, matchesPeriod } from '../../lib/discovery';
import {
  MARKET_TYPES, WEEK, communityFor, dayNum, directionsUrl, hasFreeParking, hours, isOpen, marketWeek, monthShort,
  neighbourhoodFor, nextOpen, quadrantOf, season, shortName, statusLine, upcoming, weekdayShort,
} from '../../lib/marketDays';
import { pickWhen } from '../../lib/eventPicks';
import { MarketCover } from '../discovery/ListingArt';
import { TEAR } from '../home/HomeHero';
import { MarketMap } from './MarketMap';
import { ProfileRibbon, useSectionReveal } from '../discovery/ProfileSections';
import '../../styles/home.css';
import '../../styles/home-board.css';
import '../../styles/markets.css';
import '../../styles/local-directory.css';
import '../../styles/local-profile.css';
import '../../styles/story-pages.css';

const DAY_MS = 86_400_000;

function Bunting() {
  const flags = Array.from({ length: 22 }, (_, i) => i);
  return (
    <svg className="mk-bunting" viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M-10 8 Q720 62 1450 8" className="mk-bunting-line" />
      {flags.map(i => {
        const x = 20 + i * 66;
        const t = x / 1440;
        const y = 8 + 4 * 54 * t * (1 - t) - 2;
        return <path key={i} d={`M${x - 15} ${y} L${x + 15} ${y + 1} L${x} ${y + 30} Z`} className={`mk-flag mk-flag-${i % 3}`} />;
      })}
    </svg>
  );
}

/** The soonest (or open) market, as the hero's ticket. */
function NextUp({ market, next, now }: { market: Market; next: MarketOccurrence; now: Date }) {
  const open = isOpen(next, now);
  return (
    <article className={`mk-next${open ? ' is-open' : ''}`}>
      <Link to={entityPath(market)} className="mk-next-art" tabIndex={-1} aria-hidden="true">
        <MarketCover market={market} day={weekdayShort.format(new Date(next.start))} />
      </Link>
      <div className="mk-next-body">
        <p className="mk-next-label">{open ? <><span className="cw-lb-pulse mk-pulse" aria-hidden="true" />Open right now</> : 'Next market day'}</p>
        <h2><Link to={entityPath(market)}>{market.title}</Link></h2>
        <p className="mk-next-when">{statusLine(next, now)}</p>
        <p className="mk-next-where">{market.venue && !market.title.includes(market.venue) ? `${market.venue} · ` : ''}{market.neighbourhood}{quadrantOf(market) ? ` ${quadrantOf(market)}` : ''}</p>
        <div className="mk-next-actions">
          <a className="mk-btn mk-btn-ink" href={directionsUrl(market)} target="_blank" rel="noopener noreferrer"><Navigation size={16} aria-hidden="true" /> Directions</a>
          <Link className="mk-btn" to={entityPath(market)}>Details <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>
    </article>
  );
}

function MarketRow({ market, n, occurrences, now }: { market: Market; n: number; occurrences: readonly MarketOccurrence[]; now: Date }) {
  const dates = upcoming(market, occurrences, now).filter(o => !o.cancelled);
  const next = dates[0];
  const open = isOpen(next, now);
  const fortnight = now.getTime() + 14 * DAY_MS;
  const days = new Set(dates.filter(o => Date.parse(o.start) < fortnight).map(o => weekdayShort.format(new Date(o.start))));
  const kind = season(market);
  const q = quadrantOf(market);
  return (
    <li className={`mk-row${open ? ' is-open' : ''}`} data-market={market.id}>
      <Link to={entityPath(market)}>
        <span className="mk-row-n" aria-hidden="true">{n}</span>
        <span className="mk-row-art" aria-hidden="true"><MarketCover market={market} day={next ? weekdayShort.format(new Date(next.start)) : undefined} /></span>
        <span className="mk-row-body">
          <small className="mk-row-when">{open ? <><span className="cw-lb-pulse mk-pulse" aria-hidden="true" />{statusLine(next, now)}</> : statusLine(next, now)}</small>
          <strong>{market.title}</strong>
          <span className="mk-row-place">{market.neighbourhood}{q ? <b>{q}</b> : null}</span>
          <span className="mk-row-foot">
            <span className="mk-row-week" aria-label={days.size ? `On ${[...days].join(', ')} in the next two weeks` : 'No dates in the next two weeks'}>
              {WEEK.map(d => <i key={d} className={days.has(d) ? 'on' : ''}>{d[0]}</i>)}
            </span>
            {kind ? <span className="mk-tag">{kind}</span> : null}
            {hasFreeParking(market) ? <span className="mk-tag"><Car size={12} aria-hidden="true" />Free parking</span> : null}
            {market.petFriendly ? <span className="mk-tag">Dogs welcome</span> : null}
          </span>
        </span>
        <span className="mk-row-go" aria-hidden="true"><ArrowUpRight size={18} /></span>
      </Link>
    </li>
  );
}

function MarketSearch({ query }: { query: string }) {
  const [value, setValue] = useState(query);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  useEffect(() => setValue(query), [query]);
  const go = (q: string) => {
    const params = new URLSearchParams(search);
    if (q.trim()) params.set('q', q.trim()); else params.delete('q');
    navigate(`${pathname}${params.size ? `?${params}` : ''}`, { replace: true });
  };
  return (
    <form className="mk-search" role="search" onSubmit={e => { e.preventDefault(); go(value); }}>
      <Search size={18} aria-hidden="true" />
      <label className="cw-sr" htmlFor="mk-q">Search markets</label>
      <input id="mk-q" type="search" value={value} onChange={e => setValue(e.target.value)} placeholder="Search: bakery, antiques, NW…" enterKeyHint="search" />
      {value ? <button type="button" aria-label="Clear search" onClick={() => { setValue(''); go(''); }}><X size={16} /></button> : null}
    </form>
  );
}

/**
 * /markets and /markets/this-weekend. The page answers, in order: what's open
 * now or next, which days this week have a market, which one is near me, and
 * what else to do around it.
 */
export function MarketsBoard({ items, all, occurrences, period, query }: {
  items: DiscoveryEntity[];
  all: readonly DiscoveryEntity[];
  occurrences: readonly MarketOccurrence[];
  period?: string;
  query: string;
}) {
  const [now] = useState(() => new Date());
  const [params] = useSearchParams();
  const type = params.get('type') ?? '';
  const activeType = MARKET_TYPES.find(t => t.id === type);
  const everyMarket = useMemo(() => all.filter((e): e is Market => e.kind === 'market'), [all]);

  const markets = useMemo(() => {
    const listed = items.filter((e): e is Market => e.kind === 'market').filter(m => !activeType || activeType.test(m));
    const start = (m: Market) => Date.parse(nextOpen(m, occurrences, now)?.start ?? '9999');
    return listed.sort((a, b) => start(a) - start(b));
  }, [items, activeType, occurrences, now]);

  const week = useMemo(() => marketWeek(everyMarket, occurrences, now), [everyMarket, occurrences, now]);
  const thisWeek = new Set(week.flatMap(d => d.on.map(x => x.market.id)));
  const lead = markets.find(m => nextOpen(m, occurrences, now));
  const leadNext = lead ? nextOpen(lead, occurrences, now) : undefined;
  const openNow = markets.filter(m => isOpen(nextOpen(m, occurrences, now), now));
  const fortnight = occurrences.filter(o => markets.some(m => m.id === o.marketId) && !o.cancelled && Date.parse(o.end) > now.getTime() && Date.parse(o.start) < now.getTime() + 14 * DAY_MS).length;

  const guide = all.find((e): e is Guide => e.kind === 'guide' && !!e.stops?.some(s => everyMarket.some(m => m.id === s.entityId)));
  const weekendEvents = all
    .filter((e): e is EventEntity => e.kind === 'event' && !e.cancelled && Date.parse(e.end) > now.getTime() && matchesPeriod(e.start, e.end, 'this-weekend', now))
    .sort((a, b) => (b.pricing === 'free' ? 1 : 0) - (a.pricing === 'free' ? 1 : 0) || Date.parse(a.start) - Date.parse(b.start))
    .slice(0, 3);
  const hoods = [...new Map(everyMarket.map(m => neighbourhoodFor(m, all)).filter(x => !!x).map(x => [x!.hood.id, x!.hood])).values()];
  const communities = [...new Map(everyMarket.map(communityFor).filter(c => !!c).map(c => [c!.slug, c!])).values()].slice(0, 6);

  const typeLink = (id: string) => {
    const next = new URLSearchParams(params);
    if (id && id !== type) next.set('type', id); else next.delete('type');
    return `${period ? `/markets/${period}` : '/markets'}${next.size ? `?${next}` : ''}`;
  };
  const weekendPath = `/markets${period ? '' : '/this-weekend'}${params.size ? `?${params}` : ''}`;
  const revealRef = useSectionReveal(`${period}-${type}-${query}`);
  const ribbon = [
    openNow.length ? `${openNow.length} open now` : null, `${fortnight} market ${fortnight === 1 ? 'day' : 'days'} in two weeks`,
    ...markets.slice(0, 6).map(shortName), 'CalgaryWatch Markets',
  ].filter((x): x is string => !!x);

  return (
    <div className="mk mk-index cw-home2" ref={revealRef}>
      <section className="mk-hero" aria-labelledby="mk-title">
        <Bunting />
        <div className="cw-wrap mk-hero-in">
          <div className="mk-hero-copy">
            <p className="mk-kicker"><span className="cw-lb-pulse mk-pulse" aria-hidden="true" />CalgaryWatch Markets{openNow.length ? ` · ${openNow.length} open now` : ''}</p>
            <h1 id="mk-title">{period ? <>This weekend’s <mark>markets.</mark></> : <>Market days in <mark>Calgary.</mark></>}</h1>
            <p className="mk-lead">
              {markets.length} {markets.length === 1 ? 'market' : 'markets'}, {fortnight} market {fortnight === 1 ? 'day' : 'days'} in the next two weeks.
              {' '}Every date comes straight from the organizer.
            </p>
            <div className="mk-tools">
              <MarketSearch query={query} />
              <Link to="/submit?type=market" className="mk-add"><Plus size={16} aria-hidden="true" /> Add a market</Link>
            </div>
          </div>
          {lead && leadNext ? <NextUp market={lead} next={leadNext} now={now} /> : null}
        </div>
        <svg className="h-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d={TEAR} transform="translate(0 -5)" className="h-tear-shade" />
          <path d={TEAR} className="h-tear-paper" />
        </svg>
      </section>
      <ProfileRibbon items={ribbon} />

      <div className="cw-wrap mk-page">
        <section className="mk-week" data-reveal aria-labelledby="mk-week-title">
          <header className="mk-sec-head">
            <h2 id="mk-week-title"><span>Your market week</span></h2>
            <p>Seven days, every market day. Tap one to plan it.</p>
          </header>
          <ol className="mk-week-days">
            {week.map((d, i) => (
              <li key={d.key} className={`${i === 0 ? 'is-today' : ''}${d.on.length ? '' : ' is-empty'}${['Sat', 'Sun'].includes(weekdayShort.format(d.date)) ? ' is-weekend' : ''}`}>
                <p className="mk-week-date"><span>{d.label}</span><b>{dayNum.format(d.date)}</b><small>{i < 2 ? weekdayShort.format(d.date) : monthShort.format(d.date)}</small></p>
                {d.on.length ? (
                  <ul>
                    {d.on.map(({ o, market }) => (
                      <li key={o.id}><Link to={entityPath(market)} className={isOpen(o, now) ? 'is-open' : undefined}><strong>{shortName(market)}</strong><small>{hours(o)}</small></Link></li>
                    ))}
                  </ul>
                ) : <p className="mk-week-none">No markets</p>}
              </li>
            ))}
          </ol>
        </section>

        <nav className="mk-chips" aria-label="Filter markets">
          <Link to={`/markets${type ? `?type=${type}` : ''}`} aria-current={!period ? 'page' : undefined}>All markets</Link>
          <Link to={weekendPath} aria-current={period === 'this-weekend' ? 'page' : undefined}>This weekend</Link>
          <span className="mk-chips-rule" aria-hidden="true" />
          {MARKET_TYPES.filter(t => everyMarket.some(t.test)).map(t => <Link key={t.id} to={typeLink(t.id)} aria-current={type === t.id ? 'page' : undefined}>{t.label}{type === t.id ? <X size={13} aria-hidden="true" /> : null}</Link>)}
        </nav>

        <div className="mk-main">
          <section className="mk-list" data-reveal aria-labelledby="mk-list-title">
            <header className="mk-sec-head">
              <h2 id="mk-list-title"><span>{query ? `Matching “${query}”` : activeType ? activeType.label : period ? 'On this weekend' : 'Every market'}</span></h2>
              <p>{markets.length} {markets.length === 1 ? 'market' : 'markets'}, soonest first</p>
            </header>
            {markets.length ? (
              <ol className="mk-rows">{markets.map((m, i) => <MarketRow key={m.id} market={m} n={i + 1} occurrences={occurrences} now={now} />)}</ol>
            ) : (
              <div className="mk-empty">
                <p><strong>{query ? `Nothing listed matches “${query}” yet.` : 'No markets match that right now.'}</strong> We only list dates we’ve checked with the organizer.</p>
                <p><Link to="/markets">See every market</Link> or <Link to="/submit?type=market">add one we’re missing</Link>.</p>
              </div>
            )}
          </section>
          {markets.length ? (
            <aside className="mk-side" aria-label="Where the markets are">
              <div className="mk-side-card">
                <p className="mk-side-kicker"><MapIcon size={15} aria-hidden="true" /> Where they are</p>
                <MarketMap markets={markets} openIds={thisWeek} />
                <p className="mk-side-key"><i aria-hidden="true" /> On this week <i className="off" aria-hidden="true" /> Later dates</p>
                <Link className="mk-side-live" to="/map">See what’s happening around them on the Live map <ArrowUpRight size={15} aria-hidden="true" /></Link>
              </div>
            </aside>
          ) : null}
        </div>

        <section className="mk-more" data-reveal aria-labelledby="mk-more-title">
          <header className="mk-sec-head">
            <h2 id="mk-more-title"><span>Make a morning of it</span></h2>
            <p>Markets connect to the rest of CalgaryWatch.</p>
          </header>
          <div className="mk-more-grid">
            {guide ? (
              <Link className="mk-tile mk-tile-guide" to={entityPath(guide)}>
                <span className="mk-tile-cover" aria-hidden="true">
                  <b>{guide.stops?.length ?? 0}</b>
                  <span>markets, our take on each</span>
                  {guide.facts ? <small>{guide.facts.cost} · {guide.facts.distance}</small> : null}
                </span>
                <span className="mk-tile-body">
                  <small>The guide</small>
                  <strong>{guide.title}</strong>
                  <span>{guide.summary}</span>
                  <em>Read our take on each one <ArrowRight size={15} aria-hidden="true" /></em>
                </span>
              </Link>
            ) : null}
            <div className="mk-tile mk-tile-events">
              <small>Also this weekend</small>
              <strong>Pair the market with something on.</strong>
              {weekendEvents.length ? (
                <ul>{weekendEvents.map(e => <li key={e.id}><Link to={entityPath(e)}><time dateTime={e.start}>{pickWhen(e.start)}</time><b>{e.title}</b>{e.pricing === 'free' ? <span className="mk-free">Free</span> : null}</Link></li>)}</ul>
              ) : <p>Nothing else listed for the weekend yet.</p>}
              <Link className="mk-tile-link" to="/events/this-weekend">Everything this weekend <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
            <div className="mk-tile mk-tile-hoods">
              <small>Around the markets</small>
              <strong>Know the neighbourhood before you go.</strong>
              {hoods.length ? <p className="mk-hood-chips">{hoods.map(h => <Link key={h.id} to={entityPath(h)}>{h.title}</Link>)}</p> : null}
              <p className="mk-safety"><ShieldCheck size={16} aria-hidden="true" /> How each market’s community ranks on 311 reports:</p>
              <p className="mk-hood-chips is-ghost">{communities.map(c => <Link key={c.slug} to={`/check-your-community?c=${c.slug}`}>{c.name}</Link>)}</p>
            </div>
          </div>
        </section>

        <section className="mk-bands">
          <Link to="/plans" className="mk-band mk-band-plans">
            <span className="mk-band-tag">For you</span>
            <strong>Get a Thursday email with this weekend’s markets near home.</strong>
            <span className="mk-band-go">Pick what you’re into <ArrowRight size={17} aria-hidden="true" /></span>
          </Link>
          <Link to="/for-markets" className="mk-band mk-band-hq">
            <Store size={26} aria-hidden="true" />
            <strong>Run a market? Publish your vendor lineup and take applications with Market HQ.</strong>
            <span className="mk-band-go">For organizers <ArrowRight size={17} aria-hidden="true" /></span>
          </Link>
        </section>
      </div>
    </div>
  );
}

