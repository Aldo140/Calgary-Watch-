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

/** A block of storefronts on one road: the /local hero, and "next door" on a place page. */
export function Street({ places, night, label }: { places: Business[]; night: boolean; label: string }) {
  return (
    <div className="lx-street">
      <ul className="lx-block" aria-label={label}>
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
            </li>
          );
        })}
      </ul>
      <span className="lx-road" aria-hidden="true" />
    </div>
  );
}
