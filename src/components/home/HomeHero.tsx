import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { GlobalSearch } from '../site/GlobalSearch';
import type { AgendaDay } from '../../lib/discoveryCalendar';
import type { CalgaryWeather } from '../../hooks/useCalgaryWeather';
import { describeSky, type SkyIcon } from '../../lib/weatherCodes';
import { moonPhase, skyPalette, sunPosition } from '../../lib/sky';
import { isWeekend, summarize } from '../../lib/homeClaims';
import { CalgarySky, type SkyVariant } from './CalgarySky';
import { SkyGlyph } from './WeekPlanner';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';

const INTENTS: Array<{ label: string; to: string; live?: boolean }> = [
  { label: 'Tonight', to: '/events/today?time=tonight' },
  { label: 'Date night', to: '/date-night' },
  { label: 'Community Watch', to: '/community', live: true },
  { label: 'This weekend', to: '/events/this-weekend' },
  { label: 'Markets', to: '/markets' },
  { label: 'Neighbourhoods', to: '/neighbourhoods' },
];

const dateline = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
const clock = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });

/** A torn paper edge (the site's collage language) where the page meets the scene.
 * Deterministic, so it never shifts between renders. */
export const TEAR = (() => {
  let seed = 9;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts: string[] = [];
  for (let x = 0; x <= 1440; x += 10 + r() * 22) pts.push(`${x.toFixed(0)},${(14 + r() * 20).toFixed(1)}`);
  return `M0,60L0,24L${pts.join('L')}L1440,22L1440,60Z`;
})();

function variantFor(width: number): SkyVariant {
  return width <= 720 ? 'mobile' : width <= 1024 ? 'tablet' : 'desktop';
}

/** Dev-server-only overrides (?sky=ISO time, ?wx=rain|snow|storm|fog, ?cc=0-100) for
 * reviewing the scene at any hour. import.meta.env.DEV is false in production builds. */
function devOverrides(): { at?: number; wx?: SkyIcon; cc?: number } {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  const at = q.get('sky') ? Date.parse(q.get('sky')!) : NaN;
  return { at: Number.isFinite(at) ? at : undefined, wx: (q.get('wx') as SkyIcon | null) ?? undefined, cc: q.get('cc') ? Number(q.get('cc')) : undefined };
}

/** A little plane tows the CalgaryWatch banner right to left across the sky,
 * above the towers on desktop and just over the skyline on phones. */
