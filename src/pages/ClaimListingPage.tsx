import { claimPresentation } from '../lib/claimPresentation';
import {claimOrganization,approvedManagementOrganization,standaloneOrganization} from '../lib/claimOrganization';
import {AdminAccessBar} from '../components/admin/AdminAccessBar';
import {useAdminEditMode} from '../hooks/useAdminEditMode';
import { approvedOrganization } from '../lib/organizationWorkspace';
import { ListingManagement } from '../components/entity/ListingManagement';
import { restoreClaimDraft } from '../lib/claimDraft';
import { useVerifiedListing } from '../lib/claimsApi';
import { VerifiedBadge } from '../components/entity/VerifiedBadge';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, BadgeCheck, CalendarClock, CalendarDays, Check, Clock, ImagePlus, Link2, Lock, MapPinned, ShieldCheck, Store, Theater, Music, Palette, Building2, UtensilsCrossed, Users } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useAuth } from '../components/FirebaseProvider';
import { discoveryRepository } from '../data/discovery';
import { entityPath } from '../lib/discovery';
import { CLAIM_ROLES, claimEvidence, claimProblem, claimTimeline, emailDomain, sourceDomains, type ClaimDraft } from '../lib/claims';
import { submitClaim, useMyClaims, useClaimLoadError } from '../lib/claimsApi';
import { auth } from '../firebase';
import { EASE_OUT } from '../components/plans/Motion';
import '../styles/plans.css';
import '../styles/claim.css';
import '../styles/hq.css';

const PERKS = [
  { icon: CalendarClock, title: 'Dates and hours', body: 'New run dates, holiday hours, a show that moved.' },
  { icon: ImagePlus, title: 'Images stay with CalgaryWatch', body: 'Image changes and removals are handled by email.' },
  { icon: MapPinned, title: 'Addresses and locations', body: 'Fix a venue, or add a second branch.' },
  { icon: Link2, title: 'The link we send people to', body: 'Homepage, tickets or your season page.' },
];

/**
 * Anyone can request a claim with a new or existing Google account.
 * Admin management is an explicit preview, separate from a personal claim.
 * Approval is still required before organization editing is granted.
 */
export default function ClaimListingPage() {
  const { id = '' } = useParams();
  return <ClaimForm key={id} id={id} />;
}

