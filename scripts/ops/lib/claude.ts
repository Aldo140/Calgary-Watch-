// The only place the operations agent talks to Claude. Every call is a single
// structured request: facts in, JSON out. Nothing here can publish or send.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { ReplyClass } from '../../../src/types/ops';
import type { BrandKit, OutreachConfig } from './brand';
import { CLAIM_RULES, NO_CLAIM, claimFactsText, type ClaimFacts } from './claimFacts';

const MODEL = 'claude-opus-5';

let client: Anthropic | null = null;
export const claudeConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
function anthropic(): Anthropic {
  // Keys created outside a workspace must name one on every request.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  client ??= new Anthropic(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {});
  return client;
}

// Spend metering. Anthropic has no balance API, so every call's usage is
// priced here and written to ops_usage/{day} at the end of each run
// (flushUsage), which is what the HQ dashboard's Money tab reads.
// USD per million tokens: [input, output]. Cache reads cost a tenth of input,
// cache writes 1.25x.
const PRICES: Record<string, [number, number]> = {
  'claude-fable-5-1': [10, 50], 'claude-fable-5': [10, 50],
  'claude-opus-5-5': [4, 20], 'claude-opus-5': [5, 25], 'claude-opus-4-8': [5, 25],
  'claude-sonnet-5-5': [2, 10], 'claude-sonnet-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5],
};
export interface UsageTally { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; usd: number }
const usage = new Map<string, UsageTally>();

export function priceUsage(model: string, u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const [inp, out] = PRICES[model] ?? PRICES[MODEL];
  const read = u.cache_read_input_tokens ?? 0, write = u.cache_creation_input_tokens ?? 0;
  return ((u.input_tokens ?? 0) * inp + (u.output_tokens ?? 0) * out + read * inp * 0.1 + write * inp * 1.25) / 1_000_000;
}

function record(task: string, model: string, u: Parameters<typeof priceUsage>[1]) {
  const t = usage.get(task) ?? { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, usd: 0 };
  t.calls += 1;
  t.inputTokens += u.input_tokens ?? 0;
  t.outputTokens += u.output_tokens ?? 0;
  t.cacheReadTokens += u.cache_read_input_tokens ?? 0;
  t.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
  t.usd += priceUsage(model, u);
  usage.set(task, t);
}

/** This run's Claude usage by task, emptied once read. */
export function takeUsage(): Map<string, UsageTally> {
  const out = new Map(usage);
  usage.clear();
  return out;
}

/** Half of an emoji (a lone surrogate, e.g. from cutting a caption mid-emoji) makes the request body invalid JSON. */
export const wellFormed = (text: string) => text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');

async function structured<T extends z.ZodType>(system: string, user: string, schema: T, task = 'other', maxTokens = 4000): Promise<z.infer<T>> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
    system: wellFormed(system),
    messages: [{ role: 'user', content: wellFormed(user) }],
  });
  record(task, response.model ?? MODEL, response.usage ?? {});
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to draft this item.');
  if (response.stop_reason === 'max_tokens') throw new Error('Draft was cut off (max_tokens).');
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('Draft did not match the expected format.');
  return parsed as z.infer<T>;
}

const PostSchema = z.object({
  caption: z.string().describe('Instagram caption. First line is the hook. Ends with the hashtags.'),
  altText: z.string().describe('Plain description of the image text for screen readers, under 250 characters.'),
  headline: z.string().describe('Roundups: the plain opening line printed under the headline, sentence case, under 60 characters, no date, no exclamation mark (e.g. "A few things on tonight."). Other posts: headline printed on the image, sentence case, under 48 characters.'),
  itemLabels: z.array(z.string()).describe('Roundups only: a short name (max 28 characters) for each item, in the given order. Empty for single posts.'),
});
export type PostWriting = z.infer<typeof PostSchema>;

