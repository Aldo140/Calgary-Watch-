/**
 * Plans: event interests, "I'm going", and the Thursday picks email.
 *
 * ── Where things live ──────────────────────────────────────────────────────
 * Interests and the email opt-in sit on the reader's own `users/{uid}`
 * profile, beside the neighbourhood/address the Monday email already uses, so
 * somebody who set up the live map never types their area twice.
 *
 * "I'm going" is private: `event_rsvps/{uid}_{eventId}` is readable only by
 * its owner. The public sees a number, `event_rsvp_counts/{eventId}.count`,
 * which the browser updates in the same batch as the RSVP. Firestore rules
 * check both halves together (see firestore.rules), so a count can only move
 * by one, and only alongside the caller's own RSVP appearing or disappearing.
 * That keeps the tally honest without a Cloud Function.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { collection, doc, getDoc, getDocs, increment, limit, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import type { EventInterestId } from './eventPicks';
import { readPlansProfile, type PlansProfile } from './plansProfile';

export { homeAreaOf, readPlansProfile, type PlansProfile } from './plansProfile';

export const RSVPS = 'event_rsvps';
export const RSVP_COUNTS = 'event_rsvp_counts';

export function rsvpId(uid: string, eventId: string): string {
  return `${uid}_${eventId}`;
}

/** Live view of the signed-in reader's profile. `null` while loading or signed out. */
export function usePlansProfile(uid: string | undefined): PlansProfile | null {
  const [profile, setProfile] = useState<PlansProfile | null>(null);
  useEffect(() => {
    if (!uid || !db) { setProfile(null); return; }
    return onSnapshot(doc(db, 'users', uid), (snap) => setProfile(readPlansProfile(snap.data())), () => setProfile(readPlansProfile(undefined)));
  }, [uid]);
  return profile;
}

export interface PlansDraft {
  interests: EventInterestId[];
  neighborhood: string;
  address: string;
  inferredNeighborhood: string;
  consent: boolean;
  eventsDigestOptIn: boolean;
}

/**
 * Save interests, area and the email choice in one merge. Identity fields are
 * repeated because the users rule validates the whole resulting document, and
 * a first sign-in can race the background profile sync.
 */
export async function savePlans(user: User, existing: PlansProfile | null, draft: PlansDraft): Promise<void> {
  if (!db) throw new Error('Sign-in is unavailable right now.');
  const neighborhood = draft.neighborhood.trim().slice(0, 80);
  const address = draft.address.trim().slice(0, 160);
  const now = Date.now();
  const wasOn = existing?.eventsDigestOptIn === true;
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    displayName: user.displayName || existing?.displayName || 'Calgary User',
    email: user.email || existing?.email || '',
    photoURL: user.photoURL || existing?.photoURL || '',
    neighborhood,
    address,
    inferredNeighborhood: draft.inferredNeighborhood.trim().slice(0, 80),
    locationPreferenceType: address ? 'address' : 'neighborhood',
    piiConsentAt: existing?.piiConsentAt || now,
    eventInterests: draft.interests,
    eventsDigestOptIn: draft.eventsDigestOptIn,
    // Consent date is kept from the first opt-in, cleared on opt-out — the same
    // shape the Monday email uses, so the CASL record reads the same way.
    eventsDigestOptInAt: draft.eventsDigestOptIn ? (wasOn && existing?.eventsDigestOptInAt) || now : null,
    // An earlier opt-out stays on record until the reader opts back in.
    ...(draft.eventsDigestOptIn
      ? { eventsDigestUnsubscribedAt: null, eventsDigestUnsubscribeSource: null }
      : wasOn ? { eventsDigestUnsubscribedAt: now, eventsDigestUnsubscribeSource: 'plans-page' } : {}),
    plansUpdatedAt: now,
    profileUpdatedAt: now,
  }, { merge: true });
}

// ── "I'm going" ─────────────────────────────────────────────────────────────

/**
 * One shared copy of the reader's RSVPs for the whole tab, so a detail page,
 * a card and the plans page agree the instant one of them changes.
 */
type GoingState = { uid: string | null; ids: ReadonlySet<string>; ready: boolean };
let going: GoingState = { uid: null, ids: new Set(), ready: false };
const listeners = new Set<() => void>();
const emit = (next: GoingState) => { going = next; listeners.forEach((l) => l()); };

async function loadGoing(uid: string) {
  if (!db) return;
  try {
    const snap = await getDocs(query(collection(db, RSVPS), where('uid', '==', uid), limit(500)));
    if (going.uid !== uid) return;
    emit({ uid, ids: new Set(snap.docs.map((d) => String(d.data().eventId))), ready: true });
  } catch {
    if (going.uid === uid) emit({ uid, ids: new Set(), ready: true });
  }
}

export function useMyGoing(uid: string | undefined): GoingState {
  useEffect(() => {
    if (!uid) { if (going.uid !== null) emit({ uid: null, ids: new Set(), ready: false }); return; }
    if (going.uid !== uid) { emit({ uid, ids: new Set(), ready: false }); void loadGoing(uid); }
  }, [uid]);
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => going, () => going);
}

/** Record or withdraw an RSVP and move the public count with it, atomically. */
export async function setGoing(uid: string, eventId: string, start: string, on: boolean): Promise<void> {
  if (!db) throw new Error('Sign-in is unavailable right now.');
  const batch = writeBatch(db);
  const rsvp = doc(db, RSVPS, rsvpId(uid, eventId));
  const count = doc(db, RSVP_COUNTS, eventId);
  if (on) batch.set(rsvp, { uid, eventId, start: start.slice(0, 40), createdAt: Date.now() });
  else batch.delete(rsvp);
  batch.set(count, { count: increment(on ? 1 : -1), updatedAt: Date.now() }, { merge: true });
  // Optimistic: the button answers immediately, and rolls back if rules refuse.
  const before = going;
  const ids = new Set(going.ids);
  if (on) ids.add(eventId); else ids.delete(eventId);
  emit({ ...going, ids });
  try {
    await batch.commit();
  } catch (error) {
    emit(before);
    throw error;
  }
}

/** Public "N going" for one listing. Undefined while loading or unavailable. */
export async function readGoingCount(eventId: string): Promise<number | undefined> {
  if (!db) return undefined;
  try {
    const snap = await getDoc(doc(db, RSVP_COUNTS, eventId));
    const n = snap.data()?.count;
    return typeof n === 'number' && n > 0 ? n : 0;
  } catch {
    return undefined;
  }
}

/** Public reports the reader authored, for the one report badge. Capped; it only needs "at least one". */
export async function readMyReportCount(uid: string): Promise<number | undefined> {
  if (!db) return undefined;
  try {
    const snap = await getDocs(query(collection(db, 'incidents'), where('authorUid', '==', uid), where('visibility', '==', 'public'), limit(5)));
    return snap.size;
  } catch {
    return undefined;
  }
}
