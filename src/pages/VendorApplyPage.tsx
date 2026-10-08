import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Check, Lock, Store } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useAuth } from '../components/FirebaseProvider';
import { discoveryRepository } from '../data/discovery';
import { entityPath } from '../lib/discovery';
import { VENDOR_CATEGORIES, applicationProblem, type ApplicationDraft } from '../lib/markets';
import { myApplications, submitApplication } from '../lib/marketsApi';
import { auth } from '../firebase';
import '../styles/plans.css';
import '../styles/claim.css';
import '../styles/hq.css';

/**
 * Apply to sell at a market. The organizer gets it in Market HQ and can add
 * the vendor to their roster in one tap. Registering is a Google sign-in, so
 * every application has a real, verified address behind it.
 */
export default function VendorApplyPage() {
  const { id = '' } = useParams();
  const { user, signIn, isFirebaseConfigured } = useAuth();
  const market = useMemo(() => discoveryRepository.list().find((e) => e.id === id && e.kind === 'market'), [id]);
  const [d, setD] = useState<ApplicationDraft>({ businessName: '', category: '', description: '', website: '', instagram: '', contactName: '', email: '', phone: '', availability: '', agree: false });
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'already'>('idle');
  const [error, setError] = useState('');
  const pending = useRef(false);

  useEffect(() => { document.title = market ? `Sell at ${market.title} | CalgaryWatch` : 'Vendor application | CalgaryWatch'; }, [market]);
  useEffect(() => {
    if (!user) return;
    setD((x) => ({ ...x, contactName: x.contactName || user.displayName || '', email: x.email || user.email || '' }));
    void myApplications(user.uid).then((apps) => { if (apps.some((a) => a.marketId === id && a.status === 'pending')) setState((s) => (s === 'idle' ? 'already' : s)); });
  }, [user, id]);

  const send = async () => {
    if (!market) return;
    const current = auth?.currentUser;
    if (!current) { pending.current = true; await signIn(); if (!auth?.currentUser) pending.current = false; return; }
    const problem = applicationProblem(d);
    if (problem) { setError(problem); return; }
    setState('busy'); setError('');
    try { await submitApplication(current, { id: market.id, title: market.title }, d); setState('sent'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch { setState('idle'); setError('That didn’t send. Try again in a moment.'); }
  };
  useEffect(() => { if (pending.current && user) { pending.current = false; void send(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  if (!market) return <SiteLayout><div className="cw-wrap cl-page"><h1 className="cl-title">We couldn’t find that market.</h1><p className="cl-lead"><Link to="/markets">See Calgary markets</Link></p></div></SiteLayout>;

  return (
    <SiteLayout>
      <div className="cw-plans cl-page">
        <header className="cw-wrap cl-head">
          <p className="pl-eyebrow">Vendor application</p>
          <h1 className="cl-title">Sell at {market.title}. <em>Apply here.</em></h1>
          <p className="cl-lead">The organizer reviews every application and gets back to you by email. Approved vendors appear in the market’s lineup on CalgaryWatch, so shoppers know you’ll be there.</p>
        </header>
        <div className="cw-wrap cl-grid">
          <div className="cl-main">
            {state === 'sent' || state === 'already' ? (
              <section className="cl-status" data-state="pending">
                <Check size={22} aria-hidden="true" />
                <div>
                  <h2>{state === 'sent' ? 'Application sent.' : 'You’ve already applied.'}</h2>
                  <p>{market.title}’s organizer will reply to {d.email || 'your email'}. Once you’re approved you’ll show up in their lineup on CalgaryWatch.</p>
                  <p><Link to={entityPath(market)}>Back to the market</Link></p>
                </div>
              </section>
            ) : (
              <form className="pl-form cl-form" onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate>
                <fieldset className="pl-step">
                  <legend><span className="pl-num">01</span> Your business</legend>
                  <label className="pl-field"><span>Business name</span><input value={d.businessName} onChange={(e) => setD({ ...d, businessName: e.target.value })} /></label>
                  <div className="cl-roles" role="radiogroup" aria-label="What you sell">
                    {VENDOR_CATEGORIES.map((c) => (
                      <button key={c} type="button" className="pl-chip cl-role" aria-pressed={d.category === c} onClick={() => setD({ ...d, category: c })}>
                        <span className="pl-chip-tick" aria-hidden="true">{d.category === c ? <Check size={14} strokeWidth={3} /> : null}</span><strong>{c}</strong>
                      </button>
                    ))}
                  </div>
                  <label className="pl-field"><span>What you sell</span><textarea className="cl-textarea" rows={3} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Small-batch hot sauces made in Calgary, plus seasonal pickles" /></label>
                  <div className="hq-form-grid">
                    <label className="pl-field"><span>Website <small>(optional)</small></span><input value={d.website} onChange={(e) => setD({ ...d, website: e.target.value })} placeholder="https://" /></label>
                    <label className="pl-field"><span>Instagram <small>(optional)</small></span><input value={d.instagram} onChange={(e) => setD({ ...d, instagram: e.target.value })} placeholder="@handle" /></label>
                  </div>
                </fieldset>
                <fieldset className="pl-step">
                  <legend><span className="pl-num">02</span> How to reach you</legend>
                  <div className="hq-form-grid">
                    <label className="pl-field"><span>Your name</span><input value={d.contactName} onChange={(e) => setD({ ...d, contactName: e.target.value })} autoComplete="name" /></label>
                    <label className="pl-field"><span>Email</span><input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} autoComplete="email" /></label>
                    <label className="pl-field"><span>Phone <small>(optional)</small></span><input type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} autoComplete="tel" /></label>
                  </div>
                  <label className="pl-field"><span>Which dates, and anything about your stall <small>(optional)</small></span><textarea className="cl-textarea" rows={3} value={d.availability} onChange={(e) => setD({ ...d, availability: e.target.value })} placeholder="Every Saturday from May; 10x10 tent; need power" /></label>
                  <label className="pl-check"><input type="checkbox" checked={d.agree} onChange={(e) => setD({ ...d, agree: e.target.checked })} /><span><strong>The organizer may contact me about {market.title}.</strong> If I’m approved, my business name, category, description and links appear in the public lineup. My contact details stay private.</span></label>
                </fieldset>
                {error ? <p className="pl-error" role="alert">{error}</p> : null}
                <div className="pl-actions">
                  <button type="submit" className="pl-btn" data-ready={!applicationProblem(d)} disabled={state === 'busy' || !isFirebaseConfigured}>{state === 'busy' ? 'Sending…' : user ? 'Send application' : 'Continue with Google'} <ArrowUpRight size={18} aria-hidden="true" /></button>
                  <p className="pl-fine pl-trust"><Lock size={12} aria-hidden="true" /> {user ? 'Goes straight to the organizer.' : 'A Google sign-in keeps applications real. What you typed is kept.'}</p>
                </div>
              </form>
            )}
          </div>
          <aside className="cl-side">
            <div className="cl-listing">
              <p className="pl-kicker">Market on CalgaryWatch</p>
              <h2>{market.title}</h2>
              <p>{market.summary}</p>
              <Link to={entityPath(market)} className="cl-listing-go">See the market <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
            <ul className="cl-perks">
              <li><Store size={18} aria-hidden="true" /><span><strong>Shoppers see you</strong>Approved vendors appear in the weekly lineup on CalgaryWatch and in event picks.</span></li>
              <li><Lock size={18} aria-hidden="true" /><span><strong>Your details stay private</strong>Only the organizer sees your email and phone.</span></li>
            </ul>
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
}
