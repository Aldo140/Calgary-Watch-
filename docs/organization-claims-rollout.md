# Organization profiles and shared claims

Historical rollout notes; current management/permission behavior is documented in [organization-workspaces.md](organization-workspaces.md), including management-only profiles for one-off organizers and organization-based Market HQ access.

Implementation baseline: production `main` at `0836de9`. No outreach, approval emails, deployments or production record repairs were executed by this task.

## Profiles and URLs

| Entity | Public URL after deployment | Claim URL after deployment |
|---|---|---|
| `biz-theatre-calgary` | https://calgarywatch.ca/local/theatre-calgary | https://calgarywatch.ca/claim/biz-theatre-calgary |
| `biz-alliance-francaise-calgary` | https://calgarywatch.ca/local/alliance-francaise-calgary | https://calgarywatch.ca/claim/biz-alliance-francaise-calgary |
| `biz-werklund-centre` | https://calgarywatch.ca/local/werklund-centre | https://calgarywatch.ca/claim/biz-werklund-centre |

These were not permanent published business entities in the starting inventory. They reuse editorial-inventory.json and `/local/:slug`; no separate organization collection or claiming system was created. Profiles contain conservative descriptions, official links, and no invented imagery, hours, prices or production schedules. Theatre Calgary's address is already in its reviewed official event. Werklund's name, domain and venue address are supported by the existing approved-source registry and reviewed venue records. Alliance's homepage is the primary source as requested by Antoine; no street address was invented.

Direct requests to the four official domains (Theatre Calgary, Alliance, Werklund and legacy Arts Commons) were denied by this environment's egress proxy. The `werklundcentre.ca` domain is supported by the current approved registry, but a live redirect/canonical check against legacy `artscommons.ca` remains required before rollout. Live production page/claim URLs have not been verified and must not be emailed as live links yet.

## Relationships and permissions

`Event.organizerEntityId` is the canonical relationship; `organizer` remains display text. Export recomputes relationships from published permanent profiles, exact reviewed names/aliases and matching official source domains. It removes unproven incoming relationship IDs. No fuzzy names, shared venue strings or aggregator attribution grant association. Existing profiles (including Vertigo and Downstage) use the same exact-name/official-provenance resolver. Werklund hosting another company's show does not make it the organizer.

The existing Theatre Calgary record `little-shop-of-horrors-2026` produces its existing event ID; it now references `biz-theatre-calgary`. Existing events were not duplicated or removed. Alliance/Werklund profiles show their own upcoming events only when official organizer provenance exists; an empty state links users back to the official site rather than inventing events.

Event organizer links and “More from” go to the permanent profile. Profiles reuse the existing styled production/date list and filter by `organizerEntityId`, published/source-approved state, end time and cancellation. Profile ownership never grants ownership of an associated event. Firestore management still checks the exact `listing_claims/{uid}_{entityId}` document, including Market HQ permissions.

## Verified state and accounts

The build strips incoming `ownerVerifiedAt` and business `claimed`, then derives them only from approved claims. Pending/rejected claims and CRM `claimed` statuses are not approval authority. Ranking weights and their relevance safeguards are unchanged.

The badge, CTA and claim page share a live Firestore subscription per entity. Public marks without a claim reference cannot assert new verification; legacy approved claims remain supported by their approved-claim build stamps. New marks reference their exact approved claim, enforced by Firestore rules (including `getAfter` for atomic approval). A revoked referenced claim cannot be read as a valid public mark. A stamped legacy approval can remain visible until the next build; rebuilding from claims is required after legacy revocation.

Admin approval now commits three writes in one transaction: approved claim, public mark, and the existing `users/{uid}` designation (`accountType: business`, `businessListings`, `businessSince`). It preserves earlier account membership and approval dates. Missing or mismatched profiles stop the transaction with an actionable error, so a failed account tag no longer leaves a newly approved claim. CRM lead updates are separate and do not grant access.

