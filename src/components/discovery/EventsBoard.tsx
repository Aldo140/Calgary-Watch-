import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUpRight, Plus, Search, Sparkles, X } from 'lucide-react';
import type { Event as EventEntity } from '../../types/discovery';
import { calgaryDate, entityPath, startClock } from '../../lib/discovery';
import { matchesTonight, addCalgaryDays } from '../../lib/discoveryCalendar';
import { interestScore } from '../../lib/eventRank';
import { boardCount, buildEventsBoard, daysLeft, initialDayCount, type DayEntry, type EventDay } from '../../lib/eventsBoard';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { CalgarySky, type SkyVariant } from '../home/CalgarySky';
import { TEAR } from '../home/HomeHero';
import { Scribble } from '../home/HomeYours';
import { SkyGlyph } from '../home/WeekPlanner';
import { useCalgaryWeather } from '../../hooks/useCalgaryWeather';
import { describeSky, type SkyIcon } from '../../lib/weatherCodes';
import { moonPhase, skyPalette, sunPosition } from '../../lib/sky';
import { EventArt, eventArtKind } from './ListingArt';
import '../../styles/home.css';
import '../../styles/home-board.css';
import '../../styles/home-v3.css';
import '../../styles/events.css';

const fmt = (opts: Intl.DateTimeFormatOptions) => calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...opts });
const clock = fmt({ hour: 'numeric', minute: '2-digit' });
const monthDay = fmt({ month: 'short', day: 'numeric' });
// Day keys are Calgary dates (YYYY-MM-DD); format them at noon UTC so the weekday never slips.
const noon = (date: string) => new Date(`${date}T12:00:00Z`);
const utc = (opts: Intl.DateTimeFormatOptions) => calgaryDateTimeFormat('en-CA', { timeZone: 'UTC', ...opts });
const dWeekShort = utc({ weekday: 'short' });
const dWeekLong = utc({ weekday: 'long' });
const dMonthDay = utc({ month: 'short', day: 'numeric' });
const dNum = utc({ day: 'numeric' });
const variantFor = (w: number): SkyVariant => (w <= 720 ? 'mobile' : w <= 1024 ? 'tablet' : 'desktop');

const SHORT: Record<string, string> = { 'All events': 'All', 'This weekend': 'Weekend' };
const KIND_LABEL: Record<string, string> = { music: 'Music', sports: 'Sports', arts: 'Arts', family: 'Family', food: 'Food & drink', other: 'Out & about' };

function dayName(date: string, today: string) {
  if (date === today) return 'Today';
  if (date === addCalgaryDays(today, 1)) return 'Tomorrow';
  return dWeekLong.format(noon(date));
}

function price(e: EventEntity) {
  if (e.pricing === 'free') return 'Free';
  if (e.priceRange) {
    const [lo, hi] = e.priceRange.map(n => `$${Math.round(n)}`);
    return lo === hi ? lo : `${lo}–${hi}`;
  }
  return e.pricing === 'paid' ? 'Tickets' : null;
}

/** "1:00 & 6:00 p.m." for two showings, "7:30 p.m." for one. */
function times(starts: string[]) {
  const all = starts.map(s => startClock(s, clock));
  if (all.length === 1) return all[0];
  const [a, b] = [all[0], all[all.length - 1]];
  const sameHalf = a.slice(-4) === b.slice(-4) && !/All day/.test(a + b);
  return all.length === 2 ? `${sameHalf ? a.replace(/\s?[ap]\.m\.$/, '') : a} & ${b}` : `${a} + ${all.length - 1} more`;
}

const place = (e: EventEntity) => [e.venue || e.address, e.venue && e.neighbourhood ? e.neighbourhood : ''].filter(Boolean).join(' · ');

function Art({ e }: { e: EventEntity }) {
  return e.image && /^https:\/\//.test(e.image.src)
    ? <img src={e.image.src} alt={e.image.alt} loading="lazy" decoding="async" />
    : <EventArt id={e.id} title={e.title} categories={e.categories} />;
}

