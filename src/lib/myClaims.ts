import { useSyncExternalStore } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { CLAIMS, type ListingClaim } from './claims';
import { createSharedLiveValue, trackSubscription } from './readEfficiency';

type ClaimState = { claims: ListingClaim[] | null; failed: boolean };
const initialClaims: ClaimState = { claims: null, failed: false };
const claimStreams = new Map<string, ReturnType<typeof createSharedLiveValue<ClaimState>>>();
function claimStream(uid: string) {
  let stream = claimStreams.get(uid);
  if (!stream) {
    stream = createSharedLiveValue<ClaimState>(initialClaims, publish => db
      ? trackSubscription(`member:claims:${uid}`, () => onSnapshot(query(collection(db!, CLAIMS), where('uid','==',uid), limit(50)),
        snap => publish({ claims: snap.docs.map(d => d.data() as ListingClaim).sort((a,b) => b.createdAt-a.createdAt), failed: false }), () => publish({ claims: null, failed: true })))
      : () => {});
    claimStreams.set(uid, stream);
  }
  return stream;
}
const noClaims = createSharedLiveValue<ClaimState>(initialClaims, () => () => {});
/** Nav, dashboard and claim page share one query for this authenticated UID. */
export function useMyClaims(uid: string | undefined): ListingClaim[] | null {
  const stream = uid ? claimStream(uid) : noClaims;
  return useSyncExternalStore(stream.subscribe, stream.getSnapshot, () => initialClaims).claims;
}

/** Shares the existing claim listener; a failed lookup must not look like endless loading. */
export function useClaimLoadError(uid: string | undefined): boolean {
  const stream = uid ? claimStream(uid) : noClaims;
  return useSyncExternalStore(stream.subscribe, stream.getSnapshot, () => initialClaims).failed;
}
