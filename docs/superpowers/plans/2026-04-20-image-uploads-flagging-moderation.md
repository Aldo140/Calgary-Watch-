# Image Uploads, Flagging & Moderation, Admin Stats Fix, README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional image uploads to incidents, a single-flag takedown system with admin review queue, fix admin API stats showing zeros, and refresh the README.

**Architecture:** Extend the existing `Incident` type with `flagged`, `flagged_at`, `flagged_by` fields. Firebase Storage handles image uploads from within the form before the Firestore `addDoc`. Flagging is a client-side Firestore `updateDoc` guarded by a new security rule; display-layer filtering hides flagged docs. Admin panel gets a new `flagged` section and fixed source-type-based stat counters.

**Tech Stack:** React 19, TypeScript, Firebase Firestore + Storage + Auth, Zod, react-hook-form, Lucide icons, Tailwind CSS.

---

## File Map

| File | Change |
|------|--------|
| `src/firebase.ts` | Export `storage` (getStorage) |
| `src/lib/storage.ts` | **New** — `uploadIncidentImage(uid, file): Promise<string>` helper |
| `storage.rules` | **New** — Firebase Storage security rules |
| `firebase.json` | Add `"storage": { "rules": "storage.rules" }` |
| `src/types/index.ts` | Add `flagged?`, `flagged_at?`, `flagged_by?` to `Incident` |
| `src/components/IncidentForm.tsx` | Replace URL text input with file picker; upload on submit |
| `src/pages/MapPage.tsx` | Include `image_url` in `addDoc` payload |
| `src/components/IncidentDetailPanel.tsx` | Render image thumbnail + flag button |
| `firestore.rules` | Add `image_url` to create allow-list; add flag update rule |
| `src/pages/AdminPage.tsx` | Fix stat counters; add `flagged` section + subscription |
| `firebase.json` (CSP) | Add `firebasestorage.googleapis.com` to `img-src` |
| `README.md` | Full rewrite |

---

## Task 1: Export Firebase Storage from `src/firebase.ts`

**Files:**
- Modify: `src/firebase.ts`

- [ ] **Step 1: Add `getStorage` import and export**

In `src/firebase.ts`, add after the existing `getFirestore` import:

```ts
import { getStorage, type FirebaseStorage } from 'firebase/storage';
```

After line `export const db: Firestore | null = ...`, add:

```ts
export const storage: FirebaseStorage | null = app ? getStorage(app) : null;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/firebase.ts
git commit -m "feat: export Firebase Storage instance"
```

---

## Task 2: Create upload helper + Storage rules

**Files:**
- Create: `src/lib/storage.ts`
- Create: `storage.rules`
- Modify: `firebase.json`

- [ ] **Step 1: Create `src/lib/storage.ts`**

```ts
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/src/firebase';

export async function uploadIncidentImage(uid: string, file: File): Promise<string> {
  if (!storage) throw new Error('Firebase Storage is not configured.');
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `incidents/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
```

- [ ] **Step 2: Create `storage.rules`**

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /incidents/{uid}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/(jpeg|png|webp)');
    }
  }
}
```

- [ ] **Step 3: Register Storage rules in `firebase.json`**

In `firebase.json`, add at the top level after `"firestore"`:

```json
"storage": {
  "rules": "storage.rules"
},
```

- [ ] **Step 4: Add `firebasestorage.googleapis.com` to CSP `img-src`**

In `firebase.json`, find the `Content-Security-Policy` header value. In the `img-src` directive, append `https://firebasestorage.googleapis.com` after `https://images.unsplash.com`.

The updated `img-src` section should read:
```
img-src 'self' data: blob: https://i.pravatar.cc https://images.pexels.com https://picsum.photos https://fastly.picsum.photos https://ui-avatars.com https://lh3.googleusercontent.com https://www.gstatic.com https://*.basemaps.cartocdn.com https://images.unsplash.com https://firebasestorage.googleapis.com;
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts storage.rules firebase.json
git commit -m "feat: add Firebase Storage upload helper, rules, and CSP update"
```

