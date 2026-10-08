import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, X } from 'lucide-react';
import type { LivePulse } from '../../hooks/useLivePulse';
import '../../styles/promo.css';

const KEY = 'cw_watch_promo';
/** A closed card stays closed this long; a used one, longer. */
const QUIET_AFTER_CLOSE = 14 * 86_400_000;
const QUIET_AFTER_USE = 60 * 86_400_000;

const SOURCES = ['Calgary Police news', 'City of Calgary 311', 'Alberta Emergency Alerts', 'Environment Canada', '511 Alberta', 'ENMAX outages'];

function quietUntil(): number {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
}
function rememberFor(ms: number) {
  try { localStorage.setItem(KEY, String(Date.now() + ms)); } catch { /* private mode: it just shows again next visit */ }
}

/**
 * What CalgaryWatch is, said once, after someone has scrolled past the hero —
 * they've seen what's on, so this is the moment to say what else is here.
 *
 * Deliberately not modal: it never takes focus, never dims the page, and
 * never returns for two weeks once closed. A bottom sheet on phones, a card
 * in the corner on desktop. The one number in it is the live map's own count,
 * read for the Live section below; if that read failed, the number is left
 * out rather than guessed.
 */
export function WatchPromo({ pulse }: { pulse: LivePulse }) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    if (quietUntil() > Date.now()) return;
    const hero = document.querySelector('.h-hero');
    if (!hero || typeof IntersectionObserver === 'undefined') return;
    let timer: number | undefined;
    const io = new IntersectionObserver(([entry]) => {
      // Only once the hero has gone off the *top*: not on a short window
      // where it was never fully in view, and not when scrolling back up.
      if (!shown.current && !entry.isIntersecting && entry.boundingClientRect.top < 0) {
        shown.current = true;
        timer = window.setTimeout(() => setOpen(true), 450);
        io.disconnect();
      }
    }, { threshold: 0 });
    io.observe(hero);
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
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
    window.setTimeout(() => { setOpen(false); setLeaving(false); }, 220);
  };

  if (!open) return null;
  const { reports } = pulse;

  return (
    <aside className="cw-promo" data-leaving={leaving} aria-labelledby="cw-promo-title">
      <button type="button" className="cw-promo-close" onClick={() => close(QUIET_AFTER_CLOSE)} aria-label="Close">
        <X size={20} aria-hidden="true" />
      </button>

      <div className="cw-promo-body">
        <p className="cw-promo-eyebrow"><span className="cw-promo-pulse" aria-hidden="true" /> Community Watch · Calgary only</p>
        <h2 id="cw-promo-title">Calgary, looking out <em>for Calgary.</em></h2>
        <p className="cw-promo-lead">
          Neighbours post what they see. We put it on one live map beside every official source the city has<span className="cw-promo-more">, with the source and time on every pin</span>.
          Built for Calgary and nowhere else, and run by Calgarians.
        </p>

        <ul className="cw-promo-sources" aria-label="On the map">
          <li className="cw-promo-src-lead">Your neighbours</li>
          {SOURCES.map((s) => <li key={s}>{s}</li>)}
        </ul>

        {reports.status === 'ready' && reports.total > 0 ? (
          <p className="cw-promo-stat">
            <b>{reports.total}{reports.capped ? '+' : ''}</b>
            <span>public reports on the map in the last 24 hours</span>
          </p>
        ) : null}

        <div className="cw-promo-actions">
          <Link to="/community" className="cw-promo-btn" onClick={() => rememberFor(QUIET_AFTER_USE)}>
            <span className="cw-promo-btn-long">See Community Watch</span><span className="cw-promo-btn-short">Take a look</span> <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <Link to="/map" className="cw-promo-link" onClick={() => rememberFor(QUIET_AFTER_USE)}>Open the live map</Link>
        </div>
      </div>

      <Link to="/plans" className="cw-promo-plans" onClick={() => rememberFor(QUIET_AFTER_USE)}>
        <span className="cw-promo-new">New</span>
        <span><strong>Plans that fit you.</strong> Pick what you’re into and get Thursday event picks near home.</span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </Link>
    </aside>
  );
}
