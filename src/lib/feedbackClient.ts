/**
 * Writing resident feedback.
 *
 * One deterministic document per user per incident (id = uid + '_' + incident),
 * so a second answer from the same person overwrites the first rather than
 * stacking — the rules enforce the same shape. Firebase is imported lazily so
 * the module stays free of `import.meta.env` for unit tests. Records the funnel
 * event on success.
 */

import { feedbackDocId, type FeedbackKind } from '@/src/lib/feedback';
import { logProductEvent } from '@/src/lib/productEvents';

/**
 * Persist one resident's answer for an incident. Resolves false when Firebase
 * is not configured or the write is rejected, so callers can surface a retry
 * without a thrown error crossing into the UI.
 */
export async function recordFeedback(
  incidentId: string,
  kind: FeedbackKind,
  uid: string,
): Promise<boolean> {
  try {
    const [{ db }, { doc, setDoc }] = await Promise.all([
      import('@/src/firebase'),
      import('firebase/firestore'),
    ]);
    if (!db) return false;
    const now = Date.now();
    await setDoc(
      doc(db, 'incident_feedback', feedbackDocId(uid, incidentId)),
      { incidentId, uid, kind, updatedAt: now, createdAt: now },
      { merge: true },
    );
    logProductEvent('feedback_added', { kind });
    return true;
  } catch {
    return false;
  }
}
