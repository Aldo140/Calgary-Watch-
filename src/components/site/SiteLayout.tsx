import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, X, Search } from 'lucide-react';
import { DISCOVERY_SECTIONS } from '../../lib/discovery';
import '../../styles/discovery.css';

export function Wordmark() { return <Link className="cw-wordmark" to="/" aria-label="CalgaryWatch home">CALGARY<span>WATCH</span><span className="cw-brand-dot" aria-hidden="true">•</span></Link>; }
export function SiteHeader() {
  const [open, setOpen] = useState(false); const { pathname } = useLocation();
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);
  return <header className="cw-header"><div className="cw-wrap cw-header-inner"><Wordmark />
    <nav className="cw-desktop-nav" aria-label="Main navigation">{DISCOVERY_SECTIONS.map(s => <NavLink key={s.path} to={s.path}>{s.label}</NavLink>)}<NavLink to="/community" title="CalgaryWatch community: the original homepage">Community</NavLink><Link className="cw-live-link" to="/map">Live <span aria-hidden="true">↗</span></Link></nav>
    <div className="cw-header-actions"><Link to="/search" aria-label="Search CalgaryWatch"><Search size={20} /></Link><Link className="cw-account" to="/map?settings=alerts">Account</Link><button ref={menuButton} className="cw-menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="cw-mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'}>{open ? <X /> : <Menu />}</button></div>
  </div><nav id="cw-mobile-nav" className="cw-mobile-nav" hidden={!open} aria-label="Mobile navigation" onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); menuButton.current?.focus(); } }}>{DISCOVERY_SECTIONS.map(s => <NavLink key={s.path} to={s.path}>{s.label}</NavLink>)}<NavLink to="/community" title="CalgaryWatch community: the original homepage">Community</NavLink><Link to="/map">CalgaryWatch Live ↗</Link><Link to="/map?settings=alerts">Account & email preferences</Link></nav></header>;
}
export function SiteFooter() { return <footer className="cw-footer"><div className="cw-wrap"><div className="cw-footer-top"><div><Wordmark /><p>A little closer to your city.</p></div><a className="cw-text-link" href="mailto:aldo@calgarywatch.ca">Say hello <ArrowUpRight size={18} /></a></div><div className="cw-footer-bottom"><p>© {new Date().getFullYear()} CalgaryWatch · Free for residents.</p><nav aria-label="Footer"><NavLink to="/community" title="CalgaryWatch community: the original homepage">Community</NavLink><Link to="/about">About</Link><Link to="/coverage">Live coverage</Link><Link to="/privacy">Privacy</Link><Link to="/map?settings=alerts">Email preferences</Link></nav></div></div></footer>; }
export function SiteLayout({ children }: { children: ReactNode }) { return <div className="cw-site"><a className="cw-skip" href="#cw-main">Skip to content</a><SiteHeader /><main id="cw-main">{children}</main><SiteFooter /></div>; }
