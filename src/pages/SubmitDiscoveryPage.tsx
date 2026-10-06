import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Check, Clock, LinkIcon, ShieldCheck } from 'lucide-react';
import { useAuth } from '../components/FirebaseProvider';
import { SiteLayout } from '../components/site/SiteLayout';
import { InventoryForm } from '../components/discovery/InventoryForm';
import { BadgeMark } from '../components/plans/BadgeMark';
import { celebrateBadge } from '../components/plans/BadgeToast';
import { submitDiscovery } from '../lib/discoveryApi';
import { readMySubmissionCount } from '../lib/plans';
import '../styles/plans.css';

/**
 * Add an event or market. The ask is small and specific — a real listing with
 * the organizer's own link — because that is what lets it be checked and
 * published. The reward is said up front and given on success.
 */
export default function SubmitDiscoveryPage() {
  const { user, signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [params] = useSearchParams();
  const requested = params.get('type');
  const defaultKind = requested === 'market' ? 'market' : requested === 'event' ? 'event' : undefined;
  const noun = defaultKind === 'market' ? 'market' : 'event';

  useEffect(() => { document.title = `Add a Calgary ${noun} | CalgaryWatch`; }, [noun]);

  return (
    <SiteLayout>
      <div className="cw-plans cw-submit">
        <header className="cw-wrap pl-head">
          <p className="pl-eyebrow">Add to the calendar · free</p>
          <h1>Know something <em>on in Calgary?</em></h1>
          <p className="pl-lead">Share an event or market with the organizer’s own link. We check it against that page, then publish it for everyone browsing what’s on, and in the Thursday picks of people who’d like it.</p>
          <ul className="cw-submit-steps">
            <li><LinkIcon size={18} aria-hidden="true" /><span><strong>Link the source</strong>The organizer’s page or ticket listing, so we can check it.</span></li>
            <li><ShieldCheck size={18} aria-hidden="true" /><span><strong>We verify it</strong>Dates, place and price, against that source.</span></li>
            <li><Clock size={18} aria-hidden="true" /><span><strong>It goes live</strong>Once it matches the source. Sharing earns the Event scout badge.</span></li>
          </ul>
        </header>

        <div className="cw-wrap cw-submit-body">
          {sent ? (
            <section className="pl-card cw-submit-done" role="status">
              <BadgeMark badge={{ id: 'scout', tone: 'green', unlocked: true }} size={72} />
              <div>
                <h2>Thank you. It’s in the queue.</h2>
                <p>We’ll check it against the organizer’s page and publish it once it matches. You’ve earned the <strong>Event scout</strong> badge.</p>
                <div className="cw-submit-next">
                  <button type="button" className="pl-btn" onClick={() => { setSent(false); setError(''); }}>Add another <ArrowUpRight size={18} aria-hidden="true" /></button>
                  <Link to="/plans" className="pl-textbtn">See your badges</Link>
                  <Link to="/events" className="pl-textbtn">Back to events</Link>
                </div>
              </div>
            </section>
          ) : !user ? (
            <section className="pl-card cw-submit-gate">
              <h2>Sign in to share a listing</h2>
              <p>Google sign-in lets us follow up if a detail needs checking, and keeps spam off the calendar. It takes a few seconds.</p>
              <button type="button" className="pl-btn" onClick={() => void signIn().catch((e) => setError(e.message))}>Continue with Google <ArrowUpRight size={18} aria-hidden="true" /></button>
              {error ? <p className="pl-error" role="alert">{error}</p> : null}
            </section>
          ) : (
            <section className="pl-card cw-submit-form">
              {error ? <p className="pl-error" role="alert">{error}</p> : null}
              <InventoryForm
                busy={busy}
                defaultKind={defaultKind}
                label={`Send my ${noun} for checking`}
                onSave={async (input) => {
                  setBusy(true); setError('');
                  try {
                    const before = await readMySubmissionCount(user.uid);
                    await submitDiscovery(input);
                    setSent(true);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    if (!before) celebrateBadge('scout');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'That didn’t send. Please try again.');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </section>
          )}
        </div>
      </div>
    </SiteLayout>
  );
}
