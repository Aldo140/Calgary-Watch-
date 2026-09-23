import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Mail, MapPinned, Radio, ShoppingBasket } from 'lucide-react';
import type { AgendaDay, AgendaItem } from '../../lib/discoveryCalendar';
import type { DiscoveryEntity, Neighbourhood } from '../../types/discovery';
import type { LivePulse } from '../../hooks/useLivePulse';
import { entityPath } from '../../lib/discovery';
import { timeAgo, weekendDays } from '../../lib/homeClaims';

const when = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** Venue line, unless the title already names it ("Calgary Farmers' Market South · Calgary Farmers' Market South"). */
const placeOf = (item: AgendaItem) => (item.place && !item.title.toLowerCase().includes(item.place.toLowerCase()) ? ` · ${item.place}` : '');

function firstOf(days: AgendaDay[], kind: AgendaItem['kind']) {
  for (const d of days) { const hit = d.items.find(i => i.kind === kind); if (hit) return hit; }
  return undefined;
}

/**
 * A one-glance tour of what the site holds, each card proven by a real,
 * current example: a market actually on this weekend, an event actually
 * listed, the newest public report on the live map. A card whose example
 * isn't available just describes the feature; nothing is filled in.
 */
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
        <p>What’s on, what’s open and what’s going on near you. Here’s a real example of each, from right now.</p>
      </div>

      <ul className="h-here-grid">
        <li className="h-here-card h-here-market">
          <Link to={market ? market.to : '/markets'}>
            <span className="h-here-icon"><ShoppingBasket size={20} /></span>
            <strong>Markets</strong>
            <span className="h-here-desc">Farmers’ and makers’ markets with their next real date.</span>
            <span className="h-here-example">
              <small>{market ? (marketIsWeekend ? 'On this weekend' : 'Coming up') : 'Every market'}</small>
              {market ? <><b>{market.title}</b><em>{when.format(new Date(market.start))}{placeOf(market)}</em></> : <b>Browse recurring markets</b>}
            </span>
            <ArrowUpRight className="h-here-arrow" size={18} aria-hidden="true" />
          </Link>
        </li>

        <li className="h-here-card h-here-event">
          <Link to={event ? event.to : '/events'}>
            <span className="h-here-icon"><CalendarDays size={20} /></span>
            <strong>Events</strong>
            <span className="h-here-desc">Shows, talks and workshops, checked against the organizer.</span>
            <span className="h-here-example">
              <small>{event ? 'Next on the calendar' : 'All events'}</small>
              {event ? <><b>{event.title}</b><em>{when.format(new Date(event.start))}{placeOf(event)}</em></> : <b>See what’s listed</b>}
            </span>
            <ArrowUpRight className="h-here-arrow" size={18} aria-hidden="true" />
          </Link>
        </li>

        <li className="h-here-card h-here-live">
          <Link to="/map">
            <span className="h-here-icon"><Radio size={20} /></span>
            <strong>Live map</strong>
            <span className="h-here-desc">Break-ins, disturbances, closures, outages and weather, each with its source.</span>
            <span className="h-here-example" aria-live="polite">
              <small><span className="h-pulse" aria-hidden="true" /> {report ? `Latest · ${timeAgo(report.timestamp, now)}` : 'Right now'}</small>
              {report
                ? <><b>{report.title}</b><em>{report.neighborhood && !report.title.includes(report.neighborhood) ? `${report.neighborhood} · ` : ''}public report</em></>
                : pulse.reports.status === 'loading' || pulse.reports.status === 'idle'
                  ? <b className="h-here-skeleton" aria-hidden="true" />
                  : <b>{pulse.reports.status === 'ready' ? 'Nothing reported in the last 24 hours' : 'Open the live map'}</b>}
            </span>
            <ArrowUpRight className="h-here-arrow" size={18} aria-hidden="true" />
          </Link>
        </li>

        <li className="h-here-card h-here-hood">
          <Link to={hood ? entityPath(hood) : '/neighbourhoods'}>
            <span className="h-here-icon"><MapPinned size={20} /></span>
            <strong>Neighbourhoods</strong>
            <span className="h-here-desc">Guides to the city’s pockets, quadrant by quadrant.</span>
            <span className="h-here-example">
              <small>{hood ? `Today’s pick · ${hood.quadrant}` : 'All neighbourhoods'}</small>
              {hood ? <><b>{hood.title}</b><em>{hood.summary}</em></> : <b>Explore by quadrant</b>}
            </span>
            <ArrowUpRight className="h-here-arrow" size={18} aria-hidden="true" />
          </Link>
        </li>

        <li className="h-here-card h-here-mail">
          <Link to="/map?settings=alerts">
            <span className="h-here-icon"><Mail size={20} /></span>
            <strong>Monday email</strong>
            <span className="h-here-desc">What was reported near home, delivered every Monday.</span>
            <span className="h-here-example h-here-rings">
              <svg viewBox="0 0 120 64" aria-hidden="true">
                <circle cx="60" cy="32" r="30" /><circle cx="60" cy="32" r="20" /><circle cx="60" cy="32" r="10" />
                <path d="M55,35V30L60,26L65,30V35Z" />
              </svg>
              <em>15-min walk · 3 km · 10 km</em>
            </span>
            <ArrowUpRight className="h-here-arrow" size={18} aria-hidden="true" />
          </Link>
        </li>
      </ul>
    </section>
  );
}
