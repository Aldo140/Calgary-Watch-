/**
 * Notices a deploy while a tab is open, then swaps to the new build at the
 * next page change, a moment the reader already expects the page to change.
 * A tab that does this never asks for a file the deploy removed, and readers
 * who keep CalgaryWatch open all week still see today's listings.
 *
 * The build writes its id into the page (<meta name="cw-build">) and into
 * /version.json, which Hosting serves uncached.
 */

export const BUILD_ID: string =
  (typeof document !== 'undefined' && document.querySelector<HTMLMetaElement>('meta[name="cw-build"]')?.content) || 'dev';

const CHECK_EVERY_MS = 10 * 60_000;
const MIN_GAP_MS = 60_000;

let updateReady = false;
let lastCheck = 0;
let started = false;

export const isUpdateReady = (): boolean => updateReady;

/** True when the published build differs from the one running in this tab. */
export function isNewerBuild(published: unknown, running = BUILD_ID): boolean {
  return typeof published === 'string' && published.length > 0 && running !== 'dev' && published !== running;
}

async function check(): Promise<void> {
  if (updateReady || document.visibilityState !== 'visible' || navigator.onLine === false) return;
  const now = Date.now();
  if (now - lastCheck < MIN_GAP_MS) return;
  lastCheck = now;
  try {
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
    const res = await fetch(`${base}version.json`, { cache: 'no-store' });
    if (!res.ok) return;
    const body = (await res.json()) as { build?: unknown };
    if (isNewerBuild(body.build)) updateReady = true;
  } catch {
    // Offline or blocked: try again on the next check.
  }
}

export function startVersionWatch(): void {
  if (started || typeof window === 'undefined' || BUILD_ID === 'dev') return;
  started = true;
  document.addEventListener('visibilitychange', () => void check());
  window.addEventListener('focus', () => void check());
  window.setInterval(() => void check(), CHECK_EVERY_MS);
}
