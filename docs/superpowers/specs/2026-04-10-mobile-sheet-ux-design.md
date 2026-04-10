# Mobile Sheet UX — Design Spec

**Date:** 2026-04-10
**Scope:** Sub-project A of the mobile map improvements

---

## Goal

Make the mobile bottom sheet and incident detail drawer feel native — snap to near-fullscreen on search focus, dismiss by tapping the exposed map area, and expand the service area boundary.

---

## Problems Being Solved

1. **Search focus doesn't expand the sheet** — tapping the search bar keeps the sheet at whatever snap it's at, leaving little room to type and see results.
2. **No tap-to-dismiss on the main sheet** — users must drag the sheet down to close it; the exposed map area above is not interactive.
3. **Incident detail panel doesn't close on overlay tap** — the dark backdrop above the panel should dismiss it but doesn't fire reliably.
4. **Service area boundary is too small** — the dashed rectangle covers only central Calgary; it should extend to surrounding communities.

---

## Changes

### 1. Search focus → snap to 0.82 (`MobileMapSheet.tsx`)

Add `onFocus={() => setSnap(0.82)}` to the search `<input>` element.

- Fires when the user taps the search bar on mobile
- Snaps the sheet to 82% height, giving full room to type and view results
- `onBlur` is left unchanged — the sheet stays at 0.82 after typing; user dismisses via tap target (see §2)
- No change to desktop behaviour (search input is not inside MobileMapSheet on desktop)

### 2. Transparent tap-to-close overlay (`MobileMapSheet.tsx`)

When `snap === 0.82`, render a `fixed` transparent `<div>` that covers the exposed map area above the sheet.

**Geometry:** The sheet at 0.82 occupies `82vh` from the bottom, so the tap target sits from `top: 0` to `bottom: 18vh` (i.e., `height: 18vh`). In practice, use `bottom: 82vh` and `top: 0` with `left: 0 right: 0`.

**Behaviour:**
- `onClick` → `setSnap('80px')` (collapses sheet back to tab)
- Only mounted when `snap === 0.82` — not present at `0.38` or `'80px'`, so it never blocks map interaction at lower snap positions
- `z-index` sits above the map but below the sheet itself and all sheet controls
- Fully transparent (`bg-transparent`) — the map is still visible through it
- `cursor-pointer` on desktop so the interaction feels deliberate

**What it does NOT do:**
- Does not show a backdrop or dim the map
- Does not intercept touch events at `0.38` snap

### 3. Incident detail overlay tap-to-close (`MobileBottomSheet.tsx`)

Add `onClick={onClose}` to the `Drawer.Overlay` element.

```tsx
// Before
<Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" />

// After
<Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" onClick={onClose} />
```

Vaul's `dismissible={true}` (the default) already handles drag-to-close. This wires up the tap path that vaul leaves unconnected by default. No other changes to MobileBottomSheet.

### 4. Service area boundary expansion (`Map.tsx`)

Expand the `calgaryBounds` in the service area effect:

```ts
// Before
const calgaryBounds = L.latLngBounds(
  [50.88, -114.35], // SW
  [51.22, -113.85], // NE
);

// After
const calgaryBounds = L.latLngBounds(
  [50.71, -114.60], // SW — ~20km further south and west
  [51.39, -113.60], // NE — ~20km further north and east
);
```

This doubles each dimension (4× area), extending coverage to:
- South: Okotoks / Midnapore
- North: Airdrie / Crossfield
- East: Chestermere / Langdon
- West: Cochrane / Springbank

Both the visual rectangle and the `isOutsideServiceArea` detection use `serviceAreaBounds`, so both update automatically from this one change.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/MobileMapSheet.tsx` | Add `onFocus` on search input; add transparent overlay div |
| `src/components/MobileBottomSheet.tsx` | Add `onClick={onClose}` on `Drawer.Overlay` |
| `src/components/Map.tsx` | Expand `calgaryBounds` coordinates |

---

## What Does NOT Change

- Desktop Sidebar behaviour (unaffected — MobileMapSheet is mobile-only)
- Vaul snap logic, drag behaviour, or animation
- The sheet's visual design at any snap point
- Incident detail panel content or layout
- Any other map layers or controls

---

## Success Criteria

- Tapping the search bar on mobile snaps the sheet to 82% height
- Tapping the visible map area above the expanded sheet collapses it to the tab state
- Tapping the dark overlay above the incident detail panel closes it
- The dashed service area rectangle visibly extends to cover Airdrie, Cochrane, Chestermere, and Okotoks
- No regressions on desktop (all changes are mobile-only or mobile-first)
