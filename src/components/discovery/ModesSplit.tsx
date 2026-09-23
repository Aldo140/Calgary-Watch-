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
        <img className="cw-modes-emblem" src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" aria-hidden="true" loading="lazy" />
        <p className="cw-eyebrow">What CalgaryWatch is</p>
        <h2 id="cw-modes-heading">One city.<br />Two ways to know it.</h2>
        <p>Plan the good stuff. Stay aware of what changed. Same city, one home for both.</p>
      </div>
      <div className="cw-modes-grid">
        <Link to="/events/this-weekend" className="cw-mode cw-mode-discover">
          <div className="cw-mode-top-badge cw-mode-badge-discover" aria-hidden="true">
            <span>City discovery</span>
          </div>
          <img src="/images/hero/calgarywatch-city-guide-v1.webp" alt="An illustrated Calgary city guide with the skyline, Bow River, Peace Bridge, markets and pathways" loading="lazy" />
          <div className="cw-mode-copy">
            <span className="cw-eyebrow">Discover</span>
            <h3>Find your next thing to do</h3>
            <p>Events, markets, food, guides and neighbourhoods — sourced and dated, not guessed at.</p>
            <div className="cw-mode-tags">
              <span>✦ Weekend Plans</span>
              <span>✦ Local Markets</span>
              <span>✦ Neighbourhood Guides</span>
            </div>
            <b className="cw-mode-cta" aria-hidden="true">Explore Discovery ↗</b>
          </div>
        </Link>
        <Link to="/map" className="cw-mode cw-mode-live">
          <div className="cw-mode-top-badge cw-mode-badge-live" aria-hidden="true">
            <span className="cw-mode-pulse-dot" />
            <span>CalgaryWatch Live</span>
          </div>
          <img src="/images/hero/calgarywatch-live-watch-v1.webp" alt="An illustrated Calgary nocturnal live watch scene with glowing Calgary Tower, Peace Bridge, radar pulses and community report markers" loading="lazy" />
          <div className="cw-mode-copy">
            <span className="cw-eyebrow">Live</span>
            <h3>Know what's happening nearby</h3>
            <p>Community reports, traffic, weather and outages, with sources and timestamps. See it. Share it. Calgary knows.</p>
            <div className="cw-mode-tags cw-mode-tags-live">
              <span>✦ Traffic Cameras</span>
              <span>✦ Outage Radar</span>
              <span>✦ Bow River Gauges</span>
            </div>
            <b className="cw-mode-cta" aria-hidden="true">Open Live Map ↗</b>
          </div>
        </Link>
      </div>
    </section>
  );
}
