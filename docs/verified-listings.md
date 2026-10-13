# Verified listings

What "Verified" means on CalgaryWatch, how a listing earns it, what it does, and what we may say about it.

## What it means

A listing marked **Verified** has been claimed by the organization (or someone authorized to act for it) and an admin confirmed that person. It is not the same as CalgaryWatch's own source check (`verification` / `verifiedAt` on an entity), which records that an editor checked the details against the organizer's page.

## How it is earned

The only way in is an **approved listing claim**.

1. The organization opens `/claim/{entityId}` from the listing (or from an outreach email), signs in with Google and submits a claim. That creates `listing_claims/{uid}_{entityId}` with status `pending`.
2. An admin reviews it in **Local partners → Claimed listings**, with evidence recomputed from the listing's own site (see `src/lib/claims.ts`), and approves or declines it.
3. Approval sets the claim to `approved`, writes the public mark `verified_listings/{entityId}`, and moves every partner lead for that listing to `claimed`.

None of these verify a listing: opening the claim page, signing in, submitting or re-submitting a claim, entering an email, being contacted by outreach, or a pending or rejected claim. Firestore rules allow one claim per account per listing, created only as `pending` and decided only by an admin, so repeated or competing claims change nothing until one is approved. A `verified_listings` document with no approved claim behind it is ignored by ranking.

Existing approved claims count automatically; nobody has to claim again. Nothing else (outreach contacts, partner status) is ever treated as verified.

## Which listings can be verified

Any published event, market or business listing with a `/claim/{entityId}` page. Guides and neighbourhoods are CalgaryWatch's own and can't be claimed.

## Where it shows

- **Badge:** "Verified · Confirmed by the organization" under the title on event, market and Local listing pages (`VerifiedBadge`, `VerifiedMark` in `src/components/entity/`). It shows from the build's stamp, or straight away from the public mark for a claim approved since the last build. Prerendered listing pages carry the same words.
- **Claim invitation:** an unverified listing's "Is this yours?" box and the claim page say what verification brings. A verified listing shows "Suggest a correction" instead.
- **Admin:** Claimed listings lists every verified listing with its verified date, who approved it and the claimant's name, role and work email. Claimant details are admin-only; the public mark holds only the listing id, title and date.

## How ranking priority works

The build (`scripts/discovery/export.ts`, on every deploy and twice daily) reads approved claims and stamps `ownerVerifiedAt` on those listings, after stripping any value a feed or entity document carried. Ranking reads that field through `src/lib/verified.ts`, the single place the weights live:

| Surface | Where | Weight |
| --- | --- | --- |
| Homepage day list, week agenda, events board | `interestScore` in `src/lib/eventRank.ts` | +2 (same as an editor's source check; a marquee venue or big-draw format is +3, a pro team +4 to +6) |
| Site search | `searchListings` in `src/lib/listingSearch.ts` | +2 (a title match is 10, a tag match 5, a summary match 2) |
| Personal picks (plans, emails) | `buildEventPicks` in `src/lib/eventPicks.ts` | +0.5 (one shared interest is 3) |
| Local and its category pages | `LocalBoard` | tiebreaker after Featured partner and CalgaryWatch picks, before name |
| Neighbourhood pages, places | `linksFor` in `src/lib/neighbourhoods.ts` | tiebreaker within the same closeness, before distance |

So verification breaks close ties and lifts a listing a notch; it never puts a clearly less relevant result first. It gives nothing to a cancelled, finished or unpublished listing. Market and event lists that are ordered by date stay in date order.

Limitations: ranking picks up a new approval at the next build (badge is immediate). Map pins, the markets index (date order), guides and the weekly digest's incident highlights don't use it.

## What outreach may say

`scripts/ops/lib/claimFacts.ts` turns each lead into facts (`hasPublishedEntity`, `claimable`, `claimUrl`, `claimStatus`, `verified`, `verificationBenefitEnabled`). The template claim line, the Claude prompts (`CLAIM_RULES`) and a final check (`claimLanguageProblems`) all use them.

- Claiming is offered only for a real, published listing in the current index, through its own `https://calgarywatch.ca/claim/{entityId}`.
- The visibility benefit is mentioned only when that listing is the organization itself (a business or market), it is not yet verified, and every ranking weight is positive (`VERIFICATION_PRIORITY_ENABLED`). Not for prospects, service-directory invitations, or an organizer whose only listing is one event (those get the plain claim line).
- A verified listing is never asked to claim: no new lead, pending drafts and follow-ups move to `claimed`, and replies carry no claim link.

Permitted (vary the words, keep the meaning):

> Once your listing is verified, it'll be marked as verified on CalgaryWatch, and verified organizations are given more priority when we surface relevant recommendations and listings across the site.

> Claiming it also gives the listing a verified status. We give verified organizations more weight when deciding what to surface across relevant CalgaryWatch recommendations, so there's a visibility benefit as well.

Prohibited, and blocked by the check: guaranteed or top ranking, guaranteed placement, always shown first, guaranteed traffic, featured everywhere, a claim link other than the listing's own, a claim link where nothing is claimable, verified priority where it doesn't apply, and saying a listing is verified or claimed when it isn't. An AI draft that fails is replaced by the template; a suggested reply that fails is dropped for a person to write.

If the ranking weights are ever removed, set them to 0 in `VERIFIED_WEIGHT`; `VERIFICATION_PRIORITY_ENABLED` turns false and outreach stops mentioning the benefit on its own.

Tests: `tests/verified-listings.test.ts`.
