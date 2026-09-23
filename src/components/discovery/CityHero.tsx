import { Link } from 'react-router-dom';
import { ArrowUpRight, Calendar, Compass, MapPin, Sparkles } from 'lucide-react';
import type { DiscoveryEntity, MarketOccurrence } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { upcomingByDay } from '../../lib/discoveryCalendar';
import { GlobalSearch } from '../site/GlobalSearch';

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
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso)).toUpperCase();
}

function nextDate(entity: DiscoveryEntity, occurrences: readonly MarketOccurrence[]) {
  if (entity.kind === 'event') return entity.start;
  if (entity.kind === 'market') {
    const nextOccurrence = occurrences
      .filter(occurrence => occurrence.marketId === entity.id && !occurrence.cancelled)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .find(occurrence => Date.parse(occurrence.end || occurrence.start) >= Date.now());
    if (nextOccurrence) return nextOccurrence.start;
  }
  return entity.updatedAt;
}

function FeatureCard({
  entity,
  size,
  occurrences,
}: {
  entity: DiscoveryEntity;
  size: 'lg' | 'md';
  occurrences: readonly MarketOccurrence[];
}) {
  const place = ('venue' in entity ? entity.venue : undefined) || entity.neighbourhood;
  const fallbackImg = entity.kind === 'market'
    ? '/images/illustration/calgarywatch-start-market-v1.webp'
    : '/images/illustration/calgarywatch-start-weekend-v1.webp';
  const imgSrc = entity.image?.src || fallbackImg;
  const imgAlt = entity.image?.alt || `${entity.title} in Calgary`;

  return (
    <Link className={`cw-cityhero-feature cw-cityhero-feature-${size}`} to={entityPath(entity)}>
      <div className="cw-cityhero-feature-art">
        <span className="cw-feature-washi-tape" aria-hidden="true" />
        <span className="cw-feature-stamp" aria-hidden="true"><Compass size={11} /> YYC ARCHIVE</span>
        <img
          src={imgSrc}
          alt={imgAlt}
          loading={size === 'lg' ? 'eager' : 'lazy'}
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackImg; }}
        />
        <span className="cw-cityhero-feature-tag">{entity.kind === 'market' ? 'Market day' : 'On the calendar'}</span>
        <span className="cw-cityhero-feature-arrow" aria-hidden="true"><ArrowUpRight size={20} /></span>
      </div>
      <div className="cw-cityhero-feature-copy">
        <p className="cw-cityhero-feature-meta">
          <span className="cw-eyebrow">{entity.categories[0] || entity.kind}</span>
          <span>{dateLabel(nextDate(entity, occurrences))}</span>
        </p>
        <h2>{entity.title}</h2>
        <p>{entity.summary}</p>
        {place ? <small className="cw-cityhero-feature-place"><MapPin size={14} />{place}</small> : null}
      </div>
    </Link>
  );
}

export function CityHero({ entities, occurrences }: { entities: DiscoveryEntity[]; occurrences: readonly MarketOccurrence[] }) {
  const now = Date.now();
  const featured = entities
    .filter(entity => entity.kind === 'event' || entity.kind === 'market')
    .sort((a, b) => {
      const aDate = Date.parse(nextDate(a, occurrences));
      const bDate = Date.parse(nextDate(b, occurrences));
      const aIsUpcoming = aDate >= now;
      const bIsUpcoming = bDate >= now;
      if (aIsUpcoming !== bIsUpcoming) return aIsUpcoming ? -1 : 1;
      return aIsUpcoming ? aDate - bDate : bDate - aDate;
    })
    .slice(0, 1);
  const byDay = upcomingByDay(entities, occurrences);
  const dayLabel = (iso: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${iso}T12:00:00`));

  return (
    <section className="cw-cityhero">
      <nav className="cw-cityhero-topics" aria-label="Browse by topic">
        <span className="cw-cityhero-topics-label">Pick your plan</span>
        {TOPICS.map((topic, index) => (
          <Link className={`cw-cityhero-topic-${index % 4}`} key={topic.label} to={topic.to}>{topic.label}</Link>
        ))}
      </nav>

      <div className="cw-wrap cw-cityhero-grid">
        <div className="cw-cityhero-intro">
          <img className="cw-cityhero-brandmark" src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" aria-hidden="true" />
          <p className="cw-cityhero-kicker"><Sparkles size={15} /> Calgary, Alberta <span>City guide + live watch</span></p>
          <h1><span>What's happening</span><em>in Calgary?</em></h1>
          <p className="cw-cityhero-deck">Real events, markets and city updates — sourced and dated, not guessed at.</p>

          <GlobalSearch />
          <div className="cw-cityhero-proof" aria-label="CalgaryWatch coverage">
            <span>Local sources</span><span>Real dates</span><span>Source checked</span>
          </div>

          <Link className="cw-cityhero-inbox-link" to="/map?settings=alerts">A little Calgary in your inbox <ArrowUpRight size={16} /></Link>
        </div>

        <div className="cw-cityhero-main">
          {featured.length ? (
            <div className="cw-cityhero-features">
              <FeatureCard entity={featured[0]} size="lg" occurrences={occurrences} />
            </div>
          ) : <p className="cw-thisweek-empty">Nothing published yet — check back soon.</p>}
        </div>

        <aside className="cw-cityhero-sidebar" aria-label="This week in Calgary">
          <div className="cw-cityhero-sidebar-heading">
            <span className="cw-cityhero-calendar" aria-hidden="true">
              <Calendar size={15} />
              <b>{new Date().getDate()}</b>
            </span>
            <h2>This week</h2>
            <Link className="cw-text-link" to="/events">See all <ArrowUpRight size={13} /></Link>
          </div>
          {byDay.length ? byDay.slice(0, 3).map(([date, items]) => (
            <div className="cw-cityhero-day-card" key={date}>
              <div className="cw-day-card-header">
                <span className="cw-day-dot" aria-hidden="true" />
                <p className="cw-thisweek-date">{dayLabel(date)}</p>
              </div>
              <ul className="cw-day-event-list">
                {items.slice(0, 2).map((item, index) => (
                  <li key={index} className="cw-day-event-item">
                    <Link to={item.to} className="cw-day-event-link">
                      <strong>{item.title}</strong>
                      {item.venue ? <small><MapPin size={11} /> {item.venue}</small> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )) : <p className="cw-thisweek-empty">No confirmed dates yet.</p>}
          <Link className="cw-text-link cw-cityhero-livelink" to="/map">Open Live Map <ArrowUpRight size={15} /></Link>
        </aside>
      </div>
    </section>
  );
}
