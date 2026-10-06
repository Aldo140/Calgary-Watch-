import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Mail } from 'lucide-react';
import { useAuth } from '../FirebaseProvider';
import { interestLabel, type EventInterestId } from '../../lib/eventPicks';
import { setEmailOptIn, usePlansProfile } from '../../lib/plans';
import { celebrateBadge } from './BadgeToast';
import '../../styles/plans.css';

/**
 * "More like this, every Thursday", offered on an event page to anyone not
 * already on the list. Signed in, it's one tap and seeds their interests from
 * this event; signed out, it opens the sign-up with those interests ticked.
 */
export function ThursdayNudge({ interests }: { interests: EventInterestId[] }) {
  const { user } = useAuth();
  const profile = usePlansProfile(user?.uid);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  if (user && (!profile || (profile.eventsDigestOptIn && state !== 'done'))) return null;

  const what = interests.length ? interests.slice(0, 2).map((i) => interestLabel(i).toLowerCase()).join(' and ') : 'things like this';
  const signupUrl = `/plans?email=thursday${interests.length ? `&interests=${interests.join(',')}` : ''}#emails`;

  if (state === 'done') {
    return (
      <div className="cw-nudge" data-done="true" role="status">
        <Check size={18} aria-hidden="true" />
        <p><strong>You’re on the list.</strong> Your first Thursday picks arrive next Thursday morning. <Link to="/plans">Fine-tune them</Link></p>
      </div>
    );
  }
  return (
    <div className="cw-nudge">
      <Mail size={18} aria-hidden="true" />
      <p><strong>Like this?</strong> Get {what} picks near home every Thursday. Free, one-click unsubscribe.</p>
      {user ? (
        <button type="button" disabled={state === 'busy'} onClick={async () => {
          setState('busy');
          try { await setEmailOptIn(user, profile, { events: true, addInterests: interests }); setState('done'); celebrateBadge('on-the-list'); }
          catch { setState('error'); }
        }}>{state === 'busy' ? 'Adding…' : state === 'error' ? 'Try again' : 'Send me Thursday picks'}</button>
      ) : <Link to={signupUrl}>Get Thursday picks</Link>}
    </div>
  );
}
