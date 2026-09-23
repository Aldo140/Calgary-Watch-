import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, X, Search, UserRound } from 'lucide-react';
import { DISCOVERY_SECTIONS } from '../../lib/discovery';
import '../../styles/discovery.css';

export function Wordmark() {
  return (
    <Link className="cw-wordmark" to="/" aria-label="CalgaryWatch home">
      <img 
        className="cw-wordmark-logo" 
        src="/images/brand/calgarywatch-city-spark-v2.webp" 
        width="42" 
        height="42" 
        alt="" 
        aria-hidden="true" 
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/brand/calgary-watch-plane-mark.webp'; }}
      />
      CALGARY<span>WATCH</span><span className="cw-brand-dot" aria-hidden="true">•</span>
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <header className="cw-header">
      <div className="cw-wrap cw-header-inner">
        <button 
          ref={menuButton} 
          className="cw-menu-button cw-menu-button-labeled" 
          onClick={() => setOpen(!open)} 
          aria-expanded={open} 
          aria-controls="cw-mobile-nav" 
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
          <span>Menu</span>
        </button>

        <Wordmark />

        <nav className="cw-desktop-nav" aria-label="Primary navigation">
          {DISCOVERY_SECTIONS.map(section => (
            <NavLink key={section.path} to={section.path}>{section.label}</NavLink>
          ))}
          <NavLink to="/map">Live</NavLink>
        </nav>

        <div className="cw-header-actions">
          <Link to="/search" className="cw-header-search-icon" aria-label="Search CalgaryWatch">
            <Search size={19} />
          </Link>
          <Link className="cw-button cw-subscribe-button" to="/map?settings=account">
            <UserRound size={16} aria-hidden="true" />
            <span className="cw-sub-desktop">My Calgary</span>
            <span className="cw-sub-mobile">Join</span>
          </Link>
        </div>
      </div>

      <nav 
        id="cw-mobile-nav" 
        className={`cw-mobile-nav ${open ? 'cw-mobile-nav-open' : ''}`} 
        hidden={!open} 
        aria-label="Main navigation" 
        onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); menuButton.current?.focus(); } }}
      >
        <div className="cw-mobile-nav-drawer">
          <div className="cw-mobile-nav-meta">
            <span className="cw-mobile-nav-tag">CALGARY NAVIGATION</span>
            <span className="cw-mobile-nav-status">● LIVE</span>
          </div>

          <div className="cw-mobile-nav-links">
            {DISCOVERY_SECTIONS.map(s => (
              <NavLink key={s.path} to={s.path} className="cw-mobile-nav-item">
                <span>{s.label}</span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </NavLink>
            ))}
          </div>

          <div className="cw-mobile-nav-special">
            <NavLink to="/community" className="cw-mobile-nav-community-card">
              <span className="cw-mobile-card-tag">Around your neighbourhood</span>
              <strong>Community Watch</strong>
              <small>Live incident feed, filters &amp; report verification</small>
              <b aria-hidden="true">→</b>
            </NavLink>
            <Link to="/map" className="cw-mobile-nav-map-card">
              <span className="cw-mobile-card-tag cw-tag-amber">Real-Time</span>
              <strong>Live Radar &amp; Map</strong>
              <small>Bow River telemetry, cameras &amp; road conditions</small>
              <b aria-hidden="true">↗</b>
            </Link>
          </div>

          <div className="cw-mobile-nav-bottom">
            <Link to="/map?settings=account" className="cw-mobile-pref-link">
              My Calgary &amp; email preferences
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
export function SiteFooter() { return <footer className="cw-footer"><div className="cw-wrap"><div className="cw-footer-top"><div><Wordmark /><p>A little closer to your city.</p></div><a className="cw-text-link" href="mailto:aldo@calgarywatch.ca">Say hello <ArrowUpRight size={18} /></a></div><div className="cw-footer-bottom"><p>© {new Date().getFullYear()} CalgaryWatch · Free for residents.</p><nav aria-label="Footer"><NavLink to="/community" title="CalgaryWatch community">Community</NavLink><Link to="/about">About</Link><Link to="/coverage">Live coverage</Link><Link to="/privacy">Privacy</Link><Link to="/map?settings=alerts">Email preferences</Link></nav></div></div></footer>; }
export function SiteLayout({ children }: { children: ReactNode }) { return <div className="cw-site"><a className="cw-skip" href="#cw-main">Skip to content</a><SiteHeader /><main id="cw-main">{children}</main><SiteFooter /></div>; }
