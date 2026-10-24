import {profileIdentityProblems} from './profileIdentity';
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
 *  - The claim link is personal when the lead has a contact address: the claim
 *    page greets them and makes their organizer account with that email
 *    (src/lib/claimInvite.ts). The plain link for the same listing stays valid.
 */

import { createHash } from 'node:crypto';
import type { PartnerLead } from '../../../src/types/ops';
import { VERIFICATION_PRIORITY_ENABLED } from '../../../src/lib/verified';
import { LEAD_KINDS } from './leads';
import { INVITE_PARAM, decodeInvite, personalClaimUrl } from '../../../src/lib/claimInvite';
import type { Entity } from './posts';

export const CLAIM_BASE = 'https://calgarywatch.ca/claim/';

export interface ClaimFacts {
  profileIdentity?:{recipientOrganization:string;entity:{id:string;kind:string;title:string;slug:string;name?:string;status?:string};publicUrl:string;problems:string[]};
  /** The listing the lead points at, when it is published. */
  entityId: string | null;
  /** That listing's kind (business, market, event), when published. */
  entityKind: string | null;
  /** The lead points at a real, published listing in the current index. */
  hasPublishedEntity: boolean;
  /** That listing is the organization itself (business or market), not one of its events. */
  organizationListed: boolean;
  /** There is a direct claim page and nobody has been approved for it yet. */
  claimable: boolean;
  /** The direct claim page, only when claimable; personal (`?invite=`) when we know who it's for. */
  claimUrl: string | null;
  claimStatus: 'verified' | 'unclaimed' | 'not-claimable';
  /** An admin approved a claim for this listing. */
  verified: boolean;
  /** We may say verified listings are marked and given more priority. */
  verificationBenefitEnabled: boolean;
}

/** No listing to claim: what a prospect or service invitation gets. */
export const NO_CLAIM: ClaimFacts = {
  entityId: null, entityKind: null, hasPublishedEntity: false, organizationListed: false, claimable: false, claimUrl: null,
  claimStatus: 'not-claimable', verified: false, verificationBenefitEnabled: false,
};

export const claimUrlFor = (entityId: string) => `${CLAIM_BASE}${encodeURIComponent(entityId)}`;

/**
 * The listing's claim page, carrying who the email goes to. A role inbox
 * (info@) still gets the address; only a real contact name turns into a
 * first-name greeting. The page already knows the organization, so the
 * link leaves it out and stays shorter.
 */
export function personalClaimUrlFor(entityId: string, lead: { contactEmail?: string | null; contactName?: string | null }, via = 'outreach'): string {
  if (!lead.contactEmail) return claimUrlFor(entityId);
  return personalClaimUrl(entityId, { email: lead.contactEmail, name: lead.contactName ?? undefined, via });
}

/** A link is this listing's claim page: the plain URL, or it with a well-formed invitation and nothing else. */
export function isClaimPageFor(link: string, claimUrl: string): boolean {
  try {
    const url = new URL(link); const want = new URL(claimUrl);
    if (url.origin !== want.origin || url.pathname !== want.pathname || url.hash || url.username || url.password) return false;
    const keys = [...url.searchParams.keys()];
    return !keys.length || (keys.length === 1 && keys[0] === INVITE_PARAM && decodeInvite(url.searchParams.get(INVITE_PARAM)) !== null);
  } catch { return false; }
}

export function claimFactsFor(
  lead: Pick<PartnerLead, 'entityId' | 'entityKind' | 'status'> & {businessName?:string;contactEmail?:string|null;contactName?:string|null},
  entity: Entity | undefined,
  verifiedIds: ReadonlySet<string> = new Set(),
): ClaimFacts {
  const hasPublishedEntity = Boolean(lead.entityId && entity && entity.id === lead.entityId
    && entity.status === 'published' && !entity.fixture && !entity.developmentOnly);
  const verified = hasPublishedEntity && (verifiedIds.has(entity!.id) || Boolean(entity!.ownerVerifiedAt));
  const publicUrl=entity?`https://calgarywatch.ca/${entity.kind==='business'?'local':'markets'}/${entity.slug}`:'';
  const profileIdentity=entity&&['business','market'].includes(entity.kind)?{recipientOrganization:lead.businessName??'',entity,publicUrl,problems:profileIdentityProblems({recipientOrganization:lead.businessName??'',entity,profileUrl:publicUrl,claimUrl:claimUrlFor(entity.id)})}:undefined;
  const claimable = hasPublishedEntity && !verified&&!profileIdentity?.problems.length;
  const organizationListed = hasPublishedEntity && LEAD_KINDS.has(entity!.kind) && lead.entityKind !== 'organizer' && lead.entityKind !== 'prospect';
  return {
    ...(profileIdentity?{profileIdentity}:{}),
    entityId: hasPublishedEntity ? entity!.id : null,
    entityKind: hasPublishedEntity ? entity!.kind : null,
    hasPublishedEntity,
    organizationListed,
    claimable,
    claimUrl: claimable ? personalClaimUrlFor(entity!.id, lead) : null,
    claimStatus: verified ? 'verified' : claimable ? 'unclaimed' : 'not-claimable',
    verified,
    verificationBenefitEnabled: claimable && organizationListed && VERIFICATION_PRIORITY_ENABLED,
  };
}

