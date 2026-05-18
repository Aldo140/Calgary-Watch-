# Onboarding Gate + Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the persistent onboarding panel for returning users, add a Skip option, and replace the Settings tab's address form with a personalized profile summary.

**Architecture:** All changes are confined to `src/pages/MapPage.tsx`. A single new Firestore field `onboardingCompletedAt` gates the auto-prompt. The settings right-panel gains two render modes: read-only summary (default) and edit form (on demand), controlled by local `isEditingPreferences` state.

**Tech Stack:** React, TypeScript, Firebase Firestore (`setDoc` with merge), Tailwind CSS, Lucide icons, motion/react

---

## File Map

| File | What changes |
|---|---|
| `src/pages/MapPage.tsx` | Everything — type, gate logic, callbacks, state, JSX |

---

### Task 1: Extend type + fix profileNeedsSetup gate

**Files:**
- Modify: `src/pages/MapPage.tsx:50-64` (type), `src/pages/MapPage.tsx:898-901` (gate)

- [ ] **Step 1: Add `onboardingCompletedAt` to `UserProfileSettings`**

In `src/pages/MapPage.tsx`, replace lines 50–64:

```ts
type UserProfileSettings = {
  uid?: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  role?: string;
  neighborhood?: string;
  inferredNeighborhood?: string;
  address?: string;
  locationPreferenceType?: 'address' | 'neighborhood';
  piiConsentAt?: number;
  weeklyDigestOptIn?: boolean;
  weeklyDigestTopics?: string[];
  profileUpdatedAt?: number;
  onboardingCompletedAt?: number;
};
```

- [ ] **Step 2: Replace `profileNeedsSetup` logic**

Replace lines 898–901:

```ts
  const profileNeedsSetup = Boolean(
    user && userProfile !== null && !userProfile.onboardingCompletedAt
  );
```

The `userProfile !== null` guard prevents the panel from flashing open while Firestore is still loading (during that window `userProfile` is `null`, not `{}`).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `onboardingCompletedAt` or `profileNeedsSetup`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat(onboarding): add onboardingCompletedAt type field and fix profileNeedsSetup gate"
```

---

### Task 2: Add skipOnboarding callback + update saveProfileSettings

**Files:**
- Modify: `src/pages/MapPage.tsx:908-945` (saveProfileSettings), add callback after it

- [ ] **Step 1: Update `saveProfileSettings` to stamp `onboardingCompletedAt`**

Replace the entire `saveProfileSettings` callback (lines 908–945):

```ts
  const saveProfileSettings = useCallback(async () => {
    if (!user || !db) return;
    const neighborhood = profileDraft.neighborhood.trim().slice(0, 80);
    const address = profileDraft.address.trim().slice(0, 160);
    const inferredNeighborhood = profileDraft.inferredNeighborhood.trim().slice(0, 80);
    if (!profileDraft.piiConsent || (!neighborhood && !address)) {
      setProfileSaveError('Please agree to the privacy obligations and add a neighbourhood or address.');
      return;
    }

    setIsSavingProfile(true);
    setProfileSaveError(null);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        displayName: user.displayName || userProfile?.displayName || 'Calgary User',
        email: user.email || userProfile?.email || '',
        photoURL: user.photoURL || userProfile?.photoURL || '',
        neighborhood,
        address,
        inferredNeighborhood,
        locationPreferenceType: address ? 'address' : 'neighborhood',
        piiConsentAt: userProfile?.piiConsentAt || Date.now(),
        onboardingCompletedAt: userProfile?.onboardingCompletedAt || Date.now(),
        weeklyDigestOptIn: profileDraft.weeklyDigestOptIn,
        weeklyDigestTopics: profileDraft.weeklyDigestOptIn
          ? ['weekly_crime_stats', 'neighbourhood_incidents', 'market_events', 'community_updates']
          : [],
        profileUpdatedAt: Date.now(),
      }, { merge: true });
      setAuthPanelOpen(false);
      setAuthPanelMode('signin');
    } catch (error) {
      console.error('Failed to save profile settings:', error);
      setProfileSaveError('Could not save your settings. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  }, [profileDraft, user, userProfile]);
```

- [ ] **Step 2: Add `skipOnboarding` callback immediately after `saveProfileSettings`**

```ts
  const skipOnboarding = useCallback(async () => {
    if (!user || !db) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { onboardingCompletedAt: Date.now() }, { merge: true });
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
    }
    setAuthPanelOpen(false);
    setAuthPanelMode('signin');
  }, [user]);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat(onboarding): add skipOnboarding callback and stamp onboardingCompletedAt on save"
