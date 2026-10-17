import {claimOrganization,listingOrganization,organizationClaimPath} from '../../lib/claimOrganization';
import { discoveryRepository } from '../../data/discovery';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useVerifiedListing } from '../../lib/claimsApi';
import { CLAIM_BENEFIT, VerifiedBadge } from './VerifiedBadge';
import '../../styles/claim.css';

/**
 * Beside the title: shown once an admin approved the organization's claim.
 * `verifiedAt` is the build's stamp (src/lib/verified.ts); the public mark is
 * read too, so a claim approved since the last build shows straight away.
 */
export function VerifiedMark({ entityId, verifiedAt }: { entityId: string; verifiedAt?: string }) {
  const verified = useVerifiedListing(entityId, Boolean(verifiedAt));
  if (!verified) return null;
  const all = discoveryRepository.list(), listing = all.find(e => e.id === entityId);
  const organizer = listing && listing.kind !== 'business' ? listingOrganization(listing, all) : undefined;
  return <VerifiedBadge organizer={organizer ? { title: organizer.title, to: `/local/${organizer.slug}` } : undefined} />;
}

/** At the foot of a listing: the invitation to claim it, or a correction link once claimed. */
export function ClaimCta({ entityId, title, kind, verifiedAt }: { entityId: string; title: string; kind: string; verifiedAt?: string }) {
  const verified = useVerifiedListing(entityId, Boolean(verifiedAt));
  const exists = discoveryRepository.list().some(e => e.id === entityId && ['event', 'market', 'business'].includes(e.kind) && !e.developmentOnly);
  if (!exists) return null;
  const listing=discoveryRepository.list().find(e=>e.id===entityId)!;
  if (verified) {
    return <aside className="cl-cta"><VerifiedBadge /><p><strong>Claimed by the organization.</strong> This listing is confirmed by its organization.</p><p><Link to={organizationClaimPath(listing,discoveryRepository.list())}>Manage or request access</Link></p><p><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction: ${title}`)}`}>Suggest a correction</a></p></aside>;
  }
  const organization=claimOrganization(listing,discoveryRepository.list());
  const what = kind === 'business' ? 'business' : kind === 'market' ? 'market' : 'event';
  const name = organization?.profile.title || title;
  return (
    <aside className="cl-cta cl-cta-open">
      <div className="cl-cta-copy">
        <p className="cl-cta-title"><strong>Is this your {what}?</strong></p>
        <p>Claim {name} free to keep its dates, hours and links right yourself. We check every claim by hand. {CLAIM_BENEFIT}</p>
      </div>
      <Link to={organizationClaimPath(listing,discoveryRepository.list())} aria-label={`Claim this listing for ${name}`}>Claim this listing <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </aside>
  );
}
