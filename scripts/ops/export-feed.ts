// Build step: the latest @calgarydaily posts, for the "On Instagram" strip on
// the homepage (src/components/home/CalgaryDailyStrip.tsx). Reads published
// posts from the ops queue with the service account, so no Firestore rule has
// to open the queue to browsers. Without credentials it keeps the file as-is.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { OpsPost } from '../../src/types/ops';
import { brandKit } from './lib/brand';
import { COLLECTIONS, cdnUrl, hasFirebase, opsDb } from './lib/firebase';

const OUT = 'src/generated/calgarydaily-feed.json';
// The agents now run from ArctosLaunchpad and publish the feed to its ops-media branch.
const ARCTOS_FEED = 'https://raw.githubusercontent.com/Aldo140/ArctosLaunchpad/ops-media/feed/calgarydaily.json';
const log = (m: string) => console.log(`[ops:feed] ${m}`);

async function fromArctos(): Promise<boolean> {
  try {
    const res = await fetch(ARCTOS_FEED, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return false;
    const feed = (await res.json()) as { posts?: unknown[] };
    if (!Array.isArray(feed.posts)) return false;
    await mkdir('src/generated', { recursive: true });
    await writeFile(`${OUT}.tmp`, JSON.stringify(feed, null, 2) + '\n');
    await rename(`${OUT}.tmp`, OUT);
    log(`Wrote ${feed.posts.length} posts from the Arctos agents.`);
    return true;
  } catch {
    return false;
  }
}

if (await fromArctos()) {
  // Done: the queue no longer lives in this project's database.
} else if (!hasFirebase()) {
  log('No Firebase credentials; keeping the committed feed.');
} else {
  try {
    const kit = brandKit('calgarydaily');
    // Only this brand's posts (two equality filters need no composite index),
    // and never hold the deploy hostage to an exhausted quota.
    const query = opsDb().collection(COLLECTIONS.posts).where('status', '==', 'published').where('brand', '==', 'calgarydaily').get();
    const snapshot = await Promise.race([
      query,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out after 60s (quota exhausted?)')), 60_000).unref()),
    ]);
    const docs = snapshot.docs
      .map(d => d.data() as OpsPost)
      .filter(p => p.brand === 'calgarydaily' && p.permalink && p.imageUrl && !p.sponsored)
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .slice(0, 8);
    const feed = {
      handle: kit.handle,
      updatedAt: new Date().toISOString(),
      posts: docs.map(p => ({
        permalink: p.permalink!,
        image: cdnUrl(p.imageUrl!),
        headline: p.imageText.headline,
        eyebrow: p.imageText.eyebrow,
        alt: p.altText,
        publishedAt: new Date(p.publishedAt!).toISOString(),
        format: p.videoUrl ? 'reel' : (p.imageUrls?.length ?? 0) > 1 ? 'carousel' : 'post',
      })),
    };
    await mkdir('src/generated', { recursive: true });
    await writeFile(`${OUT}.tmp`, JSON.stringify(feed, null, 2) + '\n');
    await rename(`${OUT}.tmp`, OUT);
    log(`Wrote ${feed.posts.length} posts.`);
  } catch (e) {
    // The site must still ship if the queue can't be read.
    log(`Feed not refreshed: ${e instanceof Error ? e.message : e}`);
    await readFile(OUT).catch(async () => writeFile(OUT, JSON.stringify({ handle: 'calgarydaily', updatedAt: null, posts: [] }, null, 2) + '\n'));
  }
}
