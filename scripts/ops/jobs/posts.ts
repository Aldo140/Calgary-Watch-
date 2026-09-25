// Instagram post jobs: draft new candidates, re-draft on request, expire stale
// drafts, flag published posts whose listing changed, and publish approved posts.

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';
import type { BrandId, OpsPost, PostTemplate } from '../../../src/types/ops';
import { BRANDS, ROOT, brandKit, type BrandKit } from '../lib/brand';
import { claudeConfigured, extractBrief, writePost } from '../lib/claude';
import { COLLECTIONS, uploadImage } from '../lib/firebase';
import { publishCarousel, publishImage } from '../lib/instagram';
import { currentToken } from './igTokens';
import { checkDraft, happenings, roundupHeadline, selectCandidates, templateDraft, type Candidate, type DiscoveryIndex, type Draft } from '../lib/posts';
import { renderPost } from '../lib/render';
import { calgaryDate, nextSlot } from '../lib/time';

type Log = (m: string) => void;
const postId = (fingerprint: string) => `post-${createHash('sha256').update(fingerprint).digest('hex').slice(0, 20)}`;

/** Claude's draft checked against the brand; the template draft when there is no key or it fails. */
async function writeDraft(c: Pick<Candidate, 'template' | 'title' | 'facts' | 'link'> & { items?: Candidate['items'] }, kit: BrandKit, base: Draft, note: string, log: Log): Promise<{ draft: Draft; warnings: string[]; by: 'claude' | 'template' }> {
  if (!claudeConfigured()) return { draft: base, warnings: checkDraft(base, kit), by: 'template' };
  try {
    const w = await writePost(kit, {
      kind: c.template === 'roundup' ? 'roundup of several listings' : c.template === 'update' ? 'news or city update' : 'single listing',
      title: c.title + (note ? `\nReviewer's note for this redraft: ${note}` : ''),
      facts: c.facts, link: c.link, sponsored: c.template === 'partner',
    });
    const details = c.template === 'roundup' && w.itemLabels.length === base.imageText.details.length
      ? base.imageText.details.map((d, i) => `${d.split(' · ')[0]} · ${w.itemLabels[i].slice(0, 30)}`)
      : base.imageText.details;
    // Roundups keep the house headline (Today / Tonight / This weekend in Calgary); the date lives in the label.
    const headline = c.template === 'roundup' ? base.imageText.headline : (w.headline || base.imageText.headline);
    const draft: Draft = { caption: w.caption, altText: w.altText, imageText: { ...base.imageText, headline, details } };
    const problems = checkDraft(draft, kit, { sponsored: c.template === 'partner' });
    if (problems.length) {
      log(`  Claude draft failed checks (${problems.join(' ')}); using the template draft.`);
      return { draft: base, warnings: [`Claude's draft was replaced by the template: ${problems.join(' ')}`, ...checkDraft(base, kit)], by: 'template' };
    }
    return { draft, warnings: [], by: 'claude' };
  } catch (e) {
    log(`  Claude unavailable (${e instanceof Error ? e.message : e}); using the template draft.`);
    return { draft: base, warnings: [`Drafted from the template because Claude failed: ${e instanceof Error ? e.message : e}`], by: 'template' };
  }
}

async function renderAndStore(id: string, kit: BrandKit, template: PostTemplate, draft: Draft, dryDir: string | null): Promise<{ imageUrl: string | null; imagePath: string | null }> {
  const png = await renderPost(kit, template, draft.imageText);
  if (dryDir) {
    await writeFile(join(dryDir, `${id}.png`), png);
    return { imageUrl: null, imagePath: join(dryDir, `${id}.png`) };
  }
  const path = `ops/posts/${id}-${Date.now()}.png`;
  return { imageUrl: await uploadImage(path, png), imagePath: path };
}

function entityStarts(c: Candidate): Record<string, string> {
  return Object.fromEntries(c.items.map(h => [h.entity.id, new Date(h.start).toISOString()]));
}

