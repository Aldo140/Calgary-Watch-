# Multi-City API Expansion Design

**Date:** 2026-05-24
**Status:** Approved

## Overview

Calgary Watch's map service area now extends from southern Alberta to Edmonton. This spec covers adding official data feeds for Edmonton and annual crime baselines for surrounding RCMP-policed towns (Airdrie, Cochrane, Okotoks, Canmore, High River, Strathmore, Chestermere), plus expanding weather coverage to all new cities.

## Current State

All official data feeds are Calgary-specific:

| Hook / Source | Data | Cities |
|---|---|---|
| `useCrimeStats` | Crime + disorder stats | Calgary only |
| `useOfficialOpenData` (MapPage) | Traffic, 311, water main | Calgary only |
| `usePropertyAssessments` | Property assessed values | Calgary only |
| Open-Meteo weather | Weather alerts | 5 Calgary zones only |
| Nominatim | Address geocoding | All Alberta |

## API Landscape

### Edmonton (`data.edmonton.ca` — Socrata, same tech as `data.calgary.ca`)

| Dataset | Resource ID | Update Freq | Lat/Lng |
|---|---|---|---|
| Bylaw Complaint Details | `ypje-j649` | Near real-time | Exact |
| 311 Requests | `q7ua-agfg` | 2× daily | Neighbourhood centroid |
| Traffic Disruptions | `k4tx-5k8p` | Real-time | Exact (GeoJSON order) |
| EPS Crime Stats (neighbourhood) | `xthe-mnvi` | Monthly | Neighbourhood aggregate |

### Smaller RCMP towns (Airdrie, Cochrane, Okotoks, Canmore, High River, Strathmore, Chestermere)

No real-time APIs exist. Individual municipal portals (ArcGIS Hub) contain GIS boundary data only — no safety or incident data.

Best available: **Statistics Canada Table 35-10-0183-01** — incident-based crime statistics by police service in Alberta, 1998–2024, annual. Bulk CSV via WDS API:
```
GET https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/35100183/en
```
Returns JSON `{ object: "<zip-url>" }`. Unzip → parse CSV → filter to Alberta detachments.

CORS: StatsCan WDS endpoint is browser-accessible (permissive CORS headers confirmed).

## What We Are Building

Four independent additions, all additive — no existing hooks or components need structural changes.

### 1. `useEdmontonOpenData` hook

**File:** `src/hooks/useEdmontonOpenData.ts`

Mirrors the `useOfficialOpenData` function in `MapPage.tsx`. Returns `Incident[]`, refreshes every 5 minutes.

**Three feeds:**

**Bylaw Complaints** (`ypje-j649`)
- Query: `$where=date_created >= '<now-48h>'&$limit=200&$order=date_created DESC`
- Category mapping:
  - Noise, Cannabis → `disorder`
  - Abandoned Vehicle, Wrecked Vehicle, Unsightly Premises → `infrastructure`
  - All others → `infrastructure`
- Fields: `latitude`, `longitude`, `neighbourhood`, `complaint_category`, `date_created`
- Incident ID prefix: `edm-bylaw-{row_id}`

**311 Requests** (`q7ua-agfg`)
- Query: `$where=date_created >= '<now-24h>'&$limit=200&$order=date_created DESC`
- Filter to safety-relevant `service_category`: Road Hazards, Graffiti, Illegal Dumping, Drainage, Potholes
- Lat/lng: `nbhd_latitude` / `nbhd_longitude` (neighbourhood centroid — privacy-protected, acceptable)
- Category: `infrastructure`
- Incident ID prefix: `edm-311-{row_id}`

**Traffic Disruptions** (`k4tx-5k8p`)
- Query: `$where=status='Active'&$limit=100`
- `point.coordinates` is `[lng, lat]` GeoJSON order — swap on ingest
- Category: `traffic`
- Incident ID prefix: `edm-traffic-{disruption_id}`

**Shared fields for all three:**
```ts
data_source: 'official'
source_name: 'City of Edmonton Open Data'
source_url: 'https://data.edmonton.ca/'
email: 'opendata@edmonton.ca'
expires_at: now + 2 * 60 * 60 * 1000
verified_status: 'community_confirmed'
report_count: 1
anonymous: false
```

**MapPage integration:** Call `useEdmontonOpenData(isAuthReady)` and spread into `officialIncidents` alongside the existing Calgary feeds.

---

### 2. EPS Crime Stats (extend `useCrimeStats`)

**File:** `src/hooks/useCrimeStats.ts` — extend existing `useEffect`

Add a second `Promise.allSettled` fetch pair for Edmonton inside the same effect, merge results into the same `stats` and `yearlyStats` Maps.

**EPS dataset fields** (different schema from Calgary):
| EPS field | Calgary equivalent |
|---|---|
| `neighbourhood_name` | `community` |
| `occurrence_year` | `year` |
| `occurrence_group` | `category` |
| `occurrence_count` | `crime_count` |

**Classification:** `"Violent Crime"` → violent, `"Property Crime"` → property, `"Disorder"` → disorder.

**Key namespacing:** Store Edmonton entries as `edmonton:${neighbourhood_lowercase}`. This prevents collisions — "downtown" in Calgary and "downtown" in Edmonton are distinct keys.

**`resolveKey` in MapPage:** `geocodeToCalgarySuburb` returns `addr.suburb || addr.neighbourhood || addr.city_district || addr.quarter`. For Edmonton addresses, Nominatim also returns `addr.city === 'Edmonton'`. Extend `geocodeToCalgarySuburb` to return `{ suburb: string; city: string }` (or keep the string return and add a separate `geocodeToCalgaryCity` helper). When `city === 'Edmonton'`, `resolveKey` checks `edmonton:${key}` before the bare `key`. When `city === 'Calgary'` or city is absent, the existing bare-key logic applies.