export async function writePost(kit: BrandKit, input: { kind: string; title: string; facts: string; link: string; sponsored: boolean }, guidance: { playbook?: string | null; direction?: string | null; notes?: string | null } = {}): Promise<PostWriting> {
  const system = [
    `You write Instagram posts for ${kit.name} (@${kit.handle}), a Calgary account. Your job is to grow it: every post has to earn a stop, a save or a share from Calgarians, using only true facts.`,
    guidance.playbook ? `The account's playbook (the owner's rules; follow it):\n${guidance.playbook}` : '',
    guidance.direction ? `This week's direction from the content plan:\n${guidance.direction}` : '',
    guidance.notes ? `Aldo's standing notes (he owns the account; follow them unless they'd break a fact or a rule above):\n${guidance.notes}` : '',
    `Voice: ${kit.voice.summary}`,
    `Rules:\n- ${kit.voice.rules.join('\n- ')}`,
    `Never use these phrases: ${kit.voice.bannedPhrases.join(', ')}.`,
    `Examples of the voice:\n${kit.voice.examples.map(e => `> ${e}`).join('\n')}`,
    'Use only the facts in the user message. If a detail is not there, leave it out. Do not guess times, prices or who is performing.',
    'Write like a person who lives in Calgary, not a brand: plain words, sentence case, no hype, no exclamation marks. The first line is the hook. Use the name people would say ("Maria Bamford", not "Outback Presents Maria Bamford").',
    'Say "link in bio" rather than pasting URLs; Instagram captions do not make links clickable.',
    `End the caption with at most 5 hashtags, always including ${kit.hashtags.join(' ')}.`,
  ].filter(Boolean).join('\n\n');
  const user = [
    `Post type: ${input.kind}${input.sponsored ? ' (PAID: the first line must start with "Featured partner")' : ''}`,
    `Working title: ${input.title}`,
    `Facts:\n${input.facts}`,
  ].join('\n\n');
  return structured(system, user, PostSchema, 'posts');
}

const BriefSchema = z.object({
  usable: z.boolean().describe('False if the page has no clear, current, Calgary-relevant facts to post.'),
  reason: z.string().describe('One sentence on why it is or is not usable.'),
  facts: z.string().describe('The key facts from the page as short plain lines: what, when, where, who said it. Only what the page states.'),
  title: z.string().describe('A plain working title.'),
  sensitive: z.boolean().describe('True for crime, collisions, fires, deaths, emergencies or anything about a private individual.'),
});

/** For CalgaryDaily briefs: pull checkable facts out of a source page. */
export async function extractBrief(pageText: string, url: string, note: string) {
  return structured(
    'You extract facts from a Calgary news or public-information page for a local Instagram account. Report only what the page states. Mark sensitive stories.',
    `Source URL: ${url}\nEditor's note: ${note || '(none)'}\n\nPage text:\n${pageText.slice(0, 40_000)}`,
    BriefSchema,
    'briefs',
  );
}

const PitchSchema = z.object({
  subject: z.string().describe('Plain, specific subject line under 70 characters. No hype.'),
  body: z.string().describe('The email body in plain text, 90 to 170 words, signed off with the sender block given.'),
  reasonRelevant: z.string().describe('One sentence: why this message is relevant to the recipient in their business role.'),
});

export async function writePitch(cfg: OutreachConfig, lead: { businessName: string; category: string; neighbourhood: string; facts: string; followUp: boolean; previous?: string; claim?: ClaimFacts }, signature: string) {
  const offer = cfg.paidOfferEnabled ? [...cfg.offer, ...cfg.paidOffer] : cfg.offer;
  const system = [
    `You write short, personal business emails for ${cfg.sender.name}, ${cfg.sender.title}.`,
    'CalgaryWatch is a free Calgary guide to events, markets, local businesses and neighbourhoods, with every listing checked against the organizer\'s own page.',
    `What we can offer (only offer these, word them naturally):\n- ${offer.join('\n- ')}`,
    cfg.paidOfferEnabled ? 'A paid placement may be mentioned once, as optional, and must be described as labelled.' : 'Do not mention prices, paid placement, advertising or sponsorship at all.',
    'Rules: one specific reason we are writing to this business, taken from the facts. No flattery, no claims about traffic or audience size, no urgency, no invented details. Ask one easy question. Plain text, no bullet lists.',
    CLAIM_RULES,
    `The body must end with exactly this sign-off and nothing after it:\n${signature}`,
  ].join('\n\n');
  const claim = `Claim facts:\n${claimFactsText(lead.claim ?? NO_CLAIM)}`;
  const user = lead.followUp
    ? `Write a brief, polite follow-up (under 80 words) to an unanswered email.\nBusiness: ${lead.businessName}\nPrevious email:\n${lead.previous ?? ''}\n\n${claim}`
    : `Business: ${lead.businessName}\nCategory: ${lead.category}\nNeighbourhood: ${lead.neighbourhood}\nWhat CalgaryWatch already lists about them:\n${lead.facts}\n\n${claim}`;
  return structured(system, user, PitchSchema, 'outreach');
}

