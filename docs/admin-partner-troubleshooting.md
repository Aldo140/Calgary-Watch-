# Local partners: permission errors and approval recovery

The October 16 screenshot shows three independent failures: business-update notifications were denied, the global workload counter displayed the same raw permission error, and a claim action displayed `internal [0]`. The screenshot does not establish the deployed backend version or the precise server-side cause.

## Implemented fixes

- An ordinary business-profile or standalone-listing approval writes the current claim, Business-account association and public verified mark in one Firestore transaction. This uses the existing admin rules and does not depend on a callable being deployed or its organization catalogue being synchronized. The transaction rechecks live claim identity, refuses unsupported cross-organization access, and preserves previous approval/email history during repair.
- Expanding an event or market claim into a different organization still uses `approveOrganizationClaim`, shared-access confirmation and the trusted server migration. A callable failure never silently falls back to broader client-side access.
- Business-profile claims display their own organization and scope. They cannot select an unrelated company. Event/market scope selectors have separate labels, explanatory copy and full-width controls.
- Notification loading, empty, error and previously loaded states are distinct. Errors identify the failed resource and offer retry; a denied query is never presented as an empty inbox. Read failures and acknowledgement failures are separate.
- Dashboard workload queries settle independently. Healthy counts update even if another collection is denied; failed counters retain their last good values. Successful retries clear stale errors.
- Admin errors provide deployment guidance instead of raw SDK messages. Ordinary members receive sign-in/contact guidance without administrator or deployment instructions. Different email/website domains remain a verification prompt, not an automatic rejection or ownership grant.

## Production action and verification

The checked-in `firestore.rules` already grants admins read access to `owner_listing_edits`. No permission rule was weakened by this fix. Production denial can indicate an older rules release or an authentication/role mismatch; inspect both rather than assuming an empty notification queue.

Backend deployment workflow:
https://github.com/Aldo140/Calgary-Watch-/actions/workflows/deploy-firebase-backend.yml

If deployed rules are outdated, run that workflow on `main`, target `rules`, confirmation `DEPLOY`. The separate `functions` target is needed if organization expansion's callable is missing or outdated. Ordinary approvals no longer require it. Inspect deployment output, then sign in again as an admin and retry the affected panel. Confirm notifications load, a healthy claims counter remains visible, and the real claim's approval/account/verified mark remain consistent. Do not approve a claimant merely to test the page; perform identity checks first.

GitHub workflow inspection from this environment returned HTTP Forbidden. The Google credentials file is an empty JSON object, not usable deployment credentials. No production rules/functions deployment, live claim approval or outbound message was performed. Pushing frontend changes does not deploy the backend rules/functions.

## Validation

- All 1,242 tests across 109 test files passed, including independent queue failure/recovery and error-copy regressions.
- TypeScript and production build checks were run.
- A local Chromium harness exercised the actual admin panels with only remote services mocked: denied-notification retry, business scope, three-write atomic approval without a callable, quota rollback, repair preserving approval/email history, wider access using the callable, readable internal errors and a 390px layout.
- Firebase rules were not emulator-tested in this task; the emulator artifact is unavailable in this environment. Production deployment and authenticated production verification remain outstanding.
