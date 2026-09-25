import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrandId } from '../../../src/types/ops.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface BrandKit {
  id: BrandId;
  name: string;
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
export const BRANDS: BrandId[] = ['calgarywatch', 'calgarydaily'];
