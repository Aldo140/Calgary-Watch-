/**
 * Calgary Watch — Demo Data Seed Script
 *
 * Writes realistic community reports directly to Firestore.
 * Run once via GitHub Actions (seed-demo-data workflow).
 *
 * Safe to re-run — skips if seed data already exists.
 * Incidents expire in 30 days and are never touched by the ingest pruner
 * (no dedup_key field).
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function initFirebase() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(json)) });
  return getFirestore();
}

const now = Date.now();
const h = (hours: number) => now - hours * 60 * 60 * 1000;
const EXPIRES = now + 30 * 24 * 60 * 60 * 1000; // 30 days

const INCIDENTS = [
  {
    title: 'Rear-end collision on Deerfoot Trail NB',
    description: 'Two vehicles involved near McKnight Blvd interchange. Left shoulder blocked — slow down and merge right early.',
    category: 'traffic',
    neighborhood: 'Coventry Hills',
    lat: 51.1097,
    lng: -114.0169,
    timestamp: h(0.75),
    report_count: 4,
    name: 'James T.',
    anonymous: false,
  },
  {
    title: 'Vehicle break-in on 17 Ave SW',
    description: "Driver side window smashed, bag taken from the back seat. Third break-in on this block this week.",
    category: 'crime',
    neighborhood: 'Beltline',
    lat: 51.0365,
    lng: -114.0819,
    timestamp: h(2.5),
    report_count: 3,
    name: 'Anonymous',
    anonymous: true,
  },
  {
    title: 'Water main break — Crowchild Trail NW',
    description: 'Large water leak at the Crowchild and 16 Ave intersection. Road partially flooded, City crews on site.',
    category: 'infrastructure',
    neighborhood: 'Banff Trail',
    lat: 51.0647,
    lng: -114.1219,
    timestamp: h(4),
    report_count: 7,
    name: 'Sarah M.',
    anonymous: false,
  },
  {
    title: 'Bike stolen outside Eau Claire Market',
    description: 'Orange Trek hybrid stolen from the rack near the food trucks around 1 PM. Lock was cut clean.',
    category: 'crime',
    neighborhood: 'Eau Claire',
    lat: 51.0497,
    lng: -114.0739,
    timestamp: h(5.5),
    report_count: 2,
    name: 'Mike R.',
    anonymous: false,
  },
  {
    title: 'Icy sidewalk near Ramsay Community Centre',
    description: "9 Ave SE between 8 St and 11 St is sheet ice. Someone slipped this morning — City hasn't salted yet.",
    category: 'weather',
    neighborhood: 'Ramsay',
    lat: 51.0347,
    lng: -114.0469,
    timestamp: h(8),
    report_count: 5,
    name: 'Anonymous',
    anonymous: true,
  },
  {
    title: 'Suspicious person near Bridgeland school',
    description: 'Man in a dark hoodie approached multiple kids by the park on 1 Ave NE this afternoon. Police have been notified.',
    category: 'crime',
    neighborhood: 'Bridgeland',
    lat: 51.0579,
    lng: -114.0469,
    timestamp: h(10),
    report_count: 6,
    name: 'David K.',
    anonymous: false,
  },
  {
    title: 'Road closure — Macleod Trail SE utility work',
    description: 'Southbound lanes between Heritage Dr and Canyon Meadows closed until 6 PM. Use Anderson Rd as an alternate.',
    category: 'traffic',
    neighborhood: 'Haysboro',
    lat: 51.0047,
    lng: -114.0619,
    timestamp: h(13),
    report_count: 9,
    name: 'Calgary Resident',
    anonymous: false,
  },
  {
    title: 'Power outage — Sunnyside and Kensington',
    description: "Power out for ~2 blocks around Kensington Rd NW and 10 St NW. ENMAX trucks on scene, no ETA given.",
    category: 'infrastructure',
    neighborhood: 'Sunnyside',
    lat: 51.0579,
    lng: -114.0939,
    timestamp: h(18),
    report_count: 12,
    name: 'Anonymous',
    anonymous: true,
  },
  {
    title: 'Package theft caught on doorbell cam — Varsity',
    description: 'White female, early 30s, took two Amazon packages off the front step around noon. Footage available.',
    category: 'crime',
    neighborhood: 'Varsity',
    lat: 51.0847,
    lng: -114.1519,
    timestamp: h(24),
    report_count: 3,
    name: 'Lisa H.',
    anonymous: false,
  },
  {
    title: 'Catalytic converter theft — Mission',
    description: 'Found my Prius up on bricks this morning. Third theft on this street in two weeks.',
    category: 'crime',
    neighborhood: 'Mission',
    lat: 51.0284,
    lng: -114.0739,
    timestamp: h(30),
    report_count: 4,
    name: 'Anonymous',
    anonymous: true,
  },
  {
    title: 'Downed tree blocking Inglewood alley',
    description: 'Large spruce fell overnight and is blocking the alley off 9 Ave SE near 14 St SE. Garages inaccessible.',
    category: 'infrastructure',
    neighborhood: 'Inglewood',
    lat: 51.0347,
    lng: -114.0219,
    timestamp: h(36),
    report_count: 2,
    name: 'Tom B.',
    anonymous: false,
  },
  {
    title: 'Speeding cars on residential street — Forest Lawn',
    description: 'Vehicles regularly doing 70+ km/h on 44 Ave SE near the elementary school. Requesting speed camera.',
    category: 'traffic',
    neighborhood: 'Forest Lawn',
    lat: 51.0347,
    lng: -113.9969,
    timestamp: h(42),
    report_count: 8,
    name: 'Anonymous',
    anonymous: true,
  },
];

async function run() {
  const db = initFirebase();
  const serverNow = FieldValue.serverTimestamp();

  // Idempotency check — skip if already seeded.
  const check = await db.collection('incidents').where('authorUid', '==', 'seed').limit(1).get();
  if (!check.empty) {
    console.log('[seed] Demo data already present — skipping.');
    return;
  }

  let count = 0;
  for (const inc of INCIDENTS) {
    await db.collection('incidents').add({
      ...inc,
      email: 'seed@calgarywatch.app',
      verified_status: 'unverified',
      deleted: false,
      data_source: 'community',
      expires_at: EXPIRES,
      authorUid: 'seed',
      createdAt: serverNow,
      updatedAt: serverNow,
    });
    count++;
  }

  console.log(`[seed] Done — created ${count} demo incidents.`);
}

run().catch((err) => {
  console.error('[seed] Fatal:', err);
  process.exit(1);
});
