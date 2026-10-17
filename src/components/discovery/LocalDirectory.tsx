import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, Coffee, Drama, FerrisWheel, Ghost, MapPin, Palette, Search, Store, Tractor, Users, X, type LucideIcon } from 'lucide-react';
import type { Business } from '../../types/discovery';
import { entityPath, LOCAL_CATEGORIES } from '../../lib/discovery';
import { SHELVES, type BoardRow, type Programme, type Shelf, type ShelfId } from '../../lib/localShelves';
import { LOCAL_NOTES } from '../../data/localNotes';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { isOwnerVerified } from '../../lib/verified';
import { TEAR } from '../home/HomeHero';

const SPARK = '/images/brand/calgarywatch-city-spark-v2.webp';
export const SHELF_ICONS: Record<ShelfId, LucideIcon> = {
  stages: Drama, culture: Palette, markets: Store, coffee: Coffee, 'days-out': FerrisWheel, community: Users, 'day-trips': Tractor, seasonal: Ghost,
};

const tz = { timeZone: 'America/Edmonton' } as const;
const wday = calgaryDateTimeFormat('en-CA', { ...tz, weekday: 'short' });
const dnum = calgaryDateTimeFormat('en-CA', { ...tz, day: 'numeric' });
const mon = calgaryDateTimeFormat('en-CA', { ...tz, month: 'short' });
const hm = calgaryDateTimeFormat('en-CA', { ...tz, hour: 'numeric', minute: '2-digit' });
const ymd = calgaryDateTimeFormat('en-CA', { ...tz, year: 'numeric', month: '2-digit', day: '2-digit' });
const hour = calgaryDateTimeFormat('en-GB', { ...tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const shortName = (title: string) => title.split(/\s+[—–-]\s+/)[0];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const clean = (s: string) => s.replace(/\./g, '').toUpperCase();
/** Midnight starts are date-only listings; we show the day and leave the time blank. */
const timeOf = (start: string, dateOnly: boolean) => (dateOnly || hour.format(new Date(start)) === '00:00' ? '' : clean(hm.format(new Date(start))));
const dayOf = (start: string) => { const d = new Date(start); return `${clean(wday.format(d))} ${dnum.format(d)} ${clean(mon.format(d))}`; };

/** Two letters for a profile's seal: "Vertigo Theatre" → VT, "MAKERS" → MA. */
export function initials(title: string) {
  const words = shortName(title).replace(/[’'&+]/g, ' ').split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w) && !/^(the|of|and|de|at)$/i.test(w));
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Whole-section reveal: true once the element has scrolled into view (or straight away without IntersectionObserver). */
function useSeen<T extends HTMLElement>(ready: boolean, margin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!ready || !el) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ready, margin]);
  return [ref, seen] as const;
}

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A number that counts up once it's on screen. */
function CountUp({ to, on }: { to: number; on: boolean }) {
  const [n, setN] = useState(to);
  useEffect(() => {
    if (!on || reduced() || to < 2) { setN(to); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 1100); setN(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    setN(0); raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on, to]);
  return <>{n}</>;
}

const FLAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/**
 * Split-flap text: when the board comes on screen each line spins through letters and
 * settles left to right, like a departures board. Screen readers get the plain text.
 */
function Flap({ text, on, delay = 0 }: { text: string; on: boolean; delay?: number }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!on || reduced()) { setShown(text); return; }
    let frame = 0; let timer = 0;
    const total = Math.min(text.length, 26) + 8;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        frame++;
        const settled = frame - 8;
        setShown(text.split('').map((ch, i) => (i < settled || ch === ' ' || i >= 26 ? ch : FLAP[(i * 7 + frame * 13) % FLAP.length])).join(''));
        if (frame >= total) { clearInterval(timer); setShown(text); }
      }, 38);
    }, delay);
    setShown(text.replace(/[^ ]/g, ' '));
    return () => { clearTimeout(start); clearInterval(timer); };
  }, [on, text, delay]);
  return <span aria-hidden="true">{shown}</span>;
}

function statusOf(start: string, now: number) {
  const today = ymd.format(new Date(now));
  const d = ymd.format(new Date(start));
  if (d === today) return { label: 'Today', tone: 'now' };
  if (d === ymd.format(new Date(now + 86400000))) return { label: 'Tomorrow', tone: 'soon' };
  if (Date.parse(start) - now < 7 * 86400000) return { label: 'This week', tone: 'week' };
  return { label: 'Coming up', tone: 'later' };
}

