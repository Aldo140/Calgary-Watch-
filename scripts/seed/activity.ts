/**
 * Calgary Watch — randomized example community pulse.
 *
 * These records are illustrative, never fabricated community submissions.
 * `data_source: 'demo'` excludes them from safety intelligence and email, and
 * exposes their origin to admins. Public rows use the ordinary anonymous
 * community-report presentation; opened details retain a provenance note.
 */

import { pathToFileURL } from 'node:url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

type WindowName = 'morning' | 'afternoon' | 'evening';

export interface PlannedPost {
  id: string;
  templateId: string;
  dueMinute: number;
  window: WindowName;
}

interface ExampleTemplate {
  id: string;
  title: string;
  description: string;
  category: 'crime';
  neighborhood: string;
  lat: number;
  lng: number;
  windows: WindowName[];
  months?: number[];
}

interface PulseState {
  date: string;
  planVersion: number;
  plan: PlannedPost[];
  published: string[];
  recentTemplateIds: string[];
}

const PLAN_VERSION = 4;
const CALGARY_TIME_ZONE = 'America/Edmonton';

export const POSTING_WINDOWS: Record<WindowName, { start: number; end: number }> = {
  morning: { start: 7 * 60 + 10, end: 10 * 60 + 40 },
  afternoon: { start: 11 * 60 + 20, end: 15 * 60 + 50 },
  evening: { start: 17 * 60, end: 21 * 60 + 40 },
};

/**
 * Content rules:
 * - no violence, drugs, identifiable people, homes, named businesses, or
 *   official/police claims;
 * - locations are approximate neighbourhood anchors around public space;
 * - every example is crime-related; wording ranges from casual to formal so
 *   the demo feed resembles the different ways real people write;
 * - wording and posting window must agree.
 */
export const QUEUE: ExampleTemplate[] = [
  {
    id: 'beltline-window-break',
    title: 'ugh, car window smashed overnight',
    description: 'Came out for work and the passenger window was gone. Nothing big was in there, just a charging cable. heads up if you park around here.',
    category: 'crime', neighborhood: 'Beltline', lat: 51.0381, lng: -114.0680,
    windows: ['morning'],
  },
  {
    id: 'hillhurst-car-rummaged',
    title: 'Pretty sure someone went through my car',
    description: 'Glove box was open this morning and the change tray was empty. I mightve missed the lock last night tbh, worth double checking yours.',
    category: 'crime', neighborhood: 'Hillhurst', lat: 51.0563, lng: -114.0903,
    windows: ['morning'],
  },
  {
    id: 'bowness-vehicle-missing',
    title: 'Vehicle missing from overnight parking spot',
    description: 'A vehicle left in the public lot last night was no longer there this morning. Towing records are being checked and a police report is being filed.',
    category: 'crime', neighborhood: 'Bowness', lat: 51.0975, lng: -114.1807,
    windows: ['morning'],
  },
  {
    id: 'brentwood-plate-missing',
    title: 'rear plate stolen off my car',
    description: 'Noticed before pulling out that the plate and screws were both gone. Never thought to check for that before... maybe take a quick look at yours.',
    category: 'crime', neighborhood: 'Brentwood', lat: 51.0788, lng: -114.1440,
    windows: ['morning', 'afternoon'],
  },
  {
    id: 'forest-lawn-converter',
    title: 'Catalytic converter taken overnight',
    description: 'The vehicle made a loud rattling sound when it started this morning, and the exhaust had been cut underneath. Higher-clearance vehicles nearby may want to use a well-lit spot tonight.',
    category: 'crime', neighborhood: 'Forest Lawn', lat: 51.0331, lng: -113.9798,
    windows: ['morning'],
  },
  {
    id: 'mission-door-handles',
    title: 'Heads up — someone checking car doors',
    description: 'Saw someone try a few handles along the public parking row, then take off when more people came around. Didnt confront them. Lock up and bring your stuff inside.',
    category: 'crime', neighborhood: 'Mission', lat: 51.0347, lng: -114.0670,
    windows: ['evening'],
  },
  {
    id: 'kensington-lobby-parcel',
    title: 'Package taken from apartment lobby',
    description: 'Courier photo shows the box inside the lobby, but it was gone about 20 mins later. Building manager is checking the camera and the delivery was reported.',
    category: 'crime', neighborhood: 'Kensington', lat: 51.0603, lng: -114.0903,
    windows: ['afternoon', 'evening'],
  },
  {
    id: 'bridgeland-storage-locker',
    title: 'Storage locker lock cut',
    description: 'Found the lock cut and a couple small things missing from the shared storage room. Management has the report and is reviewing who entered the building.',
    category: 'crime', neighborhood: 'Bridgeland', lat: 51.0602, lng: -114.0412,
    windows: ['morning', 'afternoon'],
  },
  {
    id: 'eau-claire-bike',
    title: 'Bike taken from the public rack',
    description: 'Was inside for maybe an hour and came back to a cut cable lock. Bike is gone. Use a proper U-lock here, the thin cable definately wasnt enough.',
    category: 'crime', neighborhood: 'Eau Claire', lat: 51.0538, lng: -114.0757,
    windows: ['afternoon', 'evening'],
  },
  {
    id: 'victoria-park-car-prowl',
    title: 'Bag taken from a parked vehicle',
    description: 'A small bag left on the back seat was gone after a short stop in a public parking area. There was no obvious damage, so the doors may not have latched. Check the lock confirmation before walking away.',
    category: 'crime', neighborhood: 'Victoria Park', lat: 51.0427, lng: -114.0559,
    windows: ['afternoon', 'evening'],
  },
  {
    id: 'inglewood-garage-door',
    title: 'Garage side door looks like it was pried',
    description: 'Fresh damage showed up around the latch overnight. Nothing seems missing, but the door no longer closes properly. Reported it and added a temporary brace.',
    category: 'crime', neighborhood: 'Inglewood', lat: 51.0406, lng: -114.0201,
    windows: ['morning'],
  },
  {
    id: 'crescent-heights-parcel',
    title: 'Parcel disappeared from front step',
    description: 'Delivery photo shows it arrived around lunch, but it was gone by the time anyone got home. Checking with neighbours for camera footage.',
    category: 'crime', neighborhood: 'Crescent Heights', lat: 51.0694, lng: -114.0625,
    windows: ['afternoon', 'evening'],
  },
  {
    id: 'sunnyside-bike-lock',
    title: 'Cut bike lock left beside rack',
    description: 'There is a cut cable lock beside the public rack and no bike with it. Posting in case the owner is looking for the spot or nearby camera coverage.',
    category: 'crime', neighborhood: 'Sunnyside', lat: 51.0563, lng: -114.0903,
    windows: ['afternoon', 'evening'],
  },
  {
    id: 'ramsay-shed-lock',
    title: 'Shed lock damaged overnight',
    description: 'The lock was bent and there are new marks around the latch. It does not look like entry was gained, but a report has been made for the record.',
    category: 'crime', neighborhood: 'Ramsay', lat: 51.0284, lng: -114.0353,
    windows: ['morning'],
  },
  {
    id: 'mckenzie-mailbox',
    title: 'Community mailbox doors forced open',
    description: 'A couple of compartments appear bent open. Mail delivery has been notified; if you use this box, check whether anything is missing.',
    category: 'crime', neighborhood: 'McKenzie Towne', lat: 50.9083, lng: -113.9534,
    windows: ['morning', 'afternoon'],
  },
  {
    id: 'inglewood-alley-prowl',
    title: 'possible car prowler in the alley',
    description: 'Someone was lingering around parked cars and looking through windows for a while. They left when a garage light came on. no confrontation, just a heads up.',
    category: 'crime', neighborhood: 'Inglewood', lat: 51.0406, lng: -114.0201,
    windows: ['evening'],
  },
];

