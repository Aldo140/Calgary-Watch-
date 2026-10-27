import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Bell, Check, Compass, MapPin, Navigation, Pencil, Sparkles, Ticket } from 'lucide-react';
import { RadarArt } from '../home/HomeYours';
import { EnvelopeArt } from './SignupFlow';
import { GoingButton } from './GoingButton';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { pickWhenAt, type PickItem } from '../../lib/eventPicks';
import { startsIn, type EmailPlan, type NearReport, type Spotlight } from '../../lib/memberHome';
import '../../styles/plans-dayboard.css';

/*
 * The top of the member dashboard: one big answer chosen for this member
 * right now (a plan happening now, one tonight, the next one ahead, or a
 * pick to make the next plan from), with near home and the next email as
 * two small answers beside it. Every state has its own look, so a member
 * can tell at a glance whether today is a going-out day.
 */

const fmt = (t: number | string, o: Intl.DateTimeFormatOptions) => calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...o }).format(new Date(t));
const time = (t: number | string) => fmt(t, { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
const placeOf = (i: PickItem) => i.venue || i.neighbourhood || '';
const directions = (i: PickItem) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${i.venue || i.neighbourhood}, Calgary`)}`;

export interface DayBoardProps {
  spotlight: Spotlight;
  area: string;
  near: NearReport[];
  nearReady: boolean;
  plan: EmailPlan;
  now: number;
  picks: number;
  /** The email tile's button: turn one on, add the other, or change. */
  emailAction: ReactNode;
  onEdit: (focus?: 'home' | 'emails' | 'interests') => void;
  art: (item: PickItem) => ReactNode;
  /** A demo or admin view: show the RSVP button without saving. */
  preview?: boolean;
  /** The setup strip under the board. */
  footer?: ReactNode;
}

export function DayBoard(p: DayBoardProps) {
  const reduce = useReducedMotion();
  const kind = p.spotlight.kind;
  return (
    <motion.section
      id="pd-today" className="pd-today pd-db" data-kind={kind} aria-labelledby="pd-today-title"
      initial={reduce ? false : { opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 150, damping: 20, delay: 0.2 }}
    >
      <div className="pd-today-head">
        <h2 id="pd-today-title" className="pd-kicker">Your day · {fmt(p.now, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
        {p.area ? <span className="pd-tag"><MapPin size={12} aria-hidden="true" /> {p.area}</span> : null}
      </div>
      <div className="pd-db-grid">
        <Spot {...p} />
        <div className="pd-db-side">
          <NearMini {...p} />
          <EmailMini {...p} />
        </div>
      </div>
      {p.footer}
    </motion.section>
  );
}

/** Re-renders every minute, for "starts in 2 h 10 min". */
function useMinute(start: number): number {
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return Math.max(now, start);
}

function Spot(p: DayBoardProps) {
  const s = p.spotlight;
  const now = useMinute(p.now);
  if (s.kind === 'starter') return <Starter {...p} pick={s.pick} been={s.been} />;
  if (s.kind === 'quiet') return <Quiet {...p} been={s.been} />;
  const { item } = s.entry;
  const start = Date.parse(item.start);
  const where = placeOf(item);
  const tag = s.kind === 'now' ? 'Happening now' : s.kind === 'today' ? (Number(fmt(start, { hour: 'numeric', hourCycle: 'h23' })) >= 17 ? 'Tonight' : 'Today') : s.kind === 'run' ? 'On now' : 'Next up';
  const daysLeft = Math.max(0, Math.round((Date.parse(item.end) - now) / 86_400_000));
  const big = s.kind === 'today' ? <><b>{time(start)}</b><small>{startsIn(start, now)}</small></>
    : s.kind === 'now' ? <><b><span className="h-pulse" aria-hidden="true" />Live</b><small>until {time(item.end)}</small></>
    : s.kind === 'run' ? <><b>{daysLeft || 'Last'}</b><small>{daysLeft === 1 ? 'day left' : daysLeft ? 'days left' : 'day today'}</small></>
    : s.entry.days === 1 ? <><b className="pd-db-word">Tmrw</b><small>{time(start)}</small></>
    : <><b>{s.entry.days}</b><small>days to go</small></>;
  const when = s.kind === 'run' ? `Drop in any day until ${fmt(item.end, { weekday: 'long', month: 'long', day: 'numeric' })}`
    : s.kind === 'now' ? `Started ${time(start)} · ends ${time(item.end)}`
    : `${fmt(start, { weekday: 'long', month: 'long', day: 'numeric' })} · ${time(start)}`;
  return (
    <article className="pd-db-spot" data-kind={s.kind}>
      <span className="pd-db-art">{p.art(item)}</span>
      <div className="pd-db-body">
        <span className="pd-db-tag">{s.kind === 'now' || s.kind === 'today' ? <span className="h-pulse" aria-hidden="true" /> : <Ticket size={13} aria-hidden="true" />} {tag}</span>
        <Link to={item.path} className="pd-db-title">{item.title}</Link>
        <p className="pd-db-when">{when}</p>
        {where ? <p className="pd-db-where"><MapPin size={14} aria-hidden="true" /> {where}</p> : null}
        <div className="pd-db-acts">
          <Link to={item.path} className="pd-db-btn">Details <ArrowUpRight size={16} aria-hidden="true" /></Link>
          {where && (s.kind === 'today' || s.kind === 'now') ? <a className="pd-db-btn" data-k="ghost" href={directions(item)} target="_blank" rel="noopener noreferrer"><Navigation size={15} aria-hidden="true" /> Directions</a> : null}
          {s.more ? <a className="pd-db-more" href="#pd-next">+{s.more} more plan{s.more === 1 ? '' : 's'} <ArrowRight size={15} aria-hidden="true" /></a> : null}
        </div>
      </div>
      <span className="pd-db-count" aria-hidden="true">{big}</span>
    </article>
  );
}

/** Nothing on the calendar: the best pick for you, ready to say yes to. */
function Starter(p: DayBoardProps & { pick: PickItem; been: number }) {
  const { pick } = p;
  const where = placeOf(pick) === pick.title ? '' : placeOf(pick);
  return (
    <article className="pd-db-spot" data-kind="starter">
      <span className="pd-db-art">{p.art(pick)}</span>
      <div className="pd-db-body">
        <span className="pd-db-tag"><Sparkles size={13} aria-hidden="true" /> {p.been ? 'Nothing on the calendar' : 'Make your first plan'}</span>
        <p className="pd-db-ask">{p.been ? `You’ve been to ${p.been} thing${p.been === 1 ? '' : 's'} lately. What’s next?` : 'Your next plan could be…'}</p>
        <Link to={pick.path} className="pd-db-title">{pick.title}</Link>
        <p className="pd-db-when">{pickWhenAt(pick, p.now)}{where ? ` · ${where}` : ''}</p>
        <div className="pd-db-acts">
          {pick.kind === 'event' ? (p.preview
            ? <span className="cw-going"><button type="button" className="cw-going-btn" data-on="false"><Ticket size={18} aria-hidden="true" /> I’m going</button></span>
            : <GoingButton eventId={pick.entityId} start={pick.start} compact />)
            : <Link to={pick.path} className="pd-db-btn">See the market <ArrowUpRight size={16} aria-hidden="true" /></Link>}
          <a className="pd-db-more" href="#pd-picks">All {p.picks} picks <ArrowRight size={15} aria-hidden="true" /></a>
        </div>
        <p className="pd-db-hint"><Check size={13} aria-hidden="true" /> Say you’re going and it counts down right here.</p>
      </div>
    </article>
  );
}

function Quiet(p: DayBoardProps & { been: number }) {
  return (
    <article className="pd-db-spot" data-kind="quiet">
      <span className="pd-db-art"><span className="pd-art" style={{ '--bg': '#dfe7ff', '--ink': '#151515' } as CSSProperties}><Compass size={34} aria-hidden="true" /></span></span>
      <div className="pd-db-body">
        <span className="pd-db-tag"><Compass size={13} aria-hidden="true" /> A quiet stretch</span>
        <p className="pd-db-title">Nothing matches your interests in the next 10 days.</p>
        <p className="pd-db-when">We only list what we’ve checked with the organizer, so some weeks are slower. Widen your interests or browse it all.</p>
        <div className="pd-db-acts">
          <Link to="/events" className="pd-db-btn">Browse every event <ArrowUpRight size={16} aria-hidden="true" /></Link>
          <button type="button" className="pd-db-btn" data-k="ghost" onClick={() => p.onEdit('interests')}><Pencil size={14} aria-hidden="true" /> Interests</button>
        </div>
      </div>
    </article>
  );
}

function NearMini(p: DayBoardProps) {
  if (!p.area) {
    return (
      <div className="pd-db-mini" data-tone="navy" data-k="nohome">
        <span className="pd-db-mini-art"><RadarArt /></span>
        <span className="pd-db-mini-text">
          <small>Near home</small>
          <strong>Where’s home?</strong>
          <span>We’ll watch 2.5 km around it.</span>
        </span>
        <button type="button" className="pd-db-mini-go" onClick={() => p.onEdit('home')}>Add home <ArrowRight size={15} aria-hidden="true" /></button>
      </div>
    );
  }
  const latest = p.near[0];
  const mins = latest ? Math.max(1, Math.round((p.now - latest.timestamp) / 60_000)) : 0;
  return (
    <div className="pd-db-mini" data-tone="navy" data-alert={p.near.length > 0 || undefined}>
      <span className="pd-db-mini-art"><RadarArt /></span>
      <span className="pd-db-mini-text">
        <small>Near {p.area} · 24 h</small>
        <strong>{!p.nearReady ? 'Checking…' : p.near.length ? `${p.near.length} report${p.near.length === 1 ? '' : 's'}` : 'All quiet'}</strong>
        <span>{!p.nearReady ? 'Reading the live map' : latest ? `${latest.title} · ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`} ago` : 'Nothing reported within 2.5 km.'}</span>
      </span>
      {p.near.length ? <a className="pd-db-mini-go" href="#pd-near">See them <ArrowRight size={15} aria-hidden="true" /></a>
        : <Link className="pd-db-mini-go" to="/map">Live map <ArrowRight size={15} aria-hidden="true" /></Link>}
    </div>
  );
}

function EmailMini(p: DayBoardProps) {
  return (
    <div className="pd-db-mini" data-tone="paper" data-off={!p.plan.next || undefined}>
      <span className="pd-db-mini-art"><EnvelopeArt /></span>
      <span className="pd-db-mini-text">
        <small>Next email</small>
        <strong>{p.plan.next ? fmt(p.plan.next, { weekday: 'long', month: 'short', day: 'numeric' }) : 'No emails on'}</strong>
        <span>{p.plan.next ? `${p.plan.name}, ${time(p.plan.next)}` : 'Your week, every Monday. Free.'}</span>
      </span>
      <span className="pd-db-mini-go">{p.emailAction ?? <Bell size={15} />}</span>
    </div>
  );
}