/**
 * The departures board: the next date from each profile, soonest first. Every row is a
 * real listing with a date checked against the organizer's own page.
 */
export function ComingUpBoard({ rows, stats, now, shelfOfId }: { rows: BoardRow[]; stats: { profiles: number; shelves: number; dates: number; organizers: number }; now: number; shelfOfId: Map<string, ShelfId> }) {
  const [ref, seen] = useSeen<HTMLElement>(rows.length > 0);
  if (!rows.length) return null;
  return (
    <section className="ld-board" aria-labelledby="ld-board" ref={ref} data-seen={seen || undefined}>
      <svg className="lx-edge lx-edge-top" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={TEAR} /></svg>
      <div className="cw-wrap">
        <header className="ld-board-head">
          <div>
            <p className="lx-eyebrow ld-eyebrow-light"><span className="lx-dot" aria-hidden="true" />Live from the profiles</p>
            <h2 id="ld-board">Coming up <mark>from Local.</mark></h2>
          </div>
          <dl className="ld-stats">
            <div><dt>Profiles</dt><dd><CountUp to={stats.profiles} on={seen} /></dd></div>
            <div><dt>Dates ahead</dt><dd><CountUp to={stats.dates} on={seen} /></dd></div>
            <div><dt>With dates</dt><dd><CountUp to={stats.organizers} on={seen} /></dd></div>
            <div><dt>Shelves</dt><dd><CountUp to={stats.shelves} on={seen} /></dd></div>
          </dl>
        </header>
        <div className="ld-flapboard">
          <div className="ld-flap-row ld-flap-head" aria-hidden="true"><span>When</span><span>What’s on</span><span>From</span><span>Status</span></div>
          <ol>
            {rows.map((r, i) => {
              const day = dayOf(r.start); const time = timeOf(r.start, r.dateOnly); const st = statusOf(r.start, now);
              return (
                <li key={r.profile.id} className="ld-flap-row" style={{ ['--i' as string]: i } as CSSProperties}>
                  <span className="ld-flap-when" aria-label={`${day}${time ? `, ${time}` : ''}`}>
                    <b className="ld-cell"><Flap text={day} on={seen} delay={i * 90} /></b>
                    {time ? <b className="ld-cell ld-cell-time"><Flap text={time} on={seen} delay={i * 90 + 120} /></b> : null}
                  </span>
                  <Link to={r.path} className="ld-flap-what" aria-label={r.title}>
                    <b className="ld-cell ld-cell-wide"><Flap text={r.title.toUpperCase()} on={seen} delay={i * 90 + 60} /></b>
                    {r.venue && r.venue !== r.title && r.venue !== r.profile.title ? <small>{r.venue}</small> : null}
                  </Link>
                  <Link to={entityPath(r.profile)} className="ld-flap-from">
                    <Seal title={r.profile.title} tone={shelfIndex.get(shelfOfId.get(r.profile.id) ?? 'culture')!} size="s" />
                    <span>{shortName(r.profile.title)}</span>
                  </Link>
                  <span className={`ld-flap-status ld-st-${st.tone}`}>{st.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="ld-board-foot">Every date is checked against the organizer’s own page. <Link to="/events">See everything on in Calgary <ArrowUpRight size={14} aria-hidden="true" /></Link></p>
      </div>
      <svg className="lx-edge lx-edge-bottom" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={TEAR} /></svg>
    </section>
  );
}

const shelfIndex = new Map(SHELVES.map(s => [s.id, s]));

/** A profile's round seal: its initials on its shelf's colour. */
export function Seal({ title, tone, size = 'm' }: { title: string; tone: Shelf; size?: 's' | 'm' }) {
  return <span className={`ld-seal ld-seal-${size}`} style={{ ['--tone' as string]: tone.tone, ['--tink' as string]: tone.ink } as CSSProperties} aria-hidden="true">{initials(title)}</span>;
}

/** Yellow ribbon under the hero: the shelves going by, separated by the city-spark mark. */
export function ShelfRibbon({ counts }: { counts: Map<ShelfId, number> }) {
  const items = SHELVES.filter(s => counts.get(s.id));
  const loop = [...items, ...items, ...items];
  return (
    <div className="ld-ribbon" aria-hidden="true">
      <div className="ld-ribbon-track">
        {loop.map((s, i) => <span key={i}><img src={SPARK} alt="" width="26" height="26" loading="lazy" />{s.label}<i>{counts.get(s.id)}</i></span>)}
      </div>
    </div>
  );
}

function ProfileCard({ p, shelf, programme, now, i }: { p: Business; shelf: Shelf; programme?: Programme; now: number; i: number }) {
  const note = LOCAL_NOTES[p.id];
  const verified = isOwnerVerified(p);
  const next = programme?.next;
  const where = [p.neighbourhood, p.address?.match(/\b(NW|NE|SW|SE)\b/)?.[1]].filter(Boolean).join(' · ') || (/outside|day-trip/.test(p.tags.join(' ')) ? 'Outside Calgary' : 'Across Calgary');
  return (
    <li className="ld-card" style={{ ['--tone' as string]: shelf.tone, ['--tink' as string]: shelf.ink, ['--i' as string]: Math.min(i, 8) } as CSSProperties}>
      <Link to={entityPath(p)} className="ld-card-main">
        <span className="ld-card-top">
          <Seal title={p.title} tone={shelf} />
          <span className="lx-go ld-card-go" aria-hidden="true"><ArrowUpRight size={18} /></span>
        </span>
        <strong className="ld-card-name">{p.title}</strong>
        <span className="ld-card-meta">
          <span className="ld-card-where"><MapPin size={13} aria-hidden="true" />{where}</span>
          {p.partner ? <i className="ld-flag ld-flag-partner">Featured partner</i> : p.editorialSelection ? <i className="ld-flag ld-flag-pick">Our pick</i> : null}
          {verified ? <i className="ld-flag ld-flag-verified"><BadgeCheck size={13} aria-hidden="true" />Verified</i> : null}
        </span>
        <span className="ld-card-sum">{note?.pick ?? p.summary}</span>
        <span className="ld-card-next" data-empty={!next || undefined}>
          {next ? <>
            <span className="ld-date" aria-hidden="true"><small>{clean(mon.format(new Date(next.start)))}</small><b>{dnum.format(new Date(next.start))}</b></span>
            <span className="ld-next-copy"><small>{programme!.count > 1 ? `Next of ${programme!.count} dates` : 'Next date'}{statusOf(next.start, now).tone === 'now' ? ' · today' : ''}</small><b>{next.title}</b></span>
          </> : programme?.onNow ? <>
            <span className="ld-date ld-date-now" aria-hidden="true"><small>ON</small><b>NOW</b></span>
            <span className="ld-next-copy"><small>On now</small><b>{programme.onNow.title}</b></span>
          </> : <span className="ld-next-copy">
            {note?.dontMiss[0] ? <><small>Don’t miss</small><b>{note.dontMiss[0]}</b></>
              : p.website ? <><small>Official site</small><b>{host(p.website)}</b></>
              : <><small>Profile</small><b>Details, links and directions</b></>}
          </span>}
        </span>
      </Link>
    </li>
  );
}

/**
 * The directory: every profile on its shelf. A sticky rail (sideways chips on phones)
 * jumps between shelves and a search box narrows every shelf at once.
 */
export function ShelfDirectory({ profiles, shelfOfId, programmes, now, category }: {
  profiles: Business[]; shelfOfId: Map<string, ShelfId>; programmes: Map<string, Programme>; now: number; category?: string;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState<ShelfId | null>(null);
  const needle = q.trim().toLocaleLowerCase('en-CA');
  const match = (p: Business) => !needle || `${p.title} ${p.summary} ${p.neighbourhood ?? ''} ${p.tags.join(' ')}`.toLocaleLowerCase('en-CA').includes(needle);
  const shelves = useMemo(() => SHELVES.map(s => ({ shelf: s, all: profiles.filter(p => shelfOfId.get(p.id) === s.id) })).filter(x => x.all.length), [profiles, shelfOfId]);
  const visible = shelves.map(x => ({ ...x, list: x.all.filter(match) }));
  const hits = visible.reduce((n, x) => n + x.list.length, 0);
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);

  // Scroll-spy: the rail lights the shelf whose heading has passed the upper third of the screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const spy = () => {
      raf = 0;
      const line = window.innerHeight * 0.35;
      let current: ShelfId | null = null;
      el.querySelectorAll<HTMLElement>('.ld-shelf:not([hidden])').forEach(s => { if (s.getBoundingClientRect().top < line) current = s.dataset.shelf as ShelfId; });
      const rect = el.getBoundingClientRect();
      if (rect.bottom < line) current = null;
      setActive(current);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(spy); };
    spy();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, [shelves.length, hits]);

  // Shelves rise into place as they arrive. Marked from JS, so without it everything simply shows.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined' || reduced()) return;
    el.setAttribute('data-motion', '');
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.setAttribute('data-seen', ''); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
    el.querySelectorAll('.ld-shelf').forEach(s => io.observe(s));
    return () => io.disconnect();
  }, [shelves.length]);

  // Keep the active chip in view on the phone's sideways rail.
  useEffect(() => {
    const chip = rail.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    const bar = chip?.parentElement;
    if (chip && bar && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: chip.offsetLeft - 16, behavior: reduced() ? 'auto' : 'smooth' });
  }, [active]);

  return (
    <section className="ld-dir" aria-labelledby="ld-dir" ref={root}>
      <header className="lx-head ld-dir-head">
        <div>
          <p className="lx-eyebrow"><span className="lx-dot" aria-hidden="true" />{profiles.length} profiles · {shelves.length} shelves</p>
          <h2 id="ld-dir">{category ? <>{cap(category)}, <mark>shelf by shelf.</mark></> : <>Every profile, <mark>on its shelf.</mark></>}</h2>
        </div>
        <p>The organizations behind Calgary’s stages, markets and community halls, and the independents we’d send a friend to. Each profile is checked against its own site.</p>
      </header>

      <div className="ld-dir-grid">
        <aside className="ld-rail" ref={rail} aria-label="Shelves">
          <label className="ld-search">
            <Search size={17} aria-hidden="true" />
            <span className="ld-sr">Search Local profiles</span>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a theatre, market, café…" autoComplete="off" />
            {q ? <button type="button" onClick={() => setQ('')} aria-label="Clear search"><X size={15} /></button> : null}
          </label>
          <nav className="ld-rail-list">
            {visible.map(({ shelf, list }) => {
              const Icon = SHELF_ICONS[shelf.id];
              return (
                <a key={shelf.id} href={`#shelf-${shelf.id}`} data-chip={shelf.id} aria-current={active === shelf.id ? 'true' : undefined} data-empty={!list.length || undefined}
                  style={{ ['--tone' as string]: shelf.tone, ['--tink' as string]: shelf.ink } as CSSProperties}>
                  <span className="ld-rail-ico"><Icon size={15} aria-hidden="true" /></span>{shelf.label}<i>{list.length}</i>
                </a>
              );
            })}
          </nav>
          {!category ? (
            <p className="ld-rail-types">By type: {LOCAL_CATEGORIES.map((c, i) => <span key={c}>{i ? ' · ' : ''}<Link to={`/local/${c}`}>{cap(c)}</Link></span>)}</p>
          ) : <p className="ld-rail-types"><Link to="/local">← Every profile</Link></p>}
        </aside>

        <div className="ld-shelves">
          <p className="ld-sr" aria-live="polite">{needle ? `${hits} ${hits === 1 ? 'profile matches' : 'profiles match'}` : ''}</p>
          {visible.map(({ shelf, list, all }) => {
            const Icon = SHELF_ICONS[shelf.id];
            const withDates = all.filter(p => programmes.get(p.id)?.count).length;
            return (
              <section key={shelf.id} id={`shelf-${shelf.id}`} className="ld-shelf" data-shelf={shelf.id} hidden={!list.length} aria-labelledby={`shelf-h-${shelf.id}`}
                style={{ ['--tone' as string]: shelf.tone, ['--tink' as string]: shelf.ink } as CSSProperties}>
                <header className="ld-shelf-head">
                  <span className="ld-cover" aria-hidden="true">
                    <Icon size={50} strokeWidth={2} />
                    <img src={SPARK} alt="" width="34" height="34" loading="lazy" />
                    <b>{String(all.length).padStart(2, '0')}</b>
                  </span>
                  <span className="ld-shelf-copy">
                    <h3 id={`shelf-h-${shelf.id}`}>{shelf.label}</h3>
                    <p>{shelf.line}</p>
                    <small>{all.length} {all.length === 1 ? 'profile' : 'profiles'}{withDates ? ` · ${withDates} with dates coming up` : ''}</small>
                  </span>
                </header>
                <ul className="ld-cards">
                  {list.map((p, i) => <ProfileCard key={p.id} p={p} shelf={shelf} programme={programmes.get(p.id)} now={now} i={i} />)}
                </ul>
              </section>
            );
          })}
          {needle && !hits ? (
            <div className="ld-none">
              <p><b>No profile matches “{q.trim()}”.</b> Try a neighbourhood, or tell us who we’re missing.</p>
              <Link className="lx-btn" to="/submit">Suggest a profile <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
