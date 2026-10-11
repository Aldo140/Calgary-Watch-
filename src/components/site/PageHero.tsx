import type { ReactNode } from 'react';
import '../../styles/brand-page.css';

/**
 * The navy live-sky hero used by the site's standalone pages. Put the words
 * that matter in `<span>` inside `title` to set them on the yellow marker.
 * Without `aside` the copy runs a single, wider column.
 */
export function PageHero({ id, kicker, title, lead, ctas, facts, aside }: {
  id: string;
  kicker: string;
  title: ReactNode;
  lead?: ReactNode;
  ctas?: ReactNode;
  facts?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className={`bp-hero${aside ? '' : ' bp-hero-solo'}`} aria-labelledby={id}>
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
