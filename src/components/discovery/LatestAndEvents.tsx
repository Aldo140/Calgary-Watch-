import { Link } from 'react-router-dom';
import type { DiscoveryEntity, MarketOccurrence } from '../../types/discovery';
import { calgaryDate, entityPath } from '../../lib/discovery';

interface DayItem { date: string; title: string; to: string; venue?: string }

/** Real events + market occurrences over the next 7 days, grouped by Calgary calendar
 * date — the day-by-day "what's on" list, not a fabricated activity feed. Nothing here
 * renders unless there's real confirmed inventory to show. */
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

export function LatestAndEvents({ entities, occurrences }: { entities: DiscoveryEntity[]; occurrences: readonly MarketOccurrence[] }) {
  const byDay = upcomingByDay(entities, occurrences);
  const recent = [...entities].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);
  const dayLabel = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00`));
  if (!recent.length && !byDay.length) return null;
  return (
    <section className="cw-latest" aria-labelledby="cw-latest-heading">
      <div className="cw-latest-main">
        <h2 id="cw-latest-heading">The latest</h2>
        {recent.length ? <ul className="cw-latest-list">{recent.map(e => (
          <li key={e.id}><Link to={entityPath(e)}><span className="cw-eyebrow">{e.kind}</span><strong>{e.title}</strong></Link></li>
        ))}</ul> : <p className="cw-latest-empty">Nothing published yet — check back soon.</p>}
      </div>
      <aside className="cw-latest-events" aria-label="This week in Calgary">
        <h3>This week</h3>
        {byDay.length ? byDay.map(([date, items]) => (
          <div className="cw-latest-day" key={date}>
            <p className="cw-latest-date">{dayLabel(date)}</p>
            <ul>{items.map((item, i) => <li key={i}><Link to={item.to}>{item.title}</Link>{item.venue ? <small> · {item.venue}</small> : null}</li>)}</ul>
          </div>
        )) : <p className="cw-latest-empty">No confirmed dates yet.</p>}
      </aside>
    </section>
  );
}
