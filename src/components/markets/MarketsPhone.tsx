import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Map as MapIcon, Navigation, X } from 'lucide-react';
import type { Market, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { countdown, dayNum, directionsUrl, hours, isOpen, marketCoords, quadrantOf, shortClock, shortName, statusLine, weekdayShort } from '../../lib/marketDays';
import { MarketCover } from '../discovery/ListingArt';
import { MarketMap } from './MarketMap';
import { SkyGlyph } from '../home/WeekPlanner';
import type { SkyIcon } from '../../lib/weatherCodes';
import { distanceLabel } from '../../lib/nearMe';

/**
 * The phone-only pieces of /markets: a swipeable deck of what's on next, a
 * sticky day scrubber, a full-screen map sheet and a dock. Laptops keep the
 * board in MarketsBoard; these are hidden there by markets-phone.css.
 */

export type NextPick = { market: Market; next: MarketOccurrence };

/** "Closes in 2 h 10 min" and how far through the day it is, for a market that's open. */
export function openLeft(o: MarketOccurrence, now: Date) {
  const start = Date.parse(o.start), end = Date.parse(o.end);
  const left = Math.max(0, end - now.getTime());
  const h = Math.floor(left / 3_600_000), m = Math.round((left % 3_600_000) / 60_000);
  const text = h ? `Closes in ${h} h${m ? ` ${m} min` : ''}` : `Closes in ${m} min`;
  return { text, done: Math.min(1, Math.max(0, (now.getTime() - start) / (end - start))) };
}

/** The clock ticks once a minute so "closes in" and "open now" stay true while the page is open. */
export function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/** Which card of a horizontal snap rail is centred. */
function useCentred(rail: React.RefObject<HTMLElement | null>, count: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const kids = [...el.children] as HTMLElement[];
        const mid = el.scrollLeft + el.clientWidth / 2;
        let best = 0, gap = Infinity;
        kids.forEach((k, n) => { const d = Math.abs(k.offsetLeft + k.offsetWidth / 2 - mid); if (d < gap) { gap = d; best = n; } });
        setI(best);
      });
    };
    el.addEventListener('scroll', on, { passive: true });
    return () => { el.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, [rail, count]);
  return i;
}

