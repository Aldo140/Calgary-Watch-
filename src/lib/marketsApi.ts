import { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDocs, limit, onSnapshot, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase';
import {
  APPLICATIONS, LINEUPS, MESSAGES, SERVICE, VENDORS, VENDOR_CONTACTS, vendorId, vendorSlug,
  type ApplicationDraft, type Lineup, type Vendor, type VendorApplication, type VendorContact, type VendorMessage,
} from './markets';

/** Live rows of one market's collection. `null` while loading, `[]` on denial. */
function useMarketCollection<T>(name: string, marketId: string | undefined, extra?: [string, unknown]): Array<T & { id: string }> | null {
  const [rows, setRows] = useState<Array<T & { id: string }> | null>(null);
  const extraKey = extra ? `${extra[0]}=${String(extra[1])}` : '';
  useEffect(() => {
    if (!db || !marketId) { setRows(marketId ? [] : null); return; }
    const filters = [where('marketId', '==', marketId), ...(extra ? [where(extra[0], '==', extra[1])] : [])];
    return onSnapshot(query(collection(db, name), ...filters, limit(500)),
      (s) => setRows(s.docs.map((d) => ({ ...(d.data() as T), id: d.id }))),
      () => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, marketId, extraKey]);
  return rows;
}

export const useVendors = (marketId?: string) => useMarketCollection<Vendor>(VENDORS, marketId);
export const useVendorContacts = (marketId?: string) => useMarketCollection<VendorContact>(VENDOR_CONTACTS, marketId);
export const useLineups = (marketId?: string) => useMarketCollection<Lineup>(LINEUPS, marketId);
export const usePublishedLineups = (marketId?: string) => useMarketCollection<Lineup>(LINEUPS, marketId, ['published', true]);
export const useApplications = (marketId?: string) => useMarketCollection<VendorApplication>(APPLICATIONS, marketId);
export const useVendorMessages = (marketId?: string) => useMarketCollection<VendorMessage>(MESSAGES, marketId);

export async function saveVendor(
  marketId: string,
  v: { name: string; category: string; description: string; website: string; instagram: string; active: boolean; slug?: string; createdAt?: number },
  contact?: { contactName: string; email: string; phone: string; optedOut?: boolean },
): Promise<string> {
  if (!db) throw new Error('Unavailable');
  const slug = v.slug || vendorSlug(v.name);
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(db, VENDORS, vendorId(marketId, slug)), {
    marketId, slug, name: v.name.trim().slice(0, 120), category: v.category.slice(0, 60),
    description: v.description.trim().slice(0, 600), website: v.website.trim().slice(0, 300), instagram: v.instagram.trim().replace(/^@/, '').slice(0, 80),
    active: v.active, createdAt: v.createdAt ?? now, updatedAt: now,
  } satisfies Vendor);
  if (contact) {
    batch.set(doc(db, VENDOR_CONTACTS, vendorId(marketId, slug)), {
      marketId, vendorSlug: slug, contactName: contact.contactName.trim().slice(0, 80), email: contact.email.trim().toLowerCase().slice(0, 160),
      phone: contact.phone.trim().slice(0, 40), optedOut: contact.optedOut ?? false, updatedAt: now,
    } satisfies VendorContact);
  }
  await batch.commit();
  return slug;
}

export async function saveLineup(marketId: string, occurrenceId: string, start: string, vendorSlugs: string[], note: string, published: boolean): Promise<void> {
  if (!db) throw new Error('Unavailable');
  await setDoc(doc(db, LINEUPS, occurrenceId), {
    marketId, occurrenceId, start, vendorSlugs: [...new Set(vendorSlugs)].slice(0, 300), note: note.trim().slice(0, 1200), published, updatedAt: Date.now(),
  } satisfies Lineup);
}

/** Approving an application adds the vendor (and their private contact) to the roster in one write. */
export async function decideApplication(user: User, app: VendorApplication & { id: string }, approve: boolean): Promise<void> {
  if (!db) throw new Error('Unavailable');
  const batch = writeBatch(db);
  batch.update(doc(db, APPLICATIONS, app.id), { status: approve ? 'approved' : 'declined', reviewedAt: Date.now(), reviewedBy: user.email ?? user.uid });
  if (approve) {
    const slug = vendorSlug(app.businessName);
    const now = Date.now();
    batch.set(doc(db, VENDORS, vendorId(app.marketId, slug)), {
      marketId: app.marketId, slug, name: app.businessName.slice(0, 120), category: app.category.slice(0, 60), description: app.description.slice(0, 600),
      website: app.website.slice(0, 300), instagram: app.instagram.replace(/^@/, '').slice(0, 80), active: true, createdAt: now, updatedAt: now,
    } satisfies Vendor);
    batch.set(doc(db, VENDOR_CONTACTS, vendorId(app.marketId, slug)), {
      marketId: app.marketId, vendorSlug: slug, contactName: app.contactName.slice(0, 80), email: app.email.toLowerCase().slice(0, 160), phone: app.phone.slice(0, 40), optedOut: false, updatedAt: now,
    } satisfies VendorContact);
  }
  await batch.commit();
}

export async function setContactOptOut(marketId: string, slug: string, optedOut: boolean): Promise<void> {
  if (!db) throw new Error('Unavailable');
  await updateDoc(doc(db, VENDOR_CONTACTS, vendorId(marketId, slug)), { optedOut, updatedAt: Date.now() });
}

export async function queueVendorMessage(user: User, m: Pick<VendorMessage, 'marketId' | 'marketTitle' | 'audience' | 'occurrenceId' | 'subject' | 'body' | 'replyTo'>): Promise<void> {
  if (!db) throw new Error('Unavailable');
  await addDoc(collection(db, MESSAGES), {
    marketId: m.marketId, marketTitle: m.marketTitle.slice(0, 160), audience: m.audience, occurrenceId: m.occurrenceId,
    subject: m.subject.trim().slice(0, 140), body: m.body.trim().slice(0, 5000), replyTo: m.replyTo.trim().slice(0, 160),
    status: 'queued', createdBy: user.uid, createdAt: Date.now(),
  });
}

export async function submitApplication(user: User, market: { id: string; title: string }, d: ApplicationDraft): Promise<void> {
  if (!db) throw new Error('Unavailable');
  await addDoc(collection(db, APPLICATIONS), {
    uid: user.uid, marketId: market.id, marketTitle: market.title.slice(0, 160), businessName: d.businessName.trim().slice(0, 120), category: d.category.slice(0, 60),
    description: d.description.trim().slice(0, 1200), website: d.website.trim().slice(0, 300), instagram: d.instagram.trim().replace(/^@/, '').slice(0, 80),
    contactName: d.contactName.trim().slice(0, 80), email: d.email.trim().toLowerCase().slice(0, 160), phone: d.phone.trim().slice(0, 40),
    availability: d.availability.trim().slice(0, 600), status: 'pending', createdAt: Date.now(),
  } satisfies VendorApplication);
}

export async function myApplications(uid: string): Promise<VendorApplication[]> {
  if (!db) return [];
  try {
    const s = await getDocs(query(collection(db, APPLICATIONS), where('uid', '==', uid), limit(50)));
    return s.docs.map((d) => d.data() as VendorApplication);
  } catch { return []; }
}

export async function requestService(user: User, market: { id: string; title: string }, plan: 'managed' | 'self', note: string, contact: string): Promise<void> {
  if (!db) throw new Error('Unavailable');
  await setDoc(doc(db, SERVICE, `${user.uid}_${market.id}`), {
    uid: user.uid, marketId: market.id, marketTitle: market.title.slice(0, 160), plan, note: note.trim().slice(0, 1200), contact: contact.trim().slice(0, 160), status: 'new', createdAt: Date.now(),
  });
}
