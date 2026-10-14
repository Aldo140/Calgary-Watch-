import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Business } from '../../types/discovery';
import { entityPath, LOCAL_CATEGORIES } from '../../lib/discovery';
import { useCalgaryWeather } from '../../hooks/useCalgaryWeather';
import { describeSky, type SkyIcon } from '../../lib/weatherCodes';
import { moonPhase, skyPalette, sunPosition } from '../../lib/sky';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { CalgarySky, type SkyVariant } from '../home/CalgarySky';
import { TEAR } from '../home/HomeHero';
import { SkyGlyph } from '../home/WeekPlanner';
import { ShopArt } from './ListingArt';
import { useSkyOverlayRegistration } from '../../lib/skyOverlay';
import { byVerified } from '../../lib/verified';

const dateline = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
const clock = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });

/** Upper storeys above each storefront, so the row reads as a real block of Main Street. */
const UPPER = [
  { floors: 2, wall: '#d9634c' },
  { floors: 0, wall: '#2c5fc4' },
  { floors: 1, wall: '#3a8f74' },
  { floors: 2, wall: '#7b56c7' },
  { floors: 1, wall: '#c98a2e' },
  { floors: 0, wall: '#2a7da6' },
];

const shortName = (title: string) => title.split(/\s+[—–-]\s+/)[0];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function variantFor(width: number): SkyVariant {
  return width <= 720 ? 'mobile' : width <= 1024 ? 'tablet' : 'desktop';
}