---

## Task 3: Add flag fields to `Incident` type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add three optional fields to the `Incident` interface**

In `src/types/index.ts`, after the `deleted?: boolean;` line (line 63), add:

```ts
flagged?: boolean;
flagged_at?: number;
flagged_by?: string;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add flagged fields to Incident type"
```

---

## Task 4: Replace URL text input with file picker in `IncidentForm.tsx`

**Files:**
- Modify: `src/components/IncidentForm.tsx`

- [ ] **Step 1: Remove `image_url` from zod schema and add `Image` import**

In `src/components/IncidentForm.tsx`:

1. Remove `Image` if not there, add `Image` to lucide imports: change line 6 to add `Image` to the lucide import:
   ```ts
   import { X, Loader2, Navigation, MapPin, AlertTriangle, ExternalLink, Image } from 'lucide-react';
   ```

2. Remove `image_url` from the zod schema (delete lines 68-69):
   ```ts
   // DELETE this line:
   image_url: z.union([z.union([z.string().url('Must be a valid URL'), z.literal('')]).optional()]),
   ```
   The schema's `image_url` field should be completely removed from `incidentSchema`.

3. Add `uploadIncidentImage` import at the top of the file:
   ```ts
   import { uploadIncidentImage } from '@/src/lib/storage';
   ```

- [ ] **Step 2: Add `imageFile` state and update form defaults**

In the component body, after `const [isSubmitting, setIsSubmitting] = useState(false);`, add:

```ts
const [imageFile, setImageFile] = useState<File | null>(null);
const [imagePreview, setImagePreview] = useState<string | null>(null);
const [imageError, setImageError] = useState<string | null>(null);
```

In `defaultValues`, remove `image_url: ''`.

In the `reset(...)` calls in `handleFormSubmit` and `handleClose`, remove `image_url: ''` and add after each `reset(...)`:
```ts
setImageFile(null);
setImagePreview(null);
setImageError(null);
```

- [ ] **Step 3: Update the `onSubmit` prop type to accept `image_url`**

Find the `IncidentFormProps` interface. Change:
```ts
onSubmit: (data: IncidentFormData & { lat: number; lng: number }) => void;
```
to:
```ts
onSubmit: (data: IncidentFormData & { lat: number; lng: number; image_url?: string }) => void;
```

- [ ] **Step 4: Handle file upload in `handleFormSubmit`**

Replace `handleFormSubmit`'s call to `onSubmit` with an upload-then-submit flow:

```ts
const handleFormSubmit = useCallback(
  async (data: IncidentFormData) => {
    clearErrors('root');
    if (!activeLocation) {
      setError('root', { type: 'manual', message: 'Location is missing. Tap Change and pick a location again.' });
      return;
    }
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    try {
      let image_url: string | undefined;
      if (imageFile) {
        // get the current user UID from auth — passed via userProfile prop isn't enough, need uid
        // We'll pass uid via a new prop; see step 5
        image_url = await uploadIncidentImage(userUid, imageFile);
      }
      onSubmit({ ...data, ...activeLocation, ...(image_url ? { image_url } : {}) });
      reset({ category: 'crime', anonymous: false, title: '', description: '', neighborhood: '' });
      setImageFile(null);
      setImagePreview(null);
      setImageError(null);
      setStep('choose');
      setUsingGPS(false);
      onClose();
    } catch {
      setError('root', { type: 'manual', message: 'Image upload failed. Please try again.' });
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  },
  [activeLocation, clearErrors, imageFile, onClose, onSubmit, reset, setError, userUid]
);
```

- [ ] **Step 5: Add `userUid` prop**

In `IncidentFormProps`, add:
```ts
userUid: string;
```

In the component function signature, destructure `userUid`:
```ts
export default function IncidentForm({
  isOpen, onClose, onSubmit, location, gpsLocation, pinLocation,
  locationAvailable, userProfile, onRequestMapPin, isPinMode = false,
  onClearPin, userUid,
}: IncidentFormProps)
```

