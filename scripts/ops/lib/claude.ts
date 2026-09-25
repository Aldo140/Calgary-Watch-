// The only place the operations agent talks to Claude. Every call is a single
// structured request: facts in, JSON out. Nothing here can publish or send.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { ReplyClass } from '../../../src/types/ops';
import type { BrandKit, OutreachConfig } from './brand';

const MODEL = 'claude-opus-5';

let client: Anthropic | null = null;
export const claudeConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

async function structured<T extends z.ZodType>(system: string, user: string, schema: T): Promise<z.infer<T>> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to draft this item.');
  if (response.stop_reason === 'max_tokens') throw new Error('Draft was cut off (max_tokens).');
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('Draft did not match the expected format.');
  return parsed as z.infer<T>;
}

const PostSchema = z.object({
  caption: z.string().describe('Instagram caption. First line is the hook. Ends with the hashtags.'),
  altText: z.string().describe('Plain description of the image text for screen readers, under 250 characters.'),
  headline: z.string().describe('Headline printed on the image, under 48 characters.'),
  itemLabels: z.array(z.string()).describe('Roundups only: a short name (max 28 characters) for each item, in the given order. Empty for single posts.'),
});
export type PostWriting = z.infer<typeof PostSchema>;

export async function writePost(kit: BrandKit, input: { kind: string; title: string; facts: string; link: string; sponsored: boolean }): Promise<PostWriting> {
  const system = [
    `You write Instagram posts for ${kit.name} (@${kit.handle}), a Calgary account.`,
    `Voice: ${kit.voice.summary}`,
    `Rules:\n- ${kit.voice.rules.join('\n- ')}`,
    `Never use these phrases: ${kit.voice.bannedPhrases.join(', ')}.`,
    `Examples of the voice:\n${kit.voice.examples.map(e => `> ${e}`).join('\n')}`,
    'Use only the facts in the user message. If a detail is not there, leave it out. Do not guess times, prices or who is performing.',
    'Say "link in bio" rather than pasting URLs; Instagram captions do not make links clickable.',
    `End the caption with at most 5 hashtags, always including ${kit.hashtags.join(' ')}.`,
  ].join('\n\n');
  const user = [
    `Post type: ${input.kind}${input.sponsored ? ' (PAID: the first line must start with "Featured partner")' : ''}`,
    `Working title: ${input.title}`,
    `Facts:\n${input.facts}`,
  ].join('\n\n');
  return structured(system, user, PostSchema);
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
  );
}

const PitchSchema = z.object({
  subject: z.string().describe('Plain, specific subject line under 70 characters. No hype.'),
  body: z.string().describe('The email body in plain text, 90 to 170 words, signed off with the sender block given.'),
  reasonRelevant: z.string().describe('One sentence: why this message is relevant to the recipient in their business role.'),
});

export async function writePitch(cfg: OutreachConfig, lead: { businessName: string; category: string; neighbourhood: string; facts: string; followUp: boolean; previous?: string }, signature: string) {
  const offer = cfg.paidOfferEnabled ? [...cfg.offer, ...cfg.paidOffer] : cfg.offer;
  const system = [
    `You write short, personal business emails for ${cfg.sender.name}, ${cfg.sender.title}.`,
    'CalgaryWatch is a free Calgary guide to events, markets, local businesses and neighbourhoods, with every listing checked against the organizer\'s own page.',
    `What we can offer (only offer these, word them naturally):\n- ${offer.join('\n- ')}`,
    cfg.paidOfferEnabled ? 'A paid placement may be mentioned once, as optional, and must be described as labelled.' : 'Do not mention prices, paid placement, advertising or sponsorship at all.',
    'Rules: one specific reason we are writing to this business, taken from the facts. No flattery, no claims about traffic or audience size, no urgency, no invented details. Ask one easy question. Plain text, no bullet lists.',
    `The body must end with exactly this sign-off and nothing after it:\n${signature}`,
  ].join('\n\n');
  const user = lead.followUp
    ? `Write a brief, polite follow-up (under 80 words) to an unanswered email.\nBusiness: ${lead.businessName}\nPrevious email:\n${lead.previous ?? ''}`
    : `Business: ${lead.businessName}\nCategory: ${lead.category}\nNeighbourhood: ${lead.neighbourhood}\nWhat CalgaryWatch already lists about them:\n${lead.facts}`;
  return structured(system, user, PitchSchema);
}

const ReplySchema = z.object({
  classification: z.enum(['interested', 'question', 'not-now', 'stop', 'auto-reply', 'other']),
  summary: z.string().describe('One sentence summary of what they said.'),
  suggestedSubject: z.string(),
  suggestedBody: z.string().describe('A short reply for the founder to approve, signed with the given sign-off. Empty for stop and auto-reply.'),
});

export async function classifyReply(cfg: OutreachConfig, input: { businessName: string; ourEmail: string; theirReply: string }, signature: string): Promise<{ classification: ReplyClass; summary: string; suggestedSubject: string; suggestedBody: string }> {
  return structured(
    [
      `You help ${cfg.sender.name} at CalgaryWatch handle replies from local businesses.`,
      'Classify the reply. "stop" means any request not to be contacted again, however polite. "auto-reply" is an out-of-office or ticket acknowledgement.',
      `Draft a helpful response only from what CalgaryWatch actually offers:\n- ${(cfg.paidOfferEnabled ? [...cfg.offer, ...cfg.paidOffer] : cfg.offer).join('\n- ')}`,
      cfg.paidOfferEnabled ? '' : 'If they ask about price or advertising, say paid options are not open yet and offer to let them know when they are.',
      `Sign off with:\n${signature}`,
    ].filter(Boolean).join('\n\n'),
    `Business: ${input.businessName}\n\nOur email:\n${input.ourEmail}\n\nTheir reply:\n${input.theirReply.slice(0, 8000)}`,
    ReplySchema,
  );
}
