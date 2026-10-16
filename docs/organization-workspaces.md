# Organization workspaces

The organization profile is the management centre at `/organization/{business-id}`. Members & plans displays the approved company, source approval, role, linked upcoming event count and the same read-only workspace the member sees. Business dashboards link directly to it.

An approved business-profile claim authorizes the organization and its explicitly related events. A historical event/market claim remains listing-only until an admin selects the correct organization in Claims and saves approval/repair. This is a deliberate authority grant, not an inferred entitlement from a shared venue. Approval repairs preserve the original decision date and email history.

A workspace draft bundles up to 25 additions, edits or removals across the profile, linked markets and events. Market date changes use the same submission and preserve date ownership. It is retained on the member’s current device. Review lists every change. A required confirmation explains that the complete submission uses seven days of allowance for the business, shared across all representatives. Members can draft their next changes while waiting. Images, provenance, ownership and identity remain protected. Removing an event hides its public listing and retains its images and audit record; it can be restored.

`submitOrganizationBatch` is an authenticated callable in northamerica-northeast1. One transaction rechecks actual approved claims, the trusted catalogue, pending legacy requests, target ownership and the shared weekly allowance; then writes all live projections, the allowance and a before/after admin notification. No member can directly write the catalogue, projections or allowance. Failed transactions publish nothing. A stable request UUID and payload hash make retries idempotent, including after a reload. No email is sent by this callable.

The public site shares one bounded listener for projections newer than its built snapshot, stops it while hidden and merges server content across discovery, search and dashboards. New event routes work before the next static build. Future exports merge projections and removal tombstones after feeds so an ingest cannot resurrect removed events. A subsequent Hosting release supplies static HTML, sitemap and crawler metadata; instant publication is visible to the JavaScript application immediately after the transaction, while static crawlers wait for that release.

## Activation

1. Deploy the latest Hosting build. Its post-deployment catalogue sync reads inventory once and writes changed canonical records only. A catalogue is necessary for safe server-side ownership checks.
2. Deploy rules and the new callable using the existing **Deploy Firebase Backend** workflow, target `all` (or rules and functions separately). Cloud Functions requires the project's supported billing and IAM configuration. Hosting alone does not activate the callable. The functions predeploy packages the shared TypeScript validation using the installed root dependencies.
3. Confirm historical event/market-only representatives’ organization authority in Claims. Do not invent approvals or broaden access automatically.
4. Verify with two representatives: one bundled add/edit/remove commits immediately, both see the same next eligible time, a second submission is rejected, another organization is denied, images cannot be changed, and admin preview cannot submit until an authorized admin explicitly enables editing.
5. Run the production roster audit documented in organization-coverage-review.md and review official programme pages for missing confirmed dates.

The existing scheduled publisher remains compatible with older queued and listing-only edits. New organization submissions are marked already published, so the legacy worker does not dispatch unnecessary releases for them. Both paths use the canonical business allowance. Historical audit records and sent-email records remain intact.

## Validation limits

The transaction adapter tests exercise the real submission handler and atomic failure, idempotency, shared representative limits, cross-organization protection and legacy pending-job conflicts. They are not a substitute for authenticated production verification. This environment has no usable production service-account binding; official source requests and the Firestore emulator download are blocked by the network proxy. No production deployment, source completeness claim or production roster repair is implied by local tests.

Local validation: 1,168 tests passed, TypeScript passed, production build and 612 prerendered pages passed. Browser checks of the actual workspace passed with only Firebase boundaries mocked: multiple targets, draft persistence across reload, confirmation/cancel, shared submission payload, weekly lock, read-only preview and a 390px mobile viewport. The Firestore emulator tests were not run locally because the emulator artifact download is blocked.

## Workspace presentation and read efficiency

Profile, Events & markets, and Weekly draft have separate navigation. The programme supports search and upcoming/past/cancelled/removed/market filters. Publishing stays available in a sticky review bar; image and publishing guidance is expandable. The member dashboard prioritizes the organization workspace and keeps source listing approvals in an expandable history. Admin member rows show managed organizations before opening details.

Canonical profile, programme and allowance data are loaded once per workspace mount, with an explicit retry for loading failures. Shared live projections update the workspace without repeating those reads on unrelated organization changes. Version-aware merging prevents a slow initial snapshot from overwriting newer removals or edits. Draft edits remain intact when switching sections or retrying a read.

Further client optimizations: draft persistence is debounced for 300ms and flushed on page hide, backgrounding and unmount; programme filtering is deferred and memoized, with 24-row progressive rendering; unchanged projection revisions retain their collection identity; date formatting reuses one formatter. Publishing functions load on submission. Phone, website, ticket and price inputs use appropriate mobile controls. The visible clock refreshes event states each minute and unlocks the weekly allowance at its deadline without a page reload. Browser checks with mocked Firebase confirmed 24/48-row pagination, search resetting pagination, and one draft write for a twelve-character typing sequence, alongside reload recovery and read-only preview.

## Admin access modes

Member dashboards, organization workspaces, listing management and Market HQ open read-only for admins. The “Enable admin editing” switch grants editing for the current page and subject; reloading or changing the account resets it. All verified administrators, including protected role-assigned admins, can use it. Member preferences and RSVPs save through an authenticated callable without impersonating the member or changing their identity or role.

Organization admin changes publish immediately, including approved primary/gallery image URLs, captions and credits. Admins can add and remove events through the organization workspace. File uploads are not provided. Admin saves bypass but do not consume the business’s seven-day allowance. Business owners retain their existing weekly limit and cannot change images. Admin edits are attributed to the actual administrator in audit records; conflicting older queued edits are superseded to prevent stale publication. Editing an unclaimed listing does not verify an owner.

Deployment requires updated Firestore rules and both `submitOrganizationBatch` and `adminMemberAction` functions, built by the existing functions asset packaging step. Authenticated production verification is still required. Local browser checks use mocked Firebase boundaries and cover default read-only access, explicit enable/disable, the selected-member admin payload and reset after reload. Server handler tests cover authorization, audit attribution, image preservation, weekly limits and idempotent RSVP counts.

Admin-mode validation: all 1,174 tests passed, TypeScript passed, functions bundles passed syntax checks, and the production build passed. Browser checks passed with mocked Firebase boundaries. Production deployment and authenticated live checks remain unverified.