**`computeCityAverages`:** Unchanged — averages across all entries. City-specific averages are a future improvement.

---

### 3. `useAlbertaMunicipalityCrimeStats` hook

**File:** `src/hooks/useAlbertaMunicipalityCrimeStats.ts`

Fetches Statistics Canada bulk CSV, parses it in the browser, returns the same `CrimeStatEntry` / `CrimeYearEntry` shape as `useCrimeStats`. Results are module-level cached (fetch once per session — the ZIP is ~5MB).

**Fetch flow:**
```
1. GET https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/35100183/en
   → { object: "https://www150.statcan.gc.ca/.../<zip-file>.zip" }
2. GET <zip-url> → ArrayBuffer
3. Decompress with `fflate` (add to dependencies)
4. Parse CSV text
5. Filter rows: GEO column contains one of the covered detachment names
6. Build Map<string, CrimeStatEntry> and Map<string, CrimeYearEntry[]>
```

**Covered detachments** (substring-matched against `GEO` column):
- `"Airdrie"`, `"Cochrane"`, `"Okotoks"`, `"Canmore"`, `"High River"`, `"Strathmore"`, `"Chestermere"`

**Keys:** `municipality_lowercase` (e.g. `"airdrie"`, `"cochrane"`) — no namespace prefix needed since these names don't appear in Calgary or Edmonton stats.

**CSV field mapping:**
- `REF_DATE` → year
- `VALUE` → count
- `Violations` column → classify as violent / property / disorder using keyword matching
- Latest year → `CrimeStatEntry`; last 6 years → `CrimeYearEntry[]`

**Data freshness indicator:** `CrimeStatEntry` gets an optional `dataSource?: 'live' | 'statcan'` field. When `dataSource === 'statcan'`, `AreaIntelligencePanel` renders a subdued badge:
> *"Statistics Canada · Annual data · [year]"*
instead of the live indicator. This is honest about the data lag (~12–18 months behind real-time).

**MapPage integration:** Call `useAlbertaMunicipalityCrimeStats()`, expose its `stats` and `yearlyStats` separately. `AreaIntelligencePanel` receives both Maps; the lookup tries Calgary/Edmonton stats first, then StatsCan stats as fallback.

**Dependency:** Add `fflate` to `package.json` for in-browser ZIP decompression.

---

### 4. Weather Zone Expansion

**File:** `src/pages/MapPage.tsx` — rename `CALGARY_WEATHER_ZONES` to `ALBERTA_WEATHER_ZONES`, add 10 new entries.

```ts
const ALBERTA_WEATHER_ZONES: [string, number, number][] = [
  // Calgary (existing)
  ['Northwest Calgary',  51.128, -114.190],
  ['Northeast Calgary',  51.128, -113.980],
  ['Downtown Calgary',   51.048, -114.065],
  ['Southwest Calgary',  50.975, -114.180],
  ['Southeast Calgary',  50.975, -113.980],
  // Surrounding communities
  ['Airdrie',            51.292, -114.014],
  ['Cochrane',           51.189, -114.467],
  ['Chestermere',        51.047, -113.821],
  ['Okotoks',            50.726, -113.975],
  ['High River',         50.580, -113.874],
  ['Strathmore',         51.038, -113.400],
  ['Canmore',            51.090, -115.359],
  // Edmonton
  ['Northwest Edmonton', 53.600, -113.650],
  ['Central Edmonton',   53.544, -113.490],
  ['Southeast Edmonton', 53.460, -113.370],
];
```

No other changes — `WMO_ALERTS`, wind/cold thresholds, and alert rendering are unchanged. Alert IDs embed the zone name slug so all 15 are collision-free.

---

## Data Flow Summary

```
MapPage
├── useOfficialOpenData()       → Calgary traffic, 311, water main
├── useEdmontonOpenData()       → Edmonton bylaw, 311, traffic        [NEW]
│   └── merged into officialIncidents[]
├── useWeatherAlerts()          → 15 zones across Alberta             [EXPANDED]
├── useCrimeStats()             → Calgary + Edmonton neighbourhood stats  [EXTENDED]
├── useAlbertaMunicipalityCrimeStats()  → Airdrie, Cochrane, etc.    [NEW]
└── AreaIntelligencePanel
    ├── crimeStats lookup: Calgary key → Edmonton key → StatsCan key
    └── dataSource badge: live vs. "Statistics Canada · Annual"
```

## Files Changed

| File | Change |
|---|---|
| `src/hooks/useEdmontonOpenData.ts` | New file |
| `src/hooks/useAlbertaMunicipalityCrimeStats.ts` | New file |
| `src/hooks/useCrimeStats.ts` | Add EPS fetch + Edmonton key namespace |
| `src/pages/MapPage.tsx` | Call new hooks, rename weather zones, expand zone array, update resolveKey |
| `src/components/AreaIntelligencePanel.tsx` | StatsCan badge for annual data |
| `package.json` | Add `fflate` dependency |

## Dependencies

- `fflate` — in-browser ZIP decompression for StatsCan bulk CSV (~12KB gzipped, zero sub-dependencies)

## Error Handling

All fetches use the existing `Promise.allSettled` pattern — a failed Edmonton or StatsCan fetch silently produces empty results, never breaks the map. StatsCan bulk fetch is expensive; if the first fetch fails, the hook returns empty and does not retry (avoids hammering a slow endpoint).

## Out of Scope

- Property assessments for Edmonton (Edmonton has `q7d6-ambg` dataset — defer to a follow-up)
- Per-city crime averages (city-specific average computation in `computeCityAverages`)
- RCMP real-time incident feeds (no public API exists)
- Red Deer, Lethbridge (not in current service area)
