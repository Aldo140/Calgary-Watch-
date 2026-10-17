import { LocationShortcut } from './LocationShortcut';
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Bell, Check, Lock, LogOut, MapPin, Search, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import { RadarArt, TicketArt } from '../home/HomeYours';
import { TILE_ICON } from './SignupFlow';
import { useIsPhone } from './Dashboard';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { EVENT_INTERESTS, type EventInterestId } from '../../lib/eventPicks';
import type { PendingOptOuts, PlansDraft } from '../../lib/plans';
import '../../styles/settings-sheet.css';

/*
 * Settings without leaving the dashboard. The 3-step card is right for
 * signing up (one question at a time), but a member changing one thing
 * shouldn't walk through all three again or lose the page behind it. This
 * sheet slides over the dashboard (a drawer from the right on desktop, a
 * bottom sheet on phones) with home, emails and interests all in view and
 * one Save. PlansPage still owns the draft and the save.
 */

export type SettingsFocus = 'home' | 'emails' | 'interests';

export interface SettingsSheetProps {
  open: boolean;
  focus?: SettingsFocus;
  user: User;
  memberSince?: number;
  draft: PlansDraft;
  setDraft: Dispatch<SetStateAction<PlansDraft>>;
  suggestions: string[];
  communityCount: number;
  needsConsent: boolean;
  pending: PendingOptOuts;
  error: string;
  setError: (e: string) => void;
  saving: boolean;
  readOnly: boolean;
  onToggleInterest: (id: EventInterestId) => void;
  onSave: () => void;
  onClose: () => void;
  onSignOut?: () => void;
}

const since = (t: number) => calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'long', year: 'numeric' }).format(new Date(t));