const ReplySchema = z.object({
  classification: z.enum(['interested', 'question', 'not-now', 'stop', 'auto-reply', 'other']),
  summary: z.string().describe('One sentence summary of what they said.'),
  suggestedSubject: z.string(),
  suggestedBody: z.string().describe('A short reply for the founder to approve, signed with the given sign-off. Empty for stop and auto-reply.'),
});

export async function classifyReply(cfg: OutreachConfig, input: { businessName: string; ourEmail: string; theirReply: string; claim?: ClaimFacts }, signature: string): Promise<{ classification: ReplyClass; summary: string; suggestedSubject: string; suggestedBody: string }> {
  return structured(
    [
      `You help ${cfg.sender.name} at CalgaryWatch handle replies from local businesses.`,
      'Classify the reply. "stop" means any request not to be contacted again, however polite. "auto-reply" is an out-of-office or ticket acknowledgement.',
      `Draft a helpful response only from what CalgaryWatch actually offers:\n- ${(cfg.paidOfferEnabled ? [...cfg.offer, ...cfg.paidOffer] : cfg.offer).join('\n- ')}`,
      cfg.paidOfferEnabled ? '' : 'If they ask about price or advertising, say paid options are not open yet and offer to let them know when they are.',
      CLAIM_RULES,
      `Sign off with:\n${signature}`,
    ].filter(Boolean).join('\n\n'),
    `Business: ${input.businessName}\n\nClaim facts:\n${claimFactsText(input.claim ?? NO_CLAIM)}\n\nOur email:\n${input.ourEmail}\n\nTheir reply:\n${input.theirReply.slice(0, 8000)}`,
    ReplySchema,
    'replies',
  );
}

const InspirationSchema = z.object({
  patterns: z.array(z.object({
    title: z.string().describe('The pattern in a few words, e.g. "Weather as a shared moment".'),
    why: z.string().describe('One or two sentences: what these posts do that works, based only on the captions, formats and numbers given.'),
    examples: z.array(z.string()).describe('Permalinks of the posts that show it, from the list given.'),
  })).describe('3 to 5 patterns across the outperforming posts.'),
  ideas: z.array(z.object({
    title: z.string().describe('A concrete post idea for @calgarydaily.'),
    format: z.enum(['Reel', 'Carousel', 'Single image', 'Story']),
    hook: z.string().describe('The first line or on-screen text, in the CalgaryDaily voice.'),
    why: z.string().describe('Which pattern it borrows and why it suits CalgaryDaily.'),
  })).describe('3 to 5 original ideas inspired by the patterns. Never copy another account\'s post; repost only with credit and permission.'),
});
export type InspirationAnalysis = z.infer<typeof InspirationSchema>;

/** What's working on other Calgary accounts, and what CalgaryDaily could make from it. */
export async function analyzeInspiration(posts: Array<{ handle: string; permalink: string; caption: string; reel: boolean; engagement: number; lift: number }>): Promise<InspirationAnalysis> {
  return structured(
    [
      'You are the content strategist for @calgarydaily, a Calgary news and events Instagram account (4,300 followers) whose own credited Reels get a median of about 2,500 views while its static event cards get about 40.',
      'You are given the posts from other Calgary accounts that did best against their own usual in the last 30 days. Find what they have in common and turn it into original ideas for CalgaryDaily.',
      'Base every claim on the captions, formats and numbers given. Do not guess what is in a video. Ideas must be original or a credited repost with permission, never a copy.',
    ].join('\n\n'),
    posts.map((p, i) => `${i + 1}. @${p.handle} · ${p.reel ? 'Reel' : 'Post'} · ${p.engagement} likes+comments · ${p.lift}x its usual · ${p.permalink}\n${p.caption}`).join('\n\n'),
    InspirationSchema,
    'inspiration',
  );
}

