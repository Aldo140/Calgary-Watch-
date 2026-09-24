import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { LivePulse } from '../../hooks/useLivePulse';
import type { CalgaryWeather } from '../../hooks/useCalgaryWeather';
import { describeSky } from '../../lib/weatherCodes';
import { AIR_BAND_LABEL, classifyPm25 } from '../../lib/airQuality';
import { INCIDENT_CATEGORIES } from '../../constants';
import { SkyGlyph } from './WeekPlanner';
import { TEAR } from './HomeHero';

const clock = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });

/**
 * The Live product's layer on the homepage: dark and dense on purpose, per the
 * brand split. Every number here is read at view time from its named source;
 * a tile whose source fails disappears instead of showing a stand-in.
 */
export function LiveNow({ weather, pulse }: { weather: CalgaryWeather; pulse: LivePulse }) {
  const { reports, air } = pulse;
  const now = weather.current;
  const sky = now ? describeSky(now.code, now.isDay) : null;
  const airBand = air.pm25 !== undefined ? (classifyPm25(air.pm25)?.band ?? 'good') : null;
  const categories = INCIDENT_CATEGORIES.filter(c => reports.byCategory[c.value]);

  return (
    <section className="h-live" aria-labelledby="h-live-title">
      <svg className="h-live-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={TEAR} className="h-tear-paper" />
      </svg>
      <div className="cw-wrap h-live-grid">
        <div className="h-live-lead">
          <p className="h-live-eyebrow"><span className="h-pulse" aria-hidden="true" /> CalgaryWatch Live</p>
          <h2 id="h-live-title">Right now <span>in Calgary.</span></h2>
          <p>Public reports, road and weather conditions, outages and river levels, all on one map with the source shown.</p>
          <Link className="h-btn h-btn-live" to="/map">Open the live map <ArrowUpRight size={18} /></Link>
        </div>

        <dl className="h-facts" aria-live="polite">
          {now && sky ? (
            <div className="h-fact">
              <dt>Outside</dt>
              <dd><b>{Math.round(now.temp)}°</b><span><SkyGlyph icon={sky.icon} size={18} /> {sky.label}</span></dd>
              <small>Wind {Math.round(now.windKph)} km/h · Open-Meteo</small>
            </div>
          ) : null}

          {air.status === 'ready' && airBand ? (
            <div className="h-fact">
              <dt>Air</dt>
              <dd><b>{air.pm25!.toFixed(0)}</b><span>µg/m³ PM2.5 · {AIR_BAND_LABEL[airBand]}</span></dd>
              <small>Modelled fine particulate, not AQHI · Open-Meteo</small>
            </div>
          ) : air.status === 'loading' ? <div className="h-fact h-fact-loading" aria-hidden="true" /> : null}

          {reports.status === 'ready' ? (
            <div className="h-fact h-fact-reports">
              <dt>Public reports, last 24 hours</dt>
              <dd><b>{reports.total}{reports.capped ? '+' : ''}</b><span>{reports.total ? 'on the live map' : 'Nothing reported'}</span></dd>
              {categories.length ? (
                <ul className="h-cats">
                  {categories.map(c => (
                    <li key={c.value}><i style={{ background: c.color }} aria-hidden="true" />{c.label} <b>{reports.byCategory[c.value]}</b></li>
                  ))}
                </ul>
              ) : null}
              <small>Community and official sources · checked {clock.format(reports.checkedAt!)}</small>
            </div>
          ) : reports.status === 'loading' || reports.status === 'idle' ? <div className="h-fact h-fact-loading h-fact-reports" aria-hidden="true" /> : null}
        </dl>
      </div>
      <svg className="h-live-tear h-live-tear-bottom" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={TEAR} className="h-tear-paper" />
      </svg>
    </section>
  );
}
