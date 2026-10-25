/**
 * Keeps earlier builds' /assets files live for a week after a deploy.
 *
 *   node scripts/deploy/keep-previous-assets.mjs [--origin https://calgarywatch.ca]
 *
 * Run in the deploy job after `npm run build` and before the Hosting upload.
 *
 * Firebase Hosting replaces the whole site on each deploy, so the hashed page
 * files of the previous build disappear. A tab opened before the deploy then
 * fails the moment it opens another page ("Failed to fetch dynamically imported
 * module"). This copies those files back into dist/ so old tabs keep working:
 *
 *  1. Crawl the live build: index.html, then every assets/… name mentioned in
 *     its scripts (Vite writes lazy page names into the entry as strings).
 *  2. Add everything the live /asset-manifest.json still lists from earlier
 *     builds, until it has been retired for RETAIN_DAYS.
 *  3. Download whatever this build doesn't have, and write the new manifest.
 *
 * Hosting stores files by content hash, so re-uploading an unchanged file is
 * free. Never fails the deploy: a network problem just means fewer old files.
 *
 * Downloading them was not free: every deploy pulled ~200 MB of old files back
 * off calgarywatch.ca, which alone used most of Hosting's 360 MB/day download
 * quota. With ASSET_CACHE_DIR set (the deploy job restores it from the Actions
 * cache), hashed files come from that folder first and only a miss is fetched;
 * afterwards the folder is reset to exactly what this deploy ships, for the next
 * run to save. Hashed names never change content, so a cached copy is always right.
 */

import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = join(ROOT, 'dist');
const argOrigin = process.argv.indexOf('--origin');
const ORIGIN = (argOrigin > -1 ? process.argv[argOrigin + 1] : process.env.LIVE_ORIGIN || 'https://calgarywatch.ca').replace(/\/$/, '');
const RETAIN_DAYS = 7;
const MAX_CARRIED_BYTES = 250 * 1024 * 1024;
const CONCURRENCY = 8;
const CACHE_DIR = process.env.ASSET_CACHE_DIR ? resolve(ROOT, process.env.ASSET_CACHE_DIR) : null;
const counts = { cached: 0, downloaded: 0 };

const EXT = '(?:js|mjs|css|woff2?|ttf|svg|png|webp|jpg|wasm)';

/**
 * assets/… references inside HTML, JS or CSS. Chunks import their siblings as
 * "./Name-hash.js", which (since every chunk lives in assets/) means assets/Name-hash.js.
 */
export function assetRefs(text) {
  const out = new Set();
  for (const m of text.matchAll(new RegExp(`(?:^|[^\\w.-])\\/?(assets\\/[\\w.-]+\\.${EXT})`, 'g'))) out.add(m[1]);
  for (const m of text.matchAll(new RegExp(`["'\`]\\.\\/([\\w.-]+\\.${EXT})["'\`]`, 'g'))) out.add(`assets/${m[1]}`);
  return out;
}

/** Which carried-over files stay, given the live manifest, this build's files and the clock. */
export function planRetention({ liveManifest, liveCrawl, current, now }) {
  const cutoff = now - RETAIN_DAYS * 86_400_000;
  const keep = new Map();
  for (const file of liveCrawl) if (!current.has(file)) keep.set(file, now);
  for (const entry of liveManifest?.files ?? []) {
    if (!entry || typeof entry.file !== 'string' || current.has(entry.file)) continue;
    // A file the live build still used retires now; one already retired keeps its date.
    const retiredAt = typeof entry.retiredAt === 'number' ? entry.retiredAt : now;
    if (retiredAt < cutoff) continue;
    keep.set(entry.file, Math.min(keep.get(entry.file) ?? retiredAt, retiredAt));
  }
  return keep;
}

