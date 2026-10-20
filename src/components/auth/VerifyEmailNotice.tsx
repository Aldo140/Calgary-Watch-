import { useState } from 'react';
import { Mail } from 'lucide-react';
import { useAuth } from '../FirebaseProvider';
import '../../styles/claim.css';

/**
 * Shown in place of a submit when the signed-in account hasn't verified its
 * email yet. The rules refuse unverified writes, so saying so up front beats
 * a vague "that didn't send" after the person has filled the whole form.
 */
export function VerifyEmailNotice({ action }: { action: string }) {
  const { user, sendVerificationEmail, refreshCurrentUser, isAuthActionLoading } = useAuth();
  const [message, setMessage] = useState('');
  if (!user || user.emailVerified) return null;
  return (
    <section className="cl-verify" aria-labelledby="cl-verify-title">
      <Mail size={22} aria-hidden="true" />
      <div>
        <h2 id="cl-verify-title">Verify {user.email}</h2>
        <p>Open the verification link in your inbox (check junk too) before you {action}. Everything you’ve typed stays right here.</p>
        {message ? <p role="status">{message}</p> : null}
        <div>
          <button type="button" className="pl-btn" disabled={isAuthActionLoading} onClick={async () => {
            setMessage('');
            try { const refreshed = await refreshCurrentUser(); setMessage(refreshed?.emailVerified ? 'Email verified. You’re good to go.' : 'We haven’t seen the verification yet. Open the link, then check again.'); }
            catch { setMessage('We couldn’t check just now. Try again in a moment.'); }
          }}>Check verification</button>
          <button type="button" className="pl-btn pl-btn-secondary" disabled={isAuthActionLoading} onClick={async () => {
            setMessage('');
            try { await sendVerificationEmail(); setMessage('Verification email sent. Check your inbox and junk folder.'); }
            catch { setMessage('We couldn’t resend that email yet. Wait a minute and try again.'); }
          }}>Resend email</button>
        </div>
      </div>
    </section>
  );
}
