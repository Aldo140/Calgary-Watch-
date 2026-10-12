// The social media coordinator. Once a day, before drafting: read the playbook,
// our own numbers (ops_health/performance and account_history) and what's
// working on other Calgary accounts (ops_health/scout), then plan the week.
// The plan steers the drafting step (direction for the writer, listings to
// feature) and gives Aldo the part only he can do: clips to film and creator
// DMs to send by hand. Written to ops_health/coordinator; HQ shows it.
//
// It never posts, comments or messages anyone.

import type { Firestore } from 'firebase-admin/firestore';
import type { AccountHistory, HistoryGroup, OpsPerformance } from '../../../src/types/ops';
import { brandKit, playbook } from '../lib/brand';
import { claudeConfigured, planWeek, type ContentPlan } from '../lib/claude';
import { COLLECTIONS } from '../lib/firebase';
import { IG_NOTES_DOC, notesForPrompt, type IgNote } from '../lib/igNotes';
import { photoFor, cleanTitle, happenings, normalize, type DiscoveryIndex } from '../lib/posts';
import type { Outperformer, ScoutEntry } from '../lib/scout';
import { addDays, calgaryDate, calgaryToEpoch, clock, longDay } from '../lib/time';

type Log = (m: string) => void;
const EVERY = 20 * 3_600_000;

export interface CoordinatorDoc extends ContentPlan { at: number; week: string }

const groupLine = (g: HistoryGroup) => `${g.label}: ${g.posts} posts, median ${g.medianViews} views, median ${g.medianEngagement} interactions, best ${g.best}`;

/** The numbers, as short lines the planner can reason over. Pure, so it is tested. */
export function numbersBrief(history: AccountHistory | null, perf: OpsPerformance | null): string {
  const lines: string[] = [];
  if (history) {
    lines.push(`Whole account (${history.totalPosts} posts, ${history.followers ?? '?'} followers):`);
    for (const [name, groups] of [['By origin', history.byOrigin], ['By format', history.byFormat], ['By topic', history.byTopic], ['By hour', history.byHour], ['By weekday', history.byWeekday]] as const) {
      lines.push(`${name}:`, ...groups.slice(0, 8).map(g => `  ${groupLine(g)}`));
    }
  }
  if (perf) {
    lines.push('The posting agent\'s own posts, last 30 days (avg reach, avg saves+shares):');
    for (const r of [...perf.byKind, ...perf.byFormat]) lines.push(`  ${r.label}: ${r.posts} posts, reach ${r.avgReach}, saves+shares ${r.avgSavesShares}`);
    if (perf.top.length) lines.push('Its best posts:', ...perf.top.map(t => `  ${t.reach} reach · ${t.format} · ${t.headline}`));
  }
  return lines.join('\n') || '(no numbers yet)';
}

/** Creators worth asking: active creator accounts and creators the watched accounts credit. Pure, so it is tested. */
export function creatorList(accounts: ScoutEntry[], inspiration: Outperformer[]): Array<{ handle: string; line: string; posts: string[] }> {
  const out = new Map<string, { handle: string; line: string; posts: string[] }>();
  for (const a of accounts) {
    if (!a.active || !['creator', 'candidate'].includes(a.kind)) continue;
    out.set(a.handle, { handle: a.handle, line: `@${a.handle} · ${a.followers} followers · ${a.top ? `${a.top.permalink} (${a.top.engagement} likes+comments${a.top.reel ? ', Reel' : ''}): ${a.top.caption.slice(0, 100)}` : 'no recent post'}`, posts: a.top ? [a.top.permalink] : [] });
  }
  for (const p of inspiration) {
    const c = out.get(p.handle);
    if (c && p.reel && !c.posts.includes(p.permalink)) { c.posts.push(p.permalink); c.line += `\n    also ${p.permalink} (${p.engagement} likes+comments, ${p.lift}x usual): ${p.caption.replace(/\s+/g, ' ').slice(0, 100)}`; }
  }
  return [...out.values()].slice(0, 15);
}

