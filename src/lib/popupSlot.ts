/**
 * The site's rules for anything that floats over a page uninvited (the
 * homepage Community Watch card, the "how does your neighbourhood rank?"
 * card). People should get to look around first, and then see at most one.
 *
 * - One at a time: a card claims the slot and gives it back when it closes.
 * - One per visit: once a card has shown, no other uninvited card shows again
 *   until the next visit (a new tab or browser session).
 * - Not early: the visit has to be a while old and the reader has to have
 *   actually scrolled this page, then paused.
 *
 * Badge toasts are different: they answer something the reader just did, so
 * they skip the timing rules but still take the slot.
 */
let holder: string | null = null;

const VISIT_START = 'cw_visit_start';
const VISIT_SHOWN = 'cw_visit_popup';

function session(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

/** When this visit began; set on first read, kept across page changes. */
export function visitStartedAt(now = Date.now()): number {
  const s = session();
  const stored = Number(s?.getItem(VISIT_START)) || 0;
  if (stored) return stored;
  try { s?.setItem(VISIT_START, String(now)); } catch { /* private mode: counts from this page */ }
  return now;
}

export function popupShownThisVisit(): boolean {
  return session()?.getItem(VISIT_SHOWN) === '1';
}

function markShownThisVisit(): void {
  try { session()?.setItem(VISIT_SHOWN, '1'); } catch { /* private mode */ }
}

export function claimPopup(id: string): boolean {
  if (holder && holder !== id) return false;
  holder = id;
  return true;
}

export function releasePopup(id: string): void {
  if (holder === id) holder = null;
}

/** Take the slot for an uninvited card, and spend this visit's one card. */
export function claimVisitPopup(id: string): boolean {
  if (popupShownThisVisit() || !claimPopup(id)) return false;
  markShownThisVisit();
  return true;
}

// Start the visit clock as soon as any page that can show a card loads.
visitStartedAt();
