import { ArrowUpRight, CalendarDays, CheckCircle2, MapPin, Repeat2, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { entityPath } from '../../lib/discovery';
import { upcomingOccurrences } from '../../lib/discoveryCalendar';
import type { DiscoveryEntity, MarketOccurrence } from '../../types/discovery';

type Market = Extract<DiscoveryEntity, { kind: 'market' }>;

function nextOpening(market: Market, occurrences: readonly MarketOccurrence[]) {
  return upcomingOccurrences(occurrences, market.id)[0];
}

function dayParts(iso: string) {
  const date = new Date(iso);
  return {
    weekday: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short' }).format(date),
    day: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', day: 'numeric' }).format(date),
    month: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short' }).format(date),
    time: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' }).format(date),
  };
}

export function RecurringNow({ entities, occurrences }: { entities: DiscoveryEntity[]; occurrences: readonly MarketOccurrence[] }) {
  const markets = entities
    .filter((entity): entity is Market => entity.kind === 'market')
    .map(market => ({ market, opening: nextOpening(market, occurrences) }))
    .filter((item): item is { market: Market; opening: MarketOccurrence } => Boolean(item.opening))
    .sort((a, b) => Date.parse(a.opening.start) - Date.parse(b.opening.start))
    .slice(0, 4);

  if (!markets.length) return null;

  return (
    <section className="cw-recurring" aria-labelledby="cw-recurring-heading">
      <img className="cw-recurring-mark" src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" aria-hidden="true" />
      <div className="cw-recurring-lead">
        <div className="cw-recurring-header-badge" aria-hidden="true">
          <Sparkles size={13} />
          <span>WEEKLY COMMUNITY FIXTURES</span>
        </div>
        <p className="cw-eyebrow"><Repeat2 size={14} /> Always happening</p>
        <h2 id="cw-recurring-heading">Good plans.<br />On repeat.</h2>
        <p>Markets and neighbourhood rituals you can count on, checked against the organizer’s current schedule.</p>
        <Link className="cw-text-link" to="/markets">See every recurring market <ArrowUpRight size={16} /></Link>
      </div>
      <div className="cw-recurring-grid">
        {markets.map(({ market, opening }, index) => {
          const date = dayParts(opening.start);
          return (
            <Link className={`cw-recurring-card cw-recurring-card-${index + 1}`} key={market.id} to={entityPath(market)}>
              <span className="cw-recurring-date" aria-label={`${date.weekday}, ${date.month} ${date.day}`}>
                <span className="cw-date-punch cw-punch-l" aria-hidden="true" />
                <span className="cw-date-punch cw-punch-r" aria-hidden="true" />
                <span className="cw-date-header-bar" aria-hidden="true">YYC</span>
                <b>{date.weekday}</b>
                <strong>{date.day}</strong>
                <small>{date.month}</small>
              </span>
              <span className="cw-recurring-copy">
                <span className="cw-recurring-timing-row">
                  <small><CalendarDays size={12} /> {date.time}</small>
                  <span className="cw-recurring-verified"><CheckCircle2 size={11} /> Verified</span>
                </span>
                <strong>{market.title}</strong>
                <span className="cw-recurring-location"><MapPin size={13} /> {market.neighbourhood || market.venue || market.address}</span>
              </span>
              <ArrowUpRight className="cw-recurring-arrow" size={20} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