The existing approved-claim list now has “Repair verification & account” for a deliberate, idempotent reconciliation of the same claim/account; it does not create another claim or listing. Historical undated approvals keep a zero reviewedAt instead of acquiring today's date, avoiding accidental eligibility for a new approval email. The existing “Mark business accounts” action remains available.

Outreach contact names/emails never enter authorization decisions. Any supported Google user can submit verification information using their own UID and verified Google email; an admin still confirms their authority.

## Mercantile on 9th: code findings and live audit

Canonical event remains `6972906c904ecd4acb9407299e22`:

- https://calgarywatch.ca/events/mercantile-on-9th-697290
- https://calgarywatch.ca/claim/6972906c904ecd4acb9407299e22

The reviewed Inglewood BIA event was reused. There is no replacement Mercantile business/event record. Regression tests and local browser checks cover its existing route.

Confirmed code failure paths:

1. Approval previously wrote the claim, mark and business account separately. The profile write could fail after approval, especially if background user-profile creation had failed or rules were not deployed. Approval is now atomic and missing profiles are reported before writes.
2. Older approvals are deliberately excluded from approval emails: `APPROVAL_EMAILS_SINCE = 2026-10-14T01:30:00Z`. No automatic backfill or resend was performed.
3. Google redirect fallback reloaded the page and lost the form draft. Drafts are now retained in session storage, with safe parsing, and cleared after successful claim submission. Validation runs before sign-in. Reloading does not silently submit a stored claim.
4. The public claim page previously could invite a second claim after verification. It now shows Verified/correction instead, while the approved claimant retains management.

Actual Mercantile Firebase Auth UID, claim status, account verification, user profile, public mark and email-delivery status remain UNKNOWN: no service account or usable default credential is available. Do not describe this case as repaired. No live records were changed.

Run in a secure authorized runtime:

```sh
cd /workspace/Calgary-Watch-
node --import tsx scripts/claims/audit-account.ts 6972906c904ecd4acb9407299e22
```

The audit only reads Auth, users, listing_claims and verified_listings; it prints actual status and proposed account patches. Do not run it in public CI logs. Without FIREBASE_SERVICE_ACCOUNT it fails clearly without reads/writes. Use the configured project/database used by the site's discovery pipeline; do not assume the Hosting project is the data project.

### Conditional one-time repair procedure

1. Read the exact Mercantile claims and each claim's UID. Inspect Firebase Auth for that UID (existence, providers, disabled, emailVerified); match the actual authenticated claimant, never the CRM outreach contact.
2. If no claim exists, have the representative sign in and submit the canonical claim form. Do not create an invented approved claim.
3. If Auth is missing/disabled/unverified, resolve the actual sign-in problem first. Do not set emailVerified blindly or invent a new user. The current app uses Google, not password signup.
4. If `users/{uid}` is missing, have that authenticated user sign in to run the existing profile sync; investigate rules/network failure if it still fails. Do not attach another person's account.
5. For an existing approved claim, use “Repair verification & account” after deploying the new rules and UI. This atomically updates its exact public mark and existing business account without reclaiming or overwriting other managed IDs. Review the proposed patch from the audit first. Pending/rejected claims need real verification, not repair-as-approval.
6. Rebuild/export using authenticated production reads; verify the public badge, hidden claim CTA, claimant dashboard and exact account fields. Preserve approval email history. Decide separately whether an old approval should receive a manually authorized confirmation; this task does not send one.

## Authentication and emails

FirebaseProvider supports Google popup sign-in with redirect fallback, persists Firebase auth, and resolves getRedirectResult. There is no email/password signup or `sendEmailVerification` call; Google supplies its own verified account state. Firestore requires `email_verified == true`. Thus “signup email confirmation” and “claim approval notification” are different things.

