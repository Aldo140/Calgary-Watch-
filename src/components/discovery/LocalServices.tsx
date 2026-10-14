import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowUpRight, Bug, Car, CarFront, CalendarClock, Disc3, Droplets, Fence, Flame, Hammer, House, KeyRound, Lightbulb,
  PawPrint, Scissors, Snowflake, Sparkles, Sprout, WashingMachine, Wrench, Zap, type LucideIcon,
} from 'lucide-react';
import type { Business } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { inPeak, LOCAL_SERVICES, offersService, SERVICE_GROUPS, type LocalService, type ServiceGroup } from '../../data/localServices';

const ICONS: Record<string, LucideIcon> = {
  plumbing: Droplets, electrical: Zap, heating: Flame, roofing: House, handyman: Hammer, cleaning: Sparkles, pest: Bug,
  appliances: WashingMachine, locksmith: KeyRound, snow: Snowflake, yard: Sprout, fencing: Fence, mechanic: CarFront,
  tires: Disc3, glass: Car, tailoring: Scissors, repair: Wrench, pets: PawPrint,
};
const GROUPS = Object.keys(SERVICE_GROUPS) as ServiceGroup[];
const MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'long' });
const calgaryMonth = (d: Date) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'numeric' }).format(d));

const recommendHref = (s: LocalService) => `mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Recommending a Calgary ${s.trades[0]}`)}&body=${encodeURIComponent('Name and website:\n\nWhy I’d recommend them:\n')}`;

function Icon({ id, size = 20 }: { id: string; size?: number }) {
  const I = ICONS[id] ?? Wrench;
  return <I size={size} aria-hidden="true" />;
}

/** What Calgarians book this month, so the directory answers "what should I sort out now?". */
function BusyNow({ month, now }: { month: number; now: Date }) {
  const busy = LOCAL_SERVICES.filter(s => inPeak(s, month));
  if (!busy.length) return null;
  return (
    <div className="cw-svc-now">
      <p><CalendarClock size={16} aria-hidden="true" /><b>{MONTH.format(now)} in Calgary:</b> book these before everyone else does</p>
      <ul>{busy.map(s => <li key={s.id}><Link to={`/local/services#svc-${s.id}`}><Icon id={s.id} size={15} />{s.label}</Link></li>)}</ul>
    </div>
  );
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Every service against the twelve months: when Calgarians book it most, with this month marked. */
function ServiceYear({ month }: { month: number }) {
  return (
    <div className="cw-svc-year" role="table" aria-label="When Calgarians book each service">
      <div className="cw-svc-year-row cw-svc-year-head" role="row">
        <span role="columnheader">Service</span>
        {MONTHS.map((m, i) => <span key={i} role="columnheader" aria-label={MONTH_NAMES[i]} className={i + 1 === month ? 'is-now' : undefined}>{m}</span>)}
      </div>
      {LOCAL_SERVICES.map(s => (
        <div key={s.id} className={`cw-svc-year-row cw-svc-group-${s.group}`} role="row">
          <a role="rowheader" href={`#svc-${s.id}`}><Icon id={s.id} size={15} />{s.label}</a>
          {MONTHS.map((_, i) => {
            const peak = s.peak.includes(i + 1);
            return <span key={i} role="cell" className={`${peak ? 'is-peak' : ''}${i + 1 === month ? ' is-now' : ''}`} aria-label={`${MONTH_NAMES[i]}: ${peak ? 'busy' : 'quiet'}`} />;
          })}
        </div>
      ))}
      <p className="cw-svc-year-key"><i className="is-peak" aria-hidden="true" /> Busiest months · <i className="is-now" aria-hidden="true" /> {MONTH_NAMES[month - 1]}, right now</p>
    </div>
  );
}

