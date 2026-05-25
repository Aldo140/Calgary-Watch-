# Onboarding Gate + Settings Redesign

**Date:** 2026-05-17
**Status:** Approved

## Problem

The address/settings panel auto-opens on every sign-in for any user missing `piiConsentAt` or location data — including returning users who skipped setup on a prior session. There is no opt-out path, so users who close without saving are trapped in a loop. The Settings tab always renders the address-edit form with no personalization and no dirty-state Save button.

## Goals

1. Panel auto-opens only for users who have never completed or explicitly skipped onboarding.
2. Users can opt out with a "Skip for now" button that permanently suppresses the auto-prompt.
3. Settings tab shows a personalized profile summary (Google photo, name, current preferences) by default; edit mode is opt-in.
4. Save button in edit mode only appears when the draft differs from saved data.
5. Fix the race-condition flash: panel must not open while the Firestore profile is still loading.

## Non-Goals

- Changing the address/neighborhood form fields or validation logic.
- Migrating existing Firestore documents in bulk (handled lazily on next save).

---

## Design

### 1. Firestore Schema

Add one optional field to the `users` collection:

```ts
onboardingCompletedAt?: number   // Unix ms; set when user saves or skips
```

No migration needed. Existing users without this field are treated as "never completed" but the `userProfile !== null` guard prevents the flash (see below). On their first interaction with the new Settings view they will naturally set the flag.

Backfill shortcut: in `saveProfileSettings`, if `userProfile?.piiConsentAt` already exists and `onboardingCompletedAt` is absent, include it in the write — so returning users who save any change get stamped automatically.

**Existing production users** (have `piiConsentAt` but no `onboardingCompletedAt`) will see the panel once on their next sign-in. The new Skip button lets them dismiss in one tap; the backfill then stamps their record on that interaction. This is a one-time migration UX cost and is acceptable.

### 2. Onboarding Gate (`profileNeedsSetup`)

**Before:**
```ts
const profileNeedsSetup = Boolean(
  user && (!userProfile?.piiConsentAt || !(userProfile?.neighborhood || userProfile?.address))
);
```

**After:**
```ts
const profileNeedsSetup = Boolean(
  user && userProfile !== null && !userProfile.onboardingCompletedAt
);
```

The `userProfile !== null` guard is the race-condition fix: when the user just signed in and Firestore hasn't responded yet, `userProfile` is `null` (not `{}`), so the panel stays closed during that window.

`authPanelVisible = authPanelOpen || profileNeedsSetup` is unchanged.

### 3. Skip Onboarding

New callback `skipOnboarding` in `MapPage`:

```ts
const skipOnboarding = useCallback(async () => {
  if (!user || !db) return;
  await setDoc(doc(db, 'users', user.uid), { onboardingCompletedAt: Date.now() }, { merge: true });
  setAuthPanelOpen(false);
}, [user]);
```

The onboarding panel (first-time flow) gains a **"Skip for now"** secondary button rendered below the primary Save button. Clicking it calls `skipOnboarding`. No address or consent is required to skip.

`canCloseAuthPanel` simplifies to always `true` when the user is signed in — the skip button is the formal opt-out mechanism; the X button closes without writing anything (panel will reappear next sign-in if `onboardingCompletedAt` is still absent).

### 4. Settings Tab — Profile Summary View

When `authPanelMode === 'settings'` and `!profileNeedsSetup` (i.e., a returning user with completed onboarding), the right panel renders a **read-only profile summary**:

**Header block:**
- Circular Google profile photo (`user.photoURL`) — 56px, with a fallback initial avatar if `photoURL` is empty.
- Display name (`user.displayName`) in large bold text.
- Email address in muted small text.

**Preferences block:**
- Current report area: saved `address` or `neighborhood`, or "No location set" if skipped.
- Weekly digest: "Enabled" / "Off".

**"Edit preferences" button:** Secondary outlined button. Clicking it sets local state `isEditingPreferences = true`, revealing the address/neighborhood form fields inline.

### 5. Dirty-State Save Button

In edit mode, the Save button is only rendered when the draft differs from the persisted profile:

```ts
const isDirty = 
  profileDraft.address !== (userProfile?.address ?? '') ||
  profileDraft.neighborhood !== (userProfile?.neighborhood ?? '') ||
  profileDraft.weeklyDigestOptIn !== (userProfile?.weeklyDigestOptIn ?? true);
```

A **Cancel** button sits alongside Save and resets the draft to `userProfile` values, returning to summary view.

During first-time onboarding (`profileNeedsSetup = true`), the edit form is always shown and dirty-state logic does not apply — the Skip and Save buttons are always visible.

---

## Component Changes

| File | Change |
|---|---|
| `src/pages/MapPage.tsx` | `profileNeedsSetup` logic, `skipOnboarding` callback, `isDirty` derived value, `isEditingPreferences` state, profile summary JSX, skip button in onboarding panel, `onboardingCompletedAt` in `saveProfileSettings` |
| `src/pages/MapPage.tsx` (type) | Add `onboardingCompletedAt?: number` to `UserProfileSettings` |

No other files need changes.

---

## Behaviour Matrix

| User state | Panel auto-opens? | Can close? | Settings opens to |
|---|---|---|---|
| Not signed in | No | — | Sign-in screen |
| Signed in, `onboardingCompletedAt` absent, `userProfile` loading | No (race guard) | — | — |
| Signed in, `onboardingCompletedAt` absent | Yes (first-time flow) | Yes (X, but prompts again) | Address form |
| Signed in, skipped | No | — | Profile summary |
| Signed in, saved preferences | No | — | Profile summary |
