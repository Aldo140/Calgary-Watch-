import { BadgeCheck } from 'lucide-react';

/**
 * The "Verified" mark beside a listing's title: the organization claimed the
 * listing and an admin confirmed them (src/lib/verified.ts). Styled by
 * styles/claim.css, which the caller loads.
 */
export function VerifiedBadge() {
  return (
    <p className="cl-verified" title="This listing has been claimed and confirmed by the organization or an authorized representative.">
      <BadgeCheck size={15} aria-hidden="true" /> <strong>Verified</strong><span className="cl-verified-by">Confirmed by the organization</span>
    </p>
  );
}

/** What the claim invitation promises, word for word. Kept true by src/lib/verified.ts. */
export const CLAIM_BENEFIT = 'Verified listings are marked as verified and given more weight when we surface relevant listings across CalgaryWatch.';
