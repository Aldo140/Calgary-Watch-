import { upcomingOccurrences } from '../../lib/discoveryCalendar';
import { EventArt, MarketArt, ShopArt } from '../discovery/ListingArt';
import { LOCAL_NOTES } from '../../data/localNotes';
import { Link } from 'react-router-dom';
import type { DiscoveryEntity, MarketOccurrence } from '../../types/discovery';
import { DiscoveryCard } from '../discovery/DiscoveryCards';
import { EventPanel } from './EventPanel';
import { ClaimCta, VerifiedMark } from './ClaimCta';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';

const checkedOn = (v: string) => { const t = Date.parse(v); return Number.isFinite(t) ? calgaryDateTimeFormat('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }).format(t) : v; };
export function SourceBadge({ entity }: { entity: DiscoveryEntity }) { return <aside className="cw-sources"><h2>Know the source</h2><p>{entity.verification === 'source-checked' ? 'Source checked' : entity.verification === 'source-feed' ? `Listed from ${entity.sources[0]?.name ?? 'the organizer'}` : 'Not yet verified'} · Last checked {checkedOn(entity.verifiedAt || entity.updatedAt)}</p>{entity.sources.map((source, i) => <a key={i} href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ↗</a>)}</aside>; }
export function EntityDetail({ entity, related, occurrences = [], all = [] }: { entity: DiscoveryEntity; related: DiscoveryEntity[]; occurrences?: readonly MarketOccurrence[]; all?: readonly DiscoveryEntity[] }) {
  const dates = entity.kind === 'market' ? upcomingOccurrences(occurrences, entity.id) : [];
  const next = dates.find(o => !o.cancelled);
  const format = (value: string) => calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', dateStyle: 'full', timeStyle: 'short' }).format(new Date(value));
  return <article className="cw-detail"><p className="cw-eyebrow">{entity.kind}{entity.developmentOnly ? ' · Illustrative preview' : ''}</p><h1>{entity.title}</h1>{['event', 'market', 'business'].includes(entity.kind) ? <VerifiedMark entityId={entity.id} /> : null}<p className="cw-lead">{entity.summary}</p>
    {entity.kind === 'event' && <EventPanel entity={entity} all={all} part="plan" />}
    {entity.kind === 'business'
      ? <><figure className="cw-detail-image-wrap cw-detail-art"><ShopArt id={entity.id} title={entity.title} tags={entity.tags} categories={entity.categories} /></figure>
        {LOCAL_NOTES[entity.id] ? <aside className="cw-detail-notes"><p className="cw-detail-pick">{entity.partner ? 'Featured partner' : LOCAL_NOTES[entity.id].pick}</p><p className="cw-detail-note">{LOCAL_NOTES[entity.id].note}</p><p className="cw-detail-dm">Don’t miss: {LOCAL_NOTES[entity.id].dontMiss.join(' · ')}</p></aside> : null}</>
      : entity.kind === 'market' || (entity.kind === 'event' && !/^https:\/\//.test(entity.image?.src ?? ''))
      ? <figure className="cw-detail-image-wrap cw-detail-art">{entity.kind === 'market' ? <MarketArt id={entity.id} title={entity.title} /> : <EventArt id={entity.id} title={entity.title} categories={entity.categories} />}</figure>
      : entity.image && <figure className="cw-detail-image-wrap"><img className="cw-detail-image" src={entity.image.src} alt={entity.image.alt} width="1200" height="677" />{entity.image.credit && <figcaption className="cw-image-credit">{entity.image.credit}</figcaption>}</figure>}
    {entity.kind === 'business' && entity.partner && <p className="cw-preview-note">Sponsored · {entity.sponsorshipDisclosure || 'Featured partner placement. Payment does not imply editorial selection.'}</p>}
    <p>{entity.description}</p>
    {'address' in entity && entity.kind !== 'event' && <p><strong>Location:</strong> {entity.address}</p>}
    {entity.kind === 'event' && <EventPanel entity={entity} all={all} part="more" />}
    {entity.kind === 'market' && <><h2>Plan your visit</h2><p>{entity.amenities.join(' · ')}</p><p><strong>Next:</strong> {next ? `${format(next.start)} to ${format(next.end)} (Calgary time)` : 'No upcoming dates confirmed.'}</p><h2>Upcoming dates</h2><ul>{dates.map(o => <li key={o.id}>{format(o.start)} to {format(o.end)} {o.cancelled ? 'Cancelled' : ''} - <a href={o.source.url}>Source</a></li>)}</ul>{entity.parking && <p><strong>Parking:</strong> {entity.parking}</p>}{entity.transit && <p><strong>Transit:</strong> {entity.transit}</p>}{entity.petFriendly !== undefined && <p>{entity.petFriendly ? 'Pet friendly' : 'Pets not permitted'}</p>}{entity.familyFriendly && <p>Family friendly</p>}</>}
    {entity.kind === 'guide' && <><h2>About this guide</h2><p>{entity.introduction}</p><h2>How we choose</h2><p>{entity.methodology}</p>{entity.sponsorshipDisclosure && <p>Sponsored: {entity.sponsorshipDisclosure}</p>}</>}
    <SourceBadge entity={entity} />
    {related.length > 0 && <section><h2>In this guide & nearby</h2><div className="cw-card-grid">{related.map(e => <DiscoveryCard key={e.id} entity={e} />)}</div></section>}
    {['event', 'market', 'business'].includes(entity.kind) ? <ClaimCta entityId={entity.id} title={entity.title} kind={entity.kind} /> : <p><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction: ${entity.title}`)}`}>Suggest a correction</a></p>}<Link to="/">Back to discovery</Link>
  </article>;
}
