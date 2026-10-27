import { useEffect, useState } from 'react';
import { streetLookupUrls, summarizeStreetRows, type StreetAnswer, type StreetGuess } from '../lib/searchIntent';

export type StreetState = { status: 'idle' | 'loading' | 'ready' | 'none'; answer?: StreetAnswer };

/** One register lookup per street per page load; /search and its answer card share it. */
const cache = new Map<string, Promise<StreetAnswer | null>>();

/** Ask the City's address register for a street. Resolves null when it isn't there or the register can't be reached. */
export function lookupStreet(street: StreetGuess): Promise<StreetAnswer | null> {
  const key = JSON.stringify(street);
  let hit = cache.get(key);
  if (!hit) {
    hit = (async () => {
      for (const url of streetLookupUrls(street)) {
        const res = await fetch(url);
        const rows = res.ok ? await res.json() : [];
        const answer = Array.isArray(rows) ? summarizeStreetRows(rows, street) : null;
        if (answer) return answer;
      }
      return null;
    })().catch(() => { cache.delete(key); return null; });
    cache.set(key, hit);
  }
  return hit;
}

export function useStreetLookup(street: StreetGuess | null): StreetState {
  const [state, setState] = useState<StreetState>({ status: street ? 'loading' : 'idle' });
  const key = street ? JSON.stringify(street) : '';
  useEffect(() => {
    if (!street) { setState({ status: 'idle' }); return; }
    let live = true;
    setState({ status: 'loading' });
    lookupStreet(street).then(answer => { if (live) setState(answer ? { status: 'ready', answer } : { status: 'none' }); });
    return () => { live = false; };
    // `key` stands in for the street object, which is rebuilt every render.
  }, [key]);
  return state;
}