function TowBanner() {
  return (
    <div className="h-tow" aria-hidden="true">
      <div className="h-tow-fly">
        <div className="h-tow-bob">
          <svg className="h-tow-plane" viewBox="0 0 112 52" width="112" height="52">
            <ellipse className="h-tow-prop" cx="9" cy="27" rx="2.5" ry="13" />
            <path d="M10,27C10,22 15,19 24,19H70L94,12C97,11 99,13 98,16L92,30C91,33 88,35 84,35H24C15,35 10,32 10,27Z" fill="#fffaf0" stroke="#151515" strokeWidth="2" strokeLinejoin="round" />
            <path d="M84,19L93,4C94,2 97,2 98,4L96,19Z" fill="#e2403a" stroke="#151515" strokeWidth="2" strokeLinejoin="round" />
            <path d="M24,28H86" stroke="#e2403a" strokeWidth="3" />
            <path d="M22,22C24,20 28,19 33,19H40V26H22Z" fill="#9fdcf0" stroke="#151515" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M40,29L62,29L50,48H40Z" fill="#1554d1" stroke="#151515" strokeWidth="2" strokeLinejoin="round" />
            <circle className="h-strobe" cx="47" cy="45" r="2" fill="#ff5a4e" />
          </svg>
          <svg className="h-tow-rope" viewBox="0 0 64 52" width="64" height="52">
            <path d="M0,28C18,30 34,28 46,26M46,26L64,8M46,26L64,46" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <div className="h-banner">
            <img src="/images/brand/calgarywatch-city-spark-v2.webp" width="36" height="36" alt="" />
            <span>CALGARY<b>WATCH</b><i>•</i></span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeHero({ days, weather, onPickDay }: { days: AgendaDay[]; weather: CalgaryWeather; onPickDay: (index: number) => void }) {
  const ref = useRef<HTMLElement>(null);
  const dev = useMemo(devOverrides, []);
  const [now, setNow] = useState(() => dev.at ?? Date.now());
  const [variant, setVariant] = useState<SkyVariant>(() => (typeof window === 'undefined' ? 'desktop' : variantFor(window.innerWidth)));

  useEffect(() => {
    const onResize = () => setVariant(variantFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    const tick = dev.at ? undefined : window.setInterval(() => setNow(Date.now()), 5 * 60 * 1000);
    return () => { window.removeEventListener('resize', onResize); if (tick) clearInterval(tick); };
  }, [dev.at]);

  const current = weather.current;
  const sun = sunPosition(new Date(now));
  const cloudCover = dev.cc ?? current?.cloudCover ?? 0;
  const palette = skyPalette(sun.altitude, cloudCover);
  const sky = current ? describeSky(current.code, current.isDay) : null;
  const precip: SkyIcon | null = dev.wx ?? (sky && (sky.wet || sky.icon === 'fog') ? sky.icon : null);

  // The header floats over this sky, so it borrows the sky's ink.
  useEffect(() => {
    const site = ref.current?.closest('.cw-site');
    site?.setAttribute('data-sky-tone', palette.tone);
    return () => site?.removeAttribute('data-sky-tone');
  }, [palette.tone]);

  const firstWeekend = days.findIndex(d => isWeekend(d.date));

  return (
    <section className="h-hero" data-tone={palette.tone} ref={ref} style={{ background: palette.top }} aria-labelledby="h-hero-title">
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
      <div className="cw-wrap h-hero-inner">
        <p className="h-dateline">
          <span className="h-dateline-live" title={`Live sky: the sun’s real position${current ? ' and current Calgary weather' : ''}`}>
            <span className="h-pulse" aria-hidden="true" />Live sky · {clock.format(new Date(now))}
          </span>
          <span className="h-date-long">{dateline.format(new Date(now))}</span>
          <span className="h-date-short">{shortDate.format(new Date(now))}</span>
          <span className="h-date-city" aria-hidden="true">·</span>
          <span className="h-date-city">Calgary</span>
          {current && sky ? (
            <Link to="/map" className="h-dateline-wx" title="Current conditions: open the live map">
              <SkyGlyph icon={sky.icon} size={15} /> {Math.round(current.temp)}° {sky.label.toLowerCase()}
            </Link>
          ) : null}
        </p>
        <h1 id="h-hero-title">
          <span className="h-h1-line">What’s</span> <span className="h-h1-line">happening</span> <em>in Calgary.</em>
          <span className="h-mark-slot" aria-hidden="true">
            <img className="h-hero-mark" src="/images/brand/calgarywatch-city-spark-v2.webp" width="160" height="160" alt="" />
          </span>
        </h1>
        <p className="h-summary">
          {summarize(days)}{' '}
          {firstWeekend > 0 ? <button type="button" onClick={() => onPickDay(firstWeekend)}>See the weekend</button> : null}
        </p>
        <GlobalSearch />
        <nav className="h-intents" aria-label="Jump to">
          {INTENTS.map(i => <Link key={i.label} to={i.to} className={i.live ? 'h-intent-live' : undefined}>{i.live ? <span className="h-intent-dot" aria-hidden="true" /> : null}{i.label}</Link>)}
        </nav>
      </div>
      <TowBanner />
      <svg className="h-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={TEAR} transform="translate(0 -5)" className="h-tear-shade" />
        <path d={TEAR} className="h-tear-paper" />
      </svg>
    </section>
  );
}
