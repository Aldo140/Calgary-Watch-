# Website readiness and Firestore read audit — 2026-10-15

This audit starts from `main` at `db997fa6ab229eb84e5d9d6495697fe3da36d557`. Before publication this patch was rebased onto `75c752d8c0d344bcc4930f890f315ccd864b64be`, preserving its credited Downstage artwork. These changes have not been deployed. No emails, claims, account repairs or production writes were performed. The supplied Spark figures (~58,000 reads, 889 writes, 41 deletes, 25 peak listeners, six connections) are user evidence, not measurements collected here.

## Largest amplification and changes

| Path | Before | After / expected behavior |
| --- | --- | --- |
| Changed/new event ingest | Each record's transaction scanned every event AND queried market occurrences, even for events | Event duplicate candidates use a conservative five-calendar-day start window; exact 12-hour/title/location matching remains unchanged. Events do not query market occurrences. Markets retain their small collection scan. |
| Admin root | Archive, latest users, all Monday subscribers, community stats, flagged reports, visitors and health opened regardless of workspace | Resources are scoped to the selected section and unsubscribe on section change. Direct `/admin?section=partners` avoids the incident archive entirely. |
| Account/header/dashboard | Multiple consumers subscribed to the same user's profile and claims | One shared profile listener and one shared claims listener per UID; last consumer unsubscribes. Errors do not turn into an invented empty claims list. |
| Verification | Already shared by listing ID | Retained shared live truth; instrumented it. Search/list cards use exported verification rather than opening per-card listeners. |
| Visitor statistics | Reads on remount and every five minutes | Same five-minute cadence, UID-scoped cache and in-flight coalescing; hidden document polling skipped. |
| Admin archive | Shared archive, potentially concurrent explicit refreshes | Refreshes coalesced; historical totals retain full archive. Recent live window remains 150. |
| Workload badges | Every ten minutes, including hidden browser tabs; failed reads became zero | Skip hidden documents, prevent overlapping loads, ignore completions after unmount, retain prior counts and show quota/read errors. |

For N changed/new events and C stored events, the old duplicate scan cost approximately N × C document reads, excluding other reads and retries. Example: 200 × 300 = 60,000. With 15 candidates per window, that part becomes about 3,000 (~95% reduction). This is an illustration, **not a measured production reduction or attribution of all 58,000 reads**. Actual savings depend on date density, changed-record volume and admin usage. Unchanged ingest already has a fast path; it still reads prior raw records once per source and one entity per unchanged record.

### Admin read inventory

- Watch desk: one cached full incident archive on first use per browser tab, live latest 150, recent users ≤200, community stats, flagged queue, visitor sample ≤200/count and health. These resources support visible desk figures.
- Reports: shared archive/live window and flagged queue. People: archive plus recent users; full user directory only on explicit directory loading. City stats: community stats only.
- Members & plans: recent users plus existing one-shot aggregate counts, event subscribers ≤500 and RSVP leaders ≤12. No per-member listener.
- Email planner: all Monday opt-in profiles, intentionally complete for exact forecasts, only while planner mounted.
- Visitors: ≤200 recent page views plus count, five-minute cache/poll. Search demand: its existing scoped workspace queries only.
- Events & markets: one-shot complete event/market moderation inventory, pending suggestions, source directory and eight recent actions; raw source lookup ≤1 only when opening an editor. Completeness is retained for moderation totals; no per-listing realtime subscription.
- Operations: its own four bounded/document subscriptions only while mounted (three ops-health documents and queue ≤300).
- Local partners: leads ≤500 and claim panel's pending claims ≤100, pending updates ≤100 and approved claims ≤300. No unrelated archive or subscriber listener. Those existing limits mean larger queues need pagination before exceeding them; this task does not call capped results all-time totals.
- Profile/dashboard/claim pages: shared own-profile and own-claims ≤50 listeners, live verified document for displayed listing, private RSVP reads on demand. Existing FirebaseProvider profile synchronization still performs necessary identity reads/writes; security checks remain.
- Export: complete events/markets/occurrences once per export to preserve moderation overrides, plus approved claims/public marks for verification. Full scans here are intentional build snapshots, not per-record loops. Review automation schedules before increasing frequency.
- Scheduled ingest/moderation, digest/export, ops and alert jobs can add service-account reads independently of browser connection counts. Copies in another repository (including ArctosLaunchpad) are outside this patch.

