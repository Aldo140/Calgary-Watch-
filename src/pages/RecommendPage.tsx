import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, BookOpen, HeartHandshake, Search } from 'lucide-react';
import { useAuth } from '../components/FirebaseProvider';
import { SiteLayout } from '../components/site/SiteLayout';
import { PageHero } from '../components/site/PageHero';
import { LOCAL_SERVICES, SERVICE_GROUPS, serviceById } from '../data/localServices';
import { cleanRecommendation, REC_LIMITS, sendRecommendation, type RecommendationInput } from '../lib/localRecommendations';
import '../styles/plans.css';
import '../styles/submit.css';

/**
 * Recommend a business for the Calgary White Pages. Free, short, and honest
 * about what happens next: we check them, list the good ones for free, and
 * credit the neighbour who sent them if they'd like.
 */
export default function RecommendPage() {
  const { user, signIn } = useAuth();
  const [params] = useSearchParams();
  const service = serviceById(params.get('service') ?? '');
  const [form, setForm] = useState<RecommendationInput>({
    businessName: params.get('name') ?? '', kind: service?.id ?? 'place', contact: '', neighbourhood: '', why: '', creditAs: '',
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof RecommendationInput) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => { document.title = 'Recommend a Calgary business | CalgaryWatch White Pages'; }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = cleanRecommendation(form);
    if (typeof clean === 'string') { setError(clean); return; }
    setBusy(true); setError('');
    try {
      if (!user) await signIn();
      await sendRecommendation(clean);
      setSent(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t send. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const trade = serviceById(form.kind);

  return (
    <SiteLayout>
      <div className="bp sb">
        <PageHero
          id="rec-title"
          kicker="The Calgary White Pages · free"
          title={<>Know someone <span>who’s really good?</span></>}
          lead="The plumber who came on a Sunday, the tailor who saved your suit, the bakery you send everyone to. Recommend them. It’s free for you and free for them."
          aside={
            <ol className="sb-steps">
              <li><b>1</b><HeartHandshake size={20} aria-hidden="true" /><span><strong>You recommend</strong>Their name, how to reach them, and what they did well.</span></li>
              <li><b>2</b><Search size={20} aria-hidden="true" /><span><strong>We check them</strong>Against their own site, like every name in the book.</span></li>
              <li><b>3</b><BookOpen size={20} aria-hidden="true" /><span><strong>They’re listed free</strong>With a note that a neighbour sent them, and your name if you’d like.</span></li>
            </ol>
          }
        />
      </div>
      <div className="cw-plans cw-submit">
        <div className="cw-wrap cw-submit-body">
          {sent ? (
            <section className="pl-card cw-submit-done" role="status">
              <BadgeCheck size={56} aria-hidden="true" style={{ color: '#1554d1' }} />
              <div>
                <h2>Thank you. They’re on our list.</h2>
                <p>We’ll look up {form.businessName.trim() || 'them'} and check them against their own site. Good ones go in the White Pages for free{form.creditAs.trim() ? `, and we’ll credit ${form.creditAs.trim()} as the neighbour who found them` : ''}.</p>
                <div className="cw-submit-next">
                  <button type="button" className="pl-btn" onClick={() => { setSent(false); setForm(f => ({ ...f, businessName: '', contact: '', why: '' })); }}>Recommend another <ArrowUpRight size={18} aria-hidden="true" /></button>
                  <Link to="/local#wp-title" className="pl-textbtn">Back to the White Pages</Link>
                </div>
              </div>
            </section>
          ) : (
            <form className="pl-card cw-rec-form" onSubmit={submit} noValidate>
              <label className="pl-field"><span>Who are they?</span>
                <input value={form.businessName} onChange={set('businessName')} maxLength={REC_LIMITS.businessName} placeholder="Business name" autoComplete="organization" required />
              </label>
              <label className="pl-field"><span>What do they do?</span>
                <select value={form.kind} onChange={set('kind')}>
                  <option value="place">A local place (shop, café, venue)</option>
                  {(Object.keys(SERVICE_GROUPS) as Array<keyof typeof SERVICE_GROUPS>).map(g => (
                    <optgroup key={g} label={SERVICE_GROUPS[g].label}>
                      {LOCAL_SERVICES.filter(s => s.group === g).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="pl-field"><span>Website or phone <small>so we can check them</small></span>
                <input value={form.contact} onChange={set('contact')} maxLength={REC_LIMITS.contact} placeholder="https://… or 403-…" inputMode="url" required />
              </label>
              <label className="pl-field"><span>Neighbourhood <small>optional</small></span>
                <input value={form.neighbourhood} onChange={set('neighbourhood')} maxLength={REC_LIMITS.neighbourhood} placeholder="Where they are, or where they worked for you" />
              </label>
              <label className="pl-field"><span>Why are they good?</span>
                <textarea value={form.why} onChange={set('why')} maxLength={REC_LIMITS.why} rows={4} placeholder={trade ? `What did this ${trade.trades[0]} do well?` : 'What should people order, ask for, or know?'} required />
              </label>
              <label className="pl-field"><span>Credit me as <small>optional, if we list them</small></span>
                <input value={form.creditAs} onChange={set('creditAs')} maxLength={REC_LIMITS.creditAs} placeholder="e.g. Sam in Bridgeland" />
              </label>
              {error ? <p className="pl-error" role="alert">{error}</p> : null}
              <button type="submit" className="pl-btn" disabled={busy}>{busy ? 'Sending…' : user ? 'Send my recommendation' : 'Sign in and send'} <ArrowUpRight size={18} aria-hidden="true" /></button>
              <p className="cw-rec-fine">Free, always. Recommendations can’t be bought, and a business never pays to be recommended. {user ? '' : 'A free account keeps spam out of the book.'}</p>
            </form>
          )}
        </div>
      </div>
    </SiteLayout>
  );
}
