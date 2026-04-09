# Mobile Map Sheet Redesign — Design Spec
**Date:** 2026-04-09  
**Status:** Approved

---

## Overview

Full redesign of `MobileMapSheet` to achieve desktop parity with the existing `Sidebar` component. Scope covers six areas:

1. Sheet structure & header — brand gradient stripe, richer collapsed bar, Report button
2. Search + category chips (with icons/counts) + filter controls (sort, verified, recent)
3. Neighborhood Pulse widget (extracted shared hook)
4. Upgraded incident cards, empty states, Load More
5. Incident click behavior (flyTo before popup) + map popup button swap
6. Top chrome cleanup — remove `showMobileFilters` and filter bar

Desktop layout (`lg:` breakpoint) is **not changed**. `Sidebar.tsx` is untouched except to import the extracted hook.

---

## Section 1: Sheet Structure & Header

### Snap states (unchanged)
| State | Height | Content |
|-------|--------|---------|
| Collapsed | 80px | Brand stripe + pulse dot + live count + Report pill |
| Peek | ~38vh | Brand stripe + search + category chips |
| Expanded | ~82vh | Full panel |

### Collapsed bar
- `h-1.5` brand gradient stripe at very top: `linear-gradient(to right, #4A90D9, #2E8B7A, #D4A843)`
- Green pulse dot + `{N} live reports` text (left)
- "Report +" pill button (right) → calls `onReportPress` prop
- Full bar is tappable → snaps to peek

### Peek / Expanded header
Below the drag handle, above search:
- Same `h-1.5` brand gradient stripe
- No separate title row needed — search bar provides context

### Top chrome cleanup
Remove from `MapPage.tsx`:
- `showMobileFilters` state
- `setShowMobileFilters` calls
- The `<AnimatePresence>` block containing the collapsible category row (~lines 948–978)
- The `<Filter>` icon button in the top chrome

---

## Section 2: Search + Category Chips + Filter Controls

### Search row (peek + expanded)
- Search input (existing debounce pattern, 200ms)
- Total-count badge on right: blue pill showing `filteredIncidents.length`, updates live
- Clear (×) button when search has text

### Category chips (peek + expanded)
Replace text-only pills with desktop-style chips:
- Icon + label + count badge per chip
- Categories: `All (Layers) / SOS (Siren) / Crime (AlertCircle) / Traffic (Car) / Infra (Construction) / Weather (CloudRain)`
- Count = incidents matching that category (unfiltered by other controls)
- Horizontally scrollable, `no-scrollbar`
- Selected state uses `category-chip-selected` class (light mode handled automatically)
- Unselected: `bg-slate-800/50 text-slate-400 border-white/5`

### Filter controls bar (expanded only)
A compact row below category chips, hidden at peek:

**Sort select** — `<select>` with options:
- `newest` → "Newest First"
- `oldest` → "Oldest First"  
- `verified` → "Most Verified"
- Persisted: `localStorage.setItem('cw_sortBy', value)`
- Initialised from `localStorage.getItem('cw_sortBy')` on mount

**Verified Only toggle pill** — active = `bg-emerald-500/20 text-emerald-400 border-emerald-500/40`
- Persisted: `cw_verifiedOnly`

**Recent 2h toggle pill** — active = `bg-blue-500/20 text-blue-400 border-blue-500/40`
- Persisted: `cw_recentOnly`

**Clear Filters button** — shown only when `verifiedOnly || recentOnly || search || selectedCategory !== 'all'`
- Resets all four to defaults

### Filtering logic (matches desktop exactly)
```ts
incidents
  .filter(i => !i.deleted)
  .filter(i => selectedCategory === 'all' || i.category === selectedCategory)
  .filter(i => !verifiedOnly || i.verified_status === 'community_confirmed')
  .filter(i => !recentOnly || (Date.now() - i.timestamp) <= 2 * 60 * 60 * 1000)
  .filter(i => !q || i.title.toLowerCase().includes(q) || i.neighborhood.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
  .sort((a, b) => {
    if (a.category === 'emergency' && b.category !== 'emergency') return -1;
    if (b.category === 'emergency' && a.category !== 'emergency') return 1;
    if (sortBy === 'newest') return b.timestamp - a.timestamp;
    if (sortBy === 'oldest') return a.timestamp - b.timestamp;
    if (sortBy === 'verified') {
      const score: Record<string, number> = { community_confirmed: 3, multiple_reports: 2, pending_review: 1, unverified: 0 };
      return (score[b.verified_status] ?? 0) - (score[a.verified_status] ?? 0);
    }
    return 0;
  })
```

---

## Section 3: Neighborhood Pulse

### Extraction
Extract `useNeighborhoodPulse` from `Sidebar.tsx` into `src/hooks/useNeighborhoodPulse.ts`.

```ts
// src/hooks/useNeighborhoodPulse.ts
export type RiskLevel = 'clear' | 'active' | 'high';
export interface NeighborhoodRisk { name: string; count: number; level: RiskLevel; }

export function useNeighborhoodPulse(incidents: Incident[]): NeighborhoodRisk[] {
  return useMemo(() => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const counts = new Map<string, number>();
    for (const inc of incidents) {
      if (inc.timestamp > twoHoursAgo && inc.deleted !== true && inc.neighborhood) {
        counts.set(inc.neighborhood, (counts.get(inc.neighborhood) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, count]) => ({
        name,
        count,
        level: count >= 3 ? 'high' : count >= 1 ? 'active' : 'clear',
      }));
  }, [incidents]);
}
```

`Sidebar.tsx` imports from this hook instead of defining it inline.

