import React, { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, Baby, Check, HeartHandshake, Lock, MapPin, Mic, Music, Palette, Play, Search, Sparkles, Store, Ticket, Trees, Trophy, UtensilsCrossed,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { EVENT_INTERESTS, type EventInterestId } from '../../lib/eventPicks';
import type { PendingOptOuts, PlansDraft } from '../../lib/plans';

/**
 * The sign-up side of /plans, in the site's Spotify-style language: near-black
 * page, album-cover art for each email, genre tiles for interests, a green
 * play button, and a "now playing" bar that carries the save button.
 * PlansPage owns all state; these components only draw it.
 */

type CoverKind = 'week' | 'monday' | 'thursday';

const COVER_TITLE: Record<CoverKind, [string, string]> = {
  week: ['Your', 'week'],
  monday: ['Monday', 'brief'],
  thursday: ['Thursday', 'picks'],
};

/** Square cover art for an email, printed with the reader's own neighbourhood. */
export function Cover({ kind, area, className }: { kind: CoverKind; area?: string; className?: string }) {
  const [a, b] = COVER_TITLE[kind];
  return (
    <span className={`su-cover ${className ?? ''}`} data-kind={kind} aria-hidden="true">
      <svg className="su-cover-art" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
        {kind === 'monday' ? (
          <g fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="1.5">
            <circle cx="138" cy="70" r="22" /><circle cx="138" cy="70" r="46" /><circle cx="138" cy="70" r="72" /><circle cx="138" cy="70" r="100" />
            <circle cx="138" cy="70" r="6" fill="#ff5a4e" stroke="none" />
            <circle cx="104" cy="48" r="3.5" fill="#ffdf4f" stroke="none" /><circle cx="170" cy="112" r="3.5" fill="#00c2e0" stroke="none" />
          </g>
        ) : kind === 'thursday' ? (
          <g fill="rgba(21,21,21,.85)">
            <path d="M150 22l7 18 18 7-18 7-7 18-7-18-18-7 18-7z" />
            <path d="M104 60l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" opacity=".55" />
            <path d="M176 92l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" opacity=".7" />
          </g>
        ) : (
          // Calgary from the river: the Tower, a few towers, the Saddledome.
          <g fill="rgba(10,6,30,.55)">
            <rect x="6" y="150" width="20" height="50" /><rect x="28" y="128" width="16" height="72" /><rect x="46" y="140" width="12" height="60" />
            <rect x="66" y="88" width="7" height="112" /><rect x="58" y="78" width="23" height="12" rx="4" /><rect x="68.5" y="54" width="2" height="24" />
            <rect x="86" y="112" width="18" height="88" /><rect x="106" y="98" width="14" height="102" /><rect x="122" y="132" width="16" height="68" />
            <path d="M140 200v-22q15-14 30-4 15-10 30 4v22z" />
          </g>
        )}
      </svg>
      <img className="su-cover-logo" src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" width="28" height="28" loading="lazy" />
      <span className="su-cover-title"><span>{a}</span><span>{b}</span></span>
      {area ? <span className="su-cover-area">{area}</span> : null}
    </span>
  );
}

export function SignupHero({ editing, signedIn, area, onStart, onSignIn }: {
  editing: boolean; signedIn: boolean; area: string; onStart: () => void; onSignIn: () => void;
}) {
  const reduce = useReducedMotion();
  const fan = (i: number) => (reduce ? {} : {
    initial: { opacity: 0, y: 40, rotate: 0 },
    animate: { opacity: 1, y: 0, rotate: [-9, 2, 11][i] },
    transition: { type: 'spring' as const, stiffness: 140, damping: 16, delay: 0.1 + i * 0.09 },
  });
  return (
    <header className="su-hero">
      <div className="cw-wrap su-hero-grid">
        <div className="su-hero-copy">
          <p className="su-kicker"><span className="su-dot" aria-hidden="true" /> {editing ? 'Edit your CalgaryWatch' : 'Made for Calgarians · free'}</p>
          <h1>Calgary,<br /><em>your way.</em></h1>
          <p className="su-lead">Tell us where home is and what you’re into. Every week we send what happened nearby and what’s worth leaving the house for.</p>
          <p className="su-meta"><strong>CalgaryWatch</strong> · 2 emails · 10 interests · about a minute</p>
          {!editing ? (
            <div className="su-hero-actions">
              <button type="button" className="su-play" onClick={onStart} aria-label="Start building your week">
                <Play size={26} fill="currentColor" aria-hidden="true" />
              </button>
              <span className="su-play-label"><strong>Build my week</strong><small>3 quick steps</small></span>
              {!signedIn ? <button type="button" className="su-ghost" onClick={onSignIn}>I have an account</button> : null}
            </div>
          ) : null}
        </div>
        <div className="su-fan" aria-hidden="true">
          {(['monday', 'week', 'thursday'] as const).map((k, i) => (
            <motion.div key={k} className="su-fan-card" data-i={i} {...fan(i)}>
              <Cover kind={k} area={area} />
            </motion.div>
          ))}
        </div>
      </div>
    </header>
  );
}

const TILE_ICON: Record<EventInterestId, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  music: Music, arts: Palette, family: Baby, food: UtensilsCrossed, markets: Store,
  sports: Trophy, outdoors: Trees, learning: Mic, community: HeartHandshake, free: Ticket,
};

