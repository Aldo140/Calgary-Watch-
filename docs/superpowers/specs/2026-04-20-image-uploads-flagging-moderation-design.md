# Design: Image Uploads, Flagging & Moderation, Admin Stats Fix, README Refresh

**Date:** 2026-04-20  
**Status:** Approved

---

## 1. Scope

Four related work streams:

1. Optional image uploads on user-submitted incidents
2. Flag/report button with immediate takedown and admin review queue
3. Fix admin API stats (currently showing zeros)
4. Full README refresh

---

## 2. Data Model

**File:** `src/types/index.ts`

Add to the `Incident` interface:

```ts
flagged?: boolean;       // true = taken down pending admin review
flagged_at?: number;     // Unix ms
flagged_by?: string;     // UID of reporting user
```

`image_url?: string` already exists — no change needed.

**Constraints:**
- `flagged` is absent or false on all active incidents
- System-ingested incidents (`authorUid === 'system'`) cannot be flagged
- Ingest pipeline `loadAndPrune` skips docs where `flagged == true`

---

## 3. Image Upload Flow

**Files:** `src/components/IncidentForm.tsx`, Firebase Storage rules

### Upload
- Replace the existing `image_url` text input with `<input type="file" accept="image/jpeg,image/png,image/webp">`
- 5 MB client-side size check before upload; show inline error if exceeded
- On submit with a file selected: upload to `incidents/{uid}/{timestamp}-{filename}`, get download URL, store in `image_url`
- On submit without a file: `image_url` is omitted (no change to existing behaviour)

### Display
- In incident cards/detail views: if `image_url` present, render a lazy-loaded thumbnail (`loading="lazy"`) that expands on click
- System-ingested incidents never have images; no display logic needed for them

### Firebase Storage rules
```
match /incidents/{uid}/{allPaths=**} {
  allow read;
  allow write: if request.auth != null && request.auth.uid == uid;
}
```

---

## 4. Flag / Report Flow

**Files:** `src/components/IncidentCard.tsx` (or equivalent card component), `firestore.rules`

### UI
- Flag icon button on every incident card, visible to signed-in users only
- Hidden on system-ingested incidents (`authorUid === 'system'`)
- On click: confirmation popover "Report as inappropriate?" with Confirm / Cancel
- On confirm:
  1. Firestore update: `{ flagged: true, flagged_at: Date.now(), flagged_by: uid }`
  2. Incident immediately disappears (security rule denies reads for `flagged == true`)
  3. Toast: "Report submitted"

### Firestore security rules
Add to the `incidents` collection read rule:
```
allow read: if resource.data.flagged != true || request.auth.token.admin == true;
```

No rate limiting in this iteration — single flag = instant takedown.

---

## 5. Admin Review Queue

**File:** `src/pages/AdminPage.tsx`

### New "Flagged Content" tab
- Queries `incidents` where `flagged == true` (admin claim bypasses deny rule)
- Each card shows: full incident content, image (if any), flagged_by UID, flagged_at timestamp
- Two actions per card:
  - **Restore** — sets `flagged: false`, deletes `flagged_at` and `flagged_by` fields
  - **Delete permanently** — hard-deletes the Firestore doc
- No pagination (queue expected to be small)

---

## 6. Admin Stats Fix

**File:** `src/pages/AdminPage.tsx`

Stats currently show zeros. Root cause to be confirmed by reading the component before implementation, but the fix will target whichever Firestore query is broken (likely a missing `where` clause, wrong field name, or unhandled promise).

The fix will ensure all stat counters reflect real-time Firestore counts using the existing admin auth context.

---

## 7. README Refresh

**File:** `README.md`

Full rewrite covering:
- Project overview and live URL (`calgarywatch.ca`)
- Firebase Hosting setup and custom domain configuration
- Security headers (CSP, HSTS, COOP, etc.)
- Ingest pipeline: all data sources, cron schedule, Firestore quota optimisation
- Image upload feature and Firebase Storage setup
- Flag/moderation system
- Admin panel capabilities
- Local development setup
- Environment variables and secrets required
- Deployment workflow (GitHub Actions → Firebase Hosting)

---

## 8. Out of Scope

- Video uploads
- Multiple flags before takedown (threshold > 1)
- Email notifications to admins on new flags
- Image moderation (e.g., Cloud Vision API)
- Pagination of flagged content queue
