# Map API Fixes & CPS Crime Statistics — Design Spec
**Date:** 2026-04-20
**Branch:** fix/mobile-sheet-ux

## Problem Summary

Three distinct issues with the map data layer:
1. **Duplicate/noisy infrastructure pins** — Water Main API pulls 180 days of stale "ACTIVE" records; 311 API returns 100 records with most mapping to `traffic`, duplicating the City Traffic API
2. **Invisible crime pins** — Reddit/RSS crime incidents all fall back to `CALGARY_CENTER [51.0447, -114.0719]` when no neighborhood is mentioned; they stack invisibly at one point
3. **CPS crime statistics not surfaced as incidents** — The Calgary Police Service annual crime stats exist in `useCrimeStats` and drive the choropleth layer, but are not displayed as actionable incident cards

---

## Section 1 — Infrastructure & 311 Cleanup

### Water Main Breaks (`MapPage.tsx:199`)
- Change recency threshold: `180 * 24 * 60 * 60 * 1000` → `7 * 24 * 60 * 60 * 1000`
- Drops ~50 stale resolved-but-not-closed records, keeps only genuinely recent breaks

### 311 Service Requests (`MapPage.tsx:110–181`)
- Add date filter to query: `&$where=requested_date > '{7_days_ago_iso}'`
- Reduce `$limit` from `100` → `30`
- After the existing `boring` filter, add a second guard: skip any item whose resolved `category` is `'traffic'`
  - Rationale: road damage, potholes, signals, sidewalks are already covered by the City Traffic API (`35ra-9556.json`). Dropping them from 311 eliminates the most common duplicate category.
  - What remains: graffiti, bylaw violations, water/sewer issues, street light outages, hazards, bridge/infrastructure concerns

---

## Section 2 — Reddit Crime Location Fix

**File:** `scripts/ingest/sources/reddit.ts`

### Change
In `extractLocationFromText()` (line 161), change the final fallback from returning `CALGARY_CENTER` to returning `null`.

In the main post-processing loop inside `fetchRedditCalgary()`, skip any post where `extractLocationFromText` returns `null` — do not create a `NormalizedIncident` for it.

### Rationale
No pin is better than a phantom pin. Posts that mention a recognizable Calgary neighborhood ("beltline", "forest lawn", "bridgeland", etc.) or quadrant ("NW Calgary") still produce a correctly-placed pin. Posts that only say "Calgary" with no location are meaningless on a map.

### Impact
- Reduces total Reddit crime incident count on the map
- Eliminates the invisible stack at downtown coordinates
- Posts that do appear are genuinely locatable

---

## Section 3 — CPS Crime Statistics as Incident Cards

### New hook: `useCrimeStatIncidents`
Location: `src/hooks/useCrimeStatIncidents.ts`

**Data fetching:**
- Fetches `https://data.calgary.ca/resource/78gh-n26t.json?$limit=5000` (full dataset, filter to max year client-side — same pattern as existing `useCrimeStats`)
- Fetches `https://data.calgary.ca/resource/h3h6-kgme.json?$limit=5000`
- Both in parallel via `Promise.allSettled`
- Refreshes every 24 hours (data is not real-time)

**Aggregation per community:**
- Sum `crime_count` across all months and categories per community → `totalCrime`
- Sum `event_count` across all months per community → `totalDisorder`
- Find the dominant crime category (highest single-category count) per community

**Coordinate lookup:**
- Lowercase the community name and look it up in `NEIGHBOURHOOD_COORDS` (imported from `scripts/ingest/sources/reddit.ts` — extract to a shared module, or duplicate the table in the hook)
- Skip communities with no coordinate match (silent drop)

**Top 20 selection:**
- Sort by `totalCrime + totalDisorder` descending
- Take the top 20 communities that have a coordinate match

**Output shape — `Incident[]`:**
```ts
{
  id: `cps-crime-stat-${community.toLowerCase().replace(/\s+/g, '-')}`,
  title: `${dominantCategory} · ${titleCase(community)}`,
  description: `${totalCrime} criminal incidents and ${totalDisorder} disorder events reported in ${maxYear}. Source: Calgary Police Service Community Crime Statistics.`,
  category: 'crime',
  neighborhood: titleCase(community),
  lat: coords[0],
  lng: coords[1],
  timestamp: new Date('2024-01-01').getTime(), // sorts behind live incidents
  email: 'opendata@calgary.ca',
  name: 'Calgary Police Service',
  anonymous: false,
  verified_status: 'community_confirmed',
  report_count: totalCrime + totalDisorder,
  data_source: 'official',
  source_name: 'Calgary Police Service',
  source_url: 'https://data.calgary.ca/',
  expires_at: undefined, // annual stats, no expiry
}
```

### Integration into MapPage
- Add `useCrimeStatIncidents(isAuthReady)` alongside `useOfficialOpenData` and `useWeatherAlerts`
- Spread into the `incidents` memo: `[...firebaseIncidents, ...officialOpenData, ...weatherAlerts, ...crimeStatIncidents]`
- Deduplication by `id` (Map) handles any overlap

### Display behaviour
- These are regular `category: 'crime'` incidents — visible in `all` and `crime` filter views
- Appear in the sidebar as official incident cards with `source_name: 'Calgary Police Service'`
- Clicking opens the standard `IncidentDetailPanel`
- They cluster with other crime markers on the map
- The existing choropleth layer (`showCrimeLayer`) is unchanged — it remains an independent visual toggle

---

## Coordinate Table — Shared Module

The `NEIGHBOURHOOD_COORDS` table currently lives in `scripts/ingest/sources/reddit.ts`. It needs to be accessible to the new `useCrimeStatIncidents` hook in `src/`.

**Resolution:** Extract to `src/data/neighbourhoodCoords.ts` and import from both the hook and the ingest script.

---

## Files Changed

| File | Change |
|------|--------|
| `src/pages/MapPage.tsx` | Water main 7-day window; 311 date filter + limit + drop traffic category |
| `scripts/ingest/sources/reddit.ts` | `extractLocationFromText` returns `null` instead of city center; skip null-location posts |
| `src/hooks/useCrimeStatIncidents.ts` | New hook — fetches, aggregates, and returns CPS stats as `Incident[]` |
| `src/data/neighbourhoodCoords.ts` | New shared module extracted from reddit.ts |
| `src/pages/MapPage.tsx` | Wire `useCrimeStatIncidents` into `incidents` memo |

---

## Out of Scope
- Replacing the choropleth layer — it stays as-is
- Adding new Reddit neighborhood patterns (separate improvement)
- Changing the `IncidentDetailPanel` UI for crime stat cards
