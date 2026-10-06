import { useEffect, useState } from 'react';
import { Check, Ticket } from 'lucide-react';
import { useAuth } from '../FirebaseProvider';
import { auth } from '../../firebase';
import { readGoingCount, setGoing, useMyGoing } from '../../lib/plans';
import { celebrateBadge } from './BadgeToast';
import '../../styles/plans.css';

/**
 * "I'm going" for one listing. Signed out, it explains why it needs an account
 * and signs in on the same tap; the RSVP is recorded once sign-in returns.
 * The public number only appears once somebody has actually said yes.
 */
export function GoingButton({ eventId, start, past = false, compact = false }: { eventId: string; start: string; past?: boolean; compact?: boolean }) {
  const { user, signIn, isFirebaseConfigured } = useAuth();
  const mine = useMyGoing(user?.uid);
  const on = mine.ids.has(eventId);
  const [count, setCount] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // A list of compact buttons doesn't show tallies, so it doesn't pay a read per row.
  useEffect(() => {
    if (compact) return;
    let live = true;
    void readGoingCount(eventId).then((n) => { if (live) setCount(n); });
    return () => { live = false; };
  }, [eventId, compact]);

  const toggle = async (next: boolean) => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const before = mine.ids.size;
      await setGoing(user.uid, eventId, start, next);
      // Reward the plan the moment it's made: first RSVP, then the fifth.
      if (next && before === 0) celebrateBadge('first-plans');
      else if (next && before === 4) celebrateBadge('regular');
      setCount((c) => Math.max(0, (c ?? 0) + (next ? 1 : -1)));
    } catch {
      setError('That didn’t save. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  // Finish the tap that started sign-in, once, after the RSVP list has loaded.
  useEffect(() => {
    if (pending && user && mine.ready) { setPending(false); if (!mine.ids.has(eventId)) void toggle(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, user, mine.ready]);

  if (past || !isFirebaseConfigured) return null;

  const others = (count ?? 0) - (on ? 1 : 0);
  const tally = count === undefined || count <= 0 ? null
    : on ? (others > 0 ? `You and ${others} other${others === 1 ? '' : 's'} are going` : null)
    : `${count} going on CalgaryWatch`;

  return (
    <div className="cw-going" data-compact={compact}>
      <button
        type="button"
        className="cw-going-btn"
        data-on={on}
        aria-pressed={user ? on : undefined}
        disabled={busy || (!!user && !mine.ready)}
        onClick={async () => {
          if (user) { void toggle(!on); return; }
          // Remember the tap across sign-in; forget it if sign-in was cancelled.
          setPending(true);
          await signIn();
          if (!auth?.currentUser) setPending(false);
        }}
      >
        {on ? <Check size={18} aria-hidden="true" /> : <Ticket size={18} aria-hidden="true" />}
        {on ? 'You’re going' : 'I’m going'}
        {on && !compact ? <span className="cw-going-undo">Undo</span> : null}
      </button>
      <p className={compact && !error ? 'cw-sr' : 'cw-going-note'} role="status">
        {error || tally || (!user ? 'Sign in with Google to save it to your plans.' : on ? 'Saved to your plans. Only the total is public.' : 'Only the total is public, never who’s going.')}
      </p>
    </div>
  );
}
