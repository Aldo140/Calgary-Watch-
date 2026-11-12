import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, CheckCircle2, ExternalLink, Phone, ShieldCheck, Sparkles } from 'lucide-react';
import { PICK_CHECKS, type BestCategory, type BestPlace, type PickCheck } from '../../content/bestOf';
import { bestPath, rankPlaces, sourceOf } from '../../lib/bestOf';
import { activePick, CONSENT_TEXT, recordPickContact, telHref, validEmail, type ContactKind, type ContactVia } from '../../lib/cwPicks';
import '../../styles/picks.css';

/**
 * A service list as a decision: the CalgaryWatch Pick on top (or the open
 * slot, honestly labelled, while nobody has passed vetting), then the A–Z list
 * with Call and Website. Tapping either opens a small sheet that offers the
 * one-email check-in a week later. The tap is counted either way, anonymously.
 */
export function PickBoard({ c, via, compact = false }: { c: BestCategory; via: ContactVia; compact?: boolean }) {
  const live = activePick(c);
  const places = rankPlaces(c.places).filter(p => p !== live?.place);
  return (
    <div className={`pk${compact ? ' is-compact' : ''}`}>
      {live ? <PickHero c={c} place={live.place} why={live.pick.why} checks={live.pick.checks} via={via} /> : <OpenSlot c={c} />}
      <div className="pk-list-head">
        <h3>{live ? 'Also in Calgary' : `${c.label} in Calgary`}, A–Z</h3>
        <p>In their own words. Nobody paid to be here.</p>
      </div>
      <ol className="pk-list">
        {places.map(p => <PickRow key={p.name} c={c} place={p} via={via} />)}
      </ol>
      {compact ? <Link className="pk-more" to={bestPath(c)}>Full list, sources and tips <ArrowUpRight size={15} aria-hidden="true" /></Link> : null}
    </div>
  );
}

function PickHero({ c, place, why, checks, via }: { c: BestCategory; place: BestPlace; why: string; checks: Record<PickCheck, string>; via: ContactVia }) {
  return (
    <section className="pk-hero" aria-label="CalgaryWatch Pick">
      <p className="pk-badge"><BadgeCheck size={16} aria-hidden="true" /> CalgaryWatch Pick · {c.label}</p>
      <h3>{place.name}</h3>
      <p className="pk-why">{why}</p>
      <ul className="pk-checks" aria-label="What we checked">
        {(Object.keys(PICK_CHECKS) as PickCheck[]).map(k => <li key={k}><CheckCircle2 size={15} aria-hidden="true" /> {PICK_CHECKS[k]} <small>{checks[k]}</small></li>)}
      </ul>
      <ContactActions c={c} place={place} via={via} hi />
    </section>
  );
}

function OpenSlot({ c }: { c: BestCategory }) {
  return (
    <section className="pk-hero is-open" aria-label="CalgaryWatch Pick">
      <p className="pk-badge"><Sparkles size={16} aria-hidden="true" /> CalgaryWatch Pick · {c.label}</p>
      <h3>Our Pick is being vetted.</h3>
      <p className="pk-why">One {c.noun.replace(/s$/, '')} company will earn this spot after it passes seven checks: licence, insurance, WCB, local ownership, real reviews, a call from us as a customer, and our pledge. Then neighbours who hired them through CalgaryWatch keep it honest.</p>
      <ul className="pk-checks is-todo" aria-label="The seven checks">
        {(Object.keys(PICK_CHECKS) as PickCheck[]).map(k => <li key={k}><ShieldCheck size={15} aria-hidden="true" /> {PICK_CHECKS[k]}</li>)}
      </ul>
      <p className="pk-apply">Run a Calgary {c.noun.replace(/s$/, '')} business? <a href={`mailto:aldo@calgarywatch.ca?subject=${encodeURIComponent(`CalgaryWatch Pick vetting: ${c.label}`)}`}>Ask to be vetted</a>. It’s free, and it can’t be bought.</p>
    </section>
  );
}

