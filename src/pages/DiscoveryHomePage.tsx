import { filterInventory } from '../lib/discoveryCalendar';
import { Link } from 'react-router-dom';
import { SiteLayout } from '../components/site/SiteLayout';
import { CityHero } from '../components/discovery/CityHero';
import { ModesSplit } from '../components/discovery/ModesSplit';
import { QuadrantExplorer } from '../components/discovery/QuadrantExplorer';
import { Marquee } from '../components/discovery/Marquee';
import { GuidesSpotlight } from '../components/discovery/GuidesSpotlight';
import { DiscoveryCard, EditorialGrid, EmptyInventory, SectionHeading } from '../components/discovery/DiscoveryCards';
import { CityServicesShowcase } from '../components/discovery/CityServicesShowcase';
import { WeeklyBrief } from '../components/discovery/WeeklyBrief';
import { RecurringNow } from '../components/discovery/RecurringNow';
import { FloatingCityDock } from '../components/discovery/FloatingCityDock';
import { EditorialDivider } from '../components/discovery/EditorialDivider';
import { discoveryRepository } from '../data/discovery';
import { matchesPeriod } from '../lib/discovery';
import type { EntityKind } from '../types/discovery';

export default function DiscoveryHomePage() {
  const entities = filterInventory(discoveryRepository.list(), discoveryRepository.occurrences());
  const section = (kind: EntityKind, title: string, path: string, label: string, weekend = false) => {
    const items = entities.filter(e => e.kind === kind && (!weekend || e.kind !== 'event' || matchesPeriod(e.start, e.end, 'this-weekend')));
    return <section className={`cw-section cw-section-${kind}`}><SectionHeading title={title} to={path} />{items.length ? <EditorialGrid>{items.slice(0, kind === 'market' || kind === 'neighbourhood' ? 4 : 2).map(e => <DiscoveryCard key={e.id} entity={e} />)}</EditorialGrid> : <EmptyInventory type={label} kind={kind} />}</section>;
  };
  const topTicker = [
    "WHAT'S HAPPENING", '🎉',
    'THIS WEEKEND', '📅',
    'BOW & ELBOW RIVERS', '🌊',
    'HISTORIC INGLEWOOD', '📍',
    'FARMERS MARKETS', '🥖',
    'BELTLINE CYCLE TRACK', '🚲',
    'KENSINGTON CAFES', '☕',
    'NOSE HILL RIDGES', '🏔️',
    'CALGARY, CURATED', '⚡'
  ];
  return <SiteLayout><CityHero entities={entities} occurrences={discoveryRepository.occurrences()} /><ModesSplit /><Marquee items={topTicker} /><EditorialDivider label="THE CALGARY REGISTRY · TWO RIVERS · FOUR QUADRANTS" emblem="bow" /><div className="cw-wrap cw-home-content">
    <section className="cw-start-panel" aria-labelledby="cw-start-heading">
      <div className="cw-start-copy">
        <div className="cw-stamp-pill" aria-hidden="true">
          <img src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" />
          <span>YYC ESSENTIALS · ISSUE NO. 24</span>
        </div>
        <p className="cw-eyebrow">Start somewhere good</p>
        <h2 id="cw-start-heading">Make a day of it.</h2>
        <p>Pick a direction and let Calgary fill in the rest.</p>
        <div className="cw-start-perks" aria-hidden="true">
          <span>✦ Three ways into the city</span>
          <span>✦ Sources on every listing</span>
        </div>
      </div>
      <nav className="cw-start-links" aria-label="Start exploring Calgary">
        <Link to="/events/this-weekend" className="cw-ticket-card">
          <span className="cw-ticket-eyelet" aria-hidden="true" />
          <div className="cw-card-tape-sticker cw-sticker-weekend" aria-hidden="true">✦ THIS WEEKEND</div>
          <img 
            src="/images/illustration/calgarywatch-start-weekend-v1.webp" 
            alt="Calgary weekend festival" 
            aria-hidden="true" 
            loading="lazy" 
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/photo/calgary3.webp'; }}
          />
          <span className="cw-start-link-subtag" aria-hidden="true">CURATED CITY PICKS</span>
          <span>WEEKEND</span>
          <strong>Make weekend plans</strong>
          <small>Events, shows and things worth leaving home for</small>
          <div className="cw-ticket-barcode" aria-hidden="true">
            <span>||| | |||| | ||| 2026.YYC</span>
            <b>ADMIT ONE</b>
          </div>
          <b aria-hidden="true" className="cw-ticket-arrow">↗</b>
        </Link>
        <Link to="/markets" className="cw-ticket-card">
          <span className="cw-ticket-eyelet" aria-hidden="true" />
          <div className="cw-card-tape-sticker cw-sticker-market" aria-hidden="true">✦ FRESH & LOCAL</div>
          <img 
            src="/images/illustration/calgarywatch-start-market-v1.webp" 
            alt="Calgary farmers market" 
            aria-hidden="true" 
            loading="lazy" 
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/photo/calgary5.webp'; }}
          />
          <span className="cw-start-link-subtag" aria-hidden="true">VERIFIED SCHEDULES</span>
          <span>LOCAL</span>
          <strong>Find a market</strong>
          <small>Local makers, food and a slower Saturday</small>
          <div className="cw-ticket-barcode" aria-hidden="true">
            <span>||| || | |||| || 2026.MARKET</span>
            <b>ADMIT ONE</b>
          </div>
          <b aria-hidden="true" className="cw-ticket-arrow">↗</b>
        </Link>
        <Link to="/map" className="cw-ticket-card cw-ticket-live">
          <span className="cw-ticket-eyelet" aria-hidden="true" />
          <div className="cw-card-tape-sticker cw-sticker-live" aria-hidden="true">
            <span className="cw-pulse-tiny-dot" />
            <span>LIVE TELEMETRY</span>
          </div>
          <img 
            src="/images/hero/calgarywatch-live-watch-v1.webp" 
            alt="Calgary live watch" 
            aria-hidden="true" 
            loading="lazy" 
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/photo/calgary4.webp'; }}
          />
          <span className="cw-start-link-subtag" aria-hidden="true">OPEN THE LIVE MAP</span>
          <span>LIVE</span>
          <strong>See Calgary live</strong>
          <small>Reports, traffic, weather and outages nearby</small>
          <div className="cw-ticket-barcode" aria-hidden="true">
            <span>|||| | ||| |||| 2026.RADAR</span>
            <b>ACTIVE</b>
          </div>
          <b aria-hidden="true" className="cw-ticket-arrow">↗</b>
        </Link>
      </nav>
    </section>
    <RecurringNow entities={entities} occurrences={discoveryRepository.occurrences()} />
    {section('event', 'Your weekend starts here.', '/events/this-weekend', 'weekend plans', true)}
    {section('market', 'Meet you at the market.', '/markets', 'markets')}
    <section className="cw-city-index" aria-labelledby="cw-city-index-heading">
      <div className="cw-city-index-lead">
        <div className="cw-stamp-pill" aria-hidden="true">
          <img src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" />
          <span>MOOD COMPASS · CALGARY VIBES</span>
        </div>
        <p className="cw-eyebrow">The city index</p>
        <h2 id="cw-city-index-heading">Follow the feeling.</h2>
        <p>Some days call for a table, some for a long walk, some for knowing what changed while you were away.</p>
      </div>
      <nav className="cw-city-index-links" aria-label="Explore by mood">
        <Link to="/local/food">
          <div className="cw-visa-stamp cw-stamp-taste" aria-hidden="true">
            <span>YYC FLAVOUR</span>
            <b>VISA 403</b>
          </div>
          <div className="cw-mood-tape cw-tape-taste" aria-hidden="true">✦ CUISINE & COFFEE</div>
          <img 
            src="/images/illustration/calgarywatch-start-market-v1.webp" 
            alt="Calgary dining and culinary destinations" 
            aria-hidden="true" 
            loading="lazy" 
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/photo/calgary5.webp'; }}
          />
          <div className="cw-mood-chips" aria-hidden="true">
            <span>☕ Roasteries</span>
            <span>🍜 Late Night</span>
            <span>🍷 Patios</span>
          </div>
          <span>TASTE</span>
          <strong>Something delicious</strong>
          <small>Good food, good rooms, no grand occasion required.</small>
          <b aria-hidden="true">↗</b>
        </Link>
        <Link to="/neighbourhoods">
          <div className="cw-visa-stamp cw-stamp-wander" aria-hidden="true">
            <span>BOW CORRIDOR</span>
            <b>PERMIT 587</b>
          </div>
          <div className="cw-mood-tape cw-tape-wander" aria-hidden="true">✦ PATHWAYS & PARKS</div>
          <img 
            src="/images/hero/calgarywatch-city-guide-v1.webp" 
            alt="Calgary scenic strolls and river pathways" 
            aria-hidden="true" 
            loading="lazy" 
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/photo/calgary7.webp'; }}
          />
          <div className="cw-mood-chips" aria-hidden="true">
            <span>🌊 Bow River</span>
            <span>🌲 Douglas Fir</span>
            <span>🚲 Bikeways</span>
          </div>
          <span>WANDER</span>
          <strong>A change of scenery</strong>
          <small>Take the long way through a neighbourhood with its own rhythm.</small>
          <b aria-hidden="true">↗</b>
        </Link>
        <Link to="/events/this-weekend">
          <div className="cw-visa-stamp cw-stamp-plans" aria-hidden="true">
            <span>WEEKEND PASS</span>
            <b>ENTRY ALL</b>
          </div>
          <div className="cw-mood-tape cw-tape-plans" aria-hidden="true">✦ STAGE & SCREEN</div>
          <img 
            src="/images/illustration/calgarywatch-start-weekend-v1.webp" 
            alt="Calgary nightlife and weekend events" 
            aria-hidden="true" 
            loading="lazy" 
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/photo/calgary8.webp'; }}
          />
          <div className="cw-mood-chips" aria-hidden="true">
            <span>🎭 Arts</span>
            <span>🎷 Live Music</span>
            <span>🎪 Screenings</span>
          </div>
          <span>MAKE PLANS</span>
          <strong>A plan worth keeping</strong>
          <small>Find the next thing that makes the week feel less ordinary.</small>
          <b aria-hidden="true">↗</b>
        </Link>
      </nav>
    </section>
    <GuidesSpotlight entities={entities} />
    </div><EditorialDivider label="EXPLORE · WATCH · CONNECT · STAY IN THE LOOP" /><CityServicesShowcase /><EditorialDivider label="COMMUNITY INTELLIGENCE · VERIFIED SOURCING" emblem="bow" /><div className="cw-wrap cw-home-content">
    {section('business', 'Keep it local.', '/local', 'local places')}
    <QuadrantExplorer />
    {section('neighbourhood', 'Every neighbourhood has a story.', '/neighbourhoods', 'neighbourhood guides')}
    <WeeklyBrief />
  </div><FloatingCityDock /></SiteLayout>;
}
