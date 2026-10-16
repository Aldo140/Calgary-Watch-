import { createSharedLiveValue, trackSubscription } from './readEfficiency';
import { listingUpdateRequest } from './listingUpdates';
import { approvedPublicMark } from './claimApproval';
import { discoveryRepository } from '../data/discovery';
import { entityPath } from './discovery';
import { useEffect, useState, useSyncExternalStore, useCallback } from 'react';
import { addDoc, collection, doc, getDocs, limit, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import { CLAIMS, UPDATES, VERIFIED, claimId, type ClaimDraft, type ListingClaim, type UpdateField } from './claims';

const claimStreams = new Map<string, ReturnType<typeof createSharedLiveValue<ListingClaim[] | null>>>();
function claimStream(uid: string) {
  let stream = claimStreams.get(uid);
  if (!stream) {
    stream = createSharedLiveValue<ListingClaim[] | null>(null, publish => db
      ? trackSubscription(`member:claims:${uid}`, () => onSnapshot(query(collection(db!, CLAIMS), where('uid','==',uid), limit(50)),
        snap => publish(snap.docs.map(d => d.data() as ListingClaim).sort((a,b) => b.createdAt-a.createdAt)), () => publish(null)))
      : () => {});
    claimStreams.set(uid, stream);
  }
  return stream;
}
const noClaims = createSharedLiveValue<ListingClaim[] | null>(null, () => () => {});
/** Nav, dashboard and claim page share one query for this authenticated UID. */
export function useMyClaims(uid: string | undefined): ListingClaim[] | null {
  const stream = uid ? claimStream(uid) : noClaims;
  return useSyncExternalStore(stream.subscribe, stream.getSnapshot, () => null);
}

export async function submitClaim(user: User, entity: { id: string; title: string; path: string }, draft: ClaimDraft): Promise<void> {
  if (!db) throw new Error('Sign-in is unavailable right now.');
  const published = discoveryRepository.list().find(e => e.id === entity.id && ['event', 'market', 'business'].includes(e.kind) && !e.developmentOnly);
  if (!published || entityPath(published) !== entity.path) throw new Error('This listing is not published.');
  if (!user.emailVerified) throw new Error('Use a Google account with a verified email address.');
  const claim: ListingClaim = {
    uid: user.uid,
    entityId: entity.id,
    entityTitle: entity.title.slice(0, 160),
    entityPath: entity.path.slice(0, 200),
    name: draft.name.trim().slice(0, 80),
    role: draft.role.slice(0, 60),
    workEmail: draft.workEmail.trim().toLowerCase().slice(0, 160),
    accountEmail: (user.email ?? '').toLowerCase(),
    phone: draft.phone.trim().slice(0, 40),
    note: draft.note.trim().slice(0, 1000),
    status: 'pending',
    createdAt: Date.now(),
  };
  await setDoc(doc(db!, CLAIMS, claimId(user.uid, entity.id)), claim);
}

export async function submitUpdate(user: User, claim: Pick<ListingClaim, 'entityId' | 'entityTitle'>, field: UpdateField, details: string, url: string): Promise<void> {
  if (!db) throw new Error('Sign-in is unavailable right now.');
  await addDoc(collection(db, UPDATES), listingUpdateRequest(user.uid, claim, field, details, url, Date.now()));
}

export async function readMyUpdates(uid: string, entityId: string, reportErrors = false): Promise<Array<{ field: UpdateField; details: string; status: string; createdAt: number }>> {
  if (!db) return [];
  try {
    const s = await getDocs(query(collection(db, UPDATES), where('uid', '==', uid), limit(50)));
    return s.docs.map((d) => d.data() as { entityId: string; field: UpdateField; details: string; status: string; createdAt: number })
      .filter((u) => u.entityId === entityId)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    if (reportErrors) throw error;
    return [];
  }
}

type MarkState = { value?: boolean; listeners: Set<() => void>; stop?: () => void };
const marks = new Map<string, MarkState>();
function markState(id: string): MarkState {
  let state = marks.get(id);
  if (!state) { state = { listeners: new Set() }; marks.set(id, state); }
  return state;
}

/** One shared live result prevents the badge and claim CTA from contradicting each other. */
export function useVerifiedListing(entityId: string, built = false): boolean {
  const state = markState(entityId);
  const subscribe = useCallback((notify: () => void) => {
    state.listeners.add(notify);
    if (db && !state.stop) {
      state.stop = trackSubscription(`listing:verification:${entityId}`, () => onSnapshot(doc(db!, VERIFIED, entityId), snap => {
        // Legacy marks have no claim reference. Only an approved-claim build stamp can vouch for those.
        state.value = snap.exists() ? (approvedPublicMark(entityId, snap.data()) || (built && !snap.data().claimId)) : built;
        state.listeners.forEach(fn => fn());
      }, error => { state.value = error.code === 'permission-denied' ? false : (state.value ?? built); state.listeners.forEach(fn => fn()); }));
    }
    return () => { state.listeners.delete(notify); if (!state.listeners.size) { state.stop?.(); state.stop = undefined; } };
  }, [state, entityId, built]);
  return useSyncExternalStore(subscribe, () => state.value ?? built, () => built);
}
