import { Link } from 'react-router-dom';
import type { DiscoveryEntity, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { upcomingByDay } from '../../lib/discoveryCalendar';
import { GlobalSearch } from '../site/GlobalSearch';

/** Calgary-specific topics in place of City Cast's editorial verticals — each links to
 * a real route, not an invented content category. */
const TOPICS = [
  { label: 'This Weekend', to: '/events/this-weekend' },
  { label: "Calgary's Best", to: '/guides' },
  { label: 'Markets', to: '/markets' },
  { label: 'Food & Drink', to: '/local/food' },
  { label: 'Neighbourhood Guides', to: '/neighbourhoods' },
  { label: 'Date Night', to: '/search?q=date+night' },
  { label: 'Live Updates', to: '/map' },
  { label: 'Community', to: '/community' },
];

function dateLabel(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'long', day: 'numeric' }).format(new Date(iso)).toUpperCase();
}

function FeatureCard({ entity, size }: { entity: DiscoveryEntity; size: 'lg' | 'md' }) {
  return (
    <Link className={`cw-cityhero-feature cw-cityhero-feature-${size}`} to={entityPath(entity)}>
      {entity.image ? <img src={entity.image.src} alt={entity.image.alt} loading={size === 'lg' ? 'eager' : 'lazy'} /> : <span className="cw-cityhero-feature-noimage" aria-hidden="true" />}
      <div className="cw-cityhero-feature-copy">
        <p className="cw-cityhero-feature-meta"><span className="cw-eyebrow">{entity.categories[0] || entity.kind}</span><span>{dateLabel(entity.updatedAt)}</span></p>
        <h2>{entity.title}</h2>
        <p>{entity.summary}</p>
      </div>
    </Link>
  );
}

/** City Cast Chicago's layout — topic pills, a featured article, a Latest/Events
 * sidebar — as CalgaryWatch's homepage entry point. No podcast player (CalgaryWatch
 * doesn't have one) and no generic mixed-kind "Latest" list (dropped per feedback:
 * it read as noise next to real, dated event/market data). */
export function CityHero({ entities, occurrences }: { entities: DiscoveryEntity[]; occurrences: readonly MarketOccurrence[] }) {
  const featured = [...entities].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 2);
  const byDay = upcomingByDay(entities, occurrences);
  const dayLabel = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00`));
  return (
    <section className="cw-cityhero">
      <nav className="cw-cityhero-topics" aria-label="Browse by topic">
        {TOPICS.map(t => <Link key={t.label} to={t.to}>{t.label}</Link>)}
      </nav>
      <div className="cw-wrap cw-cityhero-grid">
        <div className="cw-cityhero-main">
          <h1>What's happening in Calgary?</h1>
          <GlobalSearch />
          {featured.length ? <div className="cw-cityhero-features">
            {featured[0] && <FeatureCard entity={featured[0]} size="lg" />}
            {featured[1] && <FeatureCard entity={featured[1]} size="md" />}
          </div> : <p className="cw-thisweek-empty">Nothing published yet — check back soon.</p>}
        </div>
        <aside className="cw-cityhero-sidebar" aria-label="This week in Calgary">
          <h2>This week</h2>
          {byDay.length ? byDay.map(([date, items]) => (
            <div className="cw-cityhero-day" key={date}>
              <p className="cw-thisweek-date">{dayLabel(date)}</p>
              <ul>{items.map((item, i) => <li key={i}><Link to={item.to}>{item.title}</Link>{item.venue ? <small> · {item.venue}</small> : null}</li>)}</ul>
            </div>
          )) : <p className="cw-thisweek-empty">No confirmed dates yet.</p>}
          <Link className="cw-text-link" to="/map">Open Live Map ↗</Link>
        </aside>
      </div>
    </section>
  );
}