/** The facts as plain lines for a Claude prompt. */
export function claimFactsText(f: ClaimFacts): string {
  return [
    ...(f.profileIdentity?[`recipientOrganization: ${f.profileIdentity.recipientOrganization}`,`publicProfileUrl: ${f.profileIdentity.problems.length?'BLOCKED':f.profileIdentity.publicUrl}`,`profileIdentityValid: ${!f.profileIdentity.problems.length}`]:[]),
    `hasPublishedEntity: ${f.hasPublishedEntity}`,
    `entityId: ${f.entityId ?? 'none'}`,
    `entityKind: ${f.entityKind ?? 'none'}${f.hasPublishedEntity && !f.organizationListed ? ' (one of their events is listed; the organization itself has no listing)' : ''}`,
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
  '- Organization names, entity IDs, public profile slugs and claim IDs must match the recipient organization. Never substitute another organization’s profile or claim URL.',
  '- Only invite them to claim the listing if claimable is true. If you do, use exactly claimUrl and no other claim link. Never invent or alter a link. You may also leave it out; the claim line is added for you.',
  '- Only mention the verified benefit if verificationBenefitEnabled is true. Then say it plainly: once verified, the listing is marked as verified on CalgaryWatch, and verified organizations get more weight or priority when we surface relevant recommendations and listings. Nothing more.',
  '- Never promise or imply guaranteed ranking, top ranking, guaranteed placement, always being shown first, guaranteed traffic or being featured everywhere.',
  '- Never say the listing is verified or claimed unless verified is true. If verified is true, do not ask them to claim it.',
  '- If hasPublishedEntity is false, nothing about them is listed yet: never say "your listing", "already listed" or "claim your listing".',
  '- If entityKind is event, call it "the event listing"; never imply a permanent listing for the organization exists.',
  '- Never invent or change any of these facts.',
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
const PLAIN_LINE = (url: string, what: string) => `Prefer to keep it up to date yourself? You can claim the ${what} for free and send changes directly: ${url}`;

function pick<T>(list: readonly T[], seed: string): T {
  return list[parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16) % list.length];
}

/** The claim line for these facts, or null when no claim should be offered. */
export function claimLine(f: ClaimFacts, seed = ''): string | null {
  if (!f.claimable || !f.claimUrl) return null;
  if (f.verificationBenefitEnabled) return pick(BENEFIT_LINES, seed || f.claimUrl)(f.claimUrl);
  return PLAIN_LINE(f.claimUrl, f.entityKind === 'event' ? 'event listing' : 'listing');
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
  const organizationLinks=[...body.matchAll(/(?:https?:\/\/(?:www\.)?calgarywatch\.ca)?\/(?:local|markets)\/[a-z0-9%_-]+(?:[?#][^\s<>\"')\]]*)?/gi)].map(m=>m[0].replace(/[.,;:!]+$/,''));
  if(f.profileIdentity){problems.push(...f.profileIdentity.problems);for(const profileUrl of organizationLinks)problems.push(...profileIdentityProblems({recipientOrganization:f.profileIdentity.recipientOrganization,entity:f.profileIdentity.entity,profileUrl,claimUrl:f.claimUrl??undefined}));}
  else if(organizationLinks.length)problems.push('Organization profile URL cannot be matched to the recipient organization.');
  // A claim URL guard alone misses plain false claims in both subjects and bodies.
  const saysListed = /\balready listed\b|\byour (?:CalgaryWatch )?(?:listing|profile)\b|\bwe(?:['’]ve| have)? added\b|\b(?:your profile|your listing) is live\b|\blisted on CalgaryWatch\b|\bclaim your (?:existing )?listing\b/i;
  if (!f.hasPublishedEntity && saysListed.test(body)) problems.push('Claims an existing listing without a published entity.');
  if (f.hasPublishedEntity && f.entityKind === 'event' && body.split(/[.!?\n]/).some(line => saysListed.test(line) && !/\bevent\b/i.test(line))) problems.push('Describes an organization listing when only an event is published.');
  if (f.hasPublishedEntity && !f.organizationListed && /\byour (?:organization|company|business) (?:listing|profile)\b|\byour profile is live\b/i.test(body)) problems.push('An event listing is not an organization profile.');
  const links = [...body.matchAll(CLAIM_LINK)].map(m => `https://${m[0].replace(/[.,;:!?]+$/, '')}`);
  if (links.length && !f.claimable) problems.push('Offers a claim link for a listing that is not claimable.');
  else if (links.some(l => !isClaimPageFor(l, f.claimUrl!))) problems.push('Uses a claim link other than the listing’s own claim page.');
  if (BENEFIT.test(body) && !f.verificationBenefitEnabled) problems.push('Mentions verified priority where it does not apply.');
  if (SAYS_VERIFIED.test(body) && !f.verified) problems.push('Says the listing is verified when it is not.');
  return problems;
}
