/**
 * Reports, and optionally trims, the Firebase Hosting versions that fill
 * Hosting storage (10 GB free).
 *
 *   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/deploy/hosting-versions.mjs [--keep 10] [--apply]
 *
 * Every deploy creates a version, and Hosting keeps every version's files until
 * the version is deleted, so storage grows with each deploy unless the site has
 * a version limit ("Release storage settings" in the console, `maxVersions` in
 * the API). Without --apply this only reads: it prints the site's limit, how
 * many versions exist and how much they hold.
 *
 * With --apply it:
 *  1. sets the site's version limit to --keep, so Hosting removes older versions
 *     on its own from now on, and
 *  2. deletes finalized versions beyond the newest --keep straight away.
 *
 * It never deletes the version the live channel or any preview channel is
 * serving, and never one of the newest --keep, so the live site and recent
 * rollbacks stay intact.
 */

import { cert } from 'firebase-admin/app';

const API = 'https://firebasehosting.googleapis.com/v1beta1';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const keepArg = args.indexOf('--keep');
const KEEP = keepArg > -1 ? Number(args[keepArg + 1]) : 10;
if (!Number.isInteger(KEEP) || KEEP < 5) throw new Error('--keep must be a whole number of at least 5');

const json = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
const account = JSON.parse(json);
const credential = cert(account);
const projectId = process.env.VITE_FIREBASE_PROJECT_ID || account.project_id;

let token = null;
async function call(path, init = {}) {
  if (!token) token = (await credential.getAccessToken()).access_token;
  const res = await fetch(path.startsWith('http') ? path : `${API}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function listAll(path, key) {
  const out = [];
  let pageToken = '';
  do {
    const sep = path.includes('?') ? '&' : '?';
    const page = await call(`${path}${sep}pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    out.push(...(page[key] || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return out;
}

const gb = (bytes) => `${(Number(bytes || 0) / 1e9).toFixed(2)} GB`;
const mb = (bytes) => `${(Number(bytes || 0) / 1e6).toFixed(1)} MB`;

async function trimSite(site) {
  const siteId = site.name.split('/').pop();
  const sitePath = `sites/${siteId}`;
  const config = await call(`${sitePath}/config`);
  const channels = await listAll(`${sitePath}/channels`, 'channels');
  const versions = await listAll(`${sitePath}/versions`, 'versions');

  // Versions a channel serves right now must never be touched.
  const serving = new Set();
  for (const ch of channels) {
    const v = ch.release?.version?.name;
    if (v) serving.add(v);
  }

  const kept = versions.filter((v) => v.status !== 'DELETED' && v.status !== 'EXPIRED' && v.status !== 'ABANDONED');
  kept.sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
  const total = kept.reduce((sum, v) => sum + Number(v.versionBytes || 0), 0);

  console.log(`\n## Site ${siteId}`);
  console.log(`Version limit (maxVersions): ${config.maxVersions ?? 'not set (keeps every version)'}`);
  console.log(`Channels: ${channels.map((c) => `${c.name.split('/').pop()} (keeps ${c.retainedReleaseCount ?? '?'} releases${c.expireTime ? `, expires ${c.expireTime}` : ''})`).join(', ') || 'none'}`);
  console.log(`Stored versions: ${kept.length}, ${gb(total)} by versionBytes`);
  const byStatus = {};
  for (const v of versions) byStatus[v.status] = (byStatus[v.status] || 0) + 1;
  console.log(`All versions by status: ${JSON.stringify(byStatus)}`);
  console.log('Newest 15:');
  for (const v of kept.slice(0, 15)) {
    console.log(`  ${v.createTime}  ${v.status.padEnd(9)} ${String(v.fileCount ?? '?').padStart(6)} files  ${mb(v.versionBytes).padStart(10)}${serving.has(v.name) ? '  ← serving' : ''}`);
  }
  if (kept.length > 15) {
    const oldest = kept[kept.length - 1];
    console.log(`  … oldest kept: ${oldest.createTime} (${mb(oldest.versionBytes)})`);
  }

  const extra = kept.slice(KEEP).filter((v) => v.status === 'FINALIZED' && !serving.has(v.name));
  const extraBytes = extra.reduce((sum, v) => sum + Number(v.versionBytes || 0), 0);
  console.log(`Beyond the newest ${KEEP} (and not serving): ${extra.length} versions, ${gb(extraBytes)}`);

  if (!APPLY) {
    console.log('Dry run: nothing changed. Re-run with --apply to set the limit and delete those versions.');
    return;
  }

  if (config.maxVersions !== String(KEEP) && config.maxVersions !== KEEP) {
    await call(`${sitePath}/config?updateMask=maxVersions`, { method: 'PATCH', body: JSON.stringify({ maxVersions: KEEP }) });
    console.log(`Set the version limit to ${KEEP}.`);
  }

  let deleted = 0;
  let failed = 0;
  for (const v of extra) {
    if (serving.has(v.name)) continue; // belt and braces
    try {
      await call(v.name, { method: 'DELETE' });
      deleted += 1;
    } catch (err) {
      failed += 1;
      console.warn(`Could not delete ${v.name}: ${err.message}`);
    }
  }
  console.log(`Deleted ${deleted} old versions (${failed} failed).`);
}

const sites = await listAll(`projects/${projectId}/sites`, 'sites');
console.log(`Project ${projectId}: ${sites.length} Hosting site(s). Keep = ${KEEP}. ${APPLY ? 'APPLY' : 'Dry run'}.`);
for (const site of sites) await trimSite(site);
