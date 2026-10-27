import { entityPath } from '../../lib/discovery';
import { discoveryRepository } from '../../data/discovery';
import {approvedManagementOrganization as approvedOrganization} from '../../lib/claimOrganization';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, Store } from 'lucide-react';
import type { BusinessAccount } from '../../lib/businessAccount';
import type { Claim } from './Dashboard';
import { listingManagementPath } from '../../lib/listingPreview';
const formatSince = (at: number, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...options }).format(at);

/**
 * The organizer desk: a band right under the member's day board, because an
 * organizer opens this page to run their listings first. Each confirmed
 * organization shows what's live (upcoming events, the next one), and one
 * button to manage it. Claims still being checked say where they stand.
 * Approved means the organization confirmed it (the Verified badge shows on
 * the listing; see docs/verified-listings.md).
 */

const when = (iso: string) => formatSince(Date.parse(iso), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(':00', '');

export function BusinessListings({ claims, business, previewUid }: { claims: Claim[]; business?: BusinessAccount | null; previewUid?: string }) {
  if (!claims.length && !business) return null;
  const approved = claims.filter((c) => c.status === 'approved');
  const isBusiness = Boolean(business) || approved.length > 0;
  const inventory = discoveryRepository.list();
  const now = Date.now();
  const upcoming = (orgId: string) => inventory
    .filter((e): e is Extract<typeof e, { kind: 'event' }> => e.kind === 'event' && e.organizerEntityId === orgId && !e.cancelled && Date.parse(e.end) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const organizations = [...new Map(approved.map((c) => approvedOrganization(c, inventory)).filter(Boolean).map((o) => [o!.id, o!])).values()];
  const others = claims.filter((c) => c.status !== 'approved');
  const as = previewUid ? `?as=${encodeURIComponent(previewUid)}` : '';
  const state = (s: string) => (s === 'rejected' ? { label: 'Not confirmed', note: 'Reply to our email and we’ll take another look.' } : { label: 'Being confirmed', note: 'We check every claim by hand before the Verified badge shows.' });
  return (
    <section className="pd-biz" data-business={isBusiness} aria-labelledby="pd-biz">
      <div className="pd-biz-head">
        <p className="pd-kicker">{isBusiness ? <><BadgeCheck size={14} aria-hidden="true" /> Business account{business?.since ? ` · since ${formatSince(business.since, { month: 'short', year: 'numeric' })}` : ''}</> : <><Store size={14} aria-hidden="true" /> For organizers</>}</p>
        <h2 id="pd-biz">{isBusiness ? 'Organizer desk' : 'Your claim'}</h2>
        <p className="pd-biz-lede">{isBusiness ? 'Draft changes any time; profile, market and event updates publish together once every seven days.' : 'Once we confirm it, you can update the listing and add events from here.'}</p>
      </div>
      <div className="pd-biz-cards">
        {organizations.map((org) => {
          const list = upcoming(org.id);
          const next = list[0];
          const publicPath = org.sourceListingId ? (approved.find((c) => c.entityId === org.sourceListingId)?.entityPath ?? '/events') : entityPath(org);
          return (
            <article key={org.id} className="pd-biz-org">
              <span className="pd-biz-ok"><BadgeCheck size={14} aria-hidden="true" /> Verified {org.managementOnly ? 'organizer' : 'organization'}</span>
              <h3>{org.title}</h3>
              {org.managementOnly ? <p className="pd-biz-sub">Manage your listing and add events when needed.</p> : (
                <dl className="pd-biz-stats">
                  <div><dt>Upcoming</dt><dd>{list.length}</dd></div>
                  <div><dt>Next event</dt><dd>{next ? <Link to={entityPath(next)}><strong>{next.title}</strong><small>{when(next.start)}</small></Link> : <small>Nothing scheduled. Add one.</small>}</dd></div>
                </dl>
              )}
              <div className="pd-biz-acts">
                <Link className="pd-biz-btn" to={`/organization/${org.id}${as}`}>Manage {org.managementOnly ? 'listing' : 'organization & events'} <ArrowUpRight size={15} aria-hidden="true" /></Link>
                <Link className="pd-biz-btn" data-k="ghost" to={publicPath}>{org.managementOnly ? 'Public listing' : 'Public profile'}</Link>
              </div>
            </article>
          );
        })}
        {approved.filter((c) => !approvedOrganization(c, inventory)).map((c) => (
          <article key={c.entityId} className="pd-biz-org">
            <span className="pd-biz-ok"><BadgeCheck size={14} aria-hidden="true" /> Verified listing</span>
            <h3>{c.entityTitle}</h3>
            <p className="pd-biz-sub">This approval covers this listing. Contact CalgaryWatch to manage the whole organization.</p>
            <div className="pd-biz-acts">
              <Link to={listingManagementPath(c.entityId, previewUid)} className="pd-biz-btn">Manage listing <ArrowUpRight size={15} aria-hidden="true" /></Link>
              {c.entityPath ? <Link to={c.entityPath} className="pd-biz-btn" data-k="ghost">View listing</Link> : null}
              {!inventory.some((e) => e.id === c.entityId) && !c.entityId.startsWith('biz-') ? <Link to={`/organization/org-${encodeURIComponent(c.entityId)}${as}`} className="pd-biz-btn" data-k="ghost">Saved organizer workspace</Link> : null}
            </div>
          </article>
        ))}
        {others.length ? (
          <ul className="pd-biz-claims" aria-label="Claims">
            {others.map((c) => (
              <li key={c.entityId} data-status={c.status}>
                <Link to={listingManagementPath(c.entityId, previewUid)}>
                  <span className="pd-dot" data-cat={c.status === 'rejected' ? 'crime' : 'wait'} aria-hidden="true" />
                  <span><strong>{c.entityTitle}</strong><small>{state(c.status).label} · {state(c.status).note}</small></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {organizations.length ? (
        <details className="pd-biz-access">
          <summary>Approved listing access · {approved.length}</summary>
          <ul>
            {approved.map((c) => (
              <li key={c.entityId}>
                <strong>{c.entityTitle}</strong>
                <Link to={listingManagementPath(c.entityId, previewUid)}>Manage listing</Link>
                {c.entityPath ? <Link to={c.entityPath}>View</Link> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {organizations.length ? <p className="pd-biz-note">Images are managed by CalgaryWatch. Your own plans and emails stay separate from the organization.</p> : null}
    </section>
  );
}
