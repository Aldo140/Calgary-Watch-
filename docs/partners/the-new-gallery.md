# The New Gallery onboarding — October 21, 2026

Canonical identity: `biz-the-new-gallery`; public `/local/the-new-gallery`; claim `/claim/biz-the-new-gallery`; management `/organization/biz-the-new-gallery`.

## Official source review

Checked the official homepage, About-The-New-Gallery, Contact, Events, Otipemisiwak-Fantasy-Riel-Starr, Lo-Bak-Go-Michelle-Ku and Solving-a-Problem-Mark-Bedford pages at https://www.thenewgallery.org/ on October 21. Contact confirms 208 Centre Street S, Calgary AB T2G 2B6, info@thenewgallery.org, 403-233-2399, Wednesday–Saturday noon–6 p.m., free admission and closure during August. About confirms charitable artist-run contemporary art centre, established in 1975. Existing partner prospect preserved. No existing canonical profile in authored/index data or public production catalogue; public title-query aliases had no matches. No private claim access was available.

Published reviewed records:

- Otipemisiwak Fantasy — Riel Starr: October 23–December 12, 2026. Date-only exhibition run; end boundary is December 13 exclusive, with the correct November DST offset. Regular hours are explained, not continuous admission.
- Otipemisiwak Fantasy — Opening Reception: October 23, 2026, 6:30–9 p.m. Exact times from official exhibition page.

Both use the same exact official organizer/source association. Lo Bak Go and Solving a Problem have no published run dates: linked from profile sources and described as current projects, not invented timed events. No artist talk date was found. Official website images do not establish reuse permission; no artwork copied and no image permission invented. No newsletter subscription or external integration created.

## Submission and access audit

Existing `/submit?type=event` works before organization approval, after sign-in and email verification. It uses InventoryForm -> submitDiscovery -> authenticated callable; a missing callable falls back to the bounded, pending-only entity_submissions path. Moderation publishes only after admin/source checks. Public submissions do not confer ownership or approval rights. Public pending submissions are not user-editable through the fallback rules; corrections can be emailed while pending.

Approved organization users already have Add another event to this draft in `/organization/biz-the-new-gallery`, reached from `/plans`. Their draft persists on the current device. Review/confirmation submits up to 25 changes under the existing one-submission-per-seven-days allowance. Approved owner changes publish immediately and notify admin, without a second approval. Server transaction rechecks exact approved claims and organization scope. A pending claim cannot manage the workspace. Images remain protected for owners; artwork is handled by email. No new organization submission mechanism or permission grant was needed.

Added optional venue and HTTPS ticket/registration inputs to the public InventoryForm, using the existing domain fields. Admin review retains tickets rather than dropping them. Existing organization editor already supports those fields.

## Validation and limitations

155 relevant tests passed using tsx's test runner, including new profile identity, exact claims, distinct date-range/timed events, ticket preservation, unrelated-entity denial, organization transactions, auth and rules contracts. TypeScript and production-build validation run before release. Production public routes/account-entry checks are recorded in the task report after deployment.

No account created, claim submitted/approved, event submitted as a real user, email sent or newsletter subscription made. There is no authenticated production owner/admin session in this environment; live end-to-end account creation, private dashboard access and a real submission write cannot be claimed as tested. Existing automated handler and access tests cover these boundaries. Public browser checks must distinguish the working account-entry path from an actual authenticated publish.

### Live backend finding

October 21 checks: both northamerica-northeast1 submitDiscovery and submitOrganizationBatch endpoints return HTTP 404. The former has the existing pending-only direct Firestore fallback; the latter has no direct-write fallback (by design). Therefore do not promise immediate self-service workspace publication as live.

The most recent functions release, GitHub run 39006986999, failed on October 17 with HTTP 403 from serviceusage.googleapis.com when checking cloudfunctions.googleapis.com: permission denied to get service. This is a deployment service-account IAM prerequisite, not evidence of a billing-plan failure. No IAM or billing settings changed. A project administrator must restore the service-usage access needed by the deployment identity, then run the existing backend release and verify authenticated owner submission. Until then the public moderated submission path is the entry point to share in outreach. Actual authenticated fallback writes remain untested here.
