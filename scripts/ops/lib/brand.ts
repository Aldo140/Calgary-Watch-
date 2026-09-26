import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrandId } from '../../../src/types/ops.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface BrandKit {
  id: BrandId;
  name: string;
  /** false = the agent never drafts or publishes for this account (templates and previews still work). */
  enabled?: boolean;
  confirmed: boolean;
  confirmNote?: string;
  site: string;
  handle: string;
  wordmark: string;
  colors: Record<'background' | 'surface' | 'ink' | 'muted' | 'line' | 'brand' | 'live' | 'onLive', string>;
  voice: { summary: string; examples: string[]; rules: string[]; bannedPhrases: string[] };
  hashtags: string[];
  linkInBio: string;
  autoPublish: Record<'events' | 'markets' | 'roundups' | 'partner' | 'incidents', boolean>;
  postsPerDay: number;
  postingSlots: string[];
}

export interface OutreachConfig {
  sender: { name: string; title: string; mailbox: string; site: string };
  paidOfferEnabled: boolean;
  /** true = drafts that pass every rule are approved automatically and sent in the next window. */
  autoSend?: boolean;
  offer: string[];
  paidOffer: string[];
  limits: {
    sendsPerDay: number;
    sendWindowLocal: [string, string];
    sendDays: number[];
    followUpAfterDays: number;
    maxFollowUps: number;
  };
  unsubscribeLine: string;
  noSolicitationPatterns: string[];
}

const cache = new Map<string, unknown>();
function load<T>(file: string): T {
  if (!cache.has(file)) cache.set(file, JSON.parse(readFileSync(join(ROOT, 'brand', file), 'utf8')));
  return cache.get(file) as T;
}

export const brandKit = (id: BrandId): BrandKit => load<BrandKit>(`${id}.json`);
export const outreachConfig = (): OutreachConfig => load<OutreachConfig>('outreach.json');
export const ALL_BRANDS: BrandId[] = ['calgarywatch', 'calgarydaily'];
/** Accounts the agent posts for. CalgaryWatch has no Instagram of its own; @calgarydaily is its sister account. */
export const BRANDS: BrandId[] = ALL_BRANDS.filter(b => brandKit(b).enabled !== false);
