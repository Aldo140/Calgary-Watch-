/**
 * Calgary Watch — randomized example community pulse.
 *
 * These records are illustrative, never fabricated community submissions.
 * `data_source: 'demo'` gives them an Example badge and excludes them from
 * safety scores, counts, and neighbourhood intelligence.
 */

import { pathToFileURL } from 'node:url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

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
  category: 'crime' | 'traffic' | 'infrastructure' | 'weather';
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

const PLAN_VERSION = 2;
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
 * - wording, posting window, and season must agree.
 */
export const QUEUE: ExampleTemplate[] = [
  {
    id: 'beltline-window-break',
    title: 'Car window found smashed this morning',
    description: 'Parked on the street overnight and found the passenger window broken before work. Nothing valuable was left inside, but it is a good reminder to keep even small bags and cables out of view.',
    category: 'crime', neighborhood: 'Beltline', lat: 51.0381, lng: -114.0680,
    windows: ['morning'],
  },
  {
    id: 'hillhurst-car-rummaged',
    title: 'Vehicle was rummaged through overnight',
    description: 'The doors may have been left unlocked and the glove box was open this morning. Only loose change appears to be missing. Double-check your doors before turning in tonight.',
    category: 'crime', neighborhood: 'Hillhurst', lat: 51.0563, lng: -114.0903,
    windows: ['morning'],
  },
  {
    id: 'bowness-vehicle-missing',
    title: 'Vehicle missing from an overnight parking spot',
    description: 'The vehicle was left in a public parking area last night and was not there this morning. The owner is checking towing records and filing a report. Keep keys and registration secure.',
    category: 'crime', neighborhood: 'Bowness', lat: 51.0975, lng: -114.1807,
    windows: ['morning'],
  },
  {
    id: 'brentwood-plate-missing',
    title: 'Licence plate taken from parked vehicle',
    description: 'Noticed the rear plate missing during a walk-around before leaving today. The screws were gone too. Worth taking a quick look at your vehicle before driving.',
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
    title: 'Someone checking parked-car door handles',
    description: 'A person was seen trying several vehicle handles along a public parking row, then moved on when other people arrived. No confrontation—lock up and avoid leaving belongings visible.',
    category: 'crime', neighborhood: 'Mission', lat: 51.0347, lng: -114.0670,
    windows: ['evening'],
  },
  {
    id: 'kensington-unwanted-interaction',
    title: 'Uncomfortable interaction on the pathway',
    description: 'Someone repeatedly asked for personal information and continued walking alongside after being told no. They left when the pathway became busier. No threats were made; consider walking with others after dark.',
    category: 'crime', neighborhood: 'Kensington', lat: 51.0603, lng: -114.0903,
    windows: ['evening'],
  },
  {
    id: 'bridgeland-parking-interaction',
    title: 'Concerning interaction near a public parking area',
    description: 'Someone stood very close while asking persistent questions about where a driver lived. The driver returned to a busier area and the person left. Create distance and head toward other people.',
    category: 'crime', neighborhood: 'Bridgeland', lat: 51.0602, lng: -114.0412,
    windows: ['afternoon', 'evening'],
  },
  {
    id: 'eau-claire-bike',
    title: 'Bike missing from a public rack',
    description: 'A commuter bike was locked to a public rack for about an hour and was gone on return. The cable lock had been cut. A U-lock through the frame is the safer option in busy areas.',
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
    id: 'inglewood-poor-detour',
    title: 'Construction detour is easy to miss',
    description: 'One follow-up sign is turned away from traffic, and several drivers have had to double back. Slow down through the temporary route and leave room for sudden turns.',
    category: 'traffic', neighborhood: 'Inglewood', lat: 51.0406, lng: -114.0201,
    windows: ['morning', 'afternoon'],
  },
  {
    id: 'crescent-heights-pothole',
    title: 'Deep pothole in the curb lane',
    description: 'The hole is difficult to see until the last moment and drivers are moving around it quickly. Keep extra space and avoid a sudden lane change.',
    category: 'infrastructure', neighborhood: 'Crescent Heights', lat: 51.0694, lng: -114.0625,
    windows: ['morning', 'afternoon'],
  },
  {
    id: 'sunnyside-light-out',
    title: 'Pathway light is out along a dark stretch',
    description: 'Several lights are off along the same section, making the path hard to see after sunset. Use the better-lit route nearby until it is repaired.',
    category: 'infrastructure', neighborhood: 'Sunnyside', lat: 51.0563, lng: -114.0903,
    windows: ['evening'],
  },
  {
    id: 'ramsay-black-ice',
    title: 'Black ice on the pathway',
    description: 'A shaded section is much slicker than the surrounding pavement this morning. Take short steps or use the cleared street-side route until it is sanded.',
    category: 'weather', neighborhood: 'Ramsay', lat: 51.0284, lng: -114.0353,
    windows: ['morning'], months: [1, 2, 3, 11, 12],
  },
  {
    id: 'mckenzie-hail',
    title: 'Fast hail cell moving through the area',
    description: 'Pea-sized hail came down for several minutes and the road surface is briefly covered. Visibility is improving, but leave extra stopping room until it clears.',
    category: 'weather', neighborhood: 'McKenzie Towne', lat: 50.9083, lng: -113.9534,
    windows: ['afternoon', 'evening'], months: [5, 6, 7, 8, 9],
  },
  {
    id: 'inglewood-standing-water',
    title: 'Standing water collecting near an underpass',
    description: 'The curb lane has pooled after the rain and smaller vehicles are turning around instead of crossing. Use another route and never enter water if the depth is unclear.',
    category: 'infrastructure', neighborhood: 'Inglewood', lat: 51.0406, lng: -114.0201,
    windows: ['afternoon', 'evening'], months: [4, 5, 6, 7, 8, 9, 10],
  },
];

function initFirebase() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT env var not set');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(json)) });
  return getFirestore();
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
  const count = randomInt(2, 3, random);
  const allWindows: WindowName[] = ['morning', 'afternoon', 'evening'];
  const windows = count === 3 ? allWindows : shuffle(allWindows, random).slice(0, 2);
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

/** Select one due item so delayed jobs cannot flood the feed. */
export function selectDuePost(
  currentMinute: number,
  plan: PlannedPost[],
  published: string[],
): PlannedPost | null {
  const sent = new Set(published);
  return plan.find((item) => item.dueMinute <= currentMinute && !sent.has(item.id)) ?? null;
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
      name: 'Calgary Watch',
      source_name: 'Calgary Watch example',
      anonymous: false,
      verified_status: 'unverified',
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