function ClaimForm({ id }: { id: string }) {
  const { user, signIn, isFirebaseConfigured, isAdmin } = useAuth();
  const [params] = useSearchParams();
  const previewUid = isAdmin ? params.get('as')?.trim() || undefined : undefined;
  const adminView = isAdmin && (!!previewUid || params.get('view') === 'admin');
  const claimParams = new URLSearchParams(params);
  claimParams.delete('as');
  claimParams.delete('view');
  const claimViewUrl = `/claim/${encodeURIComponent(id)}${claimParams.size ? `?${claimParams}` : ''}`;
  const adminParams = new URLSearchParams(claimParams);
  adminParams.set('view', 'admin');
  const adminViewUrl = `/claim/${encodeURIComponent(id)}?${adminParams}`;
  const subjectUid = previewUid ?? user?.uid;
  const adminMode=useAdminEditMode(adminView,`${user?.uid}:${subjectUid}:${id}`);
  const reduce = useReducedMotion();
  const claims = useMyClaims(subjectUid);
  const claimLoadError = useClaimLoadError(subjectUid);
  const listing = useMemo(() => {
    const inventory=discoveryRepository.list();
    const context=inventory.find(e=>e.id===params.get('listing'));
    return context&&claimOrganization(context,inventory)?.claimEntity.id===id?context:inventory.find(e=>e.id===id&&!e.developmentOnly&&['event','market','business'].includes(e.kind));
  },[id,params]);
  const proposed=listing?claimOrganization(listing,discoveryRepository.list()):undefined;
  const legacyClaim=claims?.find(c=>c.entityId===id);
  const canonicalClaim=claims?.find(c=>c.entityId===proposed?.claimEntity.id||c.status==='approved'&&c.approvedOrganizationId===proposed?.claimEntity.id);
  const entity=legacyClaim&&!canonicalClaim?listing:proposed?.claimEntity??listing;
  const organization=entity?.id===proposed?.claimEntity.id?proposed:entity?claimOrganization(entity,discoveryRepository.list()):undefined;

  const parentClaim = (entity?.kind === 'event'||entity?.kind==='market') ? claims?.find(c => c.status === 'approved' && c.entityId === entity.organizerEntityId) : undefined;
  const claim = parentClaim ?? claims?.find((c) => (c.entityId === entity?.id||c.status==='approved'&&c.approvedOrganizationId===entity?.id)) ?? null;
  const management=(claim?approvedManagementOrganization(claim,discoveryRepository.list()):undefined)??(adminView&&entity?claimOrganization(entity,discoveryRepository.list())?.profile:undefined);
  const profile=management??(legacyClaim&&entity&&(entity.kind==='event'||entity.kind==='market')?standaloneOrganization(entity):organization?.profile);
  const sites = entity ? sourceDomains(entity.sources) : [];
  const [draft, setDraft] = useState<ClaimDraft>(() => { try { return restoreClaimDraft(sessionStorage.getItem(`claim-draft:${id}`)); } catch { return restoreClaimDraft(null); } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const verifiedListing = useVerifiedListing(id, Boolean(entity?.ownerVerifiedAt));
  useEffect(() => { try { sessionStorage.setItem(`claim-draft:${id}`, JSON.stringify(draft)); } catch { /* storage is optional */ } }, [id, draft]);

  useEffect(() => { document.title = entity ? `Claim ${entity.title} | CalgaryWatch` : 'Claim a listing | CalgaryWatch'; }, [entity]);
  // Prefill from the Google account once signed in, without overwriting typing.
  useEffect(() => {
    if (!user) return;
    setDraft((d) => ({ ...d, name: d.name || user.displayName || '', workEmail: d.workEmail || user.email || '' }));
  }, [user]);

  const evidence = entity ? claimEvidence({ accountEmail: user?.email ?? '', workEmail: draft.workEmail, sources: entity.sources }) : 'no-source';
  const workDomain = emailDomain(draft.workEmail);
  const domainMatch = !!workDomain && sites.some((s) => workDomain === s || workDomain.endsWith(`.${s}`));

  const send = async () => {
    if (!entity || previewUid || adminView || busy) return;
    const current = auth?.currentUser;
    if (current && (!claims || claimLoadError)) {
      setError('Wait until we can check your existing claims, then try again. Your form is still here.');
      return;
    }
    const problem = claimProblem(draft);
    if (problem) { setError(problem); return; }
    if (!current) { pending.current = true; await signIn(); if (!auth?.currentUser) pending.current = false; return; }
    setBusy(true); setError('');
    try {
      await submitClaim(current, { id: entity.id, title: entity.title, path: entityPath(entity) }, draft);
      try { sessionStorage.removeItem(`claim-draft:${id}`); } catch { /* optional storage */ }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('That didn’t send. If you already claimed this listing, refresh the page; otherwise try again in a moment.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!previewUid && pending.current && user && claims) { pending.current = false; if (!claim) void send(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, claims]);

  if (!entity) {
    return (
      <SiteLayout>
        <div className="cw-wrap cl-page">
          <h1 className="cl-title">We couldn’t find that listing.</h1>
          <p className="cl-lead">Open your listing on CalgaryWatch and use its “Claim this listing” link, or <a href="mailto:aldo@calgarywatch.ca">email us</a>.</p>
          <Link className="pl-btn" to="/events">Browse listings <ArrowUpRight size={18} aria-hidden="true" /></Link>
        </div>
      </SiteLayout>
    );
  }

  const presentation = claimPresentation(listing ?? entity, profile);
  const CategoryIcon = { market: Store, stage: Theater, music: Music, arts: Palette, food: UtensilsCrossed, community: Users, business: Building2, event: CalendarDays }[presentation.key];
  const benefits = PERKS.map(perk => perk.icon === CalendarClock ? { ...perk, title: presentation.dates } : perk.icon === Link2 ? { ...perk, title: presentation.link } : perk);
  const rise = (i: number) => ({ initial: reduce ? false : { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: EASE_OUT, delay: 0.05 + i * 0.07 } });

  return (
    <SiteLayout>
      <div className="cw-plans cl-page" data-category={presentation.key}>
        {isAdmin ? <div className="cw-wrap">
          {adminView ? <>
            <AdminAccessBar enabled={adminMode.enabled} onChange={adminMode.setEnabled} subject={entity.title}/>
            <p className="pl-fine">This is administrator access, not a claim application. <Link to={claimViewUrl}>Open the normal claim page with my account</Link>.</p>
          </> : <p className="pl-fine">You’re viewing the same claim page organizers use. Your administrator role does not claim this organization. <Link to={adminViewUrl}>Open admin management</Link>.</p>}
        </div> : null}
        <header className="cw-wrap cl-head">
          <div className="cl-hero-copy">
          <motion.p className="pl-eyebrow" {...rise(0)}><CategoryIcon size={17} aria-hidden="true" /> {presentation.label} · free</motion.p>
          <motion.h1 className="cl-title" {...rise(1)}>{claim?.status==='approved'||adminView?<>Manage <em>{entity.title}.</em></>:<>Claim <em>{profile?.title??entity.title}.</em></>}</motion.h1>
          <motion.p className="cl-lead" {...rise(2)}><strong>{presentation.intro}</strong> {presentation.detail}</motion.p>
          <ul className="cl-assurances" aria-label="Free organizer access"><li><Check size={15} aria-hidden="true" />Free organization account</li><li><Check size={15} aria-hidden="true" />No neighbourhood required</li><li><ShieldCheck size={15} aria-hidden="true" />Authority checked before editing</li></ul>
          </div>
          <div className="cl-hero-stamp" aria-hidden="true"><span className="cl-stamp-icon"><CategoryIcon size={58} strokeWidth={1.6} /></span><span>Made for</span><strong>{profile?.title ?? entity.title}</strong><small>Your organization. One workspace.</small></div>
          <motion.ol className="cl-steps" aria-label="How claiming works" {...rise(3)}>
            <li data-done={!!user}><span>{user ? <Check size={14} strokeWidth={3} /> : 1}</span> Sign in with Google</li>
            <li data-done={!!claim}><span>{claim ? <Check size={14} strokeWidth={3} /> : 2}</span> Tell us who you are</li>
            <li data-done={claim?.status === 'approved'}><span>{claim?.status === 'approved' ? <Check size={14} strokeWidth={3} /> : 3}</span> We confirm, then it’s yours</li>
          </motion.ol>
        </header>

        <div className="cw-wrap cl-grid">
          <div className="cl-main">
            {claimLoadError ? <div role="alert" className="pl-error"><p>We couldn’t check existing claims. Your form is still here; this does not mean your account cannot claim this organization.</p><button type="button" className="pl-btn" onClick={() => window.location.reload()}>Reload and try again</button></div> : null}
            {!claim&&!adminView ? <p className="cl-account-note">{user ? 'Already signed in? Use this account to request access—no new account or paid plan is needed.' : 'New here? Google sign-in creates your free account. Already have an account? Sign in with it and continue here.'} You can apply with a personal or work Google account; we confirm your authority before enabling changes.</p> : null}
            {!claim&&!adminView&&profile?<section className="cl-context" aria-label="Prefilled organization profile"><p className="pl-kicker">Your prefilled organization profile</p><h2>{profile.title}</h2>{listing&&listing.id!==entity.id?<p>For your listing: <Link to={entityPath(listing)}>{listing.title}</Link></p>:null}<p>{profile.managementOnly?'Your management workspace starts with this listing. You can add events after approval, without creating a separate public company page.':'Manage this organization profile and its confirmed linked events after approval.'}</p>{profile.website?<a href={profile.website} target="_blank" rel="noopener noreferrer">Organization source ↗</a>:null}{profile.address?<p>{profile.address}</p>:null}<p>We confirm your authority before enabling edits. Existing unrelated listings are never added to your account automatically.</p></section>:null}
            {previewUid && !claims ? <p role="status">Loading this member’s claims…</p> : claim?.status === 'approved'||adminView ? (
              <>
                {entity.kind === 'market' ? (
                  <Link to={previewUid ? `/organizer/${encodeURIComponent(entity.id)}?as=${encodeURIComponent(previewUid)}` : `/organizer/${encodeURIComponent(entity.id)}`} className="hq-open">
                    <span><strong>Open Market HQ</strong><small>Vendors, weekly lineups, applications and vendor emails.</small></span>
                    <ArrowUpRight size={20} aria-hidden="true" />
                  </Link>
                ) : null}
                <p className="cl-business"><BadgeCheck size={16} aria-hidden="true" /> <span><strong>{adminView?'Administrator listing access.':'Your account is a business account.'}</strong> {adminView?'This preview does not change ownership or approval. Open the selected account’s':'It manages this listing; you’ll see it on your'} <Link to={previewUid ? `/plans?as=${encodeURIComponent(previewUid)}` : "/plans"}>dashboard</Link>.</span></p>
                {management?<Link className="pl-btn" to={`/organization/${management.id}${previewUid?`?as=${encodeURIComponent(previewUid)}`:''}`}>{management.managementOnly?'Manage organizer workspace & events':'Manage organization profile & all events'}</Link>:<ListingManagement key={`${id}:${adminMode.enabled}`} claim={claim??{entityId:entity.id,entityTitle:entity.title}} previewUid={previewUid} initialTargetId={entity.id} adminEdit={adminMode.enabled} />}
              </>
            ) : claim?.status === 'pending' ? (
              <motion.section className="cl-status" data-state="pending" {...rise(4)}>
                <Clock size={22} aria-hidden="true" />
                <div>
                  <h2>We’re confirming your claim.</h2>
                  <p>{claimTimeline(claimEvidence({ accountEmail: claim.accountEmail, workEmail: claim.workEmail, sources: entity.sources }))}</p>
                  <p className="pl-fine">Sent {new Date(claim.createdAt).toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })} as {claim.role.toLowerCase()} · {claim.workEmail}</p>
                </div>
              </motion.section>
            ) : claim?.status === 'rejected' ? (
              <section className="cl-status" data-state="rejected">
                <ShieldCheck size={22} aria-hidden="true" />
                <div>
                  <h2>We couldn’t confirm this claim.</h2>
                  <p>{claim.reviewNote || 'We weren’t able to match you to the organization.'} Email <a href="mailto:aldo@calgarywatch.ca">aldo@calgarywatch.ca</a> from your organization’s address and we’ll sort it out.</p>
                </div>
              </section>
            ) : previewUid ? <p>This member has not claimed this listing.</p> : (
              <motion.form aria-label="Organization claim application" className="pl-form cl-form" onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate {...rise(4)}>
                <div className="cl-form-intro"><p className="pl-kicker">Your organization access</p><h2>Let’s make the introduction.</h2><p>A few details help us confirm you’re the right person. Personal and work Google accounts are welcome.</p></div>
                <>{verifiedListing?<p role="status"><VerifiedBadge /> This organization is already claimed. You can request access as another representative; existing managers keep their access while we review your request.</p>:null}</>
                <fieldset className="pl-step">
                  <legend><span className="pl-num">01</span> Who are you?</legend>
                  <label className="pl-field"><span>Your name</span><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoComplete="name" /></label>
                  <div className="cl-roles" role="radiogroup" aria-label="Your role">
                    {CLAIM_ROLES.map((r) => (
                      <label key={r} className="cl-role" data-selected={draft.role === r}>
                        <input type="radio" name="claim-role" value={r} checked={draft.role === r} onChange={() => setDraft((d) => ({ ...d, role: r }))} /><strong>{r}</strong>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="pl-step">
                  <legend><span className="pl-num">02</span> How do we reach you?</legend>
                  <label className="pl-field">
                    <span>Contact email <small>{sites[0] ? `@${sites[0]} is helpful, but not required` : 'Personal or work email'}</small></span>
                    <input type="email" value={draft.workEmail} onChange={(e) => setDraft((d) => ({ ...d, workEmail: e.target.value }))} autoComplete="email" placeholder={sites[0] ? `you@${sites[0]}` : 'you@yourorganization.ca'} />
                  </label>
                  {workDomain ? (
                    <p className="cl-match" data-ok={domainMatch}>
                      {domainMatch ? <><BadgeCheck size={15} aria-hidden="true" /> Matches {sites.find((s) => workDomain.endsWith(s))}, the site this listing is built from.</> : <>Doesn’t match {sites.length ? sites.join(' or ') : 'a published site'}. That’s fine for agencies and volunteers; we’ll confirm another way.</>}
                    </p>
                  ) : null}
                  <label className="pl-field"><span>Phone <small>(optional, for a quick confirm)</small></span><input type="tel" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} autoComplete="tel" /></label>
                  <label className="pl-field"><span>Anything to fix right away? <small>(optional)</small></span><textarea className="cl-textarea" rows={3} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder={presentation.placeholder} /></label>
                  <label className="pl-check">
                    <input type="checkbox" checked={draft.agree} onChange={(e) => setDraft((d) => ({ ...d, agree: e.target.checked }))} />
                    <span><strong>I’m allowed to manage this listing</strong> for {profile?.title??entity.title}. CalgaryWatch keeps the listing free and independent: claiming doesn’t buy placement, and our picks stay our own. <Link to="/partners">How we work with organizers</Link></span>
                  </label>
                </fieldset>
                {error ? <p className="pl-error" role="alert">{error}</p> : null}
                <div className="pl-actions">
                  <button type="submit" className="pl-btn" data-ready={!claimProblem(draft)} disabled={busy || !isFirebaseConfigured || Boolean(user&&!claims)}>
                    {busy ? 'Sending…' : claimLoadError ? 'Claim check unavailable' : user && !claims ? 'Checking your claims…' : user ? verifiedListing?'Request organization access':'Claim organization profile' : 'Continue with Google'} <ArrowUpRight size={18} aria-hidden="true" />
                  </button>
                  <p className="pl-fine pl-trust"><Lock size={12} aria-hidden="true" /> {user ? claimTimeline(evidence) : 'Continue with a new or existing Google account. Your form is kept through sign-in. No paid plan is needed; organization access starts after approval.'}</p>
                </div>
              </motion.form>
            )}
          </div>

          <aside className="cl-side" aria-label="The listing">
            <motion.div className="cl-listing" {...rise(5)}>
              <p className="pl-kicker">{entity.kind} on CalgaryWatch</p>
              <h2>{entity.title}</h2>
              <p>{entity.summary}</p>
              <p className="cl-listing-src">Built from {sites.length ? sites.join(', ') : 'the organizer’s own page'}</p>
              <Link to={entityPath(entity)} className="cl-listing-go">See the listing <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </motion.div>
            <section className="cl-publishing" aria-labelledby="cl-publishing-title"><p className="pl-kicker">Once you’re approved</p><h2 id="cl-publishing-title">Keep it current. On your terms.</h2><dl><div><dt>One submission every seven days</dt><dd>Per business, shared across your profile and events. Bundle several changes or events into one submission.</dd></div><div><dt>Updates publish automatically</dt><dd>CalgaryWatch is notified; another approval isn’t needed.</dd></div><div><dt>Images stay with CalgaryWatch</dt><dd>Images cannot be added, changed or deleted in the editor. Email us for artwork changes.</dd></div></dl></section>
            <motion.ul className="cl-perks" {...rise(6)}>
              {benefits.map((p) => <li key={p.title}><p.icon size={18} aria-hidden="true" /><span><strong>{p.title}</strong>{p.body}</span></li>)}
              <li><BadgeCheck size={18} aria-hidden="true" /><span><strong>Managed by your organization</strong>After approval, your listing shows it’s confirmed by your organization. Claiming is free and doesn’t buy placement.</span></li>
            </motion.ul>
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
}

