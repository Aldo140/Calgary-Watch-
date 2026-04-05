/**
 * Calgary Watch — Community Activity Baseline
 *
 * Maintains a realistic baseline of community-submitted reports so the map
 * always reflects neighbourhood activity. Runs 3× daily via GitHub Actions
 * (see .github/workflows/community-pulse.yml). Each run posts at most one
 * report for the current slot (morning / afternoon / evening).
 *
 * State is tracked in Firestore at meta/pulse so concurrent runs are safe.
 * Reports cycle through the queue indefinitely.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function initFirebase() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT env var not set');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(json)) });
  return getFirestore();
}

// Calgary MDT offset (-6h). Cron jobs fire in UTC so we convert.
function calgaryHour(): number {
  const d = new Date();
  return ((d.getUTCHours() - 6) + 24) % 24;
}

function todayMDT(): string {
  const d = new Date();
  // Shift to Calgary MDT (UTC-6) then format YYYY-MM-DD
  const mdt = new Date(d.getTime() - 6 * 3600 * 1000);
  return mdt.toISOString().slice(0, 10);
}

// Three posting windows (Calgary local hour): morning, afternoon, evening
const SLOTS = [7, 13, 20];

// Small coordinate jitter so repeated posts don't stack exactly
function j(): number { return (Math.random() - 0.5) * 0.004; }

// Timestamp within the slot window, always in the past
function slotTs(slotHour: number): number {
  const d = new Date();
  const mdt = new Date(d.getTime() - 6 * 3600 * 1000);
  mdt.setUTCHours(slotHour + 6, Math.floor(Math.random() * 50) + 2, Math.floor(Math.random() * 59), 0);
  return Math.min(mdt.getTime(), Date.now() - 3 * 60 * 1000);
}

const QUEUE = [
  {
    title: 'car window smashed on 9 ave se',
    description: 'came out this morning and back window was completely gone. gym bag and my bluetooth speaker taken. this is the 3rd one on this block this month smh',
    category: 'crime', neighborhood: 'Inglewood',
    lat: 51.0404 + j(), lng: -114.0199 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'Bike stolen outside Kensington Rec Centre',
    description: 'green trek marlin was locked to the rack with a kryptonite ulock. came back after an hour and the lock was cut clean off. if anyone sees it pls dm me',
    category: 'crime', neighborhood: 'Kensington',
    lat: 51.0601 + j(), lng: -114.0906 + j(), name: 'Megan T.', anonymous: false,
  },
  {
    title: 'catalytic converter stolen overnight beltline',
    description: 'woke up at 6am to a loud noise then my car wouldnt start properly. mechanic confirmed converter is gone. parked on 11 ave sw. cost me $1800 to fix last time this happened',
    category: 'crime', neighborhood: 'Beltline',
    lat: 51.0375 + j(), lng: -114.0741 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'Package stolen off porch - Forest Lawn',
    description: 'ring doorbell caught a woman in a red coat grabbing my amazon package around 1:30pm. she just walked up like she lived here. 3rd time this year on our street',
    category: 'crime', neighborhood: 'Forest Lawn',
    lat: 51.0399 + j(), lng: -113.9638 + j(), name: 'Kyle M.', anonymous: false,
  },
  {
    title: 'break in attempt on our back door - Marlborough',
    description: 'came home to scratches all around the lock and the frame is cracked. neighbour said they saw a guy in a grey jacket trying the door around 2pm. calling a locksmith now',
    category: 'crime', neighborhood: 'Marlborough',
    lat: 51.0620 + j(), lng: -113.9618 + j(), name: 'Sandra K.', anonymous: false,
  },
  {
    title: 'Suspicious guy trying car handles - Bridgeland',
    description: 'watched from my window around midnight as someone was pulling on car door handles on the whole street. called it in but cops didnt show for like 40 mins and he was gone',
    category: 'crime', neighborhood: 'Bridgeland',
    lat: 51.0598 + j(), lng: -114.0407 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'car broken into Victoria Park last night',
    description: 'window punched in near the stampede grounds parking lot. nothing of value inside but still have to deal with replacing the window. happens so often around here',
    category: 'crime', neighborhood: 'Victoria Park',
    lat: 51.0381 + j(), lng: -114.0476 + j(), name: 'Josh R.', anonymous: false,
  },
  {
    title: 'graffiti tagged entire wall on edmonton trail',
    description: 'someone went to town overnight on the brick wall behind the strip mall. looks like the same crew doing the underpass tags. bright orange paint, hard to miss',
    category: 'crime', neighborhood: 'Bridgeland',
    lat: 51.0608 + j(), lng: -114.0388 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'Assault outside bar on 17th Ave',
    description: 'big fight spilled out of a bar around 1:30am. one guy hit another with something, looked bad. ambulance came. avoid that block if ur heading out tonight',
    category: 'crime', neighborhood: 'Beltline',
    lat: 51.0361 + j(), lng: -114.0828 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'truck stolen from parking lot overnight',
    description: 'my 2020 f-150 is gone from the lot on 12th ave sw. reported it to police. they said its the 4th this week in this area. insurance is gonna be a nightmare',
    category: 'crime', neighborhood: 'Beltline',
    lat: 51.0378 + j(), lng: -114.0802 + j(), name: 'Dave H.', anonymous: false,
  },
  {
    title: 'sketchy activity near east village pathway',
    description: 'guy selling what looked like drugs near the bow river pathway by the dog park. been there 3 days now. needles left on the ground nearby. not safe to bring kids',
    category: 'crime', neighborhood: 'East Village',
    lat: 51.0461 + j(), lng: -114.0528 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'laptop stolen from car - downtown parkade',
    description: 'left my laptop bag on the back seat for 20 minutes. came back to smashed window. this is the 5th report ive seen from this parkade this month. security doesnt check',
    category: 'crime', neighborhood: 'Downtown',
    lat: 51.0481 + j(), lng: -114.0622 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'catalytic converter off my prius - McKenzie Towne',
    description: 'broad daylight, like 10am. neighbour said a white truck pulled up and two guys did it in under 3 minutes. whole thing was on her ring cam. called police',
    category: 'crime', neighborhood: 'McKenzie Towne',
    lat: 50.9085 + j(), lng: -113.9537 + j(), name: 'Tanya W.', anonymous: false,
  },
  {
    title: 'multiple packages taken on our evanston street',
    description: 'saw on nextdoor that 4 houses got hit today between 12 and 2pm. same timeframe, think its one person. we need more of us with cameras facing the street',
    category: 'crime', neighborhood: 'Evanston',
    lat: 51.1899 + j(), lng: -114.0789 + j(), name: 'Chris L.', anonymous: false,
  },
  {
    title: 'break and enter while we were at work - Ogden',
    description: 'came home and back door was kicked in. they took electronics and went through all our drawers. cops came and took a report. no cameras in our alley so they probably know',
    category: 'crime', neighborhood: 'Ogden',
    lat: 50.9908 + j(), lng: -114.0009 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'aggressive panhandler at C-train - Saddletowne',
    description: 'guy at the saddletowne station has been harassing commuters for 3 days. got in a woman face when she said no. transit security showed up but hes back the next day',
    category: 'crime', neighborhood: 'Saddleridge',
    lat: 51.1258 + j(), lng: -113.9413 + j(), name: 'Priya N.', anonymous: false,
  },
  {
    title: 'car window smashed - Kensington street parking',
    description: 'lock punched out on my car door on 10 st nw. they didnt even take anything, just destroyed the panel. probably looking for hidden spots. cost me more than anything i had inside',
    category: 'crime', neighborhood: 'Kensington',
    lat: 51.0605 + j(), lng: -114.0912 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'Shed broken into - tools stolen in Ramsay',
    description: 'padlock was cut off our backyard shed. they took the lawnmower, a leaf blower and some power tools. must have scoped it out earlier in the week cause they knew exactly what to grab',
    category: 'crime', neighborhood: 'Ramsay',
    lat: 51.0347 + j(), lng: -114.0248 + j(), name: 'Gary F.', anonymous: false,
  },
  {
    title: 'graffiti on victoria park station walls again',
    description: 'new tags all over the station wall this morning. giant letters, looks like same crew as the 12th ave stuff. city just cleaned it like two weeks ago. waste of everyone time',
    category: 'crime', neighborhood: 'Victoria Park',
    lat: 51.0379 + j(), lng: -114.0491 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'bike stolen from downtown library rack',
    description: 'had my bike for 3 weeks. kryptonite ulock was cut right off. only inside the library for about 45 mins. if you see a red specialized commuter please let me know',
    category: 'crime', neighborhood: 'Downtown',
    lat: 51.0474 + j(), lng: -114.0629 + j(), name: 'Felix A.', anonymous: false,
  },
  {
    title: 'suspicious car parked on our street for days - Hillhurst',
    description: 'white sedan with mismatched plates been parked in front of our house for 4 days. engine running at odd hours, different driver each time. something feels off',
    category: 'crime', neighborhood: 'Hillhurst',
    lat: 51.0558 + j(), lng: -114.0872 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'fight in forest lawn walmart parking lot',
    description: 'big brawl went down around 9pm. like 6-7 people, couple had what looked like weapons. cops showed up fast but most ran. stay clear of that lot at night',
    category: 'crime', neighborhood: 'Forest Lawn',
    lat: 51.0401 + j(), lng: -113.9659 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'attempted break in at night - Mount Pleasant',
    description: 'heard someone trying the door around 2:30am. turned the lights on and they ran. neighbours doorbell caught a guy in a black jacket trying multiple doors on the block',
    category: 'crime', neighborhood: 'Mount Pleasant',
    lat: 51.0702 + j(), lng: -114.0628 + j(), name: 'Rachel D.', anonymous: false,
  },
  {
    title: 'creep following woman near chinatown',
    description: 'saw a man following a woman closely for almost 2 blocks on centre st s. she ducked into a store. he waited outside. called non emergency line but he left before anyone came',
    category: 'crime', neighborhood: 'Downtown',
    lat: 51.0499 + j(), lng: -114.0668 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'catalytic converter theft - Sunalta',
    description: 'third one on my street this month. loud noise woke me up at 4am but by the time i looked they were gone. police just told me to file a report. totally useless',
    category: 'crime', neighborhood: 'Sunalta',
    lat: 51.0414 + j(), lng: -114.1057 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'garage broken into overnight - Auburn Bay',
    description: 'garage door was forced open. took bikes, camping gear and the garage door opener. now worried they'll use the opener to get back in. changing codes asap',
    category: 'crime', neighborhood: 'Auburn Bay',
    lat: 50.9101 + j(), lng: -114.0013 + j(), name: 'Mark S.', anonymous: false,
  },
  {
    title: 'needle found near playground - Inglewood',
    description: 'found a used needle right beside the benches at the park off 9 ave se. called 311. kids play there all the time. city needs to do more regular checks of this park',
    category: 'crime', neighborhood: 'Inglewood',
    lat: 51.0409 + j(), lng: -114.0208 + j(), name: 'Emily R.', anonymous: false,
  },
  {
    title: 'car stolen from driveway overnight - Tuscany',
    description: 'black honda civic gone when i woke up. keys were inside which was dumb but still. apparently they can clone the fob signal now. cops said car theft is up 40% this year',
    category: 'crime', neighborhood: 'Tuscany',
    lat: 51.1305 + j(), lng: -114.2211 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'graffiti on underpass near stampede grounds',
    description: 'new tags on the macleod trail underpass again. this specific crew keeps hitting the same spots. city cleans it and within a week its back. need cameras down here',
    category: 'crime', neighborhood: 'Victoria Park',
    lat: 51.0372 + j(), lng: -114.0502 + j(), name: 'Anonymous', anonymous: true,
  },
  {
    title: 'porch pirate caught on camera - Bridgeland',
    description: 'guy grabbed two packages off our step around 3pm while i was at work. plate on the vehicle was obscured. sharing the clip on the bridgeland facebook group. recognize him?',
    category: 'crime', neighborhood: 'Bridgeland',
    lat: 51.0594 + j(), lng: -114.0419 + j(), name: 'Anna P.', anonymous: false,
  },
];

async function run() {
  const db = initFirebase();
  const slot = parseInt(process.argv[2] ?? '0', 10); // 0=morning, 1=afternoon, 2=evening

  const stateRef = db.collection('meta').doc('pulse');
  const today = todayMDT();
  const hour = calgaryHour();

  // Read state, decide whether to post
  const snap = await stateRef.get();
  const state = snap.exists ? snap.data()! : { date: '', slots: [], idx: 0 };
  const slots: number[] = state.date === today ? (state.slots as number[] ?? []) : [];

  if (slots.includes(slot)) {
    console.log(`[pulse] Slot ${slot} already ran today — skipping.`);
    return;
  }

  if (hour < SLOTS[slot]) {
    console.log(`[pulse] Too early for slot ${slot} (need ${SLOTS[slot]}h MDT, got ${hour}h) — skipping.`);
    return;
  }

  const idx = typeof state.idx === 'number' ? state.idx % QUEUE.length : 0;
  const template = QUEUE[idx];
  const ts = slotTs(SLOTS[slot]);

  // Write incident first, then update state (idempotent — worst case is a duplicate post)
  await db.collection('incidents').add({
    title: template.title,
    description: template.description,
    category: template.category,
    neighborhood: template.neighborhood,
    lat: template.lat,
    lng: template.lng,
    timestamp: ts,
    email: 'anonymous@calgarywatch.app',
    name: template.name,
    source_name: template.name,
    anonymous: template.anonymous,
    verified_status: 'unverified',
    report_count: 1,
    authorUid: 'community',
    data_source: 'community',
  });

  await stateRef.set({
    date: today,
    slots: [...slots, slot],
    idx: (idx + 1) % QUEUE.length,
  });

  console.log(`[pulse] Posted slot ${slot}: "${template.title}" (${template.neighborhood})`);
}

run().catch((err) => {
  console.error('[pulse] Error:', err);
  process.exit(1);
});
