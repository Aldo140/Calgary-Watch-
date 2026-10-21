/**
 * Fills in names for members whose record says "Anonymous".
 *
 * Email sign-up made the name optional (and wrote the placeholder before the
 * typed name landed), so most email accounts show as Anonymous in admin. Many
 * of those people typed their name somewhere else: on the Auth profile
 * itself, a listing claim or a market application. Use the first real one.
 *
 *   npx tsx scripts/claims/backfill-member-names.ts            # dry run, counts only
 *   npx tsx scripts/claims/backfill-member-names.ts --commit   # writes
 *
 * Logs carry uid prefixes and the source, never names or emails (CI logs are public).
 */
import { getAuth } from 'firebase-admin/auth';
import { inventoryDatabase } from '../discovery/firebase';
import { realName } from '../../src/lib/auth';

const commit = process.argv.includes('--commit');
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Needs FIREBASE_SERVICE_ACCOUNT; nothing was read or changed.');
  process.exit(1);
}
const db = inventoryDatabase();
const auth = getAuth();

/** First real name each uid typed on a claim or an application, newest first. */
async function typedNames(collection: string, field: string): Promise<Map<string, string>> {
  const snap = await db.collection(collection).get();
  const rows = snap.docs.map(d => d.data()).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  const names = new Map<string, string>();
  for (const row of rows) {
    const name = realName(row[field]);
    if (typeof row.uid === 'string' && name && !names.has(row.uid)) names.set(row.uid, name);
  }
  return names;
}

const [claims, applications, users] = await Promise.all([
  typedNames('listing_claims', 'name'),
  typedNames('vendor_applications', 'contactName'),
  db.collection('users').get(),
]);

const tally = { checked: 0, named: 0, fixed: 0, unknown: 0, bySource: { auth: 0, claim: 0, application: 0 } as Record<string, number> };
for (const doc of users.docs) {
  tally.checked++;
  if (realName(doc.get('displayName'))) { tally.named++; continue; }
  let account: Awaited<ReturnType<typeof auth.getUser>> | null = null;
  try { account = await auth.getUser(doc.id); } catch (e) { if ((e as { code?: string }).code !== 'auth/user-not-found') throw e; }
  const found = realName(account?.displayName) ? { name: realName(account?.displayName), source: 'auth' }
    : claims.get(doc.id) ? { name: claims.get(doc.id)!, source: 'claim' }
    : applications.get(doc.id) ? { name: applications.get(doc.id)!, source: 'application' }
    : null;
  if (!found) { tally.unknown++; continue; }
  tally.fixed++; tally.bySource[found.source]++;
  console.log(`  ${doc.id.slice(0, 6)}… ← ${found.source}${commit ? '' : ' (dry run)'}`);
  if (!commit) continue;
  await doc.ref.update({ displayName: found.name, nameSource: found.source, updatedAt: Date.now() });
  if (account && !realName(account.displayName)) await auth.updateUser(doc.id, { displayName: found.name });
}

console.log(`\n${commit ? 'Updated' : 'Would update'} ${tally.fixed} of ${tally.checked} members (${tally.named} already named, ${tally.unknown} with no name anywhere yet; they get the "What should we call you?" card next visit).`);
console.log('By source:', JSON.stringify(tally.bySource));
