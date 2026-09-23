import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Calendar, MapPin, Tag } from 'lucide-react';
import type { DiscoveryEntity, EntityKind } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';

export function SectionHeading({ title, to, label = 'Explore all', eyebrow }: { title: string; to?: string; label?: string; eyebrow?: string }) {
  return <div className="cw-section-heading"><div>{eyebrow && <p className="cw-eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{to && <Link className="cw-text-link" to={to}>{label} <ArrowUpRight size={18} /></Link>}</div>;
}

export function DiscoveryCard({ entity }: { entity: DiscoveryEntity }) {
  const fallbackImage = entity.kind === 'market'
    ? '/images/illustration/calgarywatch-start-market-v1.webp'
    : entity.kind === 'event'
    ? '/images/illustration/calgarywatch-start-weekend-v1.webp'
    : entity.kind === 'guide'
    ? '/images/hero/calgarywatch-city-guide-v1.webp'
    : entity.kind === 'neighbourhood'
    ? '/images/photo/calgary1.webp'
    : '/images/photo/calgary2.webp';
  const imgSrc = entity.image?.src || fallbackImage;
  const imgAlt = entity.image?.alt || `${entity.title} in Calgary`;

  const eventDate = entity.kind === 'event' && entity.start ? new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(entity.start)) : null;

  const place = entity.kind === 'event' || entity.kind === 'market' || entity.kind === 'business'
    ? entity.neighbourhood || entity.venue || entity.address
    : entity.kind === 'neighbourhood'
    ? `${entity.quadrant} Calgary`
    : null;

  const priceTag = entity.kind === 'event'
    ? entity.pricing === 'free' ? 'Free Admission' : entity.pricing === 'paid' ? 'Tickets / Entry' : null
    : null;

  return (
    <article className={`cw-card cw-card-${entity.kind}`}>
      <Link to={entityPath(entity)}>
        <div className="cw-card-image">
          <img 
            src={imgSrc} 
            alt={imgAlt} 
            loading="lazy" 
            width="720" 
            height="480"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackImage; }}
          />
          {eventDate && (
            <span className="cw-card-date-badge">
              <Calendar size={11} aria-hidden="true" />
              <span>{eventDate}</span>
            </span>
          )}
          {priceTag && (
            <span className="cw-card-price-badge">
              <Tag size={11} aria-hidden="true" />
              <span>{priceTag}</span>
            </span>
          )}
        </div>
        <div className="cw-card-body">
          <div className="cw-card-meta-row">
            <span className="cw-eyebrow">
              {entity.developmentOnly ? 'Preview · ' : ''}
              {entity.categories[0] || entity.kind}
              {entity.kind === 'business' && entity.partner ? ' · Sponsored' : ''}
            </span>
            {place && (
              <span className="cw-card-place">
                <MapPin size={12} aria-hidden="true" />
                <span>{place}</span>
              </span>
            )}
          </div>
          <h3>
            <span>{entity.title}</span>
            <ArrowUpRight size={18} className="cw-card-arrow-icon" aria-hidden="true" />
          </h3>
          <p>{entity.summary}</p>
        </div>
      </Link>
    </article>
  );
}
export const EventCard = DiscoveryCard;
export const MarketCard = DiscoveryCard;
export const BusinessCard = DiscoveryCard;
export const GuideCard = DiscoveryCard;
export const NeighbourhoodCard = DiscoveryCard;
export function EditorialGrid({ children }: { children: ReactNode }) { return <div className="cw-editorial-grid">{children}</div>; }
export function EmptyInventory({ type, kind }: { type: string; kind?: EntityKind }) {
  const submittable = kind === 'event' || kind === 'market';
  return <div className="cw-empty"><h3>No matching {type} right now.</h3><p>Try another date or filter. Have something Calgary should know about?</p><Link className="cw-text-link" to={submittable ? `/submit?type=${kind}` : '/submit'}>Share a suggestion <ArrowUpRight size={18} /></Link></div>;
}