export async function draftPosts(db: Firestore | null, index: DiscoveryIndex, now: number, log: Log): Promise<number> {
  const dryDir = db ? null : join(ROOT, 'brand', 'preview', 'dry-run');
  if (dryDir) await mkdir(dryDir, { recursive: true });
  const queued = new Set<string>();
  const recent = new Map<string, Set<string>>();
  if (db) (await db.collection(COLLECTIONS.posts).select('fingerprint', 'brand', 'entityIds', 'createdAt').get()).forEach(d => {
    queued.add(d.get('fingerprint'));
    if ((d.get('createdAt') ?? 0) > now - 2 * 86_400_000) {
      const set = recent.get(d.get('brand')) ?? new Set<string>();
      for (const id of d.get('entityIds') ?? []) set.add(id);
      recent.set(d.get('brand'), set);
    }
  });

  let made = 0;
  for (const brand of BRANDS) {
    const kit = brandKit(brand);
    // Leave room for posts already waiting: don't pile up more drafts than a day's worth.
    let waiting = 0;
    if (db) waiting = (await db.collection(COLLECTIONS.posts).where('status', '==', 'drafted').select('brand').get()).docs.filter(d => d.get('brand') === brand).length;
    if (waiting >= kit.postsPerDay * 3) { log(`${brand}: ${waiting} drafts already waiting for review; not adding more.`); continue; }

    for (const c of selectCandidates(index, kit, now, queued, recent.get(brand))) {
      const id = postId(c.fingerprint);
      const { draft, warnings, by } = await writeDraft(c, kit, templateDraft(c, kit), '', log);
      const image = await renderAndStore(id, kit, c.template, draft, dryDir);
      const post: OpsPost = {
        id, brand, template: c.template, status: 'drafted', fingerprint: c.fingerprint,
        entityIds: c.items.map(i => i.entity.id), entityStarts: entityStarts(c),
        sourceUrls: [...new Set(c.items.map(i => i.sourceUrl))], facts: c.facts,
        caption: draft.caption, altText: draft.altText, link: c.link, imageText: draft.imageText,
        ...image, warnings: kit.confirmed ? warnings : [`${kit.name} brand kit is provisional: ${kit.confirmNote ?? ''}`, ...warnings],
        sponsored: false, relevantUntil: c.relevantUntil, suggestedFor: c.suggestedFor, scheduledFor: null,
        draftedBy: by, createdAt: now, updatedAt: now,
      };
      if (db) await db.collection(COLLECTIONS.posts).doc(id).create(post).catch(e => log(`  skipped ${id}: ${e.message}`));
      else await writeFile(join(dryDir!, `${id}.json`), JSON.stringify(post, null, 2));
      queued.add(c.fingerprint);
      made++;
      log(`${brand}: drafted "${c.title}" (${c.template}, ${by})`);
    }
  }
  return made;
}