/** Floors over a shop: a brick wall with a row of windows per floor, lit after dark. */
export function Upper({ floors, wall, seed, night }: { floors: number; wall: string; seed: number; night: boolean }) {
  if (!floors) return null;
  const h = floors * 44 + 14;
  return (
    <svg className="lx-upper" viewBox={`0 0 200 ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="200" height={h} fill={wall} />
      <rect x="-2" y="0" width="204" height="8" fill="#151515" opacity=".85" />
      {Array.from({ length: floors }, (_, f) => [0, 1, 2, 3].map(w => {
        const lit = night && (seed * 7 + f * 3 + w * 5) % 4 !== 0;
        return <rect key={`${f}-${w}`} x={20 + w * 44} y={18 + f * 44} width="28" height="30" rx="2" fill={lit ? '#ffd88a' : '#1f2a3d'} stroke="#151515" strokeWidth="2.5" />;
      }))}
    </svg>
  );
}

/** What the live sky gives the content drawn inside it. */
export interface SkyState { night: boolean; variant: SkyVariant; now: number; temp?: number; skyIcon?: SkyIcon; skyLabel?: string }

/**
 * The homepage's live Calgary sky as a frame for any Local hero: the real sun, moon and
 * weather, the header borrowing its ink, and the torn paper edge at the bottom.
 */
export function LiveSky({ className, labelledBy, children }: { className?: string; labelledBy: string; children: (sky: SkyState) => ReactNode }) {
  useSkyOverlayRegistration();
  const ref = useRef<HTMLElement>(null);
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
  const night = palette.darkness > 0.45;

  // The header floats over this sky, so it borrows the sky's ink (as on the homepage).
  useEffect(() => {
    const site = ref.current?.closest('.cw-site');
    site?.setAttribute('data-sky-tone', palette.tone);
    return () => site?.removeAttribute('data-sky-tone');
  }, [palette.tone]);

  return (
    <div className="cw-home2 lx">
      <section className={`h-hero lx-hero${className ? ` ${className}` : ''}`} data-tone={palette.tone} data-night={night || undefined} ref={ref} style={{ background: palette.top }} aria-labelledby={labelledBy}>
        <CalgarySky
          palette={palette}
          sun={sun}
          phase={moonPhase(new Date(now))}
          cloudCover={cloudCover}
          windKph={current?.windKph ?? 8}
          precip={precip}
          variant={variant}
          now={Math.floor(now / 300000)}
        />
        {children({ night, variant, now, temp: current?.temp, skyIcon: sky?.icon, skyLabel: sky?.label })}
        <svg className="h-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d={TEAR} transform="translate(0 -5)" className="h-tear-shade" />
          <path d={TEAR} className="h-tear-paper" />
        </svg>
      </section>
    </div>
  );
}

/** "Live sky · 5:12 p.m. · Tuesday, October 13 · <where> · 9° clear", as on the homepage. */
export function SkyDateline({ sky, where }: { sky: SkyState; where: string }) {
  return (
    <p className="h-dateline">
      <span className="h-dateline-live" title="Live sky: the sun’s real position over Calgary right now">
        <span className="h-pulse" aria-hidden="true" />Live sky · {clock.format(new Date(sky.now))}
      </span>
      <span className="h-date-long">{dateline.format(new Date(sky.now))}</span>
      <span className="h-date-short">{shortDate.format(new Date(sky.now))}</span>
      <span className="h-date-city" aria-hidden="true">·</span>
      <span className="h-date-city">{where}</span>
      {sky.temp !== undefined && sky.skyIcon ? <span className="h-dateline-wx"><SkyGlyph icon={sky.skyIcon} size={15} /> {Math.round(sky.temp)}° {sky.skyLabel?.toLowerCase()}</span> : null}
    </p>
  );
}

/**
 * The /local hero: the homepage's live Calgary sky, with every place in the book
 * standing shoulder to shoulder along one street in front of downtown.
 */
export function LocalHero({ places, category, counts, areas }: { places: Business[]; category?: string; counts: Record<string, number>; areas: number }) {
  const street = useMemo(() => places.slice().sort((a, b) => Number(b.editorialSelection) - Number(a.editorialSelection) || byVerified(a, b) || a.title.localeCompare(b.title)), [places]);
  const total = counts.all ?? places.length;

  return (
    <LiveSky labelledBy="lx-title">
      {sky => <>
        <div className="cw-wrap h-hero-inner lx-hero-inner">
          <SkyDateline sky={sky} where="CalgaryWatch Local" />
          {category === 'services'
            ? <h1 id="lx-title" className="lx-title">The Calgarians to call <em>when something breaks.</em></h1>
            : <h1 id="lx-title" className="lx-title">The places Calgarians <em>keep to themselves.</em></h1>}
          <p className="h-summary lx-summary">
            {category === 'services'
              ? 'Plumbers, furnace techs, snow removal and the rest, with what to ask before you hire. Picked by us, never sold.'
              : <><b>{total} independent {total === 1 ? 'place' : 'places'}</b> in {areas} {areas === 1 ? 'neighbourhood' : 'neighbourhoods'}, each checked against its own site. Picked by us, never sold.</>}
          </p>
          <nav className="h-intents lx-cats" aria-label="Filter local places">
            <Link to="/local" aria-current={!category ? 'page' : undefined}>Everything <i>{total}</i></Link>
            {LOCAL_CATEGORIES.map(c => <Link key={c} to={`/local/${c}`} aria-current={category === c ? 'page' : undefined}>{cap(c)} <i>{counts[c] ?? 0}</i></Link>)}
          </nav>
        </div>
        {street.length ? <Street places={street} night={sky.night} label="Every place in the book" /> : null}
      </>}
    </LiveSky>
  );
}

/** A street lamp on the kerb between two shops, lit after dark. */
function Lamp() {
  return (
    <svg className="lx-lamp" viewBox="0 0 40 150" aria-hidden="true" focusable="false">
      <path className="lx-lamp-glow" d="M8 22 L-26 150 L66 150 L32 22 Z" />
      <rect x="18" y="20" width="5" height="128" fill="#151515" />
      <path d="M20.5 22 Q20.5 6 34 6" fill="none" stroke="#151515" strokeWidth="4" />
      <path d="M26 6 h16 l-3 9 h-10 z" fill="#151515" />
      <rect className="lx-lamp-bulb" x="29" y="14" width="10" height="5" rx="2" />
      <rect x="13" y="140" width="15" height="9" rx="2" fill="#151515" />
    </svg>
  );
}

type VehicleKind = 'car' | 'pickup' | 'bus' | 'taxi' | 'bike' | 'van';

/** Flat, ink-outlined vehicles in the homepage's illustration style. All face right. */
function Vehicle({ kind, paint }: { kind: VehicleKind; paint: string }) {
  const wheel = (cx: number, r = 9) => <g><circle cx={cx} cy={52 - r} r={r} fill="#151515" /><circle cx={cx} cy={52 - r} r={r * .42} fill="#c9c4b8" /></g>;
  const beam = (x: number, y: number) => <path className="lx-beam" d={`M${x} ${y} L${x + 70} ${y - 14} L${x + 70} ${y + 16} Z`} />;
  switch (kind) {
    case 'bus':
      return (
        <svg viewBox="0 0 250 60" width="250" height="60">
          {beam(244, 38)}
          <path d="M6 10 Q6 4 12 4 H236 Q246 4 246 14 V44 Q246 48 242 48 H8 Q6 48 6 44 Z" fill="#f4f1ea" stroke="#151515" strokeWidth="3" />
          <rect x="6" y="34" width="240" height="7" fill="#d8433f" />
          {[18, 54, 90, 126, 162].map(x => <rect key={x} className="lx-win" x={x} y="11" width="30" height="17" rx="2" stroke="#151515" strokeWidth="2.5" />)}
          <rect className="lx-win" x="200" y="11" width="22" height="31" rx="2" stroke="#151515" strokeWidth="2.5" />
          <path d="M226 10 h14 Q244 10 244 16 V30 H226 Z" className="lx-win" stroke="#151515" strokeWidth="2.5" />
          <rect x="60" y="0" width="96" height="9" rx="2" fill="#151515" />
          <text x="108" y="7" textAnchor="middle" fill="#ffd34d" fontSize="7" fontFamily="IBM Plex Mono, monospace" fontWeight="700">1 BOWNESS</text>
          <rect x="242" y="34" width="5" height="5" fill="#ffd34d" stroke="#151515" strokeWidth="1.5" />
          {wheel(44, 10)}{wheel(196, 10)}
        </svg>
      );
    case 'pickup':
      return (
        <svg viewBox="0 0 150 60" width="150" height="60">
          {beam(144, 34)}
          <path d="M6 26 H70 V12 Q70 8 74 8 H104 Q110 8 114 14 L124 26 H140 Q146 26 146 32 V44 Q146 48 142 48 H8 Q6 48 6 44 Z" fill={paint} stroke="#151515" strokeWidth="3" strokeLinejoin="round" />
          <path className="lx-win" d="M78 13 H102 Q106 13 109 17 L116 26 H78 Z" stroke="#151515" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M8 26 V20 H66" fill="none" stroke="#151515" strokeWidth="3" />
          <rect x="140" y="30" width="6" height="5" fill="#ffd34d" stroke="#151515" strokeWidth="1.5" />
          <rect x="4" y="30" width="5" height="6" fill="#d8433f" stroke="#151515" strokeWidth="1.5" />
          {/* A Calgary pickup carries a hay bale. Of course it does. */}
          <rect x="22" y="12" width="30" height="14" rx="3" fill="#e8c35a" stroke="#151515" strokeWidth="2.5" />
          <path d="M30 13 v12 M44 13 v12" stroke="#151515" strokeWidth="1.5" />
          {wheel(32, 11)}{wheel(118, 11)}
        </svg>
      );
    case 'bike':
      return (
        <svg viewBox="0 0 70 60" width="70" height="60">
          <circle cx="14" cy="42" r="10" fill="none" stroke="#151515" strokeWidth="3" />
          <circle cx="56" cy="42" r="10" fill="none" stroke="#151515" strokeWidth="3" />
          <path d="M14 42 L28 26 H50 L56 42 M28 26 L36 42 L50 26 M24 22 h10" fill="none" stroke="#151515" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M34 8 L40 24 L32 34" fill="none" stroke={paint} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M36 12 L50 24" stroke={paint} strokeWidth="5" strokeLinecap="round" />
          <circle cx="36" cy="5" r="6" fill="#f2c9a5" stroke="#151515" strokeWidth="2" />
          <path d="M29 4 Q36 -4 43 4 Z" fill="#1554d1" stroke="#151515" strokeWidth="2" />
        </svg>
      );
    case 'van':
      return (
        <svg viewBox="0 0 140 60" width="140" height="60">
          {beam(134, 36)}
          <path d="M6 10 Q6 6 10 6 H96 Q104 6 110 14 L126 28 Q136 30 136 38 V44 Q136 48 132 48 H8 Q6 48 6 44 Z" fill={paint} stroke="#151515" strokeWidth="3" strokeLinejoin="round" />
          <path className="lx-win" d="M98 12 Q102 12 106 16 L118 28 H98 Z" stroke="#151515" strokeWidth="2.5" strokeLinejoin="round" />
          <text x="50" y="30" textAnchor="middle" fill="#151515" fontSize="11" fontFamily="Bricolage Grotesque, Inter, sans-serif" fontWeight="800">FRESH BREAD</text>
          <rect x="130" y="32" width="6" height="5" fill="#ffd34d" stroke="#151515" strokeWidth="1.5" />
          {wheel(30)}{wheel(110)}
        </svg>
      );
    default: {
      const taxi = kind === 'taxi';
      return (
        <svg viewBox="0 0 120 60" width="120" height="60">
          {beam(114, 36)}
          <path d="M6 32 Q6 26 14 25 L30 23 L42 11 Q46 8 52 8 H78 Q84 8 88 12 L100 24 Q114 25 114 34 V44 Q114 48 110 48 H8 Q6 48 6 44 Z" fill={paint} stroke="#151515" strokeWidth="3" strokeLinejoin="round" />
          <path className="lx-win" d="M36 23 L46 13 Q48 12 52 12 H62 V23 Z M66 12 H78 Q82 12 84 14 L94 23 H66 Z" stroke="#151515" strokeWidth="2.5" strokeLinejoin="round" />
          {taxi ? <><rect x="52" y="0" width="22" height="8" rx="2" fill="#fff" stroke="#151515" strokeWidth="2" /><text x="63" y="6.5" textAnchor="middle" fontSize="5.5" fontWeight="800" fill="#151515" fontFamily="Inter, sans-serif">TAXI</text><path d="M8 34 h104" stroke="#151515" strokeWidth="2" strokeDasharray="4 4" /></> : null}
          <rect x="108" y="30" width="6" height="5" fill="#ffd34d" stroke="#151515" strokeWidth="1.5" />
          <rect x="5" y="30" width="5" height="5" fill="#d8433f" stroke="#151515" strokeWidth="1.5" />
          {wheel(30)}{wheel(92)}
        </svg>
      );
    }
  }
}

/** Who's on the road. Far lane drives left, near lane drives right; negative delays spread them out from the first frame. */
const NEAR = 24;
const FAR = 18;
const TRAFFIC: { kind: VehicleKind; paint: string; lane: 'far' | 'near'; dur: number; delay: number; park: number }[] = [
  // Each lane keeps one speed, evenly spaced, so nobody rear-ends anybody.
  { kind: 'bus', paint: '', lane: 'near', dur: NEAR, delay: -NEAR * .1, park: 6 },
  { kind: 'car', paint: '#00c2e0', lane: 'near', dur: NEAR, delay: -NEAR * .35, park: 42 },
  { kind: 'bike', paint: '#ffdf4f', lane: 'near', dur: NEAR, delay: -NEAR * .6, park: 64 },
  { kind: 'pickup', paint: '#d8433f', lane: 'near', dur: NEAR, delay: -NEAR * .85, park: 84 },
  { kind: 'taxi', paint: '#ffdf4f', lane: 'far', dur: FAR, delay: -FAR * .05, park: 18 },
  { kind: 'van', paint: '#dfe6fb', lane: 'far', dur: FAR, delay: -FAR * .38, park: 52 },
  { kind: 'car', paint: '#7b56c7', lane: 'far', dur: FAR, delay: -FAR * .71, park: 80 },
];

export function Traffic() {
  return (
    <div className="lx-traffic" aria-hidden="true">
      {TRAFFIC.map((v, i) => (
        <span key={i} className={`lx-vehicle lx-lane-${v.lane} lx-v-${v.kind}`} style={{ ['--dur' as string]: `${v.dur}s`, ['--delay' as string]: `${v.delay}s`, ['--park' as string]: `${v.park}%` }}>
          <Vehicle kind={v.kind} paint={v.paint} />
        </span>
      ))}
    </div>
  );
}

/** A block of storefronts on one road: the /local hero, and "next door" on a place page. */
export function Street({ places, night, label }: { places: Business[]; night: boolean; label: string }) {
  const block = useRef<HTMLUListElement>(null);
  const [at, setAt] = useState(0);
  const [swiped, setSwiped] = useState(false);

  // Phones swipe along the street; the counter says which shop is in front of you.
  const onScroll = () => {
    const el = block.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width : el.clientWidth;
    setAt(Math.min(places.length - 1, Math.round(el.scrollLeft / Math.max(1, step))));
    if (el.scrollLeft > step / 2) setSwiped(true);
  };

  return (
    <div className="lx-street" data-swiped={swiped || undefined}>
      <ul className="lx-block" aria-label={label} ref={block} onScroll={onScroll}>
        {places.map((p, i) => {
          const up = UPPER[i % UPPER.length];
          return (
            <li key={p.id} style={{ ['--i' as string]: i }}>
              <Link to={entityPath(p)} className="lx-shop">
                <Upper floors={up.floors} wall={up.wall} seed={i + 1} night={night} />
                <span className="lx-shop-front">
                  <ShopArt id={p.id} title={p.title} tags={p.tags} categories={p.categories} />
                  {p.partner ? <span className="lx-shop-flag lx-shop-flag-partner">Featured partner</span> : p.editorialSelection ? <span className="lx-shop-flag">Our pick</span> : null}
                </span>
                <span className="lx-shop-sign"><b>{shortName(p.title)}</b><small>{p.neighbourhood}</small></span>
              </Link>
              {i % 2 === 1 && i < places.length - 1 ? <Lamp /> : null}
            </li>
          );
        })}
      </ul>
      <div className="lx-road" aria-hidden="true">
        <Traffic />
      </div>
      {places.length > 1 ? (
        <p className="lx-swipe" aria-hidden="true">
          <span className="lx-swipe-hint">Swipe the street</span>
          <span className="lx-swipe-count">{String(at + 1).padStart(2, '0')} / {String(places.length).padStart(2, '0')}</span>
        </p>
      ) : null}
    </div>
  );
}
