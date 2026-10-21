# Calgary International Bluesfest — source-reviewed organization

Official pages independently checked October 21, 2026. The earlier network restriction was resolved and the draft has been activated for publication.

## Canonical identity and routes

Organization ID: `biz-calgary-international-bluesfest`

Profile: https://calgarywatch.ca/local/calgary-international-bluesfest

Organization claim: https://calgarywatch.ca/claim/biz-calgary-international-bluesfest

Linked event: https://calgarywatch.ca/events/mr-blueberry-hill-2b9617

Event ID: `2b9617993bafa202f5af8f0e3f88`, derived from source `calgary-bluesfest` and source record `mr-blueberry-hill-2027-02-12` through the existing normalization pipeline.

The user reports positive outreach consent. This is inclusion permission, not ownership approval or paid sponsorship. `claimed` and `partner` remain false, with no invented owner-verification stamp.

## Duplicate and production-data audit

- Searched current main's codebase, editorial inventory, reviewed sources and generated index for Bluesfest, CBMA and Mr. Blueberry Hill.
- Preserved the existing `brand/partner-prospects.json` entry; no second prospect or outreach message was created.
- Read the publicly readable Firestore `organization_catalog`. The only matching organization was the same canonical draft created in the preceding staging commit. No matching alternate profile or related event was returned by exact-name/organizer queries.
- The proposed event ID did not already exist in the public catalog. No organization live-content override or public verification mark existed for the canonical organization ID.
- Private claims and outreach correspondence require authenticated admin access and were not read or changed. Existing identities and unrelated source, approval and owner history were preserved.

## Verified official information

The official contact page confirms info@calgarybluesfest.com, 403-668-7144, and #188, 6433a Bowness Road NW, Calgary, AB T3B 0E6. The profile labels that address for correspondence and does not map it as a visitor entrance.

The festival-information page confirms The Confluence, 750 9 Avenue SE as the festival venue. The sponsors page confirms that CBMA is a registered charity incorporated in 2005, with a mandate to preserve, foster and present blues music and musicians. It identifies CBMA as presenter and describes Walk Through Blues History, Blues in the Schools, workshops, concerts and other programming.

The official homepage and schedule still describe the **past** July 30–August 2, 2026 festival, with festival-week programming from July 27. No future summer festival dates were invented or imported as upcoming events. Historical festival hours, accessibility details and sponsor lists were not generalized into permanent organization attributes.

All requested primary pages were read: homepage, festival information, events, schedule, contact, sponsors and ticket portal. The complete events list and ticket portal contain only one future performance as of the check: Mr. Blueberry Hill. Tony D (October 15, 2026), Secondhand Dreamcar (October 8, 2026) and the other archived entries are past.

## Confirmed event

**Mr. Blueberry Hill** — February 12, 2027, **7:30–10:30 p.m. Calgary time**, The GRAND, 608 1 Street SW.

Kenny “Blues Boss” Wayne's Fats Domino tribute combines music and storytelling and was developed with the Alberta Playwrights Network. Copy is paraphrased from the official event page. The event-specific poster is referenced from the official site and credited to Calgary International Bluesfest; it does not replace the permanent organization's generated directory cover.

Official event: https://www.calgarybluesfest.com/event/mr-blueberry-hill

Official tickets: https://calgarybluesfest.tickit.ca/events/36665-mr-blueberry-hill

The ticket selector was active, with the Event JSON-LD reporting `InStock`. The page lists a CAD $42.50 base price; structured offer data separately lists $1.56 in fees ($44.06 before tax). The listing states that fees/taxes may apply and directs readers to the official checkout for the final total. No checkout, reservation or purchase was attempted.

The exact source-provided ISO times, `2027-02-12T19:30:00-06:00` to `2027-02-12T22:30:00-06:00`, replace the former date-only placeholders. Availability is a source-check snapshot, not a guarantee of future stock.

## Claim flow

The business profile has one permanent claim target. Its linked event resolves to that same organization claim, with an optional listing-context parameter. Exact official provenance is required for association; sharing The Confluence or The GRAND is not ownership evidence.

A representative can enter the claim page signed out or with an existing account. Existing email/Google account creation and sign-in are reused; verified email and administrative authority confirmation are still required. Positive outreach consent does not auto-approve management access. No real claim, account registration or verification email was submitted during testing.

## Validation and release checks

Relevant tests cover canonical identity, source approval, contact/address separation, actual event dates and stable ID, exact claim targeting, official aliases, historical-date exclusion, claim access, existing partner listings, directory shelves and structured event data. TypeScript and the production build/prerender are checked before release.

After the Hosting workflow completes, verify profile, claim and event HTTP responses, inspect rendered profile/programme and ticket links, and check the signed-out claim page on phone/desktop. Live verification results are recorded in the task's final report. No outbound email job is part of this release.
