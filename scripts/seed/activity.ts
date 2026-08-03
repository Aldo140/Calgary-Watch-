/**
 * Calgary Watch — Example Report Publisher
 *
 * Publishes a small, rotating set of EXAMPLE reports so a first-time visitor
 * can see what a report looks like and how the map behaves.
 *
 * These are written with data_source: 'demo'. Every surface that renders an
 * incident badges them as examples, and every count, risk level and safety
 * score skips them. They are illustrative, not evidence.
 *
 * Rules for anything added to the queue below:
 *   - Everyday, low-stakes situations only. No assaults, no drug activity, no
 *     descriptions of identifiable individuals, no claims about a specific
 *     named business or transit stop.
 *   - Coordinates land on public thoroughfares, jittered, never a private home.
 *   - Nothing that would change how a resident judges a real block's safety.
 */

import { pathToFileURL } from 'node:url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function initFirebase() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT env var not set');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(json)) });
  return getFirestore();
}

function calgaryHour(): number {
  const d = new Date();
  return ((d.getUTCHours() - 6) + 24) % 24;
}

function todayMDT(): string {
  const d = new Date();
  const mdt = new Date(d.getTime() - 6 * 3600 * 1000);
  return mdt.toISOString().slice(0, 10);
}

const SLOTS = [7, 13, 20];

function j(): number { return (Math.random() - 0.5) * 0.004; }

function slotTs(slotHour: number): number {
  const d = new Date();
  const mdt = new Date(d.getTime() - 6 * 3600 * 1000);
  mdt.setUTCHours(slotHour + 6, Math.floor(Math.random() * 50) + 2, Math.floor(Math.random() * 59), 0);
  return Math.min(mdt.getTime(), Date.now() - 3 * 60 * 1000);
}

const QUEUE = [
  // Voice varies on purpose: some hurried and lowercase, some careful and
  // punctuated. Real feeds read that way, and the mix shows newcomers that a
  // rough two-line report is just as welcome as a tidy one.
  {
    title: 'pothole opening up on 14 st nw',
    description: `southbound lane just past the lights, deep enough that the car ahead of me swerved into the next lane. worth avoiding until the city patches it`,
    category: 'infrastructure', neighborhood: 'Briar Hill',
    lat: 51.0682 + j(), lng: -114.0955 + j(),
  },
  {
    title: 'Bike stolen from the rack outside the library',
    description: `Locked with a cable lock, gone within about an hour. Blue commuter with a rear basket. Posting mostly so people know the racks here get picked over — bring a U-lock.`,
    category: 'crime', neighborhood: 'Kensington',
    lat: 51.0601 + j(), lng: -114.0906 + j(),
  },
  {
    title: 'water main work, whole block closed off',
    description: `crews showed up early and 33 ave is down to one lane between the crescents. flaggers are on site, looks like theyll be a couple days`,
    category: 'infrastructure', neighborhood: 'Marda Loop',
    lat: 51.0245 + j(), lng: -114.0958 + j(),
  },
  {
    title: 'Package taken off the porch this afternoon',
    description: `Doorbell camera shows it sitting there at 12:40 and gone by 1:15. Nothing dramatic, just a heads up that it is happening on this street — maybe get things held at a locker.`,
    category: 'crime', neighborhood: 'Evanston',
    lat: 51.1899 + j(), lng: -114.0789 + j(),
  },
  {
    title: 'black ice on the pathway by the river',
    description: `pathway is a sheet of ice this morning near the pedestrian bridge. saw two people go down. take the street side until it gets sanded`,
    category: 'weather', neighborhood: 'Sunnyside',
    lat: 51.0553 + j(), lng: -114.0808 + j(),
  },
  {
    title: 'Fender bender at the Deerfoot on-ramp',
    description: `Two cars, everyone out and walking around so it looks minor. Right lane is blocked while they wait for a tow. Give yourself an extra ten minutes.`,
    category: 'traffic', neighborhood: 'Coventry Hills',
    lat: 51.1097 + j(), lng: -114.0169 + j(),
  },
  {
    title: 'street light out for over a week now',
    description: `whole stretch is dark between the park and the corner store. reported it to 311 twice already. adding it here in case someone else wants to log it too`,
    category: 'infrastructure', neighborhood: 'Forest Lawn',
    lat: 51.0399 + j(), lng: -113.9638 + j(),
  },
  {
    title: 'Car window smashed overnight on the street',
    description: `Nothing was taken as far as I can tell — I think they saw the empty cupholder and moved on. Still a $400 window. Do not leave anything visible, even a charger cable.`,
    category: 'crime', neighborhood: 'Beltline',
    lat: 51.0375 + j(), lng: -114.0741 + j(),
  },
  {
    title: 'hail came through fast, watch your car',
    description: `maybe ten minutes of pea sized hail then done. covered the lawns. if you park on the street you might want to check the roof`,
    category: 'weather', neighborhood: 'McKenzie Towne',
    lat: 50.9085 + j(), lng: -113.9537 + j(),
  },
  {
    title: 'Construction detour is not signed well',
    description: `The detour dumps you onto a residential crescent with no follow up sign, so everyone is doing three point turns in front of the houses. Someone is going to get clipped.`,
    category: 'traffic', neighborhood: 'Bridgeland',
    lat: 51.0598 + j(), lng: -114.0407 + j(),
  },
  {
    title: 'graffiti on the back of the strip mall',
    description: `went up sometime overnight along the alley wall. not offensive, just a lot of it. posting so the property owner sees it and gets it logged`,
    category: 'crime', neighborhood: 'Ogden',
    lat: 50.9908 + j(), lng: -114.0009 + j(),
  },
  {
    title: 'Snow windrow is blocking the corner sightline',
    description: `The plow left a big ridge right at the intersection and you cannot see oncoming traffic until you are already into it. Rolling through slowly is the only way across right now.`,
    category: 'infrastructure', neighborhood: 'Saddleridge',
    lat: 51.1258 + j(), lng: -113.9413 + j(),
  },
  {
    title: 'catalytic converter taken off a parked car',
    description: `neighbour came out to that awful noise this morning. theyre going for the higher clearance vehicles on this street. a cage or even an etch kit is worth it`,
    category: 'crime', neighborhood: 'Victoria Park',
    lat: 51.0381 + j(), lng: -114.0476 + j(),
  },
  {
    title: 'Flooding at the underpass after the rain',
    description: `About a foot of standing water in the right lane. A small car ahead of me turned around rather than chance it. Should drain out once the storm passes, but avoid it for now.`,
    category: 'infrastructure', neighborhood: 'Inglewood',
    lat: 51.0404 + j(), lng: -114.0199 + j(),
  },
];

