# Downstage management handoff

No emails were sent, no production claim was approved, no second claim was created, and no production record was changed.

## Canonical listing

- Entity ID: `biz-downstage` (existing business/organization, reused exactly once).
- Public URL: https://calgarywatch.ca/local/downstage
- Claim/status/manage URL: https://calgarywatch.ca/claim/biz-downstage
- Official homepage: https://downstage.ca/
- Season/programme: https://downstage.ca/currentseason/
- Existing performance location: Motel Theatre, Werklund Centre, 205 8 Avenue SE, Calgary. This is the listed performance location, not a newly asserted office address.

The existing description, official links and performance location were retained. The generated index contains the same organization and existing event IDs. Local public and management routes were exercised. Direct production/domain requests remain blocked by this environment's egress policy; deployment/live route verification is still required.

## Claim and authorization

Clare says she already submitted a claim. Its actual production status cannot be inferred from code or outreach emails. Inspect Admin → Local partners → Claimed listings for entityId `biz-downstage`; preserve pending status until a separate authorized admin decision. Do not submit a replacement claim or match authorization by Clare/Dylan's outreach email.

A secure read-only audit is available:

```sh
node --import tsx scripts/claims/audit-account.ts biz-downstage
```

Running it here stopped with “FIREBASE_SERVICE_ACCOUNT required”; no production data was read or written. Run only in a secure authorized runtime, not public logs.

The existing shared approval transaction writes the claim, its referenced public verified mark and `users/{claim.uid}` business-account fields together. It preserves other businessListings and businessSince. It uses the actual claimant UID. Pending/rejected claims don't verify the listing. Missing user profiles stop approval rather than leaving a partial new approval.

The public profile uses the same Verified/Confirmed by the organization state and hides Claim this listing after approval. The approved claimant uses `/claim/biz-downstage` for management; pending claimants see status. The existing dashboard shows the approved listing and a Send a change link to this same stable URL. No authorization inheritance is granted over related event records.

## Change requests and photos

The shared ListingManagement component now explicitly says changes reach CalgaryWatch **for review**, and public data changes only after the update is applied. The success message confirms a request, not an instant edit. History shows Waiting for review / Applied / Not changed.

Supported requests: dates/hours, locations, official links, photos, descriptions, cancellation/postponement and other corrections. They write only pending `listing_updates` documents for the authenticated UID and exact claimed entity. Firestore still requires an approved claim for that exact listing. Request payload validation rejects missing details, invalid fields and non-HTTPS/invalid source URLs; photo URLs remain optional.

The management UI does not upload files. For specific original images/artwork, email the exact files to `aldo@calgarywatch.ca`, with listing name, permission and artist/photographer credit. The contact is centralized in `src/config/contact.ts`. A request can carry context and an optional public/source URL. No Dropbox ingestion was added.

## Artwork

The user selected the supplied Downstage 2026–2027 season poster; Clare provided promotional-use permission and the artist credit is **Leetia Lyons**. The inline image is visible in chat but is not exposed as a downloadable asset to the runtime. Therefore it has **not been installed** and the existing neutral image is retained. No artwork was recreated or scraped; no Dropbox folder was imported.

Prepared support: EntityImage `presentation: 'poster'`, shared ListingArtwork figure, full-width `height: auto`/`object-fit: contain` rendering and visible credit. After the original PNG/JPG file is provided, add that exact asset to public/images, set Downstage's image/images metadata to its path with meaningful alt text, presentation poster and “Season artwork by Leetia Lyons” credit, regenerate, and check desktop/mobile rendering. Do not point production metadata at a file that doesn't exist.

## Existing associated events

| Existing event ID | Performance | Notes |
|---|---|---|
| `23a7a3c1b052dbc5d7201637ebb0` | Dreaming Climate Consciousness | October 23, 2026 |
| `5b5db15f36de3e3829f03bd43eb9` | Dreaming Climate Consciousness | October 24, 2026; separate dated occurrence, not an accidental duplicate |
| `f165be5bcfc233f9e37e49eef139` | Creative Stretch with Downstage | Existing recurring-season record; marked free based on Dylan's supplied reply |
| `f7dd211b7a9bbe6755286644f2c9` | A Study of Choices | Existing April 7–11, 2027 run |

All use `organizerEntityId: 'biz-downstage'` from exact organizer identity plus official Downstage source provenance. Profile → events and event → profile use this relationship. No venue-only event is attributed to Downstage. Ended/cancelled/draft/archived events are excluded from upcoming events. No From Scratch date was invented.

## Approval email and production steps

Approval email is the existing hourly `.github/workflows/discovery-actions.yml` step, via `scripts/claims/send-approval-emails.ts`/Resend. It is separate from Google signup. Approval eligibility starts October 14, 2026 01:30 UTC; inspect the actual claim's reviewedAt and approvalEmailStatus/At/Error/Id. No notification was manually sent. A failed or stuck “sending” state needs investigation, not an assumed success or blind resend.

Before replying to Clare: obtain/install the original artwork file; review/deploy the combined local claim/organizer/management changes and Firestore rules; run authenticated production export/build; verify the real public and stable manage pages; inspect the existing claim and authenticated account; have an authorized admin decide approval; verify public mark, businessListings/dashboard and normal approval notification. Original artwork file, production credentials and live checks remain external prerequisites. Do not contact Clare/Dylan as a test.

## Files added/changed for this Downstage follow-up

- `src/components/entity/ListingManagement.tsx` (extracted from claim page; clearer review and photo instructions).
- `src/pages/ClaimListingPage.tsx` (reuse management component; truthful lead copy).
- `src/config/contact.ts`, `src/lib/listingUpdates.ts`, `src/lib/claims.ts`, `src/lib/claimsApi.ts` (contact and controlled request validation).
- `src/components/entity/ListingArtwork.tsx`, `src/types/discovery.ts`, `src/components/discovery/LocalPlace.tsx`, `src/styles/claim.css` (uncropped credited poster support; original asset pending).
- `scripts/discovery/reviewed-sources.json`, `src/generated/discovery-index.json` (Creative Stretch confirmed free; regenerated data without duplicating records).
- `tests/downstage-management.test.ts`, `docs/partner-outreach.md`, this document.

The earlier shared organization/claim implementation remains in the working tree and is required by this follow-up.

## Validation

- Downstage regressions: 19 passed (including poster rendering/credit support).
- Full final suite: 1,112 passed, zero failures/skips/cancellations.
- Browser: real Downstage public/claim/management UI, mocked auth/claim/write boundaries. Approved badge/CTA state, four pending request categories, photo-email instruction, request history and pending-claim status all passed without page errors. These checks did not validate production Firestore/Auth or send email.
- Production build passed. TypeScript checking passed.
- Generation: `DISCOVERY_OFFLINE=1 npm run discovery:export`; live feeds/claims were unavailable. Normal authenticated export is still required for production deployment.