export interface EventsBoardProps {
  title: string;
  /** What's listed on this page, after the date, interest and search filters. */
  items: EventEntity[];
  /** Every upcoming event, for the tonight/weekend counts and the hero pick. */
  upcoming: EventEntity[];
  when: { to: string; label: string; current: boolean; count?: number }[];
  interests: { to: string; label: string; current: boolean }[];
  query: string;
  period?: 'today' | 'tonight' | 'this-weekend';
  emptyCta: ReactNode;
}

/** /events: the live sky, a day strip to jump through the calendar, runs on their own shelf, then day by day. */
export function EventsBoard({ title, items, upcoming, when, interests, query, period, emptyCta }: EventsBoardProps) {
  const now = useMemo(() => new Date(), []);
  const today = calgaryDate(now);
  const board = useMemo(() => buildEventsBoard(items, now), [items, now]);
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(() => initialDayCount(board.days));
  useEffect(() => setShown(initialDayCount(board.days)), [board]);
  const [active, setActive] = useState<string | undefined>(board.days[0]?.date);
  const pendingJump = useRef<string | null>(null);

  const tonight = useMemo(() => boardCount(upcoming.filter(e => matchesTonight(e.start, e.end, now)), now), [upcoming, now]);
  const pick = useMemo(() => {
    const todays = upcoming.filter(e => calgaryDate(new Date(e.start)) === today && Date.parse(e.start) > now.getTime() - 3600000);
    const pool = todays.length ? todays : upcoming.filter(e => calgaryDate(new Date(e.start)) === addCalgaryDays(today, 1));
    return [...pool].sort((a, b) => interestScore(b, b.start) - interestScore(a, a.start) || Date.parse(a.start) - Date.parse(b.start))[0];
  }, [upcoming, today, now]);

  const visible = board.days.slice(0, shown);
  const next = board.days.slice(shown, shown + 7);
  const strip = board.days.slice(0, 14);

  // Which day is on screen, so the strip can follow along.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive((hit.target as HTMLElement).dataset.day);
    }, { rootMargin: '-35% 0px -60% 0px' });
    document.querySelectorAll<HTMLElement>('.ev-day[data-day]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [shown, board]);
  useEffect(() => {
    if (!active) return;
    const tile = document.querySelector<HTMLElement>(`.ev-strip [data-day="${active}"]`);
    const row = tile?.parentElement;
    if (tile && row && row.scrollWidth > row.clientWidth) row.scrollTo({ left: tile.offsetLeft - row.clientWidth / 2 + tile.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
  }, [active, reduce]);

  const jump = (date: string) => {
    const index = board.days.findIndex(d => d.date === date);
    if (index >= shown) { pendingJump.current = date; setShown(index + 1); return; }
    document.getElementById(`ev-${date}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  useEffect(() => {
    if (!pendingJump.current) return;
    document.getElementById(`ev-${pendingJump.current}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    pendingJump.current = null;
  }, [shown, reduce]);

  const total = board.days.reduce((n, d) => n + d.count, 0) + board.running.length;
  const lastDay = board.days[board.days.length - 1]?.date;
  const months = lastDay ? Math.round((noon(lastDay).getTime() - noon(today).getTime()) / (30 * 86400000)) : 0;
  const filtered = interests.some(i => i.current) || !!query;
  const lead = period === 'tonight' ? `${total} ${total === 1 ? 'thing' : 'things'} on tonight${filtered ? ' that match' : ''}.`
    : period === 'today' ? `${total} ${total === 1 ? 'thing' : 'things'} on today${filtered ? ' that match' : `, ${tonight} of them tonight`}.`
    : period === 'this-weekend' ? `${total} ${total === 1 ? 'thing' : 'things'} on this weekend, from Friday night to Sunday.`
    : filtered ? `${total} ${total === 1 ? 'listing matches' : 'listings match'}${query ? ` “${query}”` : ''}, soonest first.`
    : `${tonight} on tonight. ${total} listings${months >= 2 ? ` over the next ${months} months` : ''}, each linked to its organizer or ticket seller.`;

  const [first, ...restTitle] = title.split(' in ');

  return (
    <div className="ev cw-home2">
      <Sky pick={pick} today={today}>
        <h1 id="ev-title"><span className="ev-h1-a">{first}</span> <span className="ev-h1-b"><span className="ev-in">in</span> <Scribble>{restTitle.join(' in ') || 'Calgary'}.</Scribble></span></h1>
        <p className="ev-lead">{lead}</p>
        <div className="ev-tools">
          <EventsSearch query={query} />
          <Link to="/submit?type=event" className="ev-add"><Plus size={17} aria-hidden="true" /> <span>Add an event</span></Link>
        </div>
      </Sky>

      <div className="cw-wrap ev-sill">
        <div className="ev-card">
          <div className="ev-card-top">
            <nav className="ev-when" aria-label="When">
              {when.map(l => <Link key={l.label} to={l.to} aria-current={l.current ? 'page' : undefined}><span className="ev-long">{l.label}</span><span className="ev-short">{SHORT[l.label] ?? l.label}</span>{l.count != null ? <small>{l.count}</small> : null}</Link>)}
            </nav>
            <p className="ev-card-kicker">Free · checked with organizers</p>
          </div>
          <nav className="ev-chips" aria-label="Interests">
            {interests.map(l => <Link key={l.label} to={l.to} aria-current={l.current ? 'page' : undefined}>{l.label}{l.current ? <X size={13} aria-hidden="true" /> : null}</Link>)}
          </nav>
        </div>
      </div>

      {strip.length > 1 ? (
        <div className="ev-strip" aria-label="Jump to a day">
          <div className="cw-wrap ev-strip-in">
            <span className="ev-strip-label" aria-hidden="true">Jump to</span>
            <div className="ev-strip-row">
              {strip.map(d => (
                <button key={d.date} type="button" data-day={d.date} className={`${d.date === today ? 'is-today' : ''}${d.date === active ? ' is-active' : ''}`} onClick={() => jump(d.date)} aria-label={`${dayName(d.date, today)}, ${dMonthDay.format(noon(d.date))}: ${d.count} ${d.count === 1 ? 'event' : 'events'}`}>
                  <small>{d.date === today ? 'Today' : dWeekShort.format(noon(d.date))}</small>
                  <b>{dNum.format(noon(d.date))}</b>
                  <i>{d.count}</i>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <main className="cw-wrap ev-main">
        {!items.length ? (
          <div className="ev-empty">{query ? (
            <>
              <p><strong>Nothing listed matches “{query}” yet.</strong> We only list what we’ve checked with the organizer.</p>
              <p>Know of one? <Link to="/submit?type=event">Add it</Link> and it earns you the Event scout badge once it’s in.</p>
            </>
          ) : emptyCta}</div>
        ) : null}

        {board.running.length ? <Running events={board.running} now={now} /> : null}

        {visible.map((d, i) => (
          <div key={d.date}>
            <Day day={d} today={today} heroPick={pick?.id} />
            {i === 0 && !period ? <ForYou /> : null}
          </div>
        ))}

        {next.length ? (
          <div className="ev-more">
            <button type="button" className="ev-more-btn" onClick={() => setShown(n => n + 7)}>
              Show the next {next.length === 1 ? 'day' : `${next.length} days`} <ArrowDown size={18} aria-hidden="true" />
            </button>
            <p>{dMonthDay.format(noon(next[0].date))}{next.length > 1 ? ` to ${dMonthDay.format(noon(next[next.length - 1].date))}` : ''} · {next.reduce((n, d) => n + d.count, 0)} events · {board.days.length - shown} days still to come</p>
          </div>
        ) : visible.length ? <p className="ev-end">That’s everything listed so far. <Link to="/submit?type=event">Add one we’re missing</Link>.</p> : null}
      </main>
    </div>
  );
}

/* ── The sky ────────────────────────────────────────────────────────── */

function Sky({ pick, today, children }: { pick?: EventEntity; today: string; children: ReactNode }) {
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
  const rise = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] as const, delay: d } });
  const pickDay = pick ? calgaryDate(new Date(pick.start)) : '';
  const evening = pick ? Number(fmt({ hour: '2-digit', hourCycle: 'h23' }).format(new Date(pick.start))) >= 17 : false;
  const pickLabel = pickDay !== today ? 'Tomorrow’s big one' : evening ? 'Tonight’s big one' : 'Today’s big one';

  return (
    <section className="ev-sky" data-tone={palette.tone} style={{ background: palette.top }} aria-labelledby="ev-title">
      <CalgarySky palette={palette} sun={sun} phase={moonPhase(new Date(now))} cloudCover={cloudCover} windKph={current?.windKph ?? 8} precip={precip} variant={variant} now={Math.floor(now / 300000)} />
      <div className="cw-wrap ev-sky-in">
        <motion.div className="ev-sky-copy" {...rise(0)}>
          <p className="ev-dateline">
            <span className="h-dateline-live"><span className="h-pulse" aria-hidden="true" />Events · {clock.format(new Date(now))}</span>
            {current && sky ? <span className="ev-chip"><SkyGlyph icon={sky.icon} size={14} /> {Math.round(current.temp)}° {sky.label.toLowerCase()}</span> : null}
          </p>
          {children}
        </motion.div>
        {pick ? (
          <motion.div className="ev-pick" {...rise(0.15)}>
            <Link to={entityPath(pick)} aria-label={`${pickLabel}: ${pick.title}`}>
              <span className="ev-pick-tag"><Sparkles size={13} aria-hidden="true" /> {pickLabel}</span>
              <span className="ev-pick-art"><Art e={pick} /></span>
              <span className="ev-pick-body">
                <small>{startClock(pick.start, clock)}{price(pick) ? ` · ${price(pick)}` : ''}</small>
                <strong>{pick.title}</strong>
                <span>{place(pick)}</span>
              </span>
              <span className="ev-pick-stub" aria-hidden="true"><b>Admit one</b><i>{dMonthDay.format(noon(pickDay))}</i></span>
            </Link>
          </motion.div>
        ) : null}
      </div>
      <svg className="h-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={TEAR} transform="translate(0 -5)" className="h-tear-shade" />
        <path d={TEAR} className="h-tear-paper" />
      </svg>
    </section>
  );
}

/* ── Runs already under way ─────────────────────────────────────────── */

function Running({ events, now }: { events: EventEntity[]; now: Date }) {
  return (
    <section className="ev-running" aria-labelledby="ev-running-title">
      <header className="ev-sec-head">
        <h2 id="ev-running-title"><span className="ev-pill ev-pill-cyan">On now</span> Exhibitions &amp; runs</h2>
        <p>Already open, so they’re not tied to one day. Soonest to close first.</p>
      </header>
      <ul className="ev-run-row">
        {events.map(e => {
          const left = daysLeft(e.end, now);
          const closing = left <= 7;
          return (
            <li key={e.id}>
              <Link to={entityPath(e)} className="ev-run">
                <span className="ev-run-art"><Art e={e} /></span>
                <span className="ev-run-body">
                  <span className={`ev-run-until${closing ? ' is-closing' : ''}`}>{left <= 0 ? 'Last day today' : left === 1 ? 'Closes tomorrow' : closing ? `${left} days left` : `Until ${monthDay.format(new Date(e.end))}`}</span>
                  <strong>{e.title}</strong>
                  <span className="ev-run-place">{e.venue || e.address}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── A day ──────────────────────────────────────────────────────────── */

function Day({ day, today, heroPick }: { day: EventDay; today: string; heroPick?: string }) {
  // Desktop already shows this one as the ticket on the sky, so there it sits in the list
  // as a plain row; phones, which don't show the ticket, keep it as the lead.
  const dupe = !!day.lead && day.lead.event.id === heroPick;
  const rows = day.entries.filter(x => x !== day.lead || dupe);
  const name = dayName(day.date, today);
  return (
    <section className="ev-day" id={`ev-${day.date}`} data-day={day.date} aria-labelledby={`ev-h-${day.date}`}>
      <h2 id={`ev-h-${day.date}`} className="ev-day-head">
        <span className={`ev-pill${day.date === today ? ' ev-pill-navy' : ''}`}>{name}</span>
        <span className="ev-day-date">{name === dWeekLong.format(noon(day.date)) ? dMonthDay.format(noon(day.date)) : `${dWeekShort.format(noon(day.date))}, ${dMonthDay.format(noon(day.date))}`}</span>
        <small>{day.count} {day.count === 1 ? 'event' : 'events'}</small>
      </h2>
      {day.lead ? <Lead entry={day.lead} dupe={dupe} /> : null}
      {rows.length ? <ul className="ev-rows">{rows.map(x => <Row key={x.key + x.event.id} entry={x} dupe={dupe && x === day.lead} />)}</ul> : null}
    </section>
  );
}

function Lead({ entry, dupe }: { entry: DayEntry; dupe?: boolean }) {
  const e = entry.event; const cost = price(e);
  return (
    <Link to={entityPath(e)} className={`ev-lead-card${dupe ? ' is-dupe' : ''}`}>
      <span className="ev-lead-art"><Art e={e} />{e.image?.credit ? <em>{e.image.credit}</em> : null}</span>
      <span className="ev-lead-body">
        <span className="ev-lead-tag">Pick of the day</span>
        <span className="ev-lead-time">{times(entry.starts)}</span>
        <strong>{e.title}</strong>
        <span className="ev-lead-place">{place(e)}</span>
        <span className="ev-lead-foot">
          {cost ? <span className={`ev-price${cost === 'Free' ? ' is-free' : ''}`}>{cost}</span> : null}
          {eventArtKind(e.categories) !== 'other' ? <span className="ev-kind">{KIND_LABEL[eventArtKind(e.categories)]}</span> : null}
          <span className="ev-go" aria-hidden="true"><ArrowUpRight size={18} /></span>
        </span>
      </span>
    </Link>
  );
}

function Row({ entry, dupe }: { entry: DayEntry; dupe?: boolean }) {
  const e = entry.event; const cost = price(e);
  return (
    <li className={dupe ? 'is-dupe' : undefined}>
      <Link to={entityPath(e)} className="ev-row">
        <span className="ev-row-time">{times(entry.starts)}</span>
        <span className="ev-row-art"><Art e={e} /></span>
        <span className="ev-row-body">
          <strong>{e.title}</strong>
          <span>{place(e) || KIND_LABEL[eventArtKind(e.categories)]}</span>
        </span>
        {cost ? <span className={`ev-price${cost === 'Free' ? ' is-free' : ''}`}>{cost}</span> : null}
        <span className="ev-go" aria-hidden="true"><ArrowUpRight size={16} /></span>
      </Link>
    </li>
  );
}

function ForYou() {
  return (
    <Link to="/plans" className="ev-foryou">
      <span className="ev-foryou-tag">For you</span>
      <span className="ev-foryou-copy"><strong>Too much to scroll?</strong> Pick what you’re into and get a short list near home every Thursday.</span>
      <span className="ev-foryou-cta">Get my picks <ArrowUpRight size={16} aria-hidden="true" /></span>
    </Link>
  );
}

/** Search inside the current listing: keeps the date and interest filters, updates ?q=. */
function EventsSearch({ query }: { query: string }) {
  const [value, setValue] = useState(query);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  useEffect(() => setValue(query), [query]);
  const go = (q: string) => {
    const params = new URLSearchParams(search);
    if (q.trim()) params.set('q', q.trim()); else params.delete('q');
    navigate(`${pathname}${params.size ? `?${params}` : ''}`, { replace: true });
  };
  return (
    <form className="ev-search" role="search" onSubmit={e => { e.preventDefault(); go(value); }}>
      <Search size={19} aria-hidden="true" />
      <label className="cw-sr" htmlFor="ev-q">Search events</label>
      <input id="ev-q" type="search" value={value} onChange={e => setValue(e.target.value)} placeholder="Search events: jazz, Flames, kids…" enterKeyHint="search" />
      {value ? <button type="button" aria-label="Clear search" onClick={() => { setValue(''); go(''); }}><X size={16} /></button> : null}
      <button type="submit" className="ev-search-go">Search</button>
    </form>
  );
}
