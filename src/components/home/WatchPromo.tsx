import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, X } from 'lucide-react';
import type { LivePulse } from '../../hooks/useLivePulse';
import { claimPopup, releasePopup } from '../../lib/popupSlot';
import '../../styles/promo.css';

const KEY = 'cw_watch_promo';
/** A closed card stays closed this long; a used one, longer. */
const QUIET_AFTER_CLOSE = 14 * 86_400_000;
const QUIET_AFTER_USE = 60 * 86_400_000;
/** Never in the first moments of a visit: let people look around first. */
const MIN_DWELL = 25_000;
/** …and only once they've stopped scrolling for a beat, never mid-gesture. */
const SETTLE = 1_200;

function quietUntil(): number {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
}
function rememberFor(ms: number) {
  try { localStorage.setItem(KEY, String(Date.now() + ms)); } catch { /* private mode: it just shows again next visit */ }
}

/** True when nothing else on the page should be interrupted right now. */
function calmMoment(): boolean {
  const hero = document.querySelector('.h-hero');
  // Only once the whole hero has gone off the top: they've seen what's on.
  if (!hero || hero.getBoundingClientRect().bottom > 0) return false;
  // Not over the open menu, and not while they're typing a search.
  if (document.querySelector('.cw-nav[data-open="true"]')) return false;
  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return false;
  return true;
}

/**
 * What CalgaryWatch is, said once and quietly: a small card that waits until
 * someone has been on the page a while, scrolled past the hero and paused.
 *
 * Deliberately not modal: it never takes focus, never dims the page, never
 * shares the screen with another floating card, and never returns for two
 * weeks once closed. The one number in it is the live map's own count, read
 * for the Live section below; if that read failed, it is left out rather
 * than guessed.
 */
export function WatchPromo({ pulse }: { pulse: LivePulse }) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    if (quietUntil() > Date.now()) return;
    const start = Date.now();
    let settle: number | undefined;

    const tryOpen = () => {
      if (shown.current || Date.now() - start < MIN_DWELL || !calmMoment()) return;
      if (!claimPopup('promo')) return;
      shown.current = true;
      setOpen(true);
      window.removeEventListener('scroll', onScroll);
    };
    const onScroll = () => {
      clearTimeout(settle);
      settle = window.setTimeout(tryOpen, SETTLE);
    };
    // A badge earned while the card is up wins the slot; the card bows out
    // for this visit without counting as a close.
    const onBadge = () => { setOpen(false); };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('cw:badge', onBadge);
    const dwell = window.setTimeout(tryOpen, MIN_DWELL);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('cw:badge', onBadge);
      clearTimeout(settle); clearTimeout(dwell);
      releasePopup('promo');
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(QUIET_AFTER_CLOSE); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = (quiet: number) => {
    rememberFor(quiet);
    setLeaving(true);
    window.setTimeout(() => { setOpen(false); setLeaving(false); releasePopup('promo'); }, 220);
  };

  if (!open) return null;
  const { reports } = pulse;

  return (
    <aside className="cw-promo" data-leaving={leaving} aria-labelledby="cw-promo-title">
      <button type="button" className="cw-promo-close" onClick={() => close(QUIET_AFTER_CLOSE)} aria-label="Close">
        <X size={18} aria-hidden="true" />
      </button>

      <img className="cw-promo-mark" src="/images/brand/calgarywatch-city-spark-v2.webp" width="44" height="44" alt="" aria-hidden="true" />

      <div className="cw-promo-body">
        <p className="cw-promo-eyebrow"><span className="cw-promo-pulse" aria-hidden="true" /> Community Watch</p>
        <h2 id="cw-promo-title">Calgary, looking out for Calgary.</h2>
        <p className="cw-promo-lead">
          Neighbour reports beside Calgary Police, 311 and city alerts on one live map<span className="cw-promo-more">, with the source on every pin</span>.
        </p>

        {reports.status === 'ready' && reports.total > 0 ? (
          <p className="cw-promo-stat">
            <b>{reports.total}{reports.capped ? '+' : ''}</b> reports in the last 24 hours
          </p>
        ) : null}

        <div className="cw-promo-actions">
          <Link to="/community" className="cw-promo-btn" onClick={() => rememberFor(QUIET_AFTER_USE)}>
            See Community Watch <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <button type="button" className="cw-promo-later" onClick={() => close(QUIET_AFTER_CLOSE)}>Not now</button>
        </div>
      </div>
    </aside>
  );
}
