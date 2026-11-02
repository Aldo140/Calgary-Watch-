import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { ArrowRight, ArrowUpRight, Check, Layers, MapPin, Pencil, RotateCcw, Sparkles, Ticket, X } from 'lucide-react';
import { setGoing } from '../../lib/plans';
import { EVENT_INTERESTS, pickDistance, pickWhenAt, type PickItem } from '../../lib/eventPicks';
import { celebrateBadge } from './BadgeToast';
import '../../styles/plans-deck.css';

/*
 * Phones: "Swipe your week". The member's unanswered event picks as a stack
 * of cards, one at a time. Right (or the yellow button) says "I'm going" and
 * saves it straight to their plans; left skips. Undo takes the last one back,
 * including the RSVP. It turns a list you scroll past into a 30-second
 * decision, which is what a small screen is good at.
 */

type Choice = 'go' | 'skip';
interface Decision { item: PickItem; choice: Choice; failed?: boolean }

const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
const labelsOf = (item: PickItem) => EVENT_INTERESTS.filter((i) => item.matched.includes(i.id) && i.id !== 'free').map((i) => i.label).slice(0, 2);

/** The tile in Picked for you that opens the deck: three cards fanned out, and a count. */
export function DeckLauncher({ deck, art, onOpen }: { deck: PickItem[]; art: (item: PickItem) => ReactNode; onOpen: () => void }) {
  if (deck.length < 2) return null;
  return (
    <button type="button" className="pd-deck-tile" onClick={onOpen}>
      <span className="pd-deck-tile-text">
        <small><Layers size={13} aria-hidden="true" /> Swipe your week</small>
        <strong>{deck.length} picks, one at a time.</strong>
        <span>Right for I’m going. Left to skip.</span>
        <span className="pd-deck-tile-go">Start <ArrowRight size={16} aria-hidden="true" /></span>
      </span>
      <span className="pd-deck-tile-fan" aria-hidden="true">
        {deck.slice(0, 3).reverse().map((item, i, all) => (
          <span key={item.key} className="pd-deck-tile-card" style={{ '--i': all.length - 1 - i } as CSSProperties}>{art(item)}</span>
        ))}
      </span>
    </button>
  );
}

export interface SwipeDeckProps {
  deck: PickItem[];
  uid: string;
  now: number;
  /** A demo: decisions show but don't save. */
  preview?: boolean;
  /** Plans already made, for the first-plan and fifth-plan badges. */
  plansBefore: number;
  art: (item: PickItem) => ReactNode;
  onClose: () => void;
  onEdit: (focus?: 'home' | 'emails' | 'interests') => void;
}

