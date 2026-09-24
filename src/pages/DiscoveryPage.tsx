import { filterInventory } from '../lib/discoveryCalendar';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { SiteLayout } from '../components/site/SiteLayout';
import { GlobalSearch } from '../components/site/GlobalSearch';
import { DiscoveryCard, EmptyInventory } from '../components/discovery/DiscoveryCards';
import { EntityDetail } from '../components/entity/EntityDetail';
import { ListingBoard } from '../components/discovery/ListingBoard';
import { LocalBoard } from '../components/discovery/LocalBoard';
import '../styles/local.css';
import '../styles/listings.css';
import { discoveryRepository } from '../data/discovery';
import { DISCOVERY_SECTIONS, LOCAL_CATEGORIES, QUADRANTS, matchesPeriod, normalizeSearch, searchEntities } from '../lib/discovery';

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
  const search = root === 'search'; const q = normalizeSearch(params.get('q') ?? '');
  const isTonight = period === 'today' && params.get('time') === 'tonight';
  let items = all.filter(e => e.kind === section?.kind && (!category || e.categories.includes(category)) && (!quadrant || (e.kind === 'neighbourhood' && e.quadrant === quadrant)));
  items = filterInventory(items, discoveryRepository.occurrences(), isTonight ? 'tonight' : period, params.get('filter') || undefined);
  // Search defaults to current/upcoming inventory, same as the listing pages — an ended
  // or cancelled event/market shouldn't surface as a live suggestion. Its detail URL
  // still resolves normally above (`entity`/`missing` don't go through this filter).
  const groups = searchEntities(filterInventory(all, discoveryRepository.occurrences()), q);
  const title = missing ? 'This page isn’t here yet.' : search ? 'Find your next Calgary thing.' : category ? `${category[0].toUpperCase()}${category.slice(1)} in Calgary` : quadrant ? `${quadrant} Calgary` : isTonight ? 'Tonight in Calgary' : period ? `${period === 'today' ? 'Today' : 'This weekend'} in Calgary` : `${section?.label || 'Discover'} in Calgary`;
  const relatedIds = entity?.kind === 'guide' ? entity.entries.map(e => e.entityId) : entity?.kind === 'neighbourhood' ? entity.entityIds : [];
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
    const interestLinks = root === 'events' ? ['free', 'family', 'music', 'food', 'arts', 'outdoor', 'indoor'].map(f => ({
      to: `${pathname}?${new URLSearchParams({ ...(isTonight ? { time: 'tonight' } : {}), filter: f })}`,
      label: f[0].toUpperCase() + f.slice(1), current: params.get('filter') === f,
    })) : undefined;
    return <SiteLayout><div className="cw-wrap cw-page">
      <ListingBoard root={root} title={title} items={items} occurrences={discoveryRepository.occurrences()} filters={filterLinks} interests={interestLinks}
        emptyCta={<EmptyInventory type={section?.label.toLowerCase() || 'discoveries'} kind={section?.kind} />} />
    </div></SiteLayout>;
  }
  return <SiteLayout><div className="cw-wrap cw-page">
    <nav className="cw-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link> / {section && <Link to={section.path}>{section.label}</Link>}{slug && <> / {entity?.title || slug}</>}</nav>
    {entity ? <EntityDetail entity={entity} occurrences={discoveryRepository.occurrences()} related={all.filter(e => relatedIds.includes(e.id))} /> : <><header className="cw-page-heading"><p className="cw-eyebrow">CalgaryWatch discovery</p><h1>{title}</h1><p className="cw-lead">{missing ? 'The listing may have moved or hasn’t been published.' : 'Good plans begin with a little local knowledge.'}</p></header>
      {missing ? <Link className="cw-button" to={section?.path || '/'}>Explore {section?.label || 'Calgary'} ↗</Link> : search ? <><GlobalSearch initial={q} />{q && <p className="cw-result-count" role="status">{Object.values(groups).flat().length} results for “{q}”</p>}{Object.entries(groups).map(([kind, entities]) => <section className="cw-section" key={kind}><h2>{DISCOVERY_SECTIONS.find(s => s.kind === kind)?.label}</h2><div className="cw-card-grid">{entities.map(e => <DiscoveryCard entity={e} key={e.id} />)}</div></section>)}{q && !Object.keys(groups).length && <p>Try another term, browse a neighbourhood, or suggest a place we should add.</p>}<aside className="cw-search-live"><h2>Looking for what’s happening right now?</h2><p>Weather, traffic, outages and community reports have their own place.</p><Link to="/map">Open CalgaryWatch Live ↗</Link></aside></> : <>
      <nav className="cw-intents" aria-label="Filter listings"><Link to={`/${root}`} aria-current={!slug && !quadrant ? 'page' : undefined}>All {section?.label.toLowerCase()}</Link>{(root === 'events' || root === 'markets') && <><Link to={`/${root}/this-weekend`}>This weekend</Link>{root === 'events' && <><Link to="/events/today">Today</Link><Link to="/events/today?time=tonight">Tonight</Link></>}</>}{root === 'local' && LOCAL_CATEGORIES.map(c => <Link key={c} to={`/local/${c}`} aria-current={category === c ? 'page' : undefined}>{c[0].toUpperCase() + c.slice(1)}</Link>)}{root === 'neighbourhoods' && QUADRANTS.map(quad => <Link key={quad} to={`/neighbourhoods?quadrant=${quad}`} aria-current={quadrant === quad ? 'page' : undefined}>{quad}</Link>)}</nav>
      {root === 'events' && <nav className="cw-intents" aria-label="Event interests">{['free','family','music','food','arts','outdoor','indoor'].map(f => <Link key={f} aria-current={params.get('filter') === f ? 'page' : undefined} to={`${pathname}?${new URLSearchParams({ ...(isTonight ? {time:'tonight'} : {}), filter:f })}`}>{f[0].toUpperCase()+f.slice(1)}</Link>)}</nav>}
      {items.some(e => e.developmentOnly) && <p className="cw-preview-note">Illustrative design previews. These are not confirmed listings.</p>}
      {items.length ? <div className="cw-card-grid">{items.map(e => <DiscoveryCard entity={e} key={e.id} />)}</div> : <EmptyInventory type={section?.label.toLowerCase() || 'discoveries'} kind={section?.kind} />}
      </>}
    </>}
  </div></SiteLayout>;
}
