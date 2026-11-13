import { getFirestore } from 'firebase-admin/firestore';
import { inventoryDatabase } from '../discovery/firebase';
import { feedProblems, type FeedHealth } from './freshness';

const inventory = inventoryDatabase();
const live = getFirestore();
const [liveFeeds, discoveryFeeds] = await Promise.all([
  live.collection('ingestion_health').get(),
  live === inventory ? Promise.resolve(null) : inventory.collection('ingestion_health').get(),
]);
const feeds = [...liveFeeds.docs, ...(discoveryFeeds?.docs ?? [])];
const problems = feedProblems(new Map(feeds.map(doc => [doc.id, doc.data() as FeedHealth])), Date.now());
for (const problem of problems) console.error(problem);
if (problems.length) process.exitCode = 1;