export function SwipeDeck(p: SwipeDeckProps) {
  // Freeze the deck as it opened: each yes changes the member's plans, which would reshuffle it.
  const [deck] = useState(p.deck);
  const [done, setDone] = useState<Decision[]>([]);
  const fling = useRef<((dir: 1 | -1) => void) | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const index = done.length;
  const current = deck[index];
  const yes = done.filter((d) => d.choice === 'go' && !d.failed);

  // A sheet over the page: lock the scroll behind it, focus the close button, Escape closes.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = 'hidden';
    const focusBefore = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { html.style.overflow = before; focusBefore?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.onClose();
      else if (e.key === 'ArrowRight' && current) fling.current?.(1);
      else if (e.key === 'ArrowLeft' && current) fling.current?.(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, p]);

  const decide = (choice: Choice) => {
    const item = deck[index];
    if (!item) return;
    buzz(choice === 'go' ? 18 : 8);
    setDone((d) => [...d, { item, choice }]);
    if (choice !== 'go' || p.preview) return;
    const made = p.plansBefore + yes.length;
    void setGoing(p.uid, item.entityId, item.start, true).then(() => {
      if (made === 0) celebrateBadge('first-plans');
      else if (made === 4) celebrateBadge('regular');
    }).catch(() => setDone((d) => d.map((x) => (x.item === item ? { ...x, failed: true } : x))));
  };

  const undo = () => {
    const last = done[done.length - 1];
    if (!last) return;
    buzz(6);
    setDone((d) => d.slice(0, -1));
    if (last.choice === 'go' && !last.failed && !p.preview) void setGoing(p.uid, last.item.entityId, last.item.start, false).catch(() => undefined);
  };

  const failed = done.filter((d) => d.failed);

  return createPortal(
    <div className="pd-deck" role="dialog" aria-modal="true" aria-labelledby="pd-deck-title">
      <div className="pd-deck-head">
        <p>
          <small id="pd-deck-title"><Layers size={13} aria-hidden="true" /> Swipe your week</small>
          <b aria-live="polite">{current ? `${index + 1} of ${deck.length}` : 'All done'}</b>
        </p>
        <span className="pd-deck-going" aria-label={`${yes.length} new plan${yes.length === 1 ? '' : 's'}`}><Ticket size={14} aria-hidden="true" /> {yes.length}</span>
        <button ref={closeRef} type="button" className="pd-deck-x" onClick={p.onClose} aria-label="Close"><X size={20} /></button>
      </div>
      <ol className="pd-deck-progress" aria-hidden="true">
        {deck.map((d, i) => <li key={d.key} data-state={i < index ? done[i].choice : i === index ? 'now' : undefined} />)}
      </ol>

      {current ? (
        <>
          <div className="pd-deck-stack">
            {deck.slice(index + 1, index + 3).reverse().map((item, i, all) => (
              <Card key={item.key} item={item} art={p.art} now={p.now} depth={all.length - i} />
            ))}
            <TopCard key={current.key} item={current} art={p.art} now={p.now} onDecide={decide} api={fling} />
          </div>
          <p className="pd-deck-hint">Swipe right for <b>I’m going</b>, left to skip.{p.preview ? ' (Demo: nothing is saved.)' : ''}</p>
          <div className="pd-deck-acts">
            <button type="button" className="pd-deck-btn" data-k="undo" onClick={undo} disabled={!done.length} aria-label="Undo the last one"><RotateCcw size={18} /></button>
            <button type="button" className="pd-deck-btn" data-k="skip" onClick={() => fling.current?.(-1)} aria-label={`Skip ${current.title}`}><X size={26} strokeWidth={2.8} /></button>
            <button type="button" className="pd-deck-btn" data-k="go" onClick={() => fling.current?.(1)} aria-label={`I’m going to ${current.title}`}><Check size={28} strokeWidth={3} /></button>
            <Link to={current.path} className="pd-deck-btn" data-k="open" aria-label={`Open ${current.title}`} onClick={p.onClose}><ArrowUpRight size={18} /></Link>
          </div>
        </>
      ) : (
        <div className="pd-deck-end">
          <span className="pd-deck-end-mark" aria-hidden="true">{yes.length ? <Ticket size={34} /> : <Sparkles size={34} />}</span>
          <h2>{yes.length ? `${yes.length} new plan${yes.length === 1 ? '' : 's'}.` : 'Nothing grabbed you?'}</h2>
          <p>{yes.length ? 'They’re on your plans now, and the next one counts down at the top of your dashboard.' : 'Picks follow your interests. Add one or two and the deck changes.'}</p>
          {yes.length ? (
            <ul className="pd-deck-end-list">
              {yes.map((d) => <li key={d.item.key}><Ticket size={15} aria-hidden="true" /><span><strong>{d.item.title}</strong><small>{pickWhenAt(d.item, p.now)}</small></span></li>)}
            </ul>
          ) : null}
          {failed.length ? <p className="pd-deck-error" role="alert">{failed.length === 1 ? '1 didn’t save' : `${failed.length} didn’t save`}. Try “I’m going” on its page.</p> : null}
          <div className="pd-deck-end-acts">
            {yes.length
              ? <a className="pd-deck-cta" href="#pd-next" onClick={p.onClose}>See your plans <ArrowRight size={17} aria-hidden="true" /></a>
              : <button type="button" className="pd-deck-cta" onClick={() => { p.onClose(); p.onEdit('interests'); }}><Pencil size={16} aria-hidden="true" /> Change interests</button>}
            <button type="button" className="pd-deck-ghost" onClick={undo} disabled={!done.length}><RotateCcw size={15} aria-hidden="true" /> Back one</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function CardFace({ item, art, now }: { item: PickItem; art: (item: PickItem) => ReactNode; now: number }) {
  const where = item.venue || item.neighbourhood || item.organizer || '';
  const labels = labelsOf(item);
  return (
    <>
      <span className="pd-deck-art">{art(item)}</span>
      <span className="pd-deck-body">
        <span className="pd-deck-when">{pickWhenAt(item, now)}</span>
        <strong className="pd-deck-title">{item.title}</strong>
        {where ? <span className="pd-deck-where"><MapPin size={14} aria-hidden="true" /> {[where, pickDistance(item.distanceM)].filter(Boolean).join(' · ')}</span> : null}
        <span className="pd-deck-tags">
          {item.free ? <b data-k="free">Free</b> : null}
          {item.verified ? <b data-k="ok"><Check size={11} aria-hidden="true" /> Verified</b> : null}
          {labels.map((l) => <b key={l}>{l}</b>)}
        </span>
      </span>
    </>
  );
}

/** A card waiting underneath: smaller and lower, so the stack reads as a stack. */
function Card({ item, art, now, depth }: { item: PickItem; art: (item: PickItem) => ReactNode; now: number; depth: number }) {
  return (
    <article className="pd-deck-card" data-depth={depth} aria-hidden="true">
      <CardFace item={item} art={art} now={now} />
    </article>
  );
}

function TopCard({ item, art, now, onDecide, api }: { item: PickItem; art: (item: PickItem) => ReactNode; now: number; onDecide: (c: Choice) => void; api: MutableRefObject<((dir: 1 | -1) => void) | null> }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-16, 16]);
  const go = useTransform(x, [24, 110], [0, 1]);
  const skip = useTransform(x, [-110, -24], [1, 0]);
  const leaving = useRef(false);

  const out = (dir: 1 | -1) => {
    if (leaving.current) return;
    leaving.current = true;
    if (reduce) { onDecide(dir > 0 ? 'go' : 'skip'); return; }
    void animate(x, dir * Math.max(520, window.innerWidth * 1.3), { duration: 0.32, ease: [0.4, 0, 0.9, 0.6] }).then(() => onDecide(dir > 0 ? 'go' : 'skip'));
  };
  api.current = out;

  return (
    <motion.article
      className="pd-deck-card" data-depth={0} aria-live="polite"
      style={{ x, rotate }}
      initial={reduce ? false : { scale: 0.94, y: 14 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      drag="x" dragElastic={0.9} dragMomentum={false}
      onDragEnd={(_, info) => {
        if (info.offset.x > 100 || info.velocity.x > 700) out(1);
        else if (info.offset.x < -100 || info.velocity.x < -700) out(-1);
        else void animate(x, 0, { type: 'spring', stiffness: 420, damping: 30 });
      }}
    >
      <motion.span className="pd-deck-stamp" data-k="go" style={{ opacity: go }} aria-hidden="true"><Ticket size={18} /> Going</motion.span>
      <motion.span className="pd-deck-stamp" data-k="skip" style={{ opacity: skip }} aria-hidden="true"><X size={18} /> Skip</motion.span>
      <CardFace item={item} art={art} now={now} />
    </motion.article>
  );
}
