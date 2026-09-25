import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import '../../styles/discovery.css';
import '../../styles/site-nav.css';
import { MenuArt, type MenuArtKind } from './MenuArt';

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

const SECTIONS = [
  { to: '/events', label: 'Events', note: 'What’s on, day by day' },
  { to: '/markets', label: 'Markets', note: 'Farmers’ and makers’ markets' },
  { to: '/neighbourhoods', label: 'Neighbourhoods', note: 'The city, quadrant by quadrant' },
  { to: '/guides', label: 'Guides', note: 'Self-guided days out' },
  { to: '/local', label: 'Local', note: 'Independent places worth knowing' },
];

/**
 * One header for every Discovery page. Desktop: brand, sections, then the
 * three things people come back for (search, the live map, the email).
 * Mobile: brand plus Live, search and a full-screen menu. On the homepage it
 * floats transparently over the live sky until you scroll.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const burger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    sheet.current?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); burger.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { root.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [open]);

  const overlay = pathname === '/' && !scrolled && !open;

  return (
    <header className="cw-nav" data-scrolled={scrolled} data-overlay={overlay} data-open={open}>
      <div className="cw-wrap cw-nav-bar">
        <Wordmark />

        <nav className="cw-nav-links" aria-label="Main">
          {SECTIONS.map(s => <NavLink key={s.to} to={s.to} className="cw-nav-link">{s.label}</NavLink>)}
          <NavLink to="/community" className="cw-nav-link">Community</NavLink>
        </nav>

        <div className="cw-nav-actions">
          <Link to="/search" className="cw-nav-icon" aria-label="Search CalgaryWatch"><Search size={19} /></Link>
          <Link to="/map" className="cw-nav-live"><span className="cw-nav-pulse" aria-hidden="true" /><span>Live<span className="cw-nav-live-long"> map</span></span></Link>
          <Link to="/map?settings=alerts" className="cw-nav-cta">Subscribe</Link>
          <button
            ref={burger}
            type="button"
            className="cw-nav-burger"
            aria-expanded={open}
            aria-controls="cw-nav-sheet"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen(o => !o)}
          >
            <span aria-hidden="true" /><span aria-hidden="true" />
          </button>
        </div>
      </div>

      <div id="cw-nav-sheet" ref={sheet} className="cw-nav-sheet" hidden={!open} role="dialog" aria-modal="true" aria-label="Menu">
        <div className="cw-wrap cw-nav-sheet-inner cw-menu">
          <nav aria-label="Sections">
            <ul className="cw-menu-grid">
              {SECTIONS.map((s, i) => (
                <li key={s.to} className={`cw-menu-tile cw-menu-${s.to.slice(1)}`} style={{ ['--i' as string]: i }}>
                  <NavLink to={s.to}>
                    <MenuArt kind={s.to.slice(1) as MenuArtKind} />
                    <strong>{s.label}</strong>
                    <small>{s.note}</small>
                  </NavLink>
                </li>
              ))}
              <li className="cw-menu-tile cw-menu-community" style={{ ['--i' as string]: SECTIONS.length }}>
                <Link to="/community">
                  <MenuArt kind="community" />
                  <span>
                    <span className="cw-menu-live"><span className="cw-nav-pulse" aria-hidden="true" /> Live</span>
                    <strong>Community Watch</strong>
                    <small>Crime and safety reports from your neighbours, on one map.</small>
                  </span>
                  <ArrowUpRight size={20} aria-hidden="true" />
                </Link>
              </li>
            </ul>
          </nav>
          <div className="cw-menu-foot">
            <Link to="/map?settings=alerts" className="cw-menu-mail"><MenuArt kind="mail" /><span><strong>Get the Monday email</strong><small>What was reported near home. Free.</small></span></Link>
            <p><Link to="/map">Open the live map</Link><Link to="/about">About</Link><Link to="/coverage">Sources</Link><Link to="/privacy">Privacy</Link></p>
          </div>
        </div>
      </div>
    </header>
  );
}
export function SiteFooter() { return <footer className="cw-footer"><div className="cw-wrap"><div className="cw-footer-top"><div><Wordmark /><p>A little closer to your city.</p></div><a className="cw-text-link" href="mailto:aldo@calgarywatch.ca">Say hello <ArrowUpRight size={18} /></a></div><div className="cw-footer-bottom"><p>© {new Date().getFullYear()} CalgaryWatch · Free for residents.</p><nav aria-label="Footer"><NavLink to="/community" title="CalgaryWatch community">Community</NavLink><Link to="/about">About</Link><Link to="/coverage">Live coverage</Link><Link to="/privacy">Privacy</Link><Link to="/map?settings=alerts">Email preferences</Link></nav></div></div></footer>; }
export function SiteLayout({ children }: { children: ReactNode }) { return <div className="cw-site"><a className="cw-skip" href="#cw-main">Skip to content</a><SiteHeader /><main id="cw-main">{children}</main><SiteFooter /></div>; }
