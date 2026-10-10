import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, MapPin } from 'lucide-react';
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
  if (!import.meta.env.DEV || typeof window === 'undefined' || new URLSearchParams(window.location.search).get('demo') !== 'member') return null;
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
    const count = picks?.picks.length ?? 0;
    const first = (user.displayName || '').split(' ')[0];
    return (
      <motion.section className="h-yours" data-state="member" aria-labelledby="h-yours-title" {...enter}>
        <div className="h-yours-copy">
          <p className="h-yours-kicker">
            <span className="h-yours-avatar">{user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : (first || 'Y').slice(0, 1)}</span>
            <span>Your CalgaryWatch</span>
            {area ? <span className="h-yours-tag"><MapPin size={12} aria-hidden="true" /> {area}</span> : null}
          </p>
          <h2 id="h-yours-title">{partOfDay(now)}{first ? <>, <Scribble>{first}.</Scribble></> : '.'}</h2>
          <p className="h-yours-lead">{plan.kind === 'none' ? 'No email on yet. Turn one on and your week lands in your inbox.' : `${plan.name}: ${plan.cadence.replace(/\.$/, '')}.`}</p>
          <div className="h-yours-actions">
            <Link to="/plans" className="h-yours-go">Open your dashboard <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
        </div>
        <ul className="h-yours-deck">
          <li className="h-deck h-deck-navy">
            <span className="h-deck-big">{count}</span>
            <strong>{count === 1 ? 'pick' : 'picks'} for you</strong>
            <small>This week, near {area || 'you'}</small>
          </li>
          <li className="h-deck h-deck-cyan">
            <TicketArt />
            <strong>{next ? next.title : 'No plans yet'}</strong>
            <small>{next ? pickWhen(next.start) : 'Tap “I’m going” on anything'}</small>
          </li>
          <li className="h-deck h-deck-paper">
            <Ring pct={pct} />
            <strong>{pct}% set up</strong>
            <small>{pct === 100 ? 'Every badge in reach' : 'A step or two to go'}</small>
          </li>
        </ul>
      </motion.section>
    );
  }

  if (user) return null; // Profile still loading: no flash of the sign-up pitch.

  return (
    <motion.section className="h-yours" data-state="guest" aria-labelledby="h-yours-title" {...enter}>
      <div className="h-yours-copy">
        <p className="h-yours-kicker"><span>Your CalgaryWatch</span><span className="h-yours-tag">Free</span></p>
        <h2 id="h-yours-title">Make Calgary <Scribble>yours.</Scribble></h2>
        <p className="h-yours-lead">Tell us where home is and what you’re into. Get what happened nearby and what’s worth leaving the house for, in one Monday email.</p>
        <div className="h-yours-actions">
          <Link to="/plans" className="h-yours-go">Sign up free <ArrowUpRight size={18} aria-hidden="true" /></Link>
          <button type="button" className="h-yours-signin" onClick={async () => { await signIn(); navigate('/plans'); }}>I have an account</button>
        </div>
      </div>
      <ul className="h-yours-deck">
        <li className="h-deck h-deck-navy">
          <RadarArt />
          <strong>Safety near home</strong>
          <small>Police, 311 and neighbours</small>
        </li>
        <li className="h-deck h-deck-cyan">
          <TicketArt />
          <strong>Event picks for you</strong>
          <small>Plus “I’m going” reminders</small>
        </li>
        <li className="h-deck h-deck-paper">
          <BadgeArt />
          <strong>Badges as you go</strong>
          <small>For plans, not screen time</small>
        </li>
      </ul>
    </motion.section>
  );
}

/** A hand-drawn underline: the one loose stroke on a card of hard edges. */
export function Scribble({ children }: { children: ReactNode }) {
  return (
    <em className="h-scribble">
      {children}
      <svg viewBox="0 0 200 18" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M3,12 C40,4 70,15 104,8 S170,5 197,10" /></svg>
    </em>
  );
}

export function RadarArt() {
  return (
    <svg className="h-deck-art" viewBox="0 0 80 64" aria-hidden="true" focusable="false">
      <circle cx="40" cy="34" r="27" fill="#0b2a55" stroke="#00c2e0" strokeWidth="2" />
      <circle cx="40" cy="34" r="17" fill="none" stroke="#00c2e0" strokeWidth="1.5" opacity=".6" />
      <circle cx="40" cy="34" r="7" fill="none" stroke="#00c2e0" strokeWidth="1.5" opacity=".6" />
      <path className="h-deck-sweep" d="M40,34L67,34A27,27 0 0 0 58,14Z" fill="#00c2e0" opacity=".45" />
      <path d="M33,36l7,-7l7,7v8h-14z" fill="#ffdf4f" stroke="#151515" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="58" cy="24" r="3.5" fill="#ef4444" stroke="#fff" strokeWidth="1.5" />
      <circle cx="24" cy="46" r="3" fill="#f97316" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

export function TicketArt() {
  return (
    <svg className="h-deck-art" viewBox="0 0 80 64" aria-hidden="true" focusable="false">
      <g transform="rotate(-10 40 32)">
        <path d="M10,14H70V27A6,6 0 0 0 70,39V52H10V39A6,6 0 0 0 10,27Z" fill="#1554d1" stroke="#151515" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M27,16V50" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 3" opacity=".7" />
        <path d="M48,23l3.2,6.5l7.1,1l-5.2,5l1.3,7.1l-6.4,-3.4l-6.4,3.4l1.3,-7.1l-5.2,-5l7.1,-1z" fill="#ffdf4f" stroke="#151515" strokeWidth="1.8" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export function BadgeArt() {
  return (
    <svg className="h-deck-art" viewBox="0 0 80 64" aria-hidden="true" focusable="false">
      <path d="M30,38L22,62L32,56L37,64L42,42Z" fill="#00c2e0" stroke="#151515" strokeWidth="2" strokeLinejoin="round" />
      <path d="M50,38L58,62L48,56L43,64L38,42Z" fill="#1554d1" stroke="#151515" strokeWidth="2" strokeLinejoin="round" />
      <path className="h-deck-rosette" d="M40,4l5,5.5l7.3,-1.4l1.4,7.3l6.6,3.4l-3.4,6.6l3.4,6.6l-6.6,3.4l-1.4,7.3l-7.3,-1.4l-5,5.5l-5,-5.5l-7.3,1.4l-1.4,-7.3l-6.6,-3.4l3.4,-6.6l-3.4,-6.6l6.6,-3.4l1.4,-7.3l7.3,1.4z" fill="#ffdf4f" stroke="#151515" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="40" cy="27" r="9" fill="#fff" stroke="#151515" strokeWidth="2" />
      <path d="M36,27l3,3l5,-6" fill="none" stroke="#151515" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <svg className="h-deck-art" viewBox="0 0 80 64" aria-hidden="true" focusable="false">
      <circle cx="40" cy="32" r={r} fill="none" stroke="#e4e1d8" strokeWidth="9" />
      <circle cx="40" cy="32" r={r} fill="none" stroke="#1554d1" strokeWidth="9" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 40 32)" strokeLinecap="round" />
      <circle cx="40" cy="32" r="9" fill="#ffdf4f" stroke="#151515" strokeWidth="2" />
    </svg>
  );
}