Existing resolveFirebaseAuthDomain selects `calgarywatch.ca` on production and keeps configured domains for local/preview. Verify Firebase Authorized Domains includes calgarywatch.ca, Google OAuth redirect URIs include https://calgarywatch.ca/__/auth/handler, and Hosting serves Firebase's /__/auth helpers. These external settings cannot be inspected here. Do not assume a missing approval email proves Google authentication failed.

Claim approval notifications run hourly through `scripts/claims/send-approval-emails.ts` and Resend; inspect approvalEmailStatus/At/Error/Id on the actual claim and workflow delivery evidence. “sending” and “failed” records are not proof of successful delivery. No email routines were invoked during testing.

## Outreach safeguard and rollout

The final sender now re-resolves current inventory and approved-claim facts for first emails, follow-ups, edited drafts and approved replies. It checks subject and body, blocking unsupported listing/profile claims and incorrect claim URLs. CRM status cannot create verification. Exact current published entities remain required; organizer events are not permanent organization profiles.

The active agent may run from ArctosLaunchpad's separate copy. This change only modifies CalgaryWatch as requested; port the guard there before claiming all production outreach is protected. No transport changes or emails were made.

Generation used `DISCOVERY_OFFLINE=1 npm run discovery:export`: reviewed local sources and recurring-market rules plus retention of existing snapshot IDs, skipping unavailable live feeds. It retained every starting entity ID and added exactly the three profiles. This mode does not certify live feed freshness or approved-claim state; production must run the normal authenticated export before publishing. It does not silently replace existing production records with an empty feed.

Deployment steps: review changes; verify canonical official domains; deploy Firestore rules with the transactional approval UI; run normal authenticated discovery export/build; deploy Hosting; validate public/claim URLs for all three profiles and Mercantile; run the read-only Mercantile audit; reconcile only proven inconsistent records; verify real Google auth/approval with an authorized account. Do not contact Paula, Antoine, Alex, Jill, Karen or any other organization as a deployment test.

## Validation and changed files

- Full suite: 1,093 tests passed, zero failures/skips/cancellations.
- Lint/TypeScript (`npm run lint`): passed.
- Production build: passed (Vite, messaging worker generation, prerender, digest preview generation). Generated previews are local artifacts; no email was sent.
- Browser: all three profile pages and claim forms resolved locally; Theatre Calgary showed its reused event; Mercantile’s original event and claim route resolved; stored claim draft survived reload; no uncaught page errors.
- Eight presentation regressions render the actual shared badge/CTA JSX with remote state mocked, testing approved/unclaimed events, markets and businesses and missing IDs.
- No production authentication, real claim submission/approval, delivery, Firestore rules deployment or rules emulator was exercised. Rules have contract coverage; validate them in an emulator/staging before production rollout.

Changed implementation files:

- Data/model: `src/types/discovery.ts`, `src/lib/organizations.ts`, `src/content/editorial-inventory.json`, `src/generated/discovery-index.json`, `scripts/discovery/export.ts`, `scripts/discovery/feeds.ts`.
- Claims/auth presentation: `src/lib/claimApproval.ts`, `src/lib/claimDraft.ts`, `src/lib/claimsApi.ts`, `src/pages/ClaimListingPage.tsx`, `src/components/entity/ClaimCta.tsx`, `src/components/admin/ClaimsPanel.tsx`, `firestore.rules`.
- Organization display: `src/components/entity/ListingDetail.tsx`, `src/components/discovery/LocalPlace.tsx`.
- Outreach: `scripts/ops/lib/claimFacts.ts`, `scripts/ops/jobs/outreach.ts`.
- Investigation/docs: `scripts/claims/audit-account.ts`, `docs/partner-outreach.md`, this document.
- Regressions: `tests/organizations-claims.test.ts`, `tests/claim-presentation.test.ts`, `tests/business-accounts.test.ts`, `tests/claims.test.ts`, `tests/verified-listings.test.ts`, `tests/vertigo-theatre.test.ts`.