/** A compact index of every service on the main Local page. */
export function ServicesIndex({ places, now = new Date() }: { places: Business[]; now?: Date }) {
  const month = calgaryMonth(now);
  return (
    <section className="cw-svc cw-svc-index" aria-labelledby="svc-index">
      <div className="cw-loc-section-head">
        <div>
          <p className="lx-eyebrow">For the house, the yard and the car</p>
          <h2 id="svc-index">Services <mark>Calgarians need.</mark></h2>
        </div>
        <p>Plumbers, furnace techs, snow removal and the rest, with what to ask before you hire. <Link to="/local/services">See every service <ArrowUpRight size={14} aria-hidden="true" /></Link></p>
      </div>
      <BusyNow month={month} now={now} />
      <div className="cw-svc-groups">
        {GROUPS.map(g => (
          <div key={g} className={`cw-svc-group cw-svc-group-${g}`}>
            <h3>{SERVICE_GROUPS[g].label}</h3>
            <ul>
              {LOCAL_SERVICES.filter(s => s.group === g).map(s => {
                const n = places.filter(p => offersService(p, s)).length;
                return (
                  <li key={s.id}>
                    <Link to={`/local/services#svc-${s.id}`}>
                      <span className="cw-svc-ico"><Icon id={s.id} size={18} /></span>
                      <span className="cw-svc-name">{s.label}<small>{n ? `${n} listed` : s.trades.slice(1).join(', ')}</small></span>
                      {inPeak(s, month) ? <i className="cw-svc-busy">Busy now</i> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The full directory on /local/services: every service with a hiring tip and how to fill it. */
export function ServicesDirectory({ places, now = new Date() }: { places: Business[]; now?: Date }) {
  const month = calgaryMonth(now);
  const { hash } = useLocation();
  // Links from the index land on one service; scroll it into view once it renders.
  useEffect(() => {
    if (!hash.startsWith('#svc-')) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);
  return (
    <section className="cw-svc cw-svc-full" aria-labelledby="svc-full">
      <div className="cw-loc-section-head">
        <div>
          <p className="lx-eyebrow">Book before the rush</p>
          <h2 id="svc-full">The Calgary <mark>year.</mark></h2>
        </div>
        <p>When Calgarians book each service, month by month. We only list a business after checking it against its own site; until a service has picks, you get the questions worth asking first.</p>
      </div>
      <BusyNow month={month} now={now} />
      <ServiceYear month={month} />
      {GROUPS.map((g, gi) => (
        <div key={g} className={`cw-svc-block cw-svc-group-${g}`}>
          <h3 className="cw-svc-block-head"><i>{String(gi + 1).padStart(2, '0')}</i>{SERVICE_GROUPS[g].label}<small>{SERVICE_GROUPS[g].blurb}</small></h3>
          <ul className="cw-svc-cards">
            {LOCAL_SERVICES.filter(s => s.group === g).map(s => {
              const listed = places.filter(p => offersService(p, s));
              return (
                <li key={s.id} id={`svc-${s.id}`} className={`cw-svc-card cw-svc-group-${g}`}>
                  <div className="cw-svc-card-top">
                    <span className="cw-svc-ico"><Icon id={s.id} size={22} /></span>
                    <h4>{s.label}</h4>
                    {inPeak(s, month) ? <i className="cw-svc-busy">Busy now</i> : null}
                  </div>
                  <p className="cw-svc-trades">{s.trades.join(' · ')}</p>
                  <p className="cw-svc-tip"><Lightbulb size={15} aria-hidden="true" /><span>{s.tip}</span></p>
                  {listed.length ? (
                    <ul className="cw-svc-listed">{listed.map(p => <li key={p.id}><Link to={entityPath(p)}>{p.title}<small>{p.neighbourhood}</small></Link></li>)}</ul>
                  ) : null}
                  <div className="cw-svc-actions">
                    <a href={recommendHref(s)}>Recommend one</a>
                    <Link to="/partners">Get listed free <ArrowUpRight size={13} aria-hidden="true" /></Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
