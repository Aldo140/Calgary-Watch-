import { Link } from 'react-router-dom';
import type { DiscoveryEntity } from '../../types/discovery';
import { DiscoveryCard } from '../discovery/DiscoveryCards';

export function SourceBadge({ entity }: { entity: DiscoveryEntity }) { return <aside className="cw-sources"><h2>Know the source</h2><p>{entity.verification === 'source-checked' ? 'Source checked' : 'Not yet verified'} · Updated {entity.updatedAt}</p>{entity.sources.map((source, i) => <a key={i} href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ↗</a>)}</aside>; }
export function EntityDetail({ entity, related }: { entity: DiscoveryEntity; related: DiscoveryEntity[] }) {
  return <article className="cw-detail"><p className="cw-eyebrow">{entity.kind}{entity.developmentOnly ? ' · Illustrative preview' : ''}</p><h1>{entity.title}</h1><p className="cw-lead">{entity.summary}</p>
    {entity.image && <img className="cw-detail-image" src={entity.image.src} alt={entity.image.alt} width="1200" height="677" />}
    {entity.kind === 'business' && entity.partner && <p className="cw-preview-note">Sponsored · {entity.sponsorshipDisclosure || 'Featured partner placement. Payment does not imply editorial selection.'}</p>}
    <p>{entity.description}</p>
    {'address' in entity && <p><strong>Location:</strong> {entity.address}</p>}
    {entity.kind === 'event' && <><p><strong>When:</strong> {new Intl.DateTimeFormat('en-CA', { timeZone: entity.timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(entity.start))} (Calgary time)</p><p>{entity.cancelled ? 'Cancelled' : entity.pricing === 'free' ? 'Free admission' : 'Check organizer for price and availability'}</p>{entity.tickets && <a className="cw-button" href={entity.tickets}>Tickets from organizer ↗</a>}</>}
    {entity.kind === 'market' && <><h2>Plan your visit</h2><p>{entity.amenities.join(' · ')}</p><p>Check the organizer’s schedule for confirmed dates and cancellations.</p></>}
    {entity.kind === 'guide' && <><h2>About this guide</h2><p>{entity.introduction}</p><h2>How we choose</h2><p>{entity.methodology}</p>{entity.sponsorshipDisclosure && <p>Sponsored: {entity.sponsorshipDisclosure}</p>}</>}
    <SourceBadge entity={entity} />
    {related.length > 0 && <section><h2>In this guide & nearby</h2><div className="cw-card-grid">{related.map(e => <DiscoveryCard key={e.id} entity={e} />)}</div></section>}
    <p><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction or claim: ${entity.title}`)}`}>Suggest a correction{entity.kind === 'business' ? ' or request to claim this listing' : ''}</a></p><Link to="/">Back to discovery</Link>
  </article>;
}
