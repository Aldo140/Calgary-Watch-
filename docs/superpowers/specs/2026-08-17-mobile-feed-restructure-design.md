# Mobile Map Feed Restructure

**Date:** 2026-08-17
**Status:** Approved

## Problem

The mobile feed on `/map` is driven by a three-point vaul drawer (`['80px', 0.38, 0.82]`) whose responsibilities are split incoherently between `MapPage` and `MobileMapSheet`. Five defects follow from that split, and four of the five are structural rather than incidental:

1. **The top chrome goes dead when the sheet is expanded.** The tap-to-close scrim (`MapPage.tsx:2593`) is `fixed top-0 z-[49]` with `bottom: 82vh`, covering the top 18vh of the viewport. The chrome is `z-30` and sits inside that band at every common phone height — chips end at ~131px on a 844px viewport against a 152px scrim, ~104px against 120px on a 667px viewport, ~108px against 165px on 915px. Tapping a category chip, Home, or the first right-edge action button collapses the sheet instead of acting.
2. **The bar that looks like a search field is not one.** It is a snap toggle (`MapPage.tsx:2642`). The real input lives in the sheet, and `inputRef` (`MobileMapSheet.tsx:155`) is attached but never read — evidence autofocus was intended and never wired. Searching costs three taps.
3. **Three different counts for one feed, two visible simultaneously.** The chrome badge renders `filteredIncidentsCount`, derived from `incidents` and therefore ignoring both the time window and the 5-day decay. The sub-label and dot use `mapIncidents.length`. The sheet's rail shows `liveCount`, its Total box `filteredIncidents.length`. At rail state the badge and the rail are on screen together and can disagree.
4. **Selecting from the sheet never marks the row active.** `handleIncidentSelect` (`MobileMapSheet.tsx:266`) calls `mapRef` directly, bypassing `handleMarkerClick` — the only caller of `setActiveIncidentId`. The sheet accepts `activeIncidentId` for its highlight ring and `scrollIntoView`, so both only respond to map-marker taps. There is no `onIncidentClick` prop at all, unlike the desktop Sidebar.
5. **From peek there is no tap to close.** The scrim exists only at `0.82`, and the bar escalates peek → expanded, so collapsing from peek requires dragging.

Two further costs are worth naming because they motivate the shape of the fix. The category filter is **rendered twice** — once in the chrome (`MapPage.tsx:2673`), once in the sheet (`MobileMapSheet.tsx:401`) — over the same state, and the chrome copy is the one the scrim kills. And the same incident has **two card designs** (glance row at peek, full card at expanded), doubling the maintenance surface for one piece of data.

Underneath all of it, vaul mutates global `touch-action`/`overflow` during its open/close springs. `useDrawerOpen` (`MobileMapSheet.tsx:64`) and the `visibility: hidden` treatment on `Drawer.Content` both exist purely to contain a regression that has returned three times (`5cc5d0b → b60d6fa → 8b3a5e1`).

## Goals

1. Two sheet states, one card design, one copy of the category filter.
2. One tap from the chrome bar to a focused search field.
3. One derived count for the mobile feed.
4. Selecting a row behaves identically to tapping its marker.
5. Retire vaul from this sheet, and with it the invariant hook, the `visibility: hidden` hack, and the global `touch-action` mutation class.
6. Order by distance when the user's location is known, and state that distance in the row.

## Non-Goals

- The Near Me panel, the desktop `Sidebar`, `IncidentDetailPanel`, and `AreaIntelligencePanel` are untouched.
- vaul remains a dependency; `AreaIntelligencePanel` keeps using it. Only this sheet migrates.
- No change to any data pipeline, Firestore query, ingest script, or the incident schema.
- No change to desktop layout or behaviour at `lg:` and above.

---

## Design

### 1. State ownership

`MapPage` replaces the snap value with a two-state machine:

```ts
type SheetState = 'rail' | 'raised';
const [sheetState, setSheetState] = useState<SheetState>('rail');
```

The sheet stops reaching into the map. `mapRef` leaves its props; incident and neighbourhood selection route back up through callbacks that reuse `MapPage`'s existing handlers.

**New `MobileMapSheet` interface:**