export interface SignupFormProps {
  formRef: RefObject<HTMLFormElement | null>;
  draft: PlansDraft;
  setDraft: Dispatch<SetStateAction<PlansDraft>>;
  progress: boolean[];
  draftArea: string;
  suggestions: string[];
  communityCount: number;
  needsConsent: boolean;
  pending: PendingOptOuts;
  tunedLeft: number;
  error: string;
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
  const { draft, setDraft, progress } = p;
  // The save bar waits until the hero has mostly scrolled away, so it never sits on the first question.
  const [barOn, setBarOn] = useState(false);
  useEffect(() => {
    const hero = document.querySelector('.su-hero');
    if (!hero || typeof IntersectionObserver === 'undefined') { setBarOn(true); return; }
    const io = new IntersectionObserver(([e]) => setBarOn(!e.isIntersecting), { rootMargin: '0px 0px -55% 0px' });
    io.observe(hero);
    return () => io.disconnect();
  }, []);
  const both = draft.weeklyDigestOptIn && draft.eventsDigestOptIn;
  const done = progress.filter(Boolean).length;
  const ready = progress.every(Boolean);
  const plan: CoverKind | null = both ? 'week' : draft.weeklyDigestOptIn ? 'monday' : draft.eventsDigestOptIn ? 'thursday' : null;
  const cta = p.saving ? 'Saving…' : p.signedIn ? (p.hasPlans ? 'Save changes' : 'Save and start my week') : 'Continue with Google';
  const summary = [
    p.draftArea || (draft.address ? 'Street address' : ''),
    draft.interests.length ? `${draft.interests.length} interest${draft.interests.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <form ref={p.formRef} id="su-form" className="su-form" onSubmit={(e) => { e.preventDefault(); p.onSubmit(); }} noValidate>
      <fieldset className="su-step" data-done={progress[0]}>
        <legend className="su-step-head">
          <span className="su-num" aria-hidden="true">{progress[0] ? <Check size={18} strokeWidth={3} /> : '1'}</span>
          <span><small>Step 1 · Home</small>Where’s home?</span>
        </legend>
        <p className="su-help">A neighbourhood is enough. Your emails, your picks and the live map all start from here.</p>
        {!draft.address ? (
          <label className="su-search">
            <Search size={20} aria-hidden="true" />
            <span className="sr-only">Neighbourhood</span>
            <input
              id="su-hood"
              value={draft.neighborhood}
              onChange={(e) => setDraft((d) => ({ ...d, neighborhood: e.target.value, inferredNeighborhood: '' }))}
              placeholder="Your neighbourhood, e.g. Bridgeland"
              autoComplete="off"
              enterKeyHint="next"
              aria-describedby="pl-hood-hint"
            />
            {draft.neighborhood && !p.suggestions.length ? <Check className="su-search-ok" size={18} strokeWidth={3} aria-hidden="true" /> : null}
          </label>
        ) : null}
        {p.suggestions.length ? (
          <div className="su-suggest" aria-label="Matching neighbourhoods">
            {p.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setDraft((d) => ({ ...d, neighborhood: s, inferredNeighborhood: '', address: '' }))}>
                <MapPin size={14} aria-hidden="true" /> {s}
              </button>
            ))}
          </div>
        ) : !draft.address ? (
          <p id="pl-hood-hint" className="su-hint">{p.communityCount > 100 ? `All ${p.communityCount} official Calgary communities are searchable.` : 'Calgary communities only.'}</p>
        ) : null}
        {draft.address || !draft.neighborhood ? null : (
          <button type="button" className="su-text" onClick={() => setDraft((d) => ({ ...d, neighborhood: '', inferredNeighborhood: '' }))}>Use a street address instead</button>
        )}
        {!draft.neighborhood ? (
          <label className="su-search su-search-alt">
            <MapPin size={20} aria-hidden="true" />
            <span className="sr-only">Street address (optional)</span>
            <input
              value={draft.address}
              onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value, inferredNeighborhood: '' }))}
              placeholder="Or a street address (optional)"
              autoComplete="street-address"
            />
          </label>
        ) : null}
        {draft.address ? <button type="button" className="su-text" onClick={() => setDraft((d) => ({ ...d, address: '', inferredNeighborhood: '' }))}>Use a neighbourhood instead</button> : null}
        {p.needsConsent ? (
          <label className="su-consent">
            <input type="checkbox" checked={draft.consent} onChange={(e) => setDraft((d) => ({ ...d, consent: e.target.checked }))} />
            <span className="su-box" aria-hidden="true"><Check size={14} strokeWidth={3.5} /></span>
            <span><strong>Store my area.</strong> CalgaryWatch keeps it on your account to run your email and picks. An address becomes a point only while an email is made and is never shown to anyone. <Link to="/privacy">What we keep</Link></span>
          </label>
        ) : null}
      </fieldset>

      <fieldset className="su-step" id="emails" data-done={progress[1]}>
        <legend className="su-step-head">
          <span className="su-num" aria-hidden="true">{progress[1] ? <Check size={18} strokeWidth={3} /> : '2'}</span>
          <span><small>Step 2 · Emails</small>What should we send?</span>
        </legend>
        <p className="su-help">Free, short, one click to stop. Pick both and they arrive together as one Monday email.</p>
        {p.pending.monday || p.pending.thursday ? (
          <p className="su-hint" role="status">You unsubscribed from the {[p.pending.monday ? 'safety' : '', p.pending.thursday ? 'event picks' : ''].filter(Boolean).join(' and ')} email by link, so it’s unticked. Tick it again and save if you change your mind.</p>
        ) : null}
        <div className="su-albums">
          <label className="su-album" data-on={draft.weeklyDigestOptIn}>
            <input type="checkbox" checked={draft.weeklyDigestOptIn} onChange={(e) => setDraft((d) => ({ ...d, weeklyDigestOptIn: e.target.checked }))} />
            <span className="su-album-art"><Cover kind="monday" area={p.draftArea} /><span className="su-saved" aria-hidden="true"><Check size={16} strokeWidth={3.5} /></span></span>
            <strong>What happened near home</strong>
            <small><b>Safety · Mondays</b> Police news, 311, outages and neighbours’ reports within a walk, 3 km and 10 km.</small>
          </label>
          <label className="su-album" data-on={draft.eventsDigestOptIn}>
            <input type="checkbox" checked={draft.eventsDigestOptIn} onChange={(e) => setDraft((d) => ({ ...d, eventsDigestOptIn: e.target.checked }))} />
            <span className="su-album-art"><Cover kind="thursday" area={p.draftArea} /><span className="su-saved" aria-hidden="true"><Check size={16} strokeWidth={3.5} /></span></span>
            <strong>Things to do, picked for you</strong>
            <small><b>Event picks · {draft.weeklyDigestOptIn ? 'with Monday' : 'Thursdays'}</b> Up to eight events that match your interests, near home first.</small>
          </label>
        </div>
        {both ? <p className="su-together"><Sparkles size={16} aria-hidden="true" /> <span><strong>One email, not two.</strong> Both arrive every Monday as <em>Your week</em>: safety near home first, then your picks.</span></p> : null}
      </fieldset>

      <fieldset className="su-step" id="pl-step-interests" data-done={progress[2]}>
        <legend className="su-step-head">
          <span className="su-num" aria-hidden="true">{progress[2] ? <Check size={18} strokeWidth={3} /> : '3'}</span>
          <span><small>Step 3 · Your mix</small>What are you into?</span>
        </legend>
        <p className="su-help">{draft.eventsDigestOptIn ? 'Your event picks come from these. Pick as many as you like.' : 'Optional. These shape the picks on this page.'}</p>
        <div className="su-tiles">
          {EVENT_INTERESTS.map((i) => {
            const on = draft.interests.includes(i.id);
            const Icon = TILE_ICON[i.id];
            return (
              <button key={i.id} type="button" className="su-tile" data-id={i.id} aria-pressed={on} onClick={() => p.onToggleInterest(i.id)}>
                <strong>{i.label}</strong>
                <small>{i.note}</small>
                <span className="su-tile-art" aria-hidden="true"><Icon size={40} strokeWidth={2.2} /></span>
                <span className="su-saved" aria-hidden="true"><Check size={14} strokeWidth={3.5} /></span>
              </button>
            );
          })}
        </div>
        <p className="su-goal" data-done={p.tunedLeft === 0} role="status">
          {p.tunedLeft === 0
            ? <><Check size={14} strokeWidth={3} aria-hidden="true" /> {draft.interests.length} picked. <strong>Tuned in</strong> badge unlocked.</>
            : <>{draft.interests.length ? `${draft.interests.length} picked. ` : ''}Pick {p.tunedLeft} more for the <strong>Tuned in</strong> badge.</>}
        </p>
      </fieldset>

      {p.error ? <p className="su-error" role="alert">{p.error}</p> : null}
      <p className="su-fine"><Lock size={12} aria-hidden="true" /> Free. One click to stop any email. Your address is never shown to anyone.{!p.signedIn ? ' What you picked is kept through sign-in.' : ''}</p>

      {/* The "now playing" bar: what you've built so far, and the one button that saves it. */}
      <div className="su-bar" data-ready={ready} data-on={barOn || p.editing}>
        <span className="su-bar-cover">{plan ? <Cover kind={plan} /> : <span className="su-bar-empty" />}</span>
        <span className="su-bar-text">
          <strong>{plan === 'week' ? 'Your week' : plan === 'monday' ? 'Monday brief' : plan === 'thursday' ? 'Thursday picks' : 'No email yet'}</strong>
          <small>{ready ? `Ready${summary ? ` · ${summary}` : ''}` : `Step ${Math.min(3, done + 1)} of 3${summary ? ` · ${summary}` : ''}`}</small>
          <span className="su-bar-progress" aria-label={`${done} of 3 steps done`}>{progress.map((d, i) => <span key={i} data-done={d} />)}</span>
        </span>
        <span className="su-bar-actions">
          {p.editing ? <button type="button" className="su-text" onClick={p.onCancel}>Cancel</button> : null}
          <button type="submit" className="su-go" data-ready={ready} disabled={p.saving || p.disabled}>
            <span className="su-go-long">{cta}</span><span className="su-go-short">{p.saving ? 'Saving…' : p.signedIn ? 'Save' : 'Continue'}</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </button>
        </span>
      </div>
    </form>
  );
}
