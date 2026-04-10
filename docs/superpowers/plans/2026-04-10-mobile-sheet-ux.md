# Mobile Sheet UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile bottom sheet feel native — search snaps to near-fullscreen, tapping the exposed map dismisses the sheet, the incident detail overlay is tappable to close, and the service area boundary covers a wider region.

**Architecture:** Four surgical edits across three files. No new components, no new hooks. The tap-to-close overlay lives in `MapPage.tsx` (which already owns `sheetSnap` state) rather than inside `MobileMapSheet` to avoid complications with vaul's `Drawer.Portal` children.

**Tech Stack:** React 19, Tailwind CSS, vaul (Drawer), Leaflet

---

## Files Modified

| File | Change |
|---|---|
| `src/components/MobileMapSheet.tsx` | Change `onFocus` handler on search input (line 288) |
| `src/pages/MapPage.tsx` | Add transparent tap-to-close overlay div adjacent to `<MobileMapSheet>` |
| `src/components/MobileBottomSheet.tsx` | Add `onClick={onClose}` to `Drawer.Overlay` (line 17) |
| `src/components/Map.tsx` | Expand `calgaryBounds` coordinates (lines 313–316) |

---

## Task 1: Search focus snaps sheet to 82%

**Files:**
- Modify: `src/components/MobileMapSheet.tsx` — line 288

- [ ] **Step 1: Find the current `onFocus` handler**

Open `src/components/MobileMapSheet.tsx`. Around line 288, find the search `<input>`:

```tsx
onFocus={() => { if (isCollapsed) setSnap(0.38); }}
```

- [ ] **Step 2: Replace with always-expand to 0.82**

Replace that one line:

```tsx
onFocus={() => setSnap(0.82)}
```

The full input element after the change (lines ~283–294):

```tsx
<input
  ref={inputRef}
  type="text"
  value={search}
  onChange={e => setSearch(e.target.value)}
  onFocus={() => setSnap(0.82)}
  placeholder="Search reports or neighborhoods…"
  className={cn(
    'flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-500 min-w-0',
    dark ? 'text-white' : 'text-slate-900',
  )}
/>
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -n "onFocus" src/components/MobileMapSheet.tsx
```

Expected output:
```
288:                    onFocus={() => setSnap(0.82)}
```

Only one `onFocus` should appear — if `0.38` appears anywhere in the output, you missed the edit.

- [ ] **Step 4: Commit**

```bash
git add src/components/MobileMapSheet.tsx
git commit -m "fix(mobile-sheet): snap to 82% on search focus"
```

---

## Task 2: Transparent tap-to-close overlay in MapPage

**Files:**
- Modify: `src/pages/MapPage.tsx` — find the `<MobileMapSheet>` block (around line 914)

The overlay must live in `MapPage` because that's where `sheetSnap` state lives (`const [sheetSnap, setSheetSnap] = useState<SnapPoint>('80px')`). When the sheet is at `0.82`, a transparent `fixed` div covers the top `18vh` of the screen (the exposed map area). Tapping it collapses the sheet.

- [ ] **Step 1: Find the MobileMapSheet block in MapPage.tsx**

Search for the comment `{/* Mobile Bottom Sheet */}` (around line 913). The block looks like:

```tsx
{/* Mobile Bottom Sheet */}
<MobileMapSheet
  incidents={incidents}
  selectedCategory={selectedCategory}
  ...
/>
```

- [ ] **Step 2: Add the overlay div immediately before `<MobileMapSheet>`**

Insert this block directly before the `<MobileMapSheet` opening tag:

```tsx
{/* Tap-to-close: transparent target covering exposed map when sheet is fully expanded */}
{sheetSnap === 0.82 && (
  <div
    className="fixed inset-x-0 top-0 z-[49] cursor-pointer lg:hidden"
    style={{ bottom: '82vh' }}
    onClick={() => setSheetSnap('80px')}
    aria-label="Tap to close sheet"
  />
)}
```

**Why these values:**
- `z-[49]` — below the sheet (`z-[50]`) but above Leaflet map tiles
- `style={{ bottom: '82vh' }}` — matches the 0.82 snap point so the overlay ends exactly where the sheet begins
- `lg:hidden` — never renders on desktop (desktop has no MobileMapSheet)
- `inset-x-0 top-0` — spans the full width from the top of the viewport

