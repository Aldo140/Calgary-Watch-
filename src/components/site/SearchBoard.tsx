import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarDays, Car, Compass, Map as MapIcon, MapPin, ShieldAlert, Sparkles, Store, Zap, Clock3, Heart, BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { GlobalSearch, type Suggestion } from './GlobalSearch';
import { SearchAnswers } from './SearchAnswers';
import { PageHero } from './PageHero';
import type { SearchIntent } from '../../lib/searchIntent';
import type { DiscoveryEntity } from '../../types/discovery';
import { DISCOVERY_SECTIONS, entityPath } from '../../lib/discovery';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import '../../styles/search-page.css';

/** One-tap searches for what people most often come looking for. */
const STARTERS: Array<{ label: string; note: string; to: string; icon: ReactNode; tone: string }> = [
  { label: 'Police and safety tonight', note: 'What neighbours and police posted', to: '/search?q=police+tonight', icon: <ShieldAlert size={22} />, tone: 'navy' },
  { label: 'What happened yesterday', note: 'Every report from yesterday', to: '/search?q=yesterday', icon: <Clock3 size={22} />, tone: 'red' },
  { label: 'Crime reports this week', note: 'The last seven days, citywide', to: '/search?q=crime+this+week', icon: <MapPin size={22} />, tone: 'purple' },
  { label: 'Traffic and road closures', note: 'Collisions and closures today', to: '/search?q=traffic+today', icon: <Car size={22} />, tone: 'blue' },
  { label: 'Power outages', note: 'Where ENMAX says the power’s out', to: '/search?q=power+outage', icon: <Zap size={22} />, tone: 'yellow' },
  { label: 'Things to do this weekend', note: 'Events, day by day', to: '/events/this-weekend', icon: <Sparkles size={22} />, tone: 'green' },
];

const BROWSE: Array<{ to: string; label: string; note: string; icon: ReactNode }> = [
  { to: '/events', label: 'Events', note: 'What’s on, day by day', icon: <CalendarDays size={20} /> },
  { to: '/markets', label: 'Markets', note: 'Farmers’ and makers’', icon: <Store size={20} /> },
  { to: '/date-night', label: 'Date night', note: 'Our picks for two', icon: <Heart size={20} /> },
  { to: '/neighbourhoods', label: 'Neighbourhoods', note: 'Quadrant by quadrant', icon: <Compass size={20} /> },
  { to: '/guides', label: 'Guides', note: 'Self-guided days out', icon: <BookOpen size={20} /> },
  { to: '/local', label: 'Local', note: 'Places worth knowing', icon: <MapPin size={20} /> },
];

const TRY = ['Beltline', '17 Ave SW', 'police yesterday', 'jazz', 'Kensington', 'free this weekend'];

const when = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
const KIND: Record<string, string> = { event: 'Event', market: 'Market', business: 'Local', guide: 'Guide', neighbourhood: 'Neighbourhood' };

function detail(e: DiscoveryEntity) {
  const place = e.kind === 'event' || e.kind === 'market' || e.kind === 'business' ? e.neighbourhood || e.venue || e.address
    : e.kind === 'neighbourhood' ? `${e.quadrant} Calgary` : null;
  const date = e.kind === 'event' && e.start ? when.format(new Date(e.start)) : null;
  return { place, date };
}

/**
 * /search: a branded front door that answers first. Before a search it shows
 * the questions people actually bring here and every section to browse; after
 * one it leads with the ready-made answer, then listings grouped by kind.
 */
