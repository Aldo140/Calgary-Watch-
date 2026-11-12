import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, CheckCircle2, History, ExternalLink, MessageCircleQuestion, Phone, ShieldCheck, X } from 'lucide-react';
import { PICK_CHECKS, type PickCheck } from '../../content/cwPicks';
import { askFor, CONSENT_TEXT, FOLLOWUP_DAYS, pickDeskPath, recentContacts, recordPickContact, rememberContact, type RecentContact, telHref, validEmail, type Contender, type ContactKind, type ContactVia, type Shelf } from '../../lib/cwPicks';
import { PickSeal } from './PickSeal';
import '../../styles/picks.css';

const CHECK_KEYS = Object.keys(PICK_CHECKS) as PickCheck[];
const trade = (s: Shelf) => s.service.trades[0];

/**
 * A service as a decision: the CalgaryWatch Pick (or its open slot, honestly
 * labelled), then every local company we list, A–Z, one tap from a call. A tap
 * opens one sheet with one optional box: a check-in a week later.
 */
export function PickBoard({ shelf, via, compact = false }: { shelf: Shelf; via: ContactVia; compact?: boolean }) {
  const [sheet, setSheet] = useState<{ c: Contender; kind: ContactKind } | null>(null);
  // This device only: "you called them Tuesday", so coming back picks up where you left off.
  const [recent, setRecent] = useState<RecentContact | null>(null);
  useEffect(() => { setRecent(recentContacts(shelf.service.id)[0] ?? null); }, [shelf.service.id, sheet]);
  const recentC = recent ? shelf.contenders.find(c => c.key === recent.key) : undefined;
  const others = shelf.contenders.filter(c => c !== shelf.live?.contender);
  const shown = compact ? others.slice(0, 3) : others;
  const noun = shelf.service.label.toLowerCase();
  return (
    <div className={`pk${compact ? ' is-compact' : ''}`}>
      {recent && recentC ? <RecentStrip r={recent} c={recentC} onContact={kind => setSheet({ c: recentC, kind })} /> : null}
      {shelf.live ? <PickCard shelf={shelf} onContact={(c, kind) => setSheet({ c, kind })} /> : null}
      {shown.length ? (
        <section className="pk-shortlist" aria-label={`${shelf.service.label} in Calgary`}>
          <header className="pk-shortlist-head">
            <h3>{shelf.live ? 'Also in Calgary' : `${others.length} local ${others.length === 1 ? trade(shelf) : noun}`}</h3>
            <p>A–Z · in their own words · nobody pays to be here</p>
          </header>
          <ul className="pk-cards">
            {shown.map(c => <Card key={c.key} c={c} onContact={kind => setSheet({ c, kind })} />)}
          </ul>
        </section>
      ) : (
        <p className="pk-empty">No {noun} listed yet. <Link to={`/local/services#svc-${shelf.service.id}`}>Recommend one you trust</Link> and it goes on the list once we check it.</p>
      )}
      {!shelf.live ? <PickStatus shelf={shelf} compact={compact} /> : null}
      {compact ? (
        <Link className="pk-desk-link" to={pickDeskPath(shelf.service.id)}>
          <span>{others.length > shown.length ? `See all ${others.length} ${noun}` : `Open the ${noun} desk`}</span>
          <small>What to ask on the phone, and when Calgary books it</small>
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      ) : null}
      {sheet ? <ContactSheet shelf={shelf} c={sheet.c} kind={sheet.kind} via={via} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

const DAYFMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'short', day: 'numeric' });
const when = (at: number) => {
  const days = Math.floor((Date.now() - at) / 86_400_000);
  return days < 1 ? 'today' : days < 2 ? 'yesterday' : `on ${DAYFMT.format(at)}`;
};

function RecentStrip({ r, c, onContact }: { r: RecentContact; c: Contender; onContact: (k: ContactKind) => void }) {
  const due = r.at + FOLLOWUP_DAYS * 86_400_000;
  return (
    <div className="pk-recent" role="status">
      <History size={18} aria-hidden="true" />
      <p>
        <b>You {r.contact === 'call' ? 'called' : 'looked up'} {c.name} {when(r.at)}.</b>{' '}
        {r.checkIn && due > Date.now() ? `We’ll check in on ${DAYFMT.format(due)}.` : 'Tell us how it went: reply to any CalgaryWatch email.'}
      </p>
      {c.phone ? <button type="button" className="pk-btn" onClick={() => onContact('call')}><Phone size={15} aria-hidden="true" /> Call again</button> : null}
    </div>
  );
}

function PickCard({ shelf, onContact }: { shelf: Shelf; onContact: (c: Contender, k: ContactKind) => void }) {
  const { pick, contender: c } = shelf.live!;
  return (
    <section className="pk-card is-live" aria-label={`CalgaryWatch Pick for ${shelf.service.label.toLowerCase()}`}>
      <div className="pk-card-top">
        <PickSeal state="live" year={pick.checks.pledge.slice(0, 4)} />
        <div>
          <p className="pk-eyebrow">CalgaryWatch Pick · {shelf.service.label}</p>
          <h3>{c.name}</h3>
          <p className="pk-why">{pick.why}</p>
        </div>
      </div>
      <ul className="pk-checks">
        {CHECK_KEYS.map(k => <li key={k}><CheckCircle2 size={15} aria-hidden="true" /><span>{PICK_CHECKS[k]}</span><time>{pick.checks[k]}</time></li>)}
      </ul>
      <div className="pk-card-go">
        {c.phone ? <button type="button" className="pk-btn is-hi" onClick={() => onContact(c, 'call')}><Phone size={16} aria-hidden="true" /> Call {c.name.split(' ')[0]}</button> : null}
        {c.website ? <button type="button" className={`pk-btn${c.phone ? '' : ' is-hi'}`} onClick={() => onContact(c, 'site')}>Website <ExternalLink size={15} aria-hidden="true" /></button> : null}
        {c.path ? <Link className="pk-btn is-ghost" to={c.path}>Profile</Link> : null}
      </div>
      <p className="pk-fine">Re-vetted by {pick.until}. Kept only while customers say so. <Link to="/picks">How Picks work</Link></p>
    </section>
  );
}

/** No Pick yet: a slim, honest status line with the seal, not a banner over the list. */
function PickStatus({ shelf, compact }: { shelf: Shelf; compact: boolean }) {
  return (
    <section className="pk-status" aria-label={`CalgaryWatch Pick for ${shelf.service.label.toLowerCase()}: being vetted`}>
      <PickSeal state="open" checks={0} size={compact ? 58 : 72} />
      <div className="pk-status-copy">
        <p className="pk-eyebrow">The CalgaryWatch Pick</p>
        <p><b>Being vetted.</b> One {trade(shelf)} earns the seal by passing seven checks we do ourselves, then keeps it only while the neighbours who hire them say so.</p>
        {!compact ? (
          <details className="pk-fold">
            <summary>The seven checks</summary>
            <ol>{CHECK_KEYS.map((k, i) => <li key={k}><b>{i + 1}</b>{PICK_CHECKS[k]}</li>)}</ol>
            <p>Run a Calgary {trade(shelf)} business? <a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`CalgaryWatch Pick vetting: ${shelf.service.label}`)}`}>Ask to be vetted</a>. Free, and it can’t be bought.</p>
          </details>
        ) : <Link className="pk-status-link" to="/picks#pkh-how">How a Pick is earned</Link>}
      </div>
    </section>
  );
}

const initials = (name: string) => name.replace(/^the\s+/i, '').split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const hue = (key: string) => [...key].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

const domain = (url?: string) => { try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return ''; } };

/** One company: who, where, one sourced fact, and the two ways to reach them as big thumb targets. */
function Card({ c, onContact }: { c: Contender; onContact: (k: ContactKind) => void }) {
  const site = domain(c.website);
  return (
    <li className="pk-c">
      <div className="pk-c-top">
        <span className="pk-mono" style={{ ['--h' as string]: hue(c.key) }} aria-hidden="true">{initials(c.name)}</span>
        <div className="pk-c-who">
          <strong>{c.path ? <Link to={c.path}>{c.name}</Link> : c.name}</strong>
          <span>{[c.area, c.phone].filter(Boolean).join(' · ') || site}</span>
        </div>
        {c.verified ? <span className="pk-verified"><BadgeCheck size={13} aria-hidden="true" /> Verified</span> : null}
      </div>
      {c.fact ? <p className="pk-c-fact">{c.fact.text} <a className="pk-cite" href={c.fact.source} {...(c.fact.source.startsWith('/') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>{c.fact.label}</a></p> : null}
      <div className={`pk-c-go${c.phone && c.website ? '' : ' is-one'}`}>
        {c.phone ? <button type="button" className="pk-btn is-hi" onClick={() => onContact('call')}><Phone size={17} aria-hidden="true" /> Call</button> : null}
        {c.website ? <button type="button" className={`pk-btn${c.phone ? '' : ' is-hi'}`} onClick={() => onContact('site')} aria-label={`${c.name} website`}>{site || 'Website'} <ExternalLink size={15} aria-hidden="true" /></button> : null}
      </div>
    </li>
  );
}

/** The one sheet between a tap and the call: an optional check-in, then the real link. A bottom sheet on phones. */
function ContactSheet({ shelf, c, kind, via, onClose }: { shelf: Shelf; c: Contender; kind: ContactKind; via: ContactVia; onClose: () => void }) {
  const id = useId();
  const [checkIn, setCheckIn] = useState(false);
  const [email, setEmail] = useState('');
  const [done, setDone] = useState<null | 'saved' | 'tap'>(null);
  const go = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    let live = true;
    import('../../firebase').then(({ auth }) => { const e = auth?.currentUser?.email; if (live && e) setEmail(e); }).catch(() => {});
    go.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { live = false; window.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [onClose]);
  const href = kind === 'call' ? telHref(c.phone!) : c.website!;
  const bad = checkIn && !validEmail(email);
  const record = () => {
    rememberContact({ list: shelf.service.id, key: c.key, name: c.name, contact: kind, at: Date.now(), checkIn: checkIn && !bad });
    void recordPickContact({ list: shelf.service.id, place: c, via, contact: kind, followupEmail: checkIn && !bad ? email : undefined })
      .then(r => setDone(r === 'saved' ? 'saved' : 'tap'));
  };
  return (
    <div className="pk-sheet-wrap" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pk-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <button type="button" className="pk-sheet-x" onClick={onClose} aria-label="Close"><X size={20} aria-hidden="true" /></button>
        <div className="pk-sheet-head">
          <span className="pk-mono" style={{ ['--h' as string]: hue(c.key) }} aria-hidden="true">{initials(c.name)}</span>
          <div>
            <p className="pk-eyebrow">{shelf.service.label} · {kind === 'call' ? 'Before you call' : 'Before you visit'}</p>
            <h3 id={`${id}-t`}>{c.name}</h3>
          </div>
        </div>
        {done ? (
          <div className="pk-sheet-done" role="status">
            <CheckCircle2 size={22} aria-hidden="true" />
            <p>{done === 'saved' ? <><b>We’ll check in once, in 7 days.</b> Good luck with the job.</> : <><b>Good luck with the job.</b> Tell us how it went any time: reply to any CalgaryWatch email.</>}</p>
            <button type="button" className="pk-btn" onClick={onClose}>Back to the list</button>
          </div>
        ) : (
          <>
            <div className="pk-ask">
              <p><MessageCircleQuestion size={16} aria-hidden="true" /> Worth asking</p>
              <ul>{askFor(shelf.service).map(q => <li key={q}>{q}</li>)}</ul>
            </div>
            <label className={`pk-consent${checkIn ? ' is-on' : ''}`}>
              <input type="checkbox" checked={checkIn} onChange={e => setCheckIn(e.target.checked)} />
              <span><b>Check in with me in a week</b>{CONSENT_TEXT.replace(/^Email me once in 7 days to ask how the job went\.\s*/, ' ')}</span>
            </label>
            {checkIn ? (
              <label className="pk-email">
                <span>Your email</span>
                <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={bad && email.length > 0} />
              </label>
            ) : null}
            <a ref={go} className={`pk-btn is-hi is-wide${bad ? ' is-off' : ''}`} href={bad ? undefined : href} aria-disabled={bad}
              {...(kind === 'site' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              onClick={e => { if (bad) { e.preventDefault(); return; } record(); }}>
              {kind === 'call' ? <><Phone size={18} aria-hidden="true" /> Call {c.phone}</> : <>Open {c.name.replace(/^the\s+/i, '')}’s site <ExternalLink size={16} aria-hidden="true" /></>}
            </a>
            {bad ? <p className="pk-hint" role="status">Add your email for the check-in, or untick the box to go straight there.</p> : null}
            <p className="pk-fine">We count that someone reached {c.name} from CalgaryWatch, never who. <Link to="/picks#privacy">Privacy</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
