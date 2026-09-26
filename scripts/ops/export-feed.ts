// Build step: the latest @calgarydaily posts, for the "On Instagram" strip on
// the homepage (src/components/home/CalgaryDailyStrip.tsx). Reads published
// posts from the ops queue with the service account, so no Firestore rule has
// to open the queue to browsers. Without credentials it keeps the file as-is.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { OpsPost } from '../../src/types/ops';
import { brandKit } from './lib/brand';
import { COLLECTIONS, cdnUrl, hasFirebase, opsDb } from './lib/firebase';

const OUT = 'src/generated/calgarydaily-feed.json';
const log = (m: string) => console.log(`[ops:feed] ${m}`);

if (!hasFirebase()) {
  log('No Firebase credentials; keeping the committed feed.');
} else {
  try {
    const kit = brandKit('calgarydaily');
    const docs = (await opsDb().collection(COLLECTIONS.posts).where('status', '==', 'published').get()).docs
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
