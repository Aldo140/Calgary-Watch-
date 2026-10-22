import type {Business, DiscoveryEntity} from '../types/discovery';
import {publishedInventory} from './discoveryPublication';
import {organizerEvents, organizerMarkets} from './organizations';

/** Public catalogue relationships only: outreach leads and venue matches are not partners. */
export function organizationDirectory(entities: readonly DiscoveryEntity[], now = Date.now()) {
  return entities.filter((entity): entity is Business => entity.kind === 'business' && publishedInventory(entity, new Date(now)))
    .map(profile => ({profile, events: organizerEvents(profile.id, entities, now), markets: organizerMarkets(profile.id, entities, now)}))
    .sort((a, b) => a.profile.title.localeCompare(b.profile.title));
}
