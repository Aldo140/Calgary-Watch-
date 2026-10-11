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
import { EVENT_INTERESTS, pickDistance, pickWhen, type EventInterestId, type PickItem } from '../../lib/eventPicks';
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
        <UpNext going={p.going} />
        <Tracklist {...p} />
      </div>
      <aside className="pd-side" aria-label="More for you">
        <NearCard near={p.near} area={p.area} now={p.now} />
        <BadgeShelf badges={p.badges} />
        <ListingsCard claims={p.claims} />
        <Fine />
      </aside>
    </div>
  );
}

function PhoneBody(p: DashboardProps) {
  return (
    <div className="cw-wrap pd-body">
      <UpNext going={p.going} />
      <NearCard near={p.near} area={p.area} now={p.now} />
      <Tracklist {...p} phone />
      <BadgeShelf badges={p.badges} />
      <ListingsCard claims={p.claims} />
      <Fine />
      <PhoneDock hasPlans={p.going.length > 0} />
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
  const stats: Array<[number, string, string]> = [[p.picks.length, 'Picks', '#pd-picks'], [p.going.length, 'Plans', p.going.length ? '#pd-next' : '#pd-picks'], [unlocked, 'Badges', '#pd-badges']];
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

/* ── Plans, as tickets ───────────────────────────────────────────────── */

function UpNext({ going }: { going: PickItem[] }) {
  if (!going.length) return null;
  return (
    <section className="pd-sec" aria-labelledby="pd-next">
      <SecHead id="pd-next" kicker="You said you’re going" title={<>Your <mark>plans</mark></>} note={`${going.length} coming up · reminders come by email`} />
      <ol className="pd-tickets">
        {going.map((g) => (
          <li key={g.key}>
            <Link to={g.path} className="pd-ticket">
              <span className="pd-ticket-stub">
                <small>{fmt(g.start, { weekday: 'short' })}</small>
                <strong>{fmt(g.start, { day: 'numeric' })}</strong>
                <small>{fmt(g.start, { month: 'short' })}</small>
              </span>
              <span className="pd-ticket-body">
                <strong>{g.title}</strong>
                <small>{[pickWhen(g.start).split(' · ')[1], g.venue || g.neighbourhood].filter(Boolean).join(' · ')}</small>
              </span>
              <ArrowUpRight className="pd-ticket-go" size={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
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

function BadgeShelf({ badges }: { badges: BadgeState[] }) {
  const unlocked = badges.filter((b) => b.unlocked).length;
  return (
    <section className="pd-card pd-badges" aria-labelledby="pd-badges">
      <div className="pd-card-head">
        <div>
          <p className="pd-kicker">For plans, not screen time</p>
          <h2 id="pd-badges">Badges</h2>
        </div>
        <span className="pd-count">{unlocked}<small>/{badges.length}</small></span>
      </div>
      <ul className="pd-stickers">
        {badges.map((b, i) => (
          <li key={b.id} data-locked={!b.unlocked} style={{ '--tilt': `${((i * 37) % 13) - 6}deg` } as CSSProperties} title={b.unlocked ? b.earned : b.hint}>
            <BadgeMark badge={b} size={54} />
            <strong>{b.label}</strong>
          </li>
        ))}
      </ul>
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
