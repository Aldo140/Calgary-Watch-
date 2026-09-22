import { Link } from 'react-router-dom';
import type { DiscoveryEntity, MarketOccurrence } from '../../types/discovery';
import { upcomingByDay } from '../../lib/discoveryCalendar';

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
