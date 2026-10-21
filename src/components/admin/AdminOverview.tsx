/**
 * The admin home: how CalgaryWatch is doing, then what needs a human.
 *
 * Phone first. The owner opens this between other things, so the top of the
 * page answers "is it growing?" (members, readers, plans, views, searches),
 * the next card answers "is anything broken?" with the feeds GitHub is merely
 * running late kept out of the alarm, and the queue below holds only work.
 *
 * Every figure is a real count or a dash. Nothing here estimates.
 */

import type { ReactNode } from 'react';
import {
  ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays, Clock3, Eye, HeartHandshake, Landmark,
  MailPlus, Map as MapIcon, Search, ShieldCheck, Store, Ticket, TriangleAlert, Wifi,
} from 'lucide-react';
import type { ApiHealth } from '@/src/hooks/useAdminData';
import type { AdminPulse } from '@/src/hooks/useAdminPulse';
import type { CatalogueStats } from '@/src/lib/adminPulse';
import { weekOverWeek } from '@/src/lib/adminPulse';
import { readFeed, summarizeFeeds } from '@/src/lib/feedHealth';

const nf = new Intl.NumberFormat('en-CA');
const fmt = (n?: number | null) => (n === undefined || n === null ? '—' : nf.format(n));
const pct = (part?: number, whole?: number) => (part !== undefined && whole ? Math.round((part / whole) * 100) : undefined);

export interface OverviewProps {
  name?: string;
  members?: number;
  pulse: AdminPulse;
  pageViewsTotal?: number | null;
  residentReports?: number;
  reportsToday?: number;
  apiHealths: ApiHealth[];
  catalogue: CatalogueStats;
  now?: number;
  onOpen: (section: string, view?: string) => void;
  /** The attention queue, rendered between the health card and the catalogue. */
  children?: ReactNode;
}

