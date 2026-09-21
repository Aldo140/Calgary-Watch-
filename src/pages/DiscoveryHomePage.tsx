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
  const entities = [...discoveryRepository.list()];
  const section = (kind: EntityKind, title: string, path: string, label: string, weekend = false) => {
    const items = entities.filter(e => e.kind === kind && (!weekend || e.kind !== 'event' || matchesPeriod(e.start, e.end, 'this-weekend')));
    return <section className="cw-section"><SectionHeading title={title} to={path} />{items.length ? <EditorialGrid>{items.map(e => <DiscoveryCard key={e.id} entity={e} />)}</EditorialGrid> : <EmptyInventory type={label} />}</section>;
  };
  return <SiteLayout><DiscoveryHero /><div className="cw-wrap">
    {import.meta.env.DEV && <p className="cw-preview-note">Design preview: sample listings below are illustrative and are not published in production.</p>}
    {section('event', 'Your weekend starts here.', '/events/this-weekend', 'weekend plans', true)}
    {section('market', 'Meet you at the market.', '/markets', 'markets')}
    <section className="cw-section"><SectionHeading title="Find your Calgary." eyebrow="Trending in Calgary" /><p className="cw-section-intro">Start with a favourite way to spend the day. Trending rankings will appear when there’s enough activity.</p><nav className="cw-trending" aria-label="Discovery starting points">{[['01', 'Something delicious', '/local/food'], ['02', 'A change of scenery', '/neighbourhoods'], ['03', 'A plan for the weekend', '/events/this-weekend']].map(([number, title, path]) => <Link key={number} to={path}><span>{number}</span><h3>{title}</h3><span aria-hidden="true">↗</span></Link>)}</nav></section>
    {section('guide', 'A good place to start.', '/guides', 'guides')}
    <LivePreview />
    {section('business', 'Keep it local.', '/local', 'local places')}
    {section('neighbourhood', 'Every neighbourhood has a story.', '/neighbourhoods', 'neighbourhood guides')}
    <WeeklyBrief />
  </div></SiteLayout>;
}
