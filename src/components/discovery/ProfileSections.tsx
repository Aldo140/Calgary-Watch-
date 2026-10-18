import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, BookOpen, Car, Drama, Ghost, GraduationCap, Landmark, MapPin, Music, Palette, Snowflake, Sparkles, Store, Tractor, UtensilsCrossed, Users, Coffee, Ticket, Baby, ShoppingBag, Sun, Wifi, type LucideIcon } from 'lucide-react';
import type { Business, DiscoveryEntity, Market, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { boardRows, programmeOf, shelfMates, shelfOf, SHELVES, type ProfileNext, type Programme, type Shelf } from '../../lib/localShelves';
import { isOpen, nextOpen, schedulePattern, statusLine, upcoming, weekdayShort } from '../../lib/marketDays';
import { MarketCover } from './ListingArt';
import { dayOf, Flap, ProfileCard, Seal, statusOf, timeOf, useSeen } from './LocalDirectory';
import { ProfileCover } from './ProfileCover';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { isOwnerVerified } from '../../lib/verified';
import { TEAR } from '../home/HomeHero';

const shelfIndex = new Map(SHELVES.map(s => [s.id, s]));

export interface ProfileTab { id: string; label: string; count?: number }

/**
 * The profile's own sticky tab bar. It lights the section you're reading and, on phones,
 * slides the lit tab into view.
 */
export function ProfileTabs({ tabs, tone }: { tabs: ProfileTab[]; tone: Shelf }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const bar = useRef<HTMLDivElement>(null);
  const key = tabs.map(t => t.id).join(' ');
  useEffect(() => {
    let raf = 0;
    const spy = () => {
      raf = 0;
      const line = window.innerHeight * 0.35;
      let current = tabs[0]?.id;
      for (const t of tabs) { const el = document.getElementById(t.id); if (el && el.getBoundingClientRect().top <= line) current = t.id; }
      setActive(current);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(spy); };
    spy();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [key]);
  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-current]');
    const row = bar.current;
    if (el && row && row.scrollWidth > row.clientWidth) row.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' });
  }, [active]);
  return (
    <nav className="lp-tabs" aria-label="On this profile" style={{ ['--tone' as string]: tone.tone, ['--tink' as string]: tone.ink } as CSSProperties}>
      <div className="cw-wrap lp-tabs-in" ref={bar}>
        {tabs.map(t => (
          <a key={t.id} href={`#${t.id}`} aria-current={active === t.id ? 'true' : undefined}>
            {t.label}{t.count ? <span>{t.count}</span> : null}
          </a>
        ))}
      </div>
    </nav>
  );
}

/**
 * "Next up" on a profile: whatever is on now, or the next date, on a split-flap card
 * that spins into place when it scrolls on screen.
 */
export function NextUp({ date, now, count, onNow }: { date: ProfileNext; now: number; count: number; onNow: boolean }) {
  const [ref, seen] = useSeen<HTMLAnchorElement>(true, '0px 0px -8% 0px');
  const day = dayOf(date.start);
  const time = timeOf(date.start, date.dateOnly);
  const st = onNow ? { label: 'On now', tone: 'now' } : statusOf(date.start, now);
  return (
    <Link to={date.path} className="lp-nextup" ref={ref} data-seen={seen || undefined}>
      <span className="lp-nextup-top">
        <span className={`ld-flap-status ld-st-${st.tone}`}>{st.label}</span>
        <small>{onNow ? 'Happening right now' : 'Next up'}{count > 1 ? ` · ${count} dates ahead` : ''}</small>
      </span>
      <span className="lp-nextup-when" aria-label={`${day}${time ? `, ${time}` : ''}`}>
        <b className="ld-cell"><Flap text={day} on={seen} /></b>
        {time ? <b className="ld-cell ld-cell-time"><Flap text={time} on={seen} delay={120} /></b> : null}
      </span>
      <strong className="lp-nextup-title">{date.title}</strong>
      {date.venue && date.venue !== date.title ? <span className="lp-nextup-where"><MapPin size={15} aria-hidden="true" />{date.venue}</span> : null}
      <span className="lp-nextup-go">See the details <ArrowUpRight size={17} aria-hidden="true" /></span>
    </Link>
  );
}