function PickRow({ c, place, via }: { c: BestCategory; place: BestPlace; via: ContactVia }) {
  const fact = place.facts[0];
  return (
    <li className="pk-row">
      <div className="pk-row-copy">
        <strong>{place.name}{place.verified ? <span className="pk-verified"><BadgeCheck size={14} aria-hidden="true" /> Verified</span> : null}</strong>
        {fact ? <small>{fact.text} <a className="pk-cite" href={fact.self ? fact.source : sourceOf(fact.source)?.url} target="_blank" rel="noopener noreferrer">{fact.self ? 'their site' : sourceOf(fact.source)?.publisher}</a></small> : null}
      </div>
      <ContactActions c={c} place={place} via={via} />
    </li>
  );
}

/** Call and Website, each opening the check-in sheet first. */
function ContactActions({ c, place, via, hi = false }: { c: BestCategory; place: BestPlace; via: ContactVia; hi?: boolean }) {
  const [open, setOpen] = useState<ContactKind | null>(null);
  return (
    <div className="pk-actions-wrap">
      <div className="pk-actions">
        {place.phone ? <button type="button" className={`pk-btn${hi ? ' is-hi' : ''}`} aria-expanded={open === 'call'} onClick={() => setOpen(open === 'call' ? null : 'call')}><Phone size={15} aria-hidden="true" /> Call</button> : null}
        {place.website ? <button type="button" className={`pk-btn${hi && !place.phone ? ' is-hi' : ''}`} aria-expanded={open === 'site'} onClick={() => setOpen(open === 'site' ? null : 'site')}>Website <ExternalLink size={14} aria-hidden="true" /></button> : null}
      </div>
      {open ? <ContactSheet c={c} place={place} via={via} kind={open} onDone={() => setOpen(null)} /> : null}
    </div>
  );
}

function ContactSheet({ c, place, via, kind, onDone }: { c: BestCategory; place: BestPlace; via: ContactVia; kind: ContactKind; onDone: () => void }) {
  const id = useId();
  const [checkIn, setCheckIn] = useState(false);
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState<'saved' | null>(null);
  // Signed in? Fill their email so the box is one tap.
  useEffect(() => {
    let live = true;
    import('../../firebase').then(({ auth }) => { const e = auth?.currentUser?.email; if (live && e) setEmail(e); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const href = kind === 'call' ? telHref(place.phone!) : place.website!;
  const bad = checkIn && !validEmail(email);
  const go = () => {
    // The link opens on its own (a real <a>), so pop-up blockers never stop it; this only records.
    void recordPickContact({ list: c.slug, place, via, contact: kind, followupEmail: checkIn && !bad ? email : undefined }).then(r => { if (r === 'saved') setSaved('saved'); });
    window.setTimeout(onDone, 4000);
  };
  return (
    <div className="pk-sheet" role="group" aria-labelledby={`${id}-t`}>
      <p id={`${id}-t`} className="pk-sheet-title">{kind === 'call' ? `Calling ${place.name}` : `Opening ${place.name}’s site`}</p>
      <label className="pk-consent">
        <input type="checkbox" checked={checkIn} onChange={e => setCheckIn(e.target.checked)} />
        <span>{CONSENT_TEXT}</span>
      </label>
      {checkIn ? (
        <label className="pk-email">
          <span>Your email</span>
          <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={bad && email.length > 0} />
        </label>
      ) : null}
      <div className="pk-sheet-go">
        <a className="pk-btn is-hi" href={bad ? undefined : href} aria-disabled={bad} {...(kind === 'site' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          onClick={e => { if (bad) { e.preventDefault(); return; } go(); }}>
          {kind === 'call' ? <><Phone size={15} aria-hidden="true" /> Call {place.phone}</> : <>Open website <ExternalLink size={14} aria-hidden="true" /></>}
        </a>
        <button type="button" className="pk-link" onClick={onDone}>Cancel</button>
      </div>
      {saved ? <p className="pk-saved" role="status"><CheckCircle2 size={15} aria-hidden="true" /> We’ll check in once, in a week.</p> : null}
      <p className="pk-fine">We count that someone contacted {place.name} from CalgaryWatch, never who. <Link to="/privacy">Privacy</Link></p>
    </div>
  );
}

