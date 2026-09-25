// Hand-written drafts (news explainers, takes, one-off event posts) live as JSON
// in brand/drafts/. Each run renders any new one, uploads its images and puts it
// in the review queue. A draft marked "approved": true in the file is scheduled
// for its suggestedAt time; otherwise it waits for a person in /admin.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';
import type { BrandId, OpsPost, PostImageText, PostTemplate } from '../../../src/types/ops';
import { ROOT, brandKit } from '../lib/brand';
import { COLLECTIONS, uploadImage } from '../lib/firebase';
import { checkDraft } from '../lib/posts';
import { renderPost } from '../lib/render';
import { DAILY_DESIGN_VERSION } from '../lib/renderDaily';
import { calgaryToEpoch } from '../lib/time';

type Log = (m: string) => void;

interface DraftFile {
  brand: BrandId;
  posts: Array<{
    id: string;
    kind: 'news' | 'take' | 'event';
    title: string;
    suggestedAt: string;          // Calgary wall clock, "YYYY-MM-DDTHH:mm"
    relevantUntil?: string;       // Calgary wall clock; defaults to none
    approved?: boolean;
    /** Who approved a news or opinion post, and where ("Aldo, in chat, 2026-09-25"). */
    approvedBy?: string;
    slides: Array<PostImageText & { template: PostTemplate }>;
    caption: string;
    altText: string;
    sources: Array<{ name: string; url: string }>;
  }>;
}

const toEpoch = (local: string) => calgaryToEpoch(local.slice(0, 10), local.slice(11, 16));

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

      if (existing.exists) {
        // Approving in the file later schedules a draft that is still waiting.
        if (d.approved && existing.get('status') === 'drafted') {
          await ref.update({ status: 'approved', scheduledFor, reviewedByEmail: d.approvedBy ?? `brand/drafts/${file}`, reviewedAt: now, updatedAt: now });
          log(`approved from file: ${d.title}`);
        }
        continue;
      }
      if (relevantUntil && relevantUntil < now) continue;

      const imageUrls: string[] = [];
      let i = 0;
      for (const slide of d.slides) {
        imageUrls.push(await uploadImage(`ops/drafts/${id}-${++i}-${now}.png`, await renderPost(kit, slide.template, slide)));
      }
      const first = d.slides[0];
      const warnings = [
        ...(d.kind === 'event' ? [] : [`${d.kind === 'take' ? 'Opinion' : 'News'} post drafted by Claude from the sources listed. Check the facts before approving.`]),
        ...checkDraft({ caption: d.caption, altText: d.altText, imageText: first }, kit),
      ];
      const post: OpsPost = {
        id, brand: data.brand, template: first.template, status: d.approved ? 'approved' : 'drafted',
        fingerprint: `${data.brand}|draft|${file}|${d.id}`, entityIds: [], entityStarts: {},
        sourceUrls: d.sources.map(s => s.url), facts: d.sources.map(s => `${s.name}: ${s.url}`).join('\n'),
        caption: d.caption, altText: d.altText, link: kit.linkInBio, imageText: first,
        imageUrl: imageUrls[0], imageUrls: imageUrls.length > 1 ? imageUrls : null, imagePath: null,
        designVersion: DAILY_DESIGN_VERSION, warnings, sponsored: false, relevantUntil, suggestedFor: scheduledFor,
        scheduledFor: d.approved ? scheduledFor : null, draftedBy: 'claude', createdAt: now, updatedAt: now,
        reviewedByEmail: d.approved ? (d.approvedBy ?? `brand/drafts/${file}`) : null,
      };
      await ref.create(post);
      log(`queued ${d.approved ? 'and scheduled' : 'for review'}: ${d.title} (${imageUrls.length} image${imageUrls.length > 1 ? 's' : ''})`);
    }
  }
}