const PlanSchema = z.object({
  direction: z.string().describe('Notes to the caption writer for this week, 3 to 6 short sentences: what to lean into, what to avoid, which hooks and angles fit, based only on the numbers, the playbook and the listings given.'),
  plan: z.array(z.object({
    date: z.string().describe('YYYY-MM-DD, within the next 7 days.'),
    slot: z.string().describe('HH:mm, one of the posting slots given.'),
    pillar: z.enum(['Things to do', 'Calgary moments', 'City news', 'Local and relatable']),
    format: z.enum(['Reel', 'Carousel', 'Single image', 'Story']),
    idea: z.string().describe('What the post is, in one sentence.'),
    hook: z.string().describe('The first line of the caption or on-screen text, sentence case, true to the facts given.'),
    asset: z.enum(['listing photo', 'creator clip', 'clip to shoot', 'our photo', 'text only']).describe('What it shows. "listing photo" only for a listing marked as having a photo.'),
    listing: z.string().describe('For a listing post: the listing title exactly as given. Otherwise an empty string.'),
  })).describe('The week ahead, 14 to 25 posts, following the playbook\'s mix. Use listings that have photos for "Things to do".'),
  shootList: z.array(z.object({
    what: z.string().describe('A 5 to 15 second phone clip Aldo could film, e.g. "First snow on the Peace Bridge".'),
    where: z.string(),
    when: z.string().describe('When to film it, e.g. "Thursday around sunset".'),
    why: z.string().describe('One sentence: why it would do well, from the numbers or patterns given.'),
  })).describe('2 to 5 clips worth shooting this week.'),
  outreach: z.array(z.object({
    handle: z.string().describe('An Instagram handle from the creators list given, without @.'),
    postUrl: z.string().describe('The permalink of their post we would like to share, from the list given, or an empty string to ask in general.'),
    why: z.string().describe('One sentence for Aldo: why this creator and this clip.'),
    dm: z.string().describe('The direct message asking permission to share their clip as a Reel with credit and a tag, in a friendly, short, personal voice (under 450 characters). Mention the specific clip. Never pushy, never promise money or reach numbers.'),
  })).describe('Up to 5 permission requests to creators. Only handles from the creators list.'),
});
export type ContentPlan = z.infer<typeof PlanSchema>;

/** The coordinator: the week's plan, the writer's direction, clips to shoot and creators to ask, from the numbers and the playbook. */
export async function planWeek(input: { playbook: string; notes: string | null; numbers: string; inspiration: string; creators: string; listings: string; slots: string[]; today: string }): Promise<ContentPlan> {
  return structured(
    [
      'You are the social media coordinator for @calgarydaily, a Calgary Instagram account with about 4,300 followers. Your goal is reach and follower growth: posts Calgarians stop on, save and share.',
      `The owner's playbook (follow it):\n${input.playbook}`,
      input.notes ? `Aldo's latest notes from his phone (newest first; they win over the playbook where they differ):\n${input.notes}` : '',
      'Base every claim on the numbers, patterns and listings given. Never invent events, times, prices or creators. Ideas must be original, or a creator\'s clip shared only after they say yes (that is what the outreach DMs are for).',
      'The bot cannot comment on other accounts or send DMs itself; Aldo sends the outreach DMs by hand from the app.',
    ].filter(Boolean).join('\n\n'),
    [
      `Today: ${input.today}. Posting slots: ${input.slots.join(', ')}.`,
      `Our numbers:\n${input.numbers}`,
      `What is working on other Calgary accounts:\n${input.inspiration}`,
      `Creators we could ask (handle · followers · their post that did best):\n${input.creators || '(none found yet)'}`,
      `Listings in the next 7 days:\n${input.listings}`,
    ].join('\n\n'),
    PlanSchema,
    'coordinator',
    12000,
  );
}
