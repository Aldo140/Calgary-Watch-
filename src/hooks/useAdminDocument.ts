import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { adminFirestoreActionError } from "../lib/firestoreErrors";
/** Missing documents and failed reads are different states. */
export function useAdminDocument<T>(collection: string, id: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setLoading(true);
    setError("");
    if (!db) {
      setError("Firebase is not configured.");
      setLoading(false);
      return;
    }
    return onSnapshot(
      doc(db, collection, id),
      (snapshot) => {
        setData(snapshot.exists() ? (snapshot.data() as T) : null);
        setError("");
        setLoading(false);
      },
      (e) => {
        setError(adminFirestoreActionError(e));
        setLoading(false);
      },
    );
  }, [collection, id, attempt]);
  return { data, error, loading, retry: () => setAttempt((n) => n + 1) };
}
