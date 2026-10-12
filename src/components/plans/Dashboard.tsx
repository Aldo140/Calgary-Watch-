import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowDown, ArrowUpRight, Award, Bell, ListMusic, Sun, Ticket, Check, Footprints, HeartHandshake, MapPin, Mic, Music, Palette,
  Pencil, Radio, Settings2, ShoppingBasket, Shield, Sparkles, Trophy, Users, UtensilsCrossed, type LucideIcon,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { BadgeMark } from './BadgeMark';
import { GoingButton } from './GoingButton';
import { EASE_OUT } from './Motion';
import { GlanceTiles, briefing, type GlanceProps } from './Glance';
import { CalgarySky, type SkyVariant } from '../home/CalgarySky';
import { TEAR } from '../home/HomeHero';
import { Scribble } from '../home/HomeYours';
import { SkyGlyph } from '../home/WeekPlanner';
import { useCalgaryWeather } from '../../hooks/useCalgaryWeather';
import { describeSky, type SkyIcon } from '../../lib/weatherCodes';
import { moonPhase, skyPalette, sunPosition } from '../../lib/sky';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { BADGES, type BadgeId, type BadgeState } from '../../lib/badges';
import { EVENT_INTERESTS, pickDistance, pickWhen, type EventInterestId, type PickItem, type PlanEntry, type PlanTimeline } from '../../lib/eventPicks';
import { partOfDay, setupPercent, type EmailPlan, type NearReport, type SetupStep, type SetupStepId } from '../../lib/memberHome';
import '../../styles/home.css';
import '../../styles/home-board.css';
import '../../styles/home-v3.css';
import '../../styles/plans-dashboard.css';

/*
 * The signed-in member home, in CalgaryWatch's own look: the homepage's live
 * Calgary sky with the reader's name on it, the yellow card on its torn edge
 * answering the three things people open it to check (anything near home?
 * what's my next plan? when's my email?), then this week's picks as a
 * numbered list, plans as tickets and badges as stickers. A little of the
 * old playlist idea stays (a cover for your neighbourhood, a numbered list
 * made for you); the colours, outlines and type are the brand's.
 */

