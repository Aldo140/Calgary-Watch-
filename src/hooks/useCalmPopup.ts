import { useCallback, useEffect, useRef, useState } from 'react';
import { claimVisitPopup, popupShownThisVisit, releasePopup, visitStartedAt } from '../lib/popupSlot';

/** How long a visit runs before any uninvited card may appear. */
export const MIN_VISIT_MS = 45_000;
/** How far down this page the reader must have scrolled, in screens. */
export const MIN_SCROLL_SCREENS = 1.5;
/** A pause in scrolling first, so it never lands mid-gesture. */
const SETTLE_MS = 1_500;
const CHECK_EVERY_MS = 5_000;

/** Pure check, exported for tests. */
export function readyForPopup(p: { now: number; visitStart: number; deepest: number; viewport: number; menuOpen: boolean; typing: boolean }): boolean {
  if (p.now - p.visitStart < MIN_VISIT_MS) return false;
  if (p.deepest < p.viewport * MIN_SCROLL_SCREENS) return false;
  return !p.menuOpen && !p.typing;
}

/** True when any element matching the selector is in the viewport. */
function onScreen(selector: string): boolean {
  return Array.from(document.querySelectorAll(selector)).some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
  });
}

/**
 * Opens a floating card only at a calm moment (see lib/popupSlot for the
 * rules). Returns whether it's open, whether it's animating out, and a close.
 */
export function useCalmPopup(id: string, enabled: boolean, avoid?: string) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (!enabled || done.current || popupShownThisVisit()) return;
    let deepest = window.scrollY;
    let settle: number | undefined;

    const tryOpen = () => {
      if (done.current) return;
      const active = document.activeElement;
      const ok = readyForPopup({
        now: Date.now(),
        visitStart: visitStartedAt(),
        deepest,
        viewport: window.innerHeight,
        menuOpen: !!document.querySelector('.cw-nav[data-open="true"]'),
        typing: !!active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName),
      });
      if (!ok || (avoid && onScreen(avoid)) || !claimVisitPopup(id)) return;
      done.current = true;
      setOpen(true);
    };
    const onScroll = () => {
      deepest = Math.max(deepest, window.scrollY);
      clearTimeout(settle);
      settle = window.setTimeout(tryOpen, SETTLE_MS);
    };
    // A badge earned while a card is up wins the screen.
    const onBadge = () => setOpen(false);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('cw:badge', onBadge);
    const tick = window.setInterval(tryOpen, CHECK_EVERY_MS);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('cw:badge', onBadge);
      clearTimeout(settle); clearInterval(tick);
      releasePopup(id);
    };
  }, [id, enabled, avoid]);

  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => { setOpen(false); setLeaving(false); releasePopup(id); }, 220);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  return { open, leaving, close };
}
