import { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import { CLAIMS, UPDATES, VERIFIED, claimId, type ClaimDraft, type ListingClaim, type UpdateField } from './claims';

/** The signed-in reader's claims, live. `null` while loading. */
export function useMyClaims(uid: string | undefined): ListingClaim[] | null {
  const [claims, setClaims] = useState<ListingClaim[] | null>(null);
  useEffect(() => {
    if (!uid || !db) { setClaims(uid ? [] : null); return; }
    return onSnapshot(
      query(collection(db, CLAIMS), where('uid', '==', uid), limit(50)),
      (s) => setClaims(s.docs.map((d) => d.data() as ListingClaim).sort((a, b) => b.createdAt - a.createdAt)),
      () => setClaims([]),
    );
  }, [uid]);
  return claims;
}

export async function submitClaim(user: User, entity: { id: string; title: string; path: string }, draft: ClaimDraft): Promise<void> {
  if (!db) throw new Error('Sign-in is unavailable right now.');
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
  await setDoc(doc(db, CLAIMS, claimId(user.uid, entity.id)), claim);
}

export async function submitUpdate(user: User, claim: Pick<ListingClaim, 'entityId' | 'entityTitle'>, field: UpdateField, details: string, url: string): Promise<void> {
  if (!db) throw new Error('Sign-in is unavailable right now.');
  await addDoc(collection(db, UPDATES), {
    uid: user.uid,
    entityId: claim.entityId,
    entityTitle: claim.entityTitle,
    field,
    details: details.trim().slice(0, 2000),
    url: url.trim().slice(0, 2000),
    status: 'pending',
    createdAt: Date.now(),
  });
}

export async function readMyUpdates(uid: string, entityId: string): Promise<Array<{ field: UpdateField; details: string; status: string; createdAt: number }>> {
  if (!db) return [];
  try {
    const s = await getDocs(query(collection(db, UPDATES), where('uid', '==', uid), limit(50)));
    return s.docs.map((d) => d.data() as { entityId: string; field: UpdateField; details: string; status: string; createdAt: number })
      .filter((u) => u.entityId === entityId)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

const verifiedCache = new Map<string, boolean>();

/** "Managed by the organizer": one public read per listing, remembered for the visit. */
export function useVerifiedListing(entityId: string): boolean {
  const [on, setOn] = useState(() => verifiedCache.get(entityId) ?? false);
  useEffect(() => {
    if (!db || verifiedCache.has(entityId)) { setOn(verifiedCache.get(entityId) ?? false); return; }
    let live = true;
    getDoc(doc(db, VERIFIED, entityId))
      .then((s) => { verifiedCache.set(entityId, s.exists()); if (live) setOn(s.exists()); })
      .catch(() => verifiedCache.set(entityId, false));
    return () => { live = false; };
  }, [entityId]);
  return on;
}
