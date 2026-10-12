import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { GlobalSearch } from '../components/site/GlobalSearch';
import '../styles/not-found.css';

const POPULAR: Array<[string, string, string]> = [
  ['Events', '/events', 'What’s on, day by day'],
  ['Live map', '/map', 'Reports, traffic, outages'],
  ['Markets', '/markets', 'This week’s market days'],
  ['Community Watch', '/community', 'Safety from your neighbours'],
];

/**
 * The lost-link screen, on the original Community Watch collage: say what
 * happened, then get people moving with a search box and the four places
 * most of them were heading anyway. Also used for listings that moved.
 */
export function NotFoundHero({ code = '404 · Page not found', title = <>This page took a <span>wrong turn.</span></>, lead = 'The link may be old or mistyped. Search for it, or pick up where most people head next.', back }: {
  code?: string; title?: React.ReactNode; lead?: string; back?: { to: string; label: string };
}) {
  return (
    <section className="cw-404" aria-labelledby="cw-404-title">
      <picture className="cw-404-art" aria-hidden="true">
        <source media="(max-width: 700px)" srcSet="/images/hero/mobile-hero-calgary-collage.webp" />
        <img src="/images/hero/desktop-hero-calgary-collage.webp" alt="" />
      </picture>
      <div className="cw-wrap cw-404-inner">
        <p className="cw-404-code">{code}</p>
        <h1 id="cw-404-title">{title}</h1>
        <p className="cw-404-lead">{lead}</p>
        <div className="cw-404-search"><GlobalSearch /></div>
        {back ? <Link className="cw-404-back" to={back.to}>{back.label} <ArrowUpRight size={17} aria-hidden="true" /></Link> : null}
        <nav className="cw-404-links" aria-label="Popular pages">
          {POPULAR.map(([label, to, note]) => (
            <Link key={to} to={to}><strong>{label}</strong><small>{note}</small><ArrowUpRight size={18} aria-hidden="true" /></Link>
          ))}
        </nav>
      </div>
    </section>
  );
}

export default function NotFoundPage() {
  return <SiteLayout><NotFoundHero /></SiteLayout>;
}
