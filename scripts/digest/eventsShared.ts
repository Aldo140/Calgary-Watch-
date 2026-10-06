/**
 * Event picks for one reader, shared by both senders.
 *
 * Thursday (events.ts) sends picks on their own. Monday (weekly.ts) folds the
 * same picks into the combined "your week" email for readers on both lists.
 * Both must read the same inventory, honour the same opt-outs and rank the
 * same way, so that logic lives here once.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildEventPicks, neighbourhoodPoint, type EventInterestId, type EventPicks, type Point } from '../../src/lib/eventPicks.js';
import { eventsEmailMode, type EventsEmailMode } from '../../src/lib/eventsDigest.js';
import { createDiscoveryRepository } from '../../src/lib/discovery.js';
import { resolveHomeLocation } from '../../src/hooks/useHomeLocation.js';
import type { DiscoveryEntity, MarketOccurrence } from '../../src/types/discovery.js';

export const EVENTS_UNSUBS = 'events_digest_unsubscribes';
const RSVPS = 'event_rsvps';

export interface Inventory {
  entities: readonly DiscoveryEntity[];
  occurrences: readonly MarketOccurrence[];
  generatedAt?: string;
}

/** The same published inventory the site was built with. */
export function loadInventory(): Inventory {
  const file = join(process.cwd(), 'src/generated/discovery-index.json');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { generatedAt?: string; entities: DiscoveryEntity[]; occurrences: MarketOccurrence[] };
  const repo = createDiscoveryRepository(raw.entities, raw.occurrences, false);
  return { entities: repo.list(), occurrences: repo.occurrences(), generatedAt: raw.generatedAt };
}

/**
 * Opt-outs filed from a Thursday (or combined) email link. Stamped, never
 * deleted (CASL burden of proof). Monday runs this too, so somebody who left
 * the events list on Tuesday never sees picks in next Monday's email.
 */
export async function processEventsUnsubscribes(db: Firestore, tag: string): Promise<number> {
  const pending = await db.collection(EVENTS_UNSUBS).where('processedAt', '==', null).get();
  let honoured = 0;
  for (const request of pending.docs) {
    const uid = request.id;
    try {
      const requestedAt = typeof request.data().requestedAt === 'number' ? request.data().requestedAt as number : 0;
      const profileRef = db.collection('users').doc(uid);
      const profile = (await profileRef.get()).data() ?? {};
      const consentAt = profile.eventsDigestOptIn === true && typeof profile.eventsDigestOptInAt === 'number' ? profile.eventsDigestOptInAt as number : 0;
      if (consentAt > requestedAt) {
        await request.ref.set({ processedAt: Date.now(), outcome: 'superseded-by-new-consent' }, { merge: true });
        continue;
      }
      await profileRef.set({
        eventsDigestOptIn: false,
        eventsDigestOptInAt: null,
        eventsDigestUnsubscribedAt: Date.now(),
        eventsDigestUnsubscribeSource: 'email-link',
      }, { merge: true });
      await request.ref.set({ processedAt: Date.now(), outcome: 'unsubscribed' }, { merge: true });
      honoured += 1;
      console.log(`[${tag}] unsubscribed ${uid} from event picks`);
    } catch (error) {
      console.error(`[${tag}] FAILED to honour events unsubscribe for ${uid}:`, error);
      process.exitCode = 1;
    }
  }
  return honoured;
}

export interface ReaderPicks {
  picks: EventPicks;
  /** "What else is on", only when nothing matched their interests. */
  fallback: EventPicks | null;
  mode: EventsEmailMode;
  /** Area label for the template: the neighbourhood, "home" for an address-only reader, or ''. */
  area: string;
}

/** Picks for one reader. Addresses are geocoded once per run via `geocode`. */
export async function readerPicks(opts: {
  db: Firestore;
  inventory: Inventory;
  uid: string;
  interests: readonly EventInterestId[];
  neighbourhood: string;
  address: string;
  now: Date;
  days: number;
  limit: number;
  fallbackLimit?: number;
  geocode: Map<string, Point | null>;
}): Promise<ReaderPicks> {
  const area = opts.neighbourhood.trim();
  let home: Point | null = null;
  const address = opts.address.trim();
  if (address) {
    if (!opts.geocode.has(address)) opts.geocode.set(address, await resolveHomeLocation(address));
    home = opts.geocode.get(address) ?? null;
  }
  home ??= neighbourhoodPoint(area);

  const rsvps = await opts.db.collection(RSVPS).where('uid', '==', opts.uid).get();
  const goingIds = new Set(rsvps.docs.map((d) => String(d.data().eventId)));

  const base = { entities: opts.inventory.entities, occurrences: opts.inventory.occurrences, home, homeArea: area, goingIds, now: opts.now, days: opts.days };
  const picks = buildEventPicks({ ...base, interests: opts.interests, limit: opts.limit });
  // Nothing matched their interests: a short "what else is on" instead of nothing.
  const fallback = picks.picks.length ? null : buildEventPicks({ ...base, interests: [], limit: opts.fallbackLimit ?? 5 });
  // "home" when only a street address resolved: distances work, no prompt to add an area.
  return { picks, fallback, mode: eventsEmailMode(picks, fallback), area: area || (home ? 'home' : '') };
}