### Display (expanded only)
- Section header: `Activity size={12}` icon + "Live Area Pulse · 2h" label
- Rendered only when `neighborhoodPulse.length > 0`
- Risk config: `clear` = emerald, `active` = amber, `high` = red (same as desktop)
- Tapping a neighborhood pill: `mapRef.current?.flyTo(centroid.lat, centroid.lng, 13)` + `setSnap('80px')`
- Centroid derived from `getNeighborhoodCenter(incidents, name)` (average lat/lng of matching incidents)

---

## Section 4: Incident Cards, Empty States, Load More, Report Button

### Incident cards (peek: top 5 by recency; expanded: full filtered list)
Each card matches the desktop Card layout:
- Left `w-1` category color stripe (emergency=red-600/pulse, crime=red-500, traffic=orange-500, infra=blue-500, weather/other=purple-500)
- Category icon in `w-10 h-10` colored square (same color mapping)
- **Title** bold, 2-line clamp + source badge (Reddit/News/Official/Auto) + "New" pulse badge if < 30 min
- Second line: `{time} ago · {neighborhood} · by {firstName}`
- **Description** `text-xs text-slate-400 line-clamp-2 mt-1`
- Bottom row: status badge (community_confirmed=green/Resolved, multiple_reports=yellow/Critical, pending_review=slate, unverified=slate) + reporter initial avatar circle
- Emergency incidents: red SOS banner top-right, red ring, red icon bg
- Active incident (`activeIncidentId === incident.id`): blue ring + `animate-active-glow`

### Tap behavior
```ts
const handleIncidentSelect = (incident: Incident) => {
  setSnap('80px');
  // fly first, then popup after animation
  mapRef.current?.flyTo(incident.lat, incident.lng, 15, {
    onComplete: () => {
      window.requestAnimationFrame(() => mapRef.current?.showPopup(incident));
    }
  });
};
```
Note: `flyTo` already accepts an `onComplete` callback in `MapRef`. `onIncidentClick` from MapPage is NOT called here — the popup handles opening the detail panel via the "Details" button.

### Empty state
When `filteredIncidents.length === 0`:
- Search/filter active: `"No reports match"` + description + "Clear all filters" button
- No filters: `"All clear right now"` + description (no button)
- Same layout as desktop empty state

### Load More
- Shown at bottom of list when `hasMore` prop is true
- `"Load Older Reports"` button, disabled + `"Loading..."` text when `isLoadingMore`
- Calls `onLoadMore` prop

### Report button
- **Collapsed bar**: right-side pill `"Report +"` → calls `onReportPress`
- **Expanded footer**: full-width `"+ Report an Incident"` button above safe-area inset → calls `onReportPress`
- In `MapPage.tsx`: `onReportPress={() => { setSheetSnap('80px'); setIsFormOpen(true); }}`

---

## Section 5: Incident Click + Map Popup Swap

### Sheet card tap (covered in Section 4)
fly → popup. Detail panel only opens via popup "Details" button.

### Map popup button swap (`src/components/Map.tsx`)
Current button order and styling:
1. `learnMore` (primary blue) → "Area Intelligence" → `onViewNeighborhood`
2. `viewDetails` (ghost) → "Details" → `onViewIncident`

New button order and styling:
1. `viewDetails` (primary blue, `flex-1`) → **"Details"** → `onViewIncident`
2. `learnMore` (ghost) → **"Area Intel"** → `onViewNeighborhood`

Class changes in `Map.tsx`:
```js
// viewDetails becomes primary:
viewDetails.className = 'view-details-btn flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all';

// learnMore becomes secondary ghost:
learnMore.className = 'learn-more-btn py-2.5 px-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-all border border-white/10 text-[10px] font-black uppercase tracking-widest';
learnMore.textContent = 'Area Intel';
```

Popup click handler in `Map.tsx` is **unchanged** — class names are the same, only styles and text swap.

---

## Section 6: New MobileMapSheet Props

```ts
interface MobileMapSheetProps {
  // existing
  incidents: Incident[];
  selectedCategory: IncidentCategory | 'all';
  onCategoryChange: (cat: IncidentCategory | 'all') => void;
  onIncidentClick: (incident: Incident) => void;  // kept for non-sheet callers; sheet uses flyTo internally
  liveCount: number;
  mapRef: RefObject<MapRef | null>;
  isPinMode: boolean;
  theme?: 'dark' | 'light';
  snap: SnapPoint;
  setSnap: (s: SnapPoint) => void;
  // new
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onReportPress: () => void;
  activeIncidentId?: string | null;
}
```

`MapPage.tsx` additions:
```tsx
<MobileMapSheet
  // ...existing props...
  hasMore={hasMoreIncidents}
  isLoadingMore={isLoadingMoreIncidents}
  onLoadMore={handleLoadMoreIncidents}
  onReportPress={() => { setSheetSnap('80px'); setIsFormOpen(true); }}
  activeIncidentId={activeIncidentId}
/>
```

---

## Key Files

| File | Change |
|------|--------|
| `src/components/MobileMapSheet.tsx` | Full redesign |
| `src/hooks/useNeighborhoodPulse.ts` | New — extracted from Sidebar |
| `src/components/Sidebar.tsx` | Import hook, remove inline definition |
| `src/components/Map.tsx` | Swap popup button roles |
| `src/pages/MapPage.tsx` | Remove showMobileFilters, pass new props |

---

## Out of Scope
- Desktop Sidebar feature changes
- Map layer changes
- AreaIntelligencePanel changes
- Any backend/Firestore changes
