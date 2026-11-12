/**
 * Build step: the live CalgaryWatch Picks (src/generated/cw-picks.json), from
 * the admin vetting desk (pick_vetting, at most a few dozen reads). Only the
 * company, the check dates, the why and the lapse date are written: notes stay
 * in Firestore, since this repository is public.
 *
 *   npx tsx scripts/picks/export-picks.ts                    # write the file (needs FIREBASE_SERVICE_ACCOUNT, or gcloud ADC)
 *   npx tsx scripts/picks/export-picks.ts --pending          # is a change waiting? (sets publish= for Actions)
 *   npx tsx scripts/picks/export-picks.ts --mark-published   # after Hosting deploys
 *
 * Never fails the deploy: when Firestore can't be read, the copy the live site
 * published last stays, else the committed one.
 */
import { appendFileSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { buildPicksFile, PICK_VETTING, readVetting, type Vetting } from '../../src/lib/pickVetting';
import { readPublishedPicks } from '../../src/content/cwPicks';

const OUT = 'src/generated/cw-picks.json';
const PUBLISHED = 'https://calgarywatch.ca/cw-picks.json';
const log = (m: string) => console.log(`[picks:export] ${m}`);

async function write(file: unknown) {
  await writeFile(`${OUT}.tmp`, `${JSON.stringify(file, null, 2)}\n`);
  await rename(`${OUT}.tmp`, OUT);
}

async function keepPrevious(reason: string) {
  log(`${reason}; keeping the last published Picks`);
  try {
    const res = await fetch(PUBLISHED, { signal: AbortSignal.timeout(15_000) });
    const file = res.ok ? await res.json() as { generatedAt?: string } : null;
    if (file) { const picks = readPublishedPicks(file); await write({ generatedAt: file.generatedAt ?? null, picks }); log(`kept ${Object.keys(picks).length} from ${PUBLISHED}`); return; }
  } catch { /* offline: the committed copy stays */ }
  log(`kept the committed ${OUT}`);
}

async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.CI) return keepPrevious('no Firestore credentials');
  const { inventoryDatabase } = await import('../discovery/firebase');
  const db = inventoryDatabase();
  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  try {
    docs = (await db.collection(PICK_VETTING).limit(100).get()).docs;
  } catch (err) {
    return keepPrevious(`pick_vetting unreadable (${err instanceof Error ? err.message.split('\n')[0] : String(err)})`);
  }
  const rows = docs.map(d => readVetting(d.id, d.data())).filter((v): v is Vetting => !!v);
  const file = buildPicksFile(rows);
  await write(file);
  const ids = Object.keys(file.picks);
  log(`${rows.length} services on the vetting desk, ${ids.length} live${ids.length ? `: ${ids.join(', ')}` : ''}`);
}

/** After Hosting deploys: the changes that were waiting are on the live site now. */
async function markPublished() {
  const { inventoryDatabase } = await import('../discovery/firebase');
  const built = Date.parse(JSON.parse(await readFile(OUT, 'utf8')).generatedAt ?? '');
  if (!Number.isFinite(built)) { log('this build kept an older Picks file; nothing marked'); return; }
  const snap = await inventoryDatabase().collection(PICK_VETTING).where('publish', '==', true).limit(50).get();
  // A change saved after the export isn't in this build: leave it for the next run.
  const shipped = snap.docs.filter(d => (d.data().updatedAt ?? 0) <= built);
  await Promise.all(shipped.map(d => d.ref.update({ publish: false, publishedAt: built })));
  log(`${shipped.length} Pick change(s) now live on the site, ${snap.size - shipped.length} waiting for the next deploy`);
}

/** Scheduled check (owner-listing-edits.yml): is a Pick change waiting for a deploy? One read. */
async function pending() {
  const { inventoryDatabase } = await import('../discovery/firebase');
  const snap = await inventoryDatabase().collection(PICK_VETTING).where('publish', '==', true).limit(1).get();
  log(snap.empty ? 'no Pick changes waiting' : 'a Pick change is waiting; publishing the site');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${!snap.empty}\n`);
}

await (process.argv.includes('--pending') ? pending() : process.argv.includes('--mark-published') ? markPublished() : main());
