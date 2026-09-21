import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { DiscoveryEntity } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';

export function SectionHeading({ title, to, label = 'Explore all', eyebrow }: { title: string; to?: string; label?: string; eyebrow?: string }) {
  return <div className="cw-section-heading"><div>{eyebrow && <p className="cw-eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{to && <Link className="cw-text-link" to={to}>{label} <ArrowUpRight size={18} /></Link>}</div>;
}
export function DiscoveryCard({ entity }: { entity: DiscoveryEntity }) { return <article className="cw-card"><Link to={entityPath(entity)}>
  {entity.image && <div className="cw-card-image"><img src={entity.image.src} alt={entity.image.alt} loading="lazy" width="720" height="480" /></div>}
  <p className="cw-eyebrow">{entity.developmentOnly ? 'Preview · ' : ''}{entity.categories[0] || entity.kind}{entity.kind === 'business' && entity.partner ? ' · Sponsored' : ''}</p>
  <h3>{entity.title} <ArrowUpRight size={20} aria-hidden="true" /></h3><p>{entity.summary}</p>
</Link></article>; }
export const EventCard = DiscoveryCard;
export const MarketCard = DiscoveryCard;
export const BusinessCard = DiscoveryCard;
export const GuideCard = DiscoveryCard;
export const NeighbourhoodCard = DiscoveryCard;
export function EditorialGrid({ children }: { children: ReactNode }) { return <div className="cw-editorial-grid">{children}</div>; }
export function EmptyInventory({ type }: { type: string }) { return <div className="cw-empty"><h3>No matching {type} right now.</h3><p>Try another date or filter. Have something Calgary should know about?</p><Link className="cw-text-link" to="/submit">Share a suggestion <ArrowUpRight size={18} /></Link></div>; }