/** Drop anything the planner made up: creators, posts or listings that weren't in what it was given. */
export function checkPlan(plan: ContentPlan, creators: Array<{ handle: string; posts: string[] }>, listingTitles: string[]): ContentPlan {
  const byHandle = new Map(creators.map(c => [c.handle.toLowerCase(), c]));
  const titles = new Set(listingTitles.map(normalize));
  return {
    ...plan,
    plan: plan.plan.map(p => (p.listing && !titles.has(normalize(p.listing)) ? { ...p, listing: '' } : p)),
    outreach: plan.outreach
      .map(o => ({ ...o, handle: o.handle.replace(/^@/, '').toLowerCase() }))
      .filter(o => byHandle.has(o.handle))
      .map(o => (o.postUrl && !byHandle.get(o.handle)!.posts.includes(o.postUrl) ? { ...o, postUrl: '' } : o))
      .slice(0, 5),
  };
}

/** Listings the plan wants featured, as normalized clean titles, for the drafting step. */
export const featuredListings = (doc: Pick<CoordinatorDoc, 'plan'> | null): Set<string> =>
  new Set((doc?.plan ?? []).filter(p => p.listing).map(p => normalize(cleanTitle(p.listing))));

export async function coordinate(db: Firestore, index: DiscoveryIndex, now: number, log: Log): Promise<CoordinatorDoc | null> {
  const ref = db.collection(COLLECTIONS.health).doc('coordinator');
  const prev = (await ref.get()).data() as CoordinatorDoc | undefined;
  if (prev && now - prev.at < EVERY) { log('coordinator: this week\'s plan is fresh.'); return prev; }
  const book = playbook('calgarydaily');
  if (!claudeConfigured() || !book) { log('coordinator: needs ANTHROPIC_API_KEY and brand/calgarydaily-playbook.md; skipped.'); return prev ?? null; }

  const health = db.collection(COLLECTIONS.health);
  const [perf, history, scout, notes] = await Promise.all(['performance', 'account_history', 'scout', IG_NOTES_DOC].map(id => health.doc(id).get().then(d => d.data() ?? null)));
  const s = scout as { accounts?: ScoutEntry[]; inspiration?: Outperformer[]; analysis?: { patterns?: Array<{ title: string; why: string }>; ideas?: Array<{ title: string; format: string; hook: string }> } } | null;

  const today = calgaryDate(now);
  const end = calgaryToEpoch(addDays(today, 8), '00:00');
  const upcoming = happenings(index).filter(h => (h.end ?? h.start) > now && h.start < end);
  const seen = new Set<string>();
  const listings = upcoming.filter(h => { const k = normalize(cleanTitle(h.entity.title)); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 60);
  const creators = creatorList(s?.accounts ?? [], s?.inspiration ?? []);
  const inspiration = [
    ...(s?.analysis?.patterns ?? []).map(p => `Pattern: ${p.title}: ${p.why}`),
    ...(s?.inspiration ?? []).slice(0, 10).map(p => `@${p.handle} ${p.reel ? 'Reel' : 'post'}, ${p.engagement} likes+comments (${p.lift}x usual): ${p.caption.replace(/\s+/g, ' ').slice(0, 140)}`),
  ].join('\n');

  const plan = await planWeek({
    playbook: book,
    notes: notesForPrompt(((notes as { notes?: IgNote[] } | null)?.notes) ?? []),
    numbers: numbersBrief(history as AccountHistory | null, perf as OpsPerformance | null),
    inspiration: inspiration || '(nothing yet)',
    creators: creators.map(c => c.line).join('\n'),
    listings: listings.map(h => `${cleanTitle(h.entity.title)} · ${longDay(h.start)} ${clock(h.start)} · ${h.entity.venue ?? h.entity.address ?? ''}${h.entity.pricing === 'free' ? ' · free' : ''}${photoFor(h) ? ' · has photo' : ''}`).join('\n'),
    slots: brandKit('calgarydaily').postingSlots,
    today: longDay(now),
  });
  const doc: CoordinatorDoc = { ...checkPlan(plan, creators, listings.map(h => cleanTitle(h.entity.title))), at: now, week: today };
  await ref.set(doc);
  log(`coordinator: planned ${doc.plan.length} posts, ${doc.shootList.length} clips to shoot, ${doc.outreach.length} creator DMs to send.`);
  log(`  direction: ${doc.direction.replace(/\s+/g, ' ')}`);
  return doc;
}