```

---

### Task 3: Add isEditingPreferences state + isDirty derived value

**Files:**
- Modify: `src/pages/MapPage.tsx` — add state near other auth-panel state (around line 547), add derived value near `profileNeedsSetup` (around line 902)

- [ ] **Step 1: Add `isEditingPreferences` state**

Find the block of auth-panel state declarations (around line 547, near `isSavingProfile`). Add one line after `const [profileSaveError, setProfileSaveError] = useState<string | null>(null);`:

```ts
  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
```

- [ ] **Step 2: Add `isDirty` derived value**

Add immediately after the `profileNeedsSetup` line (after line 901):

```ts
  const isDirty =
    profileDraft.address !== (userProfile?.address ?? '') ||
    profileDraft.neighborhood !== (userProfile?.neighborhood ?? '') ||
    profileDraft.weeklyDigestOptIn !== (userProfile?.weeklyDigestOptIn ?? true);
```

- [ ] **Step 3: Reset `isEditingPreferences` when the auth panel closes**

Find `openAuthPanel` (line 563) and `setAuthPanelOpen(false)` inside the X close button onClick (around line 1321). After each `setAuthPanelOpen(false)`, also call `setIsEditingPreferences(false)`. Do the same in `skipOnboarding` and `saveProfileSettings` (already sets `setAuthPanelOpen(false)` — add `setIsEditingPreferences(false)` on the same line group).

In `openAuthPanel`:

```ts
  const openAuthPanel = useCallback((mode: 'signin' | 'settings' = 'signin') => {
    setAuthPanelMode(mode);
    setAuthPanelOpen(true);
    setShowUserMenu(false);
    setIsEditingPreferences(false);
  }, []);
```

In `skipOnboarding`, add `setIsEditingPreferences(false)` before `setAuthPanelOpen(false)`.

In `saveProfileSettings`, add `setIsEditingPreferences(false)` before `setAuthPanelOpen(false)`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat(settings): add isEditingPreferences state and isDirty derived value"
```

---

### Task 4: Simplify canCloseAuthPanel + add Skip button to onboarding panel

**Files:**
- Modify: `src/pages/MapPage.tsx:1273` (canCloseAuthPanel), `src/pages/MapPage.tsx:1499-1520` (buttons)

- [ ] **Step 1: Simplify `canCloseAuthPanel`**

Replace line 1273:

```ts
  const canCloseAuthPanel = Boolean(user);
```

Returning users can always close the panel via the X. The Skip button is the formal "don't ask again" path.

- [ ] **Step 2: Replace the onboarding panel button row**

Find the button row inside the profile step form (lines 1499–1520 — the `<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">` block). Replace it with:

