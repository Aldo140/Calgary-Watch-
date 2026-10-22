# Organizer requests and moderation recovery — October 21, 2026

## Confirmed findings

The supplied admin snapshot has two pending submissions (FunnyFest Halloween Comedy and Dance Party; Festive Foothills Art Market) and three queued `review-submission` decisions. It is a snapshot, not proof of current database state. Private current submissions, claim notes and action payloads have not been read from production.

Current `review-submission` imports a listing as pending/unverified and marks the submission approved. A separate publish action is required. That behavior explains why an imported suggestion can still be absent publicly. Existing queued actions retain that original meaning; they are not silently promoted to publication.

The October 21 19:25 UTC moderation run (39661532634) completed with zero pending actions at that time. Recent scheduled runs were several hours apart despite the hourly configuration. The missing callable sends admin decisions through this worker; the screen must not guarantee a one-hour completion time.

## Changes

- New `publish-submission` administrator action uses one source-review flow, retains the stable source/record identity, performs the existing duplicate/revision/source checks, and marks a submission approved only after successful publication verification. Failed publication leaves a pending suggestion for correction. Both callable and queue use the same adapter. Public submissions cannot grant approval rights.
- Administrators can explicitly approve a checked official HTTPS organizer source while reviewing, rather than requiring an unrelated preconfigured source. Host validation and public input validation remain enforced.
- Queue requests use stable content fingerprints so repeated requests/tabs do not create repeated pending decisions. Failed decisions retain history and can be explicitly retried.
- Bounded live queue status refreshes the listings after processing, pauses while hidden and reports read failures. Rows show the listing name, waiting/processed/failed state and the difference between importing for review and a successful website release. Pending decisions disable repeated approval clicks.
- Listings render 24 at a time with search and show-more; dates and venue help distinguish repeated performances.
- The separate `Apply listing decisions (no email)` workflow processes the existing administrator queue, shares its concurrency lock, requests a release when needed, and never invokes vendor/claim email scripts. It is manual and requires an explicit APPLY confirmation. Automatic approval review rejected executing it because it could apply all queued decisions; no run was dispatched. The existing hourly workflow is unchanged.

## Official context checked

FunnyFest links its official Halloween ticket page from its website:
https://funnyfest-comedy-halloween-show-calgary-yyc.eventbrite.ca
Canonical ticket page:
https://www.eventbrite.ca/e/halloween-comedy-party-3-comedians-and-5000-prizes-costume-contest-yyc-tickets-1955746824399

Confirmed October 31, 2026, 7 p.m., doors 5:45 p.m.; Offside Pub & Eatery, 2820 Centre Street North, Calgary. Three comedians plus a dance party and costume contest. Ticket JSON-LD has an invalid date-only end (earlier than its start); do not invent a closing time or copy that end value. No duplicate editorial event was created while the original pending submission identity remains inaccessible.

Leighton official page:
https://leightoncentre.org/event/festive-foothills-art-market-2026/

Confirmed November 7–December 20, 2026, 10 a.m.–4 p.m., admission by donation, 282027 144 Street West, Foothills AB T1S 0Y4. Preview November 6, 3–6 p.m. Event text says daily but regular footer hours say closed Monday: confirm Monday openings before supplying daily occurrences. Use the shared Calgary time helper and its configured year-round UTC-6 policy; do not substitute the execution host’s older timezone rules. Do not replace the pending vendor record with a second market.

## Production blockers and limits

Hosting release 39685365098 failed with HTTP 403 while checking firebasehosting.googleapis.com through Service Usage. Earlier functions release 39006986999 failed similarly for cloudfunctions.googleapis.com. Both submission callables return 404. Firebase IAM/service-usage access must be restored before claiming these UI changes or The New Gallery onboarding are live. No billing or IAM change was made.

Approved-claim messages are preserved by the existing approval patch. Display restoration and searchable verified-account cards are committed, but deployment success must be checked separately. It is not yet possible to say every organizer's requested change has been fulfilled: the actual notes still need to be inspected.

An encrypted read-only audit was prepared locally but automatic approval review rejected publishing it because the artifact destination exports private records. It remains unpublished pending explicit user approval. No alternate private-data export was attempted. No emails sent.

## Read-only audit completed with user approval

Audit 39687660516 completed October 21 at 16:36 Calgary time. Output was encrypted before upload, retained one day, and decrypted only in the task workspace. Eleven approved claims were checked: four actionable requests, one thank-you and six empty messages. No private claim text, personal contact information or submission IDs are included in this report.

- Morpheus: It's a Wonderful Life is already published at `/events/morpheus-theatre-it-s-a-wonderful-life-275657`; the live discovery index confirms December 11–19.
- Alliance Française: production still had a city-only address and generic description. Updated authored profile with the official contact page’s main-campus address, hours, phone, email and adult/family programme links. Kahanoff appointment-only testing campus is described separately. Added fully timed Ciné Kids (October 31) and Collectif Devenir talk (November 6). Starbuck screening has no confirmed end time, so no guessed record was added.
- Mercantile: production still had outdated November 28 hours and lacked December 5 pottery. Corrected 10 a.m.–5 p.m. hours, presenter, venue and donation beneficiary; retained the exact November holiday ID and slug. Added the pottery edition under the same organization. New holiday details come from the approved representative and the owner's supplied correction; the general website FAQ is older.
- FunnyFest: a request to post 100 shows/workshops, not a supplied 100-show schedule. Existing weekly draft capped a submission at 25 changes. Added a local CSV importer and a shared 100-change cap, with the same confirmation, seven-day allowance, access controls and protected images. An oversized audit receipt aborts atomically. Backend deployment is required before 100-change production publication can be verified; no nonexistent events were invented.

There were ZERO pending moderation decisions at audit time. The three previously queued decisions had FAILED because their sourceId was empty. The two suggestions themselves remained pending. Do not describe these as waiting for the worker anymore. The existing hourly worker processed them independently; the manually requested recovery worker was never run.

Leighton's original suggestion contains one continuous November 6–December 20 occurrence. Its own description confirms daily 10 a.m.–4 p.m. openings plus a November 6, 3–6 p.m. preview. Added a repeated-opening control that generates individual days, using the existing Calgary helper. The configured policy is year-round UTC-6 after March 2026; the earlier claim of a one-hour UTC error was incorrect. Neither original suggestion has been approved or altered by this audit.