function greeting(now: number) {
  const hour = Number(new Intl.DateTimeFormat('en-CA', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Edmonton' }).format(now));
  return hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** Area sparkline. Draws nothing until the series is known. */
function Trend({ data, id, tone = 'var(--ao-accent)' }: { data?: number[]; id: string; tone?: string }) {
  if (!data?.length) return <span className="ao-trend ao-trend-empty" aria-hidden />;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [(i / Math.max(data.length - 1, 1)) * 100, 30 - (v / max) * 27] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return (
    <svg className="ao-trend" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.45" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,32 ${line} 100,32`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={tone} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Daily bars: honest for small counts, where a line would exaggerate one sign-up. */
function Bars({ data, label }: { data?: number[]; label: string }) {
  if (!data?.length) return <span className="ao-trend ao-trend-empty" aria-hidden />;
  const max = Math.max(...data, 1);
  return (
    <ol className="ao-bars" aria-label={`${label}: ${data.join(', ')}`}>
      {data.map((v, i) => <li key={i}><i className={v ? undefined : 'is-zero'} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} /></li>)}
    </ol>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  return <span className={`ao-delta ${value >= 0 ? 'is-up' : 'is-down'}`}>{value >= 0 ? '▲' : '▼'} {Math.abs(value)}% vs last week</span>;
}

export function AdminOverview({
  name, members, pulse, pageViewsTotal, residentReports, reportsToday, apiHealths, catalogue, now = Date.now(), onOpen, children,
}: OverviewProps) {
  const first = name?.trim().split(/\s+/)[0];
  const date = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Edmonton' }).format(now);
  const feeds = summarizeFeeds(apiHealths, now);
  const problems = apiHealths.map((api) => ({ api, reading: readFeed(api, now) })).filter((f) => f.reading.actionable);
  const late = apiHealths.filter((api) => readFeed(api, now).verdict === 'late');
  const healthTone = feeds.urgent ? 'is-critical' : feeds.problems ? 'is-attention' : 'is-ok';

  return (
    <div className="ao">
      <div className="ao-col">
      <section className="ao-hero" aria-labelledby="ao-hero-title">
        <div className="ao-hero-sky" aria-hidden />
        <div className="ao-hero-inner">
          <p className="ao-eyebrow"><span className="ao-live-dot" aria-hidden /> {date}</p>
          <h2 id="ao-hero-title" className="ao-hero-title">{greeting(now)}{first ? `, ${first}` : ''}.</h2>
          <div className="ao-hero-figure">
            <span className="ao-hero-number">{fmt(members)}</span>
            <span className="ao-hero-label">
              Calgarians signed up
              {pulse.newMembersWeek !== undefined ? <b className="ao-hero-new">+{fmt(pulse.newMembersWeek)} this week</b> : null}
            </span>
          </div>
          <div className="ao-hero-trend">
            <Bars data={pulse.signupsByDay} label="New members per day, last 14 days" />
            <span>New members · last 14 days</span>
          </div>
          <ul className="ao-hero-stats">
            <li>
              <button type="button" onClick={() => onOpen('planner')}>
                <MailPlus size={15} aria-hidden />
                <strong>{fmt(pulse.monday)}</strong>
                <span>Monday email{pct(pulse.monday, members) !== undefined ? ` · ${pct(pulse.monday, members)}%` : ''}</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onOpen('members', 'insights')}>
                <CalendarDays size={15} aria-hidden />
                <strong>{fmt(pulse.thursday)}</strong>
                <span>Event picks{pct(pulse.thursday, members) !== undefined ? ` · ${pct(pulse.thursday, members)}%` : ''}</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onOpen('members', 'insights')}>
                <Ticket size={15} aria-hidden />
                <strong>{fmt(pulse.plans)}</strong>
                <span>“I’m going” plans</span>
              </button>
            </li>
          </ul>
        </div>
      </section>

      <section className="ao-kpis" aria-label="Reach">
        <button type="button" className="ao-kpi ao-kpi-wide" onClick={() => onOpen('visitors')}>
          <span className="ao-kpi-head"><Eye size={15} aria-hidden /> Page views · 7 days</span>
          <span className="ao-kpi-number">{fmt(pulse.viewsWeek)}</span>
          <Delta value={pulse.viewsByDay ? weekOverWeek(pulse.viewsByDay) : null} />
          <Trend data={pulse.viewsByDay} id="ao-views" />
          <span className="ao-kpi-foot">{fmt(pageViewsTotal)} all time</span>
        </button>
        <button type="button" className="ao-kpi" onClick={() => onOpen('demand')}>
          <span className="ao-kpi-head"><Search size={15} aria-hidden /> Searches · 7 days</span>
          <span className="ao-kpi-number">{fmt(pulse.searchesWeek)}</span>
          <span className="ao-kpi-foot">What people looked for</span>
        </button>
        <button type="button" className="ao-kpi" onClick={() => onOpen('reports')}>
          <span className="ao-kpi-head"><ShieldCheck size={15} aria-hidden /> Resident reports</span>
          <span className="ao-kpi-number">{fmt(residentReports)}</span>
          <span className="ao-kpi-foot">{reportsToday ? `${fmt(reportsToday)} in the last 24h` : 'Kept permanently'}</span>
        </button>
      </section>

      </div>

      <div className="ao-col">
      <section className={`ao-health ${healthTone}`} aria-labelledby="ao-health-title">
        <div className="ao-health-head">
          <span className="ao-health-icon" aria-hidden>{feeds.problems ? <TriangleAlert size={18} /> : <Wifi size={18} />}</span>
          <div>
            <h2 id="ao-health-title">
              {feeds.urgent ? `${feeds.urgent} feed${feeds.urgent === 1 ? '' : 's'} need${feeds.urgent === 1 ? 's' : ''} you`
                : feeds.problems ? `${feeds.problems} feed${feeds.problems === 1 ? '' : 's'} to look at`
                  : 'Data is flowing'}
            </h2>
            <p>{fmt(feeds.live)} of {fmt(feeds.total - feeds.setup)} sources on time{feeds.late ? ` · ${feeds.late} running late` : ''}</p>
          </div>
          <button type="button" className="ao-link" onClick={() => onOpen('feeds')}>Feeds <ArrowRight size={14} aria-hidden /></button>
        </div>
        <div className="ao-health-bar" role="img" aria-label={`${feeds.live} on time, ${feeds.late} late, ${feeds.problems} with problems, ${feeds.setup} optional awaiting setup`}>
          {feeds.live ? <span className="is-ok" style={{ flexGrow: feeds.live }} /> : null}
          {feeds.late ? <span className="is-late" style={{ flexGrow: feeds.late }} /> : null}
          {feeds.problems ? <span className="is-bad" style={{ flexGrow: feeds.problems }} /> : null}
          {feeds.setup ? <span className="is-setup" style={{ flexGrow: feeds.setup }} /> : null}
        </div>
        {problems.length ? (
          <ul className="ao-health-problems">
            {problems.map(({ api, reading }) => (
              <li key={api.id}><b>{api.shortName}</b> {reading.note}</li>
            ))}
          </ul>
        ) : null}
        {late.length ? (
          <details className="ao-health-late">
            <summary><Clock3 size={14} aria-hidden /> {late.length} scheduled feed{late.length === 1 ? ' is' : 's are'} late. That’s normal.</summary>
            <p>GitHub runs scheduled jobs when it has room, which has meant every 3–5 hours rather than every 5–30 minutes. Each run still succeeds and catches up. A feed only turns red if it fails or goes 8 hours without a run.</p>
            <ul>{late.map((api) => <li key={api.id}><b>{api.shortName}</b> {readFeed(api, now).note.split(' · ')[0]}</li>)}</ul>
          </details>
        ) : null}
      </section>

      {children}
      </div>

      <section className="ao-catalogue" aria-labelledby="ao-catalogue-title">
        <div className="ao-section-head">
          <h2 id="ao-catalogue-title">On CalgaryWatch now</h2>
          <a className="ao-link" href="/events" target="_blank" rel="noreferrer">See the site <ArrowUpRight size={14} aria-hidden /></a>
        </div>
        <div className="ao-shelf">
          <button type="button" className="ao-tile ao-tile-events" onClick={() => onOpen('content')}>
            <CalendarDays size={18} aria-hidden />
            <strong>{fmt(catalogue.eventsAhead)}</strong>
            <span>events ahead</span>
            <small>{fmt(catalogue.eventsThisWeek)} this week · {fmt(catalogue.freeAhead)} free</small>
          </button>
          <button type="button" className="ao-tile ao-tile-markets" onClick={() => onOpen('content')}>
            <Store size={18} aria-hidden />
            <strong>{fmt(catalogue.markets)}</strong>
            <span>markets</span>
            <small>{fmt(catalogue.marketDatesAhead)} dates ahead</small>
          </button>
          <button type="button" className="ao-tile ao-tile-local" onClick={() => onOpen('partners')}>
            <Landmark size={18} aria-hidden />
            <strong>{fmt(catalogue.places)}</strong>
            <span>local places</span>
            <small>{fmt(catalogue.verified)} verified</small>
          </button>
          <button type="button" className="ao-tile ao-tile-areas" onClick={() => onOpen('city')}>
            <MapIcon size={18} aria-hidden />
            <strong>{fmt(catalogue.neighbourhoods)}</strong>
            <span>neighbourhood pages</span>
            <small>{fmt(catalogue.guides)} guides</small>
          </button>
        </div>
      </section>

      <nav className="ao-tools" aria-label="Admin tools">
        {[
          { id: 'partners', label: 'Claims & organizations', icon: BadgeCheck },
          { id: 'content', label: 'Events & markets', icon: CalendarDays },
          { id: 'members', label: 'Members', icon: HeartHandshake },
          { id: 'planner', label: 'Email planner', icon: MailPlus },
          { id: 'ops', label: 'Social publishing', icon: Ticket },
          { id: 'feeds', label: 'Data feeds', icon: Wifi },
        ].map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} onClick={() => onOpen(id)}>
            <Icon size={16} aria-hidden /> <span>{label}</span> <ArrowRight size={14} aria-hidden className="ao-tools-arrow" />
          </button>
        ))}
      </nav>
    </div>
  );
}
