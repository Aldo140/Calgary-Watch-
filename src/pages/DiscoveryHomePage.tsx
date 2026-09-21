import { filterInventory } from '../lib/discoveryCalendar';
import { Link } from 'react-router-dom';
import { SiteLayout } from '../components/site/SiteLayout';
import { DiscoveryHero } from '../components/discovery/DiscoveryHero';
import { DiscoveryCard, EditorialGrid, EmptyInventory, SectionHeading } from '../components/discovery/DiscoveryCards';
import { LivePreview } from '../components/discovery/LivePreview';
import { WeeklyBrief } from '../components/discovery/WeeklyBrief';
import { discoveryRepository } from '../data/discovery';
import { matchesPeriod } from '../lib/discovery';
import type { EntityKind } from '../types/discovery';

export default function DiscoveryHomePage() {
  const entities = filterInventory(discoveryRepository.list(), discoveryRepository.occurrences());
  const section = (kind: EntityKind, title: string, path: string, label: string, weekend = false) => {
    const items = entities.filter(e => e.kind === kind && (!weekend || e.kind !== 'event' || matchesPeriod(e.start, e.end, 'this-weekend')));
    return <section className="cw-section"><SectionHeading title={title} to={path} />{items.length ? <EditorialGrid>{items.map(e => <DiscoveryCard key={e.id} entity={e} />)}</EditorialGrid> : <EmptyInventory type={label} />}</section>;
  };
  return <SiteLayout><DiscoveryHero /><div className="cw-wrap">
    {section('event', 'Your weekend starts here.', '/events/this-weekend', 'weekend plans', true)}
    {section('market', 'Meet you at the market.', '/markets', 'markets')}
    <section className="cw-section"><SectionHeading title="Find your Calgary." eyebrow="Explore Calgary" /><p className="cw-section-intro">Start with a favourite way to spend the day.</p><nav className="cw-trending" aria-label="Discovery starting points">{[['food', 'Something delicious', '/local/food'], ['places', 'A change of scenery', '/neighbourhoods'], ['plans', 'A plan for the weekend', '/events/this-weekend']].map(([number, title, path]) => <Link key={number} to={path}><h3>{title}</h3><span aria-hidden="true">↗</span></Link>)}</nav></section>
    {section('guide', 'A good place to start.', '/guides', 'guides')}
    <LivePreview />
    {section('business', 'Keep it local.', '/local', 'local places')}
    {section('neighbourhood', 'Every neighbourhood has a story.', '/neighbourhoods', 'neighbourhood guides')}
    <WeeklyBrief />
  </div></SiteLayout>;
}
