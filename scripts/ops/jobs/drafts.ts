// Hand-written drafts (news explainers, takes, one-off event posts) live as JSON
// in brand/drafts/. Each run renders any new one, uploads its images and puts it
// in the review queue. A draft marked "approved": true in the file is scheduled
// for its suggestedAt time; otherwise it waits for a person in /admin.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';
import type { BrandId, OpsPost, PostImageText, PostTemplate } from '../../../src/types/ops';
import { ROOT, brandKit } from '../lib/brand';
import { COLLECTIONS, uploadImage, uploadVideo } from '../lib/firebase';
import { makeReel } from '../lib/reel';
import { checkDraft } from '../lib/posts';
import { renderPost, renderReelBackdrop } from '../lib/render';
import { DAILY_DESIGN_VERSION } from '../lib/renderDaily';
import { calgaryToEpoch } from '../lib/time';

type Log = (m: string) => void;

interface DraftFile {
  brand: BrandId;
  posts: Array<{
    id: string;
    kind: 'news' | 'take' | 'event' | 'repost';
    /** Someone else's video, shared only with their permission (see repostProblems). */
    repost?: RepostInfo;
    title: string;
    suggestedAt: string;          // Calgary wall clock, "YYYY-MM-DDTHH:mm"
    relevantUntil?: string;       // Calgary wall clock; defaults to none
    approved?: boolean;
    /** Who approved a news or opinion post, and where ("Aldo, in chat, 2026-09-25"). */
    approvedBy?: string;
    /** 'reel' turns the slides into a 9:16 video Reel; default is an image or carousel post. */
    format?: 'post' | 'reel';
    /** Pull a queued draft back before it publishes. */
    withdrawn?: boolean;
    slides: Array<PostImageText & { template: PostTemplate }>;
    caption: string;
    altText: string;
    sources: Array<{ name: string; url: string }>;
  }>;
}

const toEpoch = (local: string) => calgaryToEpoch(local.slice(0, 10), local.slice(11, 16));

export interface RepostInfo {
  /** The creator's Instagram handle, without the @. */
  handle: string;
  /** Their original post. */
  originalUrl: string;
  /** The file they sent, or a copy made after they said yes, under brand/reposts/. */
  video: string;
  permission: {
    /** Who said yes: the handle or the person's name. */
    grantedBy: string;
    /** Where they said it: "Instagram DM", "email". */
    how: string;
    /** YYYY-MM-DD. */
    date: string;
    /** Their words, quoted, so anyone reviewing can see what was agreed. */
    quote: string;
  };
}

/**
 * A repost goes out only with the creator's recorded permission and their credit
 * in the caption. Credit alone is not permission: without a yes, it isn't queued.
 */