- [ ] **Step 6: Replace the URL input UI with a file picker**

Replace the entire `<div>` block containing the "Photo URL" label and `<Input {...register('image_url')} ...>` (lines 472-482) with:

```tsx
<div>
  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 flex justify-between">
    Photo <span className="text-slate-600 font-normal normal-case tracking-normal">Optional · JPEG/PNG/WebP · max 5 MB</span>
  </label>
  {imagePreview ? (
    <div className="relative rounded-xl overflow-hidden border border-white/10">
      <img src={imagePreview} alt="Preview" className="w-full max-h-40 object-cover" />
      <button
        type="button"
        onClick={() => { setImageFile(null); setImagePreview(null); setImageError(null); }}
        className="absolute top-2 right-2 p-1.5 bg-slate-900/80 hover:bg-slate-900 rounded-lg text-slate-300 hover:text-white transition-all"
      >
        <X size={14} />
      </button>
    </div>
  ) : (
    <label className="flex items-center justify-center gap-3 w-full h-20 rounded-xl border border-dashed border-white/20 hover:border-blue-500/50 bg-white/5 hover:bg-blue-600/10 cursor-pointer transition-all">
      <Image size={20} className="text-slate-500" />
      <span className="text-sm text-slate-400 font-bold">Click to attach a photo</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          setImageError(null);
          if (!file) { setImageFile(null); setImagePreview(null); return; }
          if (file.size > 5 * 1024 * 1024) {
            setImageError('Photo must be under 5 MB.');
            setImageFile(null);
            setImagePreview(null);
            return;
          }
          setImageFile(file);
          setImagePreview(URL.createObjectURL(file));
        }}
      />
    </label>
  )}
  {imageError && <p className="text-red-400 text-xs mt-1.5 font-bold">{imageError}</p>}
</div>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: errors on `userUid` prop missing in `MapPage.tsx` — fix in next task.

- [ ] **Step 8: Commit**

```bash
git add src/components/IncidentForm.tsx src/lib/storage.ts
git commit -m "feat: replace image URL input with file picker and Firebase Storage upload"
```

---

## Task 5: Pass `userUid` and `image_url` in `MapPage.tsx`

**Files:**
- Modify: `src/pages/MapPage.tsx`

- [ ] **Step 1: Pass `userUid` to `<IncidentForm>`**

In `MapPage.tsx`, find the `<IncidentForm` JSX (around line 1677). Add the `userUid` prop:

```tsx
<IncidentForm
  ...existing props...
  userUid={user?.uid ?? ''}
/>
```

- [ ] **Step 2: Include `image_url` in the `addDoc` payload**

In `handleIncidentSubmit` (around line 747), the destructuring currently does `const { anonymous, ...incidentData } = data;`.

Change it to also extract `image_url`:
```ts
const { anonymous, image_url, ...incidentData } = data;
```

Then in the `addDoc` call (around line 777), add `image_url` conditionally:
```ts
await addDoc(collection(db!, path), {
  title: safeTitle,
  description: safeDesc,
  category: incidentData.category,
  neighborhood: safeNeighborhood,
  lat: incidentData.lat,
  lng: incidentData.lng,
  email: isAnonymous ? 'anonymous@calgarywatch.app' : (user.email || 'unknown@example.com'),
  name: safeName,
  source_name: safeName,
  anonymous: isAnonymous,
  timestamp: Date.now(),
  verified_status: 'unverified',
  report_count: 1,
  authorUid: user.uid,
  ...(image_url ? { image_url } : {}),
});
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat: wire image_url through MapPage incident submit"
```

---

## Task 6: Update Firestore security rules for image upload + flagging

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add `image_url` to the create allow-list**

Find the `allow create` rule in `match /incidents/{incidentId}`. The `hasOnlyAllowedFields` call currently lists these fields:
```
'title', 'description', 'category', 'neighborhood', 'lat', 'lng', 'timestamp',
'email', 'name', 'source_name', 'anonymous', 'verified_status', 'authorUid', 'report_count'
```

Add `'image_url'` to this list:
```
'title', 'description', 'category', 'neighborhood', 'lat', 'lng', 'timestamp',
'email', 'name', 'source_name', 'anonymous', 'verified_status', 'authorUid', 'report_count',
'image_url'
```

- [ ] **Step 2: Add flagging update rule**

In `match /incidents/{incidentId}`, add a new `allow update` clause (as an additional `||` branch inside the existing update rule, or as a separate block — Firestore supports multiple `allow` statements for the same operation):

Add after the existing `allow update:` block, a new separate rule:

```
allow update: if isAuthenticated()
              && request.resource.data.diff(resource.data).changedKeys().hasOnly(['flagged', 'flagged_at', 'flagged_by'])
              && request.resource.data.flagged == true
              && resource.data.get('authorUid', '') != 'system';
