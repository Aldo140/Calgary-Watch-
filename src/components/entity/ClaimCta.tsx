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
  if (verified) {
    return <p><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction: ${title}`)}`}>Suggest a correction</a></p>;
  }
  const what = kind === 'business' ? 'business' : kind === 'market' ? 'market' : 'event';
  return (
    <aside className="cl-cta">
      <p><strong>Is this your {what}?</strong> Claim it free to keep the dates, photos and links right yourself. {CLAIM_BENEFIT}</p>
      <Link to={`/claim/${encodeURIComponent(entityId)}`}>Claim this listing <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </aside>
  );
}
