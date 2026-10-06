import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { BADGES, type BadgeId } from '../../lib/badges';
import { BadgeMark } from './BadgeMark';
import '../../styles/plans.css';

const EVENT = 'cw:badge';

/** Announce a badge the moment the action that earned it succeeds. */
export function celebrateBadge(id: BadgeId): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

/**
 * The reward, shown where it was earned: a small card with the stamp, what it
 * recognises, and a way to see the rest. Polite live region, never modal,
 * gone in seven seconds.
 */
export function BadgeToaster() {
  const [id, setId] = useState<BadgeId | null>(null);
  useEffect(() => {
    let t: number | undefined;
    const on = (e: Event) => {
      setId((e as CustomEvent<BadgeId>).detail);
      clearTimeout(t);
      t = window.setTimeout(() => setId(null), 7000);
    };
    window.addEventListener(EVENT, on);
    return () => { window.removeEventListener(EVENT, on); clearTimeout(t); };
  }, []);
  const badge = BADGES.find((b) => b.id === id);
  return (
    <div className="cw-btoast-region" aria-live="polite">
      {badge ? (
        <div className="cw-btoast" key={badge.id}>
          <BadgeMark badge={{ ...badge, unlocked: true }} size={56} />
          <div>
            <p className="cw-btoast-eyebrow">Badge earned</p>
            <p className="cw-btoast-title">{badge.label}</p>
            <p className="cw-btoast-body">{badge.earned} <Link to="/plans">See your badges</Link></p>
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => setId(null)}><X size={16} /></button>
        </div>
      ) : null}
    </div>
  );
}
