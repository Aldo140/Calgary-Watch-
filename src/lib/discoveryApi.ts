import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

/**
 * Events and markets: suggestions from residents and moderation by admins.
 *
 * The Cloud Functions are the fast path, but they need Firebase's paid plan
 * and have not always been deployed. When a callable is missing or
 * unreachable, both paths still work without it:
 *   - a suggestion is written straight to `entity_submissions` under strict
 *     rules (own uid, pending, at most five a day per account);
 *   - an admin action is queued in `discovery_actions` (admins only), and the
 *     scheduled discovery job applies it with the same validation the
 *     callable uses (scripts/discovery/actions.ts).
 */
export type DiscoveryResult = { queued: boolean; data?: unknown };

const FUNCTION_MISSING = /functions\/(not-found|internal|unavailable|unimplemented)|Failed to fetch|NetworkError|CORS/i;

function functionMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return FUNCTION_MISSING.test(`${e?.code ?? ''} ${e?.message ?? ''}`);
}

async function callable(name: 'submitDiscovery' | 'manageDiscovery', data: unknown) {
  if (!auth) throw Error('Sign-in is not configured for this build.');
  return (await httpsCallable(getFunctions(auth.app, 'northamerica-northeast1'), name)(data)).data;
}

/** Calgary calendar day, the window the five-a-day limit counts in. */
function calgaryDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export async function submitDiscovery(input: unknown): Promise<DiscoveryResult> {
  try {
    return { queued: false, data: await callable('submitDiscovery', input) };
  } catch (error) {
    if (!functionMissing(error) || !db || !auth?.currentUser) throw error;
    const uid = auth.currentUser.uid;
    const day = calgaryDay();
    // Slots 1–5 for today; the rules refuse anything else, which is the limit.
    for (let slot = 1; slot <= 5; slot++) {
      try {
        await setDoc(doc(db, 'entity_submissions', `${uid}_${day}_${slot}`), {
          id: `${uid}_${day}_${slot}`, input, submittedBy: uid, status: 'pending', createdAt: new Date().toISOString(), via: 'direct',
        });
        return { queued: true };
      } catch (writeError) {
        // An existing slot is a permission error (no updates allowed); try the next.
        if (slot === 5) throw new Error('You’ve shared five listings today, thank you! Try again tomorrow.');
        void writeError;
      }
    }
    throw error;
  }
}

export async function manageDiscovery(data: Record<string, unknown>): Promise<DiscoveryResult> {
  try {
    return { queued: false, data: await callable('manageDiscovery', data) };
  } catch (error) {
    if (!functionMissing(error) || !db || !auth?.currentUser) throw error;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await setDoc(doc(db, 'discovery_actions', id), {
      id, action: data, adminUid: auth.currentUser.uid, adminEmail: auth.currentUser.email ?? '', status: 'pending', createdAt: Date.now(),
    });
    return { queued: true };
  }
}

/** Kept for existing callers. */
export async function discoveryCall(name: 'submitDiscovery' | 'manageDiscovery', data: unknown) {
  return name === 'submitDiscovery' ? submitDiscovery(data) : manageDiscovery(data as Record<string, unknown>);
}
