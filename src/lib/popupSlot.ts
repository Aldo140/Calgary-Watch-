/**
 * One floating card at a time. Anything that pops up over a page (the
 * homepage promo, a badge toast) claims the slot first and gives it back when
 * it closes, so two never stack on a phone screen.
 */
let holder: string | null = null;

export function claimPopup(id: string): boolean {
  if (holder && holder !== id) return false;
  holder = id;
  return true;
}

export function releasePopup(id: string): void {
  if (holder === id) holder = null;
}
