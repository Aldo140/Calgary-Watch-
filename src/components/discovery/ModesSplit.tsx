import { Link } from 'react-router-dom';

/**
 * States the two-mode identity in one glance: Discovery (what to do) and Live
 * (what's happening nearby) get deliberately different visual language here —
 * warm editorial photography vs. the dark poster collage — so the split reads
 * as two clear halves of one product, not an ambiguous blend of "events site"
 * and "crime site."
 */
export function ModesSplit() {
  return (
    <section className="cw-modes" aria-labelledby="cw-modes-heading">
      <div className="cw-wrap cw-modes-lead">
        <img className="cw-modes-emblem" src="/images/illustration/calgary-bow-emblem.webp" alt="" aria-hidden="true" loading="lazy" />
        <p className="cw-eyebrow">What CalgaryWatch is</p>
        <h2 id="cw-modes-heading">One city.<br />Two ways to know it.</h2>
        <p>Plan the good stuff. Stay aware of what changed. Same city, one home for both.</p>
      </div>
      <div className="cw-modes-grid">
        <Link to="/events/this-weekend" className="cw-mode cw-mode-discover">
          <img src="/images/photo/calgary7.webp" alt="A couple watching the sunset over the Calgary skyline from a park bench" loading="lazy" />
          <div className="cw-mode-copy">
            <span className="cw-eyebrow">Discover</span>
            <h3>Find your next thing to do</h3>
            <p>Events, markets, food, guides and neighbourhoods — sourced and dated, not guessed at.</p>
            <b aria-hidden="true">Explore Discovery ↗</b>
          </div>
        </Link>
        <Link to="/map" className="cw-mode cw-mode-live">
          <img src="/images/quadrant/quadrant-nw-collage.webp" alt="Night view of Calgary's Peace Bridge and riverfront" loading="lazy" />
          <div className="cw-mode-copy">
            <span className="cw-eyebrow">Live</span>
            <h3>Know what's happening nearby</h3>
            <p>Community reports, traffic, weather and outages, with sources and timestamps. See it. Share it. Calgary knows.</p>
            <b aria-hidden="true">Open Live Map ↗</b>
          </div>
        </Link>
      </div>
    </section>
  );
}