Development diagnostics are in `src/lib/readEfficiency.ts`: `subscriptionDiagnostics()` returns active/opened counts for instrumented listeners; duplicate active keys warn in development. Call it from a dev module/debugger. Production tracking is disabled, with no telemetry or Firestore reads. Instrumented paths include shared profile/claims/verification and central admin/claim subscriptions. Workspace-specific ops/leads listeners retain ordinary effect cleanup. No diagnostics panel or analytics service was added.

## Quota and claim safety

`firestoreActionError` recognizes web/Admin SDK resource-exhausted codes and nested quota messages. Atomic approval/repair errors explicitly say no changes were applied and suggest waiting for reset around midnight Pacific or increasing quota/billing. Multi-step actions say earlier steps may have applied and require refresh. These are different because batch account repair and moderation-save-plus-reload are not globally atomic.

The claim panel disables actions while busy and for 60 seconds after a mutation quota failure; retry is manual. Approval and individual repair use one Firestore transaction with one automatic attempt, reading the actual claim/account before writing the approved claim, public verification and business association together. A failed transaction cannot leave partial business/verified state. No email transport occurs inside approval. Success text reports approval separately from email handling. Read failures in approved-claim/update lists now show an error rather than replacing the list with an apparently empty successful result.

Mercantile repair updates the original approved claim and claimant, without creating a new claim or entity. Original approval time/reviewer/note and email fields survive; business IDs are deduplicated/appended and earliest known businessSince wins. Bulk historical business account correction now uses a transaction per existing user so concurrent approvals cannot overwrite memberships. Bulk operation stops on quota; earlier successful accounts may remain repaired. Missing profiles require the real claimant to sign in, not a fabricated account.

Approval emails remain a separate hourly job. Existing status/history guards exclude historical approvals and prevent automatically retrying `sending`/`failed` records. Admin can inspect those statuses. Delivery failure does not roll back approval; ambiguous sends require provider history review before an intentional retry.

## Organizer and artwork audit

Four permanent profiles exist exactly once: `biz-theatre-calgary`, `biz-alliance-francaise-calgary`, `biz-werklund-centre`, `biz-downstage`. Explicit organizer IDs connect event backlinks and upcoming lists. Upcoming lists exclude ended/cancelled/unpublished entries; venue-only text does not establish organizer ownership. Existing IDs and dates remain intact. Werklund is canonical; Arts Commons is a search/historical alias, not another organization.

All eight public/claim routes are generated as HTML with their canonical URLs and noindex metadata. Firebase Hosting uses `cleanUrls: true`, so these generated `.html` routes support direct navigation without another claim rewrite. Admin routes retain SPA rewrites. Public/claim output was checked locally; production deployment was not verified.

Downstage's existing current-season link and management/update forms are present. Clare's pending claim evidence comes from the user; it was not read or approved here. Pending/approved management, original-photo instructions and shared verified CTA behavior are covered by existing regressions. The subsequent main-branch artwork commit supplies the actual season poster and production images with credited metadata; these assets were preserved during rebase. No invented poster was added. Poster rendering preserves full aspect ratio/credit on responsive layouts and now handles failed loading with an official-site instruction, recovering if the source changes.

## Workflow findings

Confirmed code issues, rather than proven causes of individual remote runs:

