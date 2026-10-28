import { claimPresentation } from '../lib/claimPresentation';
import {claimOrganization,approvedManagementOrganization,standaloneOrganization} from '../lib/claimOrganization';
import {AdminAccessBar} from '../components/admin/AdminAccessBar';
import {useAdminEditMode} from '../hooks/useAdminEditMode';
import { approvedOrganization } from '../lib/organizationWorkspace';
import { ListingManagement } from '../components/entity/ListingManagement';
import { clearClaimDraft, isClaimQueued, loadClaimDraft, saveClaimDraft, setClaimQueued } from '../lib/claimDraft';
import { INVITE_PARAM, decodeInvite, inviteGreetingName, normalizeInvite, type ClaimInvite, type SignupIntent } from '../lib/claimInvite';
import { useVerifiedListing } from '../lib/claimsApi';
import { VerifiedBadge } from '../components/entity/VerifiedBadge';
import { VerifyEmailNotice } from '../components/auth/VerifyEmailNotice';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, BadgeCheck, CalendarClock, CalendarDays, Check, Clock, Eye, EyeOff, Link2, Lock, Mail, MapPinned, ShieldCheck, Store, Theater, Music, Palette, Building2, UtensilsCrossed, Users } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useAuth } from '../components/FirebaseProvider';
import { authCode, authErrorMessage, passwordProblem, realName } from '../lib/auth';
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
  { icon: MapPinned, title: 'Addresses and locations', body: 'Fix a venue, or add a second branch.' },
  { icon: Link2, title: 'The link we send people to', body: 'Homepage, tickets or your season page.' },
];

const CLAIM_FIELDS = ['name', 'role', 'email', 'agree'] as const;
type ClaimField = typeof CLAIM_FIELDS[number];
/** Per-field version of claimProblem, so the form can point at every missing answer at once. */
function fieldProblem(d: ClaimDraft, f: ClaimField): boolean {
  return f === 'name' ? d.name.trim().length < 2 : f === 'role' ? !d.role : f === 'email' ? !emailDomain(d.workEmail) : !d.agree;
}

const FIELD_NAMES: Record<ClaimField, string> = { name: 'your name', role: 'your role', email: 'a contact email', agree: 'the confirmation box' };
function missingSummary(d: ClaimDraft): string {
  const missing = CLAIM_FIELDS.filter(f => fieldProblem(d, f)).map(f => FIELD_NAMES[f]);
  if (missing.length < 2) return claimProblem(d);
  return `Still needed: ${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}.`;
}

/**
 * Anyone can request a claim with a verified Google or email/password account.
 * Admin management is an explicit preview, separate from a personal claim.
 * Approval is still required before organization editing is granted.
 */
export default function ClaimListingPage() {
  const { id = '' } = useParams();
  return <ClaimForm key={id} id={id} />;
}

/**
 * The invitation this tab arrived with: from the link the first time, then
 * from the tab's storage, so a reload or the return from a verification
 * email still greets the same person.
 */
function readInvite(id: string, raw: string | null): ClaimInvite | null {
  const fromLink = decodeInvite(raw);
  try {
    if (fromLink) { sessionStorage.setItem(`claim-invite:${id}`, JSON.stringify(fromLink)); return fromLink; }
    return normalizeInvite(JSON.parse(sessionStorage.getItem(`claim-invite:${id}`) ?? 'null'));
  } catch { return fromLink; }
}

