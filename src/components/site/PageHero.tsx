import { useEffect, type ReactNode } from 'react';
import { CityLights } from './CityLights';
import '../../styles/brand-page.css';

/**
 * The navy live-sky hero used by the site's standalone pages. Put the words
 * that matter in `<span>` inside `title` to set them on the yellow marker.
 * Without `aside` the copy runs a single, wider column.
 */
export function PageHero({ id, kicker, title, lead, ctas, facts, aside, city = true }: {
  id: string;
  kicker: string;
  title: ReactNode;
  lead?: ReactNode;
  ctas?: ReactNode;
  facts?: ReactNode;
  aside?: ReactNode;
  /** The night city behind the hero. On by default. */
  city?: boolean;
}) {
  useReveal();
  return (
    <section className={`bp-hero${aside ? '' : ' bp-hero-solo'}`} aria-labelledby={id}>
      {city ? <CityLights tags={!aside} /> : null}
      <div className="cw-wrap bp-hero-grid">
        <div>
          <p className="bp-kicker">{kicker}</p>
          <h1 id={id}>{title}</h1>
          {lead ? <p className="bp-lead">{lead}</p> : null}
          {ctas ? <div className="bp-ctas">{ctas}</div> : null}
          {facts ? <ul className="bp-facts">{facts}</ul> : null}
        </div>
        {aside ? <div className="bp-hero-aside">{aside}</div> : null}
      </div>
    </section>
  );
}

/**
 * Sections and cards on brand pages rise in as they scroll into view. Content
 * is only hidden once this has run (html.bp-reveal), so prerendered HTML and
 * reduced motion always show everything.
 */
function useReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const els = [...document.querySelectorAll<HTMLElement>('.bp .bp-section, .bp .bp-card, .bp .bp-banner')]
      .filter(el => el.getBoundingClientRect().top > window.innerHeight * 0.9);
    if (!els.length) return;
    els.forEach(el => el.classList.add('bp-rv'));
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
    return () => { io.disconnect(); els.forEach(el => el.classList.remove('bp-rv', 'is-in')); };
  }, []);
}
