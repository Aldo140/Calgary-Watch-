import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { RadarArt, TicketArt } from '../home/HomeYours';
import { EnvelopeArt } from './SignupFlow';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { isOnNow, type PickItem } from '../../lib/eventPicks';
import type { EmailPlan, NearReport } from '../../lib/memberHome';
import '../../styles/glance.css';

/*
 * The three things a member wonders when they open CalgaryWatch, answered in
 * one row: is it quiet near home, what am I doing next, and when does the
 * next email land. Each tile is one answer and one action. Used on the
 * dashboard's sill and in the homepage's Your CalgaryWatch card, so the two
 * never disagree.
 */

const fmt = (t: number | string, o: Intl.DateTimeFormatOptions) => calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...o }).format(new Date(t));
const time = (t: number | string) => fmt(t, { hour: 'numeric', minute: '2-digit' }).replace(':00', '');

/** "Fri, Oct 16 · 7:30 p.m.", or "On now · until Oct 24" for a run that already opened. */
export function planDay(item: { start: string; end: string }, now = Date.now()): string {
  if (isOnNow(item, now)) return `On now · until ${fmt(item.end, { month: 'short', day: 'numeric' })}`;
  return `${fmt(item.start, { weekday: 'short', month: 'short', day: 'numeric' })} · ${time(item.start)}`;
}

const ymd = (t: number | string) => fmt(t, { year: 'numeric', month: '2-digit', day: '2-digit' });
/** "tonight at 7:30 p.m.", "today at 11 a.m.", "tomorrow", "on Friday". */
function dayWord(start: string): string {
  const now = Date.now();
  if (ymd(start) === ymd(now)) return `${Number(fmt(start, { hour: 'numeric', hourCycle: 'h23' })) >= 17 ? 'tonight' : 'today'} at ${time(start)}`;
  if (ymd(start) === ymd(now + 86_400_000)) return 'tomorrow';
  return `on ${fmt(start, { weekday: 'long' })}`;
}

/** One plain sentence that answers "anything I should know?" before the reader scrolls. */
export function briefing({ near, nearReady, area, picks, next }: { near: NearReport[]; nearReady: boolean; area: string; picks: number; next?: PickItem }): string {
  const where = area || 'home';
  const safety = !nearReady ? '' : near.length ? `${near.length} report${near.length === 1 ? '' : 's'} near ${where} in the last day.` : `All quiet near ${where} in the last day.`;
  const plans = picks ? `${picks} pick${picks === 1 ? '' : 's'} for the next 10 days` : 'No picks match this week yet';
  const name = next ? (next.title.length > 42 ? `${next.title.slice(0, 40).trim()}…` : next.title) : '';
  const going = !next ? '.'
    : isOnNow(next) ? `, and ${name} is on now until ${fmt(next.end, { month: 'long', day: 'numeric' })}.`
    : `, and you’re going to ${name} ${dayWord(next.start)}.`;
  return [safety, plans + going].filter(Boolean).join(' ');
}

interface TileProps { tone: 'navy' | 'cyan' | 'paper'; art: ReactNode; label: string; title: ReactNode; sub: ReactNode; action: ReactNode }

function Tile({ tone, art, label, title, sub, action }: TileProps) {
  return (
    <li className="gl-tile" data-tone={tone}>
      <span className="gl-art">{art}</span>
      <span className="gl-text">
        <span className="gl-label">{label}</span>
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      <span className="gl-act">{action}</span>
    </li>
  );
}

export interface GlanceProps {
  area: string;
  near: NearReport[];
  nearReady: boolean;
  next?: PickItem;
  plan: EmailPlan;
  /** Where "near home" points: the dashboard's list, or the live map. */
  nearHref: string;
  /** Where "no plans yet" points. */
  picksHref: string;
  /** The email tile's button: turn one on, add the other, or change. */
  emailAction: ReactNode;
  now: number;
}

export function GlanceTiles({ area, near, nearReady, next, plan, nearHref, picksHref, emailAction, now }: GlanceProps) {
  const latest = near[0];
  const mins = latest ? Math.max(1, Math.round((now - latest.timestamp) / 60_000)) : 0;
  return (
    <ul className="gl-tiles">
      <Tile
        tone="navy" art={<RadarArt />} label={`Near ${area || 'home'}`}
        title={!nearReady ? 'Checking…' : near.length ? `${near.length} report${near.length === 1 ? '' : 's'}` : 'All quiet'}
        sub={!nearReady ? 'Reading the live map' : latest ? `Latest: ${latest.title} · ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`} ago` : 'Nothing reported in the last day'}
        action={<GlanceLink to={nearHref}>{near.length ? 'See what happened' : 'Live map'}</GlanceLink>}
      />
      <Tile
        tone="cyan" art={<TicketArt />} label="Your next plan"
        title={next ? next.title : 'Nothing planned yet'}
        sub={next ? [planDay(next, now), next.venue || next.neighbourhood].filter(Boolean).join(' · ') : 'Tap “I’m going” on a pick for a reminder'}
        action={<GlanceLink to={next ? next.path : picksHref}>{next ? 'Details' : 'Find something'}</GlanceLink>}
      />
      <Tile
        tone="paper" art={<EnvelopeArt />} label="Next email"
        title={plan.next ? fmt(plan.next, { weekday: 'long', month: 'short', day: 'numeric' }) : 'No email on'}
        sub={plan.next ? `${plan.name}, ${time(plan.next)}` : 'Get your week every Monday. Free, one tap to stop.'}
        action={emailAction}
      />
    </ul>
  );
}

export function GlanceLink({ to, children }: { to: string; children: ReactNode }) {
  const inner = <>{children} <ArrowRight size={15} aria-hidden="true" /></>;
  return to.startsWith('#') ? <a href={to} className="gl-link">{inner}</a> : <Link to={to} className="gl-link">{inner}</Link>;
}
