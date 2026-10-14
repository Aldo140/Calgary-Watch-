// A copy of the day's scheduled posts in arctos-hq, so they still go out when
// the Calgary Watch Firestore (free plan) has used up its daily quota, which
// has happened around noon Calgary time. arctos-hq is a separate project with
// its own quota, reached with HQ_ACCESS_TOKEN like the HQ snapshot.
//
// While Firestore works: saveBackup() copies approved posts and the current
// Instagram token after each publish run, and reconcileBackup() marks posts
// the backup published as published in Firestore, so they never go out twice.
// When the quota is gone: publishFromBackup() publishes what is due.

import type { Firestore } from 'firebase-admin/firestore';
import type { BrandId, OpsPost } from '../../../src/types/ops';
import { brandKit } from '../lib/brand';
import { COLLECTIONS } from '../lib/firebase';
import { publishCarousel, publishImage, publishReel } from '../lib/instagram';
import { calgaryDate } from '../lib/time';
import { currentToken } from './igTokens';

type Log = (m: string) => void;
const DOC = 'https://firestore.googleapis.com/v1/projects/arctos-hq/databases/(default)/documents/ops_backup/publish';
const DAY = 86_400_000;
// A slot missed by more than this is left for a person rather than posted late.
const LATE = 4 * 3_600_000;

export interface BackupPost {
  id: string;
  brand: BrandId;
  scheduledFor: number;
  relevantUntil: number | null;
  caption: string;
  altText: string;
  imageUrl: string | null;
  imageUrls: string[];
  videoUrl: string | null;
}
export interface PublishBackup {
  at: number;
  tokens: Partial<Record<BrandId, string>>;
  posts: BackupPost[];
  /** Posts this backup published (or started to), by id. */
  published: Record<string, { at: number; mediaId: string | null; permalink: string | null; brand: BrandId }>;
}

const headers = () => ({ Authorization: `Bearer ${process.env.HQ_ACCESS_TOKEN}`, 'Content-Type': 'application/json' });
export const backupConfigured = () => Boolean(process.env.HQ_ACCESS_TOKEN);