```tsx
                      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        {profileNeedsSetup && (
                          <Button
                            variant="secondary"
                            onClick={skipOnboarding}
                            className="rounded-2xl border-white/10 bg-white/5 text-slate-400 light:border-slate-200 light:bg-white light:text-slate-500"
                          >
                            Skip for now
                          </Button>
                        )}
                        {!profileNeedsSetup && (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setIsEditingPreferences(false);
                              setProfileDraft({
                                neighborhood: userProfile?.neighborhood || '',
                                address: userProfile?.address || '',
                                inferredNeighborhood: userProfile?.inferredNeighborhood || '',
                                piiConsent: Boolean(userProfile?.piiConsentAt),
                                weeklyDigestOptIn: userProfile?.weeklyDigestOptIn !== false,
                              });
                              setProfileSaveError(null);
                            }}
                            className="rounded-2xl border-white/10 bg-white/5 light:border-slate-200 light:bg-white"
                          >
                            Cancel
                          </Button>
                        )}
                        {(profileNeedsSetup || isDirty) && (
                          <Button
                            onClick={saveProfileSettings}
                            disabled={isSavingProfile}
                            className="rounded-2xl bg-sky-600 hover:bg-sky-700"
                          >
                            {isSavingProfile ? 'Saving...' : 'Save and continue'}
                          </Button>
                        )}
                      </div>
```

