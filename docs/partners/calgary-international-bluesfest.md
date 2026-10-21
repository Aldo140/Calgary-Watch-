# Calgary International Bluesfest — publication review

Prepared October 21, 2026. **Not ready to email: the organization is a draft, not a published listing.**

The user reports that the organization responded positively to outreach and agreed to inclusion. That agreement does not approve a management claim or justify a Verified badge.

## Identity and intended links

No matching organization or Bluesfest event was found in the current main branch's editorial inventory, generated discovery index or reviewed event sources. The existing `brand/partner-prospects.json` entry has the canonical name and official website; it is preserved. No additional prospect or outreach message was created.

Canonical organization ID: `biz-calgary-international-bluesfest`

Profile target: https://calgarywatch.ca/local/calgary-international-bluesfest

Claim target: https://calgarywatch.ca/claim/biz-calgary-international-bluesfest

These are **reserved route targets, not verified working production links**. The public repository correctly excludes the draft. The organization is authored in `src/content/editorial-inventory.json` and mirrored into `src/generated/discovery-index.json`. No unrelated exported inventory, IDs, claims or owner projections were changed.

Exact aliases in `src/lib/organizations.ts` cover Calgary International Bluesfest, Calgary Bluesfest, Calgary Blues Music Association and Calgary Blues Music Association (CBMA). Association still requires matching official source provenance; The Confluence and The GRAND are venues, not ownership evidence.

## Prepared profile

- Canonical name: Calgary International Bluesfest.
- Presented by: Calgary Blues Music Association (CBMA), described in the request as a registered charity incorporated in 2005.
- Website: https://www.calgarybluesfest.com/
- Contact: info@calgarybluesfest.com · 403-668-7144.
- Annual festival venue: The Confluence, 750 9 Avenue SE, Calgary.
- Administrative mailing address: #188, 6433a Bowness Road NW, Calgary, AB T3B 0E6.
- Primary directory address: Calgary, AB. Neither the mailing address nor an occasional concert venue is misrepresented as a permanent visitor entrance.
- Categories/tags cover music, arts, festivals, blues, performing arts, concerts and workshops.
- Official events and ticket-portal links are included. No hours, amenities, social accounts, prices, sponsor names or unlicensed artwork were invented.

The description clearly identifies the July 30–August 2, 2026 festival and July 27 festival-week start as historical. No 2027 summer festival dates are invented.

## Staged event

`calgary-international-bluesfest-review.json` holds an **unapproved, inactive** source record for Mr. Blueberry Hill, February 12, 2027 at The GRAND, 608 1 Street SW. The source record is not in the live ingestion configuration, so scheduled exports cannot silently publish it.

The start and end values are midnight calendar boundaries solely to represent the supplied date, with `schedulePrecision: date` and `endTimeEstimated: true`. They are not claimed performance times. Pricing and ticket availability remain unknown. The official ticket portal is provided without asserting that tickets are available.

Once official details are checked, the existing normalization pipeline gives the event a stable source/record-based ID and associates it with the permanent organization. There is no need for a second organizer profile.

## Access blockers and uncompleted checks

Public requests to the official homepage, events page, contact page, ticket portal and CalgaryWatch returned proxy CONNECT 403. The official homepage was retried after the user's network-settings reply and remained blocked. The about, schedule and sponsors pages could not be inspected because their hostname is blocked.

The environment has no usable Firebase service-account credentials. Firestore, approved claims, owner projections and existing outreach history have **not** been audited against production. No production record was written, no claim was submitted and no email was sent.

Required network domains: `www.calgarybluesfest.com`, `calgarybluesfest.com`, `calgarybluesfest.tickit.ca`, `calgarywatch.ca`.

## Finish publication

1. Read the complete official events page, schedule and ticket pages. Confirm Mr. Blueberry Hill's exact listing URL, start time, doors time if provided, current sale/availability status, and any additional upcoming performances.
2. Check official contact, festival information and presenter details against the supplied facts. Keep mailing and festival locations separate.
3. Read production organization/event/claim/owner-projection records and preserve any canonical existing identity or approved history found there.
4. Replace unconfirmed candidate details. Approve the candidate source, move it into the existing reviewed-sources pipeline, and promote the organization to `published`/`source-checked` with a genuine verification timestamp. Do not set `claimed`, `partner` or `ownerVerifiedAt` merely for inclusion consent.
5. Export/build/deploy. Verify the real profile, event and exact organization claim URLs; test signed-out and signed-in claim entry without submitting a real claim or sending mail.
6. Return the two **actually verified** production links for the owner's email approval.

## Validation completed

79 relevant tests passed: Bluesfest identity/content/publication gating, exact claim targeting, official organizer aliases, historical date exclusion, organization/claim access, existing partner listings and directory shelves. Activation tests use explicit in-memory reviewed copies; they do not claim that the draft is currently public or that a live official page was checked.

TypeScript passed after installing the current lockfile dependencies. Vite build and prerender passed; 774 pages were generated, with the Bluesfest draft absent from public/claim artifacts as intended. Share-card generation completed (379 cards) and email-preview generation completed (22 previews); neither sends email.