const fmt = (t: number | string, o: Intl.DateTimeFormatOptions) => calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...o }).format(new Date(t));
const clock = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });
const variantFor = (w: number): SkyVariant => (w <= 720 ? 'mobile' : w <= 1024 ? 'tablet' : 'desktop');
const ago = (t: number, now: number) => {
  const m = Math.max(1, Math.round((now - t) / 60_000));
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** Each interest gets a brand colour and an icon, for picks without a photo. */
const INTEREST_ART: Record<EventInterestId, { bg: string; ink: string; Icon: LucideIcon }> = {
  music: { bg: '#1554d1', ink: '#fff', Icon: Music },
  arts: { bg: '#dfe7ff', ink: '#151515', Icon: Palette },
  family: { bg: '#ffdf4f', ink: '#151515', Icon: Users },
  food: { bg: '#ff7a59', ink: '#151515', Icon: UtensilsCrossed },
  markets: { bg: '#ffdf4f', ink: '#151515', Icon: ShoppingBasket },
  sports: { bg: '#06162f', ink: '#ffdf4f', Icon: Trophy },
  outdoors: { bg: '#2fb67c', ink: '#151515', Icon: Footprints },
  learning: { bg: '#00c2e0', ink: '#151515', Icon: Mic },
  community: { bg: '#00c2e0', ink: '#151515', Icon: HeartHandshake },
  free: { bg: '#fff5cc', ink: '#151515', Icon: Sparkles },
};
const artFor = (p: PickItem) => INTEREST_ART[p.interests.find((i) => i !== 'free') ?? (p.kind === 'market' ? 'markets' : 'community')];

export function useIsPhone(): boolean {
  const query = '(max-width: 720px)';
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

export interface DashboardProps {
  user: User;
  first: string;
  area: string;
  now: number;
  picks: PickItem[];
  going: PickItem[];
  /** Every plan, on now and ahead, then already passed. */
  timeline: PlanTimeline;
  considered: number;
  imageFor: (entityId: string) => string | undefined;
  near: NearReport[];
  nearReady: boolean;
  badges: BadgeState[];
  steps: SetupStep[];
  plan: EmailPlan;
  claims: Array<{ entityId: string; entityTitle: string; status: string }>;
  busy: SetupStepId | null;
  onAct: (id: SetupStepId) => void;
  onEdit: (focus?: 'interests' | 'home') => void;
  /** Admin viewing someone else's dashboard. */
  adminView?: string | null;
  /** Account creation, for the member card. */
  memberSince?: number;
  /** Shown under the title right after saving: "You're in" or "Saved". */
  notice?: { joined: BadgeId[] | null; text: string } | null;
}

export function MemberDashboard(props: DashboardProps) {
  const phone = useIsPhone();
  return (
    <div className="pd cw-home2" data-layout={phone ? 'phone' : 'desk'}>
      {props.adminView !== undefined && props.adminView !== null ? (
        <p className="pd-admin" role="status"><Shield size={15} aria-hidden="true" /> <span><strong>Admin view.</strong> You’re seeing {props.adminView || 'this member'}’s dashboard as they see it. Read-only.</span> <Link to="/admin">Back to admin</Link></p>
      ) : null}
      <Sky {...props} phone={phone} />
      <div className="cw-wrap pd-sill"><TodayCard {...props} /></div>
      {phone ? <PhoneBody {...props} /> : <DeskBody {...props} />}
    </div>
  );
}

function DeskBody(p: DashboardProps) {
  return (
    <div className="cw-wrap pd-body">
      <div className="pd-main">
        <Plans {...p} />
        <Tracklist {...p} />
      </div>
      <aside className="pd-side" aria-label="More for you">
        <NearCard near={p.near} area={p.area} now={p.now} />
        <BadgeShelf badges={p.badges} busy={p.busy} onAct={p.onAct} />
        <ListingsCard claims={p.claims} />
        <Fine />
      </aside>
    </div>
  );
}

function PhoneBody(p: DashboardProps) {
  return (
    <div className="cw-wrap pd-body">
      <Plans {...p} phone />
      <NearCard near={p.near} area={p.area} now={p.now} />
      <Tracklist {...p} phone />
      <BadgeShelf badges={p.badges} busy={p.busy} onAct={p.onAct} phone />
      <ListingsCard claims={p.claims} />
      <Fine />
      <PhoneDock hasPlans={p.timeline.ahead.length + p.timeline.past.length > 0} />
    </div>
  );
}

/**
 * Phones: an app-style dock pinned to the bottom, so Today, Plans, Picks and
 * Badges are always one thumb-tap away on a long page. The current section
 * lights up as you scroll.
 */
function PhoneDock({ hasPlans }: { hasPlans: boolean }) {
  const items: Array<{ id: string; label: string; Icon: LucideIcon }> = [
    { id: 'pd-today', label: 'Today', Icon: Sun },
    ...(hasPlans ? [{ id: 'pd-next', label: 'Plans', Icon: Ticket }] : []),
    { id: 'pd-picks', label: 'Picks', Icon: ListMusic },
    { id: 'pd-badges', label: 'Badges', Icon: Award },
  ];
  const [active, setActive] = useState(items[0].id);
  // Out of the way on the hero, where its own buttons do the job; in once you scroll.
  const [shown, setShown] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = window.innerHeight * 0.4;
        let current = items[0].id;
        for (const it of items) {
          const el = document.getElementById(it.id)?.closest('section') ?? document.getElementById(it.id);
          if (el && el.getBoundingClientRect().top <= line) current = it.id;
        }
        setActive(current);
        setShown(window.scrollY > window.innerHeight * 0.55);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlans]);
  const go = (id: string) => {
    const el = document.getElementById(id)?.closest('section') ?? document.getElementById(id);
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  return (
    <nav className="pd-dock" aria-label="Jump to" data-shown={shown}>
      {items.map(({ id, label, Icon }) => (
        <button key={id} type="button" data-on={active === id} aria-current={active === id ? 'true' : undefined} onClick={() => go(id)}>
          <Icon size={19} strokeWidth={2.3} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

const Fine = () => <p className="pd-fine">Instant alerts and quiet hours live in the <Link to="/map?settings=alerts">live map’s settings</Link>.</p>;

/* ── The sky: who this is for, and the one-line answer ───────────────── */

function Sky(p: DashboardProps & { phone: boolean }) {
  const reduce = useReducedMotion();
  const weather = useCalgaryWeather();
  const [now, setNow] = useState(() => Date.now());
  const [variant, setVariant] = useState<SkyVariant>(() => (typeof window === 'undefined' ? 'desktop' : variantFor(window.innerWidth)));
  useEffect(() => {
    const onResize = () => setVariant(variantFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    const tick = window.setInterval(() => setNow(Date.now()), 5 * 60 * 1000);
    return () => { window.removeEventListener('resize', onResize); clearInterval(tick); };
  }, []);
  const current = weather.current;
  const sun = sunPosition(new Date(now));
  const cloudCover = current?.cloudCover ?? 0;
  const palette = skyPalette(sun.altitude, cloudCover);
  const sky = current ? describeSky(current.code, current.isDay) : null;
  const precip: SkyIcon | null = sky && (sky.wet || sky.icon === 'fog') ? sky.icon : null;
  const rise = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: EASE_OUT, delay: d } });
  const toPicks = () => document.getElementById('pd-picks')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const hello = partOfDay(p.now);

  return (
    <section className="pd-sky" data-tone={palette.tone} style={{ background: palette.top }} aria-labelledby="pd-title">
      <CalgarySky palette={palette} sun={sun} phase={moonPhase(new Date(now))} cloudCover={cloudCover} windKph={current?.windKph ?? 8} precip={precip} variant={variant} now={Math.floor(now / 300000)} />
      <div className="cw-wrap pd-sky-in">
        <motion.p className="pd-dateline" {...rise(0)}>
          {p.phone ? (
            <span className="pd-me">
              <span className="pd-me-ava" aria-hidden="true">{p.user.photoURL ? <img src={p.user.photoURL} alt="" referrerPolicy="no-referrer" /> : (p.first || 'Y').slice(0, 1)}</span>
              Member{p.area ? ` · ${p.area}` : ''}
            </span>
          ) : null}
          <span className="h-dateline-live"><span className="h-pulse" aria-hidden="true" />Live · {clock.format(new Date(now))}</span>
          {current && sky ? <span className="pd-chip pd-chip-ghost"><SkyGlyph icon={sky.icon} size={14} /> {Math.round(current.temp)}° {sky.label.toLowerCase()}</span> : null}
        </motion.p>
        <motion.h1 id="pd-title" {...rise(0.06)}>
          <span className="pd-hello">{hello}{p.first ? `, ${p.first}` : ''}.</span>
          <span className="pd-yours">Your <Scribble>{p.area || 'Calgary'}.</Scribble></span>
        </motion.h1>
        <motion.p className="pd-lead" {...rise(0.14)}>{briefing({ near: p.near, nearReady: p.nearReady, area: p.area, picks: p.picks.length, next: p.going[0] })}</motion.p>
        {p.notice ? <Notice {...p.notice} /> : null}
        <motion.div className="pd-actions" {...rise(0.22)}>
          <button type="button" className="pd-cta" onClick={toPicks}>See this week’s picks <ArrowDown size={18} aria-hidden="true" /></button>
          <Link to="/map" className="pd-ghost"><Radio size={16} aria-hidden="true" /> Live map</Link>
          <button type="button" className="pd-ghost" onClick={() => p.onEdit()}><Settings2 size={16} aria-hidden="true" /> {p.phone ? 'Settings' : 'Area, emails & interests'}</button>
        </motion.div>
        {p.phone ? null : <MemberPass {...p} />}
      </div>
      <svg className="h-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={TEAR} transform="translate(0 -5)" className="h-tear-shade" />
        <path d={TEAR} className="h-tear-paper" />
      </svg>
    </section>
  );
}

/** The reader's member card: who they are, where home is, what they've got going. */
function MemberPass(p: DashboardProps) {
  const reduce = useReducedMotion();
  const unlocked = p.badges.filter((b) => b.unlocked).length;
  const name = p.user.displayName || p.first || 'You';
  const stats: Array<[number, string, string]> = [[p.picks.length, 'Picks', '#pd-picks'], [p.timeline.ahead.length, 'Plans', p.timeline.ahead.length || p.timeline.past.length ? '#pd-next' : '#pd-picks'], [unlocked, 'Badges', '#pd-badges']];
  return (
    <motion.aside
      className="pd-pass" aria-label="Your member card"
      initial={reduce ? false : { opacity: 0, y: 24, rotate: -4 }} animate={{ opacity: 1, y: 0, rotate: 3 }}
      transition={{ type: 'spring', stiffness: 150, damping: 16, delay: 0.12 }}
    >
      <span className="pd-pass-top">
        <img src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" width="34" height="34" />
        <span>CalgaryWatch</span>
        <b>Member</b>
      </span>
      <span className="pd-pass-who">
        <span className="pd-pass-ava" aria-hidden="true">{p.user.photoURL ? <img src={p.user.photoURL} alt="" referrerPolicy="no-referrer" /> : name.slice(0, 1)}</span>
        <span>
          <strong>{name}</strong>
          <small><MapPin size={13} aria-hidden="true" /> {p.area || 'Calgary'}</small>
        </span>
      </span>
      <span className="pd-pass-stats">
        {stats.map(([n, label, href]) => <a key={label} href={href}><strong>{n}</strong><small>{label}</small></a>)}
      </span>
      <span className="pd-pass-foot">{p.memberSince ? `Since ${fmt(p.memberSince, { month: 'long', year: 'numeric' })}` : 'Free, for Calgary'}</span>
    </motion.aside>
  );
}

function Notice({ joined, text }: { joined: BadgeId[] | null; text: string }) {
  return (
    <div className="pd-notice" role="status">
      {joined ? <Sparkles size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
      <div>
        <p><strong>{joined ? 'You’re in.' : 'Saved.'}</strong> {text}</p>
        {joined?.length ? (
          <ul>{joined.map((id) => { const b = BADGES.find((x) => x.id === id)!; return <li key={id}><BadgeMark badge={{ ...b, unlocked: true }} size={26} /> {b.label}</li>; })}</ul>
        ) : null}
      </div>
    </div>
  );
}

/* ── The yellow card on the tear: three answers, then the next step ──── */

const ACTION: Record<SetupStepId, string> = { home: 'Add home', monday: 'Turn on', events: 'Turn on', interests: 'Choose', plan: 'See picks', share: 'Add one' };

function TodayCard(p: DashboardProps) {
  const adding = p.busy === 'monday' || p.busy === 'events';
  const up = p.plan.kind === 'monday' ? { label: 'Add event picks', id: 'events' as const }
    : p.plan.kind === 'thursday' ? { label: 'Add safety near home', id: 'monday' as const }
    : p.plan.kind === 'none' ? { label: 'Turn on Mondays', id: 'monday' as const }
    : null;
  const emailAction: GlanceProps['emailAction'] = up
    ? <button type="button" className="gl-btn" disabled={adding} onClick={() => p.onAct(up.id)}>{adding ? 'Adding…' : up.label} <Bell size={15} aria-hidden="true" /></button>
    : <button type="button" className="gl-btn" onClick={() => p.onEdit()}>Change <Pencil size={14} aria-hidden="true" /></button>;
  const reduce = useReducedMotion();
  return (
    <motion.section
      id="pd-today" className="pd-today" aria-labelledby="pd-today-title"
      initial={reduce ? false : { opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 150, damping: 20, delay: 0.2 }}
    >
      <div className="pd-today-head">
        <h2 id="pd-today-title" className="pd-kicker">Your CalgaryWatch · {fmt(p.now, { weekday: 'short', month: 'short', day: 'numeric' })}</h2>
        {p.area ? <span className="pd-tag"><MapPin size={12} aria-hidden="true" /> {p.area}</span> : null}
      </div>
      <GlanceTiles
        area={p.area} near={p.near} nearReady={p.nearReady} next={p.going[0]} plan={p.plan} now={p.now}
        nearHref={p.near.length ? '#pd-near' : '/map'} picksHref="#pd-picks" emailAction={emailAction}
      />
      <NextStep steps={p.steps} busy={p.busy} onAct={p.onAct} />
    </motion.section>
  );
}

const TILE_STEPS = new Set<SetupStepId>(['monday', 'events', 'plan']);

/** Setup as one next step, not a wall of ticks: the ring, the step, the badge it earns, one button. */
function NextStep({ steps, busy, onAct }: { steps: SetupStep[]; busy: SetupStepId | null; onAct: (id: SetupStepId) => void }) {
  const pct = setupPercent(steps);
  if (pct === 100) return null;
  // The tiles above already ask for emails and a first plan; this strip carries the rest.
  const left = steps.filter((s) => !s.done && !TILE_STEPS.has(s.id));
  const s = left[0];
  if (!s) return null;
  const badge = BADGES.find((b) => b.id === s.badge)!;
  return (
    <div className="pd-step">
      <Ring pct={pct} />
      <p>
        <span className="pd-step-k">{pct}% set up · next step</span>
        <strong>{s.label}</strong>
        <small>{s.why} Earns <BadgeMark badge={{ ...badge, unlocked: false }} size={18} /> {badge.label}{left.length > 1 ? ` · ${left.length - 1} more after this` : ''}</small>
      </p>
      <button type="button" className="pd-step-go" disabled={busy === s.id} onClick={() => onAct(s.id)}>{busy === s.id ? 'Adding…' : ACTION[s.id]}</button>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 20, c = 2 * Math.PI * r;
  return (
    <svg className="pd-ring" viewBox="0 0 52 52" aria-hidden="true" focusable="false">
      <circle cx="26" cy="26" r={r} fill="#fff" stroke="#e4e1d8" strokeWidth="7" />
      <circle cx="26" cy="26" r={r} fill="none" stroke="#1554d1" strokeWidth="7" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 26 26)" strokeLinecap="round" />
      <circle cx="26" cy="26" r={r + 4} fill="none" stroke="#151515" strokeWidth="2" />
    </svg>
  );
}

/* ── Plans: what's still ahead, a line for today, what already passed ─ */

const timeOf = (iso: string) => pickWhen(iso).split(' · ')[1] ?? '';
const placeOf = (i: PickItem) => i.venue || i.neighbourhood || '';

function Plans(p: DashboardProps & { phone?: boolean }) {
  const { ahead, past } = p.timeline;
  const [all, setAll] = useState(false);
  if (!ahead.length && !past.length) return null;
  const cap = p.phone ? 3 : 4;
  const older = all ? past : past.slice(0, cap);
  const more = past.length > cap ? (
    <button type="button" className="pd-past-more" aria-expanded={all} onClick={() => setAll(!all)}>
      {all ? 'Show fewer' : `Show all ${past.length} past plans`} <ArrowDown size={15} aria-hidden="true" style={all ? { transform: 'rotate(180deg)' } : undefined} />
    </button>
  ) : null;
  const tally = (
    <p className="pd-plan-tally" aria-label={`${ahead.length} coming up, ${past.length} already passed`}>
      <span data-k="ahead"><b>{ahead.length}</b> coming up</span>
      <span data-k="past"><b>{past.length}</b> passed</span>
    </p>
  );
  return (
    <section className="pd-sec pd-plans" aria-labelledby="pd-next">
      <SecHead id="pd-next" kicker="You said you’re going" title={<>Your <mark>plans</mark></>} action={tally} />
      {p.phone
        ? <PlanRail ahead={ahead} past={older} now={p.now} more={more} />
        : <PlanBoard ahead={ahead} past={older} now={p.now} more={more} imageFor={p.imageFor} />}
    </section>
  );
}

/** "Today · Mon Oct 12": the line every plan is measured from. */
function NowLine({ now, phone }: { now: number; phone?: boolean }) {
  return (
    <div className="pd-now" role="separator" aria-label={`Today, ${fmt(now, { weekday: 'long', month: 'long', day: 'numeric' })}`}>
      <span className="pd-now-pill"><span className="h-pulse" aria-hidden="true" /> Today · {fmt(now, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      {phone ? null : <span className="pd-now-hint"><b>↑</b> still to come <b>↓</b> already happened</span>}
    </div>
  );
}

function Countdown({ e }: { e: PlanEntry }) {
  const big = e.status === 'upcoming' && e.days >= 2 && e.days < 100;
  return (
    <span className="pd-count-down" data-status={e.status}>
      {e.status === 'live' ? <><span className="h-pulse" aria-hidden="true" /><strong>On now</strong><small>{e.item.end ? `until ${fmt(e.item.end, { month: 'short', day: 'numeric' })}` : ''}</small></>
        : big ? <><strong>{e.days}</strong><small>days to go</small></>
        : <><strong className="pd-count-word">{e.when}</strong><small>{timeOf(e.item.start)}</small></>}
    </span>
  );
}

/** Desktop: the next plan as a big ticket, the rest as a row of stubs, then a cut line and the ones you've been to. */
function PlanBoard({ ahead, past, now, more, imageFor }: { ahead: PlanEntry[]; past: PlanEntry[]; now: number; more: ReactNode; imageFor: (id: string) => string | undefined }) {
  const [next, ...rest] = ahead;
  return (
    <div className="pd-board">
      {next ? (
        <Link to={next.item.path} className="pd-hero-ticket" data-status={next.status}>
          <span className="pd-hero-art"><Art item={next.item} src={imageFor(next.item.entityId)} /></span>
          <span className="pd-hero-body">
            <span className="pd-hero-tag">{next.status === 'live' ? 'Happening now' : 'Next up'}</span>
            <strong>{next.item.title}</strong>
            <small>{fmt(next.item.start, { weekday: 'long', month: 'long', day: 'numeric' })}{timeOf(next.item.start) && next.status !== 'live' ? ` · ${timeOf(next.item.start)}` : ''}</small>
            {placeOf(next.item) ? <small><MapPin size={13} aria-hidden="true" /> {placeOf(next.item)}</small> : null}
          </span>
          <span className="pd-hero-stub"><Countdown e={next} /></span>
        </Link>
      ) : (
        <a href="#pd-picks" className="pd-hero-empty">
          <strong>Nothing coming up yet.</strong>
          <span>Tap <b>I’m going</b> on any pick below and it lands here with a countdown.</span>
          <ArrowDown size={18} aria-hidden="true" />
        </a>
      )}
      {rest.length ? (
        <ol className="pd-stubs" aria-label="Also coming up">
          {rest.map((e) => (
            <li key={e.item.key}>
              <Link to={e.item.path} className="pd-stub" data-status={e.status}>
                <span className="pd-stub-when">{e.when}</span>
                <span className="pd-stub-date">
                  <small>{fmt(e.item.start, { weekday: 'short' })}</small>
                  <b>{fmt(e.item.start, { day: 'numeric' })}</b>
                  <small>{fmt(e.item.start, { month: 'short' })}</small>
                </span>
                <strong>{e.item.title}</strong>
                <small>{[e.status === 'live' ? null : timeOf(e.item.start), placeOf(e.item)].filter(Boolean).join(' · ')}</small>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
      {past.length ? (
        <>
          <NowLine now={now} />
          <ol className="pd-past" aria-label="Already passed">
            {past.map((e, i) => (
              <li key={e.item.key} style={{ '--tilt': `${(i % 2 ? 1 : -1) * (1 + (i % 3))}deg` } as CSSProperties}>
                <Link to={e.item.path} className="pd-past-card">
                  <span className="pd-past-art"><Art item={e.item} src={imageFor(e.item.entityId)} /></span>
                  <span className="pd-past-body">
                    <small>{e.when} · {fmt(e.item.start, { month: 'short', day: 'numeric' })}</small>
                    <strong>{e.item.title}</strong>
                  </span>
                  <span className="pd-stamp" aria-hidden="true">Passed</span>
                </Link>
              </li>
            ))}
          </ol>
          {more}
        </>
      ) : null}
    </div>
  );
}

/** Phones: one vertical timeline. Solid line and bright cards above today, a dashed grey line and faded cards below it. */
function PlanRail({ ahead, past, now, more }: { ahead: PlanEntry[]; past: PlanEntry[]; now: number; more: ReactNode }) {
  const node = (e: PlanEntry, i: number) => (
    <li key={e.item.key} className="pd-rail-item" data-status={e.status} data-lead={e.status !== 'past' && i === 0 ? 'true' : undefined}>
      <span className="pd-rail-date" aria-hidden="true">
        {e.status === 'live' ? <><small>On</small><b>now</b></> : <><small>{fmt(e.item.start, { weekday: 'short' })}</small><b>{fmt(e.item.start, { day: 'numeric' })}</b><small>{fmt(e.item.start, { month: 'short' })}</small></>}
      </span>
      <Link to={e.item.path} className="pd-rail-card">
        <span className="pd-rail-when">{e.status === 'past' ? <><Check size={12} aria-hidden="true" /> {e.when}</> : e.status === 'live' ? <><span className="h-pulse" aria-hidden="true" /> On now</> : e.when}</span>
        <strong>{e.item.title}</strong>
        <small>{[e.status === 'upcoming' ? timeOf(e.item.start) : e.status === 'live' ? `until ${fmt(e.item.end, { month: 'short', day: 'numeric' })}` : null, placeOf(e.item)].filter(Boolean).join(' · ')}</small>
      </Link>
    </li>
  );
  return (
    <div className="pd-rail-wrap">
      <ol className="pd-rail" aria-label="Coming up">
        {ahead.length ? ahead.map(node) : (
          <li className="pd-rail-item" data-status="empty">
            <span className="pd-rail-date" aria-hidden="true"><small>Next</small><b>?</b></span>
            <a href="#pd-picks" className="pd-rail-card"><strong>Nothing coming up yet</strong><small>Tap I’m going on a pick below.</small></a>
          </li>
        )}
      </ol>
      {past.length ? (
        <>
          <NowLine now={now} phone />
          <ol className="pd-rail" data-part="past" aria-label="Already passed">{past.map(node)}</ol>
          {more}
        </>
      ) : null}
    </div>
  );
}

function SecHead({ id, kicker, title, note, action }: { id: string; kicker?: string; title: ReactNode; note?: string; action?: ReactNode }) {
  return (
    <div className="pd-sec-head">
      <div>
        {kicker ? <p className="pd-kicker">{kicker}</p> : null}
        <h2 id={id}>{title}</h2>
        {note ? <p className="pd-note">{note}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ── Picked for you: a numbered list made for one person ────────────── */

function Art({ item, src }: { item: PickItem; src?: string }) {
  const art = artFor(item);
  const [failed, setFailed] = useState(false);
  return (
    <span className="pd-art" style={{ '--bg': art.bg, '--ink': art.ink } as CSSProperties} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <art.Icon size={22} strokeWidth={2.2} />}
    </span>
  );
}

function Tracklist(p: DashboardProps & { phone?: boolean }) {
  const labels = (item: PickItem) => EVENT_INTERESTS.filter((i) => item.matched.includes(i.id) && i.id !== 'free').map((i) => i.label);
  return (
    <section className="pd-sec pd-picks" aria-labelledby="pd-picks">
      <SecHead
        id="pd-picks" kicker={`Next 10 days · ${p.area ? `closest to ${p.area} first` : 'closest first'}`} title={<>Picked <mark>for you</mark></>}
        action={<button type="button" className="pd-pill" onClick={() => p.onEdit('interests')}><Pencil size={14} aria-hidden="true" /> {p.phone ? 'Interests' : 'Change interests'}</button>}
      />
      {p.picks.length ? (
        <ol className="pd-tracks">
          {p.picks.map((item, i) => (
            <li key={item.key} className="pd-track">
              <span className="pd-track-n">{String(i + 1).padStart(2, '0')}</span>
              <Link to={item.path} className="pd-track-main">
                <Art item={item} src={p.imageFor(item.entityId)} />
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.free ? <b className="pd-free">Free</b> : null}
                    {p.phone ? pickWhen(item.start) : labels(item).slice(0, 2).join(', ') || (item.kind === 'market' ? 'Market' : 'Event')}
                  </small>
                </span>
              </Link>
              <span className="pd-track-where">{[item.venue || item.neighbourhood, pickDistance(item.distanceM)].filter(Boolean).join(' · ')}</span>
              <time className="pd-track-when" dateTime={item.start}>{pickWhen(item.start)}</time>
              <span className="pd-track-go">
                {item.kind === 'event' ? <GoingButton eventId={item.entityId} start={item.start} compact /> : <Link to={item.path} className="pd-round" aria-label={`Open ${item.title}`}><ArrowUpRight size={18} /></Link>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="pd-empty">Nothing on yet that matches. We only list events we’ve checked with the organizer, so some weeks are quieter. <button type="button" onClick={() => p.onEdit('interests')}>Add an interest</button></p>
      )}
      <p className="pd-fine">{p.considered} upcoming events and market dates considered. <Link to="/events">Browse everything</Link> · <Link to="/submit">Add one we’re missing</Link></p>
    </section>
  );
}

/* ── Side cards ───────────────────────────────────────────────────────── */

/** Only when something happened: the glance tile already says "all quiet". */
function NearCard({ near, area, now }: { near: NearReport[]; area: string; now: number }) {
  if (!near.length) return null;
  return (
    <section className="pd-card pd-near" aria-labelledby="pd-near">
      <p className="pd-kicker"><span className="h-pulse" aria-hidden="true" /> Live · last 24 hours</p>
      <h2 id="pd-near">Near {area || 'home'}</h2>
      <ul className="pd-near-list">
        {near.slice(0, 4).map((r) => (
          <li key={r.id}>
            <Link to={`/map?i=${encodeURIComponent(r.id)}`}>
              <span className="pd-dot" data-cat={r.category} aria-hidden="true" />
              <span>
                <strong>{r.title}</strong>
                <small>{[r.neighborhood, r.distanceM !== null ? (r.distanceM < 1000 ? `${Math.max(100, Math.round(r.distanceM / 100) * 100)} m` : `${(r.distanceM / 1000).toFixed(1)} km`) : null, ago(r.timestamp, now)].filter(Boolean).join(' · ')}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/map" className="pd-link">Open the live map <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </section>
  );
}

/** How to earn each badge from here: a setup step, or a place on the site. */
type EarnWay = { step: SetupStepId; label: string } | { to: string; label: string };
const EARN: Partial<Record<BadgeId, EarnWay>> = {
  neighbour: { step: 'home', label: 'Add home' },
  'tuned-in': { step: 'interests', label: 'Choose' },
  'on-the-list': { step: 'events', label: 'Turn on' },
  'monday-reader': { step: 'monday', label: 'Turn on' },
  'first-plans': { to: '#pd-picks', label: 'See picks' },
  regular: { to: '#pd-picks', label: 'See picks' },
  'all-rounder': { to: '#pd-picks', label: 'See picks' },
  scout: { to: '/submit', label: 'Add one' },
  'eyes-on-the-street': { to: '/map', label: 'Open map' },
};

/**
 * Badges as a collection with gaps: what you've earned on the shelf, and
 * every one still to get listed with exactly how to get it and one button.
 * Closest first, so the next badge is always the obvious one.
 */
function BadgeShelf({ badges, busy, onAct, phone }: { badges: BadgeState[]; busy: SetupStepId | null; onAct: (id: SetupStepId) => void; phone?: boolean }) {
  const [all, setAll] = useState(false);
  const earned = badges.filter((b) => b.unlocked);
  const near = (b: BadgeState) => (EARN[b.id] ? 0 : 2) - (b.target ? (b.progress ?? 0) / b.target : 0);
  const locked = badges.filter((b) => !b.unlocked).sort((a, b) => near(a) - near(b));
  const cap = phone ? 3 : 4;
  const shown = all ? locked : locked.slice(0, cap);
  return (
    <section className="pd-card pd-badges" aria-labelledby="pd-badges">
      <div className="pd-card-head">
        <div>
          <p className="pd-kicker">For plans, not screen time</p>
          <h2 id="pd-badges">Badges</h2>
        </div>
        <span className="pd-count">{earned.length}<small>/{badges.length}</small></span>
      </div>
      <ol className="pd-meter" aria-hidden="true">{badges.map((b) => <li key={b.id} data-on={b.unlocked} />)}</ol>
      {earned.length ? (
        <ul className="pd-stickers" aria-label="Earned">
          {earned.map((b, i) => (
            <li key={b.id} style={{ '--tilt': `${((i * 37) % 13) - 6}deg` } as CSSProperties} title={b.earned}>
              <BadgeMark badge={b} size={54} />
              <strong>{b.label}</strong>
            </li>
          ))}
        </ul>
      ) : <p className="pd-earn-none">None yet. Your first one is a tap away.</p>}
      {locked.length ? (
        <>
          <h3 className="pd-earn-title">{locked.length === 1 ? 'One left to earn' : `${locked.length} more to earn`}</h3>
          <ul className="pd-earn">
            {shown.map((b) => {
              const way = EARN[b.id];
              const pct = b.target ? Math.round(((b.progress ?? 0) / b.target) * 100) : 0;
              return (
                <li key={b.id}>
                  <BadgeMark badge={b} size={44} />
                  <span className="pd-earn-text">
                    <strong>{b.label}</strong>
                    <small>{b.hint}</small>
                    {b.target ? (
                      <span className="pd-earn-bar" role="img" aria-label={`${b.progress ?? 0} of ${b.target}`}>
                        <span style={{ width: `${pct}%` }} /><em>{b.progress ?? 0}/{b.target}</em>
                      </span>
                    ) : null}
                  </span>
                  {way && 'step' in way ? (
                    <button type="button" className="pd-earn-go" disabled={busy === way.step} onClick={() => onAct(way.step)}>{busy === way.step ? 'Adding…' : way.label}</button>
                  ) : way ? (
                    way.to.startsWith('#') ? <a className="pd-earn-go" href={way.to}>{way.label}</a> : <Link className="pd-earn-go" to={way.to}>{way.label}</Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {locked.length > cap ? (
            <button type="button" className="pd-earn-more" aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${locked.length}`} <ArrowDown size={15} aria-hidden="true" style={all ? { transform: 'rotate(180deg)' } : undefined} />
            </button>
          ) : null}
        </>
      ) : <p className="pd-earn-none">Every badge earned. Nice work, neighbour.</p>}
    </section>
  );
}

function ListingsCard({ claims }: { claims: Array<{ entityId: string; entityTitle: string; status: string }> }) {
  if (!claims.length) return null;
  const label = (s: string) => (s === 'approved' ? 'You manage it' : s === 'rejected' ? 'Not confirmed' : 'Being confirmed');
  return (
    <section className="pd-card" aria-labelledby="pd-listings">
      <p className="pd-kicker">For organizers</p>
      <h2 id="pd-listings">Your listings</h2>
      <ul className="pd-near-list">
        {claims.map((c) => (
          <li key={c.entityId}>
            <Link to={`/claim/${encodeURIComponent(c.entityId)}`}>
              <span className="pd-dot" data-cat={c.status === 'approved' ? 'ok' : 'wait'} aria-hidden="true" />
              <span><strong>{c.entityTitle}</strong><small>{label(c.status)}{c.status === 'approved' ? ' · send a change' : ''}</small></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