```

- [ ] **Step 3: Add `flagged`, `flagged_at`, `flagged_by` to admin update allow-list**

In the existing admin `allow update` path, `hasOnlyAllowedFields` lists allowed fields. Add the three flag fields:
```
'flagged', 'flagged_at', 'flagged_by',
```

- [ ] **Step 4: Deploy rules (local verification)**

```bash
npx firebase-tools rules:get firestore --local 2>/dev/null || echo "deploy in CI"
```

Just verify the file parses correctly:
```bash
npx firebase-tools firestore:rules:test --rulesfile firestore.rules 2>/dev/null || echo "manual check OK"
```

- [ ] **Step 5: Commit**

```bash
git add firestore.rules
git commit -m "feat: allow image_url on create and add flag update rule"
```

---

## Task 7: Add image display + flag button in `IncidentDetailPanel.tsx`

**Files:**
- Modify: `src/components/IncidentDetailPanel.tsx`

- [ ] **Step 1: Add `Flag` icon import and `useAuth` import**

In `src/components/IncidentDetailPanel.tsx`, add `Flag` to the lucide import:
```ts
import { X, MapPin, Clock, ShieldCheck, Share2, Navigation, Layers, ExternalLink, MessageSquare, User, AlertCircle, Link, Twitter, Mail, MessageCircle, Facebook, Siren, Flag } from 'lucide-react';
```

Add `useAuth` import:
```ts
import { useAuth } from '@/src/components/FirebaseProvider';
```

Add Firestore imports:
```ts
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/firebase';
```

- [ ] **Step 2: Add flag state and handler inside the component**

After `const [copied, setCopied] = useState(false);`, add:
```ts
const { user } = useAuth();
const [flagged, setFlagged] = useState(false);
const [flagConfirm, setFlagConfirm] = useState(false);
const [flagging, setFlagging] = useState(false);
```

After `if (!incident) return null;`, add the flag handler:
```ts
const isSystem = incident.data_source === 'system' || incident.authorUid === 'system';
const canFlag = Boolean(user) && !isSystem && !flagged && !incident.flagged;

