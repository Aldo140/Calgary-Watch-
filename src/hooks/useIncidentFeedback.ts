/**
 * The reader's own feedback on one incident.
 *
 * The public corroboration aggregate lives on the incident document
 * (maintained by the feedback Cloud Function) and is read from there — this
 * hook only fetches the *reader's own* record, so the detail panel can show
 * which button they already pressed. Per-user feedback is owner-readable only,
 * mirroring the incident_reporters PII split, so this never reads anyone else's.
 */

import { useEffect, useState } from 'react';
import { db, auth } from '@/src/firebase';
import { feedbackDocId, type FeedbackKind, type IncidentFeedback } from '@/src/lib/feedback';

export function useMyIncidentFeedback(incidentId: string | null): FeedbackKind | null {
  const [myKind, setMyKind] = useState<FeedbackKind | null>(null);

  useEffect(() => {
    setMyKind(null);
    const uid = auth?.currentUser?.uid ?? null;
    if (!db || !incidentId || !uid) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      const { doc, onSnapshot } = await import('firebase/firestore');
      if (cancelled || !db) return;
      unsub = onSnapshot(
        doc(db, 'incident_feedback', feedbackDocId(uid, incidentId)),
        (snap) => setMyKind(snap.exists() ? (snap.data() as IncidentFeedback).kind : null),
        () => setMyKind(null),
      );
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [incidentId]);

  return myKind;
}