1. Ticketmaster could deep-page beyond its 1,000-result limit. Dense windows now split into nonoverlapping date ranges. Each complete range is ≤five pages; request budget/depth limits fail explicitly rather than returning partial inventory. Duplicate IDs are removed. HTTP 429/5xx retries are bounded to three attempts, with Retry-After capped at three seconds. The 40-page-request budget counts logical pages (up to 120 HTTP attempts with retries).
2. Ingest's all-failed detection counted skipped missing-key providers as attempts. It now fails when attempted providers all fail, warns on empty output and stops later providers immediately on quota. Individual provider failures remain isolated and annotated with provider name; previously committed work is disclosed.
3. Thursday export did not receive Ticketmaster's key; sender did not receive the configured database ID. Both are passed through, and both Monday/Thursday senders now select the same named database as export instead of always using default.
4. Thursday send reservation treated every Firestore error as already-sent. Only ALREADY_EXISTS does so now; reservation failure aborts before sending. If a provider accepts an email but recording completion fails, its reservation remains for review, preventing automatic duplicate resend. Quota stops subsequent recipients.
5. Shared quota skip annotations no longer claim “Nothing was lost” after partially completed operations.

Git fetch worked; GitHub Actions run API access was denied. No production Firebase credentials were available, so exact failing run logs, named database access, secret validity, API responses and quota usage attribution remain unverified. No digest/approval sender was executed. Live export was not authenticated; only offline generation ran. Confirm required secrets by presence in GitHub settings, without exposing values: FIREBASE_SERVICE_ACCOUNT, VITE_FIREBASE_PROJECT_ID, VITE_FIRESTORE_DATABASE_ID, TICKETMASTER_API_KEY; sender settings additionally require its existing Resend/sender configuration.

## Search/indexing safeguards

Entity indexing and sitemap selection now share publication, freshness, kind and end/cancellation gating. Ended/cancelled events stay accessible for readers but are noindex and absent from sitemap; thin local profiles remain noindex and are no longer accidentally included by the generic sitemap helper. Claim/admin/search pages stay noindex as configured; robots excludes admin. Malformed encoded claim IDs no longer throw during SEO generation. Canonicals and generated route uniqueness remain covered. No Search Console credentials were requested; no diagnosis of Google's specific failed-validation notices is claimed. Production crawl/headers/redirects remain manual checks.

## Remaining intentional production steps, in order

1. Review/commit this patch on main. Do not publish a credential-free offline export as proof of current production verification. Confirm exact Firebase project and named database, required secrets, Werklund's current official domain/legacy redirects and Google's authorized domain/redirect settings.
2. Wait for Spark quota reset around midnight Pacific or intentionally adjust quota/billing. Check usage before rerunning scheduled jobs; avoid many parallel retries.
3. Validate existing claim rules in an emulator/staging. This patch does not change rules/index declarations; confirm prior `db997fa6` rules are deployed. Approval requires transactional reads/writes of claim, verified mark and existing user. No new composite index is required for the single-field date window.
4. Deploy reviewed Hosting/UI and, if using callable management, the discovery functions to pick up `discovery-store.cjs`. Scheduled scripts use the checked-out implementation when workflows run. This task deployed neither rules, functions nor Hosting.
5. Run authenticated discovery export/build and inspect stable IDs, all four profiles and verified stamps; deploy the resulting artifact intentionally. Smoke-test the eight routes below, canonical/noindex response and static direct navigation, mobile poster layout, real Google sign-in/redirect and pending/approved management using an authorized test account.
6. Clare: open Local partners → Claimed listings; inspect the actual pending `biz-downstage` claim and UID. Reconfirm Clare Preuss, Staff, account/work email clare@downstage.ca against current evidence. Approve once intentionally after quota is available. Verify approved claim, public mark, exact businessListings entry/accountType and unchanged unrelated memberships. Failure must remain pending; refresh before retry. Check the separate approval-email status and authorize any email independently.
7. Mercantile: run the existing read-only account audit for `6972906c904ecd4acb9407299e22`. Match Auth/UID/profile and approved claim. Use “Repair verification & account” only if needed. Confirm original approval/email history, same entity/claim, business membership and verified CTA; do not create another claim. Refresh after any quota error.
8. Review workflow annotations/run logs and provider response for ingest/Thursday; perform dry-run/preview checks only under separate operational authorization. Check reservations/provider history before recovering ambiguous sends. Monitor the next quota day to measure actual reduction.
9. Before outreach, verify the deployed entity and exact public URL, current source link and approved image permission. Confirm the supplied artwork files and approved credits render correctly in the deployed build. Port/review the factual outreach guard in any separate active sender checkout before using it. This work itself grants no permission to send mail.