export function SearchBoard({ q, intent, now, groups, listingCount, resultCount, answers, partial = false, didYouMean, suggest, nearby }: {
  q: string; intent: SearchIntent; now: number; groups: Record<string, DiscoveryEntity[]>;
  listingCount: number; resultCount: number; answers: number;
  partial?: boolean; didYouMean?: string; suggest?: (q: string) => Suggestion[];
  /** For a community search with no listings of its own: what's on nearby. */
  nearby?: { title: ReactNode; items: DiscoveryEntity[] };
}) {
  const listings = <><b>{listingCount}</b> {partial ? 'close ' : ''}{listingCount === 1 ? 'listing' : 'listings'}</>;
  const ready = <><b>{answers}</b> ready-made {answers === 1 ? 'answer' : 'answers'}</>;
  return (
    <div className="bp sx">
      <PageHero
        id="sx-title"
        kicker={q ? 'Search results' : 'Search CalgaryWatch'}
        title={q ? <>Results for <span>“{q}”</span></> : <>Ask about <span>Calgary.</span></>}
        lead={q ? undefined : 'A neighbourhood, a street, what happened last night, or something to do this weekend. Answers come from the live map and every listing on the site.'}
        ctas={<div className="sx-box"><GlobalSearch initial={q} suggest={suggest} /></div>}
        facts={<>{TRY.map(t => <li key={t}><Link to={`/search?q=${encodeURIComponent(t)}`}>{t}</Link></li>)}</>}
      />

      <div className="cw-wrap">
        {q ? (
          <>
            <p className="sx-count" role="status">
              {resultCount
                ? <>{answers ? ready : null}{answers > 0 && listingCount > 0 ? ' and ' : null}{listingCount ? listings : null}{partial ? '. Nothing matched every word, so these match most of them.' : null}</>
                : <>Nothing matched <b>“{q}”</b> yet. Try a neighbourhood, a street, or one of these.</>}
            </p>
            {didYouMean ? <p className="sx-dym">Did you mean <Link to={`/search?q=${encodeURIComponent(didYouMean)}`}>{didYouMean}</Link>?</p> : null}
            <SearchAnswers intent={intent} now={now} />
            {Object.entries(groups).map(([kind, entities]) => {
              const section = DISCOVERY_SECTIONS.find(s => s.kind === kind);
              return (
                <section className="bp-section sx-group" key={kind} aria-labelledby={`sx-${kind}`}>
                  <div className="bp-head">
                    <h2 id={`sx-${kind}`}>{section?.label}</h2>
                    {section ? <Link className="bp-link" to={section.path}>All {section.label.toLowerCase()} <ArrowRight size={15} aria-hidden="true" /></Link> : null}
                  </div>
                  <Rows entities={entities} />
                </section>
              );
            })}
            {nearby?.items.length ? (
              <section className="bp-section sx-group" aria-labelledby="sx-nearby">
                <div className="bp-head"><h2 id="sx-nearby">{nearby.title}</h2><p>Nothing listed in this community yet, so here’s what’s closest.</p></div>
                <Rows entities={nearby.items} />
              </section>
            ) : null}
            {!resultCount ? <Starters title="Try one of these" /> : null}
          </>
        ) : (
          <>
            <Starters title={<>What people <span>ask most.</span></>} />
            <section className="bp-section" aria-labelledby="sx-browse">
              <div className="bp-head"><h2 id="sx-browse">Or just <span>browse.</span></h2><p>Every section, checked against its source.</p></div>
              <ul className="sx-browse">
                {BROWSE.map(b => (
                  <li key={b.to}><Link to={b.to}><span className="sx-browse-icon" aria-hidden="true">{b.icon}</span><strong>{b.label}</strong><small>{b.note}</small><ArrowUpRight size={18} aria-hidden="true" className="sx-arrow" /></Link></li>
                ))}
              </ul>
            </section>
          </>
        )}

        <section className="bp-banner sx-live">
          <div>
            <h2>Happening right now?</h2>
            <p>Weather, traffic, outages and what neighbours are reporting live on one map, each pin with its source.</p>
          </div>
          <div className="bp-ctas"><Link className="bp-btn bp-btn-navy" to="/map"><MapIcon size={18} aria-hidden="true" /> Open the live map</Link></div>
        </section>
      </div>
    </div>
  );
}

function Rows({ entities }: { entities: DiscoveryEntity[] }) {
  return (
    <ul className="sx-results">
      {entities.map(e => {
        const { place, date } = detail(e);
        return (
          <li key={e.id}>
            <Link to={entityPath(e)} className="sx-result">
              <span className={`sx-kind sx-kind-${e.kind}`}>{KIND[e.kind]}</span>
              <span className="sx-result-copy">
                <strong>{e.title}</strong>
                {date || place ? <small>{[date, place].filter(Boolean).join(' · ')}</small> : null}
              </span>
              <ArrowUpRight size={20} aria-hidden="true" className="sx-arrow" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Starters({ title }: { title: ReactNode }) {
  return (
    <section className="bp-section" aria-labelledby="sx-starters">
      <div className="bp-head"><h2 id="sx-starters">{title}</h2><p>One tap, real answers. When there’s nothing reported, it says so.</p></div>
      <ul className="sx-starters">
        {STARTERS.map(s => (
          <li key={s.to}>
            <Link to={s.to} className={`sx-starter bp-tone-${s.tone}`}>
              <span className="sx-starter-icon" aria-hidden="true">{s.icon}</span>
              <strong>{s.label}</strong>
              <small>{s.note}</small>
              <ArrowRight size={20} aria-hidden="true" className="sx-arrow" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
