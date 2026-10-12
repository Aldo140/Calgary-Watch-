import { lazy, Suspense } from 'react';
import { filterInventory, matchesText, matchesTonight } from '../lib/discoveryCalendar';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { SiteLayout } from '../components/site/SiteLayout';
import { NotFoundHero } from './NotFoundPage';
import { DiscoveryCard, EmptyInventory } from '../components/discovery/DiscoveryCards';
import { EntityDetail } from '../components/entity/EntityDetail';
import { EventDetail, PlaceDetail } from '../components/entity/ListingDetail';
import { ListingBoard } from '../components/discovery/ListingBoard';
import { EventsBoard } from '../components/discovery/EventsBoard';
import { boardCount } from '../lib/eventsBoard';
import { LocalBoard } from '../components/discovery/LocalBoard';
import { GuideDetail, GuidesBoard } from '../components/guides/Guides';
import { NeighbourhoodDetail, NeighbourhoodsBoard } from '../components/neighbourhoods/Neighbourhoods';
import { MarketsBoard } from '../components/markets/MarketsBoard';
import { MarketDetail } from '../components/markets/MarketDetail';
import '../styles/local.css';
import '../styles/listings.css';
import { discoveryRepository } from '../data/discovery';
import type { Event as EventEntity, Guide, Neighbourhood } from '../types/discovery';
import { DISCOVERY_SECTIONS, LOCAL_CATEGORIES, QUADRANTS, matchesPeriod, normalizeSearch } from '../lib/discovery';

// The 311 rank game, loaded only on the Neighbourhoods pages.
const RankStrip = lazy(() => import('../components/check/RankStrip'));

const EVENT_FILTERS: Array<[string, string]> = [['free', 'Free'], ['family', 'Family'], ['music', 'Music'], ['arts', 'Arts & theatre'], ['food', 'Food & drink'], ['sports', 'Sports'], ['outdoor', 'Outdoors'], ['talks', 'Talks'], ['indoor', 'Indoor']];

