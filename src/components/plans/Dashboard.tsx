import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight, Check, ChevronRight, Footprints, HeartHandshake, Mail, MapPin, Mic, Music, Palette,
  Pencil, Play, Radio, ShoppingBasket, Shield, Sparkles, Trophy, Users, UtensilsCrossed, type LucideIcon,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { BadgeMark } from './BadgeMark';
import { GoingButton } from './GoingButton';
import { CountUp, EASE_OUT } from './Motion';
import { useShapes } from '../check/Cover';
import { SkyGlyph } from '../home/WeekPlanner';
import { useCalgaryWeather } from '../../hooks/useCalgaryWeather';
import { describeSky } from '../../lib/weatherCodes';
import { BADGES, type BadgeId, type BadgeState } from '../../lib/badges';
import { EVENT_INTERESTS, pickDistance, pickWhen, type EventInterestId, type PickItem } from '../../lib/eventPicks';
import { setupPercent, type EmailPlan, type NearReport, type SetupStep, type SetupStepId } from '../../lib/memberHome';
import '../../styles/plans-dashboard.css';

/*
 * The signed-in member home, as a playlist made for one person: a cover of
 * their own neighbourhood, a big green play button into this week's picks,
 * a tracklist, and badges as stickers. Phones get their own layout (cover
 * up top, swipeable rows), not a squeezed desktop.
 */