function initFirebase() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT env var not set');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(json)) });
  return getFirestore();
}

/**
 * Migration that runs safely with every pulse check. Only known seeder-owned
 * demo documents are touched; a real resident report that was ever mislabelled
 * as demo remains protected.
 */
export async function maintainExamples(db: Firestore): Promise<{ removed: number; normalized: number }> {
  const snapshot = await db.collection('incidents').where('data_source', '==', 'demo').get();
  const seedAuthors = new Set(['seed', 'community', 'demo']);
  const retiredTitles = new Set([
    'Uncomfortable interaction on the pathway',
    'Concerning interaction near a public parking area',
    'Construction detour is easy to miss',
    'Deep pothole in the curb lane',
    'Pathway light is out along a dark stretch',
    'Black ice on the pathway',
    'Fast hail cell moving through the area',
    'Standing water collecting near an underpass',
  ]);
  const deletable = snapshot.docs.filter((doc) =>
    seedAuthors.has(String(doc.get('authorUid') ?? ''))
      && (doc.get('category') !== 'crime' || retiredTitles.has(String(doc.get('title') ?? ''))));
  for (let offset = 0; offset < deletable.length; offset += 400) {
    const batch = db.batch();
    for (const doc of deletable.slice(offset, offset + 400)) batch.delete(doc.ref);
    await batch.commit();
  }
  const deletableIds = new Set(deletable.map((doc) => doc.id));
  const normalizable = snapshot.docs.filter((doc) =>
    seedAuthors.has(String(doc.get('authorUid') ?? ''))
      && !deletableIds.has(doc.id)
      && (doc.get('anonymous') !== true
        || doc.get('name') !== 'Anonymous'
        || doc.get('source_name') !== 'Community report'));
  for (let offset = 0; offset < normalizable.length; offset += 400) {
    const batch = db.batch();
    for (const doc of normalizable.slice(offset, offset + 400)) {
      batch.set(doc.ref, {
        anonymous: true,
        name: 'Anonymous',
        source_name: 'Community report',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }
  return { removed: deletable.length, normalized: normalizable.length };
}

function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function choose<T>(items: T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = randomInt(0, index, random);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function candidatesFor(
  window: WindowName,
  month: number,
  usedIds: Set<string>,
  usedNeighborhoods: Set<string>,
  recentIds: Set<string>,
): ExampleTemplate[] {
  const plausible = QUEUE.filter((item) =>
    item.windows.includes(window) &&
    (!item.months || item.months.includes(month)) &&
    !usedIds.has(item.id) &&
    !usedNeighborhoods.has(item.neighborhood),
  );
  const fresh = plausible.filter((item) => !recentIds.has(item.id));
  return fresh.length ? fresh : plausible;
}

/** Build once per Calgary day. Randomness is injectable for deterministic tests. */
export function createDailyPlan(
  month: number,
  recentTemplateIds: string[] = [],
  random: () => number = Math.random,
): PlannedPost[] {
  const count = randomInt(1, 3, random);
  const allWindows: WindowName[] = ['morning', 'afternoon', 'evening'];
  const windows = count === 3 ? allWindows : shuffle(allWindows, random).slice(0, count);
  const usedIds = new Set<string>();
  const usedNeighborhoods = new Set<string>();
  const recentIds = new Set(recentTemplateIds);

  return windows.map((window) => {
    const candidates = candidatesFor(window, month, usedIds, usedNeighborhoods, recentIds);
    if (!candidates.length) throw new Error(`No plausible templates for ${window} in month ${month}`);
    const template = choose(candidates, random);
    usedIds.add(template.id);
    usedNeighborhoods.add(template.neighborhood);
    const { start, end } = POSTING_WINDOWS[window];
    const dueMinute = randomInt(start, end, random);
    return {
      id: `${window}-${dueMinute}-${template.id}`,
      templateId: template.id,
      dueMinute,
      window,
    };
  }).sort((a, b) => a.dueMinute - b.dueMinute);
}

/** Select one recently due item; tolerate delayed Actions jobs, not old posts. */
export function selectDuePost(
  currentMinute: number,
  plan: PlannedPost[],
  published: string[],
): PlannedPost | null {
  const sent = new Set(published);
  return plan.find((item) =>
    item.dueMinute <= currentMinute
      && currentMinute - item.dueMinute <= 90
      && !sent.has(item.id)) ?? null;
}

export function calgaryClock(now = new Date()): { date: string; month: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALGARY_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    month: Number(value('month')),
    minute: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

async function run() {
  const db = initFirebase();
  const maintenance = await maintainExamples(db);
  if (maintenance.removed > 0) console.log(`[pulse] Removed ${maintenance.removed} non-crime example report(s).`);
  if (maintenance.normalized > 0) console.log(`[pulse] Normalized ${maintenance.normalized} anonymous example report(s).`);
  const now = new Date();
  const clock = calgaryClock(now);
  const stateRef = db.collection('meta').doc('pulse');
  const incidentRef = db.collection('incidents').doc();

  const outcome = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(stateRef);
    const previous = snapshot.exists ? snapshot.data() as Partial<PulseState> : {};
    const samePlan = previous.date === clock.date &&
      previous.planVersion === PLAN_VERSION && Array.isArray(previous.plan);
    const recent = Array.isArray(previous.recentTemplateIds) ? previous.recentTemplateIds : [];
    const plan = samePlan ? previous.plan as PlannedPost[] : createDailyPlan(clock.month, recent);
    const published = samePlan && Array.isArray(previous.published) ? previous.published : [];
    const due = selectDuePost(clock.minute, plan, published);
    const state: PulseState = {
      date: clock.date,
      planVersion: PLAN_VERSION,
      plan,
      published,
      recentTemplateIds: recent,
    };

    if (!due) {
      transaction.set(stateRef, state);
      return { published: false as const, plan };
    }

    const template = QUEUE.find((item) => item.id === due.templateId);
    if (!template) throw new Error(`Unknown template: ${due.templateId}`);
    const minutesSinceDue = Math.max(2, clock.minute - due.dueMinute);
    const timestamp = now.getTime() - minutesSinceDue * 60 * 1000;
    const recentTemplateIds = [...recent, template.id].slice(-10);

    transaction.set(incidentRef, {
      title: template.title,
      description: template.description,
      category: template.category,
      neighborhood: template.neighborhood,
      lat: template.lat,
      lng: template.lng,
      timestamp,
      email: 'examples@calgarywatch.ca',
      name: 'Anonymous',
      source_name: 'Community report',
      anonymous: true,
      verified_status: 'unverified',
      visibility: 'public',
      report_count: 1,
      authorUid: 'demo',
      data_source: 'demo',
      location_precision: 'neighborhood',
      expires_at: now.getTime() + 14 * 24 * 60 * 60 * 1000,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.set(stateRef, {
      ...state,
      published: [...published, due.id],
      recentTemplateIds,
      lastPublishedAt: FieldValue.serverTimestamp(),
    });
    return { published: true as const, template, due, plan };
  });

  if (!outcome.published) {
    const next = outcome.plan.find((item) => item.dueMinute > clock.minute);
    console.log(`[pulse] Nothing due at minute ${clock.minute}.${next ? ` Next target: ${next.dueMinute}.` : ''}`);
    return;
  }
  console.log(`[pulse] Published example "${outcome.template.title}" in ${outcome.template.neighborhood}.`);
}

const executedDirectly = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  run().catch((error) => {
    console.error('[pulse] Error:', error);
    process.exit(1);
  });
}
