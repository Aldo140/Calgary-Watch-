# Mobile Map Rework — Design Spec
**Date:** 2026-04-09  
**Status:** Approved

---

## Overview

Full rework of the Calgary Watch map page on mobile. Scope covers four areas:
1. Mobile bottom sheet replacing the slide-in sidebar drawer
2. Working unified search (incidents + neighborhoods)
3. Calgary Crime/Disorder Stats API integration (choropleth + detail panel)
4. Bug fixes (sun icon error, light mode, OG image)

Desktop layout (`lg:` breakpoint and above) is **not changed**.

---

## Section 1: Mobile Bottom Sheet Architecture

### Problem
The current mobile map opens a slide-in drawer (`isSidebarOpen`) that renders the full `Sidebar.tsx` component. This component was designed for desktop — it's content-heavy and cramped on mobile. The "search bar" in the top chrome is a fake button, not a real input.

### Solution: `MobileMapSheet` component
A new `src/components/MobileMapSheet.tsx` built on `vaul` (already a project dependency). `Sidebar.tsx` is untouched and continues to serve the desktop layout.

**3 snap states:**

| State | Height | Content |
|-------|--------|---------|
| Collapsed | ~60px | Drag handle + live incident count badge |
| Peek | ~38vh | Search input + category pills + top 5 compact incident cards |
| Expanded | ~82vh | Full search + complete filtered/sorted list |

**Top chrome bar change:**
The fake search bar button (currently opens the slide-in drawer) is converted to focus the bottom sheet's search input and snap to Peek state. The `isSidebarOpen` state and associated motion drawer are removed from mobile.

**Incident cards in the sheet:**
Compact design — category color stripe + icon + title + neighborhood + relative timestamp. No avatar, no description text, no stats. One tap: sheet closes, map flies to incident, detail panel opens.

### Files changed
- `src/components/MobileMapSheet.tsx` — new file
- `src/pages/MapPage.tsx` — replace `isSidebarOpen` drawer with `MobileMapSheet`, wire `mapRef` and incident props
- `src/components/MobileBottomSheet.tsx` — keep as generic wrapper (unchanged)

---

## Section 2: Unified Search

### Behavior
Single `<input>` inside the bottom sheet (and wired to the top chrome bar). Queries two datasets simultaneously client-side with no backend calls.

**Incident search:**
- Fuzzy match on `title`, `neighborhood`, `description`
- Ranking: exact neighborhood match → title match → description match
- Category filter pills apply on top of search results
- Uses same `searchQuery` + debounce pattern as existing `Sidebar.tsx`

**Neighborhood search:**
- Dynamic list: `[...new Set(incidents.map(i => i.neighborhood))]`
- Typing partial name (e.g. "belt") surfaces matching neighborhoods
- Displayed with a map-pin icon and "Fly to area" label
- Tap → `mapRef.current?.flyTo(lat, lng)` using community centroid coordinates derived from the GeoJSON boundaries already fetched for the choropleth layer (no separate static list)

**Result layout (inside sheet, peek/expanded state):**
1. Neighborhood matches (top, distinct style with location icon)
2. Incident matches (compact cards below)

**When no query:** show top incidents sorted by recency (default state).

### No backend required
All filtering runs against the already-loaded `incidents` array in memory.

---

## Section 3: Crime Stats Data Layer

### New APIs
| Endpoint | Dataset |
|----------|---------|
| `https://data.calgary.ca/resource/78gh-n26t.json` | Community Crime Statistics |
| `https://data.calgary.ca/resource/h3h6-kgme.json` | Community Disorder Statistics |

Both return aggregate counts by community name and year. No point coordinates — community-level only.

### New `useCrimeStats` hook
`src/hooks/useCrimeStats.ts`
- Fetches both APIs on mount (after `isAuthReady`)
- Filters to the most recent year available in each dataset
- Returns `Map<string, { crime: number; disorder: number }>` keyed by lowercase community name
- Refreshes every 24 hours (these are not real-time)

### Choropleth layer on the map
- Calgary community boundaries GeoJSON fetched from `https://data.calgary.ca/resource/surr-xmvs.json`
- Rendered as a Leaflet GeoJSON layer in `Map.tsx`
- Color scale per community:
  - No data → transparent
  - Low (0–5) → faint blue (`#3b82f620`)
  - Medium (6–15) → amber (`#f59e0b60`)
  - High (16+) → red (`#ef444460`)
- Layer is togglable via a new "Crime Stats" toggle in `LayerToggle.tsx`
- Layer sits below incident markers (z-index ordering)

### Neighborhood detail panel
When a community is tapped on the map or navigated to via search, `AreaIntelligencePanel` shows a new "Crime Statistics" card:
- Crime incidents (year)
- Disorder incidents (year)
- Source: City of Calgary Open Data

**No map pins from these APIs** — area-level data only, never rendered as point incidents.

---

## Section 4: Bug Fixes

### Bug: Sun icon → error screen
**Symptom:** Clicking the theme toggle (sun/moon icon) on mobile triggers the `ErrorBoundary` error screen.  
**Root cause:** To be confirmed during implementation — likely a component rendering in light mode that hits an unhandled case (e.g. a `light:` Tailwind variant that isn't configured as a plugin, or a component that crashes on the `light` class being added to `document.documentElement`).  
**Fix:** Add logging to `ErrorBoundary`, reproduce the crash, patch the offending component. Verify theme toggle works in both directions without error.

### Bug: Plus sign invisible/low-contrast in light mode
**Symptom:** The FAB report button's `+` icon has no explicit color — it inherits text color which is white in both modes.  
**Location:** `MapPage.tsx` line ~1494 — `<Plus size={28} className="transition-transform group-hover:rotate-90 duration-150" />`  
**Fix:** Add `light:text-slate-900` (or appropriate contrast color) to the Plus icon className. Audit surrounding FAB button light mode styles.

### Bug: Landing page light mode broken
**Symptom:** LandingPage.tsx has sections with hardcoded dark styles that don't adapt to light mode.  
**Fix:** Audit `LandingPage.tsx` for hardcoded `text-white`, `bg-slate-950`, `text-slate-400` etc. without `light:` variants. Add missing variants for affected sections.

### Fix: Facebook OG image
**Symptom:** Sharing `calgarywatch.ca` on Facebook shows the SVG icon instead of a proper preview image.  
**Current:** `og:image` → `icon.svg`  
**Fix:** Update `index.html` `og:image` and `twitter:image` to point to `https://calgarywatch.ca/images/hero-wide.webp` (already in `public/images/`). Dimensions: ensure image is 1200×630 or similar landscape ratio. Add explicit `og:image:width` and `og:image:height` meta tags.

---

## Out of scope
- Desktop layout changes
- News RSS re-integration (type definition kept; no active fetch)
- Reddit/311 source changes
- Admin page
- Any backend changes

---

## Key files
| File | Change |
|------|--------|
| `src/components/MobileMapSheet.tsx` | New |
| `src/hooks/useCrimeStats.ts` | New |
| `src/pages/MapPage.tsx` | Remove mobile drawer, add MobileMapSheet + useCrimeStats wiring |
| `src/components/Map.tsx` | Add choropleth GeoJSON layer |
| `src/components/LayerToggle.tsx` | Add Crime Stats toggle |
| `src/components/AreaIntelligencePanel.tsx` | Add crime stats section |
| `src/pages/LandingPage.tsx` | Light mode fixes |
| `index.html` | OG image update |
