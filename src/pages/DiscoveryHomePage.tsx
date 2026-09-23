import { Link } from 'react-router-dom';
import { SiteLayout } from '../components/site/SiteLayout';
import { CityHero } from '../components/discovery/CityHero';
import { ModesSplit } from '../components/discovery/ModesSplit';
import { QuadrantExplorer } from '../components/discovery/QuadrantExplorer';
import { GuidesSpotlight } from '../components/discovery/GuidesSpotlight';
import { DiscoveryCard, EditorialGrid, EmptyInventory, SectionHeading } from '../components/discovery/DiscoveryCards';
import { WeeklyBrief } from '../components/discovery/WeeklyBrief';
import { LivePreview } from '../components/discovery/LivePreview';
import { discoveryRepository } from '../data/discovery';
import { filterInventory } from '../lib/discoveryCalendar';
import { matchesPeriod } from '../lib/discovery';
import type { EntityKind } from '../types/discovery';

export default function DiscoveryHomePage() {
  const occurrences = discoveryRepository.occurrences();
  const entities = filterInventory(discoveryRepository.list(), occurrences);

  const section = (kind: EntityKind, title: string, path: string, label: string, weekend = false) => {
    const items = entities.filter(entity => (
      entity.kind === kind
      && (!weekend || entity.kind !== 'event' || matchesPeriod(entity.start, entity.end, 'this-weekend'))
    ));
    const limit = kind === 'market' || kind === 'neighbourhood' ? 4 : 2;
    return (
      <section className={`cw-section cw-section-${kind}`}>
        <SectionHeading title={title} to={path} />
        {items.length
          ? <EditorialGrid>{items.slice(0, limit).map(entity => <DiscoveryCard key={entity.id} entity={entity} />)}</EditorialGrid>
          : <EmptyInventory type={label} kind={kind} />}
      </section>
    );
  };

  return (
    <SiteLayout>
      <CityHero entities={entities} occurrences={occurrences} />
      <div className="cw-wrap cw-home-content">
        <section className="cw-start-panel" aria-labelledby="cw-start-heading">
          <div className="cw-start-copy">
            <p className="cw-eyebrow">Start somewhere good</p>
            <h2 id="cw-start-heading">Make a day of it.</h2>
            <p>Pick a direction and let Calgary fill in the rest.</p>
          </div>
          <nav className="cw-start-links" aria-label="Start exploring Calgary">
            <Link to="/events/this-weekend">
              <img src="/images/illustration/calgarywatch-start-weekend-v1.webp" alt="" aria-hidden="true" loading="lazy" />
              <span>Weekend</span><strong>Make weekend plans</strong>
              <small>Events and things worth leaving home for</small><b aria-hidden="true">↗</b>
            </Link>
            <Link to="/events/today?time=tonight">
              <img src="/images/illustration/calgarywatch-start-weekend-v1.webp" alt="" aria-hidden="true" loading="lazy" />
              <span>Tonight</span><strong>See what is on tonight</strong>
              <small>Current listings that have not already ended</small><b aria-hidden="true">↗</b>
            </Link>
            <Link to="/markets">
              <img src="/images/illustration/calgarywatch-start-market-v1.webp" alt="" aria-hidden="true" loading="lazy" />
              <span>Markets</span><strong>Find a market</strong>
              <small>Verified schedules from Calgary market organizers</small><b aria-hidden="true">↗</b>
            </Link>
          </nav>
        </section>

        {section('event', 'Your weekend starts here.', '/events/this-weekend', 'weekend plans', true)}
        {section('market', 'Meet you at the market.', '/markets', 'markets')}
        <LivePreview />
        {section('business', 'Keep it local.', '/local', 'local places')}

        <section className="cw-city-index" aria-labelledby="cw-city-index-heading">
          <div className="cw-city-index-lead">
            <p className="cw-eyebrow">Explore by intent</p>
            <h2 id="cw-city-index-heading">Follow the feeling.</h2>
            <p>Find food, take the long way through a neighbourhood, or make a plan for the weekend.</p>
          </div>
          <nav className="cw-city-index-links" aria-label="Explore Calgary by intent">
            <Link to="/local/food">
              <img src="/images/illustration/calgarywatch-start-market-v1.webp" alt="" aria-hidden="true" loading="lazy" />
              <span>Food</span><strong>Something delicious</strong>
              <small>Browse sourced local places and food guides.</small><b aria-hidden="true">↗</b>
            </Link>
            <Link to="/neighbourhoods">
              <img src="/images/hero/calgarywatch-city-guide-v1.webp" alt="" aria-hidden="true" loading="lazy" />
              <span>Neighbourhoods</span><strong>A change of scenery</strong>
              <small>Get to know Calgary one neighbourhood at a time.</small><b aria-hidden="true">↗</b>
            </Link>
            <Link to="/search?q=date+night">
              <img src="/images/illustration/calgarywatch-start-weekend-v1.webp" alt="" aria-hidden="true" loading="lazy" />
              <span>Date night</span><strong>A plan worth keeping</strong>
              <small>Search current events, guides and local places.</small><b aria-hidden="true">↗</b>
            </Link>
          </nav>
        </section>

        <GuidesSpotlight entities={entities} />
        <QuadrantExplorer />
        {section('neighbourhood', 'Every neighbourhood has a story.', '/neighbourhoods', 'neighbourhood guides')}
        <ModesSplit />
        <WeeklyBrief />
      </div>
    </SiteLayout>
  );
}