/**
 * Choose which slot to publish, given the current Calgary hour and the slots
 * already published today.
 *
 * The caller used to pass a slot index derived from an exact UTC hour match in
 * the workflow. GitHub routinely delays scheduled runs by tens of minutes, so
 * the hour never matched, every run fell through to the evening slot, and the
 * evening slot then failed its own "too early" check — the job skipped silently
 * and exited 0 for sixteen days.
 *
 * Deriving it here instead is delay-proof: publish the most recent slot whose
 * time has arrived and that has not gone out yet. A late run still publishes,
 * and a run that misses a slot entirely catches up on the next one.
 *
 * @returns the slot index to publish, or null when there is nothing due.
 */
export function selectSlot(hour: number, publishedToday: number[]): number | null {
  const due = SLOTS
    .map((startHour, index) => ({ startHour, index }))
    .filter(({ startHour, index }) => hour >= startHour && !publishedToday.includes(index));
  return due.length ? due[due.length - 1].index : null;
}

async function run() {
  const db = initFirebase();

  const stateRef = db.collection('meta').doc('pulse');
  const today = todayMDT();
  const hour = calgaryHour();

  const snap = await stateRef.get();
  const state = snap.exists ? snap.data()! : { date: '', slots: [], idx: 0 };
  const slots: number[] = state.date === today ? (state.slots as number[] ?? []) : [];

  const slot = selectSlot(hour, slots);
  if (slot === null) {
    console.log(`[pulse] Nothing due at ${hour}h MDT (published today: [${slots.join(', ')}]) — skipping.`);
    return;
  }

  const idx = typeof state.idx === 'number' ? state.idx % QUEUE.length : 0;
  const template = QUEUE[idx];
  const ts = slotTs(SLOTS[slot]);

  await db.collection('incidents').add({
    title: template.title,
    description: template.description,
    category: template.category,
    neighborhood: template.neighborhood,
    lat: template.lat,
    lng: template.lng,
    timestamp: ts,
    email: 'examples@calgarywatch.ca',
    name: 'Calgary Watch',
    source_name: 'Calgary Watch example',
    anonymous: false,
    verified_status: 'unverified',
    report_count: 1,
    authorUid: 'demo',
    // Drives the Example badge everywhere an incident renders, and the
    // exclusion from pulse counts, risk levels and area intelligence.
    data_source: 'demo',
    // Examples roll off on their own if the publisher ever stops running.
    expires_at: Date.now() + 14 * 24 * 60 * 60 * 1000,
  });

  await stateRef.set({
    date: today,
    slots: [...slots, slot],
    idx: (idx + 1) % QUEUE.length,
  });

  console.log(`[pulse] Published example ${idx} (slot ${slot}, ${hour}h MDT): "${template.title}" — ${template.neighborhood}`);
}

// Only publish when executed directly. Importing this module — which the slot
// scheduling tests do — must never hit Firestore or require credentials.
const executedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  run().catch((err) => {
    console.error('[pulse] Error:', err);
    process.exit(1);
  });
}