/**
 * Live resident feedback for one incident.
 *
 * Subscribes to every feedback record for the given incident and reduces it to
 * an aggregate the detail panel can read. This is the on-read half of the
 * lifecycle — corroboration is computed on the client from the collection,
 * with no server fan-out and nothing written back onto the incident document.
 *
 * `myKind` is the current reader's own answer, so the panel can show which
 * button they already pressed.
 */

import { useEffect, useMemo, useState } from 'react';
import { db, auth } from '@/src/firebase';
import {
  aggregateFeedback,
  feedbackDocId,
  type FeedbackAggregate,
  type FeedbackKind,
  type IncidentFeedback,
} from '@/src/lib/feedback';

export function useIncidentFeedback(incidentId: string | null): {
  aggregate: FeedbackAggregate;
  myKind: FeedbackKind | null;
} {
  const [docs, setDocs] = useState<IncidentFeedback[]>([]);

  useEffect(() => {
    setDocs([]);
    if (!db || !incidentId) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      const { collection, query, where, onSnapshot } = await import('firebase/firestore');
      if (cancelled || !db) return;
      const q = query(collection(db, 'incident_feedback'), where('incidentId', '==', incidentId));
      unsub = onSnapshot(
        q,
        (snap) => setDocs(snap.docs.map((d) => d.data() as IncidentFeedback)),
        () => setDocs([]),
      );
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [incidentId]);

  const aggregate = useMemo(() => aggregateFeedback(docs, Date.now()), [docs]);

  const uid = auth?.currentUser?.uid ?? null;
  const myKind = useMemo(() => {
    if (!uid || !incidentId) return null;
    const mine = docs.find((d) => d.uid === uid || feedbackDocId(d.uid, d.incidentId) === feedbackDocId(uid, incidentId));
    return mine ? mine.kind : null;
  }, [docs, uid, incidentId]);

  return { aggregate, myKind };
}
