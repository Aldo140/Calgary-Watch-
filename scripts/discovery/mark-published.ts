import { inventoryDatabase } from './firebase';

const checkedAt = Date.now();
await inventoryDatabase().collection('ingestion_health').doc('discovery_publication').set({
  sourceId: 'discovery_publication', name: 'Public discovery catalogue', status: 'ok',
  checkedAt, lastSuccessAt: checkedAt, runId: process.env.GITHUB_RUN_ID ?? "local",
}, { merge: true });
