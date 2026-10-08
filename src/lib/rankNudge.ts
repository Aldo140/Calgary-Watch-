/**
 * The one-time "how does your neighbourhood rank?" notification for signed-in
 * readers. It shows on site pages until they open Check your community (from
 * the card or any other way) or close it, then never again on that device.
 * The Neighbourhoods pages keep their own permanent panel, so the card stays
 * off them, and off the game page itself.
 */

const KEY = 'cw_rank_nudge_done';

export function rankNudgeKey(uid: string): string {
  return `${KEY}:${uid}`;
}

export function shouldShowRankNudge({ signedIn, pathname, done }: { signedIn: boolean; pathname: string; done: boolean }): boolean {
  if (!signedIn || done) return false;
  return !/^\/(check-your-community|neighbourhoods)(\/|$)/.test(pathname);
}

/** Opening the game counts as seeing the notification. */
export function opensGame(pathname: string): boolean {
  return /^\/check-your-community(\/|$)/.test(pathname);
}

export function readNudgeDone(uid: string): boolean {
  try { return localStorage.getItem(rankNudgeKey(uid)) === '1'; } catch { return false; }
}

export function writeNudgeDone(uid: string): void {
  try { localStorage.setItem(rankNudgeKey(uid), '1'); } catch { /* private mode: it may show again */ }
}
