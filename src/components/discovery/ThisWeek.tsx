import { Link } from 'react-router-dom';
import type { DiscoveryEntity, MarketOccurrence } from '../../types/discovery';
import { calgaryDate, entityPath } from '../../lib/discovery';

interface DayItem { date: string; title: string; to: string; venue?: string }

/** Real events + market occurrences over the next 7 days, grouped by Calgary calendar
 * date — the day-by-day "what's on" list, not a fabricated activity feed. Renders
 * nothing unless there's real confirmed inventory to show. */
function upcomingByDay(entities: DiscoveryEntity[], occurrences: readonly MarketOccurrence[], days = 7): [string, DayItem[]][] {
  const now = new Date();
  const cutoff = calgaryDate(new Date(now.getTime() + days * 86400000));
  const items: DayItem[] = [];
  for (const e of entities) {
    if (e.kind === 'event' && !e.cancelled && Date.parse(e.end) > now.getTime()) {
      items.push({ date: calgaryDate(new Date(e.start)), title: e.title, to: entityPath(e), venue: e.venue || e.neighbourhood });
    }
    if (e.kind === 'market') {
      for (const o of occurrences.filter(o => o.marketId === e.id && !o.cancelled && Date.parse(o.end) > now.getTime())) {
        items.push({ date: calgaryDate(new Date(o.start)), title: e.title, to: entityPath(e), venue: e.venue || e.neighbourhood });
      }
    }
  }
  const grouped = new Map<string, DayItem[]>();
  for (const item of items.filter(i => i.date <= cutoff)) (grouped.get(item.date) ?? grouped.set(item.date, []).get(item.date)!).push(item);
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 5);
}

export function ThisWeek({ entities, occurrences }: { entities: DiscoveryEntity[]; occurrences: readonly MarketOccurrence[] }) {
  const byDay = upcomingByDay(entities, occurrences);
  const dayLabel = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00`));
  if (!byDay.length) return null;
  return (
    <section className="cw-thisweek" aria-labelledby="cw-thisweek-heading">
      <h2 id="cw-thisweek-heading">This week in Calgary</h2>
      <div className="cw-thisweek-grid">
        {byDay.map(([date, items]) => (
          <div className="cw-thisweek-day" key={date}>
            <p className="cw-thisweek-date">{dayLabel(date)}</p>
            <ul>{items.map((item, i) => <li key={i}><Link to={item.to}>{item.title}</Link>{item.venue ? <small> · {item.venue}</small> : null}</li>)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}
