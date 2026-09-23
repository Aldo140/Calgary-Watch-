import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { DiscoveryEntity, Neighbourhood } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';

const QUADRANTS = [
  { code: 'NW', name: 'Northwest', blurb: 'River valleys, hills and the university corridor.' },
  { code: 'NE', name: 'Northeast', blurb: 'The airport, the C-Train and the city’s widest mix of cultural pockets.' },
  { code: 'SW', name: 'Southwest', blurb: 'The Beltline, reservoir views and pathway loops.' },
  { code: 'SE', name: 'Southeast', blurb: 'Historic brick, the Bow River bend and Fish Creek Park.' },
] as const;

/**
 * Calgarians give directions by quadrant before neighbourhood, so the map is
 * literally that: four tiles split the way the city splits itself. The
 * neighbourhoods listed come from published guides, never a hand-kept list.
 */
export function QuadrantMap({ entities }: { entities: readonly DiscoveryEntity[] }) {
  const hoods = entities.filter((e): e is Neighbourhood => e.kind === 'neighbourhood');
  const [active, setActive] = useState<(typeof QUADRANTS)[number]['code']>('NW');
  const q = QUADRANTS.find(x => x.code === active)!;
  const inQuadrant = hoods.filter(h => h.quadrant === active);

  return (
    <section className="h-quad" aria-labelledby="h-quad-title">
      <div className="h-quad-copy">
        <p className="h-eyebrow">By quadrant</p>
        <h2 id="h-quad-title">Four corners, one river.</h2>
        <p className="h-quad-note">Centre Street splits east from west. Centre Avenue and the Bow River split north from south. That’s how the city gives directions.</p>

        <div className="h-quad-panel" aria-live="polite">
          <p className="h-quad-code">{q.code}</p>
          <h3>{q.name}</h3>
          <p>{q.blurb}</p>
          {inQuadrant.length ? (
            <ul>
              {inQuadrant.map(h => (
                <li key={h.id}><Link to={entityPath(h)}><strong>{h.title}</strong><span>{h.summary}</span><ArrowUpRight size={16} aria-hidden="true" /></Link></li>
              ))}
            </ul>
          ) : <p className="h-quad-empty">No neighbourhood guides here yet.</p>}
          <Link className="h-link" to={`/neighbourhoods?quadrant=${q.code}`}>All of {q.name} <ArrowUpRight size={15} /></Link>
        </div>
      </div>

      <div className="h-quad-map" role="group" aria-label="Pick a quadrant">
        {QUADRANTS.map(x => (
          <button
            key={x.code}
            type="button"
            className={`h-quad-tile h-quad-${x.code.toLowerCase()}`}
            aria-pressed={x.code === active}
            aria-label={x.name}
            onClick={() => setActive(x.code)}
            onMouseEnter={() => setActive(x.code)}
            onFocus={() => setActive(x.code)}
          >
            <img src={`/images/quadrant/quadrant-${x.code.toLowerCase()}-collage.webp`} alt="" loading="lazy" width="1536" height="1024" />
            <span className="h-quad-label">{x.code}</span>
          </button>
        ))}
        <span className="h-quad-axis h-quad-axis-v" aria-hidden="true"><em>Centre St</em></span>
        <span className="h-quad-axis h-quad-axis-h" aria-hidden="true"><em>Centre Ave · Bow River</em></span>
        <span className="h-quad-n" aria-hidden="true">N</span>
      </div>
    </section>
  );
}
