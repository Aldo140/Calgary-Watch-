import React, { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Baby, Check, HeartHandshake, Lock, MapPin, Mic, Music, Palette, Search, Store, Ticket, Trees, Trophy, UtensilsCrossed,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CalgarySky, type SkyVariant } from '../home/CalgarySky';
import { TEAR } from '../home/HomeHero';
import { RadarArt, Scribble, TicketArt } from '../home/HomeYours';
import { useCalgaryWeather } from '../../hooks/useCalgaryWeather';
import { describeSky, type SkyIcon } from '../../lib/weatherCodes';
import { moonPhase, skyPalette, sunPosition } from '../../lib/sky';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { EVENT_INTERESTS, type EventInterestId } from '../../lib/eventPicks';
import type { PendingOptOuts, PlansDraft } from '../../lib/plans';
import '../../styles/home.css';
import '../../styles/home-board.css';
import '../../styles/home-v3.css';

/**
 * The sign-up side of /plans, picking up exactly where the homepage's
 * "Make Calgary yours" card leaves off: the same live Calgary sky, the same
 * yellow card on its torn edge, the same three dealt cards. Here the cards
 * are the steps, and each one fills in with your answer as you go.
 * PlansPage owns the draft and saving; these components only draw it.
 */

const clock = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });
const variantFor = (w: number): SkyVariant => (w <= 720 ? 'mobile' : w <= 1024 ? 'tablet' : 'desktop');

