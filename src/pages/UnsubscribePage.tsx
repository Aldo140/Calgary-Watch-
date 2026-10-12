/**
 * One-click unsubscribe from the weekly digest.
 *
 * ── Why this page writes a request instead of just switching the flag off ──
 * Somebody clicking a link in an email is, by definition, not signed in — that
 * is the whole point of the link. The rules on `users/{uid}` only allow the
 * owner to write their own profile, so this page has no way to flip
 * `weeklyDigestOptIn` directly and no server to do it on their behalf; Calgary
 * Watch is static hosting.
 *
 * So the page files a document in `digest_unsubscribes/{uid}` carrying the
 * token from the link. Firestore rules `get()` the profile and accept the write
 * only when the token matches, which makes a link valid for exactly one account
 * and useless if the uid in the URL is edited. The Monday job then honours the
 * request with admin credentials, before it selects anybody to mail.
 *
 * ── Why the confirmation is honest about the delay ─────────────────────────
 * The flag is not off the instant this page says "done" — a batch job turns it
 * off. CASL allows ten business days; ours is at most seven. Saying so is
 * better than a confirmation that quietly means "soon", because somebody who
 * receives one more issue after unsubscribing should have been told that could
 * happen rather than concluding the button did nothing.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ArrowUpRight, Check, MailX, TriangleAlert } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import '../styles/brand-page.css';
import '../styles/unsubscribe.css';
import { auth, db } from '@/src/firebase';
import { emailConsentPatch, readPlansProfile } from '@/src/lib/plansProfile';
import { isValidUnsubToken } from '@/src/lib/digest';

type Stage = 'confirm' | 'working' | 'done' | 'invalid' | 'error';

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const uid = (params.get('uid') ?? '').trim();
  const token = (params.get('t') ?? '').trim();
  // `list=events` comes from the Thursday picks email, `list=all` from the
  // combined "your week" email (both lists); anything else is the Monday
  // digest, which predates the parameter.
  const all = params.get('list') === 'all';
  const events = params.get('list') === 'events';

  // Shape is checked here so an obviously malformed link says so immediately
  // rather than after a round trip that will certainly be rejected.
  const linkLooksValid = uid.length > 0 && uid.length <= 128 && isValidUnsubToken(token);
  const [stage, setStage] = useState<Stage>(linkLooksValid ? 'confirm' : 'invalid');
  const [immediate, setImmediate] = useState(false);

  useEffect(() => {
    document.title = 'Unsubscribe · Calgary Watch';
  }, []);

  const confirm = useCallback(async () => {
    if (!db || !linkLooksValid) { setStage('invalid'); return; }
    setStage('working');
    try {
      const database = db;
      const lists = all ? ['digest_unsubscribes', 'events_digest_unsubscribes'] : [events ? 'events_digest_unsubscribes' : 'digest_unsubscribes'];
      await Promise.all(lists.map((list) => setDoc(doc(database, list, uid), {
        uid,
        token,
        requestedAt: Date.now(),
        // The sender queries on `processedAt == null`, so it must be present
        // and null rather than absent — Firestore cannot match a missing field.
        processedAt: null,
        source: 'email-link',
      })));
      // Signed in as this same account? Then turn it off on the profile now too,
      // instead of waiting for the next run to process the request.
      if (auth?.currentUser?.uid === uid) {
        try {
          const profile = readPlansProfile((await getDoc(doc(db, 'users', uid))).data());
          await setDoc(doc(db, 'users', uid), emailConsentPatch(profile, {
            weekly: events ? profile.weeklyDigestOptIn === true : false,
            events: events || all ? false : profile.eventsDigestOptIn,
          }, Date.now(), 'email-link'), { merge: true });
          setImmediate(true);
        } catch { /* the queued request still stops the next email */ }
      }
      setStage('done');
    } catch (error) {
      // A permission error here means the token did not match the account.
      const code = (error as { code?: string })?.code ?? '';
      setStage(code.includes('permission-denied') ? 'invalid' : 'error');
    }
  }, [uid, token, linkLooksValid, events, all]);

  const settingsTo = events ? '/plans' : '/map';
  const listName = all ? 'both weekly emails' : events ? 'the Thursday picks email' : 'the Monday digest';

  return (
    <SiteLayout>
      <div className="bp un">
        <section className="un-hero" aria-live="polite">
          <div className="cw-wrap">
            <div className={`un-card un-card-${stage}`}>
              {stage === 'confirm' || stage === 'working' ? (
                <>
                  <span className="un-icon"><MailX size={28} aria-hidden="true" /></span>
                  <p className="bp-eyebrow">Unsubscribe</p>
                  <h1>{all ? 'Stop both weekly emails?' : events ? 'Stop the Thursday picks email?' : 'Stop the weekly digest?'}</h1>
                  <p>
                    {all
                      ? 'You will stop getting the Monday safety reports and your event picks. Your account, saved area, interests, plans and badges stay as they are, and you can turn either back on from Your CalgaryWatch whenever you like.'
                      : events
                      ? 'You will stop receiving Thursday event picks. Your interests, your plans and your badges stay on your account, the Monday neighbourhood email is not affected, and you can turn picks back on from your plans page whenever you like.'
                      : 'You will stop receiving the Monday email about your neighbourhood. Your account, your saved location and any reports you have filed are untouched, and you can turn the digest back on from settings whenever you like.'}
                  </p>
                  <div className="un-actions">
                    <button type="button" className="bp-btn bp-btn-navy" onClick={() => void confirm()} disabled={stage === 'working'}>
                      {stage === 'working' ? 'Unsubscribing…' : 'Yes, unsubscribe me'}
                    </button>
                    <Link className="bp-btn" to="/">Keep getting it</Link>
                  </div>
                  {all ? (
                    <p className="un-fine">Only want to stop one of them? <Link to="/plans#emails">Choose on Your CalgaryWatch</Link></p>
                  ) : null}
                </>
              ) : null}

              {stage === 'done' ? (
                <>
                  <span className="un-icon un-icon-ok"><Check size={28} aria-hidden="true" /></span>
                  <p className="bp-eyebrow">Unsubscribed</p>
                  <h1>Done. You’re off {listName}.</h1>
                  <p>
                    {immediate
                      ? `It’s off now. You won’t get another ${all ? 'weekly email from us' : events ? 'Thursday picks email' : 'Monday email'}, and everything else on your account stays as it is.`
                      : `Your request is recorded. It is applied when the ${all ? 'emails' : events ? 'picks email' : 'digest'} next run${all ? '' : 's'}, so in the rare case that a message is already in flight you may see one more. Nothing after that.`}
                  </p>
                  <div className="un-actions">
                    <Link className="bp-btn bp-btn-navy" to={events ? '/plans' : '/map'}>
                      {events ? 'Back to your plans' : 'Back to the map'} <ArrowUpRight size={18} aria-hidden="true" />
                    </Link>
                    <Link className="bp-btn" to="/events">See what’s on</Link>
                  </div>
                </>
              ) : null}

              {stage === 'invalid' || stage === 'error' ? (
                <>
                  <span className="un-icon un-icon-warn"><TriangleAlert size={28} aria-hidden="true" /></span>
                  <p className="bp-eyebrow">Unsubscribe</p>
                  <h1>{stage === 'invalid' ? 'That link did not work.' : 'Something went wrong.'}</h1>
                  <p>
                    {stage === 'invalid'
                      ? `It may have been truncated by your email client, or it belongs to a different account. You can always turn the ${events ? 'picks email off on your plans page' : 'digest off directly in your settings'}.`
                      : 'We could not record your request just now. Please try again, or email us and we will do it by hand.'}
                  </p>
                  <div className="un-actions">
                    <Link className="bp-btn bp-btn-navy" to={settingsTo}>Open settings</Link>
                    <a
                      className="bp-btn"
                      href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(events ? 'Unsubscribe from Thursday picks' : 'Unsubscribe from the weekly digest')}`}
                    >
                      Email us instead
                    </a>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </SiteLayout>
  );
}
