/**
 * What outreach may truthfully say about claiming a listing, as structured
 * facts. The template line, the Claude prompts and the final check all read
 * these, so no email invites a claim that can't happen or promises a benefit
 * that isn't built. Rules: docs/verified-listings.md.
 *
 *  - Claiming is offered only for a real, published CalgaryWatch listing that
 *    the lead points at, through its own /claim/{entityId} page.
 *  - The verified-visibility benefit is mentioned only when the listing is the
 *    organization itself (a business or market), not yet verified, and the
 *    ranking weight is switched on (VERIFICATION_PRIORITY_ENABLED). Never for
 *    prospects, service-directory invitations, or an organizer whose only
 *    listing is one of its events.
 *  - A verified (approved-claim) listing is never asked to claim again.
 */

import { createHash } from 'node:crypto';
import type { PartnerLead } from '../../../src/types/ops';
import { VERIFICATION_PRIORITY_ENABLED } from '../../../src/lib/verified';
import { LEAD_KINDS } from './leads';
import type { Entity } from './posts';

export const CLAIM_BASE = 'https://calgarywatch.ca/claim/';

export interface ClaimFacts {
  /** The lead points at a real, published listing in the current index. */
  hasPublishedEntity: boolean;
  /** That listing is the organization itself (business or market), not one of its events. */
  organizationListed: boolean;
  /** There is a direct claim page and nobody has been approved for it yet. */
  claimable: boolean;
  /** The direct claim page, only when claimable. */
  claimUrl: string | null;
  claimStatus: 'verified' | 'unclaimed' | 'not-claimable';
  /** An admin approved a claim for this listing. */
  verified: boolean;
  /** We may say verified listings are marked and given more priority. */
  verificationBenefitEnabled: boolean;
}

/** No listing to claim: what a prospect or service invitation gets. */
export const NO_CLAIM: ClaimFacts = {
  hasPublishedEntity: false, organizationListed: false, claimable: false, claimUrl: null,
  claimStatus: 'not-claimable', verified: false, verificationBenefitEnabled: false,
};

export const claimUrlFor = (entityId: string) => `${CLAIM_BASE}${encodeURIComponent(entityId)}`;

export function claimFactsFor(
  lead: Pick<PartnerLead, 'entityId' | 'entityKind' | 'status'>,
  entity: Entity | undefined,
  verifiedIds: ReadonlySet<string> = new Set(),
): ClaimFacts {
  const hasPublishedEntity = Boolean(lead.entityId && entity && entity.id === lead.entityId
    && entity.status === 'published' && !entity.fixture && !entity.developmentOnly);
  const verified = hasPublishedEntity && (verifiedIds.has(entity!.id) || Boolean(entity!.ownerVerifiedAt) || lead.status === 'claimed');
  const claimable = hasPublishedEntity && !verified;
  const organizationListed = hasPublishedEntity && LEAD_KINDS.has(entity!.kind) && lead.entityKind !== 'organizer' && lead.entityKind !== 'prospect';
  return {
    hasPublishedEntity,
    organizationListed,
    claimable,
    claimUrl: claimable ? claimUrlFor(entity!.id) : null,
    claimStatus: verified ? 'verified' : claimable ? 'unclaimed' : 'not-claimable',
    verified,
    verificationBenefitEnabled: claimable && organizationListed && VERIFICATION_PRIORITY_ENABLED,
  };
}

/** The facts as plain lines for a Claude prompt. */
export function claimFactsText(f: ClaimFacts): string {
  return [
    `hasPublishedEntity: ${f.hasPublishedEntity}`,
    `claimable: ${f.claimable}`,
    `claimUrl: ${f.claimUrl ?? 'none'}`,
    `claimStatus: ${f.claimStatus}`,
    `verified: ${f.verified}`,
    `verificationBenefitEnabled: ${f.verificationBenefitEnabled}`,
  ].join('\n');
}

