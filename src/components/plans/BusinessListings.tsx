import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, Store } from 'lucide-react';
import type { BusinessAccount } from '../../lib/businessAccount';
import type { Claim } from './Dashboard';
import { listingManagementPath } from '../../lib/listingPreview';
const formatSince = (at: number, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...options }).format(at);

/**
 * Business account: listings this member manages. Approved means the
 * organization confirmed it (the Verified badge shows on the listing);
 * anything else is honest about where the claim stands. Account features
 * for businesses build on this card.
 */

export function BusinessListings({ claims, business, previewUid }: { claims: Claim[]; business?: BusinessAccount | null; previewUid?: string }) {
  if (!claims.length && !business) return null;
  const approved = claims.filter((c) => c.status === 'approved');
  const isBusiness = Boolean(business) || approved.length > 0;
  const others = claims.filter((c) => c.status !== 'approved');
  const state = (s: string) => (s === 'rejected' ? { label: 'Not confirmed', note: 'Reply to our email and we’ll take another look.' } : { label: 'Being confirmed', note: 'We check every claim by hand before the Verified badge shows.' });
  return (
    <section className="pd-card pd-biz" data-business={isBusiness} aria-labelledby="pd-biz">
      <p className="pd-kicker">{isBusiness ? <><BadgeCheck size={14} aria-hidden="true" /> Business account{business?.since ? ` · since ${formatSince(business.since, { month: 'short', year: 'numeric' })}` : ''}</> : <><Store size={14} aria-hidden="true" /> For organizers</>}</p>
      <h2 id="pd-biz">{approved.length > 1 || (!approved.length && (business?.listings.length ?? 0) > 1) ? 'Your listings' : approved.length || business ? 'Your listing' : 'Your claim'}</h2>
      <ul className="pd-biz-list">
        {approved.map((c) => (
          <li key={c.entityId} className="pd-biz-item" data-status="approved">
            <span className="pd-biz-title"><strong>{c.entityTitle}</strong><span className="pd-biz-ok"><BadgeCheck size={14} aria-hidden="true" /> Verified</span></span>
            <span className="pd-biz-acts">
              {c.entityPath ? <Link to={c.entityPath} className="pd-biz-btn">View listing <ArrowUpRight size={15} aria-hidden="true" /></Link> : null}
              <Link to={listingManagementPath(c.entityId, previewUid)} className="pd-biz-btn" data-k="ghost">Send a change</Link>
            </span>
          </li>
        ))}
        {others.map((c) => (
          <li key={c.entityId} className="pd-biz-item" data-status={c.status}>
            <Link to={listingManagementPath(c.entityId, previewUid)} className="pd-biz-row">
              <span className="pd-dot" data-cat={c.status === 'rejected' ? 'crime' : 'wait'} aria-hidden="true" />
              <span><strong>{c.entityTitle}</strong><small>{state(c.status).label} · {state(c.status).note}</small></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
