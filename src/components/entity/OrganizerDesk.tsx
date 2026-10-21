import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, Check, Copy, Store } from 'lucide-react';
import type { DiscoveryEntity, Event, Market } from '../../types/discovery';
import { entityPath } from '../../lib/discovery';
import { useVerifiedListing } from '../../lib/claimsApi';
import { organizationClaimPath } from '../../lib/claimOrganization';
import { isOwnerVerified, VERIFICATION_PRIORITY_ENABLED } from '../../lib/verified';
import { CLAIM_BENEFIT } from './VerifiedBadge';
import '../../styles/claim.css';

/**
 * What a listing page does for the people who make it happen: vendors can
 * apply (markets), and the organizer can claim or manage the page and copy
 * its link for a bio. Styled by markets.css (.mk-desk-*).
 */
export function OrganizerDesk({ listing, all, name, organizer, vendorApply }: {
  listing: Market | Event; all: readonly DiscoveryEntity[]; name: string; organizer: string; vendorApply?: string;
}) {
  const [copied, setCopied] = useState(false);
  const verified = useVerifiedListing(listing.id, isOwnerVerified(listing));
  const claimPath = organizationClaimPath(listing, all);
  const path = entityPath(listing);
  const what = listing.kind === 'market' ? 'dates, hours and links' : 'dates, times and ticket links';
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`https://calgarywatch.ca${path}`); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* blocked */ }
  };
  return (
    <section className="mk-dsec mk-desk" data-reveal aria-labelledby="mk-desk-title">
      <header className="mk-sec-head"><h2 id="mk-desk-title"><span>{vendorApply ? 'Vendors & organizers' : 'Organizers'}</span></h2><p>Free on CalgaryWatch</p></header>
      <div className={`mk-desk-grid${vendorApply ? '' : ' is-solo'}`}>
        {vendorApply ? (
          <div className="mk-desk-card is-vendor">
            <p className="mk-desk-kicker"><Store size={15} aria-hidden="true" /> For vendors</p>
            <h3>Sell at {name}.</h3>
            <p>Send {organizer} your application in a couple of minutes. It goes straight to them.</p>
            <Link className="mk-btn mk-btn-sun" to={vendorApply}>Apply as a vendor <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
        ) : null}
        <div className={`mk-desk-card is-org${verified ? ' is-verified' : ''}`}>
          <div className="mk-desk-main">
            <p className="mk-desk-kicker"><BadgeCheck size={15} aria-hidden="true" /> {verified ? 'Verified organizer' : 'For the organizer'}</p>
            {verified ? <>
              <h3>This page is run by its organizer.</h3>
              <p>{organizer} claimed it and we confirmed them. The {what} come from their account.</p>
              <Link className="mk-btn" to={claimPath}>Manage or request access <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </> : <>
              <h3>Run {name}? Make this page yours.</h3>
              <ul className="mk-desk-perks">
                <li><Check size={16} aria-hidden="true" /> Keep {what} right yourself</li>
                <li><Check size={16} aria-hidden="true" /> A Verified mark beside your name</li>
                {VERIFICATION_PRIORITY_ENABLED ? <li><Check size={16} aria-hidden="true" /> More weight when we surface listings</li> : null}
              </ul>
              <p className="mk-desk-fine" title={CLAIM_BENEFIT}>Free. We check every claim by hand.</p>
              <Link className="mk-btn mk-btn-sun" to={claimPath} aria-label={`Claim this listing for ${organizer}`}>Claim this listing <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </>}
          </div>
          <div className="mk-desk-link">
            <span><small>Put it in your bio</small>calgarywatch.ca{path}</span>
            <button type="button" onClick={() => void copyLink()}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