```ts
interface MobileMapSheetProps {
  incidents: Incident[];              // feedIncidents, as today
  feedCount: number;                  // the one derived count (§4)
  timeWindow?: TimeWindow;
  onTimeWindowChange?: (v: TimeWindow) => void;
  selectedCategory: IncidentCategory | 'all';
  onCategoryChange: (c: IncidentCategory | 'all') => void;
  state: SheetState;
  onStateChange: (s: SheetState) => void;
  userLocation: { lat: number; lng: number } | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onIncidentClick: (i: Incident) => void;
  onNeighbourhoodSelect: (name: string) => void;
  onReportPress: () => void;
  activeIncidentId?: string | null;
  hidden: boolean;                    // form open OR pin mode
}
```

**Removed props:** `mapRef`, `snap`, `setSnap`, `liveCount`, `isPinMode`, `isFormOpen`.

`isPinMode` and `isFormOpen` collapse into `hidden`. Because the transform is ours, "hidden" means translating fully offscreen — which is what the `visibility: hidden` hack was approximating. `MapPage` computes `hidden={isFormOpen || isPinMode || isEmergencyPinMode}` and forces `sheetState` to `'rail'` on entering pin mode, replacing the sheet's self-collapsing effect.

**Bug #4 resolves here.** `onIncidentClick` is wired to a `MapPage` handler that calls the existing `handleMarkerClick` (which sets `activeIncidentId`, shows the popup, and flies) and then lowers the sheet to `'rail'`. A row tap and a marker tap become the same code path.

### 2. Sheet mechanics — `src/hooks/useSheetDrag.ts`

New hook, roughly 100 lines, owning the gesture:

```ts
useSheetDrag({ state, onStateChange, scrollRef, enabled })
  → { dragHandlers, offsetY, isDragging }
```

- Pointer events with `setPointerCapture`, so a drag survives leaving the element.
- `touch-action: none` applied **only to the drag zone**. Never to `document` or `body`. This scoping is the substantive difference from vaul and the reason the regression class disappears.
- The header is always a drag zone. The scroll container begins a drag only when `scrollRef.current.scrollTop === 0` **and** the gesture is downward; otherwise it scrolls untouched.
- `offsetY` is clamped so the sheet cannot be dragged above its raised position.
- Release commits the transition if travel exceeds 25% of the distance between states, or if velocity clears a threshold; otherwise it springs back to the state it started in.
- `pointercancel` reverts to the last committed state.
- `prefers-reduced-motion: reduce` skips the animation and applies state changes instantly.

The decision at release is extracted as a pure function so it can be tested without a DOM:

```ts
resolveDragEnd({ deltaY, velocity, travel, state }): SheetState
```

**Content stays mounted at all times**, translated rather than conditionally rendered, with `overflow: hidden` on the scroll container while railed. This is required by §3 and is the reason the conditional `isOpen && (...)` render gate is removed.

### 3. Search entry — `MapSheetRef.raiseAndFocusSearch()`

The sheet gains an imperative handle via `forwardRef` + `useImperativeHandle`, matching the established `MapRef` pattern in `Map.tsx:104`:

```ts
export interface MapSheetRef {
  raiseAndFocusSearch: () => void;
}
```

`MapPage` holds `sheetRef` and the chrome button calls it. The implementation focuses **synchronously inside the tap gesture**, then raises:

```ts
raiseAndFocusSearch: () => {
  inputRef.current?.focus({ preventScroll: true });
  onStateChange('raised');
}
```

**Why synchronously, and the known risk.** iOS Safari opens the software keyboard only when `focus()` is invoked synchronously within a user gesture, on an element already present in the DOM. Deferring to `requestAnimationFrame` after a state flip loses the keyboard. This is what forces always-mounted content in §2. `preventScroll: true` suppresses the scroll-into-view that focusing an offscreen input would otherwise trigger; it requires Safari 15+.

This is the one part of the design carrying genuine uncertainty and it **must be verified on a physical iOS device** before the work is called complete. Degradation is graceful rather than broken: if the keyboard does not appear on the first tap, the field is visible and focus-styled, and a second tap on it opens the keyboard.

**Bug #2 resolves here**, and `inputRef` becomes load-bearing.