export default function DiscoveryPage() {
  const { pathname } = useLocation(); const [params] = useSearchParams();
  const [root, slug] = pathname.split('/').filter(Boolean);
  const section = DISCOVERY_SECTIONS.find(s => s.path === `/${root}`);
  const all = [...discoveryRepository.list()];
  const period = slug === 'today' || slug === 'this-weekend' ? slug : undefined;
  const category = root === 'local' && LOCAL_CATEGORIES.includes(slug) ? slug : undefined;
  const quadrant = root === 'neighbourhoods' ? params.get('quadrant') : null;
  const entity = section && slug && !period && !category ? discoveryRepository.find(section.kind, slug) : undefined;
  const missing = !!slug && !period && !category && !entity;
  const isTonight = period === 'today' && params.get('time') === 'tonight';
  let items = all.filter(e => e.kind === section?.kind && (!category || e.categories.includes(category)) && (!quadrant || (e.kind === 'neighbourhood' && e.quadrant === quadrant)));
  items = filterInventory(items, discoveryRepository.occurrences(), isTonight ? 'tonight' : period, params.get('filter') || undefined);
  // Search within a listing page (/events?q=jazz), on top of the date and interest filters.
  const within = (root === 'events' || root === 'markets') ? normalizeSearch(params.get('q') ?? '') : '';
  if (within) items = items.filter(e => matchesText(e, within));
  const title = missing ? 'This page isn’t here yet.' : category ? `${category[0].toUpperCase()}${category.slice(1)} in Calgary` : quadrant ? `${quadrant} Calgary` : isTonight ? 'Tonight in Calgary' : period ? `${period === 'today' ? 'Today' : 'This weekend'} in Calgary` : `${section?.label || 'Discover'} in Calgary`;
  const relatedIds = entity?.kind === 'guide' ? entity.entries.map(e => e.entityId) : entity?.kind === 'neighbourhood' ? entity.entityIds : [];
  if (root === 'guides' && !missing) {
    return <SiteLayout>{entity?.kind === 'guide'
      ? <GuideDetail guide={entity} all={all} occurrences={discoveryRepository.occurrences()} />
      : <GuidesBoard guides={items.filter((e): e is Guide => e.kind === 'guide')} />}</SiteLayout>;
  }
  if (root === 'neighbourhoods' && !missing) {
    return <SiteLayout>{entity?.kind === 'neighbourhood'
      ? <NeighbourhoodDetail hood={entity} all={all} occurrences={discoveryRepository.occurrences()} />
      : <NeighbourhoodsBoard hoods={items.filter((e): e is Neighbourhood => e.kind === 'neighbourhood')} all={all} occurrences={discoveryRepository.occurrences()} quadrant={quadrant} />}</SiteLayout>;
  }
  if (root === 'markets' && !missing) {
    return <SiteLayout>{entity?.kind === 'market'
      ? <MarketDetail market={entity} all={all} occurrences={discoveryRepository.occurrences()} />
      : <MarketsBoard items={items} all={all} occurrences={discoveryRepository.occurrences()} period={period} query={within} />}</SiteLayout>;
  }
  if (root === 'local' && !entity && !missing) {
    return <SiteLayout><div className="cw-wrap cw-page"><LocalBoard items={items} all={all} occurrences={discoveryRepository.occurrences()} category={category} /></div></SiteLayout>;
  }
  if ((root === 'events' || root === 'markets') && !entity && !missing) {
    const filterLinks = [
      { to: `/${root}`, label: `All ${root}`, current: !slug },
      { to: `/${root}/this-weekend`, label: 'This weekend', current: period === 'this-weekend' },
      ...(root === 'events' ? [
        { to: '/events/today', label: 'Today', current: period === 'today' && !isTonight },
        { to: '/events/today?time=tonight', label: 'Tonight', current: isTonight },
      ] : []),
    ];
    const interestLinks = root === 'events' ? EVENT_FILTERS.map(([f, label]) => {
      const current = params.get('filter') === f;
      const next = new URLSearchParams({ ...(isTonight ? { time: 'tonight' } : {}), ...(within ? { q: within } : {}), ...(current ? {} : { filter: f }) });
      // Tapping the active chip clears it, so a filter is never a dead end.
      return { to: `${pathname}${next.size ? `?${next}` : ''}`, label, current };
    }) : undefined;
    if (root === 'events') {
      const upcoming = filterInventory(all, discoveryRepository.occurrences()).filter((e): e is EventEntity => e.kind === 'event');
      const now = new Date();
      const counts: Record<string, number> = {
        'This weekend': boardCount(upcoming.filter(e => matchesPeriod(e.start, e.end, 'this-weekend', now)), now),
        Today: boardCount(upcoming.filter(e => matchesPeriod(e.start, e.end, 'today', now)), now),
        Tonight: boardCount(upcoming.filter(e => matchesTonight(e.start, e.end, now)), now),
      };
      return <SiteLayout>
        <EventsBoard title={title} items={items.filter((e): e is EventEntity => e.kind === 'event')} upcoming={upcoming} query={within}
          period={isTonight ? 'tonight' : period} when={filterLinks.map(l => ({ ...l, count: counts[l.label] }))} interests={interestLinks ?? []}
          emptyCta={<EmptyInventory type="events" kind="event" />} />
      </SiteLayout>;
    }
    return <SiteLayout><div className="cw-wrap cw-page">
      <ListingBoard root={root} title={title} items={items} query={within} occurrences={discoveryRepository.occurrences()} filters={filterLinks} interests={interestLinks}
        emptyCta={<EmptyInventory type={section?.label.toLowerCase() || 'discoveries'} kind={section?.kind} />} />
    </div></SiteLayout>;
  }
  if (entity?.kind === 'event') return <SiteLayout><EventDetail event={entity} all={all} /></SiteLayout>;
  if (entity?.kind === 'business') return <SiteLayout><PlaceDetail place={entity} all={all} /></SiteLayout>;
  if (missing) {
    return <SiteLayout><NotFoundHero code={`${section?.label ?? 'Listing'} · not found`} title={<>This listing has <span>moved on.</span></>} lead="It may have ended, moved, or not been published yet. Search for it, or see what’s on now." back={{ to: section?.path || '/', label: `See all ${section?.label.toLowerCase() || 'of Calgary'}` }} /></SiteLayout>;
  }
  return <SiteLayout><div className="cw-wrap cw-page">
    <nav className="cw-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link> / {section && <Link to={section.path}>{section.label}</Link>}{slug && <> / {entity?.title || slug}</>}</nav>
    {entity ? <><EntityDetail entity={entity} occurrences={discoveryRepository.occurrences()} related={all.filter(e => relatedIds.includes(e.id))} all={all} />{entity.kind === 'neighbourhood' && <Suspense fallback={null}><RankStrip focus={entity.title} /></Suspense>}</> : <><header className="cw-page-heading"><p className="cw-eyebrow">CalgaryWatch discovery</p><h1>{title}</h1><p className="cw-lead">Good plans begin with a little local knowledge.</p></header>
      <nav className="cw-intents" aria-label="Filter listings"><Link to={`/${root}`} aria-current={!slug && !quadrant ? 'page' : undefined}>All {section?.label.toLowerCase()}</Link>{(root === 'events' || root === 'markets') && <><Link to={`/${root}/this-weekend`}>This weekend</Link>{root === 'events' && <><Link to="/events/today">Today</Link><Link to="/events/today?time=tonight">Tonight</Link></>}</>}{root === 'local' && LOCAL_CATEGORIES.map(c => <Link key={c} to={`/local/${c}`} aria-current={category === c ? 'page' : undefined}>{c[0].toUpperCase() + c.slice(1)}</Link>)}{root === 'neighbourhoods' && QUADRANTS.map(quad => <Link key={quad} to={`/neighbourhoods?quadrant=${quad}`} aria-current={quadrant === quad ? 'page' : undefined}>{quad}</Link>)}</nav>
      {root === 'neighbourhoods' && <Suspense fallback={null}><RankStrip /></Suspense>}
      {root === 'events' && <nav className="cw-intents" aria-label="Event interests">{EVENT_FILTERS.map(([f]) => f).map(f => <Link key={f} aria-current={params.get('filter') === f ? 'page' : undefined} to={`${pathname}?${new URLSearchParams({ ...(isTonight ? {time:'tonight'} : {}), filter:f })}`}>{f[0].toUpperCase()+f.slice(1)}</Link>)}</nav>}
      {items.some(e => e.developmentOnly) && <p className="cw-preview-note">Illustrative design previews. These are not confirmed listings.</p>}
      {items.length ? <div className="cw-card-grid">{items.map(e => <DiscoveryCard entity={e} key={e.id} />)}</div> : <EmptyInventory type={section?.label.toLowerCase() || 'discoveries'} kind={section?.kind} />}
    </>}
  </div></SiteLayout>;
}
