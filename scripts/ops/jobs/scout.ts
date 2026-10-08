// The Scout: once a day, read the public profile and recent posts of the
// Calgary accounts in brand/scout.json through Business Discovery, rank who is
// active and getting engagement now, and find the creators they credit. Written
// to ops_health/scout for /admin and the drafting step, and printed in the
// Actions log.
//
// Needs IG_DISCOVERY_TOKEN (a Facebook-login Page token for CalgaryDaily) and
// IG_USER_ID (@calgarydaily's Instagram user id). Read only: it never posts,
// follows or messages anyone. One call per account, well under Instagram's
// ~200 calls an hour.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';
import { ROOT } from '../lib/brand';
import { COLLECTIONS } from '../lib/firebase';
import { businessDiscovery } from '../lib/instagram';
import { creditedHandles, rank, summarize, type ScoutEntry } from '../lib/scout';

type Log = (m: string) => void;

interface ScoutConfig { maxCandidatesPerRun: number; watch: Array<{ handle: string; kind: string }> }

export const scoutConfigured = () => Boolean(process.env.IG_DISCOVERY_TOKEN && process.env.IG_USER_ID);

export async function runScout(db: Firestore | null, now: number, log: Log): Promise<void> {
  if (!scoutConfigured()) { log('scout: IG_DISCOVERY_TOKEN or IG_USER_ID not set; skipped.'); return; }
  const token = process.env.IG_DISCOVERY_TOKEN!;
  const igUserId = process.env.IG_USER_ID!;
  const cfg = JSON.parse(await readFile(join(ROOT, 'brand', 'scout.json'), 'utf8')) as ScoutConfig;

  // Candidates found on earlier runs are checked a few at a time.
  const ref = db?.collection(COLLECTIONS.health).doc('scout');
  const prev = ref ? (await ref.get()).data() ?? {} : {};
  const known = new Map<string, { checkedAt: number; status: string }>(Object.entries(prev.candidates ?? {}));
  const watched = new Set(cfg.watch.map(w => w.handle.toLowerCase()));
  const queue = [...known.entries()].filter(([, c]) => c.status === 'new').map(([h]) => h).slice(0, cfg.maxCandidatesPerRun);

  const entries: ScoutEntry[] = [];
  const unreadable: string[] = [];
  const captions: string[] = [];
  const read = async (handle: string, kind: string) => {
    try {
      const account = await businessDiscovery(token, igUserId, handle);
      captions.push(...account.media.map(m => m.caption));
      entries.push(summarize(account, kind, now));
      return true;
    } catch (e: any) {
      // A token problem stops the run; a personal or unknown account is just skipped.
      if (e.code === 190 || e.code === 10 || e.code === 200) throw e;
      unreadable.push(`@${handle} (${e instanceof Error ? e.message.replace(/^Instagram: /, '') : e})`);
      return false;
    }
  };

  for (const w of cfg.watch) await read(w.handle, w.kind);
  for (const h of queue) {
    const ok = await read(h, 'candidate');
    known.set(h, { checkedAt: now, status: ok ? 'checked' : 'unreadable' });
  }
  for (const h of creditedHandles(captions, [...watched, ...known.keys(), 'calgarydaily'])) known.set(h, { checkedAt: 0, status: 'new' });

  const ranked = rank(entries);
  const activeCandidates = ranked.filter(e => e.kind === 'candidate' && e.active);
  log(`scout: read ${entries.length} accounts, ${ranked.filter(e => e.active).length} active; ${unreadable.length} unreadable; ${[...known.values()].filter(c => c.status === 'new').length} candidates waiting.`);
  for (const e of ranked.slice(0, 20)) {
    log(`  @${e.handle} [${e.kind}] ${e.active ? 'active' : `quiet ${e.daysSinceLastPost ?? '?'}d`} · ${e.followers} followers · ${e.posts30} posts/30d · median ${e.medianEngagement} likes+comments (${e.engagementRate}%) · ${Math.round(e.reelShare * 100)}% Reels${e.top ? ` · best: ${e.top.permalink}` : ''}`);
  }
  if (activeCandidates.length) log(`scout: creator leads for the Bench: ${activeCandidates.map(e => '@' + e.handle).join(', ')}`);
  for (const u of unreadable) log(`  unreadable: ${u}`);

  if (ref) {
    await ref.set({
      updatedAt: now,
      accounts: ranked,
      unreadable,
      candidates: Object.fromEntries(known),
    });
  }
}
