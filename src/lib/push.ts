/**
 * Browser push opt-in (Phase 3, W3-5).
 *
 * The last and most intrusive channel, so it is the most defensive: every path
 * degrades to a no-op rather than an error. Without the VAPID key it reports
 * `unconfigured` and does nothing; on an unsupported browser, `unsupported`;
 * if the reader says no, `denied`. Only a clean success stores a token. The
 * token lives on the reader's own profile (`pushTokens`), which the alert
 * sender reads to deliver a push alongside — or instead of — the email.
 *
 * Firebase messaging is imported lazily so this module never runs its
 * service-worker machinery at import time, and so unit/build steps that never
 * call it pay nothing.
 */

export type PushStatus = 'enabled' | 'denied' | 'unsupported' | 'unconfigured' | 'error';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

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

export async function enablePush(uid: string): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';
  if (!VAPID_KEY) return 'unconfigured';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
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
    return 'enabled';
  } catch {
    return 'error';
  }
}

export async function disablePush(uid: string): Promise<void> {
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
