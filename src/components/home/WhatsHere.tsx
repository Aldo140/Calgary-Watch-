import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { AgendaDay, AgendaItem } from '../../lib/discoveryCalendar';
import type { DiscoveryEntity, Neighbourhood } from '../../types/discovery';
import type { LivePulse } from '../../hooks/useLivePulse';
import { entityPath } from '../../lib/discovery';
import { timeAgo, weekendDays } from '../../lib/homeClaims';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...opts });
const dayShort = fmt({ weekday: 'short' });
const dayNum = fmt({ day: 'numeric' });
const clock = fmt({ hour: 'numeric', minute: '2-digit' });
const when = fmt({ weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** Venue line, unless the title already names it. */
const placeOf = (item: AgendaItem) => (item.place && !item.title.toLowerCase().includes(item.place.toLowerCase()) ? item.place : '');

function firstOf(days: AgendaDay[], kind: AgendaItem['kind']) {
  for (const d of days) { const hit = d.items.find(i => i.kind === kind); if (hit) return hit; }
  return undefined;
}

/** Projects a real coordinate onto the radar: centred on Centre St downtown, rim ≈ 22 km. */
const DOWNTOWN = { lat: 51.0447, lng: -114.0631 };
function radarPoint(lat: number, lng: number) {
  const x = (lng - DOWNTOWN.lng) * 70.04 / 22 * 84;
  const y = -(lat - DOWNTOWN.lat) * 110.9 / 22 * 84;
  const r = Math.hypot(x, y);
  const k = r > 84 ? 84 / r : 1;
  return { x: 100 + x * k, y: 100 + y * k };
}

const QUAD_PIN: Record<string, [number, number]> = { NW: [62, 40], NE: [178, 40], SW: [62, 114], SE: [178, 114] };
const QUAD_RECT: Record<string, [number, number]> = { NW: [0, 0], NE: [120, 0], SW: [0, 75], SE: [120, 75] };

function Card({ to, n, title, desc, className, children }: { to: string; n: string; title: string; desc: string; className: string; children: ReactNode }) {
  return (
    <li className={`h-way ${className}`}>
      <Link to={to}>
        <span className="h-way-head">
          <small>{n}</small>
          <strong>{title}</strong>
          <span className="h-way-go" aria-hidden="true"><ArrowUpRight size={18} /></span>
        </span>
        <span className="h-way-desc">{desc}</span>
        {children}
      </Link>
    </li>
  );
}

function Radar({ report }: { report?: { lat?: number; lng?: number } | null }) {
  const blip = report && report.lat !== undefined && report.lng !== undefined ? radarPoint(report.lat, report.lng) : null;
  return (
    <svg className="h-radar" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="h-sweep" gradientUnits="userSpaceOnUse" x1="100" y1="12" x2="162" y2="38">
          <stop offset="0" stopColor="#00c2e0" stopOpacity="0" />
          <stop offset="1" stopColor="#00c2e0" stopOpacity=".5" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="88" className="h-radar-face" />
      <circle cx="100" cy="100" r="60" /><circle cx="100" cy="100" r="32" />
      <path d="M100,12V188M12,100H188" />
      <path className="h-radar-bow" d="M14,86 C40,80 62,104 92,98 S130,90 146,108 S170,150 186,160" />
      <text x="20" y="30">NW</text><text x="164" y="30">NE</text><text x="20" y="182">SW</text><text x="166" y="182">SE</text>
      <g className="h-radar-sweep">
        <path d="M100,100 L100,12 A88,88 0 0 1 162.2,37.8 Z" fill="url(#h-sweep)" />
        <line x1="100" y1="100" x2="162.2" y2="37.8" />
      </g>
      <circle cx="100" cy="100" r="3" className="h-radar-core" />
      {blip ? (
        <g transform={`translate(${blip.x.toFixed(1)} ${blip.y.toFixed(1)})`}>
          <circle r="5" className="h-radar-ping" />
          <circle r="4.5" className="h-radar-blip" />
        </g>
      ) : null}
    </svg>
  );
}

function QuadrantMap({ quadrant }: { quadrant?: string }) {
  const q = quadrant?.toUpperCase();
  const rect = q ? QUAD_RECT[q] : undefined;
  const [px, py] = (q && QUAD_PIN[q]) || [120, 75];
  return (
    <svg className="h-mini-map" viewBox="0 0 240 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="h-streets" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16,0H0V16" /></pattern>
        <pattern id="h-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0V7" /></pattern>
      </defs>
      <rect width="240" height="150" className="h-mini-ground" />
      <rect width="240" height="150" fill="url(#h-streets)" />
      {rect ? <><rect x={rect[0]} y={rect[1]} width="120" height="75" className="h-mini-lit" /><rect x={rect[0]} y={rect[1]} width="120" height="75" fill="url(#h-hatch)" /></> : null}
      <path className="h-mini-bow" d="M-4,52 C30,46 60,74 96,70 S140,62 158,80 S188,124 244,138" />
      <path className="h-mini-axis" d="M120,0V150M0,75H240" />
      <text x="8" y="16">NW</text><text x="214" y="16">NE</text><text x="8" y="142">SW</text><text x="216" y="142">SE</text>
      <g transform={`translate(${px} ${py + 10})`}><g className="h-mini-pin">
        <path d="M0,0C-6,-8 -10,-13 -10,-19A10,10 0 1 1 10,-19C10,-13 6,-8 0,0Z" />
        <circle cy="-19" r="3.6" />
      </g></g>
    </svg>
  );
}

function Envelope() {
  return (
    <svg className="h-envelope" viewBox="0 0 220 140" aria-hidden="true" focusable="false">
      <rect x="8" y="16" width="204" height="116" rx="10" className="h-env-body" />
      <path className="h-env-fold" d="M8,130L88,72M212,130L132,72" />
      <path className="h-env-flap" d="M10,22L110,86L210,22" />
      <rect x="168" y="26" width="32" height="38" rx="2" className="h-env-stamp" />
      <path className="h-env-tower" d="M184,58V40M180,40H188M181,44H187" />
      <g className="h-env-post" transform="rotate(-14 150 66)">
        <circle cx="150" cy="66" r="31" className="h-env-ring-outer" />
        <circle cx="150" cy="66" r="21" />
        <circle cx="150" cy="66" r="11" className="h-env-ring-home" />
        <text x="150" y="69.5" textAnchor="middle">MON</text>
        <path className="h-env-cancel" d="M30,52q10,-6 20,0t20,0t20,0t20,0M30,64q10,-6 20,0t20,0t20,0t20,0M30,76q10,-6 20,0t20,0t20,0t20,0" />
      </g>
    </svg>
  );
}

/**
 * A one-glance tour of what the site holds, each card carrying a real,
 * current example: a market actually on this weekend, an event actually
 * listed, the newest public report placed at its real location. A card whose
 * example isn't available just describes the feature; nothing is filled in.
 */
export function WhatsHere({ days, entities, pulse }: { days: AgendaDay[]; entities: readonly DiscoveryEntity[]; pulse: LivePulse }) {
  const weekend = weekendDays(days);
  const weekendMarket = firstOf(weekend, 'market');
  const market = weekendMarket ?? firstOf(days, 'market');
  const event = firstOf(days, 'event');
  const hoods = entities.filter((e): e is Neighbourhood => e.kind === 'neighbourhood');
  const hood = hoods.length ? hoods[new Date().getDate() % hoods.length] : undefined;
  const { example: report, status, total, capped, checkedAt } = pulse.reports;

  return (
    <section className="h-ways" aria-labelledby="h-ways-title">
      <div className="h-ways-head">
        <h2 id="h-ways-title">One city, <span>five ways in.</span></h2>
        <p>What’s on, what’s open and what’s going on near you. Every example below is real and current.</p>
        <span className="h-ways-swipe" aria-hidden="true">Swipe →</span>
      </div>

      <ul className="h-ways-grid">
        <Card to={market ? market.to : '/markets'} n="01" title="Markets" desc="Farmers’ and makers’ markets, with the next real date." className="h-way-market">
          <span className="h-awning" aria-hidden="true" />
          {market ? (
            <span className="h-pricetag">
              <small>{weekendMarket ? 'On this weekend' : 'Coming up'}</small>
              <b>{market.title}</b>
              <em>{when.format(new Date(market.start))}{placeOf(market) ? ` · ${placeOf(market)}` : ''}</em>
            </span>
          ) : <span className="h-pricetag"><b>Browse every market</b></span>}
        </Card>

        <Card to={event ? event.to : '/events'} n="02" title="Events" desc="Shows, talks and workshops, checked against the organizer." className="h-way-event">
          {event ? (
            <span className="h-ticket">
              <span className="h-ticket-stub">
                <small>{dayShort.format(new Date(event.start))}</small>
                <b>{dayNum.format(new Date(event.start))}</b>
                <small>{clock.format(new Date(event.start))}</small>
              </span>
              <span className="h-ticket-main">
                <small>Next on the calendar</small>
                <b>{event.title}</b>
                {placeOf(event) ? <em>{placeOf(event)}</em> : null}
              </span>
            </span>
          ) : <span className="h-ticket"><span className="h-ticket-main"><b>See what’s listed</b></span></span>}
        </Card>

        <Card to="/map" n="03" title="Live map" desc="Break-ins, closures, outages and weather, each with its source." className="h-way-live">
          <Radar report={report} />
          <span className="h-dispatch" aria-live="polite">
            {report ? (
              <>
                <small><span className="h-pulse" aria-hidden="true" /> Latest{report.neighborhood && !report.title.includes(report.neighborhood) ? ` · ${report.neighborhood}` : ''} · {timeAgo(report.timestamp, checkedAt ?? report.timestamp)}</small>
                <b>{report.title}</b>
              </>
            ) : status === 'ready' ? <b>Nothing reported in the last 24 hours</b>
              : status === 'error' ? <b>Open the live map</b>
              : <span className="h-dispatch-skeleton" />}
            {status === 'ready' && total ? <em>{total}{capped ? '+' : ''} public report{total === 1 ? '' : 's'} in the last 24 hours</em> : null}
          </span>
        </Card>

        <Card to={hood ? entityPath(hood) : '/neighbourhoods'} n="04" title="Neighbourhoods" desc="Guides to the city’s pockets, quadrant by quadrant." className="h-way-hood">
          <QuadrantMap quadrant={hood?.quadrant} />
          <span className="h-way-pick">
            <small>Today’s pick{hood ? ` · ${hood.quadrant}` : ''}</small>
            <b>{hood ? hood.title : 'Explore by quadrant'}</b>
          </span>
        </Card>

        <Card to="/map?settings=alerts" n="05" title="Monday digest" desc="What was reported near home, in your inbox every Monday." className="h-way-mail">
          <Envelope />
          <span className="h-way-pick">
            <small>Your rings</small>
            <b>15-min walk · 3 km · 10 km</b>
          </span>
        </Card>
      </ul>
    </section>
  );
}