/** Rules for any Claude prompt that writes to an organization. */
export const CLAIM_RULES = [
  'Claim facts are given below. Follow them exactly:',
  '- Only invite them to claim the listing if claimable is true. If you do, use exactly claimUrl and no other claim link. Never invent or alter a link. You may also leave it out; the claim line is added for you.',
  '- Only mention the verified benefit if verificationBenefitEnabled is true. Then say it plainly: once verified, the listing is marked as verified on CalgaryWatch, and verified organizations get more weight or priority when we surface relevant recommendations and listings. Nothing more.',
  '- Never promise or imply guaranteed ranking, top ranking, guaranteed placement, always being shown first, guaranteed traffic or being featured everywhere.',
  '- Never say the listing is verified or claimed unless verified is true. If verified is true, do not ask them to claim it.',
].join('\n');

/**
 * Ways to say the claim line. Same meaning every time; the wording varies by
 * lead so a run of emails doesn't repeat one sentence.
 */
const BENEFIT_LINES: ReadonlyArray<(url: string) => string> = [
  url => `You can also claim the listing for free and send changes directly. Once it's verified, it'll be marked as verified on CalgaryWatch, and verified organizations are given more priority when we surface relevant recommendations and listings across the site: ${url}`,
  url => `Prefer to keep it up to date yourself? Claiming the listing is free, and it also gives it a verified status. We give verified organizations more weight when deciding what to surface in relevant CalgaryWatch recommendations, so there's a visibility benefit too: ${url}`,
  url => `If you'd like to manage it yourself, you can claim it for free. Once you're verified, the listing shows it's been confirmed by your organization, and we give verified listings more weight when choosing which organizations to surface across CalgaryWatch: ${url}`,
];
const PLAIN_LINE = (url: string) => `Prefer to keep it up to date yourself? You can claim the listing for free and send changes directly: ${url}`;

function pick<T>(list: readonly T[], seed: string): T {
  return list[parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16) % list.length];
}

/** The claim line for these facts, or null when no claim should be offered. */
export function claimLine(f: ClaimFacts, seed = ''): string | null {
  if (!f.claimable || !f.claimUrl) return null;
  return f.verificationBenefitEnabled ? pick(BENEFIT_LINES, seed || f.claimUrl)(f.claimUrl) : PLAIN_LINE(f.claimUrl);
}

const GUARANTEE = /guarantee[sd]?\b[^.\n]{0,60}\b(rank|placement|top|traffic|visib|spot|position|exposure|first)|\b(top|#1|number[- ]one) (ranking|placement|spot|position)\b|always (be )?(shown|appear(s|ing)?|listed|ranked) (first|at the top|on top)|featured everywhere/i;
const CLAIM_LINK = /calgarywatch\.ca\/claim\/[^\s)>"'\]]*/gi;
const BENEFIT = /\bverifi(ed|cation)\b[^.\n]{0,160}\b(priorit|more weight|weight|rank|boost|surface|visib|higher|first)|\b(priorit|more weight|rank|boost|visib)[^.\n]{0,80}\bverified\b/i;
const SAYS_VERIFIED = /\b(your|the) (listing|page|organi[sz]ation) (is|has been) (now )?(already )?(verified|claimed)\b|\byou(?:'re| are) (already|now) (verified|claimed)\b/i;

/** Ranking promises CalgaryWatch never makes, whatever the facts. */
export function guaranteeProblems(body: string): string[] {
  return GUARANTEE.test(body) ? ['Promises guaranteed ranking, placement or traffic.'] : [];
}

/** Everything a message says about claiming and verification that the facts don't support. */
export function claimLanguageProblems(body: string, f: ClaimFacts): string[] {
  const problems = guaranteeProblems(body);
  const links = [...body.matchAll(CLAIM_LINK)].map(m => `https://${m[0].replace(/[.,;:!?]+$/, '')}`);
  if (links.length && !f.claimable) problems.push('Offers a claim link for a listing that is not claimable.');
  else if (links.some(l => l !== f.claimUrl)) problems.push('Uses a claim link other than the listing’s own claim page.');
  if (BENEFIT.test(body) && !f.verificationBenefitEnabled) problems.push('Mentions verified priority where it does not apply.');
  if (SAYS_VERIFIED.test(body) && !f.verified) problems.push('Says the listing is verified when it is not.');
  return problems;
}
