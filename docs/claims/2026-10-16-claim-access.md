# Claim access correction — October 16, 2026

## Problem and behavior

Opening an outreach claim URL while signed in as an administrator automatically entered management preview. This hid the application form and made a valid public claim link appear restricted. Signed-out visitors and ordinary signed-in accounts took the normal application route.

Claim URLs now open the normal application for every account that has not already applied, including administrators. New users can create their free account with Google sign-in; existing users continue with their current account. A personal email or a different work-email domain is allowed; it changes the evidence for review, not whether someone can apply. No paid plan or completed personal onboarding is required. Only an approved representative receives ownership/editing access.

Administrator management is explicit through `?view=admin`, or `?as=UID` for a member preview. Both still require the administrator role, default to read-only, and cannot submit a claim as the viewed member. The page provides a link back to the normal application, preserving the listing context. Ordinary users cannot grant themselves admin access with these query parameters.

Existing pending claimants see review status, approved owners see their management link, and other representatives can request access to a claimed organization without displacing its current managers.

A failed claim-history query now shows an error and reload action instead of silently disabling the application forever. The error state shares the existing listener; no additional Firestore query is introduced. Submission remains blocked until claim history is known, preventing accidental overwrites. Draft persistence remains in session storage where available.

## Validation

The actual claim-page JSX is rendered with controlled auth/database boundaries for signed-out, existing-account, admin, member-preview, approved, pending, additional-representative, loading and failed-query cases. The real submission function is also exercised with a mocked Firestore write: verified personal Google email succeeds with a pending claim, while unverified sign-in and missing listings fail without a write.

Validation passed: the full suite (1,209 cases across 102 test files), followed by the expanded 11-case claim regression file including two additional submission tests; TypeScript (`npm run lint`); and the production build/prerender (666 pages). No real claim, ownership grant, Google OAuth popup or production database write was performed during these tests. Live OAuth and deployment completion must be verified separately.

## URLs

Normal organizer application:
https://calgarywatch.ca/claim/a35b908bde4fec3931fc15d01eb8

Administrator management (requires administrator sign-in):
https://calgarywatch.ca/claim/a35b908bde4fec3931fc15d01eb8?view=admin
