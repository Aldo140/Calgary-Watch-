import { Link } from 'react-router-dom';

const QUADRANTS = [
  { code: 'NW', name: 'Northwest', blurb: 'River valleys, hills and the university corridor.', image: '/images/quadrant/quadrant-nw-collage.webp' },
  { code: 'NE', name: 'Northeast', blurb: 'The airport, the C-Train and Calgary’s widest mix of neighbourhoods.', image: '/images/quadrant/quadrant-ne-collage.webp' },
  { code: 'SW', name: 'Southwest', blurb: 'Reservoir views, the pathway system and the mountains on a clear day.', image: '/images/quadrant/quadrant-sw-collage.webp' },
  { code: 'SE', name: 'Southeast', blurb: 'Inglewood, the Bow and Calgary’s working edge.', image: '/images/quadrant/quadrant-se-collage.webp' },
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
          <Link key={q.code} to={`/neighbourhoods?quadrant=${q.code}`}>
            <img src={q.image} alt="" aria-hidden="true" loading="lazy" />
            <span className="cw-quadrants-code">{q.code}</span>
            <div className="cw-quadrants-copy"><strong>{q.name}</strong><small>{q.blurb}</small></div>
          </Link>
        ))}
      </nav>
    </section>
  );
}
