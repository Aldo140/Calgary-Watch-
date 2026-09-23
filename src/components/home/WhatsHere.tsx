import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Mail, MapPinned, Radio, ShoppingBasket } from 'lucide-react';
import type { AgendaDay, AgendaItem } from '../../lib/discoveryCalendar';
import type { DiscoveryEntity, Neighbourhood } from '../../types/discovery';
import type { LivePulse } from '../../hooks/useLivePulse';
import { entityPath } from '../../lib/discovery';
import { timeAgo, weekendDays } from '../../lib/homeClaims';

const when = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', hour: 'numeric', minute: '2-digit' });

const placeOf = (item: AgendaItem) => (item.place && !item.title.toLowerCase().includes(item.place.toLowerCase()) ? ` · ${item.place}` : '');

function firstOf(days: AgendaDay[], kind: AgendaItem['kind']) {
  for (const d of days) { const hit = d.items.find(i => i.kind === kind); if (hit) return hit; }
  return undefined;
}

export function WhatsHere({ days, entities, pulse }: { days: AgendaDay[]; entities: readonly DiscoveryEntity[]; pulse: LivePulse }) {
  const weekend = weekendDays(days);
  const market = firstOf(weekend, 'market') ?? firstOf(days, 'market');
  const marketIsWeekend = !!market && !!firstOf(weekend, 'market');
  const event = firstOf(days, 'event');
  const hoods = entities.filter((e): e is Neighbourhood => e.kind === 'neighbourhood');
  const hood = hoods.length ? hoods[new Date().getDate() % hoods.length] : undefined;
  const report = pulse.reports.example;
  const now = pulse.reports.checkedAt ?? 0;

  return (
    <section className="h-here" aria-labelledby="h-here-title">
      <div className="h-here-head">
        <h2 id="h-here-title">One city, five ways in.</h2>
        <p>What's on, what's open and what's going on near you. Here's a real example of each, from right now.</p>
      </div>

      <ul className="h-here-grid">
        <li className="h-here-card h-here-card-tall h-here-market">
          <Link to={market ? market.to : '/markets'}>
            <span className="h-here-icon"><ShoppingBasket size={28} /></span>
            <strong>Markets</strong>
            <p className="h-here-desc">Farmers and makers markets with their next real date.</p>
            {market ? (
              <div className="h-here-sample">
                <div className="h-here-badge">{marketIsWeekend ? 'ON THIS WEEKEND' : 'COMING UP'}</div>
                <div className="h-here-content">
                  <h3>{market.title}</h3>
                  <p className="h-here-meta">{when.format(new Date(market.start))}{placeOf(market)}</p>
                </div>
              </div>
            ) : (
              <div className="h-here-sample h-here-sample-empty"><b>Browse recurring markets</b></div>
            )}
            <ArrowUpRight className="h-here-arrow" size={20} aria-hidden="true" />
          </Link>
        </li>

        <li className="h-here-card h-here-card-tall h-here-event">
          <Link to={event ? event.to : '/events'}>
            <span className="h-here-icon"><CalendarDays size={28} /></span>
            <strong>Events</strong>
            <p className="h-here-desc">Shows, talks and workshops, checked against the organizer.</p>
            {event ? (
              <div className="h-here-sample">
                <div className="h-here-badge">NEXT ON CALENDAR</div>
                <div className="h-here-content">
                  <h3>{event.title}</h3>
                  <p className="h-here-meta">{when.format(new Date(event.start))}{placeOf(event)}</p>
                </div>
              </div>
            ) : (
              <div className="h-here-sample h-here-sample-empty"><b>See what is listed</b></div>
            )}
            <ArrowUpRight className="h-here-arrow" size={20} aria-hidden="true" />
          </Link>
        </li>

        <li className="h-here-card h-here-card-stack h-here-live">
          <Link to="/map">
            <span className="h-here-icon"><Radio size={28} /></span>
            <strong>Live</strong>
            <p className="h-here-desc">Break-ins, reports, weather, outages.</p>
            {report ? (
              <div className="h-here-sample h-here-sample-live" aria-live="polite">
                <div className="h-here-live-pulse"><span className="h-pulse" aria-hidden="true" /></div>
                <div className="h-here-content">
                  <h3>{report.title}</h3>
                  <p className="h-here-meta">{report.neighborhood && !report.title.includes(report.neighborhood) ? report.neighborhood : 'Public report'} · {timeAgo(report.timestamp, now)}</p>
                </div>
              </div>
            ) : pulse.reports.status === 'loading' || pulse.reports.status === 'idle' ? (
              <div className="h-here-sample h-here-skeleton-wrap"><div className="h-here-skeleton" /></div>
            ) : (
              <div className="h-here-sample h-here-sample-empty"><b>{pulse.reports.status === 'ready' ? 'Quiet 24h' : 'Open map'}</b></div>
            )}
            <ArrowUpRight className="h-here-arrow" size={20} aria-hidden="true" />
          </Link>
        </li>

        <li className="h-here-card h-here-hood">
          <Link to={hood ? entityPath(hood) : '/neighbourhoods'}>
            <span className="h-here-icon"><MapPinned size={28} /></span>
            <strong>Explore</strong>
            <p className="h-here-desc">City guides, quadrant by quadrant.</p>
            {hood ? (
              <div className="h-here-sample h-here-sample-compact">
                <p className="h-here-meta-small">{hood.quadrant}</p>
                <h3>{hood.title}</h3>
              </div>
            ) : (
              <div className="h-here-sample h-here-sample-empty"><b>Browse all</b></div>
            )}
            <ArrowUpRight className="h-here-arrow" size={20} aria-hidden="true" />
          </Link>
        </li>

        <li className="h-here-card h-here-mail">
          <Link to="/map?settings=alerts">
            <span className="h-here-icon"><Mail size={28} /></span>
            <strong>Digest</strong>
            <p className="h-here-desc">Monday safety summary.</p>
            <div className="h-here-sample h-here-sample-rings">
              <svg viewBox="0 0 100 60" aria-hidden="true">
                <circle cx="50" cy="30" r="28" />
                <circle cx="50" cy="30" r="18" />
                <circle cx="50" cy="30" r="8" />
                <path d="M46,33V28L50,24L54,28V33Z" />
              </svg>
            </div>
            <ArrowUpRight className="h-here-arrow" size={20} aria-hidden="true" />
          </Link>
        </li>
      </ul>
    </section>
  );
}