function ClaimForm({ id }: { id: string }) {
  const { user, signIn, signUpWithEmail, saveName, refreshCurrentUser, isAuthActionLoading, isFirebaseConfigured, isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [invite] = useState(() => readInvite(id, params.get(INVITE_PARAM)));
  // The invitation is read once; the address bar (and anything that records it) drops it.
  useEffect(() => {
    if (!params.has(INVITE_PARAM)) return;
    const next = new URLSearchParams(params); next.delete(INVITE_PARAM);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const [draft, setDraft] = useState<ClaimDraft>(() => {
    const d = loadClaimDraft(id);
    // An invitation fills in who we wrote to; anything already typed wins.
    return { ...d, name: d.name || invite?.name || '', workEmail: d.workEmail || invite?.email || '' };
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  // Survives the new tab the verification link opens (claimDraft.ts).
  const pending = useRef(isClaimQueued(id));
  const queue = (on: boolean) => { pending.current = on; setClaimQueued(id, on); };
  const verifiedListing = useVerifiedListing(id, Boolean(entity?.ownerVerifiedAt));
  useEffect(() => { saveClaimDraft(id, draft); }, [id, draft]);

  useEffect(() => { document.title = entity ? `Claim ${entity.title} | CalgaryWatch` : 'Claim a listing | CalgaryWatch'; }, [entity]);
  // Prefill from the authenticated account once signed in, without overwriting typing.
  useEffect(() => {
    if (!user) return;
    setDraft((d) => ({ ...d, name: d.name || user.displayName || '', workEmail: d.workEmail || user.email || '' }));
  }, [user]);

  const evidence = entity ? claimEvidence({ accountEmail: user?.email ?? '', workEmail: draft.workEmail, sources: entity.sources }) : 'no-source';
  const workDomain = emailDomain(draft.workEmail);
  const domainMatch = !!workDomain && sites.some((s) => workDomain === s || workDomain.endsWith(`.${s}`));

  const intent: SignupIntent | undefined = entity ? { as: 'organizer', entityId: entity.id, via: invite?.via ?? (invite ? 'invite' : 'claim') } : undefined;
  const accountTitle = entity ? `Your organizer account for ${profile?.title ?? entity.title}.` : '';
  /** Google, or an account that already exists: the shared dialog, worded for an organizer. */
  const useOtherAccount = async () => {
    queue(true);
    await signIn({ mode: 'signin', email: draft.workEmail, name: draft.name, verify: true, signupAs: intent, title: accountTitle, intro: 'Sign in, or continue with Google. Your claim answers stay on this page and send once your email is verified.' });
    if (!auth?.currentUser) queue(false);
  };

  const send = async () => {
    if (!entity || previewUid || adminView || busy) return;
    const current = auth?.currentUser;
    if (current && (!claims || claimLoadError)) {
      setError('Wait until we can check your existing claims, then try again. Your form is still here.');
      return;
    }
    const problem = claimProblem(draft);
    if (problem) {
      setTried(true); setError(problem);
      const first = CLAIM_FIELDS.find(f => fieldProblem(draft, f));
      if (first) document.getElementById(`cl-${first}`)?.focus();
      return;
    }
    // Organizer accounts are made here, in the same form: the contact email becomes the
    // account email (so a matching domain checks itself), and the claim waits for verification.
    if (!current) {
      const pp = passwordProblem(password);
      if (pp) { setTried(true); setError(pp === 'Enter your password.' ? 'Choose a password for your organizer account.' : pp); document.getElementById('cl-password')?.focus(); return; }
      setBusy(true); setError('');
      try {
        queue(true);
        await signUpWithEmail(draft.workEmail.trim(), password, draft.name.trim(), intent);
        setPassword('');
      } catch (e) {
        queue(false);
        if (authCode(e) === 'auth/email-already-in-use') { setError(`${draft.workEmail.trim()} already has a CalgaryWatch account. Sign in with it and your claim sends from there.`); void useOtherAccount(); }
        else setError(authErrorMessage(e));
      } finally { setBusy(false); }
      return;
    }
    // Accounts made before names were asked for take the name typed on the claim.
    if (!realName(current.displayName)) void saveName(draft.name).catch(() => {});
    // Unverified: keep the claim queued and send it the moment verification lands.
    if (!current.emailVerified) { queue(true); setError('Verify your email before submitting this claim. We’ll send it as soon as you do.'); return; }
    setBusy(true); setError('');
    try {
      await submitClaim(current, { id: entity.id, title: entity.title, path: entityPath(entity) }, draft);
      clearClaimDraft(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('That didn’t send. If you already claimed this listing, refresh the page; otherwise try again in a moment.');
    } finally {
      setBusy(false);
    }
  };
  // Organizers verify in their mail app and come back: check again whenever this tab is in view.
  useEffect(() => {
    if (!user || user.emailVerified || previewUid) return;
    const check = () => { if (document.visibilityState === 'visible') void refreshCurrentUser().catch(() => {}); };
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [user, user?.emailVerified, previewUid, refreshCurrentUser]);
  useEffect(() => {
    if (!previewUid && pending.current && user?.emailVerified && claims) { pending.current = false; setError(''); if (claim) setClaimQueued(id, false); else void send(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, user?.emailVerified, claims]);

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

  const bad = (f: ClaimField) => tried && !!fieldProblem(draft, f);
  const greeting = inviteGreetingName(invite);
  const invited = Boolean(invite) && !claim && !adminView && !previewUid;
  const otherAccount = invited && user?.email && invite?.email && user.email.toLowerCase() !== invite.email;
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
          <motion.h1 className="cl-title" {...rise(1)}>{claim?.status==='approved'||adminView?<>Manage <em>{entity.title}.</em></>:<>{invited&&greeting?`${greeting}, claim `:'Claim '}<em>{profile?.title??entity.title}.</em></>}</motion.h1>
          <motion.p className="cl-lead" {...rise(2)}><strong>{presentation.intro}</strong> {presentation.detail}</motion.p>
          <ul className="cl-assurances" aria-label="Free organizer access"><li><Check size={15} aria-hidden="true" />Free, no paid plan</li><li><Check size={15} aria-hidden="true" />About a minute to fill in</li><li><ShieldCheck size={15} aria-hidden="true" />Checked by a person before editing</li></ul>
          </div>
          <motion.section className="cl-listing" aria-labelledby="cl-listing-title" {...rise(3)}>
            <p className="pl-kicker">{claim?.status==='approved'||adminView?'Your listing':'You’re claiming'}</p>
            <h2 id="cl-listing-title">{profile?.title ?? entity.title}</h2>
            {listing&&listing.id!==entity.id?<p>Includes your listing <Link to={entityPath(listing)}>{listing.title}</Link></p>:<p className="cl-listing-sum">{entity.summary}</p>}
            {profile?.address?<p className="cl-listing-addr"><MapPinned size={14} aria-hidden="true" /> {profile.address}</p>:null}
            <p className="cl-listing-src">Built from {sites.length ? sites.join(', ') : 'the organizer’s own page'}</p>
            {!claim&&!adminView&&profile?<p className="cl-listing-note">{profile.managementOnly?'Your workspace starts with this listing. You can add events after approval, without a separate public company page.':'After approval you manage this profile and its confirmed linked events. Unrelated listings are never added to your account.'}</p>:null}
            <Link to={entityPath(listing ?? entity)} className="cl-listing-go">See the listing <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </motion.section>
          <motion.ol className="cl-steps" aria-label="How claiming works" {...rise(4)}>
            <li data-done={!!user}><span>{user ? <Check size={14} strokeWidth={3} /> : 1}</span> Your details and a password</li>
            <li data-done={!!user?.emailVerified}><span>{user?.emailVerified ? <Check size={14} strokeWidth={3} /> : 2}</span> Verify your email</li>
            <li data-done={claim?.status === 'approved'}><span>{claim?.status === 'approved' ? <Check size={14} strokeWidth={3} /> : 3}</span> We confirm, then it’s yours</li>
          </motion.ol>
        </header>

        <div className="cw-wrap cl-grid">
          <div className="cl-main">
            {claimLoadError ? <div role="alert" className="pl-error"><p>We couldn’t check existing claims. Your form is still here; this does not mean your account cannot claim this organization.</p><button type="button" className="pl-btn" onClick={() => window.location.reload()}>Reload and try again</button></div> : null}
            {!claim&&!adminView&&!previewUid?<VerifyEmailNotice action={pending.current ? 'we send your claim. It goes the moment you do' : 'submit this claim'} />:null}
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
                  <p>{claim.reviewNote || 'We weren’t able to match you to the organization.'} Email <a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Claim: ${entity.title}`)}`}>aldo@calgarywatch.ca</a> from your organization’s address and we’ll sort it out.</p>
                </div>
              </section>
            ) : previewUid ? <p>This member has not claimed this listing.</p> : (
              <motion.form aria-label="Organization claim application" className="pl-form cl-form" onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate {...rise(4)}>
                <div className="cl-form-intro"><p className="pl-kicker">{invited?'Your invitation':'Your organization access'}</p><h2>{invited&&!user?'Check your details, choose a password.':'Tell us who you are.'}</h2><p>{user ? 'Use this account to request access—no new account or paid plan is needed.' : invited ? `We filled in what we know from our email to ${invite?.org ?? profile?.title ?? entity.title}. Fix anything that’s off: this creates your free organizer account and sends your claim in one go.` : 'This creates your free organizer account and sends your claim in one go. Already have an account, or prefer Google? There’s a link below.'}</p></div>
                {otherAccount?<p className="cl-invite-note">Our invitation went to {invite!.email}. You’re signed in as {user!.email}, which is fine: the claim goes in from this account. <button type="button" className="cl-link" onClick={()=>setDraft(d=>({...d,workEmail:invite!.email!}))}>Use {invite!.email} as the contact email</button></p>:null}
                <>{verifiedListing?<p role="status"><VerifiedBadge /> This organization is already claimed. You can request access as another representative; existing managers keep their access while we review your request.</p>:null}</>
                <fieldset className="pl-step">
                  <legend><span className="pl-num">01</span> Who are you?</legend>
                  <label className="pl-field"><span>Your name</span><input id="cl-name" aria-invalid={bad('name')} aria-describedby={bad('name')?'cl-name-err':undefined} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoComplete="name" />{bad('name')?<small id="cl-name-err" className="cl-field-error">Add your name.</small>:null}</label>
                  <p className="cl-roles-label" id="cl-role-label">Your role</p>
                  <div className="cl-roles" role="radiogroup" aria-labelledby="cl-role-label" aria-invalid={bad('role')} data-invalid={bad('role')}>
                    {CLAIM_ROLES.map((r, i) => (
                      <label key={r} className="cl-role" data-selected={draft.role === r}>
                        <input id={i===0?'cl-role':undefined} type="radio" name="claim-role" value={r} checked={draft.role === r} onChange={() => setDraft((d) => ({ ...d, role: r }))} /><strong>{r}</strong>
                      </label>
                    ))}
                  </div>
                  {bad('role')?<small className="cl-field-error">Choose the role that fits best.</small>:null}
                </fieldset>
                <fieldset className="pl-step">
                  <legend><span className="pl-num">02</span> How do we reach you?</legend>
                  <label className="pl-field">
                    <span>{user?'Contact email':'Work email'} <small>{user?'':'Also your sign-in. '}{sites[0] ? `@${sites[0]} is helpful, but not required` : 'Personal or work email'}</small></span>
                    <input id="cl-email" aria-invalid={bad('email')} type="email" inputMode="email" value={draft.workEmail} onChange={(e) => setDraft((d) => ({ ...d, workEmail: e.target.value }))} autoComplete="email" placeholder={sites[0] ? `you@${sites[0]}` : 'you@yourorganization.ca'} />
                    {bad('email')?<small className="cl-field-error">Add an email we can reach you at.</small>:null}
                  </label>
                  {workDomain ? (
                    <p className="cl-match" data-ok={domainMatch}>
                      {domainMatch ? <><BadgeCheck size={15} aria-hidden="true" /> Matches {sites.find((s) => workDomain.endsWith(s))}, the site this listing is built from.</> : <>Doesn’t match {sites.length ? sites.join(' or ') : 'a published site'}. That’s fine for agencies and volunteers; we’ll confirm another way.</>}
                    </p>
                  ) : null}
                  <label className="pl-field"><span>Phone <small>(optional, for a quick confirm)</small></span><input type="tel" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} autoComplete="tel" /></label>
                  <label className="pl-field"><span>Anything to fix right away? <small>(optional)</small></span><textarea className="cl-textarea" rows={3} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder={presentation.placeholder} /></label>
                  <label className="pl-check" data-invalid={bad('agree')}>
                    <input id="cl-agree" aria-invalid={bad('agree')} type="checkbox" checked={draft.agree} onChange={(e) => setDraft((d) => ({ ...d, agree: e.target.checked }))} />
                    <span><strong>I’m allowed to manage this listing</strong> for {profile?.title??entity.title}. CalgaryWatch keeps the listing free and independent: claiming doesn’t buy placement, and our picks stay our own. <Link to="/partners">How we work with organizers</Link></span>
                  </label>
                </fieldset>
                {!user?<fieldset className="pl-step">
                  <legend><span className="pl-num">03</span> Your organizer account</legend>
                  <label className="pl-field"><span>Choose a password <small>at least 6 characters</small></span>
                    <span className="cl-password"><input id="cl-password" type={showPassword?'text':'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={tried&&!!passwordProblem(password)} /><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></span>
                  </label>
                  <p className="pl-fine">You’ll sign in as <strong>{draft.workEmail.trim()||'the work email above'}</strong>. It’s set up as an organizer account, kept apart from resident sign-ups. <button type="button" className="cl-link" onClick={()=>{const problem=claimProblem(draft);if(problem){setTried(true);setError(problem);return;}void useOtherAccount();}}>I already have an account, or use Google</button></p>
                </fieldset>:null}
                {error&&!(tried&&claimProblem(draft)) ? <p className="pl-error" role="alert">{error}</p> : null}
                {tried&&claimProblem(draft) ? <p className="pl-error" role="alert">{missingSummary(draft)}</p> : null}
                <div className="pl-actions">
                  <button type="submit" className="pl-btn" data-ready={!claimProblem(draft)} disabled={busy || !isFirebaseConfigured || Boolean(user&&!claims) || Boolean(user&&!user.emailVerified)}>
                    {busy ? 'Sending…' : claimLoadError ? 'Claim check unavailable' : user && !claims ? 'Checking your claims…' : user&&!user.emailVerified?'Verify email to continue':!user?'Create account and send claim':verifiedListing?'Request organization access':'Claim organization profile'} <ArrowUpRight size={18} aria-hidden="true" />
                  </button>
                  <p className="pl-fine pl-trust"><Lock size={12} aria-hidden="true" /> {user ? claimTimeline(evidence) : 'We email you a link to verify, then your claim sends by itself. A person checks it before you can edit.'}</p>
                </div>
              </motion.form>
            )}
          </div>

          <aside className="cl-side" aria-label="After approval">
            <motion.section className="cl-publishing" aria-labelledby="cl-publishing-title" {...rise(6)}>
              <p className="pl-kicker">Once you’re approved</p>
              <h2 id="cl-publishing-title">Keep it current. On your terms.</h2>
              <ul className="cl-perks">
                {benefits.map((p) => <li key={p.title}><p.icon size={18} aria-hidden="true" /><span><strong>{p.title}</strong>{p.body}</span></li>)}
                <li><BadgeCheck size={18} aria-hidden="true" /><span><strong>A verified badge</strong>Your listing shows it’s confirmed by your organization. Claiming is free and doesn’t buy placement.</span></li>
              </ul>
              <p className="cl-publishing-note">Changes publish right away, one submission every seven days per business (bundle several in one). Images stay with CalgaryWatch: <a href="mailto:aldo@calgarywatch.ca">email us</a> for artwork changes.</p>
            </motion.section>
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
}