async function get(path) {
  const res = await fetch(`${ORIGIN}/${path}`, { signal: AbortSignal.timeout(20_000), headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res;
}

/** A hashed assets/… file: from the cache folder when it has it, else from the live site. */
async function asset(file) {
  if (CACHE_DIR) {
    try {
      const body = await readFile(join(CACHE_DIR, file));
      counts.cached++;
      return body;
    } catch {
      // Not cached yet: fetch it below.
    }
  }
  const body = Buffer.from(await (await get(file)).arrayBuffer());
  counts.downloaded++;
  return body;
}

/** Leave the cache folder holding exactly this deploy's assets/ (current + carried). */
async function refreshCache() {
  if (!CACHE_DIR) return;
  await rm(join(CACHE_DIR, 'assets'), { recursive: true, force: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await cp(join(DIST, 'assets'), join(CACHE_DIR, 'assets'), { recursive: true });
}

async function crawlLive() {
  const seen = new Set();
  let queue = [];
  try {
    const html = await (await get('index.html')).text();
    queue = [...assetRefs(html)];
  } catch (error) {
    console.warn(`[keep-assets] Could not read the live index.html (${error.message}); skipping the crawl.`);
    return { seen, bodies: new Map() };
  }
  const bodies = new Map();
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(m?js|css)$/.test(file)) continue;
    try {
      const body = await asset(file);
      bodies.set(file, body);
      for (const ref of assetRefs(body.toString('utf8'))) if (!seen.has(ref)) queue.push(ref);
    } catch {
      // Already gone from the live site; nothing to keep.
    }
  }
  return { seen, bodies };
}

async function run() {
  let current;
  try {
    current = new Set((await readdir(join(DIST, 'assets'))).map((f) => `assets/${f}`));
  } catch {
    console.error('[keep-assets] dist/assets not found. Run the build first.');
    process.exit(1);
  }

  let liveManifest = null;
  try {
    liveManifest = await (await get('asset-manifest.json')).json();
  } catch {
    console.log('[keep-assets] No live asset-manifest.json yet; keeping just the live build.');
  }
  const { seen: liveCrawl, bodies } = await crawlLive();
  const now = Date.now();
  const keep = planRetention({ liveManifest, liveCrawl, current, now });

  let carriedBytes = 0;
  const carried = [];
  const files = [...keep.keys()].sort((a, b) => keep.get(b) - keep.get(a)); // newest retirements first
  let i = 0;
  async function worker() {
    while (i < files.length) {
      const file = files[i++];
      if (carriedBytes > MAX_CARRIED_BYTES) return;
      try {
        const body = bodies.get(file) ?? await asset(file);
        // A missing file answered with the 404 page is not worth keeping.
        if (/\.(m?js|css)$/.test(file) && /^\s*<!doctype html/i.test(body.subarray(0, 64).toString('utf8'))) continue;
        const out = join(DIST, file);
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, body);
        carriedBytes += body.length;
        carried.push(file);
      } catch {
        // Gone or unreachable: drop it from the manifest.
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const manifest = {
    schemaVersion: 1,
    retainDays: RETAIN_DAYS,
    generatedAt: new Date(now).toISOString(),
    files: [
      ...[...current].sort().map((file) => ({ file, retiredAt: null })),
      ...carried.sort().map((file) => ({ file, retiredAt: keep.get(file) })),
    ],
  };
  await writeFile(join(DIST, 'asset-manifest.json'), JSON.stringify(manifest) + '\n');
  const size = (await Promise.all(carried.map((f) => stat(join(DIST, f)).then((s) => s.size)))).reduce((a, b) => a + b, 0);
  console.log(`[keep-assets] This build: ${current.size} files. Kept ${carried.length} earlier files (${(size / 1048576).toFixed(1)} MB) so open tabs keep working.`);
  if (CACHE_DIR) console.log(`[keep-assets] ${counts.cached} files came from the Actions cache, ${counts.downloaded} were downloaded from the live site.`);
  await refreshCache().catch((error) => console.warn(`[keep-assets] Could not update the asset cache (${error.message}); the next deploy downloads instead.`));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.warn('[keep-assets] Skipped:', error?.message ?? error);
  });
}

