import type { Business, DiscoveryEntity, EntityImage, Event, Market } from '../types/discovery';
import { publishedInventory } from './discoveryPublication';

/** Exact official provenance only. Venue names and fuzzy organizer names are never ownership. */
const ORGANIZATIONS = [
  {id:'biz-calgary-international-bluesfest',names:['Calgary International Bluesfest','Calgary Bluesfest','Calgary Blues Music Association','Calgary Blues Music Association (CBMA)'],hosts:['calgarybluesfest.com','calgarybluesfest.tickit.ca']},
  {id:'biz-inglewood-bia',names:['Inglewood BIA','Inglewood Business Improvement Area'],hosts:['inglewoodyyc.ca']},
  {id:'biz-dalhousie-community-association',names:['Dalhousie Community Association'],hosts:['dalhousiecalgary.ca']},
  { id: 'biz-alberta-theatre-projects', names: ['Alberta Theatre Projects'], hosts: ['albertatheatreprojects.com','werklundcentre.ca'] },
  { id:'biz-downstage',names:['Downstage'],hosts:['downstage.ca'] },
  { id: 'biz-theatre-calgary', names: ['Theatre Calgary'], hosts: ['theatrecalgary.com'] },
  { id: 'biz-alliance-francaise-calgary', names: ['Alliance Française de Calgary', 'Alliance Française Calgary', 'Alliance Francaise de Calgary'], hosts: ['afcalgary.ca'] },
  { id: 'biz-werklund-centre', names: ['Werklund Centre', 'Arts Commons'], hosts: ['werklundcentre.ca', 'artscommons.ca'] },
];
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Recomputed at export. Do not trust arbitrary incoming relationship IDs. */
export function associateOrganizers<T extends { id: string; kind: string; title?: unknown; organizer?: unknown; organizerEntityId?: unknown; sources?: unknown; status?: string }>(entities: readonly T[]): T[] {
  const profiles = entities.filter(e => e.kind === 'business' && e.status === 'published').map(e => {
    const known = ORGANIZATIONS.find(o => o.id === e.id);
    const sources = Array.isArray(e.sources) ? e.sources : [];
    return { id: e.id, names: known?.names ?? [String(e.title ?? '')], hosts: known?.hosts ?? sources.filter(s => s.kind === 'official').map(s => host(String(s.url ?? ''))).filter(Boolean) };
  });
  return entities.map(e => {
    if (e.kind !== 'event' && e.kind !== 'market') return e;
    const { organizerEntityId: _ignored, ...rest } = e;
    const sources = Array.isArray(e.sources) ? e.sources : [];
    const org = profiles.find(o => o.names.includes(String(e.organizer ?? '').trim())
      && sources.some(s => s.kind === 'official' && o.hosts.includes(host(String(s.url ?? '')))));
    return (org ? { ...rest, organizerEntityId: org.id } : rest) as T;
  });
}

export function organizerProfile(event: Event, all: readonly DiscoveryEntity[]): Business | undefined {
  return all.find((e): e is Business => e.kind === 'business' && e.id === event.organizerEntityId && publishedInventory(e));
}

/** Event artwork wins. A credited organizer poster is the fallback only when the event has none. */
export function eventArtwork(event: Event, all: readonly DiscoveryEntity[]): EntityImage | undefined {
  if (event.image) return event.image;
  const image = organizerProfile(event, all)?.image;
  return image?.presentation === 'poster' ? image : undefined;
}

/** CalgaryWatch-owned images stay same-origin in previews and production. */
export function listingImageSrc(image: EntityImage): string {
  return image.src.replace(/^https:\/\/(?:www\.)?calgarywatch\.ca(?=\/)/, '');
}

/** Relationship is presentation only; listing_claims still grants access per exact entity ID. */
export function organizerEvents(id: string, all: readonly DiscoveryEntity[], now = Date.now()): Event[] {
  return all.filter((e): e is Event => e.kind === 'event' && e.organizerEntityId === id && publishedInventory(e, new Date(now))
    && !e.cancelled && Number.isFinite(Date.parse(e.end)) && Date.parse(e.end) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** Market locations keep their own calendars; a shared organizer must not merge them. */
export function organizerMarkets(id: string, all: readonly DiscoveryEntity[], now = Date.now()): Market[] {
  return all.filter((e): e is Market => e.kind === 'market' && e.organizerEntityId === id && publishedInventory(e, new Date(now)))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Reviewed identities are shared by association and outreach, including legacy names. */
export function organizationIdentityForName(name:string){const normalize=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');const found=ORGANIZATIONS.find(o=>o.names.some(n=>normalize(n)===normalize(name)));return found?{...found,slug:found.id.replace(/^biz-/,'')}:undefined;}

/** A city-only organization address is not a visitor entrance. */
export function organizationVisitAddress(address: string): boolean {
  const value = address.trim();
  return Boolean(value && !/^calgary(?:,?\s+(?:ab|alberta))?(?:,?\s+canada)?\.?$/i.test(value));
}

/** Runs already in progress remain discoverable; no inferred organizer relationships. */
export function publicOrganizationEvents(events: readonly Event[], search: string, days: number, now: number): Event[] {
  const needle = search.normalize('NFKC').trim().toLocaleLowerCase('en-CA');
  const until = days ? now + days * 86_400_000 : Infinity;
  return events.filter(event => Date.parse(event.end) > now && Date.parse(event.start) < until
    && `${event.title} ${event.venue ?? ''} ${event.address}`.normalize('NFKC').toLocaleLowerCase('en-CA').includes(needle));
}
