import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Mail, MapPin, Sparkles, Ticket } from 'lucide-react';
import { useAuth } from '../FirebaseProvider';
import { homeAreaOf, useMyGoing, usePlansProfile } from '../../lib/plans';
import { buildEventPicks, pickWhen } from '../../lib/eventPicks';
import { emailPlan, partOfDay, setupPercent, setupSteps } from '../../lib/memberHome';
import { discoveryRepository } from '../../data/discovery';

/**
 * The homepage's door to Your CalgaryWatch, sitting on the hero's torn edge.
 * Signed in: a personal strip (your picks, your next plan, what arrives
 * Monday) with one tap into the dashboard. Signed out: why it's worth having,
 * and the sign-up. Either way the dashboard is one tap from the front page.
 */
/** Development only: `/?demo=member` previews the signed-in strip without Firebase. */
function demoMember() {
  if (!import.meta.env.DEV || typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('demo')) return null;
  return {
    user: { uid: 'demo', displayName: 'Vicky Penny', photoURL: '' } as unknown as NonNullable<ReturnType<typeof useAuth>['user']>,
    profile: { displayName: 'Vicky Penny', neighborhood: 'Beltline', piiConsentAt: 1, weeklyDigestOptIn: true, eventsDigestOptIn: true, eventInterests: ['music', 'food'] } as NonNullable<ReturnType<typeof usePlansProfile>>,
  };
}

export function HomeYours() {
  const auth = useAuth();
  const demo = useMemo(demoMember, []);
  const user = demo?.user ?? auth.user;
  const { signIn } = auth;
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const liveProfile = usePlansProfile(demo ? undefined : user?.uid);
  const profile = demo?.profile ?? liveProfile;
  const going = useMyGoing(demo ? undefined : user?.uid);
  const now = Date.now();

  const picks = useMemo(() => {
    if (!profile) return null;
    return buildEventPicks({
      entities: discoveryRepository.list(), occurrences: discoveryRepository.occurrences(),
      interests: profile.eventInterests, homeArea: homeAreaOf(profile), goingIds: going.ids, days: 10, limit: 8,
    });
  }, [profile, going.ids]);

  const enter = { initial: reduce ? false : { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { type: 'spring' as const, stiffness: 150, damping: 20 } };

  if (user && profile) {
    const area = homeAreaOf(profile);
    const plan = emailPlan(profile.weeklyDigestOptIn === true, profile.eventsDigestOptIn, now);
    const pct = setupPercent(setupSteps({
      hasHomeArea: Boolean(area), weekly: profile.weeklyDigestOptIn === true, events: profile.eventsDigestOptIn,
      interestCount: profile.eventInterests.length, goingCount: going.ids.size,
    }));
    const next = picks?.going[0];
    const first = (user.displayName || '').split(' ')[0];
    return (
      <motion.section className="h-yours" data-state="member" aria-labelledby="h-yours-title" {...enter}>
        <div className="h-yours-who">
          <span className="h-yours-avatar">{user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : (first || 'Y').slice(0, 1)}</span>
          <div>
            <p className="h-yours-kicker">Your CalgaryWatch{area ? <> · <MapPin size={12} aria-hidden="true" /> {area}</> : null}</p>
            <h2 id="h-yours-title">{partOfDay(now)}{first ? `, ${first}` : ''}. <em>{picks?.picks.length ? `${picks.picks.length} picks for you this week.` : 'Your week, in one place.'}</em></h2>
          </div>
        </div>
        <ul className="h-yours-facts">
          <li><Ticket size={16} aria-hidden="true" /><span><strong>{next ? next.title : 'No plans yet'}</strong><small>{next ? pickWhen(next.start) : 'Tap “I’m going” on anything'}</small></span></li>
          <li><Mail size={16} aria-hidden="true" /><span><strong>{plan.kind === 'none' ? 'No email yet' : plan.name}</strong><small>{plan.kind === 'none' ? 'Turn one on in a tap' : plan.cadence}</small></span></li>
          <li><Sparkles size={16} aria-hidden="true" /><span><strong>{pct}% set up</strong><small>{pct === 100 ? 'Every badge in reach' : 'A step or two to go'}</small></span></li>
        </ul>
        <Link to="/plans" className="h-yours-go">Open your dashboard <ArrowUpRight size={18} aria-hidden="true" /></Link>
      </motion.section>
    );
  }

  if (user) return null; // Profile still loading: no flash of the sign-up pitch.

  return (
    <motion.section className="h-yours" data-state="guest" aria-labelledby="h-yours-title" {...enter}>
      <div className="h-yours-who">
        <div>
          <p className="h-yours-kicker">Your CalgaryWatch · free</p>
          <h2 id="h-yours-title">Make Calgary <em>yours.</em></h2>
          <p className="h-yours-lead">Tell us where home is and what you’re into. Get what happened nearby and what’s worth leaving the house for, in one Monday email.</p>
        </div>
      </div>
      <ul className="h-yours-facts">
        <li><MapPin size={16} aria-hidden="true" /><span><strong>Safety near home</strong><small>Police, 311 and neighbours</small></span></li>
        <li><Ticket size={16} aria-hidden="true" /><span><strong>Event picks for you</strong><small>Plus “I’m going” reminders</small></span></li>
        <li><Sparkles size={16} aria-hidden="true" /><span><strong>Badges as you go</strong><small>For plans, not screen time</small></span></li>
      </ul>
      <div className="h-yours-actions">
        <Link to="/plans" className="h-yours-go">Sign up free <ArrowUpRight size={18} aria-hidden="true" /></Link>
        <button type="button" className="h-yours-signin" onClick={async () => { await signIn(); navigate('/plans'); }}>I have an account</button>
      </div>
    </motion.section>
  );
}
