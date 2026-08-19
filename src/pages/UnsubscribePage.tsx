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
import { doc, setDoc } from 'firebase/firestore';
import { ArrowLeft, Check, MailX, TriangleAlert } from 'lucide-react';
import { db } from '@/src/firebase';
import { isValidUnsubToken } from '@/src/lib/digest';

const T = {
  paper: '#F7F3EA',
  panel: '#FFFDF8',
  ink: '#1C2B3A',
  inkSoft: '#5A6B7D',
  line: '#D9D2C3',
  bow: '#2E8B7A',
  clay: '#B0503A',
};

type Stage = 'confirm' | 'working' | 'done' | 'invalid' | 'error';

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const uid = (params.get('uid') ?? '').trim();
  const token = (params.get('t') ?? '').trim();

  // Shape is checked here so an obviously malformed link says so immediately
  // rather than after a round trip that will certainly be rejected.
  const linkLooksValid = uid.length > 0 && uid.length <= 128 && isValidUnsubToken(token);
  const [stage, setStage] = useState<Stage>(linkLooksValid ? 'confirm' : 'invalid');

  useEffect(() => {
    document.title = 'Unsubscribe · Calgary Watch';
  }, []);

  const confirm = useCallback(async () => {
    if (!db || !linkLooksValid) { setStage('invalid'); return; }
    setStage('working');
    try {
      await setDoc(doc(db, 'digest_unsubscribes', uid), {
        uid,
        token,
        requestedAt: Date.now(),
        // The sender queries on `processedAt == null`, so it must be present
        // and null rather than absent — Firestore cannot match a missing field.
        processedAt: null,
        source: 'email-link',
      });
      setStage('done');
    } catch (error) {
      // A permission error here means the token did not match the account.
      const code = (error as { code?: string })?.code ?? '';
      setStage(code.includes('permission-denied') ? 'invalid' : 'error');
    }
  }, [uid, token, linkLooksValid]);

  return (
    <div className="min-h-screen" style={{ background: T.paper }}>
      <main className="mx-auto flex min-h-screen w-full max-w-[600px] flex-col justify-center px-5 py-16">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-[13px] font-bold transition-opacity hover:opacity-70"
          style={{ color: T.inkSoft }}
        >
          <ArrowLeft size={15} /> Calgary Watch
        </Link>

        <div className="p-7 sm:p-9" style={{ background: T.panel, border: `1.5px solid ${T.line}` }}>
          {stage === 'confirm' || stage === 'working' ? (
            <>
              <MailX size={30} style={{ color: T.ink }} />
              <h1
                className="mt-4 font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.02em]"
                style={{ color: T.ink }}
              >
                Stop the weekly digest?
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: T.inkSoft }}>
                You will stop receiving the Monday email about your neighbourhood. Your
                account, your saved location and any reports you have filed are untouched,
                and you can turn the digest back on from settings whenever you like.
              </p>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={stage === 'working'}
                className="mt-6 inline-flex items-center gap-2 px-5 py-3 text-[14px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: T.ink, color: T.paper }}
              >
                {stage === 'working' ? 'Unsubscribing…' : 'Yes, unsubscribe me'}
              </button>
            </>
          ) : null}

          {stage === 'done' ? (
            <>
              <span
                className="flex size-11 items-center justify-center rounded-full"
                style={{ background: 'rgba(46,139,122,0.14)' }}
              >
                <Check size={22} style={{ color: T.bow }} />
              </span>
              <h1
                className="mt-4 font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.02em]"
                style={{ color: T.ink }}
              >
                Done — you are unsubscribed.
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: T.inkSoft }}>
                Your request is recorded. It is applied when the digest next runs, so in
                the rare case that a message is already in flight you may see one more.
                Nothing after that.
              </p>
              <Link
                to="/map"
                className="mt-6 inline-flex items-center gap-2 px-5 py-3 text-[14px] font-bold transition-opacity hover:opacity-90"
                style={{ background: T.ink, color: T.paper }}
              >
                Back to the map
              </Link>
            </>
          ) : null}

          {stage === 'invalid' || stage === 'error' ? (
            <>
              <TriangleAlert size={30} style={{ color: T.clay }} />
              <h1
                className="mt-4 font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.02em]"
                style={{ color: T.ink }}
              >
                {stage === 'invalid' ? 'That link did not work.' : 'Something went wrong.'}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: T.inkSoft }}>
                {stage === 'invalid'
                  ? 'It may have been truncated by your email client, or it belongs to a different account. You can always turn the digest off directly in your settings.'
                  : 'We could not record your request just now. Please try again, or email us and we will do it by hand.'}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/map"
                  className="inline-flex items-center gap-2 px-5 py-3 text-[14px] font-bold transition-opacity hover:opacity-90"
                  style={{ background: T.ink, color: T.paper }}
                >
                  Open settings
                </Link>
                <a
                  href="mailto:jorti104@mtroyal.ca?subject=Unsubscribe%20from%20the%20weekly%20digest"
                  className="inline-flex items-center gap-2 px-5 py-3 text-[14px] font-bold"
                  style={{ border: `1.5px solid ${T.line}`, color: T.ink }}
                >
                  Email us instead
                </a>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
