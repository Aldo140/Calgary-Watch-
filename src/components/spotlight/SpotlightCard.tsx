import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Spotlight } from '../../content/spotlights';
import type { DiscoveryEntity } from '../../types/discovery';
import { nightsLine, spotlightPath, trackSpotlightCard, trackSpotlightSeen, upcomingNights, type SpotlightPlacement } from '../../lib/spotlights';
import '../../styles/spotlight-card.css';

/**
 * The seasonal teaser for a CalgaryWatch Spotlight, used on the homepage, the
 * events hub and the related event pages. It always names the partnership. Logs one "seen" per tab and every tap.
 */
export function SpotlightCard({ spotlight: s, at, entities, compact = false }: {
  spotlight: Spotlight;
  at: Exclude<SpotlightPlacement, 'feature'>;
  entities: readonly DiscoveryEntity[];
  compact?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const nights = upcomingNights(s, entities);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { trackSpotlightSeen(s, at); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [s, at]);
  const [lead, rest] = s.title.split(': ');
  return (
    <aside ref={ref} className={`spc${compact ? ' is-compact' : ''}`} aria-labelledby={`spc-${at}`}>
      <Link to={spotlightPath(s)} className="spc-link" onClick={() => trackSpotlightCard(s, at)}>
        <span className="spc-beam" aria-hidden="true" />
        <span className="spc-grain" aria-hidden="true" />
        <span className="spc-sign" aria-hidden="true"><small>Now showing</small><b>{s.card.mark}</b><small>{s.name.replace(new RegExp(s.card.mark, 'i'), '').trim() || s.name}</small></span>
        <span className="spc-strip" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</span>
        <span className="spc-copy">
          <span className="spc-label"><b>CalgaryWatch Spotlight</b> <span>{s.partnerLabel}</span></span>
          <span className="spc-title" id={`spc-${at}`}>{lead}{rest ? <><span className="spc-colon">:</span> <em>{rest}</em></> : null}</span>
          {compact ? null : <span className="spc-dek">{s.dek}</span>}
          <span className="spc-foot">
            <span className="spc-nights">{nightsLine(nights)}</span>
            <span className="spc-cta">Read the spotlight <ArrowRight size={17} aria-hidden="true" /></span>
          </span>
        </span>
      </Link>
    </aside>
  );
}
