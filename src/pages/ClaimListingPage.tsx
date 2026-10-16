import { ListingManagement } from '../components/entity/ListingManagement';
import { restoreClaimDraft } from '../lib/claimDraft';
import { useVerifiedListing } from '../lib/claimsApi';
import { VerifiedBadge } from '../components/entity/VerifiedBadge';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, BadgeCheck, CalendarClock, Check, Clock, ImagePlus, Link2, Lock, MapPinned, ShieldCheck, Sparkles } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useAuth } from '../components/FirebaseProvider';
import { discoveryRepository } from '../data/discovery';
import { entityPath } from '../lib/discovery';
import { CLAIM_ROLES, claimEvidence, claimProblem, claimTimeline, emailDomain, sourceDomains, type ClaimDraft } from '../lib/claims';
import { submitClaim, useMyClaims } from '../lib/claimsApi';
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
 * Claim a listing: register with Google, say who you are, and we confirm.
 * Once approved, the same page becomes the organizer's direct line: every
 * change request lands in admin with a verified sender attached.
 */
export default function ClaimListingPage() {
  const { id = '' } = useParams();
  return <ClaimForm key={id} id={id} />;
}

function ClaimForm({ id }: { id: string }) {
  const { user, signIn, isFirebaseConfigured, isAdmin } = useAuth();
  const [params] = useSearchParams();
  const previewUid = isAdmin ? params.get('as')?.trim() || undefined : undefined;
  const subjectUid = previewUid ?? user?.uid;
  const reduce = useReducedMotion();
  const entity = useMemo(() => discoveryRepository.list().find((e) => e.id === id && !e.developmentOnly && ['event', 'market', 'business'].includes(e.kind)), [id]);
  const claims = useMyClaims(subjectUid);
  const parentClaim = entity?.kind === 'event' ? claims?.find(c => c.status === 'approved' && c.entityId === entity.organizerEntityId) : undefined;
  const claim = parentClaim ?? claims?.find((c) => c.entityId === id) ?? null;
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
    if (!entity || previewUid) return;
    const current = auth?.currentUser;
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

  const rise = (i: number) => ({ initial: reduce ? false : { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: EASE_OUT, delay: 0.05 + i * 0.07 } });

  return (
    <SiteLayout>
      <div className="cw-plans cl-page">
        {previewUid ? <div className="cw-wrap"><p className="pl-adminview" role="status"><strong>Admin view — read-only.</strong> This member’s listing management. <Link to={`/plans?as=${encodeURIComponent(previewUid)}`}>Back to their dashboard</Link></p></div> : null}
        <header className="cw-wrap cl-head">
          <motion.p className="pl-eyebrow" {...rise(0)}>For organizers · free</motion.p>
          <motion.h1 className="cl-title" {...rise(1)}>Run {entity.title}? <em>Claim it.</em></motion.h1>
          <motion.p className="cl-lead" {...rise(2)}>Keep your listing and linked events right: dates, descriptions, addresses and links. After verification, save one update every seven days per business. Changes publish automatically without admin approval; CalgaryWatch is notified. Images cannot be added, changed or deleted in the editor. Once your claim is approved, your listing shows that it’s confirmed by your organization.</motion.p>
          <motion.ol className="cl-steps" aria-label="How claiming works" {...rise(3)}>
            <li data-done={!!user}><span>{user ? <Check size={14} strokeWidth={3} /> : 1}</span> Sign in with Google</li>
            <li data-done={!!claim}><span>{claim ? <Check size={14} strokeWidth={3} /> : 2}</span> Tell us who you are</li>
            <li data-done={claim?.status === 'approved'}><span>{claim?.status === 'approved' ? <Check size={14} strokeWidth={3} /> : 3}</span> We confirm, then it’s yours</li>
          </motion.ol>
        </header>

        <div className="cw-wrap cl-grid">
          <div className="cl-main">
            {previewUid && !claims ? <p role="status">Loading this member’s claims…</p> : claim?.status === 'approved' ? (
              <>
                {entity.kind === 'market' ? (
                  <Link to={previewUid ? `/organizer/${encodeURIComponent(entity.id)}?as=${encodeURIComponent(previewUid)}` : `/organizer/${encodeURIComponent(entity.id)}`} className="hq-open">
                    <span><strong>Open Market HQ</strong><small>Vendors, weekly lineups, applications and vendor emails.</small></span>
                    <ArrowUpRight size={20} aria-hidden="true" />
                  </Link>
                ) : null}
                <p className="cl-business"><BadgeCheck size={16} aria-hidden="true" /> <span><strong>Your account is a business account.</strong> It manages this listing; you’ll see it on your <Link to={previewUid ? `/plans?as=${encodeURIComponent(previewUid)}` : "/plans"}>dashboard</Link>.</span></p>
                <ListingManagement claim={claim} previewUid={previewUid} initialTargetId={entity.id} />
              </>
            ) : verifiedListing ? (
              <section><VerifiedBadge /><p>This listing has been confirmed by its organization.</p><a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`Correction: ${entity.title}`)}`}>Suggest a correction</a></section>
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
              <motion.form className="pl-form cl-form" onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate {...rise(4)}>
                <fieldset className="pl-step">
                  <legend><span className="pl-num">01</span> Who are you?</legend>
                  <label className="pl-field"><span>Your name</span><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoComplete="name" /></label>
                  <div className="cl-roles" role="radiogroup" aria-label="Your role">
                    {CLAIM_ROLES.map((r) => (
                      <button key={r} type="button" className="pl-chip cl-role" aria-pressed={draft.role === r} onClick={() => setDraft((d) => ({ ...d, role: r }))}>
                        <span className="pl-chip-tick" aria-hidden="true">{draft.role === r ? <Check size={14} strokeWidth={3} /> : null}</span><strong>{r}</strong>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="pl-step">
                  <legend><span className="pl-num">02</span> How do we reach you?</legend>
                  <label className="pl-field">
                    <span>Email at {sites[0] ? `@${sites[0]}` : 'your organization'} <small>(best)</small></span>
                    <input type="email" value={draft.workEmail} onChange={(e) => setDraft((d) => ({ ...d, workEmail: e.target.value }))} autoComplete="email" placeholder={sites[0] ? `you@${sites[0]}` : 'you@yourorganization.ca'} />
                  </label>
                  {workDomain ? (
                    <p className="cl-match" data-ok={domainMatch}>
                      {domainMatch ? <><BadgeCheck size={15} aria-hidden="true" /> Matches {sites.find((s) => workDomain.endsWith(s))}, the site this listing is built from.</> : <>Doesn’t match {sites.length ? sites.join(' or ') : 'a published site'}. That’s fine for agencies and volunteers; we’ll confirm another way.</>}
                    </p>
                  ) : null}
                  <label className="pl-field"><span>Phone <small>(optional, for a quick confirm)</small></span><input type="tel" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} autoComplete="tel" /></label>
                  <label className="pl-field"><span>Anything to fix right away? <small>(optional)</small></span><textarea className="cl-textarea" rows={3} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder="e.g. Our address is the Jubilee Auditorium, and here's our season page…" /></label>
                  <label className="pl-check">
                    <input type="checkbox" checked={draft.agree} onChange={(e) => setDraft((d) => ({ ...d, agree: e.target.checked }))} />
                    <span><strong>I’m allowed to manage this listing</strong> for {entity.title}. CalgaryWatch keeps the listing free and independent: claiming doesn’t buy placement, and our picks stay our own. <Link to="/partners">How we work with organizers</Link></span>
                  </label>
                </fieldset>
                {error ? <p className="pl-error" role="alert">{error}</p> : null}
                <div className="pl-actions">
                  <button type="submit" className="pl-btn" data-ready={!claimProblem(draft)} disabled={busy || !isFirebaseConfigured}>
                    {busy ? 'Sending…' : user ? 'Claim this listing' : 'Continue with Google'} <ArrowUpRight size={18} aria-hidden="true" />
                  </button>
                  <p className="pl-fine pl-trust"><Lock size={12} aria-hidden="true" /> {user ? claimTimeline(evidence) : 'Claiming needs a CalgaryWatch account: a Google sign-in, and what you typed is kept through it. Once we confirm you, it becomes a business account.'}</p>
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
            <motion.ul className="cl-perks" {...rise(6)}>
              {PERKS.map((p) => <li key={p.title}><p.icon size={18} aria-hidden="true" /><span><strong>{p.title}</strong>{p.body}</span></li>)}
              <li><BadgeCheck size={18} aria-hidden="true" /><span><strong>A verified listing</strong>Once we confirm you, it’s marked as verified, and verified listings get more weight when we surface relevant listings and recommendations across CalgaryWatch.</span></li>
            </motion.ul>
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
}

