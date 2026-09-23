import { ArrowUpRight, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { filterInventory } from '../lib/discoveryCalendar';
import { matchesPeriod } from '../lib/discovery';
import { SiteLayout } from '../components/site/SiteLayout';
import { CityHero } from '../components/discovery/CityHero';
import { QuadrantExplorer } from '../components/discovery/QuadrantExplorer';
import { GuidesSpotlight } from '../components/discovery/GuidesSpotlight';
import { DiscoveryCard, EditorialGrid, EmptyInventory, SectionHeading } from '../components/discovery/DiscoveryCards';
import { WeeklyBrief } from '../components/discovery/WeeklyBrief';
import { RecurringNow } from '../components/discovery/RecurringNow';
import { discoveryRepository } from '../data/discovery';
import type { EntityKind } from '../types/discovery';

function LiveInterruption() {
  return (
    <section className="cw-live-interruption" aria-labelledby="cw-live-interruption-heading">
      <div className="cw-wrap cw-live-interruption-inner">
        <div>
          <p className="cw-eyebrow"><Radio size={14} /> CalgaryWatch Live</p>
          <h2 id="cw-live-interruption-heading">Know before you go.</h2>
          <p>See source-attributed community reports, traffic, weather and outages on the live map.</p>
        </div>
        <Link className="cw-button cw-live-interruption-action" to="/map">Open Live Map <ArrowUpRight size={18} /></Link>
      </div>
    </section>
  );
}

export default function DiscoveryHomePage() {
  const entities = filterInventory(discoveryRepository.list(), discoveryRepository.occurrences());
  const section = (kind: EntityKind, title: string, path: string, label: string, weekend = false) => {
    const items = entities.filter(entity => entity.kind === kind && (!weekend || entity.kind !== 'event' || matchesPeriod(entity.start, entity.end, 'this-weekend')));
    const count = kind === 'market' || kind === 'neighbourhood' ? 4 : 2;
    return (
      <section className={`cw-section cw-section-${kind}`}>
        <SectionHeading title={title} to={path} />
        {items.length ? <EditorialGrid>{items.slice(0, count).map(entity => <DiscoveryCard key={entity.id} entity={entity} />)}</EditorialGrid> : <EmptyInventory type={label} kind={kind} />}
      </section>
    );
  };

  return (
    <SiteLayout>
      <CityHero entities={entities} occurrences={discoveryRepository.occurrences()} />
      <main className="cw-wrap cw-home-content">
        {section('event', 'This weekend in Calgary.', '/events/this-weekend', 'weekend plans', true)}
        <RecurringNow entities={entities} occurrences={discoveryRepository.occurrences()} />
        {section('market', 'Markets worth the trip.', '/markets', 'markets')}
      </main>
      <LiveInterruption />
      <main className="cw-wrap cw-home-content">
        <GuidesSpotlight entities={entities} />
        {section('business', 'Keep it local.', '/local', 'local places')}
        {section('neighbourhood', 'Every neighbourhood has a story.', '/neighbourhoods', 'neighbourhood guides')}
        <QuadrantExplorer />
        <WeeklyBrief />
      </main>
    </SiteLayout>
  );
}
