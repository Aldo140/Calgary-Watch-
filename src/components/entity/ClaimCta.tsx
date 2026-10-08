import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck } from 'lucide-react';
import { useVerifiedListing } from '../../lib/claimsApi';
import '../../styles/claim.css';

/** Beside the title: shown once an organizer's claim is approved. */
export function VerifiedMark({ entityId }: { entityId: string }) {
  const verified = useVerifiedListing(entityId);
  return verified ? <p className="cl-verified"><BadgeCheck size={15} aria-hidden="true" /> Managed by the organizer</p> : null;
}

/** At the foot of a listing: the invitation to claim it, or a correction link once claimed. */
export function ClaimCta({ entityId, title, kind }: { entityId: string; title: string; kind: string }) {
  const verified = useVerifiedListing(entityId);
  if (verified) {
    return <p><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction: ${title}`)}`}>Suggest a correction</a></p>;
  }
  const what = kind === 'business' ? 'business' : kind === 'market' ? 'market' : 'event';
  return (
    <aside className="cl-cta">
      <p><strong>Is this your {what}?</strong> Claim it free to keep the dates, photos and links right yourself.</p>
      <Link to={`/claim/${encodeURIComponent(entityId)}`}>Claim this listing <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </aside>
  );
}