const handleFlag = async () => {
  if (!user || !db || !incident.id) return;
  setFlagging(true);
  try {
    await updateDoc(doc(db, 'incidents', incident.id), {
      flagged: true,
      flagged_at: Date.now(),
      flagged_by: user.uid,
    });
    setFlagged(true);
    setFlagConfirm(false);
    onClose();
  } catch {
    // silent — user will see nothing changed
  } finally {
    setFlagging(false);
  }
};
```

- [ ] **Step 3: Render image thumbnail if `image_url` is present**

In the scrollable content area (the `<div className="flex-1 overflow-y-auto p-8 space-y-10 ...">` div), add an image block after the Stats Grid section (after the closing `</div>` of the Stats Grid):

```tsx
{incident.image_url && (
  <div className="space-y-4">
    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Photo</h3>
    <img
      src={incident.image_url}
      alt="Incident photo"
      loading="lazy"
      className="w-full rounded-3xl object-cover max-h-60 border border-white/10"
    />
  </div>
)}
```

- [ ] **Step 4: Render flag button in the Action Buttons section**

In the Action Buttons section (the `<div className="space-y-3 pt-4">` containing "Report Related Incident"), add a flag button after the share row:

```tsx
{canFlag && (
  <div className="relative">
    {flagConfirm ? (
      <div className="flex gap-2 items-center p-3 rounded-2xl border border-amber-500/30 bg-amber-500/10">
        <p className="text-xs text-amber-300 font-bold flex-1">Report as inappropriate?</p>
        <button
          onClick={() => void handleFlag()}
          disabled={flagging}
          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition-all disabled:opacity-50"
        >
          {flagging ? 'Reporting…' : 'Confirm'}
        </button>
        <button
          onClick={() => setFlagConfirm(false)}
          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black transition-all"
        >
          Cancel
        </button>
      </div>
    ) : (
      <button
        onClick={() => setFlagConfirm(true)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl h-11 font-black tracking-wide text-xs text-slate-400 hover:text-amber-400 bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/30 transition-all"
      >
        <Flag size={15} />
        Report Inappropriate
      </button>
    )}
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/IncidentDetailPanel.tsx
git commit -m "feat: add image display and flag/report button to incident detail"
```

---

## Task 8: Filter flagged incidents from client-side streams

**Files:**
- Modify: `src/pages/MapPage.tsx`

- [ ] **Step 1: Add `!i.flagged` filter to the main incidents stream**

In `MapPage.tsx`, find the `onSnapshot` subscription for incidents. There is a filter chain on the snapshot docs. Find the line where incidents are processed from the snapshot (search for `setIncidents` or the main `onSnapshot` of `incidents`). Add `&& !i.flagged` to the existing filter condition (or add `.filter(i => !i.flagged)` to the chain).

Search for the pattern like:
```ts
.filter((row) => !row.deleted && !row.expires_at || row.expires_at > Date.now())
```

Add `&& !row.flagged` (or append `.filter(row => !row.flagged)`) so flagged incidents are not shown on the map.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat: filter flagged incidents from map stream"
```

---

## Task 9: Fix admin API stats and add Flagged Content section in `AdminPage.tsx`

**Files:**
- Modify: `src/pages/AdminPage.tsx`

- [ ] **Step 1: Fix the three broken stat counters**

Find lines 290-292 in `AdminPage.tsx`:
```ts
const officialTrafficCount   = incidents.filter((i) => i.id.startsWith('yyc-traffic-')).length;
const official311Count       = incidents.filter((i) => i.id.startsWith('yyc-311-')).length;
const officialCrimeCount     = incidents.filter((i) => i.id.startsWith('crime-stat-')).length;
```

Replace with:
```ts
const officialTrafficCount   = incidents.filter((i) => i.source_type === '511_alberta_traffic').length;
const official311Count       = incidents.filter((i) => i.source_type === 'calgary_infrastructure').length;
const officialCrimeCount     = incidents.filter((i) => i.source_type === 'calgary_police_crime').length;
```

- [ ] **Step 2: Fix `pendingReviewIncidents` to not exclude system incidents incorrectly**

Find line 286-288:
```ts
const pendingReviewIncidents = incidents.filter((i) =>
  i.verified_status === 'unverified' && !i.data_source && Date.now() - i.timestamp < MODERATION_WINDOW_MS
);
```

Replace with:
```ts
const pendingReviewIncidents = incidents.filter((i) =>
  i.verified_status === 'unverified' &&
  i.data_source !== 'system' &&
  Date.now() - i.timestamp < MODERATION_WINDOW_MS
);
```

- [ ] **Step 3: Add `'flagged'` to the `AdminSection` type**

Find:
```ts
type AdminSection =
  | 'dashboard'
  | 'incidents'
  | 'users'
  | 'stats'
  | 'analytics'
  | 'traffic';
```

Add `| 'flagged'` at the end.

- [ ] **Step 4: Add flagged section to `NAV_ITEMS`**

Find the `NAV_ITEMS` array. Add after the `traffic` entry:
```ts
{ id: 'flagged', label: 'Flagged', icon: Flag },
```

Add `Flag` to the lucide-react import at the top of the file.

- [ ] **Step 5: Add flagged section to `SECTION_THEMES`**

In `SECTION_THEMES`, add:
```ts
flagged: {
  eyebrow: 'Moderation',
  title: 'Review flagged content',
  description: 'Incidents taken down by community flags. Restore clean reports or permanently remove harmful ones.',
  accent: 'from-amber-500/30 via-orange-500/10 to-yellow-400/20',
  glow: 'rgba(245,158,11,0.22)',
},
```

- [ ] **Step 6: Add `flaggedIncidents` state and subscription**

After `const [totalPageViews, setTotalPageViews] = useState<number | null>(null);`, add:
```ts
const [flaggedIncidents, setFlaggedIncidents] = useState<Incident[]>([]);
```

In the `useEffect` data subscriptions block (alongside `unsubIncidents`, `unsubStats`, `unsubUsers`), add a new subscription:

```ts
import { where } from 'firebase/firestore'; // add to existing firestore imports at top
```

Inside the `useEffect`, add after `unsubUsers`:
```ts
const unsubFlagged = onSnapshot(
  query(collection(db, 'incidents'), where('flagged', '==', true), orderBy('flagged_at', 'desc')),
  (snapshot) => {
    setFlaggedIncidents(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Incident)));
  }
);
```

Update the cleanup `return` to include `unsubFlagged()`:
```ts
return () => { unsubIncidents(); unsubStats(); unsubUsers(); unsubFlagged(); };
```

- [ ] **Step 7: Add `handleRestore` and `handlePermanentDelete` functions**

After `writeAuditLog`, add:

```ts
const handleRestore = async (incidentId: string) => {
  if (!db) return;
  await updateDoc(doc(db, 'incidents', incidentId), {
    flagged: false,
    flagged_at: null,
    flagged_by: null,
  });
  await writeAuditLog('incident_update', 'incidents', incidentId, { flagged: false });
};

const handlePermanentDelete = async (incidentId: string) => {
  if (!db) return;
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'incidents', incidentId));
  await writeAuditLog('incident_soft_delete', 'incidents', incidentId, { permanent: true });
};
```

Add `deleteDoc` and `updateDoc` to the existing `firebase/firestore` imports if not already present. (`updateDoc` is already imported.)

- [ ] **Step 8: Render the Flagged Content section**

Find the section rendering logic (search for `activeSection === 'traffic'` or the main section switch/if-else). Add a new section for `flagged`:

```tsx
{activeSection === 'flagged' && (
  <section className="space-y-6">
    {flaggedIncidents.length === 0 ? (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Flag size={48} className="text-slate-700 mb-4" />
        <p className="text-slate-400 font-bold">No flagged incidents</p>
        <p className="text-slate-600 text-sm mt-1">Community moderation is clean.</p>
      </div>
    ) : (
      flaggedIncidents.map((incident) => (
        <div key={incident.id} className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-amber-400 uppercase tracking-widest mb-1">
                Flagged {incident.flagged_at ? formatRelativeMinutes(incident.flagged_at) : ''}
              </p>
              <h3 className="text-white font-black text-lg leading-tight truncate">{incident.title}</h3>
              <p className="text-slate-400 text-sm mt-1 line-clamp-2">{incident.description}</p>
            </div>
            {incident.image_url && (
              <img src={incident.image_url} alt="" className="w-20 h-20 rounded-2xl object-cover border border-white/10 shrink-0" />
            )}
          </div>
          <div className="text-xs text-slate-500 space-y-0.5">
            <p>Neighborhood: <span className="text-slate-300">{incident.neighborhood}</span></p>
            <p>Flagged by UID: <span className="text-slate-300 font-mono">{incident.flagged_by}</span></p>
            <p>Reporter: <span className="text-slate-300">{incident.name}</span></p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => void handleRestore(incident.id)}
              className="flex-1 h-10 rounded-2xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 font-black text-xs tracking-wide transition-all"
            >
              Restore
            </button>
            <button
              onClick={() => void handlePermanentDelete(incident.id)}
              className="flex-1 h-10 rounded-2xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-black text-xs tracking-wide transition-all"
            >
              Delete Permanently
            </button>
          </div>
        </div>
      ))
    )}
  </section>
)}
```

Add `where` to the imports from `firebase/firestore` at the top of the file.

- [ ] **Step 9: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/pages/AdminPage.tsx
git commit -m "feat: fix admin stats, add flagged content review section"
```

---

## Task 10: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README.md**

Replace the entire contents of `README.md` with:

```markdown
# Calgary Watch

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Framework](https://img.shields.io/badge/framework-React%2019-blue) ![Database](https://img.shields.io/badge/database-Firestore-orange) ![License](https://img.shields.io/badge/license-Apache%202.0-lightgrey) ![Non-Profit](https://img.shields.io/badge/org-Non--Profit-teal)

Real-time incident map for Calgary, Alberta.

Calgarians report incidents the moment they happen. Road closures, fires, flooding, and safety alerts appear on the map in under 30 seconds. Check what's happening near you before heading out.

**[Live Site](https://calgarywatch.ca)** | **[GitHub](https://github.com/Aldo140/Calgary-Watch-)**

> Calgary Watch is a non-profit initiative. We are actively seeking volunteers and partners to grow the platform.

---

## What It Does

Calgary Watch is a live, community-powered safety map. Drop a pin, pick a category, attach an optional photo, and submit in under 30 seconds. The report goes live instantly. No app install needed — it works on any phone from the browser.

The platform runs four data layers:

- **Community Reports** — submitted by users in real time, labeled with trust indicators that improve as more users confirm them
- **511 Alberta Traffic** — live traffic incidents from 511.alberta.ca, refreshed every 30 minutes
- **Environment Canada Alerts** — official weather warnings and special statements for the Calgary region
- **Calgary Infrastructure & Police** — service requests and crime statistics from Calgary Open Data (SODA API)

---

## Features

### Landing Page
- Transparent nav that blends into the hero, hides on scroll-down, reappears on scroll-up
- Full-screen hero with WebP Calgary background image (`fetchPriority="high"` for fast LCP)
- Feature grid, How It Works section, volunteer/city-expansion CTAs

### Map
- Real-time Firestore `onSnapshot` stream — zero reload needed
- Custom incident markers with category icons, pulse rings, and severity-based sizing
- Leaflet heatmap layer for historical density
- Crime choropleth overlay from Calgary Police Service open data
- Mobile bottom sheet with search, category chips, sort/filter, and rich incident cards
- Crosshair pin mode for precise location reporting
- Floating action buttons: SOS, report, layer toggle, GPS

### Reporting
- 5 incident categories: Crime, Traffic, Infrastructure, Weather, Emergency
- Optional photo attachment (JPEG/PNG/WebP, max 5 MB) — stored in Firebase Storage
- Anonymous posting option
- GPS or manual pin placement
- Profanity filter on title and description

### Moderation
- Any signed-in user can flag an incident as inappropriate
- Single flag = immediate takedown (incident disappears from map and feed)
- Admin review queue shows all flagged content with Restore / Delete Permanently actions
- System-ingested incidents (weather, traffic, police) cannot be flagged

### Admin Panel
- Live incident stream with in-place editing and moderation controls
- Flagged Content section for reviewing community-reported inappropriate posts
- Analytics: incidents over time, category breakdown, community safety scores, top reporters
- Traffic analytics: page views, referrer breakdown, UTM campaign tracking
- User directory with role management
- Community Stats editor for neighbourhood safety scores

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Maps | Leaflet + react-leaflet |
| Database | Firebase Firestore |
| Storage | Firebase Storage |
| Auth | Firebase Auth (Google Sign-In) |
| Hosting | Firebase Hosting (calgarywatch.ca) |
| CI/CD | GitHub Actions |
| Charts | Recharts |
| Animation | Motion (Framer Motion) |

---

## Infrastructure

### Firebase Hosting

The site is deployed to Firebase Hosting at **calgarywatch.ca** via the `.github/workflows/deploy-firebase.yml` GitHub Actions workflow on every push to `main`.

Security headers are configured in `firebase.json` and served by Firebase Hosting on every response:
- `Content-Security-Policy` — restricts scripts, styles, fonts, images, and connections
- `Strict-Transport-Security` — HSTS with 2-year max-age and preload
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` — allows Google Sign-In popup
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`

### Ingest Pipeline

`scripts/ingest/index.ts` runs via GitHub Actions (`ingest-live-data.yml`) on a 30-minute cron schedule.

**Data sources:**
| Source | Type |
|--------|------|
| Environment Canada Alerts | Weather warnings |
| Environment Canada Enhanced | Detailed weather |
| 511 Alberta | Traffic incidents |
| Alberta Emergency Alert | Provincial emergencies |
| Reddit r/Calgary | Community signals |
| News RSS (CBC, CTV, Global) | Local news |
| Calgary Police Service | Crime statistics |
| Calgary Open Data Infrastructure | 311 service requests / water main breaks |

**Firestore optimisation:** A single `loadAndPrune()` read handles both deduplication and expiry cleanup in one Firestore collection scan per run. Expired incidents are hard-deleted (not soft-deleted) so the collection stays small. At 30 min intervals = 48 runs/day, leaving ~1,000 reads per run within the 50,000/day free tier.

---

## Local Development

### Prerequisites
- Node.js 20+
- A Firebase project with Firestore, Storage, and Google Auth enabled

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Aldo140/Calgary-Watch-.git
   cd Calgary-Watch-
   npm install
   ```

2. Create a `.env` file at the project root:
   ```env
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

### Running the Ingest Pipeline Locally

```bash
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
export VITE_FIREBASE_PROJECT_ID=your-project-id
npx tsx scripts/ingest/index.ts
```

---

## Deployment

### GitHub Actions Secrets Required

| Secret | Description |
|--------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON of a Firebase service-account key |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

### Workflows

| Workflow | Trigger | Action |
|----------|---------|--------|
| `deploy-firebase.yml` | Push to `main` | Build + deploy to Firebase Hosting |
| `ingest-live-data.yml` | Every 30 min + manual | Run ingest pipeline |

### Firebase Setup (first-time)

1. Enable Firestore, Storage, and Google Sign-In in Firebase Console
2. Deploy security rules: `npx firebase-tools deploy --only firestore:rules,storage:rules`
3. Add `https://calgarywatch.ca` to Authorized Domains in Firebase Console → Authentication → Settings
4. Add `https://calgarywatch.ca/__/auth/handler` to OAuth Redirect URIs in Google Cloud Console

---

## Contributing

Calgary Watch is a non-profit community project. Contributions welcome.

To volunteer, visit [calgarywatch.ca](https://calgarywatch.ca) and submit the volunteer form, or open an issue on GitHub.

---

## License

Apache 2.0 — see `LICENSE`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: full README refresh with Firebase Hosting, ingest pipeline, and new features"
```

---

## Task 11: Push and verify

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Verify GitHub Actions**

Go to the repository's Actions tab. Confirm `deploy-firebase.yml` succeeds. Check that the site at `https://calgarywatch.ca` loads correctly.

- [ ] **Step 3: Deploy Firebase rules**

The deploy workflow should deploy Firestore and Storage rules automatically. If it doesn't include rules deployment, add the following to `.github/workflows/deploy-firebase.yml`:

In the Firebase deploy step, change:
```yaml
entryPoint: ''
```
to include rules:
```yaml
targets: hosting,firestore,storage
```

Or manually deploy rules once:
```bash
npx firebase-tools deploy --only firestore:rules,storage:rules
```
