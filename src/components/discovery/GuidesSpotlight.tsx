import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
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
        <h2 id="cw-guides-heading">Guides</h2>
        <Link className="cw-text-link" to="/guides">View all <ArrowUpRight size={18} /></Link>
      </div>
      <div className="cw-guides-spotlight-grid">
        {list.length > 0 && <ul className="cw-guides-spotlight-list">
          {list.map(g => (
            <li key={g.id}>
              <Link to={entityPath(g)}>
                {g.image && <img src={g.image.src} alt="" loading="lazy" />}
                <div><span className="cw-eyebrow">{g.categories[0] || 'Guide'}</span><strong>{g.title}</strong></div>
              </Link>
            </li>
          ))}
        </ul>}
        <Link className="cw-guides-spotlight-feature" to={entityPath(featured)}>
          {featured.image && <img src={featured.image.src} alt={featured.image.alt} loading="lazy" />}
          <div className="cw-guides-spotlight-feature-copy"><strong>{featured.title}</strong><p>{featured.summary}</p></div>
        </Link>
      </div>
    </section>
  );
}