/** Re-draft posts a reviewer sent back, and draft CalgaryDaily briefs from a source URL. */
export async function redraftAndBriefs(db: Firestore, now: number, log: Log): Promise<void> {
  const snap = await db.collection(COLLECTIONS.posts).where('status', 'in', ['redraft', 'requested']).get();
  for (const doc of snap.docs) {
    const p = doc.data() as OpsPost;
    const kit = brandKit(p.brand);
    let facts = p.facts, title = p.imageText?.headline ?? '', template = p.template, sourceUrls = p.sourceUrls;
    const warnings: string[] = [];

    if (p.status === 'requested') {
      if (!p.requestUrl) { await doc.ref.update({ status: 'rejected', note: 'No source URL given.', updatedAt: now }); continue; }
      if (!claudeConfigured()) { log(`brief ${p.id}: waiting for ANTHROPIC_API_KEY`); continue; }
      try {
        const res = await fetch(p.requestUrl, { headers: { 'user-agent': 'CalgaryWatchBot/1.0 (+https://calgarywatch.ca)' }, signal: AbortSignal.timeout(20_000) });
        const text = (await res.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const brief = await extractBrief(text, p.requestUrl, p.note ?? '');
        if (!brief.usable) { await doc.ref.update({ status: 'rejected', note: `Not drafted: ${brief.reason}`, updatedAt: now }); continue; }
        facts = `${brief.facts}\nSource: ${p.requestUrl}`; title = brief.title; template = 'update'; sourceUrls = [p.requestUrl];
        if (brief.sensitive) warnings.push('Sensitive story (crime, emergency or a private person). Check the wording and the source before approving.');
      } catch (e) {
        await doc.ref.update({ error: `Could not read the source page: ${e instanceof Error ? e.message : e}`, updatedAt: now });
        continue;
      }
    }

    const base: Draft = p.status === 'requested'
      ? { caption: `${title}\n\nSource: ${sourceUrls[0]}\n\n${kit.hashtags.join(' ')}`, altText: title, imageText: { eyebrow: `UPDATE · ${calgaryDate(now)}`, headline: title.slice(0, 60), details: [], footer: kit.site.replace(/^https?:\/\//, '') } }
      : { caption: p.caption, altText: p.altText, imageText: p.imageText };
    const { draft, warnings: w, by } = await writeDraft({ template, title, facts, link: p.link || kit.linkInBio }, kit, base, p.status === 'redraft' ? (p.note ?? '') : '', log);
    if (p.status === 'requested' && by === 'claude') {
      // Briefs: the image carries the headline and the source, nothing Claude could embellish.
      draft.imageText.details = [`Source: ${new URL(sourceUrls[0]).hostname.replace(/^www\./, '')}`];
    }
    const image = await renderAndStore(p.id, kit, template, draft, null);
    await doc.ref.update({
      status: 'drafted', template, facts, sourceUrls, caption: draft.caption, altText: draft.altText, imageText: draft.imageText,
      ...image, warnings: [...warnings, ...w], draftedBy: by, link: p.link || kit.linkInBio,
      suggestedFor: nextSlot(now, kit.postingSlots), updatedAt: now, error: null,
    });
    log(`${p.brand}: ${p.status === 'requested' ? 'drafted brief' : 'redrafted'} ${p.id}`);
  }
}

/** Expire drafts whose date passed; flag published posts whose listing changed or was cancelled. */
export async function monitorPosts(db: Firestore, index: DiscoveryIndex, now: number, log: Log): Promise<void> {
  const stale = await db.collection(COLLECTIONS.posts).where('status', 'in', ['drafted', 'approved', 'redraft']).get();
  for (const d of stale.docs) {
    const until = d.get('relevantUntil');
    if (until && until < now) { await d.ref.update({ status: 'expired', updatedAt: now }); log(`expired ${d.id}`); }
  }
  const current = new Map<string, number[]>();
  for (const h of happenings(index)) current.set(h.entity.id, [...(current.get(h.entity.id) ?? []), h.start]);
  const published = (await db.collection(COLLECTIONS.posts).where('status', '==', 'published').get()).docs.filter(d => (d.get('relevantUntil') ?? 0) > now);
  for (const d of published) {
    const p = d.data() as OpsPost;
    const problems: string[] = [];
    for (const [id, start] of Object.entries(p.entityStarts ?? {})) {
      const starts = current.get(id);
      if (!starts) problems.push(`A listing in this post was removed or cancelled (${id}).`);
      else if (!starts.includes(Date.parse(start))) problems.push(`A listing's time changed from ${start}.`);
    }
    if (problems.length) {
      await d.ref.update({ status: 'needs-correction', correction: problems.join(' '), updatedAt: now });
      log(`needs correction: ${d.id} — ${problems.join(' ')}`);
    }
  }
}

export async function publishDue(db: Firestore, now: number, log: Log): Promise<void> {
  // A manual run can publish approved posts before their slot (OPS_PUBLISH_NOW, ops-hourly.yml input).
  const force = process.env.OPS_PUBLISH_NOW === '1';
  // Single-field queries only, filtered here: the queue is small and this needs no composite indexes.
  const due = (await db.collection(COLLECTIONS.posts).where('status', '==', 'approved').get()).docs.filter(d => force || (d.get('scheduledFor') ?? Infinity) <= now);
  const publishedToday = new Map<BrandId, number>();
  const today = calgaryDate(now);
  const recent = await db.collection(COLLECTIONS.posts).where('publishedAt', '>=', now - 36 * 3_600_000).get();
  for (const d of recent.docs) if (calgaryDate(d.get('publishedAt')) === today) publishedToday.set(d.get('brand'), (publishedToday.get(d.get('brand')) ?? 0) + 1);

  for (const doc of due) {
    const p = doc.data() as OpsPost;
    const kit = brandKit(p.brand);
    const token = await currentToken(db, p.brand);
    const hold = async (error: string) => { await doc.ref.update({ error, updatedAt: now }); log(`held ${p.id}: ${error}`); };
    if (!token) { await hold(`No Instagram token for ${kit.name} yet (IG_TOKEN_${p.brand.toUpperCase()}).`); continue; }
    if (!kit.confirmed) { await hold(`${kit.name} brand kit is still provisional; confirm brand/${p.brand}.json first.`); continue; }
    if (!p.imageUrl) { await hold('No image.'); continue; }
    if (p.relevantUntil && p.relevantUntil < now) { await doc.ref.update({ status: 'expired', updatedAt: now }); continue; }
    if (p.publishingAt && now - p.publishingAt < 30 * 60_000) continue;
    if ((publishedToday.get(p.brand) ?? 0) >= kit.postsPerDay + 2) { await hold(`Daily limit reached (${kit.postsPerDay + 2}); will post next slot.`); await doc.ref.update({ scheduledFor: nextSlot(now, kit.postingSlots) }); continue; }
    // A roundup headline that repeats the date already in its label gets trimmed and re-rendered before it goes out.
    const trimmed = p.template === 'roundup' ? roundupHeadline(p.imageText.headline) : p.imageText.headline;
    if (trimmed !== p.imageText.headline) {
      p.imageText = { ...p.imageText, headline: trimmed };
      const stored = await renderAndStore(p.id, kit, 'roundup', { caption: p.caption, altText: p.altText, imageText: p.imageText }, null);
      if (stored.imageUrl) p.imageUrl = stored.imageUrl;
      await doc.ref.update({ imageText: p.imageText, imageUrl: p.imageUrl });
    }
    const imageUrl = p.imageUrl;
    const problems = checkDraft({ caption: p.caption, altText: p.altText, imageText: p.imageText }, kit, { sponsored: p.sponsored });
    if (problems.length) { await hold(`Fails brand checks: ${problems.join(' ')}`); continue; }

    await doc.ref.update({ publishingAt: now });
    try {
      const r = (p.imageUrls?.length ?? 0) > 1
        ? await publishCarousel(token, kit.handle, p.imageUrls!, p.caption)
        : await publishImage(token, kit.handle, imageUrl, p.caption, p.altText);
      await doc.ref.update({ status: 'published', publishedAt: Date.now(), igMediaId: r.mediaId, permalink: r.permalink, error: null, publishingAt: null, updatedAt: Date.now() });
      publishedToday.set(p.brand, (publishedToday.get(p.brand) ?? 0) + 1);
      log(`published ${p.id} → ${r.permalink ?? r.mediaId}`);
    } catch (e) {
      const attempts = (p.attempts ?? 0) + 1;
      await doc.ref.update({ attempts, error: e instanceof Error ? e.message : String(e), publishingAt: null, status: attempts >= 3 ? 'failed' : 'approved', updatedAt: Date.now() });
      log(`publish failed for ${p.id} (attempt ${attempts}): ${e instanceof Error ? e.message : e}`);
    }
  }
}

/**
 * Posts that may go out without a person approving them: event, market and
 * roundup posts built only from verified listings, with no warnings, for a
 * brand whose kit turns that category on (the owner opted CalgaryDaily in on
 * 2026-09-25). News briefs, sensitive stories and paid posts always wait.
 */
export function autoPublishable(p: OpsPost): boolean {
  const kit = brandKit(p.brand);
  if (!kit.confirmed || p.sponsored || p.status !== 'drafted' || (p.warnings ?? []).length) return false;
  if (p.template === 'roundup') return kit.autoPublish.roundups;
  if (p.template === 'event') return p.fingerprint.includes('|market|') ? kit.autoPublish.markets : kit.autoPublish.events;
  return false;
}

export async function autoApprove(db: Firestore, now: number, log: Log): Promise<void> {
  const drafted = await db.collection(COLLECTIONS.posts).where('status', '==', 'drafted').get();
  for (const doc of drafted.docs) {
    const p = doc.data() as OpsPost;
    if (!autoPublishable(p)) continue;
    const kit = brandKit(p.brand);
    // A suggested slot that already passed moves to the next one, if the post is still useful then;
    // otherwise it goes out shortly (e.g. a "today" roundup approved mid-morning).
    const slot = p.suggestedFor && p.suggestedFor > now ? p.suggestedFor : nextSlot(now, kit.postingSlots);
    const when = p.relevantUntil && slot > p.relevantUntil ? now + 5 * 60_000 : slot;
    if (p.relevantUntil && when > p.relevantUntil) continue;
    await doc.ref.update({ status: 'approved', scheduledFor: when, reviewedByEmail: 'auto (brand rules)', reviewedAt: now, updatedAt: now });
    log(`auto-approved ${p.brand} "${p.imageText.headline}" for ${new Date(when).toISOString()}`);
  }
}