export function SettingsSheet(p: SettingsSheetProps) {
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const { draft, setDraft } = p;
  const active = useRef(p.open);
  active.current = p.open;
  const [byAddress, setByAddress] = useState(Boolean(draft.address));
  useEffect(() => { if (p.open) setByAddress(Boolean(draft.address)); }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock the page behind, close on Escape, and land on the section that was asked for.
  useEffect(() => {
    if (!p.open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      const target = p.focus ? document.getElementById(`ss-${p.focus}`) : null;
      if (target) target.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      panel.current?.focus({ preventScroll: true });
    }, reduce ? 0 : 260);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const phone = useIsPhone();
  const from = reduce ? { opacity: 0 } : phone ? { y: '100%' } : { x: '100%' };
  const name = p.user.displayName || p.user.email || 'You';
  const both = draft.weeklyDigestOptIn && draft.eventsDigestOptIn;

  return (
    <AnimatePresence>
      {p.open ? (
        <div className="ss" role="presentation">
          <motion.button
            type="button" className="ss-scrim" aria-label="Close settings" onClick={p.onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2 }}
          />
          <motion.div
            ref={panel} className="ss-panel" role="dialog" aria-modal="true" aria-labelledby="ss-title" tabIndex={-1}
            initial={from} animate={{ opacity: 1, x: 0, y: 0 }} exit={from}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          >
            <span className="ss-grab" aria-hidden="true" />
            <header className="ss-head">
              <span className="ss-ava" aria-hidden="true">{p.user.photoURL ? <img src={p.user.photoURL} alt="" referrerPolicy="no-referrer" /> : name.slice(0, 1)}</span>
              <span className="ss-who">
                <h2 id="ss-title">Your settings</h2>
                <small>{p.user.email || name}{p.memberSince ? ` · member since ${since(p.memberSince)}` : ''}</small>
              </span>
              <button type="button" className="ss-x" onClick={p.onClose} aria-label="Close"><X size={20} /></button>
            </header>

            <form className="ss-body" onSubmit={(e) => { e.preventDefault(); if(!p.readOnly)p.onSave(); }} noValidate>
              <fieldset disabled={p.readOnly||p.saving} style={{border:0,padding:0,margin:0,minWidth:0}}>
              <section id="ss-home" className="ss-sec" aria-labelledby="ss-home-h">
                <p className="ss-k">01 · Home</p>
                <h3 id="ss-home-h">Where’s home? (optional)</h3>
                <p className="ss-help">Add an area for nearby picks, or leave it blank for all of Calgary. You can change it any time.</p>
                <LocationShortcut value={`${draft.neighborhood}|${draft.address}`} disabled={p.saving || p.readOnly} onSelect={(neighborhood) => { if (!active.current) return; setByAddress(false); p.setError(''); setDraft(d => ({ ...d, neighborhood, address: '', inferredNeighborhood: '' })); }} />
                {(draft.neighborhood || draft.address) ? <button type="button" className="su-link" disabled={p.saving || p.readOnly} onClick={() => { p.setError(''); setDraft(d => ({ ...d, neighborhood: '', address: '', inferredNeighborhood: '', consent: false })); }}>Remove location — use all Calgary</button> : null}
                {!byAddress ? (
                  <label className="su-input">
                    <Search size={20} aria-hidden="true" />
                    <span className="sr-only">Neighbourhood</span>
                    <input
                      value={draft.neighborhood} placeholder="e.g. Bridgeland" autoComplete="off"
                      onChange={(e) => { p.setError(''); setDraft((d) => ({ ...d, neighborhood: e.target.value, inferredNeighborhood: '' })); }}
                    />
                    {draft.neighborhood && !p.suggestions.length ? <Check className="su-input-ok" size={20} strokeWidth={3} aria-hidden="true" /> : null}
                  </label>
                ) : (
                  <label className="su-input">
                    <MapPin size={20} aria-hidden="true" />
                    <span className="sr-only">Street address</span>
                    <input
                      value={draft.address} placeholder="e.g. 201 8 Av SW" autoComplete="street-address"
                      onChange={(e) => { p.setError(''); setDraft((d) => ({ ...d, address: e.target.value, inferredNeighborhood: '' })); }}
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
                  <p className="su-hint">
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
              </section>

              <section id="ss-emails" className="ss-sec" aria-labelledby="ss-emails-h">
                <p className="ss-k">02 · Emails</p>
                <h3 id="ss-emails-h">What we send</h3>
                {p.pending.monday || p.pending.thursday ? (
                  <p className="su-hint" role="status">You unsubscribed from the {[p.pending.monday ? 'safety' : '', p.pending.thursday ? 'event picks' : ''].filter(Boolean).join(' and ')} email by link, so it’s off.</p>
                ) : null}
                <div className="ss-mails">
                  <Switch
                    on={draft.weeklyDigestOptIn} tone="navy" art={<RadarArt />} k="Mondays" title="Safety near home"
                    body="Police news, 311, outages and neighbours’ reports near you."
                    onChange={(v) => setDraft((d) => ({ ...d, weeklyDigestOptIn: v }))}
                  />
                  <Switch
                    on={draft.eventsDigestOptIn} tone="cyan" art={<TicketArt />} k={draft.weeklyDigestOptIn ? 'With Monday’s email' : 'Thursdays'} title="Things to do"
                    body="Up to eight events picked for what you’re into."
                    onChange={(v) => setDraft((d) => ({ ...d, eventsDigestOptIn: v }))}
                  />
                </div>
                <p className="su-hint">{both ? 'Both arrive together as one email, Mondays at 9 a.m.' : 'Free. One click to stop any email.'}</p>
              </section>

              <section id="ss-interests" className="ss-sec" aria-labelledby="ss-interests-h">
                <p className="ss-k">03 · Interests</p>
                <h3 id="ss-interests-h">What you’re into</h3>
                <p className="ss-help">Your picks here and by email come from these. Three or more sharpens them.</p>
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
              </section>

              <section className="ss-sec ss-more" aria-label="More">
                <Link to="/map?settings=alerts" className="ss-row"><Bell size={18} aria-hidden="true" /><span><strong>Instant alerts and quiet hours</strong><small>Set on the live map, per device</small></span><ArrowUpRight size={17} aria-hidden="true" /></Link>
                <Link to="/privacy" className="ss-row"><Lock size={18} aria-hidden="true" /><span><strong>What we keep</strong><small>Your area is never shown to anyone</small></span><ArrowUpRight size={17} aria-hidden="true" /></Link>
                {p.onSignOut && !p.readOnly ? <button type="button" className="ss-row ss-out" onClick={p.onSignOut}><LogOut size={18} aria-hidden="true" /><span><strong>Sign out</strong></span></button> : null}
              </section>

              </fieldset>
              <footer className="ss-foot">
                {p.error ? <p className="su-error" role="alert">{p.error}</p> : null}
                <div className="ss-foot-row">
                  <button type="button" className="ss-cancel" onClick={p.onClose}>Cancel</button>
                  <button type="submit" className="ss-save" disabled={p.saving || p.readOnly}>{p.readOnly ? 'Read-only' : p.saving ? 'Saving…' : 'Save changes'} <Check size={18} strokeWidth={3} aria-hidden="true" /></button>
                </div>
              </footer>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function Switch({ on, tone, art, k, title, body, onChange }: { on: boolean; tone: 'navy' | 'cyan'; art: ReactNode; k: string; title: string; body: string; onChange: (v: boolean) => void }) {
  return (
    <label className="ss-mail" data-on={on} data-tone={tone}>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="ss-mail-art" aria-hidden="true">{art}</span>
      <span className="ss-mail-text"><small>{k}</small><strong>{title}</strong><span>{body}</span></span>
      <span className="ss-switch" aria-hidden="true"><i /></span>
    </label>
  );
}
