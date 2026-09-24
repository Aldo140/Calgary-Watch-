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

const INTENTS = [
  { label: 'Tonight', to: '/events/today?time=tonight' },
  { label: 'This weekend', to: '/events/this-weekend' },
  { label: 'Markets', to: '/markets' },
  { label: 'Neighbourhoods', to: '/neighbourhoods' },
];

const dateline = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
const clock = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });

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
          <span className="h-h1-top">What’s<span className="h-mark-slot" aria-hidden="true">
            <img className="h-hero-mark" src="/images/brand/calgarywatch-city-spark-v2.webp" width="72" height="72" alt="" />
            <svg className="h-mark-sparks" viewBox="0 0 100 100" focusable="false">
              <path className="h-spark h-spark-a" d="M12,18Q14,24 20,26Q14,28 12,34Q10,28 4,26Q10,24 12,18Z" />
              <path className="h-spark h-spark-b" d="M90,70Q91.5,74.5 96,76Q91.5,77.5 90,82Q88.5,77.5 84,76Q88.5,74.5 90,70Z" />
              <circle className="h-spark h-spark-c" cx="84" cy="12" r="2.4" />
            </svg>
          </span></span> happening <em>in Calgary.</em>
        </h1>
        <p className="h-summary">
          {summarize(days)}{' '}
          {firstWeekend > 0 ? <button type="button" onClick={() => onPickDay(firstWeekend)}>See the weekend</button> : null}
        </p>
        <GlobalSearch />
        <nav className="h-intents" aria-label="Jump to">
          {INTENTS.map(i => <Link key={i.label} to={i.to}>{i.label}</Link>)}
        </nav>
      </div>
      <svg className="h-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={TEAR} transform="translate(0 -5)" className="h-tear-shade" />
        <path d={TEAR} className="h-tear-paper" />
      </svg>
      <p className="h-sky-caption">
        <span className="h-pulse" aria-hidden="true" />
        Live sky: <span className="h-cap-long">the sun’s real position{current ? ' and current Calgary weather' : ''}</span><span className="h-cap-short">real sun{current ? ' & weather' : ''}</span> · {clock.format(new Date(now))}
      </p>
    </section>
  );
}