/** The homepage's live sky (sun where it really is, today's weather), cut short. */
export function SignupSky({ editing, signedIn, area, onSignIn }: { editing: boolean; signedIn: boolean; area: string; onSignIn: () => void }) {
  const weather = useCalgaryWeather();
  const [now, setNow] = useState(() => Date.now());
  const [variant, setVariant] = useState<SkyVariant>(() => (typeof window === 'undefined' ? 'desktop' : variantFor(window.innerWidth)));
  useEffect(() => {
    const onResize = () => setVariant(variantFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    const tick = window.setInterval(() => setNow(Date.now()), 5 * 60 * 1000);
    return () => { window.removeEventListener('resize', onResize); clearInterval(tick); };
  }, []);
  const current = weather.current;
  const sun = sunPosition(new Date(now));
  const cloudCover = current?.cloudCover ?? 0;
  const palette = skyPalette(sun.altitude, cloudCover);
  const sky = current ? describeSky(current.code, current.isDay) : null;
  const precip: SkyIcon | null = sky && (sky.wet || sky.icon === 'fog') ? sky.icon : null;

  return (
    <section className="su-sky" data-tone={palette.tone} style={{ background: palette.top }} aria-labelledby="su-title">
      <CalgarySky palette={palette} sun={sun} phase={moonPhase(new Date(now))} cloudCover={cloudCover} windKph={current?.windKph ?? 8} precip={precip} variant={variant} now={Math.floor(now / 300000)} />
      <div className="cw-wrap su-sky-inner">
        <p className="su-dateline">
          <span className="h-dateline-live"><span className="h-pulse" aria-hidden="true" />Live sky · {clock.format(new Date(now))}</span>
          <span className="su-chip"><MapPin size={13} aria-hidden="true" /> {area || 'Calgary'}</span>
        </p>
        <h1 id="su-title">
          {editing ? <>Your Calgary, <Scribble>your way.</Scribble></> : <>Make Calgary <Scribble>yours.</Scribble></>}
        </h1>
        <p className="su-lead">{editing ? 'Change your area, emails or interests. Your plans and badges stay put.' : 'Three quick questions, about a minute. Free.'}</p>
        {!signedIn && !editing ? <p className="su-already">Already signed up? <button type="button" onClick={onSignIn}>Sign in</button></p> : null}
        <img className="su-mark" src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" width="160" height="160" aria-hidden="true" />
      </div>
      <svg className="h-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={TEAR} transform="translate(0 -5)" className="h-tear-shade" />
        <path d={TEAR} className="h-tear-paper" />
      </svg>
    </section>
  );
}

/** An envelope in the homepage's deck style: ink outline, flat fills, one seal. */
function EnvelopeArt() {
  return (
    <svg className="h-deck-art" viewBox="0 0 80 64" aria-hidden="true" focusable="false">
      <g transform="rotate(6 40 34)">
        <rect x="12" y="16" width="56" height="38" rx="4" fill="#fff" stroke="#151515" strokeWidth="2.5" />
        <path d="M13,18L40,38L67,18" fill="none" stroke="#151515" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="40" cy="38" r="7" fill="#ffdf4f" stroke="#151515" strokeWidth="2" />
        <path d="M36.5,38l2.5,2.5l4,-5" fill="none" stroke="#151515" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
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
  area: string;
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
  const go = (i: number) => { if (i <= step) { p.setError(''); p.setStep(i); } };
  const cta = p.saving ? 'Saving…' : !last ? 'Next' : p.signedIn ? (p.hasPlans ? 'Save changes' : 'Finish') : 'Continue with Google';

  const both = draft.weeklyDigestOptIn && draft.eventsDigestOptIn;
  const picked = EVENT_INTERESTS.filter((i) => draft.interests.includes(i.id)).map((i) => i.label);
  const deck = [
    { tone: 'navy', art: <RadarArt />, label: 'Home', value: p.area || (draft.address.trim() ? 'Street address' : 'Where’s home?') },
    { tone: 'cyan', art: <EnvelopeArt />, label: 'Emails', value: both ? 'Monday, all in one' : draft.weeklyDigestOptIn ? 'Safety, Mondays' : draft.eventsDigestOptIn ? 'Things to do, Thursdays' : 'None for now' },
    { tone: 'paper', art: <TicketArt />, label: 'Interests', value: picked.length ? (picked.length > 2 ? `${picked.slice(0, 2).join(', ')} +${picked.length - 2}` : picked.join(', ')) : 'What you’re into' },
  ];

  return (
    <form ref={p.formRef} className="su-card" onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
      <p className="su-kicker"><span>{p.editing ? 'Edit your CalgaryWatch' : 'Your CalgaryWatch'}</span><span className="su-tag">Step {step + 1} of 3</span></p>

      {/* The homepage's three dealt cards, now the steps. Each fills in with your answer. */}
      <ol className="su-deck" aria-label="Your answers so far">
        {deck.map((c, i) => {
          const state = i === step ? 'now' : i < step ? 'done' : 'next';
          return (
            <li key={c.label} className="su-deal" data-tone={c.tone} data-state={state}>
              <button type="button" onClick={() => go(i)} disabled={i > step} aria-current={i === step ? 'step' : undefined}>
                {c.art}
                <small>{String(i + 1).padStart(2, '0')} · {c.label}</small>
                <strong>{c.value}</strong>
                {state === 'done' ? <span className="su-stamp" aria-hidden="true"><Check size={14} strokeWidth={3.5} /></span> : null}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="su-ask">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            className="su-pane"
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: [0.2, 0.9, 0.3, 1] }}
          >
            {step === 0 ? (
              <div id="pl-step-home" className="su-q">
                <h2 ref={headRef} tabIndex={-1}>Where’s home?</h2>
                <p className="su-help">Your neighbourhood is enough. Everything starts near there.</p>
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
                  <label className="su-mail" data-on={draft.weeklyDigestOptIn} data-tone="navy">
                    <input type="checkbox" checked={draft.weeklyDigestOptIn} onChange={(e) => setDraft((d) => ({ ...d, weeklyDigestOptIn: e.target.checked }))} />
                    <span className="su-mail-art"><RadarArt /></span>
                    <span className="su-mail-text">
                      <small>Mondays</small>
                      <strong>Safety near home</strong>
                      <span>Police news, 311, outages and neighbours’ reports near you.</span>
                    </span>
                    <span className="su-tick" aria-hidden="true"><Check size={16} strokeWidth={3.5} /></span>
                  </label>
                  <label className="su-mail" data-on={draft.eventsDigestOptIn} data-tone="cyan">
                    <input type="checkbox" checked={draft.eventsDigestOptIn} onChange={(e) => setDraft((d) => ({ ...d, eventsDigestOptIn: e.target.checked }))} />
                    <span className="su-mail-art"><TicketArt /></span>
                    <span className="su-mail-text">
                      <small>{draft.weeklyDigestOptIn ? 'With Monday’s email' : 'Thursdays'}</small>
                      <strong>Things to do</strong>
                      <span>Up to eight events picked for what you’re into.</span>
                    </span>
                    <span className="su-tick" aria-hidden="true"><Check size={16} strokeWidth={3.5} /></span>
                  </label>
                </div>
                {both ? <p className="su-hint">Both arrive together, as one Monday email.</p> : null}
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
                        <span className="su-tile-icon" aria-hidden="true">{on ? <Check size={18} strokeWidth={3.5} /> : <Icon size={18} strokeWidth={2.2} />}</span>
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
      </div>
    </form>
  );
}
