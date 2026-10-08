import React, { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Baby, Check, HeartHandshake, Lock, MapPin, Mic, Music, Palette, Search, Store, Ticket, Trees, Trophy, UtensilsCrossed,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { EVENT_INTERESTS, type EventInterestId } from '../../lib/eventPicks';
import type { PendingOptOuts, PlansDraft } from '../../lib/plans';

/**
 * The sign-up side of /plans: one question at a time, in the site's own
 * look (sky, ink outlines, Bricolage headings, the CalgaryWatch mark).
 * PlansPage owns the draft and saving; these components only draw it.
 */

type CoverKind = 'week' | 'monday' | 'thursday';
const COVER_TITLE: Record<CoverKind, [string, string]> = { week: ['Your', 'week'], monday: ['Monday', 'brief'], thursday: ['Thursday', 'picks'] };

/** Square cover art for an email, printed with the reader's neighbourhood. */
export function Cover({ kind, area }: { kind: CoverKind; area?: string }) {
  const [a, b] = COVER_TITLE[kind];
  return (
    <span className="su-cover" data-kind={kind} aria-hidden="true">
      <svg className="su-cover-art" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
        {kind === 'monday' ? (
          <g fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.5">
            <circle cx="138" cy="70" r="22" /><circle cx="138" cy="70" r="46" /><circle cx="138" cy="70" r="72" /><circle cx="138" cy="70" r="100" />
            <circle cx="138" cy="70" r="7" fill="#ff5a4e" stroke="none" />
          </g>
        ) : kind === 'thursday' ? (
          <g fill="rgba(6,22,47,.85)">
            <path d="M150 22l7 18 18 7-18 7-7 18-7-18-18-7 18-7z" />
            <path d="M104 60l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" opacity=".5" />
          </g>
        ) : (
          // Calgary from the river: the Tower, a few towers, the Saddledome.
          <g fill="rgba(6,22,47,.55)">
            <rect x="6" y="150" width="20" height="50" /><rect x="28" y="128" width="16" height="72" /><rect x="46" y="140" width="12" height="60" />
            <rect x="66" y="88" width="7" height="112" /><rect x="58" y="78" width="23" height="12" rx="4" /><rect x="68.5" y="54" width="2" height="24" />
            <rect x="86" y="112" width="18" height="88" /><rect x="106" y="98" width="14" height="102" /><rect x="122" y="132" width="16" height="68" />
            <path d="M140 200v-22q15-14 30-4 15-10 30 4v22z" />
          </g>
        )}
      </svg>
      <span className="su-cover-title"><span>{a}</span><span>{b}</span></span>
      {area ? <span className="su-cover-area">{area}</span> : null}
    </span>
  );
}

export function SignupHero({ editing, signedIn, onSignIn }: { editing: boolean; signedIn: boolean; onSignIn: () => void }) {
  return (
    <header className="su-hero">
      <p className="su-kicker">{editing ? 'Edit your CalgaryWatch' : <>Your CalgaryWatch <b>Free</b></>}</p>
      <h1>Calgary, <em>your way.</em></h1>
      <p className="su-lead">{editing ? 'Change your area, emails or interests. Your plans and badges stay put.' : 'Three quick questions. Then we send what happened near home and what’s worth going to, once a week.'}</p>
      {!signedIn && !editing ? <p className="su-already">Already signed up? <button type="button" onClick={onSignIn}>Sign in</button></p> : null}
      <img className="su-mark" src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" width="132" height="132" aria-hidden="true" />
    </header>
  );
}

const TILE_ICON: Record<EventInterestId, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  music: Music, arts: Palette, family: Baby, food: UtensilsCrossed, markets: Store,
  sports: Trophy, outdoors: Trees, learning: Mic, community: HeartHandshake, free: Ticket,
};

export const SIGNUP_STEPS = ['Home', 'Emails', 'Interests'] as const;

export interface SignupFormProps {
  formRef: React.RefObject<HTMLFormElement | null>;
  step: number;
  setStep: (n: number) => void;
  draft: PlansDraft;
  setDraft: Dispatch<SetStateAction<PlansDraft>>;
  progress: boolean[];
  suggestions: string[];
  communityCount: number;
  needsConsent: boolean;
  pending: PendingOptOuts;
  error: string;
  setError: (e: string) => void;
  saving: boolean;
  disabled: boolean;
  signedIn: boolean;
  hasPlans: boolean;
  editing: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  onToggleInterest: (id: EventInterestId) => void;
}

