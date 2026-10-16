import { entityPath } from '../../lib/discovery';
import { discoveryRepository } from '../../data/discovery';
import { approvedOrganization } from '../../lib/organizationWorkspace';
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
  const inventory=discoveryRepository.list();
  const upcomingByOrg=new Map<string,number>();
  for(const entity of inventory)if(entity.kind==='event'&&entity.organizerEntityId&&!entity.cancelled&&Date.parse(entity.end)>Date.now())upcomingByOrg.set(entity.organizerEntityId,(upcomingByOrg.get(entity.organizerEntityId)??0)+1);
  const organizations=[...new Map(approved.map(c=>approvedOrganization(c,discoveryRepository.list())).filter(Boolean).map(o=>[o!.id,o!])).values()];
  const others = claims.filter((c) => c.status !== 'approved');
  const state = (s: string) => (s === 'rejected' ? { label: 'Not confirmed', note: 'Reply to our email and we’ll take another look.' } : { label: 'Being confirmed', note: 'We check every claim by hand before the Verified badge shows.' });
  return (
    <section className="pd-card pd-biz" data-business={isBusiness} aria-labelledby="pd-biz">
      <p className="pd-kicker">{isBusiness ? <><BadgeCheck size={14} aria-hidden="true" /> Business account{business?.since ? ` · since ${formatSince(business.since, { month: 'short', year: 'numeric' })}` : ''}</> : <><Store size={14} aria-hidden="true" /> For organizers</>}</p>
      <h2 id="pd-biz">{organizations.length?'Your organization'+(organizations.length>1?'s':''):approved.length > 1 || (!approved.length && (business?.listings.length ?? 0) > 1) ? 'Your listings' : approved.length || business ? 'Your listing' : 'Your claim'}</h2>
      {organizations.map(org=><article key={org.id} className="pd-biz-organization"><span className="pd-biz-org-label"><BadgeCheck size={15} aria-hidden="true"/> Confirmed organization access</span><h3>{org.title}</h3><p><strong>{upcomingByOrg.get(org.id)??0}</strong> upcoming events · Profile and programme management</p><p>Build your next update as a draft. Publish all your profile, market and event changes together once every seven days.</p><div className="pd-biz-acts"><Link className="pd-biz-btn" to={`/organization/${org.id}${previewUid?`?as=${encodeURIComponent(previewUid)}`:''}`}>Manage organization &amp; events <ArrowUpRight size={15} aria-hidden="true"/></Link><Link className="pd-biz-btn" data-k="ghost" to={entityPath(org)}>Public profile</Link></div></article>)}
      {organizations.length?<p className="pd-biz-note">Images are managed by CalgaryWatch. Your personal plans and email preferences are separate from organization management.</p>:null}
      {approved.length?<details className="pd-biz-history" open={!organizations.length}><summary>Approved listing access · {approved.length}</summary><ul className="pd-biz-list">
        {approved.map((c) => (
          <li key={c.entityId} className="pd-biz-item" data-status="approved">
            <span className="pd-biz-title"><strong>{c.entityTitle}</strong><span className="pd-biz-ok"><BadgeCheck size={14} aria-hidden="true" /> Verified</span></span>
            {!approvedOrganization(c,discoveryRepository.list())?<small>This approval covers this listing. Contact CalgaryWatch to confirm management of the whole organization.</small>:null}
            <span className="pd-biz-acts">
              {c.entityPath ? <Link to={c.entityPath} className="pd-biz-btn">View listing <ArrowUpRight size={15} aria-hidden="true" /></Link> : null}
              <Link to={listingManagementPath(c.entityId, previewUid)} className="pd-biz-btn" data-k="ghost">Manage listing</Link>
            </span>
          </li>
        ))}
      </ul></details>:null}
      <ul className="pd-biz-list">
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
