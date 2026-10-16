# Optional signup location — October 16, 2026

## Behavior

The first signup step no longer requires a neighbourhood or street address. Its primary action reads “Continue without location” when blank; a person who has already typed a location can explicitly skip it. Without a saved area, recommendations and the safety email use Calgary-wide coverage. Email subscriptions remain a separate choice; no location-storage consent is fabricated when someone skips location.

The save path accepts no area and records onboarding completion independently of location consent and selected interests. Dashboard settings and the homepage recognize the completion stamp, so someone who finishes with no location, no interests and no emails is not repeatedly sent back through signup. Members can also remove a saved location in settings. The live map’s account-preference save uses the same optional-area and consent rules, and keeps its existing “Skip for now” path.

“Use my current location” is available during signup and in account settings. It requests browser permission only on click, performs one position lookup, and uses the City's community-boundary polygons to suggest the containing Calgary neighbourhood. Only the selected neighbourhood enters the draft; GPS coordinates are not saved or sent to a reverse-geocoding service. A suggestion is not necessarily the person's home, so the UI asks them to check it before saving. Saving a new area still needs the separate account-storage consent checkbox.

Permission denial, unsupported browsers, lookup timeouts, unavailable boundary data and positions outside Calgary do not prevent signup. Typing or leaving the step invalidates a pending suggestion so a late lookup cannot overwrite a newer choice.

## Validation

Seven targeted regressions cover location-free completion and email choices, consent enforcement and location removal, exact community lookup, denial/unavailable/outside-city failures, actual signup markup, and the real save function with a mocked Firestore boundary. The save test confirms an onboarding stamp with blank location fields, no invented consent and no GPS coordinates, and confirms the resulting account opens its dashboard.

Validation passed: 1,218 individual tests across 103 files; TypeScript (`npm run lint`); and the final production build/prerender, generating 666 pages. No production accounts or email sends were used for validation. The changes follow the existing main-branch Hosting release workflow; deployment completion remains unverified. Tests do not exercise real device permission prompts, Google OAuth or production account writes. A browser/device smoke check remains necessary after deployment.