### 4. Chrome, scrim, and counts

**Chrome contents** become: Home, the search-shaped button, the count badge. The category chip row is **deleted from the chrome** — the sheet holds the only copy.

**Scrim geometry.** The tap-to-close target stops at `top-0` and starts below the chrome instead. The chrome height is measured with a ref and published as a CSS custom property on the map shell (`--cw-chrome-h`), which the scrim consumes as its `top`. Measuring rather than hard-coding is deliberate: the chrome's height varies with `env(safe-area-inset-top)` across devices, and the current bug is precisely a hard-coded `18vh` assumption meeting a variable-height element. The chrome is also raised above the scrim in stacking order so Home and the near-me button stay live while the sheet is raised.

**Bug #1 resolves here**, twice over — the geometry is corrected, and the chips that were its worst victim are no longer there.

**Counts.** One value, derived once in `MapPage`:

```ts
const feedCount = useMemo(
  () => feedIncidents.filter(i => selectedCategory === 'all' || i.category === selectedCategory).length,
  [feedIncidents, selectedCategory],
);
```

- `filteredIncidentsCount` is **deleted** — it is the value that silently ignored the time window.
- The chrome badge and the sheet rail both render `feedCount`.
- The sheet's "Total" box is **removed**; the list already prints `N reports` directly above itself.
- `mapIncidents.length` survives only as the desktop status bar's marker count, where it is already labelled "Map Markers".

**Bug #3 resolves here.** **Bug #5 is moot** — with two states, lowering is available by drag-down, chevron tap, scrim tap, or selecting a row.

### 5. The row — `src/components/IncidentRow.tsx`

New extracted component. One uniform row, target height ~64px:

```
█ ⚠  Break and enter
█    2m · 400 m · Beltline   ● ›
```

Spine in `categoryColor(incident.category)`, category icon, title (single line, truncated), meta line `relative time · distance · neighbourhood`, a source dot (filled = community, hollow = official), chevron. Emergency retains its SOS ribbon and pulse. `data_source === 'demo'` retains `DemoBadge`.

Severity reads through spine colour and the ribbon, never through height — so there is exactly one row shape. Description, image, reporter, and verified-status chip move to `IncidentDetailPanel`, which is where a reader who wants them is already going. Both the glance-row and full-card branches are deleted; `MobileMapSheet.tsx` drops well under 500 lines.

The component is memoized and takes no callbacks beyond `onSelect`, so keeping the full page of rows mounted (§2) stays cheap.

### 6. Ordering

Sorting is extracted to `src/lib/feed.ts`, which owns both the type and the function so the test and the sheet import the same source:

```ts
export type SortBy = 'newest' | 'oldest' | 'verified' | 'nearest';
export function sortIncidents(
  list: Incident[],
  sortBy: SortBy,
  userLocation: { lat: number; lng: number } | null,
): Incident[];
```

`SortBy` moves out of `MobileMapSheet` to live here. Emergencies pin to the top in **every** mode, as they do today. Distance uses the `getDistance` helper already in `MapPage.tsx:36`, which moves to `src/lib/geo.ts` so the page, the sheet, and `feed.ts` can all import it without a cycle.

**Default resolution** — `resolveDefaultSort(persisted, hasLocation): SortBy`, also exported from `src/lib/feed.ts`. The sheet already persists sort to `localStorage` under `SORT_KEY`, so "default to nearest" needs an explicit precedence — otherwise a stored value and a new default silently contend:

1. A valid persisted value wins, **except** `'nearest'` with no location available.
2. Otherwise `'nearest'` when `userLocation` is present.
3. Otherwise `'newest'`.

Rule 1's exception matters because location permission can be granted on one visit and denied on the next; a stored `'nearest'` must not strand the feed in a mode it cannot compute. When that happens the effective sort falls to `'newest'` while the **stored** value is left untouched, so the preference returns intact once location is available again.

Distance formatting lands in `src/lib/format.ts`:

```ts
formatDistance(km: number): string   // 0.4 → "400 m", 1.24 → "1.2 km", 12 → "12 km"
```

The row omits the distance segment entirely when `userLocation` is null, rather than rendering a placeholder.

### 7. Error handling

