import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import '../styles/not-found.css';

/** Unknown URLs. Keeps the original Community Watch collage, which now lives here. */
export default function NotFoundPage() {
  return (
    <SiteLayout>
      <section className="cw-404" aria-labelledby="cw-404-title">
        <picture className="cw-404-art" aria-hidden="true">
          <source media="(max-width: 700px)" srcSet="/images/hero/mobile-hero-calgary-collage.webp" />
          <img src="/images/hero/desktop-hero-calgary-collage.webp" alt="" />
        </picture>
        <div className="cw-wrap cw-404-inner">
          <p className="cw-404-code">404</p>
          <h1 id="cw-404-title">Page not found.</h1>
          <p>The link may be old or mistyped. Here’s where most people head next.</p>
          <nav className="cw-404-links" aria-label="Popular pages">
            <Link to="/">Home <ArrowUpRight size={16} /></Link>
            <Link to="/community">Community Watch <ArrowUpRight size={16} /></Link>
            <Link to="/map">Live safety map <ArrowUpRight size={16} /></Link>
            <Link to="/events">Events <ArrowUpRight size={16} /></Link>
          </nav>
        </div>
      </section>
    </SiteLayout>
  );
}