export function SignupForm(p: SignupFormProps) {
  const { draft, setDraft, step } = p;
  const reduce = useReducedMotion();
  const headRef = useRef<HTMLHeadingElement>(null);
  const shown = useRef(step);
  const last = step === SIGNUP_STEPS.length - 1;
  const hasArea = Boolean(draft.neighborhood.trim() || draft.address.trim());
  const [byAddress, setByAddress] = useState(Boolean(draft.address));

  // Move focus to each new question so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    headRef.current?.focus({ preventScroll: true });
    const top = p.formRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 70) p.formRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const blocker = step === 0
    ? (!hasArea ? 'Add your neighbourhood or a street address to keep going.' : p.needsConsent && !draft.consent ? 'Tick the box so we can keep your area on file.' : '')
    : step === 2 && draft.eventsDigestOptIn && !draft.interests.length ? 'Pick at least one, or go back and untick event picks.' : '';

  const next = () => {
    if (blocker) { p.setError(blocker); return; }
    p.setError('');
    if (last) p.onSubmit(); else p.setStep(step + 1);
  };
  const cta = p.saving ? 'Saving…' : !last ? 'Next' : p.signedIn ? (p.hasPlans ? 'Save changes' : 'Finish') : 'Continue with Google';

  return (
    <form ref={p.formRef} className="su-card" onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
      <ol className="su-steps" aria-label={`Step ${step + 1} of ${SIGNUP_STEPS.length}`}>
        {SIGNUP_STEPS.map((label, i) => (
          <li key={label} data-state={i < step ? 'done' : i === step ? 'now' : 'next'}>
            <button type="button" disabled={i > step} onClick={() => { p.setError(''); p.setStep(i); }} aria-current={i === step ? 'step' : undefined}>
              <span className="su-steps-dot">{i < step ? <Check size={13} strokeWidth={3.5} /> : i + 1}</span>
              <span className="su-steps-label">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          className="su-pane"
          initial={reduce ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: -24 }}
          transition={{ duration: 0.22, ease: [0.2, 0.9, 0.3, 1] }}
        >
          {step === 0 ? (
            <div id="pl-step-home" className="su-q">
              <h2 ref={headRef} tabIndex={-1}>Where’s home?</h2>
              <p className="su-help">Your neighbourhood is enough. We use it to show what’s near you.</p>
              {!byAddress ? (
                <label className="su-input">
                  <Search size={20} aria-hidden="true" />
                  <span className="sr-only">Neighbourhood</span>
                  <input
                    value={draft.neighborhood}
                    onChange={(e) => { p.setError(''); setDraft((d) => ({ ...d, neighborhood: e.target.value, inferredNeighborhood: '' })); }}
                    placeholder="e.g. Bridgeland"
                    autoComplete="off"
                    enterKeyHint="next"
                    aria-describedby="pl-hood-hint"
                  />
                  {draft.neighborhood && !p.suggestions.length ? <Check className="su-input-ok" size={20} strokeWidth={3} aria-hidden="true" /> : null}
                </label>
              ) : (
                <label className="su-input">
                  <MapPin size={20} aria-hidden="true" />
                  <span className="sr-only">Street address</span>
                  <input
                    value={draft.address}
                    onChange={(e) => { p.setError(''); setDraft((d) => ({ ...d, address: e.target.value, inferredNeighborhood: '' })); }}
                    placeholder="e.g. 201 8 Av SW"
                    autoComplete="street-address"
                    enterKeyHint="next"
                  />
                </label>
              )}
              {p.suggestions.length && !byAddress ? (
                <div className="su-suggest" aria-label="Matching neighbourhoods">
                  {p.suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => setDraft((d) => ({ ...d, neighborhood: s, inferredNeighborhood: '', address: '' }))}>
                      <MapPin size={14} aria-hidden="true" /> {s}
                    </button>
                  ))}
                </div>
              ) : (
                <p id="pl-hood-hint" className="su-hint">
                  {byAddress
                    ? <button type="button" className="su-link" onClick={() => { setByAddress(false); setDraft((d) => ({ ...d, address: '', inferredNeighborhood: '' })); }}>Use a neighbourhood instead</button>
                    : <>{p.communityCount > 100 ? `All ${p.communityCount} Calgary communities. ` : ''}<button type="button" className="su-link" onClick={() => { setByAddress(true); setDraft((d) => ({ ...d, neighborhood: '', inferredNeighborhood: '' })); }}>Use a street address</button></>}
                </p>
              )}
              {p.needsConsent ? (
                <label className="su-consent">
                  <input type="checkbox" checked={draft.consent} onChange={(e) => { p.setError(''); setDraft((d) => ({ ...d, consent: e.target.checked })); }} />
                  <span className="su-box" aria-hidden="true"><Check size={14} strokeWidth={3.5} /></span>
                  <span>Keep my area on my account so my emails and picks work. It’s never shown to anyone. <Link to="/privacy">What we keep</Link></span>
                </label>
              ) : null}
            </div>
          ) : step === 1 ? (
            <div id="emails" className="su-q">
              <h2 ref={headRef} tabIndex={-1}>What should we send?</h2>
              <p className="su-help">Pick one, both or none. Free, and one click to stop.</p>
              {p.pending.monday || p.pending.thursday ? (
                <p className="su-hint" role="status">You unsubscribed from the {[p.pending.monday ? 'safety' : '', p.pending.thursday ? 'event picks' : ''].filter(Boolean).join(' and ')} email by link, so it’s unticked.</p>
              ) : null}
              <div className="su-mails">
                <label className="su-mail" data-on={draft.weeklyDigestOptIn}>
                  <input type="checkbox" checked={draft.weeklyDigestOptIn} onChange={(e) => setDraft((d) => ({ ...d, weeklyDigestOptIn: e.target.checked }))} />
                  <span className="su-mail-cover"><Cover kind="monday" /></span>
                  <span className="su-mail-text">
                    <small>Mondays</small>
                    <strong>Safety near home</strong>
                    <span>Police news, 311, outages and neighbours’ reports near you.</span>
                  </span>
                  <span className="su-tick" aria-hidden="true"><Check size={16} strokeWidth={3.5} /></span>
                </label>
                <label className="su-mail" data-on={draft.eventsDigestOptIn}>
                  <input type="checkbox" checked={draft.eventsDigestOptIn} onChange={(e) => setDraft((d) => ({ ...d, eventsDigestOptIn: e.target.checked }))} />
                  <span className="su-mail-cover"><Cover kind="thursday" /></span>
                  <span className="su-mail-text">
                    <small>{draft.weeklyDigestOptIn ? 'With Monday’s email' : 'Thursdays'}</small>
                    <strong>Things to do</strong>
                    <span>Up to eight events picked for what you’re into.</span>
                  </span>
                  <span className="su-tick" aria-hidden="true"><Check size={16} strokeWidth={3.5} /></span>
                </label>
              </div>
              {draft.weeklyDigestOptIn && draft.eventsDigestOptIn ? <p className="su-hint">Both come together as one Monday email.</p> : null}
            </div>
          ) : (
            <div id="pl-step-interests" className="su-q">
              <h2 ref={headRef} tabIndex={-1}>What are you into?</h2>
              <p className="su-help">{draft.eventsDigestOptIn ? 'Tap a few. Your event picks come from these.' : 'Optional. Tap a few to tune what we show you.'}</p>
              <div className="su-tiles">
                {EVENT_INTERESTS.map((i) => {
                  const on = draft.interests.includes(i.id);
                  const Icon = TILE_ICON[i.id];
                  return (
                    <button key={i.id} type="button" className="su-tile" data-id={i.id} aria-pressed={on} onClick={() => { p.setError(''); p.onToggleInterest(i.id); }}>
                      <span className="su-tile-icon" aria-hidden="true">{on ? <Check size={20} strokeWidth={3.5} /> : <Icon size={20} strokeWidth={2.2} />}</span>
                      <strong>{i.label}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {p.error ? <p className="su-error" role="alert">{p.error}</p> : null}

      <div className="su-foot">
        {step > 0 ? (
          <button type="button" className="su-back" onClick={() => { p.setError(''); p.setStep(step - 1); }}><ArrowLeft size={18} aria-hidden="true" /> Back</button>
        ) : p.editing ? (
          <button type="button" className="su-back" onClick={p.onCancel}>Cancel</button>
        ) : <span />}
        <button type="submit" className="su-next" data-last={last} disabled={p.saving || (last && p.disabled)}>
          {cta} <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
      {last ? <p className="su-fine"><Lock size={12} aria-hidden="true" /> Free. One click to stop any email.{!p.signedIn ? ' Your answers are kept through sign-in.' : ''}</p> : null}
    </form>
  );
}

/** What you're building, beside the questions on a wide screen. */
export function SignupSummary({ draft, area, progress }: { draft: PlansDraft; area: string; progress: boolean[] }) {
  const both = draft.weeklyDigestOptIn && draft.eventsDigestOptIn;
  const kind: CoverKind = both ? 'week' : draft.eventsDigestOptIn && !draft.weeklyDigestOptIn ? 'thursday' : draft.weeklyDigestOptIn ? 'monday' : 'week';
  const emails = both ? 'Both, as one Monday email' : draft.weeklyDigestOptIn ? 'Safety near home, Mondays' : draft.eventsDigestOptIn ? 'Things to do, Thursdays' : 'None for now';
  const rows: Array<[string, string]> = [
    ['Home', area || (draft.address.trim() ? 'Street address' : 'Not set yet')],
    ['Emails', emails],
    ['Interests', draft.interests.length ? EVENT_INTERESTS.filter((i) => draft.interests.includes(i.id)).map((i) => i.label).join(', ') : 'None yet'],
  ];
  return (
    <aside className="su-summary" aria-label="Your CalgaryWatch so far">
      <div className="su-summary-cover"><Cover kind={kind} area={area} /></div>
      <ul>
        {rows.map(([k, v], i) => (
          <li key={k} data-done={progress[i]}>
            <span className="su-summary-dot" aria-hidden="true">{progress[i] ? <Check size={12} strokeWidth={3.5} /> : null}</span>
            <span><small>{k}</small>{v}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
