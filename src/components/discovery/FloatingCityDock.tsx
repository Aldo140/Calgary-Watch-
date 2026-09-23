import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, ArrowUpRight, Compass, Radio } from 'lucide-react';

export function FloatingCityDock() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 480);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <aside className="cw-floating-dock" aria-label="Calgary quick navigation dock">
      <div className="cw-dock-inner">
        <div className="cw-dock-status">
          <span className="cw-dock-live-dot" aria-hidden="true" />
          <span className="cw-dock-city">CALGARY</span>
          <span className="cw-dock-telemetry">Bow Flow: 56 m³/s</span>
        </div>
        <div className="cw-dock-divider" aria-hidden="true" />
        <nav className="cw-dock-actions" aria-label="Quick links">
          <Link to="/events/this-weekend" className="cw-dock-btn cw-dock-weekend">
            <Compass size={14} />
            <span>Weekend</span>
          </Link>
          <Link to="/map" className="cw-dock-btn cw-dock-live">
            <Radio size={14} />
            <span>Live Map</span>
            <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
          <button
            type="button"
            className="cw-dock-btn cw-dock-top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Scroll back to top"
          >
            <ArrowUp size={14} />
          </button>
        </nav>
      </div>
    </aside>
  );
}