/** The hero on phones: the next market days as a deck of cards you swipe through. */
export function UpNextDeck({ picks, now }: { picks: NextPick[]; now: Date }) {
  const rail = useRef<HTMLOListElement>(null);
  const at = useCentred(rail, picks.length);
  if (!picks.length) return null;
  const go = (n: number) => {
    const card = rail.current?.children[n] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };
  return (
    <section className="mk-deck" aria-label="Next market days">
      <ol className="mk-deck-rail" ref={rail}>
        {picks.map(({ market, next }, n) => {
          const open = isOpen(next, now);
          const left = open ? openLeft(next, now) : null;
          return (
            <li key={market.id} className={`mk-deck-card${open ? ' is-open' : ''}`} style={{ ['--i' as string]: n }}>
              <Link to={entityPath(market)} className="mk-deck-art" aria-hidden="true" tabIndex={-1}>
                <MarketCover market={market} eager={n === 0} />
                <span className="mk-deck-stamp">
                  {open ? <><span className="cw-lb-pulse mk-pulse" />Open now</> : countdown(next, now)}
                </span>
                <span className="mk-deck-date"><small>{weekdayShort.format(new Date(next.start))}</small><b>{dayNum.format(new Date(next.start))}</b></span>
              </Link>
              <div className="mk-deck-body">
                <h2><Link to={entityPath(market)}>{market.title}</Link></h2>
                <p className="mk-deck-when">{open ? `Until ${shortClock(next.end)}` : statusLine(next, now)}</p>
                <p className="mk-deck-where"><span>{market.venue && !market.title.includes(market.venue) ? market.venue : market.neighbourhood}</span>{quadrantOf(market) ? <b>{quadrantOf(market)}</b> : null}</p>
                {left ? (
                  <p className="mk-deck-left">
                    <span className="mk-deck-bar" style={{ ['--p' as string]: left.done }} aria-hidden="true"><i /></span>
                    {left.text}
                  </p>
                ) : null}
                <div className="mk-deck-actions">
                  <a className="mk-btn mk-btn-ink" href={directionsUrl(market)} target="_blank" rel="noopener noreferrer"><Navigation size={15} aria-hidden="true" /> Go</a>
                  <Link className="mk-btn" to={entityPath(market)}>Details <ArrowRight size={15} aria-hidden="true" /></Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {picks.length > 1 ? (
        <p className="mk-deck-dots">
          {picks.map(({ market }, n) => (
            <button key={market.id} type="button" className={n === at ? 'is-on' : undefined} aria-label={`Show ${shortName(market)}`} aria-current={n === at ? 'true' : undefined} onClick={() => go(n)} />
          ))}
        </p>
      ) : null}
    </section>
  );
}

export type Day = {
  key: string; date: Date; label: string; count: number;
  /** The day's forecast, when the weather feed has it; rough = likely wet or properly cold. */
  sky?: { icon: SkyIcon; label: string; max: number; rough: boolean };
};

/** Seven days as a sticky strip. Picking one narrows the list to the markets on that day. */
export function DayScrubber({ days, day, total, onPick }: { days: Day[]; day: string; total: number; onPick: (key: string) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el) return;
    setBar({ x: el.offsetLeft, w: el.offsetWidth });
    el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [day]);
  const most = Math.max(1, ...days.map(d => d.count));
  return (
    <div className="mk-scrub" role="group" aria-label="Pick a day">
      <div className="mk-scrub-strip" ref={strip}>
        {bar ? <span className="mk-scrub-bar" style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} aria-hidden="true" /> : null}
        <button type="button" className="mk-scrub-all" aria-pressed={!day} onClick={() => onPick('')}>
          <small>All</small><b>{total}</b><span>markets</span>
        </button>
        {days.map(d => (
          <button key={d.key} type="button" className={d.sky?.rough ? 'is-rough' : undefined} aria-pressed={day === d.key} disabled={!d.count} onClick={() => onPick(day === d.key ? '' : d.key)}
            aria-label={`${d.label}: ${d.count} ${d.count === 1 ? 'market' : 'markets'}${d.sky ? `, ${d.sky.label}, high ${d.sky.max}°` : ''}`}>
            <small>{d.label === 'Today' ? 'Today' : d.label === 'Tomorrow' ? 'Tmrw' : weekdayShort.format(d.date)}</small>
            <b>{dayNum.format(d.date)}</b>
            {d.sky ? <span className="mk-scrub-sky" aria-hidden="true"><SkyGlyph icon={d.sky.icon} size={12} />{d.sky.max}°</span> : null}
            <span className="mk-scrub-meter" aria-hidden="true"><i style={{ width: `${(d.count / most) * 100}%` }} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Full-screen map with a rail of cards: swipe the cards and the pin follows, tap a pin and its card comes up. */
export function MapSheet({ markets, picks, now, onClose, kmTo }: { markets: Market[]; picks: Map<string, MarketOccurrence | undefined>; now: Date; onClose: () => void; kmTo?: (m: Market) => number | undefined }) {
  const rail = useRef<HTMLOListElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const at = useCentred(rail, markets.length);
  const focus = markets[at]?.id;
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', key); };
  }, [onClose]);
  const pick = (id: string) => {
    const n = markets.findIndex(m => m.id === id);
    const card = rail.current?.children[n] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };
  const openIds = new Set(markets.filter(m => isOpen(picks.get(m.id), now)).map(m => m.id));
  return (
    <div className="mk-sheet" role="dialog" aria-modal="true" aria-labelledby="mk-sheet-title">
      <header className="mk-sheet-head">
        <p id="mk-sheet-title"><MapIcon size={16} aria-hidden="true" /> {markets.length} {markets.length === 1 ? 'market' : 'markets'} on the map</p>
        <button ref={close} type="button" className="mk-sheet-x" onClick={onClose} aria-label="Close the map"><X size={20} /></button>
      </header>
      <div className="mk-sheet-map">
        <MarketMap markets={markets} openIds={openIds} focusId={focus} onPick={pick} />
      </div>
      <ol className="mk-sheet-rail" ref={rail}>
        {markets.map((m, n) => {
          const next = picks.get(m.id);
          const open = isOpen(next, now);
          return (
            <li key={m.id} className={`${open ? 'is-open' : ''}${m.id === focus ? ' is-focus' : ''}`}>
              <span className="mk-sheet-art" aria-hidden="true"><MarketCover market={m} /><b>{n + 1}</b></span>
              <span className="mk-sheet-body">
                <small>{open ? <><span className="cw-lb-pulse mk-pulse" aria-hidden="true" />Open until {shortClock(next!.end)}</> : next ? `${countdown(next, now)} · ${hours(next)}` : 'No dates yet'}</small>
                <Link to={entityPath(m)}><strong>{m.title}</strong></Link>
                <span>{[kmTo?.(m) !== undefined ? `${distanceLabel(kmTo(m)!)} away` : m.neighbourhood, quadrantOf(m)].filter(Boolean).join(' · ')}{marketCoords(m) ? '' : ' · not on the map'}</span>
              </span>
              <a className="mk-sheet-go" href={directionsUrl(m)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${m.title}`}><Navigation size={17} /></a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A dock that floats in while you're browsing the list: what you're looking at, and the map. */
export function MarketsDock({ shown, label, onTop, onMap }: { shown: boolean; label: React.ReactNode; onTop: () => void; onMap: () => void }) {
  return (
    <div className={`mk-mdock${shown ? ' is-shown' : ''}`} aria-hidden={!shown}>
      <button type="button" className="mk-mdock-now" onClick={onTop} tabIndex={shown ? 0 : -1}>{label}</button>
      <button type="button" className="mk-mdock-map" onClick={onMap} tabIndex={shown ? 0 : -1}><MapIcon size={17} aria-hidden="true" /> Map</button>
    </div>
  );
}