const TZ = 'America/Edmonton';
const fmt = (t: number | string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, ...o }).format(new Date(t));
const ago = (t: number, now: number) => {
  const m = Math.max(1, Math.round((now - t) / 60_000));
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** The cover's colours follow the clock, so the page feels different at 8 a.m. and 11 p.m. */
type Mood = { from: string; to: string; ink: string; wash: string; name: string };
function moodFor(now: number): Mood {
  const h = Number(fmt(now, { hour: 'numeric', hourCycle: 'h23' }));
  if (h >= 5 && h < 11) return { from: '#ffc864', to: '#ff6437', ink: '#3d0d00', wash: '#a8421f', name: 'Morning' };
  if (h >= 11 && h < 17) return { from: '#1ed760', to: '#0f7c8c', ink: '#04241a', wash: '#137a52', name: 'Afternoon' };
  if (h >= 17 && h < 22) return { from: '#f037a5', to: '#7358ff', ink: '#fff0f8', wash: '#6b2a8c', name: 'Evening' };
  return { from: '#1e3264', to: '#509bf5', ink: '#d9ebff', wash: '#1f3a73', name: 'Late night' };
}

/** Each interest gets a colour and an icon, for covers without a photo. */
const INTEREST_ART: Record<EventInterestId, { from: string; to: string; Icon: LucideIcon }> = {
  music: { from: '#f037a5', to: '#7358ff', Icon: Music },
  arts: { from: '#7358ff', to: '#b49bc8', Icon: Palette },
  family: { from: '#ffc864', to: '#ff6437', Icon: Users },
  food: { from: '#ff6437', to: '#ffc864', Icon: UtensilsCrossed },
  markets: { from: '#1ed760', to: '#0f7c8c', Icon: ShoppingBasket },
  sports: { from: '#509bf5', to: '#1e3264', Icon: Trophy },
  outdoors: { from: '#2fb67c', to: '#1e3264', Icon: Footprints },
  learning: { from: '#b49bc8', to: '#509bf5', Icon: Mic },
  community: { from: '#ff4632', to: '#f037a5', Icon: HeartHandshake },
  free: { from: '#1ed760', to: '#ffc864', Icon: Sparkles },
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
  /** Shown under the title right after saving: "You're in" or "Saved". */
  notice?: { joined: BadgeId[] | null; text: string } | null;
}

export function MemberDashboard(props: DashboardProps) {
  const phone = useIsPhone();
  const mood = moodFor(props.now);
  return (
    <div className="pd" data-layout={phone ? 'phone' : 'desk'} style={{ '--wash': mood.wash } as CSSProperties}>
      {props.adminView !== undefined && props.adminView !== null ? (
        <p className="pd-admin" role="status"><Shield size={15} aria-hidden="true" /> <span><strong>Admin view.</strong> You’re seeing {props.adminView || 'this member'}’s dashboard as they see it. Read-only.</span> <Link to="/admin">Back to admin</Link></p>
      ) : null}
      {phone ? <PhoneLayout {...props} mood={mood} phone /> : <DeskLayout {...props} mood={mood} />}
    </div>
  );
}

type LayoutProps = DashboardProps & { mood: Mood; phone?: boolean };

function DeskLayout(p: LayoutProps) {
  return (
    <>
      <Hero {...p} />
      <div className="pd-body">
        <div className="pd-main">
          <Stats {...p} />
          <SetupStrip steps={p.steps} busy={p.busy} onAct={p.onAct} />
          <UpNext going={p.going} imageFor={p.imageFor} />
          <Tracklist {...p} />
        </div>
        <aside className="pd-side" aria-label="Your profile">
          <EmailCard plan={p.plan} area={p.area} busy={p.busy} onAct={p.onAct} onEdit={p.onEdit} />
          <NearCard near={p.near} ready={p.nearReady} area={p.area} now={p.now} />
          <ListingsCard claims={p.claims} />
          <BadgeShelf badges={p.badges} />
          <p className="pd-fine">Instant alerts and quiet hours live in the <Link to="/map?settings=alerts">live map’s settings</Link>.</p>
        </aside>
      </div>
    </>
  );
}

function PhoneLayout(p: LayoutProps) {
  return (
    <>
      <Hero {...p} />
      <div className="pd-body">
        <Stats {...p} />
        <SetupStrip steps={p.steps} busy={p.busy} onAct={p.onAct} />
        <UpNext going={p.going} imageFor={p.imageFor} />
        <NearCard near={p.near} ready={p.nearReady} area={p.area} now={p.now} />
        <Tracklist {...p} />
        <EmailCard plan={p.plan} area={p.area} busy={p.busy} onAct={p.onAct} onEdit={p.onEdit} />
        <BadgeShelf badges={p.badges} />
        <ListingsCard claims={p.claims} />
        <p className="pd-fine">Instant alerts and quiet hours live in the <Link to="/map?settings=alerts">live map’s settings</Link>.</p>
      </div>
    </>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────── */

function HomeCover({ area, mood }: { area: string; mood: Mood }) {
  const shapes = useShapes();
  const shape = shapes.get(area.toUpperCase());
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="pd-cover" style={{ '--from': mood.from, '--to': mood.to, '--ink': mood.ink } as CSSProperties}
      initial={reduce ? false : { opacity: 0, scale: 0.86, rotate: -4 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 160, damping: 17 }}
      aria-hidden="true"
    >
      {shape ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          <g transform="translate(18 14) scale(.72)">
            <path d={shape} fill="currentColor" opacity=".18" transform="translate(5 5)" />
            <path d={shape} fill="currentColor" />
          </g>
        </svg>
      ) : <MapPin className="pd-cover-pin" strokeWidth={2.2} />}
      <span className="pd-cover-label">Your week</span>
      <img className="pd-cover-mark" src="/images/brand/plane-white.webp" alt="" width="28" height="28" />
      <span className="pd-cover-name">{area || 'Calgary'}</span>
    </motion.div>
  );
}

function Hero(p: LayoutProps) {
  const reduce = useReducedMotion();
  const weather = useCalgaryWeather();
  const sky = weather.current ? describeSky(weather.current.code, weather.current.isDay) : null;
  const unlocked = p.badges.filter((b) => b.unlocked).length;
  const scrollToPicks = () => document.getElementById('pd-picks')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const rise = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: EASE_OUT, delay: d } });
  return (
    <header className="pd-hero">
      <div className="pd-hero-in">
        <HomeCover area={p.area} mood={p.mood} />
        <div className="pd-hero-text">
          <motion.p className="pd-eyebrow" {...rise(0.05)}>
            <span className="pd-live" aria-hidden="true" /> {p.mood.name} mix
            {sky && weather.current ? <span className="pd-sky"><SkyGlyph icon={sky.icon} size={14} /> {Math.round(weather.current.temp)}° {sky.label.toLowerCase()}</span> : null}
          </motion.p>
          <motion.h1 {...rise(0.12)}>
            <span>{p.mood.name === 'Late night' ? 'Still up' : p.mood.name}{p.first ? `, ${p.first}` : ''}.</span>
            {p.area ? <>Your <em>{p.area}</em></> : <>Your <em>Calgary</em></>}
          </motion.h1>
          <motion.p className="pd-meta" {...rise(0.2)}>
            {p.user.photoURL ? <img src={p.user.photoURL} alt="" width="24" height="24" referrerPolicy="no-referrer" /> : <span className="pd-ava" aria-hidden="true">{(p.user.displayName || 'C').slice(0, 1)}</span>}
            <strong>Made for {p.first || 'you'}</strong>
            <span>{p.picks.length} pick{p.picks.length === 1 ? '' : 's'}</span>
            <span>{p.going.length} plan{p.going.length === 1 ? '' : 's'}</span>
            {p.phone ? null : <span>{unlocked} of {p.badges.length} badges</span>}
          </motion.p>
          {p.notice ? <Notice {...p.notice} /> : null}
          <motion.div className="pd-actions" {...rise(0.28)}>
            <button type="button" className="pd-play" onClick={scrollToPicks} aria-label="Jump to this week’s picks"><Play size={26} fill="currentColor" aria-hidden="true" /></button>
            <span className="pd-play-label">Play this week</span>
            <button type="button" className="pd-pill" onClick={() => p.onEdit()}><Pencil size={15} aria-hidden="true" /> Edit</button>
            <Link to="/map" className="pd-pill"><Radio size={15} aria-hidden="true" /> Live map</Link>
          </motion.div>
        </div>
      </div>
    </header>
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

/* ── Stats, Wrapped-style ─────────────────────────────────────────────── */

function Stats(p: LayoutProps) {
  const reduce = useReducedMotion();
  const unlocked = p.badges.filter((b) => b.unlocked).length;
  const tiles: Array<{ tone: string; n: number | null; of?: number; label: string; sub: string; href: string }> = [
    { tone: p.near.length ? 'red' : 'green', n: p.nearReady ? p.near.length : null, label: 'Near home', sub: p.nearReady ? (p.near.length ? 'reports, last 24 h' : 'All quiet, last 24 h') : 'Checking the map', href: '#pd-near' },
    { tone: 'sun', n: p.picks.length, label: 'Picks', sub: 'for the next 10 days', href: '#pd-picks' },
    { tone: 'hot', n: p.going.length, label: 'Going', sub: p.going[0] ? `Next ${fmt(p.going[0].start, { weekday: 'short', month: 'short', day: 'numeric' })}` : 'Tap “I’m going”', href: p.going.length ? '#pd-next' : '#pd-picks' },
    { tone: 'violet', n: unlocked, of: p.badges.length, label: 'Badges', sub: unlocked === p.badges.length ? 'Every one. Legend.' : `${p.badges.length - unlocked} left to earn`, href: '#pd-badges' },
  ];
  return (
    <div className="pd-stats" role="list">
      {tiles.map((t, i) => (
        <motion.a
          key={t.label} href={t.href} className="pd-stat" data-tone={t.tone} role="listitem"
          initial={reduce ? false : { opacity: 0, y: 30, rotate: i % 2 ? 2 : -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 170, damping: 18, delay: 0.25 + i * 0.07 }}
        >
          <span className="pd-stat-l">{t.label}</span>
          <span className="pd-stat-n">{t.n === null ? '…' : <CountUp value={t.n} />}{t.of ? <small>/{t.of}</small> : null}</span>
          <span className="pd-stat-s">{t.sub}</span>
        </motion.a>
      ))}
    </div>
  );
}

/* ── Setup: what's left, not a wall of ticks ──────────────────────────── */

const ACTION: Record<SetupStepId, string> = { home: 'Add', monday: 'Turn on', events: 'Turn on', interests: 'Choose', plan: 'See picks', share: 'Add one' };

function SetupStrip({ steps, busy, onAct }: { steps: SetupStep[]; busy: SetupStepId | null; onAct: (id: SetupStepId) => void }) {
  const pct = setupPercent(steps);
  if (pct === 100) return null;
  const left = steps.filter((s) => !s.done);
  return (
    <section className="pd-setup" aria-labelledby="pd-setup-title">
      <div className="pd-setup-head">
        <h2 id="pd-setup-title">Finish your setup</h2>
        <span className="pd-setup-pct">{pct}%</span>
      </div>
      <span className="pd-bar" aria-label={`${steps.length - left.length} of ${steps.length} done`}><span style={{ width: `${pct}%` }} /></span>
      <ul className="pd-todo">
        {left.map((s) => {
          const badge = BADGES.find((b) => b.id === s.badge)!;
          return (
            <li key={s.id}>
              <BadgeMark badge={{ ...badge, unlocked: false }} size={38} />
              <span><strong>{s.label}</strong><small>Earns {badge.label}</small></span>
              <button type="button" disabled={busy === s.id} onClick={() => onAct(s.id)}>{busy === s.id ? 'Adding…' : ACTION[s.id]}</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── Up next: plans as big cards ──────────────────────────────────────── */

function Art({ item, src, size }: { item: PickItem; src?: string; size?: 'sm' | 'lg' }) {
  const art = artFor(item);
  const [failed, setFailed] = useState(false);
  return (
    <span className="pd-art" data-size={size ?? 'sm'} style={{ '--from': art.from, '--to': art.to } as CSSProperties} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <art.Icon size={size === 'lg' ? 44 : 22} strokeWidth={2.2} />}
    </span>
  );
}

function UpNext({ going, imageFor }: { going: PickItem[]; imageFor: (id: string) => string | undefined }) {
  if (!going.length) return null;
  return (
    <section className="pd-sec" aria-labelledby="pd-next">
      <SecHead id="pd-next" title="Up next" note={`${going.length} plan${going.length === 1 ? '' : 's'} · reminders come by email`} />
      <ol className="pd-next">
        {going.map((g) => (
          <li key={g.key}>
            <Link to={g.path}>
              <Art item={g} src={imageFor(g.entityId)} size="lg" />
              <span className="pd-next-date"><small>{fmt(g.start, { weekday: 'short' })}</small><strong>{fmt(g.start, { day: 'numeric' })}</strong><small>{fmt(g.start, { month: 'short' })}</small></span>
              <span className="pd-next-body">
                <strong>{g.title}</strong>
                <small>{[pickWhen(g.start).split(' · ')[1], g.venue || g.neighbourhood].filter(Boolean).join(' · ')}</small>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SecHead({ id, title, note, action }: { id: string; title: string; note?: string; action?: ReactNode }) {
  return (
    <div className="pd-sec-head">
      <div>
        <h2 id={id}>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ── Tracklist ────────────────────────────────────────────────────────── */

function Tracklist(p: LayoutProps) {
  const labels = (item: PickItem) => EVENT_INTERESTS.filter((i) => item.matched.includes(i.id) && i.id !== 'free').map((i) => i.label);
  return (
    <section className="pd-sec" aria-labelledby="pd-picks">
      <SecHead
        id="pd-picks" title="Picked for you" note="Next 10 days, closest to home first"
        action={<button type="button" className="pd-pill" onClick={() => p.onEdit('interests')}><Pencil size={14} aria-hidden="true" /> Interests</button>}
      />
      {p.picks.length ? (
        <ol className="pd-tracks">
          <li className="pd-tracks-head" aria-hidden="true"><span>#</span><span>Title</span><span>Where</span><span>When</span><span /></li>
          {p.picks.map((item, i) => (
            <li key={item.key} className="pd-track">
              <span className="pd-track-n">{i + 1}</span>
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

function EmailCard({ plan, area, busy, onAct, onEdit }: { plan: EmailPlan; area: string; busy: SetupStepId | null; onAct: (id: SetupStepId) => void; onEdit: () => void }) {
  const adding = busy === 'monday' || busy === 'events';
  const up = plan.kind === 'monday' ? { text: <><strong>Add event picks?</strong> They ride along in the same Monday email{area ? `, near ${area} first` : ''}.</>, label: 'Add picks', id: 'events' as const }
    : plan.kind === 'thursday' ? { text: <><strong>Add safety near home?</strong> Your picks move to Monday and arrive together.</>, label: 'Add safety', id: 'monday' as const }
    : plan.kind === 'none' ? { text: <><strong>Get your week by email.</strong> Free, one tap to stop.</>, label: 'Turn on', id: 'monday' as const }
    : null;
  return (
    <section className="pd-card pd-mail" data-kind={plan.kind} aria-labelledby="pd-mail-title">
      <p className="pd-kicker"><Mail size={13} aria-hidden="true" /> In your inbox</p>
      <h2 id="pd-mail-title">{plan.name}</h2>
      <p className="pd-mail-inside">{plan.inside}</p>
      {plan.next ? <p className="pd-mail-next"><span>Next</span> {fmt(plan.next, { weekday: 'long', month: 'short', day: 'numeric' })} · {plan.cadence.split(', ')[1]}</p> : null}
      {up ? (
        <div className="pd-mail-up">
          <p>{up.text}</p>
          <button type="button" disabled={adding} onClick={() => onAct(up.id)}>{adding ? 'Adding…' : up.label}</button>
        </div>
      ) : null}
      <button type="button" className="pd-link" onClick={onEdit}>Change emails, area or interests <ChevronRight size={15} aria-hidden="true" /></button>
    </section>
  );
}

function NearCard({ near, ready, area, now }: { near: NearReport[]; ready: boolean; area: string; now: number }) {
  return (
    <section className="pd-card pd-near" aria-labelledby="pd-near">
      <p className="pd-kicker"><span className="pd-live" aria-hidden="true" /> Live · last 24 hours</p>
      <h2 id="pd-near">Near {area || 'home'}</h2>
      {!ready ? <p className="pd-quiet">Checking the live map…</p>
        : near.length ? (
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
        ) : <p className="pd-quiet"><Check size={18} aria-hidden="true" /> <span><strong>All quiet.</strong> Nothing reported near {area || 'home'} in the last day.</span></p>}
      <Link to="/map" className="pd-link">Open the live map <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </section>
  );
}

function BadgeShelf({ badges }: { badges: BadgeState[] }) {
  const unlocked = badges.filter((b) => b.unlocked).length;
  const next = [...badges].filter((b) => !b.unlocked).sort((a, b) => ((b.progress ?? 0) / (b.target ?? 1)) - ((a.progress ?? 0) / (a.target ?? 1)))[0];
  return (
    <section className="pd-card pd-badges" aria-labelledby="pd-badges">
      <div className="pd-card-head"><h2 id="pd-badges">Badges</h2><span>{unlocked} of {badges.length}</span></div>
      {next ? (
        <div className="pd-nextbadge">
          <BadgeMark badge={next} size={48} />
          <div>
            <p className="pd-kicker">Next up</p>
            <strong>{next.label}</strong>
            <small>{next.hint}</small>
            {next.target ? <span className="pd-bar" aria-label={`${next.progress ?? 0} of ${next.target}`}><span style={{ width: `${((next.progress ?? 0) / next.target) * 100}%` }} /></span> : null}
          </div>
        </div>
      ) : null}
      <ul className="pd-stickers">
        {badges.map((b, i) => (
          <li key={b.id} data-locked={!b.unlocked} style={{ '--tilt': `${((i * 37) % 13) - 6}deg` } as CSSProperties} title={b.unlocked ? b.earned : b.hint}>
            <BadgeMark badge={b} size={58} />
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