- [ ] **Step 3: Verify the overlay is only for mobile**

Run:
```bash
grep -n "lg:hidden\|z-\[49\]\|bottom.*82vh" src/pages/MapPage.tsx
```

Expected: three matches, all on the new overlay div.

- [ ] **Step 4: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "fix(mobile-sheet): add transparent tap-to-close overlay above expanded sheet"
```

---

## Task 3: Incident detail overlay tap-to-close

**Files:**
- Modify: `src/components/MobileBottomSheet.tsx` — line 17

- [ ] **Step 1: Find the `Drawer.Overlay` element**

Open `src/components/MobileBottomSheet.tsx`. Line 17 reads:

```tsx
<Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" />
```

- [ ] **Step 2: Add `onClick={onClose}`**

Replace line 17 with:

```tsx
<Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" onClick={onClose} />
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -n "Drawer.Overlay" src/components/MobileBottomSheet.tsx
```

Expected:
```
17:        <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" onClick={onClose} />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/MobileBottomSheet.tsx
git commit -m "fix(mobile-sheet): overlay tap closes incident detail drawer"
```

---

## Task 4: Expand service area boundary

**Files:**
- Modify: `src/components/Map.tsx` — lines 313–316

- [ ] **Step 1: Find the `calgaryBounds` definition**

Open `src/components/Map.tsx`. Around line 313, inside the service area `useEffect`, find:

```tsx
const calgaryBounds = L.latLngBounds(
  [50.88, -114.35], // SW
  [51.22, -113.85], // NE
);
```

- [ ] **Step 2: Replace with expanded bounds**

```tsx
const calgaryBounds = L.latLngBounds(
  [50.71, -114.60], // SW — extends to Okotoks / Cochrane
  [51.39, -113.60], // NE — extends to Airdrie / Chestermere
);
```

This doubles each dimension (~4× area):
- Lat span: `0.34°` → `0.68°`
- Lng span: `0.50°` → `1.00°`

- [ ] **Step 3: Verify**

Run:
```bash
grep -n "50\.\|51\.\|114\.\|113\." src/components/Map.tsx | grep "calgaryBounds\|latLngBounds\|50\.71\|51\.39\|114\.60\|113\.60"
```

Expected: the two coordinate lines with the new values. The old values `50.88`, `51.22`, `114.35`, `113.85` should not appear in the output.

- [ ] **Step 4: Commit**

```bash
git add src/components/Map.tsx
git commit -m "fix(map): expand service area boundary to cover Airdrie, Cochrane, Chestermere, Okotoks"
```

---

## Task 5: Manual verification pass

No automated tests exist for this UI behaviour. Verify on a mobile device or browser DevTools mobile emulation (iPhone 12 Pro or similar).

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open `http://localhost:5173/map` in DevTools with mobile emulation enabled.

- [ ] **Step 2: Verify search snap**

1. Load the map page — sheet starts collapsed (`80px` tab)
2. Tap the sheet handle to open it to peek (`0.38`)
3. Tap the search bar — sheet should jump to `0.82` (nearly full screen, ~18% of map visible at top)
4. Confirm the search input is focused and keyboard appears

- [ ] **Step 3: Verify tap-to-close overlay**

1. With sheet at `0.82`, tap the visible map area at the top of the screen
2. Sheet should snap back to `80px` (collapsed tab)
3. Confirm no tap occurs when sheet is at `0.38` (the overlay is not present — tapping map should do nothing special)

- [ ] **Step 4: Verify incident detail close**

1. Tap a marker on the map — popup appears
2. Tap "Details" in the popup — `MobileBottomSheet` opens with the incident detail
3. Tap the dark overlay area above the detail panel — panel should close
4. Confirm the map is back and the panel is gone

- [ ] **Step 5: Verify service area boundary**

1. Open the map and zoom out until the full dashed rectangle is visible
2. Confirm the rectangle is visibly larger than before — should extend toward Airdrie to the north, Okotoks to the south, Cochrane to the west, Chestermere to the east
3. Pan outside the new boundary and confirm the "outside service area" banner still appears