| Condition | Behaviour |
|---|---|
| Geolocation denied / unavailable | No distance in row meta; `'nearest'` disabled with hint; effective sort `'newest'`. Reuses existing `locationError`. |
| Persisted sort is `'nearest'`, location now unavailable | Effective sort falls to `'newest'`; the stored preference is **not** overwritten, so it returns when location does (§6). |
| Location granted *while* the sheet is open | `'nearest'` becomes enabled and distances appear; the effective sort does not change under the user mid-read. |
| `pointercancel` mid-drag | Revert to last committed state; no partial transform left behind. |
| `prefers-reduced-motion: reduce` | State changes apply instantly, no transform animation. |
| Feed empty, no filters | Existing "All clear right now" state, retained. |
| Feed empty, filters active | Existing "No reports match" + Clear all filters, retained. |
| `hidden` true mid-drag | Drag aborts, sheet translates offscreen, state forced to `'rail'`. |

### 8. Testing

This repository's suite is `node:test` under `tsx` over pure modules (`tests/*.test.ts`); there is no DOM or component harness. The design therefore extracts decision logic into pure functions and is explicit about what only a device can confirm.

**Automated:**

- `tests/sheet-drag.test.ts` — `resolveDragEnd` as a table-driven reducer: below threshold springs back, above commits, velocity fling commits under threshold, direction respected from each state.
- `tests/feed-ordering.test.ts` — `sortIncidents`: emergency pinning holds in all four modes; `'nearest'` orders by true distance; `'nearest'` without location falls back without throwing; stable tie-breaks. Plus `resolveDefaultSort(persisted, hasLocation)` — also exported from `src/lib/feed.ts` — covering each branch of the §6 precedence, including a persisted `'nearest'` with no location and an unrecognised persisted value.
- `tests/format-distance.test.ts` — `formatDistance` boundaries: sub-km metres, km with one decimal, whole km above 10, zero.

**Manual device checklist** (the part the suite genuinely cannot cover):

1. iOS Safari — keyboard appears on the **first** tap of the chrome bar.
2. Pin-drop flow — enter pin mode from the raised sheet, drop a pin, confirm the form's inputs respond. This is the three-times regression; it is the single most important check.
3. Scrim geometry — Home, near-me, and a category chip all act correctly with the sheet raised, at 667 / 844 / 915px viewport heights.
4. Scroll-vs-drag — the list scrolls freely mid-list, and drags down only from `scrollTop === 0`.
5. Reduced motion — enabling it removes the animation without breaking state changes.

## Files

| File | Change |
|---|---|
| `src/components/MobileMapSheet.tsx` | Rewritten. Loses vaul, `useDrawerOpen`, the peek branch, both card designs, the Total box, `mapRef`. |
| `src/hooks/useSheetDrag.ts` | New. Gesture engine + `resolveDragEnd`. |
| `src/components/IncidentRow.tsx` | New. The one dense row. |
| `src/lib/geo.ts` | New. `getDistance`, moved out of `MapPage`. |
| `src/lib/feed.ts` | New. `SortBy` (moved out of `MobileMapSheet`) + `sortIncidents`. |
| `src/lib/format.ts` | New. `formatDistance`. |
| `src/pages/MapPage.tsx` | `sheetSnap` → `sheetState`; chrome loses chips; scrim geometry; `feedCount`; `filteredIncidentsCount` deleted; sheet callbacks wired. |
| `tests/sheet-drag.test.ts` | New. |
| `tests/feed-ordering.test.ts` | New. |
| `tests/format-distance.test.ts` | New. |

## Risks

1. **iOS synchronous focus (§3).** The one real unknown. Mitigated by always-mounted content and `preventScroll`, degrades gracefully, requires device verification.
2. **Owning scroll-vs-drag.** vaul solved this for us. Mitigated by the header-always / list-at-`scrollTop`-0 rule, and by scoping `touch-action` to the drag zone so Leaflet's own touch handling is never altered.
3. **Always-mounted rows** add render cost to the `/map` route. Mitigated by a memoized, callback-light `IncidentRow` and by the feed's existing 60-per-page bound.
4. **Losing the peek state** removes a glanceable middle position some users may rely on. Accepted: it cost a second card design, and the rail already carries the live count.
