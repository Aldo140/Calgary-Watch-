import { Link } from 'react-router-dom';
import { ArrowUpRight, Compass, MapPin, Sparkles } from 'lucide-react';
import type { DiscoveryEntity, Guide } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { EmptyInventory } from './DiscoveryCards';

/** Eater Travel's layout — a short list plus one large featured card — reads better for
 * guides than a plain grid, since a guide usually deserves more than a thumbnail. Falls
 * back to the shared empty state when there's no published guide yet; never pads the
 * list with placeholders to fill the layout. */
export function GuidesSpotlight({ entities }: { entities: DiscoveryEntity[] }) {
  const guides = entities.filter((e): e is Guide => e.kind === 'guide');
  if (!guides.length) return <section className="cw-section cw-section-guide"><h2>A good place to start.</h2><EmptyInventory type="guides" kind="guide" /></section>;
  const [featured, ...rest] = guides;
  const list = rest.slice(0, 3);
  return (
    <section className="cw-guides-spotlight" aria-labelledby="cw-guides-heading">
      <div className="cw-guides-spotlight-heading">
        <span className="cw-accent-bar" aria-hidden="true" />
        <div>
          <p className="cw-eyebrow"><Compass size={13} /> Field Guides</p>
          <h2 id="cw-guides-heading">Take the scenic route.</h2>
        </div>
        <Link className="cw-text-link" to="/guides">View all guides <ArrowUpRight size={18} /></Link>
      </div>
      <div className="cw-guides-spotlight-grid">
        {list.length > 0 && (
          <ul className="cw-guides-spotlight-list">
            {list.map(g => {
              const imgSrc = g.image?.src || '/images/hero/calgarywatch-city-guide-v1.webp';
              const imgAlt = g.image?.alt || `${g.title} in Calgary`;
              const stops = g.entries?.length || 3;
              return (
                <li key={g.id}>
                  <Link to={entityPath(g)} className="cw-guide-list-item">
                    <div className="cw-guide-list-thumb">
                      <img 
                        src={imgSrc} 
                        alt={imgAlt} 
                        loading="lazy" 
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/hero/calgarywatch-city-guide-v1.webp'; }}
                      />
                    </div>
                    <div className="cw-guide-list-copy">
                      <div className="cw-guide-list-meta">
                        <span className="cw-eyebrow">{g.categories[0] || 'Guide'}</span>
                        <span className="cw-guide-stops-chip">{stops} stops</span>
                      </div>
                      <strong>{g.title}</strong>
                    </div>
                    <ArrowUpRight size={16} className="cw-guide-arrow" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {(() => {
          const featImg = featured.image?.src || '/images/hero/calgarywatch-city-guide-v1.webp';
          const featAlt = featured.image?.alt || `${featured.title} Calgary guide`;
          const featStops = featured.entries?.length || 4;
          return (
            <Link className="cw-guides-spotlight-feature" to={entityPath(featured)}>
              <div className="cw-guide-feature-art">
                <img 
                  src={featImg} 
                  alt={featAlt} 
                  loading="lazy" 
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/hero/calgarywatch-city-guide-v1.webp'; }}
                />
                <span className="cw-guide-feature-badge">
                  <Sparkles size={12} /> FEATURED FIELD GUIDE
                </span>
                <span className="cw-guide-stops-stamp">
                  <MapPin size={12} /> {featStops} Curated Stops
                </span>
              </div>
              <div className="cw-guides-spotlight-feature-copy">
                <span className="cw-eyebrow">{featured.categories[0] || 'Curated Itinerary'}</span>
                <strong>{featured.title}</strong>
                <p>{featured.summary}</p>
                <span className="cw-guide-read-pill">
                  Read Field Guide <ArrowUpRight size={14} />
                </span>
              </div>
            </Link>
          );
        })()}
      </div>
    </section>
  );
}
