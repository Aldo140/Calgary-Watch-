import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, BadgeCheck, CalendarClock, Check, Clock, ImagePlus, Link2, Lock, MapPinned, ShieldCheck, Sparkles } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useAuth } from '../components/FirebaseProvider';
import { discoveryRepository } from '../data/discovery';
import { entityPath } from '../lib/discovery';
import { CLAIM_ROLES, UPDATE_FIELDS, claimEvidence, claimProblem, claimTimeline, emailDomain, sourceDomains, type ClaimDraft, type UpdateField } from '../lib/claims';
import { readMyUpdates, submitClaim, submitUpdate, useMyClaims } from '../lib/claimsApi';
import { auth } from '../firebase';
import { EASE_OUT } from '../components/plans/Motion';
import '../styles/plans.css';
import '../styles/claim.css';

const PERKS = [
  { icon: CalendarClock, title: 'Dates and hours', body: 'New run dates, holiday hours, a show that moved.' },
  { icon: ImagePlus, title: 'Your own photos', body: 'Swap our artwork for images you choose.' },
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
  const { user, signIn, isFirebaseConfigured } = useAuth();
  const reduce = useReducedMotion();
  const entity = useMemo(() => discoveryRepository.list().find((e) => e.id === id && ['event', 'market', 'business'].includes(e.kind)), [id]);
  const claims = useMyClaims(user?.uid);
  const claim = claims?.find((c) => c.entityId === id) ?? null;
  const sites = entity ? sourceDomains(entity.sources) : [];
  const [draft, setDraft] = useState<ClaimDraft>({ name: '', role: '', workEmail: '', phone: '', note: '', agree: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

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
    if (!entity) return;
    const current = auth?.currentUser;
    if (!current) { pending.current = true; await signIn(); if (!auth?.currentUser) pending.current = false; return; }
    const problem = claimProblem(draft);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      await submitClaim(current, { id: entity.id, title: entity.title, path: entityPath(entity) }, draft);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('That didn’t send. If you already claimed this listing, refresh the page; otherwise try again in a moment.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (pending.current && user && claims) { pending.current = false; if (!claim) void send(); }
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
        <header className="cw-wrap cl-head">
          <motion.p className="pl-eyebrow" {...rise(0)}>For organizers · free</motion.p>
          <motion.h1 className="cl-title" {...rise(1)}>Run {entity.title}? <em>Claim it.</em></motion.h1>
          <motion.p className="cl-lead" {...rise(2)}>Keep your own listing right: dates, photos, addresses and the link people follow. Changes reach a person the same day, and your listing shows that it’s managed by you.</motion.p>
          <motion.ol className="cl-steps" aria-label="How claiming works" {...rise(3)}>
            <li data-done={!!user}><span>{user ? <Check size={14} strokeWidth={3} /> : 1}</span> Sign in with Google</li>
            <li data-done={!!claim}><span>{claim ? <Check size={14} strokeWidth={3} /> : 2}</span> Tell us who you are</li>
            <li data-done={claim?.status === 'approved'}><span>{claim?.status === 'approved' ? <Check size={14} strokeWidth={3} /> : 3}</span> We confirm, then it’s yours</li>
          </motion.ol>
        </header>

        <div className="cw-wrap cl-grid">
          <div className="cl-main">
            {claim?.status === 'approved' ? (
              <Manage claim={claim} />
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
            ) : (
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
                  <p className="pl-fine pl-trust"><Lock size={12} aria-hidden="true" /> {user ? claimTimeline(evidence) : 'Registering is a Google sign-in. What you typed is kept through it.'}</p>
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
              <li><BadgeCheck size={18} aria-hidden="true" /><span><strong>“Managed by the organizer”</strong>A mark on your listing once it’s confirmed.</span></li>
            </motion.ul>
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
}

/** After approval: the organizer's direct line, with a history of what they've asked for. */
function Manage({ claim }: { claim: { entityId: string; entityTitle: string } }) {
  const { user } = useAuth();
  const [field, setField] = useState<UpdateField>('dates');
  const [details, setDetails] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Array<{ field: UpdateField; details: string; status: string; createdAt: number }>>([]);
  useEffect(() => { if (user) void readMyUpdates(user.uid, claim.entityId).then(setHistory); }, [user, claim.entityId, sent]);
  const meta = UPDATE_FIELDS.find((f) => f.id === field)!;
  const needsUrl = field === 'link' || field === 'photo';
  return (
    <section className="pl-form cl-form" aria-labelledby="cl-manage">
      <div className="cl-owner"><Sparkles size={18} aria-hidden="true" /> <span><strong>You manage this listing.</strong> Send a change and it reaches a person the same day.</span></div>
      <fieldset className="pl-step">
        <legend id="cl-manage"><span className="pl-num">✎</span> What should change?</legend>
        <div className="pl-chips cl-fields">
          {UPDATE_FIELDS.map((f) => (
            <button key={f.id} type="button" className="pl-chip" aria-pressed={field === f.id} onClick={() => setField(f.id)}>
              <span className="pl-chip-tick" aria-hidden="true">{field === f.id ? <Check size={14} strokeWidth={3} /> : null}</span>
              <span><strong>{f.label}</strong><small>{f.hint}</small></span>
            </button>
          ))}
        </div>
        <label className="pl-field"><span>Details</span><textarea className="cl-textarea" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={meta.hint} /></label>
        {needsUrl || field === 'dates' || field === 'other' ? (
          <label className="pl-field"><span>{field === 'photo' ? 'Link to the image' : 'Link'} {needsUrl ? '' : <small>(optional)</small>}</span><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></label>
        ) : null}
        {field === 'photo' ? <p className="pl-hint">Use an image you own or have permission to share. We credit it as you ask.</p> : null}
      </fieldset>
      {error ? <p className="pl-error" role="alert">{error}</p> : null}
      <div className="pl-actions">
        <button
          type="button" className="pl-btn" disabled={busy || details.trim().length < 3 || (needsUrl && !/^https:\/\//.test(url.trim()))}
          onClick={async () => {
            if (!user) return;
            setBusy(true); setError('');
            try { await submitUpdate(user, claim, field, details, url); setDetails(''); setUrl(''); setSent((n) => n + 1); }
            catch { setError('That didn’t send. Try again in a moment.'); }
            finally { setBusy(false); }
          }}
        >
          {busy ? 'Sending…' : 'Send this change'} <ArrowUpRight size={18} aria-hidden="true" />
        </button>
        {sent ? <p className="pl-goal" data-done="true" role="status"><Check size={14} strokeWidth={3} aria-hidden="true" /> Sent. We’ll update the listing and it’ll show here as applied.</p> : null}
      </div>
      {history.length ? (
        <div className="cl-history">
          <h3>Your requests</h3>
          <ul>{history.map((h, i) => <li key={i} data-status={h.status}><strong>{UPDATE_FIELDS.find((f) => f.id === h.field)?.label}</strong><span>{h.details}</span><em>{h.status === 'applied' ? 'Applied' : h.status === 'declined' ? 'Not changed' : 'Waiting'}</em></li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}

