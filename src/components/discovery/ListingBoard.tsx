import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DiscoveryEntity, Event as EventEntity, Market, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { EventArt, MarketArt } from './ListingArt';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...opts });
const dayKey = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
const weekdayShort = fmt({ weekday: 'short' });
const weekdayLong = fmt({ weekday: 'long' });
const monthDay = fmt({ month: 'short', day: 'numeric' });
const dayNum = fmt({ day: 'numeric' });
const clock = fmt({ hour: 'numeric', minute: '2-digit' });
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const at = (iso: string) => new Date(iso);

function relativeDay(iso: string, now: Date) {
  const key = dayKey.format(at(iso));
  if (key === dayKey.format(now)) return 'Today';
  if (key === dayKey.format(new Date(now.getTime() + 86400000))) return 'Tomorrow';
  return weekdayLong.format(at(iso));
}

function price(e: EventEntity) {
  if (e.pricing === 'free') return 'Free';
  if (e.priceRange) {
    const [lo, hi] = e.priceRange.map(n => `$${Math.round(n)}`);
    return lo === hi ? lo : `${lo}–${hi}`;
  }
  return e.pricing === 'paid' ? 'Tickets' : null;
}

function upcomingDates(market: Market, occurrences: readonly MarketOccurrence[], now: Date) {
  return occurrences
    .filter(o => o.marketId === market.id && !o.cancelled && Date.parse(o.end) > now.getTime())
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function EventCard({ entity, now }: { entity: EventEntity; now: Date }) {
  const cost = price(entity);
  const place = entity.venue || entity.neighbourhood || entity.address;
  return (
    <li className="cw-lb-card cw-lb-event">
      <Link to={entityPath(entity)}>
        <span className="cw-lb-media">
          {entity.image && /^https:\/\//.test(entity.image.src)
            ? <img src={entity.image.src} alt={entity.image.alt} loading="lazy" decoding="async" />
            : <EventArt id={entity.id} title={entity.title} categories={entity.categories} />}
          <span className="cw-lb-stub" aria-hidden="true">
            <small>{weekdayShort.format(at(entity.start))}</small>
            <b>{dayNum.format(at(entity.start))}</b>
            <small>{clock.format(at(entity.start))}</small>
          </span>
          {cost ? <span className="cw-lb-price">{cost}</span> : null}
        </span>
        <span className="cw-lb-body">
          <small className="cw-lb-when">{relativeDay(entity.start, now)} · {monthDay.format(at(entity.start))} · {clock.format(at(entity.start))}</small>
          <strong>{entity.title}</strong>
          {place ? <span className="cw-lb-place">{place}{entity.neighbourhood && entity.venue ? ` · ${entity.neighbourhood}` : ''}</span> : null}
          {entity.image?.credit ? <em className="cw-lb-credit">{entity.image.credit}</em> : null}
        </span>
        <span className="cw-lb-go" aria-hidden="true"><ArrowUpRight size={18} /></span>
      </Link>
    </li>
  );
}

export function MarketCard({ entity, occurrences, now }: { entity: Market; occurrences: readonly MarketOccurrence[]; now: Date }) {
  const dates = upcomingDates(entity, occurrences, now);
  const next = dates[0];
  const open = !!next && Date.parse(next.start) <= now.getTime();
  const fortnight = now.getTime() + 14 * 86400000;
  const days = new Set(dates.filter(o => Date.parse(o.start) < fortnight).map(o => weekdayShort.format(at(o.start))));
  const seasonal = entity.tags.some(t => /seasonal/i.test(t));
  const yearRound = entity.tags.some(t => /year-round/i.test(t));
  return (
    <li className={`cw-lb-card cw-lb-market${open ? ' is-open' : ''}`}>
      <Link to={entityPath(entity)}>
        <span className="cw-lb-media">
          <MarketArt id={entity.id} title={entity.title} day={next ? weekdayShort.format(at(next.start)) : undefined} />
          {open ? <span className="cw-lb-open"><span className="cw-lb-pulse" aria-hidden="true" />Open now</span> : null}
        </span>
        <span className="cw-lb-body">
          <small className="cw-lb-when">
            {next ? (open ? `Until ${clock.format(at(next.end))} today` : `Next: ${relativeDay(next.start, now)}, ${monthDay.format(at(next.start))} · ${clock.format(at(next.start))}–${clock.format(at(next.end))}`) : 'No dates listed yet'}
          </small>
          <strong>{entity.title}</strong>
          <span className="cw-lb-place">{entity.venue && !entity.title.includes(entity.venue) ? `${entity.venue} · ` : ''}{entity.neighbourhood || entity.address}</span>
          <span className="cw-lb-week" aria-label={days.size ? `Open ${[...days].join(', ')} in the next two weeks` : undefined}>
            {WEEK.map(d => <i key={d} className={days.has(d) ? 'on' : ''}>{d[0]}</i>)}
          </span>
          <span className="cw-lb-tags">
            {yearRound ? <span>Year-round</span> : seasonal ? <span>Seasonal</span> : null}
            {entity.familyFriendly ? <span>Family friendly</span> : null}
            {entity.amenities.some(a => /parking/i.test(a)) || /free parking/i.test(entity.parking ?? '') ? <span>Free parking</span> : null}
          </span>
        </span>
        <span className="cw-lb-go" aria-hidden="true"><ArrowUpRight size={18} /></span>
      </Link>
    </li>
  );
}

function Filters({ links }: { links: { to: string; label: string; current: boolean }[] }) {
  return (
    <nav className="cw-lb-filters" aria-label="Filter listings">
      {links.map(l => <Link key={l.label} to={l.to} aria-current={l.current ? 'page' : undefined}>{l.label}</Link>)}
    </nav>
  );
}

/** Events and Markets listing pages: counts from the published inventory, never estimates. */
export function ListingBoard({ root, title, items, occurrences, filters, interests, emptyCta }: {
  root: 'events' | 'markets';
  title: string;
  items: DiscoveryEntity[];
  occurrences: readonly MarketOccurrence[];
  filters: { to: string; label: string; current: boolean }[];
  interests?: { to: string; label: string; current: boolean }[];
  emptyCta: ReactNode;
}) {
  const now = new Date();
  const [lead, ...rest] = title.split(' in ');
  const events = items.filter((e): e is EventEntity => e.kind === 'event').sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const markets = items.filter((e): e is Market => e.kind === 'market');
  const nextOf = (m: Market) => upcomingDates(m, occurrences, now)[0];
  const sortedMarkets = [...markets].sort((a, b) => (Date.parse(nextOf(a)?.start ?? '9999') - Date.parse(nextOf(b)?.start ?? '9999')));
  const openNow = sortedMarkets.filter(m => { const n = nextOf(m); return n && Date.parse(n.start) <= now.getTime(); });
  const fortnightDates = occurrences.filter(o => markets.some(m => m.id === o.marketId) && !o.cancelled && Date.parse(o.start) > now.getTime() - 86400000 && Date.parse(o.start) < now.getTime() + 14 * 86400000).length;

  const groups: { key: string; label: string; date: string; items: EventEntity[] }[] = [];
  for (const e of events) {
    const key = dayKey.format(at(e.start));
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, label: relativeDay(e.start, now), date: monthDay.format(at(e.start)), items: [] }; groups.push(g); }
    g.items.push(e);
  }

  const count = root === 'events'
    ? `${events.length} upcoming ${events.length === 1 ? 'event' : 'events'}${groups.length ? ` across ${groups.length} ${groups.length === 1 ? 'day' : 'days'}` : ''}`
    : `${markets.length} ${markets.length === 1 ? 'market' : 'markets'} · ${fortnightDates} market ${fortnightDates === 1 ? 'day' : 'days'} in the next two weeks`;

  return (
    <div className={`cw-lb cw-lb-${root}`}>
      <header className="cw-lb-head">
        <p className="cw-lb-kicker"><span className="cw-lb-pulse" aria-hidden="true" />CalgaryWatch {root === 'events' ? 'Events' : 'Markets'}</p>
        <h1>{lead}{rest.length ? <> <span>in {rest.join(' in ')}.</span></> : '.'}</h1>
        <p className="cw-lb-count">{count}. Every listing links to its organizer or ticket seller.</p>
      </header>
      <Filters links={filters} />
      {interests ? <Filters links={interests} /> : null}

      {!items.length ? <div className="cw-lb-empty">{emptyCta}</div> : root === 'events' ? (
        groups.map(g => (
          <section className="cw-lb-day" key={g.key} aria-labelledby={`d-${g.key}`}>
            <h2 id={`d-${g.key}`}><span>{g.label}</span> {g.date}<small>{g.items.length} {g.items.length === 1 ? 'event' : 'events'}</small></h2>
            <ul className="cw-lb-grid">{g.items.map(e => <EventCard key={e.id} entity={e} now={now} />)}</ul>
          </section>
        ))
      ) : (
        <>
          {openNow.length ? (
            <section className="cw-lb-day cw-lb-now" aria-labelledby="m-now">
              <h2 id="m-now"><span>Open right now</span><small>{openNow.length} {openNow.length === 1 ? 'market' : 'markets'}</small></h2>
              <ul className="cw-lb-grid">{openNow.map(m => <MarketCard key={m.id} entity={m} occurrences={occurrences} now={now} />)}</ul>
            </section>
          ) : null}
          <section className="cw-lb-day" aria-labelledby="m-all">
            <h2 id="m-all"><span>{openNow.length ? 'Every market' : 'Coming up'}</span><small>soonest first</small></h2>
            <ul className="cw-lb-grid">{sortedMarkets.filter(m => !openNow.includes(m)).map(m => <MarketCard key={m.id} entity={m} occurrences={occurrences} now={now} />)}</ul>
          </section>
        </>
      )}
    </div>
  );
}
