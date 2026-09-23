import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

const QUADRANTS = [
  {
    code: 'NW',
    name: 'Northwest',
    blurb: 'River valleys, hills and the university corridor.',
    image: '/images/quadrant/quadrant-nw-collage.webp',
    landmarks: ['Peace Bridge', 'Kensington', 'Nose Hill Park'],
    tagColor: '#00C2E0',
  },
  {
    code: 'NE',
    name: 'Northeast',
    blurb: 'The airport, the C-Train and Calgary’s widest mix of cultural pockets.',
    image: '/images/quadrant/quadrant-ne-collage.webp',
    landmarks: ['Prairie Winds', 'YYC Airport', 'CrossIron corridor'],
    tagColor: '#FFDF4F',
  },
  {
    code: 'SW',
    name: 'Southwest',
    blurb: 'Reservoir views, pathway loops and mountain vistas on clear mornings.',
    image: '/images/quadrant/quadrant-sw-collage.webp',
    landmarks: ['Beltline & 17th', 'Glenmore Reservoir', 'Central Memorial'],
    tagColor: '#5fd3a0',
  },
  {
    code: 'SE',
    name: 'Southeast',
    blurb: 'Historic brick, the Bow River bend and Calgary’s creative working edge.',
    image: '/images/quadrant/quadrant-se-collage.webp',
    landmarks: ['Historic Inglewood', 'East Village', 'Fish Creek Park'],
    tagColor: '#FF9466',
  },
];

/**
 * Calgary is famously read by quadrant before it's read by neighbourhood name.
 * Surfacing that grid literally — with the four poster-collage assets that already
 * exist per-quadrant — is a distinctly-Calgary device the reference sites don't have.
 */
export function QuadrantExplorer() {
  return (
    <section className="cw-quadrants" aria-labelledby="cw-quadrants-heading">
      <div className="cw-quadrants-lead">
        <p className="cw-eyebrow">Calgary, by quadrant</p>
        <h2 id="cw-quadrants-heading">Four quadrants. One river.</h2>
        <p>However you already say it — NE, NW, SE, SW — that's how Calgary finds its way around.</p>
      </div>
      <nav className="cw-quadrants-grid" aria-label="Explore Calgary by quadrant">
        {QUADRANTS.map(q => (
          <Link key={q.code} to={`/neighbourhoods?quadrant=${q.code}`} className={`cw-quadrant-card cw-quadrant-${q.code.toLowerCase()}`}>
            <img src={q.image} alt="" aria-hidden="true" loading="lazy" />
            <span className="cw-quadrants-code" style={{ borderColor: q.tagColor, color: '#fff' }}>
              {q.code}
            </span>
            <div className="cw-quadrants-copy">
              <div className="cw-quadrant-header">
                <strong>{q.name}</strong>
                <ArrowUpRight size={18} className="cw-quadrant-arrow" aria-hidden="true" />
              </div>
              <small>{q.blurb}</small>
              <div className="cw-quadrant-landmarks">
                {q.landmarks.map(l => (
                  <span key={l} className="cw-quadrant-chip">
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </nav>
    </section>
  );
}
