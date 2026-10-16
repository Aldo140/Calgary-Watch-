# Verified owners: automatic listing updates

## Owner behavior

After an administrator approves a claim, the Business dashboard's **Manage listing** action opens a structured editor. Owners can update public profile fields, directly claimed events/markets, and events connected to their verified business by the canonical `organizerEntityId`. Venue/name similarity never grants access. A directly claimed event shares its canonical parent business's allowance even when a different representative owns the profile claim.

One saved update is allowed every **seven complete days per business**, shared across the profile and linked events. A save edits one selected listing and may change several fields. The browser reserves the claim's allowance atomically with the update; Firestore rules use server time, and the publisher enforces the canonical business limit across all representatives/direct event claims. Reload/refresh shows the next eligible save in Calgary time.

Available fields include name/title, descriptions, address/location, links, contact/opening hours/socials/services where applicable; event times/pricing/ticket link/cancellation; and market dates/amenities. Market dates use Calgary calendar controls, preserve existing occurrence IDs, and support adding/cancelling dates. Owner schedule overrides remain authoritative across subsequent feed rebuilds; missing dates are cancelled rather than silently deleting their history.

**Images cannot be added, changed or deleted in the editor.** Image metadata and all identity, source, publication/verification, ownership and paid-placement fields are protected. Image requests go to aldo@calgarywatch.ca with exact files, listing name and approved credit. The page explains this policy and the weekly limit. There is no file upload.

Owner changes need **no admin approval**. On Spark, the existing static site still needs a scheduled build/deployment: saved → applied automatically → published. The editor never claims “Published” before Hosting succeeds and includes Refresh publishing status. Failed validation releases only that operation's reservation and leaves content unchanged. Transient/quota failures leave the queued operation intact for a later run; refreshing distinguishes those states. Retries reuse the same operation ID when the save result is uncertain.

Verified event, market and business footers use the shared Verified badge and “Claimed by the organization” copy, with a correction link. They omit the claim invitation and ranking sales pitch. Shared verification retains known state during transient read errors; a definitive permission denial still clears it.

## Notifications and admin preview

Local partners has **Business listing updates**, showing recent automatic updates and failures, before/after values, owner dashboard links, and unread indicators. **Mark notification read** acknowledges a notification; it does not approve or publish anything. Older updates can be loaded explicitly. Watch desk/Local partners badges count unread updates using one aggregate query per existing ten-minute workload refresh. The panel has one bounded shared diagnostic listener while mounted.

These are **in-app admin notifications**, not email. No email was sent or newly scheduled for owner changes. The existing approval-email template explains the new permissions; its independent delivery system is unchanged. Historical freeform listing requests remain readable; new legacy submissions are disabled so owners use the weekly editor instead.

Admin preview uses the same editor and selected member's history, but all edits/submissions are disabled. Public browsing/section selection and status refresh remain available.

## Data and publication

- `owner_listing_edits`: private owner/admin queue and audit history. Client can create only queued, server-timestamped, image-free edits in the same atomic operation as its allowance. Admin acknowledgement can change only `notificationPending` to false.
- `owner_listing_edit_limits/{claimRootId}`: atomic server-timed reservation, approved claimant only. Client cannot backdate it, create it independently or delete it.
- `owner_business_edit_limits/{canonicalBusinessId}`: public availability timestamp only; trusted worker writes it. This prevents separate direct event claims/representatives bypassing the business-wide limit.
- `owner_listing_content/{entityId}`: public field overrides, writable only by the trusted publisher. No claimant email/UID is stored here. Source IDs, slugs, verification and images remain unchanged.

`Publish verified owner updates` checks two bounded queues every 15 minutes (GitHub scheduling can be delayed). Idle cost is about 192 minimum query reads/day, with no full inventory export while idle. When work exists, it exports current authenticated inventory, independently verifies the actual approved claim and exact target relationship, validates editable fields, then atomically writes content, audit notification and business allowance. It never sends emails.

The normal Hosting workflow merges applied overrides after feeds/editorial content, preserving them on future rebuilds. It fails closed if owner content cannot be read, instead of silently publishing a feed-only replacement. Only currently published, authorized targets participate; no owner edit can resurrect an archived listing. Applied updates remain `publicationPending` until a successful Hosting deployment acknowledges a build that actually contains their content version. A newer unapplied/unbuilt edit cannot be falsely acknowledged. Failed dispatch/deployment retries automatically, with exponential backoff from 15 minutes to a maximum of 12 hours. Missing confirmations generate an admin warning, avoiding repeated full rebuilds every quarter-hour during a prolonged outage.

## Required production activation

1. Push/review this code on main. Inspect **Test owner listing rules** in GitHub Actions and require it to pass before deploying the rules. It runs on the isolated `demo-calgary-owner-edits` emulator project with no production credentials.
2. Run **Deploy Firebase Backend** on main, `confirm=DEPLOY`, `target=rules`. This change needs new Firestore rules; Hosting alone cannot activate owner saves. No paid Cloud Functions or billing upgrade is required for this scheduled-publisher path. No new composite indexes are required.
3. Confirm Hosting main release and its authenticated export use the intended Firebase project/named database. The normal FIREBASE_SERVICE_ACCOUNT/VITE_FIREBASE_PROJECT_ID/VITE_FIRESTORE_DATABASE_ID secrets are reused; feed export also uses TICKETMASTER_API_KEY. No new secret is introduced.
4. Confirm **Publish verified owner updates** is enabled. Inspect the first scheduled/manual run and the subsequent Hosting release/acknowledgement. A failed release does not become “Published” in the editor.
5. With an intentionally authorized approved test account, save multiple fields in one operation; verify profile/linked-event selection, seven-day denial across representatives/events, unchanged images/IDs/verification, correct public content after release and the admin notification without an approval step. Confirm owner/admin preview content agrees and preview writes are blocked. No production test edits were performed during implementation.
6. Check the new read budget after the first active cycle. Do not repeatedly trigger exports during quota exhaustion. Monitor failed updates/releases and use their audit history for any intentional rollback.

## Validation and limitation

The final repository full suite passed 1,151 tests, including editor rendering regressions. Targeted owner tests cover unauthorized/revoked claims, protected fields, atomic quota failure, idempotent replay, business-wide rate sharing, market date ownership/stability, timezone controls, feed override persistence, notifications and build-version acknowledgement. TypeScript/lint, production build and credential-free offline export passed. Offline generation's timestamp changes were restored; no production data/export is claimed.

Actual emulator execution could not run locally: downloading Google's Firestore emulator JAR returned **HTTP 403 Domain forbidden**. An executable emulator test suite and isolated CI workflow are included, but their result must be checked in GitHub before rules deployment. GitHub Actions API access and live-site access were also denied here. No rules/Hosting deployment, production edit, claim approval, account repair or email was executed as part of this implementation.

Local/CI rule check:

```sh
npx --yes firebase-tools@14.22.0 emulators:exec --only firestore --project demo-calgary-owner-edits "node --import tsx --test tests/emulator/owner-listing-edits.test.ts"
```
