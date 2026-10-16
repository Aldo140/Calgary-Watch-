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
  return verified ? <VerifiedBadge /> : null;
}

/** At the foot of a listing: the invitation to claim it, or a correction link once claimed. */
export function ClaimCta({ entityId, title, kind, verifiedAt }: { entityId: string; title: string; kind: string; verifiedAt?: string }) {
  const verified = useVerifiedListing(entityId, Boolean(verifiedAt));
  const exists = discoveryRepository.list().some(e => e.id === entityId && ['event', 'market', 'business'].includes(e.kind) && !e.developmentOnly);
  if (!exists) return null;
  if (verified) {
    return <aside className="cl-cta"><VerifiedBadge /><p><strong>Claimed by the organization.</strong> This listing is confirmed by its organization.</p><p><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction: ${title}`)}`}>Suggest a correction</a></p></aside>;
  }
  const what = kind === 'business' ? 'business' : kind === 'market' ? 'market' : 'event';
  return (
    <aside className="cl-cta">
      <p><strong>Is this your {what}?</strong> Claim it free to update dates, details and links yourself. One saved update every seven days per business; no admin approval needed. Images are managed by CalgaryWatch. {CLAIM_BENEFIT}</p>
      <Link to={`/claim/${encodeURIComponent(entityId)}`}>Claim this listing <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </aside>
  );
}
