import { lazy, type ComponentType } from 'react';

/**
 * Stale-chunk recovery.
 *
 * Every deploy renames the hashed files in /assets. A tab opened before the
 * deploy still points at the old names, so the next page it lazy-loads asks for
 * a file that may be gone and the browser throws "Failed to fetch dynamically
 * imported module". Deploys keep the previous build's assets for a week (see
 * scripts/deploy/keep-previous-assets.mjs), so this mostly never fires; when it
 * does, the reader gets the new version on the page they asked for, at the
 * scroll position they were at, instead of an error.
 */

const RELOAD_KEY = 'cw-chunk-reload';
const SCROLL_KEY = 'cw-chunk-scroll';
/** A second failure inside this window means a reload didn't help, so stop and show the error screen. */
const LOOP_WINDOW_MS = 20_000;

const CHUNK_ERROR = [
  /failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // Vite's CSS preloader
  /loading (css )?chunk [\w-]+ failed/i, // webpack-style wording some libraries reuse
  /'text\/html' is not a valid javascript mime type/i, // a missing file answered with an HTML page
  /expected a javascript(-or-wasm)? module script/i,
];

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: string; message?: string };
  if (e.name === 'ChunkLoadError') return true;
  const message = typeof error === 'string' ? error : e.message ?? '';
  return CHUNK_ERROR.some((re) => re.test(message));
}

export const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

export type ErrorKind = 'chunk' | 'offline' | 'crash';

/** Which error screen to show: offline beats everything, since nothing else can be fixed until it's back. */
export function errorKind(error: unknown, offline = isOffline()): ErrorKind {
  if (offline) return 'offline';
  if (isChunkLoadError(error)) return 'chunk';
  return 'crash';
}

interface StoredReload { at: number; path: string }

function readReload(): StoredReload | null {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    return raw ? (JSON.parse(raw) as StoredReload) : null;
  } catch {
    return null;
  }
}

/** True when this tab already reloaded for a stale chunk moments ago (the loop guard). */
export function recentlyRecovered(now = Date.now()): boolean {
  const last = readReload();
  return !!last && now - last.at < LOOP_WINDOW_MS;
}

/**
 * Reload once to pick up the current build, keeping the reader's place.
 * Returns false (and does nothing) when the loop guard says a reload already
 * failed to help, or when the device is offline and a reload would only swap
 * our screen for the browser's own offline page.
 */
export function recoverFromStaleChunk(): boolean {
  if (typeof window === 'undefined' || isOffline() || recentlyRecovered()) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ at: Date.now(), path: location.pathname } satisfies StoredReload));
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ path: location.pathname + location.search, y: window.scrollY }));
    // The index.html splash is for first visits; a recovery reload should feel like a page turn.
    sessionStorage.setItem('cw-splash', '1');
  } catch {
    // Storage blocked: without the guard a reload could loop, so let the error screen handle it.
    return false;
  }
  window.location.reload();
  return true;
}

/** After a recovery reload, put the reader back where they were once the page has drawn. */
export function restoreRecoveredScroll(): void {
  let saved: { path: string; y: number } | null = null;
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (raw) {
      sessionStorage.removeItem(SCROLL_KEY);
      saved = JSON.parse(raw);
    }
  } catch {
    return;
  }
  if (!saved || saved.path !== location.pathname + location.search || !(saved.y > 0)) return;
  const y = saved.y;
  // Lazy pages and images grow the document over the first second or so; keep trying until it is tall enough.
  let tries = 0;
  const attempt = () => {
    if (document.documentElement.scrollHeight >= y + window.innerHeight || tries >= 20) {
      window.scrollTo(0, y);
      return;
    }
    tries += 1;
    window.setTimeout(attempt, 100);
  };
  window.requestAnimationFrame(attempt);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A promise that never settles, so Suspense keeps its loader up while the page reloads. */
const forever = <T,>() => new Promise<T>(() => undefined);

/**
 * `React.lazy` that survives deploys and flaky networks: one quiet retry for a
 * dropped connection, then a reload into the new build. Only when both fail
 * does the error reach the error boundary, which explains it in plain words.
 */
export function lazyWithRecovery<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;
      if (!isOffline()) {
        await wait(400);
        try {
          return await factory();
        } catch {
          // fall through to the reload
        }
      }
      if (recoverFromStaleChunk()) return forever<{ default: T }>();
      throw error;
    }
  });
}

let installed = false;

/**
 * Catch stale chunks that aren't page loads: Vite's preload helper, and any
 * other `import()` that fails outside a lazy component (the map's plugins,
 * Firebase modules loaded on demand).
 */
export function installChunkRecovery(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('vite:preloadError', (event) => {
    if (recoverFromStaleChunk()) event.preventDefault();
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason) && recoverFromStaleChunk()) event.preventDefault();
  });
  // A successful boot ends the guard window early, so a deploy an hour later can recover again.
  window.setTimeout(() => {
    try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
  }, LOOP_WINDOW_MS);
}