async function read(): Promise<PublishBackup | null> {
  const r = await fetch(DOC, { headers: headers() });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`reading the publish backup: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const body = await r.json() as { fields?: { payload?: { stringValue?: string } } };
  try { return JSON.parse(body.fields?.payload?.stringValue ?? 'null'); } catch { return null; }
}

async function write(b: PublishBackup): Promise<void> {
  const r = await fetch(DOC, { method: 'PATCH', headers: headers(), body: JSON.stringify({ fields: { payload: { stringValue: JSON.stringify(b) }, at: { integerValue: String(b.at) } } }) });
  if (!r.ok) throw new Error(`writing the publish backup: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** The posts worth copying: approved, with an image or video, due within a day. Pure, so it is tested. */
export function backupPosts(posts: OpsPost[], now: number): BackupPost[] {
  return posts
    .filter(p => p.status === 'approved' && (p.imageUrl || p.videoUrl) && (p.scheduledFor ?? Infinity) < now + DAY && !(p.relevantUntil && p.relevantUntil < now))
    .map(p => ({ id: p.id, brand: p.brand, scheduledFor: p.scheduledFor!, relevantUntil: p.relevantUntil ?? null, caption: p.caption, altText: p.altText, imageUrl: p.imageUrl ?? null, imageUrls: p.imageUrls ?? [], videoUrl: p.videoUrl ?? null }));
}

/** What the backup should publish now: due, not late, not already out, within the brand's daily limit. Pure, so it is tested. */
export function dueFromBackup(b: PublishBackup, now: number): BackupPost[] {
  const today = calgaryDate(now);
  const outToday = new Map<BrandId, number>();
  for (const p of Object.values(b.published)) if (calgaryDate(p.at) === today) outToday.set(p.brand, (outToday.get(p.brand) ?? 0) + 1);
  const due: BackupPost[] = [];
  for (const p of [...b.posts].sort((x, y) => x.scheduledFor - y.scheduledFor)) {
    if (b.published[p.id] || p.scheduledFor > now || now - p.scheduledFor > LATE || (p.relevantUntil && p.relevantUntil < now)) continue;
    const n = outToday.get(p.brand) ?? 0;
    if (n >= brandKit(p.brand).postsPerDay + 3) continue;
    outToday.set(p.brand, n + 1);
    due.push(p);
  }
  return due;
}

/** Copy the approved posts and current tokens to arctos-hq. Keeps the last two days of what it published. */
export async function saveBackup(db: Firestore, now: number, log: Log): Promise<void> {
  if (!backupConfigured()) return;
  const approved = (await db.collection(COLLECTIONS.posts).where('status', '==', 'approved').get()).docs.map(d => ({ id: d.id, ...d.data() }) as OpsPost);
  const posts = backupPosts(approved, now);
  const tokens: PublishBackup['tokens'] = {};
  for (const brand of new Set(posts.map(p => p.brand))) { const t = await currentToken(db, brand); if (t) tokens[brand] = t; }
  const prev = await read();
  const published = Object.fromEntries(Object.entries(prev?.published ?? {}).filter(([, v]) => now - v.at < 2 * DAY));
  await write({ at: now, tokens, posts, published });
  log(`publish backup: ${posts.length} scheduled post(s) copied to HQ.`);
}

/** Mark posts the backup published as published in Firestore. */
export async function reconcileBackup(db: Firestore, now: number, log: Log): Promise<void> {
  if (!backupConfigured()) return;
  const b = await read();
  for (const [id, p] of Object.entries(b?.published ?? {})) {
    const ref = db.collection(COLLECTIONS.posts).doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.get('status') !== 'approved') continue;
    await ref.update(p.mediaId
      ? { status: 'published', publishedAt: p.at, igMediaId: p.mediaId, permalink: p.permalink, error: null, publishingAt: null, updatedAt: now }
      : { status: 'failed', error: 'Publishing from the backup started but did not finish; check Instagram before posting it again.', publishingAt: null, updatedAt: now });
    log(`publish backup: ${id} ${p.mediaId ? `was published while Firestore was out (${p.permalink ?? p.mediaId})` : 'may have been published while Firestore was out; marked failed for a person to check'}.`);
  }
}

/** Publish what is due from the backup; for runs where Firestore's quota is gone. */
export async function publishFromBackup(now: number, log: Log): Promise<void> {
  if (!backupConfigured()) { log('publish backup: HQ_ACCESS_TOKEN not set; skipped.'); return; }
  const b = await read();
  if (!b) { log('publish backup: none saved yet.'); return; }
  const due = dueFromBackup(b, now);
  if (!due.length) { log('publish backup: nothing due.'); return; }
  for (const p of due) {
    const token = b.tokens[p.brand];
    if (!token) { log(`publish backup: no token for ${p.brand}; ${p.id} waits.`); continue; }
    // Recorded before publishing: if this run dies mid-way, the post is never sent twice.
    b.published[p.id] = { at: Date.now(), mediaId: null, permalink: null, brand: p.brand };
    await write(b);
    try {
      const handle = brandKit(p.brand).handle;
      const r = p.videoUrl
        ? await publishReel(token, handle, p.videoUrl, p.imageUrl, p.caption)
        : p.imageUrls.length > 1
          ? await publishCarousel(token, handle, p.imageUrls, p.caption)
          : await publishImage(token, handle, p.imageUrl!, p.caption, p.altText);
      b.published[p.id] = { at: Date.now(), mediaId: r.mediaId, permalink: r.permalink, brand: p.brand };
      log(`publish backup: published ${p.id} → ${r.permalink ?? r.mediaId}`);
    } catch (e) {
      // Nothing went out, so a later run (or Firestore, once it is back) can try again.
      delete b.published[p.id];
      log(`publish backup: ${p.id} failed: ${e instanceof Error ? e.message : e}`);
    }
    await write(b);
  }
}
