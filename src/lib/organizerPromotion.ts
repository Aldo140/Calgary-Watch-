import type { DiscoveryEntity } from '../types/discovery';
import { listingOrganization } from './claimOrganization';

/**
 * Verification belongs to the organizer, not to one event. An approved claim
 * for an event or market whose listing is linked (organizerEntityId, set at
 * export from an exact organizer name plus official domain) to a published
 * organization profile is promoted to manage that profile and its events.
 * Nothing is inferred from a venue or a loose name match.
 */
export type PromotionClaim = { uid: string; entityId: string; entityTitle?: string; status: string; approvedOrganizationId?: string };
export type PromotionRow = {
  claimId: string; uid: string; entityId: string; entityTitle: string;
  action: 'promote' | 'organization' | 'no-organizer' | 'missing-listing';
  organizationId?: string; organizationTitle?: string; organizer?: string;
};

export type ScopeReview = {
  recommendation: 'organization' | 'listing-only' | 'already-set';
  organizationId?: string;
  organizationTitle?: string;
  evidence: string[];
};

/**
 * Gives the admin a reviewable explanation for the access decision. The linked
 * organizer is already produced by associateOrganizers from an exact organizer
 * name and official source domain; this function never widens that evidence.
 */
export function reviewClaimScope(claim: PromotionClaim, entities: readonly DiscoveryEntity[]): ScopeReview {
  const listing = entities.find(entity => entity.id === claim.entityId);
  if (claim.approvedOrganizationId) {
    const organization = entities.find(entity => entity.kind === 'business' && entity.id === claim.approvedOrganizationId);
    if (listing && (listing.kind === 'event' || listing.kind === 'market')) {
      const canonical = listingOrganization(listing, entities);
      if (canonical && canonical.id !== claim.approvedOrganizationId) return {
        recommendation: 'organization', organizationId: canonical.id, organizationTitle: canonical.title,
        evidence: [`The recorded scope is ${organization?.title ?? claim.approvedOrganizationId}, but the reviewed listing now names ${listing.organizer}.`, 'The replacement matches the exact organizer name and official source domain.'],
      };
    }
    return { recommendation: 'already-set', organizationId: claim.approvedOrganizationId, organizationTitle: organization?.title, evidence: ['Organization access is already recorded on this claim.'] };
  }
  if (listing?.kind === 'business') return { recommendation: 'organization', organizationId: listing.id, organizationTitle: listing.title, evidence: ['The claimed listing is the organization profile itself.'] };
  if (!listing || (listing.kind !== 'event' && listing.kind !== 'market')) return { recommendation: 'listing-only', evidence: ['No published event or market is available to connect to an organization.'] };
  const organization = listingOrganization(listing, entities);
  if (!organization) return { recommendation: 'listing-only', evidence: ['No exact organizer link is published. Keep access to this listing until the official relationship is documented.'] };
  const official = listing.sources.find(source => source.kind === 'official');
  let officialHost = '';
  try { officialHost = official ? new URL(official.url).hostname.replace(/^www\./, '') : ''; } catch { /* invalid sources cannot become evidence */ }
  return {
    recommendation: 'organization', organizationId: organization.id, organizationTitle: organization.title,
    evidence: [
      `The listing names ${listing.organizer} as organizer.`,
      officialHost ? `Its official source is ${officialHost}.` : 'The listing has an official organizer source.',
      'The organizer profile matches both the exact organizer name and official source domain.',
    ],
  };
}

export function planOrganizerPromotions(claims: readonly PromotionClaim[], entities: readonly DiscoveryEntity[]): PromotionRow[] {
  return claims.filter(c => c.status === 'approved' && c.uid && c.entityId).map(c => {
    const base = { claimId: `${c.uid}_${c.entityId}`, uid: c.uid, entityId: c.entityId, entityTitle: c.entityTitle ?? c.entityId };
    const listing = entities.find(e => e.id === c.entityId);
    if (listing?.kind === 'business') {
      const id = c.approvedOrganizationId ?? c.entityId;
      return { ...base, action: 'organization' as const, organizationId: id, organizationTitle: entities.find(e => e.id === id)?.title };
    }
    if (!listing || (listing.kind !== 'event' && listing.kind !== 'market')) return { ...base, action: 'missing-listing' as const };
    const org = listingOrganization(listing, entities);
    // A corrected source relationship is authoritative over a stale historical
    // grant. This is still exact-name + official-domain evidence, never a fuzzy
    // reassignment, and approveOrganizationClaim records the access change.
    if (c.approvedOrganizationId && org?.id !== c.approvedOrganizationId) {
      if (org) return { ...base, action: 'promote' as const, organizationId: org.id, organizationTitle: org.title, organizer: listing.organizer };
      return { ...base, action: 'organization' as const, organizationId: c.approvedOrganizationId, organizationTitle: entities.find(e => e.id === c.approvedOrganizationId)?.title };
    }
    if (c.approvedOrganizationId) return { ...base, action: 'organization' as const, organizationId: c.approvedOrganizationId, organizationTitle: entities.find(e => e.id === c.approvedOrganizationId)?.title };
    if (!org) return { ...base, action: 'no-organizer' as const, organizer: listing.organizer || undefined };
    return { ...base, action: 'promote' as const, organizationId: org.id, organizationTitle: org.title, organizer: listing.organizer };
  });
}

/**
 * One promotion per source listing: approving it with shared access also moves
 * every other approved representative of that listing.
 */
export function promotionTargets(rows: readonly PromotionRow[]): PromotionRow[] {
  const seen = new Set<string>();
  return rows.filter(r => r.action === 'promote' && !seen.has(r.entityId) && Boolean(seen.add(r.entityId)));
}

/** The admin's default when approving: the listing's linked organizer, if it has one. */
export function defaultOrganizationScope(entityId: string, entities: readonly DiscoveryEntity[]): string | undefined {
  const listing = entities.find(e => e.id === entityId);
  if (!listing || (listing.kind !== 'event' && listing.kind !== 'market')) return;
  return listingOrganization(listing, entities)?.id;
}
