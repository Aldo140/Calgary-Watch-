import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/src/firebase';
import { isPubliclyVisible, type Incident } from '@/src/types';
import { boardEntryToIncident, CRIME_BOARD_DOC, readCrimeBoard } from '@/src/lib/crimeBoard';

const REFRESH_MS = 15 * 60 * 1000;

/**
 * The crime board (src/lib/crimeBoard.ts): police releases, news crime,
 * emergency alerts and neighbours' crime reports from the last 35 days, read
 * as one document so the City's 311 volume can't crowd them off the map.
 *
 * A neighbour's report is re-read on its own before it is shown, so a report
 * hidden after the board was built never reappears from the copy. There are
 * only a handful, so that costs a handful of reads.
 */
export function useCrimeBoard(enabled: boolean): Incident[] {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!enabled || !db) return;
    const database = db;
    let cancelled = false;

    const load = async () => {
      try {
        const snap = await getDoc(doc(database, CRIME_BOARD_DOC.collection, CRIME_BOARD_DOC.id));
        const board = readCrimeBoard(snap.data(), Date.now());
        if (!board) return;
        const feeds = board.entries.filter((e) => !e.member).map(boardEntryToIncident);
        const members = await Promise.all(board.entries.filter((e) => e.member).map(async (entry) => {
          try {
            const live = await getDoc(doc(database, 'incidents', entry.id));
            if (!live.exists()) return null;
            const d = live.data();
            const incident = { id: live.id, ...d, lat: Number(d.lat), lng: Number(d.lng) } as Incident;
            return isPubliclyVisible(incident) ? incident : null;
          } catch {
            return null;
          }
        }));
        if (!cancelled) setIncidents([...feeds, ...members.filter((i): i is Incident => i !== null)]);
      } catch (error) {
        // The map still has its own newest-60 query; the board only adds to it.
        console.warn('[CalgaryWatch] Crime board unavailable:', error);
      }
    };

    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [enabled]);

  return incidents;
}
