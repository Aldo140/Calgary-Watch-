import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin } from 'lucide-react';
import type { Business, DiscoveryEntity, Market, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { programmeOf, shelfMates, shelfOf, SHELVES, type ProfileNext, type Programme, type Shelf } from '../../lib/localShelves';
import { isOpen, nextOpen, schedulePattern, statusLine, upcoming, weekdayShort } from '../../lib/marketDays';
import { MarketCover } from './ListingArt';
import { dayOf, Flap, ProfileCard, statusOf, timeOf, useSeen } from './LocalDirectory';
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