const cleanAddress = (a = '') => a.replace(/,?\s*Calgary,?\s*AB.*$/i, '').replace(/,\s*AB$/, '');

/** Each market an organization runs, as a location card with its cover, status and usual days. */
export function MarketLocations({ markets, occurrences, now }: { markets: readonly Market[]; occurrences: readonly MarketOccurrence[]; now: number }) {
  const at = new Date(now);
  return (
    <ul className="lp-mkts">
      {markets.map((m, i) => {
        const next = nextOpen(m, occurrences, at);
        const open = isOpen(next, at);
        const pattern = schedulePattern(upcoming(m, occurrences, at));
        return (
          <li key={m.id} style={{ ['--i' as string]: i } as CSSProperties}>
            <Link to={entityPath(m)} className="lp-mkt">
              <span className="lp-mkt-art"><MarketCover market={m} day={next ? weekdayShort.format(new Date(next.start)) : undefined} /></span>
              <span className="lp-mkt-body">
                <small className={`lp-mkt-status${open ? ' is-open' : ''}`}>{open ? <i aria-hidden="true" /> : null}{next ? (open ? statusLine(next, at) : `Next: ${statusLine(next, at)}`) : 'Dates on their site'}</small>
                <strong>{m.title}</strong>
                {pattern ? <span className="lp-mkt-usual">{pattern.dayText} · {pattern.hours}</span> : null}
                <span className="lp-mkt-where"><MapPin size={14} aria-hidden="true" />{m.neighbourhood || cleanAddress(m.address)}</span>
              </span>
              <span className="lx-go" aria-hidden="true"><ArrowUpRight size={18} /></span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** "More on the shelf": the profile's neighbours in the directory, as the same cards /local uses. */
export function ShelfMates({ place, all, occurrences, now }: { place: Business; all: readonly DiscoveryEntity[]; occurrences: readonly MarketOccurrence[]; now: number }) {
  const shelf = shelfIndex.get(shelfOf(place))!;
  const { mates, programmes } = useMemo(() => {
    const profiles = all.filter((e): e is Business => e.kind === 'business' && (!e.developmentOnly || !!place.developmentOnly));
    const programmes = new Map<string, Programme>(profiles.map(p => [p.id, programmeOf(p.id, all, occurrences, now)]));
    return { mates: shelfMates(place, profiles, programmes), programmes };
  }, [all, occurrences, now, place]);
  const [ref, seen] = useSeen<HTMLElement>(mates.length > 0);
  if (!mates.length) return null;
  const sameShelf = mates.every(m => shelfOf(m) === shelf.id);
  return (
    <section className="lp-mates ld-dir" data-motion ref={ref} aria-labelledby="lp-mates" style={{ ['--tone' as string]: shelf.tone } as CSSProperties}>
      <svg className="lx-edge lx-edge-top" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={TEAR} /></svg>
      <div className="cw-wrap">
        <header className="lp-mates-head">
          <div>
            <p className="lx-eyebrow ld-eyebrow-light"><span className="lx-dot" aria-hidden="true" />{sameShelf ? `The ${shelf.label.toLowerCase()} shelf` : 'Elsewhere on Local'}</p>
            <h2 id="lp-mates">{sameShelf ? <>More on <mark>the shelf.</mark></> : <>More <mark>on Local.</mark></>}</h2>
          </div>
          <p>{sameShelf ? shelf.line : 'More of the people who make Calgary.'} <Link className="lp-all" to={`/local#shelf-${shelf.id}`}>See the whole shelf</Link></p>
        </header>
        <div className="ld-shelf" data-seen={seen || undefined}>
          <ul className="ld-cards">
            {mates.map((p, i) => <ProfileCard key={p.id} p={p} shelf={shelfIndex.get(shelfOf(p))!} programme={programmes.get(p.id)} now={now} i={i} />)}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** An icon for each thing a profile offers, matched on its words. */
const SERVICE_ICONS: [RegExp, LucideIcon][] = [
  [/theat|stage|perform|opera|ballet|dance|play|myster|suspense|thriller/i, Drama], [/coffee|espresso|roast|caf|bean/i, Coffee], [/take ?out|to go|pick-?up/i, ShoppingBag], [/patio|outdoor|terrace/i, Sun], [/wi-?fi/i, Wifi],
  [/food|kitchen|restaurant|bak|eat|dine|dining|brunch|pastr/i, UtensilsCrossed],
  [/market|vendor|shop|retail|maker|craft|artisan|goods/i, Store], [/art|galler|exhibit|studio|creative/i, Palette], [/book|liter|read|author|writ/i, BookOpen],
  [/kid|family|child|camp/i, Baby], [/music|concert|band|sound/i, Music], [/class|workshop|course|language|lesson|learn|educat/i, GraduationCap],
  [/tour|heritage|histor|museum|culture|venue|rental|hall/i, Landmark], [/ghost|haunt|hallowe|scream|spook/i, Ghost], [/holiday|christmas|winter|yule|festive/i, Snowflake],
  [/farm|pick|harvest|garden|agric|produce|fruit|berr/i, Tractor], [/park|parking/i, Car], [/ticket|season|show/i, Ticket], [/community|volunteer|member|neighbour|program/i, Users],
];
const iconFor = (s: string) => SERVICE_ICONS.find(([re]) => re.test(s))?.[1] ?? Sparkles;

const longDay = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'long', day: 'numeric', year: 'numeric' });
const splitLead = (text: string) => { const m = text.match(/^(.+?[.!?])\s+(.+)$/s); return m && m[1].length > 30 ? [m[1], m[2]] as const : [text, ''] as const; };

/**
 * The profile spread: its drawn cover beside its story, set like a magazine page. The
 * first sentence is the standfirst, what they offer becomes icon tiles, and the facts
 * we hold about the profile sit underneath in a ledger.
 */
export function ProfileSpread({ place, name, shelf, number, quadrant, since, links }: {
  place: Business; name: string; shelf: Shelf; number: number; quadrant: string | null; since?: string; links: ReactNode;
}) {
  const [ref, seen] = useSeen<HTMLElement>(true, '0px 0px -15% 0px');
  const [lead, rest] = splitLead(place.description || place.summary);
  const verified = isOwnerVerified(place);
  const stamp = place.partner ? 'Partner' : verified ? 'Verified' : place.editorialSelection ? 'Our pick' : undefined;
  const official = place.sources.find(src => src.kind === 'official');
  const facts: [string, ReactNode][] = [
    ['Shelf', <Link key="s" to={`/local#shelf-${shelf.id}`}>{shelf.label}</Link>],
    ['Area', [place.neighbourhood, quadrant ? `${quadrant} Calgary` : null].filter(Boolean).join(' · ') || (shelf.id === 'day-trips' ? 'Outside Calgary' : 'Across Calgary')],
    ...(since ? [['Since', since] as [string, ReactNode]] : []),
    ['Listed from', official ? <a key="o" href={official.url} target="_blank" rel="noopener noreferrer">{official.name}</a> : 'Their public listings'],
    ['Last checked', longDay.format(new Date(place.verifiedAt || place.updatedAt))],
    ['Status', verified ? <span key="v" className="lp-ok"><BadgeCheck size={15} aria-hidden="true" />Run by the organization</span> : 'Not yet claimed'],
  ];
  return (
    <section id="lp-about" className="lp-spread" ref={ref} data-seen={seen || undefined} aria-labelledby="lp-story">
      <figure className="lp-spread-cover">
        <ProfileCover id={place.id} title={name} shelf={shelf} number={number} stamp={stamp} />
        <figcaption>Cover art for {name}, drawn for CalgaryWatch Local.</figcaption>
      </figure>
      <div className="lp-spread-copy">
        <p className="lx-eyebrow"><Seal title={place.title} tone={shelf} size="s" />From their own site</p>
        <h2 id="lp-story">Meet <mark>{name}.</mark></h2>
        <p className="lp-spread-lead">{lead}</p>
        {rest ? <p className="lp-spread-body">{rest}</p> : null}
        {place.services?.length ? (
          <ul className="lp-offers" aria-label="What you’ll find">
            {place.services.map((svc, i) => { const Icon = iconFor(svc); return <li key={svc} style={{ ['--i' as string]: i } as CSSProperties}><Icon size={22} aria-hidden="true" /><span>{svc}</span></li>; })}
          </ul>
        ) : null}
        {links}
        <dl className="lp-ledger">
          {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </div>
    </section>
  );
}

/**
 * For a profile with nothing dated: say so plainly, point to their own site, and keep the
 * page alive with the next dates from the rest of its shelf on the split-flap board.
 */
export function MeanwhileBoard({ place, shelf, site, siteLabel, all, occurrences, now }: {
  place: Business; shelf: Shelf; site?: string; siteLabel?: string; all: readonly DiscoveryEntity[]; occurrences: readonly MarketOccurrence[]; now: number;
}) {
  const rows = useMemo(() => {
    const profiles = all.filter((e): e is Business => e.kind === 'business' && e.id !== place.id && (!e.developmentOnly || !!place.developmentOnly));
    const programmes = new Map<string, Programme>(profiles.map(p => [p.id, programmeOf(p.id, all, occurrences, now)]));
    const same = boardRows(profiles.filter(p => shelfOf(p) === shelf.id), programmes, 5);
    return same.length >= 3 ? same : boardRows(profiles, programmes, 5);
  }, [all, occurrences, now, place, shelf.id]);
  const [ref, seen] = useSeen<HTMLElement>(rows.length > 0);
  const sameShelf = rows.length > 0 && rows.every(r => shelfOf(r.profile) === shelf.id);
  return (
    <section id="lp-programme" className="lp-meanwhile ld-board" ref={ref} data-seen={seen || undefined} aria-labelledby="lp-meanwhile">
      <div className="lp-meanwhile-head">
        <div>
          <p className="lx-eyebrow ld-eyebrow-light"><span className="lx-dot" aria-hidden="true" />Nothing dated here yet</p>
          <h2 id="lp-meanwhile">Meanwhile, <mark>{sameShelf ? `on the ${shelf.label.toLowerCase()} shelf.` : 'on Local.'}</mark></h2>
        </div>
        {site ? <a className="lp-meanwhile-site" href={site} target="_blank" rel="noopener noreferrer">Their own programme on {siteLabel} <ArrowUpRight size={16} aria-hidden="true" /></a> : null}
      </div>
      {rows.length ? (
        <div className="ld-flapboard">
          <ol>
            {rows.map((r, i) => {
              const day = dayOf(r.start); const time = timeOf(r.start, r.dateOnly); const st = statusOf(r.start, now);
              const tone = shelfIndex.get(shelfOf(r.profile))!;
              return (
                <li key={r.profile.id} className="ld-flap-row" style={{ ['--i' as string]: i } as CSSProperties}>
                  <span className="ld-flap-when" aria-label={`${day}${time ? `, ${time}` : ''}`}>
                    <b className="ld-cell"><Flap text={day} on={seen} delay={i * 90} /></b>
                    {time ? <b className="ld-cell ld-cell-time"><Flap text={time} on={seen} delay={i * 90 + 120} /></b> : null}
                  </span>
                  <Link to={r.path} className="ld-flap-what" aria-label={r.title}>
                    <b className="ld-cell ld-cell-wide"><Flap text={r.title.toUpperCase()} on={seen} delay={i * 90 + 60} /></b>
                  </Link>
                  <Link to={entityPath(r.profile)} className="ld-flap-from"><Seal title={r.profile.title} tone={tone} size="s" /><span>{r.profile.title.split(/\s+[—–-]\s+/)[0]}</span></Link>
                  <span className={`ld-flap-status ld-st-${st.tone}`}>{st.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Every section marked data-reveal gets data-seen as it scrolls into view, so its heading
 * rises in and its highlight wipes across. Without IntersectionObserver everything shows.
 */
export function useSectionReveal(key: string) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const els = [...(root.current?.querySelectorAll<HTMLElement>('[data-reveal]') ?? [])];
    if (typeof IntersectionObserver === 'undefined') { els.forEach(el => { el.dataset.seen = ''; }); return; }
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { (e.target as HTMLElement).dataset.seen = ''; io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -12% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [key]);
  return root;
}

/** The ribbon under a profile's hero: its name and facts going by in its shelf colour. */
export function ProfileRibbon({ items }: { items: string[] }) {
  const loop = [...items, ...items, ...items];
  return (
    <div className="ld-ribbon lp-ribbon" aria-hidden="true">
      <div className="ld-ribbon-track">
        {loop.map((t, i) => <span key={i}><img src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" width="26" height="26" loading="lazy" />{t}</span>)}
      </div>
    </div>
  );
}
