import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BADGES, type BadgeId } from '../../lib/badges';
import { Tilt } from './Motion';
import { interestLabel, type EventInterestId, type PickItem } from '../../lib/eventPicks';
import { emailPlan, partOfDay } from '../../lib/memberHome';
import { BadgeMark } from './BadgeMark';

/**
 * The email the reader is building, drawn live beside the form: their name,
 * their area, their interests, the real picks. Seeing the payoff while they
 * choose is what makes the choices feel worth finishing.
 */
export function SignupPreview({ name, area, interests, weekly, events, picks, unlocks, now }: {
  name: string; area: string; interests: EventInterestId[]; weekly: boolean; events: boolean;
  picks: PickItem[]; unlocks: BadgeId[]; now: number;
}) {
  const plan = emailPlan(weekly, events, now);
  const place = area || 'your neighbourhood';
  const possessive = /s$/i.test(place) ? `${place}’` : `${place}’s`;
  const subline = plan.kind === 'thursday' ? `Here’s what’s on near ${place}.` : plan.kind === 'monday' ? `Here’s ${possessive} week.` : `Here’s ${possessive} whole week.`;
  const kicker = plan.kind === 'combined' ? 'Your week' : plan.kind === 'thursday' ? 'Thursday picks' : 'Monday brief';
  const reduce = useReducedMotion();
  const swap = { initial: reduce ? false : { opacity: 0, y: 8, filter: 'blur(4px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)' }, exit: { opacity: 0, y: -8, filter: 'blur(4px)' }, transition: { duration: 0.28 } } as const;
  return (
    <div className="pl-preview">
      <p className="pl-kicker"><span className="pl-live-dot" aria-hidden="true" /> Live preview · your first email</p>
      <div className="pl-stack">
      <span className="pl-sheet pl-sheet-a" aria-hidden="true" />
      <span className="pl-sheet pl-sheet-b" aria-hidden="true" />
      <Tilt className="pl-tilt">
      <motion.div className="pl-mock" data-kind={plan.kind} aria-hidden="true" layout={!reduce} transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
        {plan.kind === 'none' ? (
          <div className="pl-mock-off">
            <strong>No email ticked</strong>
            <span>Your picks, plans and badges still live here. Tick an email to get your week delivered.</span>
          </div>
        ) : (
          <>
            <div className="pl-mock-top">
              <span className="pl-mock-logo">CALGARY<b>WATCH</b><i>•</i></span>
              <AnimatePresence mode="wait" initial={false}><motion.span key={kicker} className="pl-mock-pill" {...swap}>{kicker}</motion.span></AnimatePresence>
            </div>
            <div className="pl-mock-rule" />
            <p className="pl-mock-hi">{partOfDay(now)}, {name || 'neighbour'}.</p>
            <AnimatePresence mode="wait" initial={false}><motion.p key={subline} className="pl-mock-sub" {...swap}>{subline}</motion.p></AnimatePresence>
            {plan.kind === 'combined' ? (
              <div className="pl-mock-tiles">
                <span data-tone="coral"><b>4</b>Reported nearby</span>
                <span data-tone="sun"><b>{Math.min(5, picks.length) || 5}</b>Picks for you</span>
                <span data-tone="cyan"><b>1</b>You’re going</span>
              </div>
            ) : null}
            {plan.kind !== 'thursday' ? (
              <div className="pl-mock-sec">
                <span className="pl-mock-h">{plan.kind === 'combined' ? '01 · Near home' : 'Near home'}</span>
                <span className="pl-mock-row" data-tone="coral"><b>240 m</b>Break and enter reported on the 200 block</span>
                <span className="pl-mock-row" data-tone="sun"><b>1.0 km</b>Lane closure at 12 Ave and 4 St SW</span>
              </div>
            ) : null}
            {plan.kind !== 'monday' ? (
              <div className="pl-mock-sec">
                <span className="pl-mock-h">{plan.kind === 'combined' ? '02 · Out & about' : 'Picked for you'}</span>
                {(picks.length ? picks.slice(0, 2) : []).map((p) => <span key={p.key} className="pl-mock-row" data-tone="sun"><b>{new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short' }).format(new Date(p.start))}</b>{p.title}</span>)}
                {!picks.length ? <span className="pl-mock-row" data-tone="sun"><b>Sat</b>{interests.length ? 'Your picks appear here' : 'Pick interests below'}</span> : null}
              </div>
            ) : null}
            {interests.length && plan.kind !== 'monday' ? (
              <div className="pl-mock-tags">{interests.slice(0, 4).map((i) => <span key={i}>{interestLabel(i)}</span>)}{interests.length > 4 ? <span>+{interests.length - 4}</span> : null}</div>
            ) : null}
          </>
        )}
      </motion.div>
      </Tilt>
      </div>
      {plan.kind !== 'none' ? <p className="pl-preview-when"><strong>{plan.cadence}</strong> · {plan.inside}</p> : null}
      {unlocks.length ? (
        <div className="pl-unlocks">
          <p className="pl-kicker">You’ll unlock when you save</p>
          <ul>
            <AnimatePresence initial={false}>
              {unlocks.map((id) => {
                const b = BADGES.find((x) => x.id === id)!;
                return (
                  <motion.li
                    key={id} layout={!reduce}
                    initial={reduce ? false : { opacity: 0, scale: 0.4, rotate: -25 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                  >
                    <BadgeMark badge={{ ...b, unlocked: true }} size={44} /><span>{b.label}</span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
