import { BadgeCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * The "Verified" mark beside a listing's title: the organization claimed the
 * listing and an admin confirmed them (src/lib/verified.ts). Styled by
 * styles/claim.css, which the caller loads.
 */
export function VerifiedBadge({ organizer }: { organizer?: { title: string; to: string } }) {
  // An event or market is verified through its organizer, never on its own.
  if (organizer) return (
    <p className="cl-verified" title="The organizer claimed its CalgaryWatch profile and an admin confirmed them.">
      <BadgeCheck size={15} aria-hidden="true" /> <strong>Verified organizer</strong><Link className="cl-verified-by" to={organizer.to}>{organizer.title}</Link>
    </p>
  );
  return (
    <p className="cl-verified" title="This listing has been claimed and confirmed by the organization or an authorized representative.">
      <BadgeCheck size={15} aria-hidden="true" /> <strong>Verified</strong><span className="cl-verified-by">Confirmed by the organization</span>
    </p>
  );
}

/** What the claim invitation promises, word for word. Kept true by src/lib/verified.ts. */
export const CLAIM_BENEFIT = 'Verified listings are marked as verified and given more weight when we surface relevant listings across CalgaryWatch.';
