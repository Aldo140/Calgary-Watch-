import { Link } from 'react-router-dom';
import { Compass, Radio, Sparkles } from 'lucide-react';

const QUADRANT_BADGES = [
  { code: 'NW', label: 'Northwest', to: '/neighbourhoods?quadrant=NW', accent: '#00C2E0' },
  { code: 'NE', label: 'Northeast', to: '/neighbourhoods?quadrant=NE', accent: '#FFDF4F' },
  { code: 'SW', label: 'Southwest', to: '/neighbourhoods?quadrant=SW', accent: '#34D399' },
  { code: 'SE', label: 'Southeast', to: '/neighbourhoods?quadrant=SE', accent: '#FF9466' },
];

const CATEGORY_BADGES = [
  { label: '✦ Weekend Events', to: '/events/this-weekend' },
  { label: '✦ Local Markets', to: '/markets' },
  { label: '✦ Neighbourhoods', to: '/neighbourhoods' },
  { label: '✦ Field Guides', to: '/guides' },
  { label: '✦ Keep It Local', to: '/local' },
  { label: '● Live City Map', to: '/map', isLive: true },
];

export function AuthorityBand() {
  return (
    <section className="cw-authority" aria-labelledby="cw-authority-heading">
      <div className="cw-authority-bg" aria-hidden="true">
        <img src="/images/quadrant/quadrant-se-collage.webp" alt="" loading="lazy" />
      </div>
      <div className="cw-wrap cw-authority-inner">
        <div className="cw-authority-emblem" aria-hidden="true">
          <Sparkles size={14} />
          <span>FOUR QUADRANTS · TWO RIVERS · ONE HOME BASE</span>
        </div>
        <h2 id="cw-authority-heading">
          We're Calgary's home base for what's happening<br />
          <em>events, markets and the city, live.</em>
        </h2>
        <div className="cw-authority-actions">
          <Link className="cw-authority-cta" to="/events/this-weekend">
            <Compass size={15} />
            <span>Explore what's on this weekend ↗</span>
          </Link>
          <Link className="cw-authority-cta-alt" to="/map">
            <Radio size={14} />
            <span>Open live watch map</span>
          </Link>
        </div>
      </div>

      <nav className="cw-authority-badges" aria-label="Browse CalgaryWatch by quadrant or category">
        <div className="cw-authority-quadrants">
          {QUADRANT_BADGES.map(q => (
            <Link 
              key={q.code} 
              to={q.to}
              className="cw-authority-quad-pill"
              style={{ '--quad-accent': q.accent } as React.CSSProperties}
            >
              <b>{q.code}</b>
              <span>{q.label}</span>
            </Link>
          ))}
        </div>
        <div className="cw-authority-categories">
          {CATEGORY_BADGES.map(c => (
            <Link 
              key={c.label} 
              to={c.to} 
              className={`cw-authority-cat-pill ${c.isLive ? 'cw-cat-pill-live' : ''}`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </nav>
    </section>
  );
}