Also remove the now-unused old `canCloseAuthPanel && Cancel` button that was previously in this section (the block you're replacing contains it already; confirm the old block is fully replaced and no duplicate Cancel button remains).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual check — browser**

Start the dev server:
```bash
npm run dev
```

Sign in as a new Google account (or one without `onboardingCompletedAt`). Verify:
- Panel opens automatically
- "Skip for now" button is visible
- Clicking Skip closes the panel and does NOT reopen on refresh/re-navigation
- Clicking Save with a valid address closes the panel and does not reopen

- [ ] **Step 5: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat(onboarding): simplify canCloseAuthPanel and add Skip button"
```

---

### Task 5: Settings tab — personalized profile summary view

**Files:**
- Modify: `src/pages/MapPage.tsx:1383-1522` (the `showProfileStep` right-panel content)

- [ ] **Step 1: Replace the right-panel profile content**

The current right panel renders a single form whenever `showProfileStep` is true. Replace the entire `showProfileStep` branch (the `<div className="space-y-5">` block starting at line 1384) with a two-mode component:

- **Summary mode**: shown when `!profileNeedsSetup && !isEditingPreferences`
- **Edit mode**: shown when `profileNeedsSetup || isEditingPreferences`

Replace the content of the `showProfileStep` true branch (from `<div className="space-y-5">` at line 1384 through the closing `</div>` at line 1521) with:

```tsx
                    <div className="space-y-5">
                      {/* ── Summary view (returning users, not editing) ─────── */}
                      {!profileNeedsSetup && !isEditingPreferences ? (
                        <>
                          {/* Google profile header */}
                          <div className="flex items-center gap-4">
                            {user?.photoURL ? (
                              <img
                                src={user.photoURL}
                                alt={user.displayName || 'Profile'}
                                referrerPolicy="no-referrer"
                                className="h-14 w-14 rounded-full object-cover ring-2 ring-sky-400/30"
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-xl font-black text-white">
                                {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-lg font-black text-white light:text-slate-950">
                                {user?.displayName || 'Calgary User'}
                              </p>
                              <p className="truncate text-xs text-slate-400 light:text-slate-500">
                                {user?.email}
                              </p>
                            </div>
                          </div>

                          {/* Preferences summary */}
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3 light:border-slate-200 light:bg-slate-50">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Report area</p>
                              <p className="mt-0.5 text-sm font-bold text-white light:text-slate-950">
                                {preferredAddress || preferredNeighborhood || preferredInferredNeighborhood || 'No location set'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Weekly digest</p>
                              <p className="mt-0.5 text-sm font-bold text-white light:text-slate-950">
                                {userProfile?.weeklyDigestOptIn !== false ? 'Enabled' : 'Off'}
                              </p>
                            </div>
                          </div>

                          <Button
                            variant="secondary"
                            onClick={() => setIsEditingPreferences(true)}
                            className="w-full rounded-2xl border-white/10 bg-white/5 light:border-slate-200 light:bg-white"
                          >
                            Edit preferences
                          </Button>
                        </>
                      ) : (
                        /* ── Edit / onboarding form ─────────────────────────── */
                        <>
                          <div>
                            <p className="text-xs font-black uppercase tracking-widest text-sky-400">
                              {profileNeedsSetup ? 'Required setup' : 'Edit preferences'}
                            </p>
                            <h3 className="mt-2 text-2xl font-black text-white light:text-slate-950">Local report preferences</h3>
                            <p className="mt-2 text-sm leading-relaxed text-slate-400 light:text-slate-600">
                              Add either an address or a neighbourhood. Address is first because it gives better guesses; neighbourhood is the broader fallback.
                            </p>
                          </div>

                          <div className="rounded-2xl border border-sky-400/20 bg-sky-400/8 p-3 text-xs leading-relaxed text-slate-300 light:text-slate-700">
                            Choose one: use an address for a tighter report area, or use a neighbourhood name if you prefer not to store an address.
                          </div>

                          <div className="grid gap-4">
                            <label className="space-y-2">
                              <span className="flex items-center justify-between gap-3">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Address or nearby landmark</span>
                                <span className="text-[10px] font-bold text-sky-400">Recommended</span>
                              </span>
                              <input
                                value={profileDraft.address}
                                onChange={(e) => {
                                  const address = e.target.value;
                                  setProfileDraft((prev) => ({ ...prev, address, inferredNeighborhood: '', neighborhood: address.trim() ? '' : prev.neighborhood }));
                                }}
                                placeholder="Start typing an address, street, or landmark"
                                className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none focus:border-sky-400 light:border-slate-300 light:bg-white light:text-slate-950"
                              />
                              <div className="min-h-6">
                                {profileDraft.address.trim().length > 0 && addressSuggestions.length === 0 && addressQuery.length < 4 && (
                                  <p className="text-[11px] font-medium text-slate-500">Keep typing for address guesses.</p>
                                )}
                                {addressSuggestions.length > 0 && (
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {addressSuggestions.map((item) => (
                                      <button
                                        key={`${item.label}-${item.neighborhood}`}
                                        type="button"
                                        onClick={() => setProfileDraft((prev) => ({ ...prev, address: item.label, inferredNeighborhood: item.neighborhood, neighborhood: '' }))}
                                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-bold text-slate-300 hover:border-sky-400/50 hover:text-white light:border-slate-200 light:bg-slate-50 light:text-slate-700 light:hover:border-sky-500"
                                      >
                                        <span className="block truncate">{item.label}</span>
                                        {item.neighborhood && <span className="mt-0.5 block text-[10px] font-medium text-slate-500">Best area: {item.neighborhood}</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </label>

                            <div className="flex items-center gap-3">
                              <div className="h-px flex-1 bg-white/10 light:bg-slate-200" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">or</span>
                              <div className="h-px flex-1 bg-white/10 light:bg-slate-200" />
                            </div>

                            <label className="space-y-2">
                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Neighbourhood only</span>
                              <input
                                value={profileDraft.neighborhood}
                                onChange={(e) => {
                                  const neighborhood = e.target.value;
                                  setProfileDraft((prev) => ({ ...prev, neighborhood, inferredNeighborhood: '', address: neighborhood.trim() ? '' : prev.address }));
                                }}
                                placeholder="Start typing a Calgary neighbourhood"
                                className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none focus:border-sky-400 light:border-slate-300 light:bg-white light:text-slate-950"
                              />
                              <div className="min-h-6">
                                {profileDraft.neighborhood.trim().length > 0 && filteredNeighborhoodSuggestions.length === 0 && neighborhoodQuery.length < 3 && (
                                  <p className="text-[11px] font-medium text-slate-500">Type at least 3 letters for neighbourhood guesses.</p>
                                )}
                                {filteredNeighborhoodSuggestions.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {filteredNeighborhoodSuggestions.map((name) => (
                                      <button
                                        key={name}
                                        type="button"
                                        onClick={() => setProfileDraft((prev) => ({ ...prev, neighborhood: name, inferredNeighborhood: '', address: '' }))}
                                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 hover:border-sky-400/50 hover:text-white light:border-slate-200 light:bg-slate-50 light:text-slate-700 light:hover:border-sky-500"
                                      >
                                        {name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </label>
                          </div>

                          <label className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 light:border-slate-200 light:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={profileDraft.piiConsent}
                              onChange={(e) => setProfileDraft((prev) => ({ ...prev, piiConsent: e.target.checked }))}
                              className="mt-1 h-4 w-4 rounded border-slate-400"
                            />
                            <span className="text-sm leading-relaxed text-slate-300 light:text-slate-700">
                              I agree Calgary Watch may store my profile details and location preference as personal information for account, safety, moderation, and neighbourhood-report features.
                            </span>
                          </label>

                          <label className="flex gap-3 rounded-2xl border border-teal-400/20 bg-teal-400/8 p-4">
                            <input
                              type="checkbox"
                              checked={profileDraft.weeklyDigestOptIn}
                              onChange={(e) => setProfileDraft((prev) => ({ ...prev, weeklyDigestOptIn: e.target.checked }))}
                              className="mt-1 h-4 w-4 rounded border-slate-400"
                            />
                            <span className="text-sm leading-relaxed text-slate-300 light:text-slate-700">
                              Send me weekly crime stats, interesting reports, market/events, and relevant community updates for my neighbourhood.
                            </span>
                          </label>

                          {profileSaveError && <p className="text-sm font-bold text-red-400">{profileSaveError}</p>}

                          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            {profileNeedsSetup && (
                              <Button
                                variant="secondary"
                                onClick={skipOnboarding}
                                className="rounded-2xl border-white/10 bg-white/5 text-slate-400 light:border-slate-200 light:bg-white light:text-slate-500"
                              >
                                Skip for now
                              </Button>
                            )}
                            {!profileNeedsSetup && (
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setIsEditingPreferences(false);
                                  setProfileDraft({
                                    neighborhood: userProfile?.neighborhood || '',
                                    address: userProfile?.address || '',
                                    inferredNeighborhood: userProfile?.inferredNeighborhood || '',
                                    piiConsent: Boolean(userProfile?.piiConsentAt),
                                    weeklyDigestOptIn: userProfile?.weeklyDigestOptIn !== false,
                                  });
                                  setProfileSaveError(null);
                                }}
                                className="rounded-2xl border-white/10 bg-white/5 light:border-slate-200 light:bg-white"
                              >
                                Cancel
                              </Button>
                            )}
                            {(profileNeedsSetup || isDirty) && (
                              <Button
                                onClick={saveProfileSettings}
                                disabled={isSavingProfile}
                                className="rounded-2xl bg-sky-600 hover:bg-sky-700"
                              >
                                {isSavingProfile ? 'Saving...' : 'Save and continue'}
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
```

- [ ] **Step 2: Remove old duplicate button row from Task 4**

Task 4 replaced the button row inside the old form. Since Task 5 replaces the entire `showProfileStep` content block (which includes those buttons), confirm the old partial replacement from Task 4 is no longer present. The code above is the authoritative final form. If there's any remnant of a second button block, delete it.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual check — browser, full flow**

```bash
npm run dev
```

**New user flow:**
1. Sign in for the first time → panel opens automatically
2. Close panel with X → panel re-opens on next sign-in (no `onboardingCompletedAt` yet)
3. Click "Skip for now" → panel closes, does NOT reopen on refresh
4. Sign in again → panel does NOT open, map loads directly
5. Click Settings gear → panel opens showing profile summary with Google photo, "No location set"
6. Click "Edit preferences" → edit form appears
7. Type in address field → Save button appears
8. Clear the field back → Save button disappears (not dirty)
9. Change weekly digest toggle → Save button appears
10. Click Cancel → returns to summary, form resets

**Returning user with saved profile:**
1. Sign in → no panel, map loads
2. Click Settings → summary view with Google photo, saved address, digest status
3. Edit preferences → form, dirty-state Save button, Cancel

- [ ] **Step 5: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat(settings): personalized profile summary view with Google photo and dirty-state save"
```
