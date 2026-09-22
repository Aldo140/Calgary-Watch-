/**
 * Browser push opt-in (Phase 3, W3-5).
 *
 * The last and most intrusive channel, so it is the most defensive: every path
 * degrades to a no-op rather than an error. Without the VAPID key it reports
 * `unconfigured` and does nothing; on an unsupported browser, `unsupported`;
 * in a dev build (no generated service worker), `unavailable`; if the reader
 * says no, `denied`. Only a clean success stores a token. The token lives on
 * the reader's own profile (`pushTokens`), which the alert sender reads to
 * deliver a push alongside — or instead of — the email.
 *
 * "Is push on for THIS device?" is a local question — the profile holds tokens
 * for every device the reader ever enabled, and the browser's own
 * `Notification.permission` never flips back to `default` when a token is
 * revoked. So a small localStorage flag, written on a successful register and
 * cleared on opt-out, is the source of truth for the toggle's state.
 *
 * Firebase messaging is imported lazily so this module never runs its
 * service-worker machinery at import time, and so unit/build steps that never
 * call it pay nothing.
 */

export type PushStatus = 'enabled' | 'denied' | 'unsupported' | 'unconfigured' | 'unavailable' | 'error';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const SW_URL = '/firebase-messaging-sw.js';
const LOCAL_FLAG = 'cw_push_enabled_here';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window
  );
}

export function isPushConfigured(): boolean {
  return Boolean(VAPID_KEY);
}

/** Whether the reader has already granted notification permission. */
export function pushPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Whether push is currently registered on this device — a local flag, not the
 * browser permission (which does not revert on opt-out) and not the profile
 * token list (which spans every device). The UI toggle keys off this.
 */
export function isPushEnabledHere(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(LOCAL_FLAG) === '1';
  } catch {
    return false;
  }
}

function setPushEnabledHere(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(LOCAL_FLAG, '1');
    else window.localStorage.removeItem(LOCAL_FLAG);
  } catch {
    /* private mode / storage disabled — the toggle just won't persist */
  }
}

/** True when the generated messaging service worker is actually being served. */
async function serviceWorkerFilePresent(): Promise<boolean> {
  try {
    const res = await fetch(SW_URL, { method: 'HEAD' });
    return res.ok && (res.headers.get('content-type') ?? '').includes('javascript');
  } catch {
    return false;
  }
}

export async function enablePush(uid: string): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';
  if (!VAPID_KEY) return 'unconfigured';
  // The worker is emitted by scripts/generate-messaging-sw.mjs into dist/ at
  // build time, so it never exists under `npm run dev`. Registering a missing
  // file throws a confusing SecurityError; check first and report honestly.
  if (!(await serviceWorkerFilePresent())) return 'unavailable';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    const registration = await navigator.serviceWorker.register(SW_URL);
    const [{ getMessaging, getToken, isSupported }, { db }, { doc, setDoc, arrayUnion }] = await Promise.all([
      import('firebase/messaging'),
      import('@/src/firebase'),
      import('firebase/firestore'),
    ]);
    if (!db || !(await isSupported())) return 'unsupported';

    const messaging = getMessaging();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return 'error';

    await setDoc(doc(db, 'users', uid), { pushTokens: arrayUnion(token) }, { merge: true });
    setPushEnabledHere(true);
    return 'enabled';
  } catch {
    return 'error';
  }
}

export async function disablePush(uid: string): Promise<void> {
  setPushEnabledHere(false);
  if (!isPushSupported() || !VAPID_KEY) return;
  try {
    const [{ getMessaging, getToken, deleteToken, isSupported }, { db }, { doc, setDoc, arrayRemove }] = await Promise.all([
      import('firebase/messaging'),
      import('@/src/firebase'),
      import('firebase/firestore'),
    ]);
    if (!db || !(await isSupported())) return;
    const messaging = getMessaging();
    // Best-effort: remove the current token from the profile, then invalidate it.
    const token = await getToken(messaging, { vapidKey: VAPID_KEY }).catch(() => null);
    if (token) await setDoc(doc(db, 'users', uid), { pushTokens: arrayRemove(token) }, { merge: true });
    await deleteToken(messaging).catch(() => undefined);
  } catch {
    /* opting out must never surface an error */
  }
}