export function repostProblems(d: { kind: string; caption: string; approved?: boolean; approvedBy?: string; repost?: RepostInfo }): string[] {
  if (d.kind !== 'repost') return [];
  const r = d.repost;
  if (!r) return ['Repost has no creator details.'];
  const problems: string[] = [];
  if (!/^[A-Za-z0-9._]{1,30}$/.test(r.handle ?? '')) problems.push('Creator handle is missing or not a valid Instagram handle.');
  if (!/^https:\/\/(www\.)?instagram\.com\//.test(r.originalUrl ?? '')) problems.push('Original post URL must be an instagram.com link.');
  if (!/^brand\/reposts\/[\w.-]+\.mp4$/.test(r.video ?? '')) problems.push('Video must be an .mp4 under brand/reposts/.');
  const p = r.permission;
  if (!p || !p.grantedBy?.trim() || !p.how?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(p.date ?? '') || (p.quote ?? '').trim().length < 3) {
    problems.push('Permission is not recorded (who, how, date and their words are all required).');
  }
  if (r.handle && !d.caption.includes(`@${r.handle}`)) problems.push(`Caption must credit @${r.handle}.`);
  if (!/with permission/i.test(d.caption)) problems.push('Caption must say it is shared with permission.');
  return problems;
}

export async function queueDrafts(db: Firestore, now: number, log: Log): Promise<void> {
  const dir = join(ROOT, 'brand', 'drafts');
  const files = (await readdir(dir).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort();
  for (const file of files) {
    const data = JSON.parse(await readFile(join(dir, file), 'utf8')) as DraftFile;
    const kit = brandKit(data.brand);
    for (const d of data.posts) {
      const id = `draft-${file.replace(/\.json$/, '')}-${d.id}`;
      const ref = db.collection(COLLECTIONS.posts).doc(id);
      const existing = await ref.get();
      const scheduledFor = Math.max(toEpoch(d.suggestedAt), now + 5 * 60_000);
      const relevantUntil = d.relevantUntil ? toEpoch(d.relevantUntil) : null;

      if (existing.exists && d.withdrawn) {
        if (['drafted', 'approved'].includes(existing.get('status'))) {
          await ref.update({ status: 'rejected', note: `Withdrawn in brand/drafts/${file}`, updatedAt: now });
          log(`withdrawn: ${d.title}`);
        }
        continue;
      }
      if (d.withdrawn) continue;
      if (existing.exists) {
        // Approving in the file later schedules a draft that is still waiting.
        if (d.approved && existing.get('status') === 'drafted') {
          await ref.update({ status: 'approved', scheduledFor, reviewedByEmail: d.approvedBy ?? `brand/drafts/${file}`, reviewedAt: now, updatedAt: now });
          log(`approved from file: ${d.title}`);
        }
        continue;
      }
      if (relevantUntil && relevantUntil < now) continue;
      const blocked = repostProblems(d);
      if (blocked.length) { log(`not queued: ${d.title}: ${blocked.join(' ')}`); continue; }

      const imageUrls: string[] = [];
      let i = 0;
      for (const slide of d.slides) {
        imageUrls.push(await uploadImage(`ops/drafts/${id}-${++i}-${now}.png`, await renderPost(kit, slide.template, slide)));
      }
      let videoUrl: string | null = null;
      if (d.kind === 'repost' && d.repost) {
        // The creator's own video, as sent; the first slide is only the cover.
        videoUrl = await uploadVideo(`ops/reposts/${id}-${now}.mp4`, await readFile(join(ROOT, d.repost.video)));
        log(`uploaded repost video from @${d.repost.handle}`);
      } else if (d.format === 'reel') {
        const pngs = await Promise.all(d.slides.map(sl => renderPost(kit, sl.template, sl)));
        const mp4 = await makeReel(pngs, { backdrop: await renderReelBackdrop() });
        videoUrl = await uploadVideo(`ops/reels/${id}-${now}.mp4`, mp4);
        log(`rendered reel ${id}: ${Math.round(mp4.length / 1024)} KB`);
      }
      const first = d.slides[0];
      const warnings = [
        ...(d.kind === 'event' ? [] : d.kind === 'repost' && d.repost ? [`Repost of @${d.repost.handle}'s video. Permission: ${d.repost.permission.how}, ${d.repost.permission.date}: "${d.repost.permission.quote}"`] : [`${d.kind === 'take' ? 'Opinion' : 'News'} post drafted by Claude from the sources listed. Check the facts before approving.`]),
        ...checkDraft({ caption: d.caption, altText: d.altText, imageText: first }, kit),
      ];
      const post: OpsPost = {
        id, brand: data.brand, template: first.template, status: d.approved ? 'approved' : 'drafted',
        fingerprint: `${data.brand}|draft|${file}|${d.id}`, entityIds: [], entityStarts: {},
        sourceUrls: d.sources.map(s => s.url), facts: d.sources.map(s => `${s.name}: ${s.url}`).join('\n'),
        caption: d.caption, altText: d.altText, link: kit.linkInBio, imageText: first,
        imageUrl: imageUrls[0], imageUrls: !videoUrl && imageUrls.length > 1 ? imageUrls : null, videoUrl, imagePath: null,
        designVersion: DAILY_DESIGN_VERSION, warnings, sponsored: false, relevantUntil, suggestedFor: scheduledFor,
        scheduledFor: d.approved ? scheduledFor : null, draftedBy: 'claude', createdAt: now, updatedAt: now,
        reviewedByEmail: d.approved ? (d.approvedBy ?? `brand/drafts/${file}`) : null,
      };
      await ref.create(post);
      log(`queued ${d.approved ? 'and scheduled' : 'for review'}: ${d.title} (${imageUrls.length} image${imageUrls.length > 1 ? 's' : ''})`);
    }
  }
}
