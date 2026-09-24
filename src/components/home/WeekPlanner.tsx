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
const longWeekday = fmt({ weekday: 'long' });
const monthDay = fmt({ month: 'long', day: 'numeric' });
const clock = fmt({ hour: 'numeric', minute: '2-digit' });

function timeLabel(item: AgendaItem, date: string) {
  const startsToday = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.start)) === date;
  return startsToday ? clock.format(new Date(item.start)) : 'Continues';
}

/** "9:00 a.m." → ["9:00", "a.m."]; "Continues" stays whole. */
function splitTime(label: string): [string, string] {
  const at = label.indexOf(' ');
  return at > 0 && /\d/.test(label[0]) ? [label.slice(0, at), label.slice(at + 1)] : [label, ''];
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

  // The line through the stations is the real forecast: warmest day sits highest.
  const highs = days.map(d => forecast[d.date]?.max);
  const known = highs.filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  const top = Math.max(...known);
  const bottom = Math.min(...known);
  const yOf = (t?: number) => (t === undefined || known.length < 2 || top === bottom ? 50 : 32 + (1 - (t - bottom) / (top - bottom)) * 54);
  const ys = highs.map(t => yOf(t).toFixed(1));
  const line = `0,${ys[0]} ${ys.map((y, i) => `${i * 100 + 50},${y}`).join(' ')} ${days.length * 100},${ys[ys.length - 1]}`;

  return (
    <div className="h-week" id="week">
      <div className="h-week-head">
        <h2>The next <span>seven days.</span></h2>
        <p className="h-week-legend">
          {known.length > 1 ? <span><i className="h-legend-line" aria-hidden="true" />Line height is the daytime high</span> : null}
          <span><i className="h-dot-market" aria-hidden="true" />Market</span>
          <span><i className="h-dot-event" aria-hidden="true" />Event</span>
        </p>
      </div>

      <div className="h-days" role="tablist" aria-label="Choose a day" onKeyDown={onKey}>
        <svg className="h-line" viewBox={`0 0 ${days.length * 100} 100`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="h-line-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#00c2e0" stopOpacity=".3" />
              <stop offset="1" stopColor="#00c2e0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,100 ${line} ${days.length * 100},100`} fill="url(#h-line-fill)" />
          <polyline points={line} className="h-line-path" />
        </svg>
        {days.map((d, i) => {
          const df = forecast[d.date];
          const sky = df ? describeSky(df.code) : null;
          const markets = d.items.filter(x => x.kind === 'market').length;
          const events = d.items.length - markets;
          const shownMarkets = Math.min(markets, 4);
          const shownEvents = Math.min(events, 4 - shownMarkets);
          const name = i === 0 ? 'Today' : weekday.format(noon(d.date));
          return (
            <button
              key={d.date}
              ref={el => { tabs.current[i] = el; }}
              role="tab"
              id={`h-day-${i}`}
              aria-selected={i === selected}
              aria-controls="h-day-panel"
              aria-label={`${name} ${Number(d.date.slice(8))}: ${d.items.length} listed${df ? `, high ${Math.round(df.max)}°` : ''}`}
              tabIndex={i === selected ? 0 : -1}
              style={{ gridColumn: i + 1 }}
              className={`h-day${isWeekend(d.date) ? ' h-day-weekend' : ''}${d.items.length ? '' : ' h-day-quiet'}`}
              onClick={() => { onSelect(i); setShowAll(false); }}
            >
              <span className="h-day-name">{name}</span>
              <span className="h-day-num">{Number(d.date.slice(8))}</span>
              <span className="h-day-track">
                <span className="h-station" style={{ top: `${ys[i]}%` }}>
                  {df && sky ? <span className="h-station-temp"><SkyGlyph icon={sky.icon} size={13} />{Math.round(df.max)}°</span> : null}
                </span>
              </span>
              <span className="h-day-count">
                {Array.from({ length: shownMarkets }, (_, k) => <i key={`m${k}`} className="h-dot-market" />)}
                {Array.from({ length: shownEvents }, (_, k) => <i key={`e${k}`} className="h-dot-event" />)}
                {d.items.length > 4 ? <b>+{d.items.length - 4}</b> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="h-day-panel" role="tabpanel" id="h-day-panel" aria-labelledby={`h-day-${selected}`}>
        <div className="h-day-panel-head">
          <h3><span>{selected === 0 ? 'Today' : longWeekday.format(noon(day.date))}</span> {monthDay.format(noon(day.date))}</h3>
          {f ? (
            <p className={`h-day-forecast${wet ? ' h-day-forecast-wet' : ''}`}>
              <SkyGlyph icon={describeSky(f.code).icon} size={17} />
              <span>{describeSky(f.code).label} · <b>{Math.round(f.max)}°</b> / {Math.round(f.min)}°{f.precipChance !== null ? ` · ${f.precipChance}% chance of precipitation` : ''}</span>
              {wet ? <strong><Umbrella size={14} aria-hidden="true" /> Indoor plans are marked</strong> : null}
            </p>
          ) : null}
        </div>

        {day.items.length ? (
          <ol className="h-agenda">
            {visible.map(item => {
              const [time, meridiem] = splitTime(timeLabel(item, day.date));
              const place = item.place && !item.title.toLowerCase().includes(item.place.toLowerCase()) ? item.place : '';
              return (
                <li key={item.key} className={`h-agenda-${item.kind}`}>
                  <Link to={item.to} className="h-agenda-row">
                    <time dateTime={item.start}><b>{time}</b>{meridiem ? <small>{meridiem}</small> : null}</time>
                    <span className="h-agenda-stop" aria-hidden="true" />
                    <span className="h-agenda-main">
                      <span className="h-kind">{item.kind === 'market' ? 'Market' : 'Event'}</span>
                      <strong>{item.title}</strong>
                      {place ? <small>{place}</small> : null}
                    </span>
                    <span className="h-agenda-tags">
                      {item.free ? <span className="h-tag">Free</span> : null}
                      {wet && item.indoor ? <span className="h-tag h-tag-indoor">Indoor</span> : null}
                      {wet && item.outdoor ? <span className="h-tag h-tag-outdoor">Outdoors</span> : null}
                    </span>
                    <span className="h-agenda-go" aria-hidden="true"><ArrowUpRight size={18} /></span>
                  </Link>
                </li>
              );
            })}
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
          <Link to="/events" className="h-pill">All events <ArrowUpRight size={16} /></Link>
          <Link to="/markets" className="h-pill">All markets <ArrowUpRight size={16} /></Link>
        </p>
      </div>
    </div>
  );
}
