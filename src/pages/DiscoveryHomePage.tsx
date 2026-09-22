import { filterInventory } from '../lib/discoveryCalendar';
import { Link } from 'react-router-dom';
import { SiteLayout } from '../components/site/SiteLayout';
import { DiscoveryHero } from '../components/discovery/DiscoveryHero';
import { ModesSplit } from '../components/discovery/ModesSplit';
import { QuadrantExplorer } from '../components/discovery/QuadrantExplorer';
import { Marquee } from '../components/discovery/Marquee';
import { StatsBar } from '../components/discovery/StatsBar';
import { AuthorityBand } from '../components/discovery/AuthorityBand';
import { LatestAndEvents } from '../components/discovery/LatestAndEvents';
import { GuidesSpotlight } from '../components/discovery/GuidesSpotlight';
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
    return <section className={`cw-section cw-section-${kind}`}><SectionHeading title={title} to={path} />{items.length ? <EditorialGrid>{items.map(e => <DiscoveryCard key={e.id} entity={e} />)}</EditorialGrid> : <EmptyInventory type={label} kind={kind} />}</section>;
  };
  const topTicker = ["WHAT'S HAPPENING", '🎉', 'THIS WEEKEND', '📅', 'IN YOUR NEIGHBOURHOOD', '📍', 'RIGHT NOW', '⚡'];
  const liveTicker = ['SEE IT', '👀', 'SHARE IT', '📣', 'CALGARY KNOWS', '🧠'];
  return <SiteLayout><DiscoveryHero /><ModesSplit /><Marquee items={topTicker} /><AuthorityBand /><StatsBar /><div className="cw-wrap cw-home-content">
    <LatestAndEvents entities={entities} occurrences={discoveryRepository.occurrences()} />
    <section className="cw-start-panel" aria-labelledby="cw-start-heading">
      <div className="cw-start-copy"><p className="cw-eyebrow">Start somewhere good</p><h2 id="cw-start-heading">Make a day of it.</h2><p>Pick a direction and let Calgary fill in the rest.</p></div>
      <nav className="cw-start-links" aria-label="Start exploring Calgary">
        <Link to="/events/this-weekend"><img src="/images/photo/calgary8.webp" alt="" aria-hidden="true" loading="lazy" /><span>WEEKEND</span><strong>Make weekend plans</strong><small>Events, shows and things worth leaving home for</small><b aria-hidden="true">↗</b></Link>
        <Link to="/markets"><img src="/images/photo/calgary4.webp" alt="" aria-hidden="true" loading="lazy" /><span>LOCAL</span><strong>Find a market</strong><small>Local makers, food and a slower Saturday</small><b aria-hidden="true">↗</b></Link>
        <Link to="/map"><img src="/images/quadrant/quadrant-sw-collage.webp" alt="" aria-hidden="true" loading="lazy" /><span>LIVE</span><strong>See Calgary live</strong><small>Reports, traffic, weather and outages nearby</small><b aria-hidden="true">↗</b></Link>
      </nav>
    </section>
    {section('event', 'Your weekend starts here.', '/events/this-weekend', 'weekend plans', true)}
    {section('market', 'Meet you at the market.', '/markets', 'markets')}
    <section className="cw-city-index" aria-labelledby="cw-city-index-heading"><div className="cw-city-index-lead"><p className="cw-eyebrow">The city index</p><h2 id="cw-city-index-heading">Follow the feeling.</h2><p>Some days call for a table, some for a long walk, some for knowing what changed while you were away.</p></div><nav className="cw-city-index-links" aria-label="Explore by mood"><Link to="/local/food"><img src="/images/photo/calgary2.webp" alt="" aria-hidden="true" loading="lazy" /><span>TASTE</span><strong>Something delicious</strong><small>Good food, good rooms, no grand occasion required.</small><b aria-hidden="true">↗</b></Link><Link to="/neighbourhoods"><img src="/images/photo/calgary1.webp" alt="" aria-hidden="true" loading="lazy" /><span>WANDER</span><strong>A change of scenery</strong><small>Take the long way through a neighbourhood with its own rhythm.</small><b aria-hidden="true">↗</b></Link><Link to="/events/this-weekend"><img src="/images/photo/calgary3.webp" alt="" aria-hidden="true" loading="lazy" /><span>MAKE PLANS</span><strong>A plan worth keeping</strong><small>Find the next thing that makes the week feel less ordinary.</small><b aria-hidden="true">↗</b></Link></nav></section>
    <GuidesSpotlight entities={entities} />
    </div><Marquee items={liveTicker} variant="dark" /><LivePreview /><div className="cw-wrap cw-home-content">
    {section('business', 'Keep it local.', '/local', 'local places')}
    <QuadrantExplorer />
    {section('neighbourhood', 'Every neighbourhood has a story.', '/neighbourhoods', 'neighbourhood guides')}
    <WeeklyBrief />
  </div></SiteLayout>;
}
