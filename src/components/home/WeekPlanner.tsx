import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Sun, Umbrella } from 'lucide-react';
import type { AgendaDay, AgendaItem } from '../../lib/discoveryCalendar';
import type { DailyForecast } from '../../hooks/useCalgaryWeather';
import { describeSky, type SkyIcon } from '../../lib/weatherCodes';
import { isWeekend } from '../../lib/homeClaims';

const ICONS: Record<SkyIcon, typeof Sun> = { sun: Sun, moon: Moon, partly: CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };
export function SkyGlyph({ icon, size = 16 }: { icon: SkyIcon; size?: number }) {
  const Icon = ICONS[icon];
  return <Icon size={size} aria-hidden="true" />;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...opts });
const noon = (date: string) => new Date(`${date}T18:00:00Z`); // midday in Calgary year-round
const weekday = fmt({ weekday: 'short' });
const longDay = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const clock = fmt({ hour: 'numeric', minute: '2-digit' });

function timeLabel(item: AgendaItem, date: string) {
  const startsToday = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.start)) === date;
  return startsToday ? clock.format(new Date(item.start)) : 'Continues';
}

/** Rain matters to a plan only when it's both likely and forecast as actual precipitation. */
function wetDay(f?: DailyForecast) {
  return !!f && describeSky(f.code).wet && (f.precipChance ?? 0) >= 50;
}

export function WeekPlanner({ days, forecast, selected, onSelect }: {
  days: AgendaDay[];
  forecast: Record<string, DailyForecast>;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const day = days[selected];
  const f = forecast[day.date];
  const wet = wetDay(f);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? day.items : day.items.slice(0, 5);

  const onKey = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, Home: -selected, End: days.length - 1 - selected };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = Math.min(days.length - 1, Math.max(0, selected + moves[event.key]));
    onSelect(next); setShowAll(false);
    tabs.current[next]?.focus();
  };

  return (
    <div className="h-week" id="week">
      <div className="h-week-head">
        <h2>The next seven days</h2>
        <p>Events and markets, checked against organizers’ own listings{Object.keys(forecast).length ? ' · Forecast via Open-Meteo' : ''}</p>
      </div>

      <div className="h-days" role="tablist" aria-label="Choose a day" onKeyDown={onKey}>
        {days.map((d, i) => {
          const df = forecast[d.date];
          const sky = df ? describeSky(df.code) : null;
          return (
            <button
              key={d.date}
              ref={el => { tabs.current[i] = el; }}
              role="tab"
              id={`h-day-${i}`}
              aria-selected={i === selected}
              aria-controls="h-day-panel"
              tabIndex={i === selected ? 0 : -1}
              className={`h-day${isWeekend(d.date) ? ' h-day-weekend' : ''}${d.items.length ? '' : ' h-day-quiet'}`}
              onClick={() => { onSelect(i); setShowAll(false); }}
            >
              <span className="h-day-name">{i === 0 ? 'Today' : weekday.format(noon(d.date))}</span>
              <span className="h-day-num">{Number(d.date.slice(8))}</span>
              {df && sky ? (
                <span className="h-day-wx" title={sky.label}>
                  <SkyGlyph icon={sky.icon} size={15} />
                  <span>{Math.round(df.max)}°</span>
                  <small>{Math.round(df.min)}°</small>
                </span>
              ) : <span className="h-day-wx h-day-wx-empty" aria-hidden="true" />}
              <span className="h-day-count" aria-label={`${d.items.length} listed`}>
                {d.items.length ? Array.from({ length: Math.min(d.items.length, 4) }, (_, k) => <i key={k} />) : null}
                {d.items.length > 4 ? <b>+{d.items.length - 4}</b> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="h-day-panel" role="tabpanel" id="h-day-panel" aria-labelledby={`h-day-${selected}`}>
        <div className="h-day-panel-head">
          <h3>{selected === 0 ? 'Today, ' : ''}{longDay.format(noon(day.date))}</h3>
          {f ? (
            <p className={`h-day-forecast${wet ? ' h-day-forecast-wet' : ''}`}>
              <SkyGlyph icon={describeSky(f.code).icon} size={17} />
              {describeSky(f.code).label}, {Math.round(f.max)}° / {Math.round(f.min)}°
              {f.precipChance !== null ? ` · ${f.precipChance}% chance of precipitation` : ''}
              {wet ? <strong><Umbrella size={14} aria-hidden="true" /> Indoor plans are marked</strong> : null}
            </p>
          ) : null}
        </div>

        {day.items.length ? (
          <ol className="h-agenda">
            {visible.map(item => (
              <li key={item.key}>
                <Link to={item.to} className="h-agenda-row">
                  <time dateTime={item.start}>{timeLabel(item, day.date)}</time>
                  <span className="h-agenda-main">
                    <span className={`h-kind h-kind-${item.kind}`}>{item.kind === 'market' ? 'Market' : 'Event'}</span>
                    <strong>{item.title}</strong>
                    {item.place && !item.title.toLowerCase().includes(item.place.toLowerCase()) ? <small>{item.place}</small> : null}
                  </span>
                  <span className="h-agenda-tags">
                    {item.free ? <span className="h-tag">Free</span> : null}
                    {wet && item.indoor ? <span className="h-tag h-tag-indoor">Indoor</span> : null}
                    {wet && item.outdoor ? <span className="h-tag h-tag-outdoor">Outdoors</span> : null}
                  </span>
                  <ArrowUpRight className="h-agenda-arrow" size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="h-quiet">
            <p><strong>Nothing on our calendar yet.</strong> We only list what an organizer has published, so a quiet day really is quiet here.</p>
            <p className="h-quiet-links">
              <Link to="/guides">Try a self-guided day <ArrowUpRight size={15} /></Link>
              <Link to="/submit">Know about something? Add it <ArrowUpRight size={15} /></Link>
            </p>
          </div>
        )}

        {day.items.length > 5 && !showAll ? (
          <button className="h-more" type="button" onClick={() => setShowAll(true)}>Show {day.items.length - 5} more</button>
        ) : null}

        <p className="h-day-panel-foot">
          <Link to="/events">All events <ArrowUpRight size={15} /></Link>
          <Link to="/markets">All markets <ArrowUpRight size={15} /></Link>
        </p>
      </div>
    </div>
  );
}