| Organization | Public route | Claim/management route |
| --- | --- | --- |
| Theatre Calgary | https://calgarywatch.ca/local/theatre-calgary | https://calgarywatch.ca/claim/biz-theatre-calgary |
| Alliance Française | https://calgarywatch.ca/local/alliance-francaise-calgary | https://calgarywatch.ca/claim/biz-alliance-francaise-calgary |
| Werklund Centre | https://calgarywatch.ca/local/werklund-centre | https://calgarywatch.ca/claim/biz-werklund-centre |
| Downstage | https://calgarywatch.ca/local/downstage | https://calgarywatch.ca/claim/biz-downstage |

These are deployment targets; their live responses were not certified here.

## Validation for this patch

- Targeted regression run: 108 passed at that checkpoint (later additions also passed in full suite).
- Final full suite: 1,123 passed after rebase, zero failures/skips/cancellations.
- TypeScript and repository lint: `npm run lint` passed; this repository defines lint as `tsc --noEmit`, with no separate ESLint command.
- Production build passed: Vite, messaging worker, release marker, 608 prerendered routes/404 and local digest previews. Preview generation does not send email. Existing bundle-size warnings remain.
- All eight organization/profile and claim HTML files checked for canonical URL and noindex metadata. Hosting clean-URL configuration inspected.
- `DISCOVERY_OFFLINE=1 npm run discovery:export` passed, without authenticated production reads. Preserved checked-in snapshot content and IDs; retained only the intended Werklund alias change in generated output, avoiding generated freshness timestamp churn.
- `git diff --check` passed.
- No rules emulator, real approval/repair, live domain/Hosting smoke test, delivery or Search Console verification was performed. Atomicity is provided by the Firestore transaction and existing contract/pure regression coverage, not claimed as a production exercise.

## Files changed

- `.github/workflows/events-digest.yml`
- `docs/firestore-readiness-audit.md`
- `functions/discovery-store.cjs`
- `scripts/digest/events.ts`
- `scripts/digest/weekly.ts`
- `scripts/discovery/ingest.ts`
- `scripts/discovery/providers.ts`
- `scripts/lib/providerFetch.ts`
- `scripts/lib/quota.ts`
- `src/components/admin/ClaimsPanel.tsx`
- `src/components/admin/DiscoveryContent.tsx`
- `src/components/admin/OpsWorkspace.tsx`
- `src/components/admin/PartnersWorkspace.tsx`
- `src/components/entity/ListingArtwork.tsx`
- `src/content/editorial-inventory.json`
- `src/generated/discovery-index.json`
- `src/hooks/useAdminData.ts`
- `src/hooks/useAdminWorkload.ts`
- `src/lib/adminDataNeeds.ts`
- `src/lib/adminStore.ts`
- `src/lib/businessAccount.ts`
- `src/lib/claimApproval.ts`
- `src/lib/claimsApi.ts`
- `src/lib/discoveryPublication.ts`
- `src/lib/discoverySeo.ts`
- `src/lib/firestoreErrors.ts`
- `src/lib/plans.ts`
- `src/lib/readEfficiency.ts`
- `src/lib/seo.ts`
- `src/pages/AdminPage.tsx`
- `tests/discovery-pipeline.test.ts`
- `tests/read-efficiency.test.ts`
- `tests/rules-contract.test.ts`
- `tests/ticketmaster-provider.test.ts`
