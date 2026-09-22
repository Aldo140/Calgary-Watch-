import { Link } from 'react-router-dom';

/**
 * DoStuff Media runs one badge per metro (do615, do512, do303...) because they're a
 * multi-city network. CalgaryWatch is one city, so the equivalent "browse the whole
 * network at a glance" band is CalgaryWatch's own real units: the four quadrants plus
 * the core categories — not invented city codes.
 */
const BADGES = [
  { label: 'NW', to: '/neighbourhoods?quadrant=NW' },
  { label: 'NE', to: '/neighbourhoods?quadrant=NE' },
  { label: 'SW', to: '/neighbourhoods?quadrant=SW' },
  { label: 'SE', to: '/neighbourhoods?quadrant=SE' },
  { label: 'EVENTS', to: '/events' },
  { label: 'MARKETS', to: '/markets' },
  { label: 'LOCAL', to: '/local' },
  { label: 'GUIDES', to: '/guides' },
  { label: 'LIVE', to: '/map' },
];

export function AuthorityBand() {
  return (
    <section className="cw-authority" aria-labelledby="cw-authority-heading">
      <div className="cw-authority-bg" aria-hidden="true"><img src="/images/quadrant/quadrant-se-collage.webp" alt="" loading="lazy" /></div>
      <div className="cw-wrap cw-authority-inner">
        <h2 id="cw-authority-heading">We're Calgary's home base for what's happening<br /><em>events, markets and the city, live.</em></h2>
        <Link className="cw-authority-cta" to="/events/this-weekend">Explore what's on ↗</Link>
      </div>
      <nav className="cw-authority-badges" aria-label="Browse CalgaryWatch by quadrant or category">
        {BADGES.map(b => <Link key={b.label} to={b.to}>{b.label}</Link>)}
      </nav>
    </section>
  );
}
