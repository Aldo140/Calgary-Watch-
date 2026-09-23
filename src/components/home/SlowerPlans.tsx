import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { Business, DiscoveryEntity, Guide } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';

/**
 * Guides and local places, deliberately type-led. Until listings carry their
 * own photography, a stock skyline beside a coffee shop's name says less than
 * the name does — so this section lets the words carry it.
 */
export function SlowerPlans({ entities }: { entities: readonly DiscoveryEntity[] }) {
  const guides = entities.filter((e): e is Guide => e.kind === 'guide').slice(0, 3);
  const places = entities.filter((e): e is Business => e.kind === 'business').slice(0, 4);
  if (!guides.length && !places.length) return null;

  return (
    <section className="h-slow" aria-labelledby="h-slow-title">
      <div className="h-slow-head">
        <p className="h-eyebrow">No ticket required</p>
        <h2 id="h-slow-title">For a slower day.</h2>
      </div>
      <div className="h-slow-grid">
        {guides.length ? (
          <div>
            <h3 className="h-slow-label">Guides <Link className="h-link" to="/guides">All guides <ArrowUpRight size={15} /></Link></h3>
            <ol className="h-guides">
              {guides.map((g, i) => (
                <li key={g.id}>
                  <Link to={entityPath(g)}>
                    <span className="h-guide-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      <strong>{g.title}</strong>
                      <span>{g.summary}</span>
                    </span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {places.length ? (
          <div>
            <h3 className="h-slow-label">Local places <Link className="h-link" to="/local">All local <ArrowUpRight size={15} /></Link></h3>
            <ul className="h-places">
              {places.map(p => (
                <li key={p.id}>
                  <Link to={entityPath(p)}>
                    <strong>{p.title}</strong>
                    <span>{p.summary}</span>
                    <small>{[p.neighbourhood, ...p.categories.slice(0, 2)].filter(Boolean).join(' · ')}{p.partner ? ' · Sponsored' : ''}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Describes the email that is actually sent (scripts/digest, Mondays), nothing more. */
export function MondayDigest() {
  return (
    <section className="h-digest" aria-labelledby="h-digest-title">
      <img src="/images/illustration/calgarywatch-brief-v1.webp" alt="" loading="lazy" width="1280" height="853" />
      <div>
        <p className="h-eyebrow">The Monday email</p>
        <h2 id="h-digest-title">What happened near home this week.</h2>
        <p>Each Monday morning, a short recap of public reports within a 15-minute walk, 3 km and 10 km of the place you choose. It’s free, and you can unsubscribe in one click.</p>
        <Link className="h-btn" to="/map?settings=alerts">Set up your email <ArrowUpRight size={18} /></Link>
      </div>
    </section>
  );
}
