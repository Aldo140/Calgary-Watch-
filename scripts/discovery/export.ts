import { mkdir, rename, writeFile } from 'node:fs/promises';
import { inventoryDatabase } from './firebase';
import domain from '../../functions/discovery-domain.cjs';
const db = inventoryDatabase();
// One transaction provides a consistent snapshot even while an editor saves dates.
const snapshot = await db.runTransaction(async tx => {
  const [events, markets, occurrences] = await Promise.all(['events','markets','market_occurrences'].map(c => tx.get(db.collection(c))));
  return domain.publishSnapshot([...events.docs,...markets.docs].map(d=>d.data()),occurrences.docs.map(d=>d.data()));
});
// publishSnapshot uses an explicit public-field allowlist.
await mkdir('src/generated',{ recursive:true });
await writeFile('src/generated/discovery-index.json.tmp',JSON.stringify(snapshot,null,2)+'\n');
await rename('src/generated/discovery-index.json.tmp','src/generated/discovery-index.json');
console.log(`Exported ${snapshot.entities.length} verified entities and ${snapshot.occurrences.length} occurrences.`);
