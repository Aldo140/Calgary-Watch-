# Multi-City API Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Edmonton live feeds (bylaw, 311, traffic), Edmonton EPS crime stats, Statistics Canada annual crime baselines for RCMP-policed towns (Airdrie, Cochrane, Okotoks, Canmore, High River, Strathmore), and weather coverage for all new cities.

**Architecture:** Two new hooks (`useEdmontonOpenData`, `useAlbertaMunicipalityCrimeStats`) plus extensions to `useCrimeStats` and `MapPage.tsx`. Edmonton crime stats are namespaced with `edmonton:` prefix inside the shared `crimeStats` Map to avoid key collisions with Calgary. `AreaIntelligencePanel` gets an optional `crimeKey` on the `AreaIntelligence` object (set by `handleViewNeighborhood`) and a StatsCan fallback path with a data-age badge.

**Tech Stack:** React + TypeScript + Vite, Socrata SODA API (Edmonton), Statistics Canada WDS API + CSV, `fflate` (in-browser ZIP), Open-Meteo (weather already in use)

---

## File Map

| File | Change |
|---|---|
| `package.json` | Add `fflate` dependency |
| `src/types/index.ts` | Add `crimeKey?` to `AreaIntelligence`; add `SourceType` values |
| `src/hooks/useCrimeStats.ts` | Add `dataSource?: 'statcan'` to `CrimeStatEntry`; add EPS Edmonton fetch |
| `src/hooks/useEdmontonOpenData.ts` | **New** — bylaw, 311, traffic feeds |
| `src/hooks/useAlbertaMunicipalityCrimeStats.ts` | **New** — StatsCan ZIP → CSV → parsed stats |
| `src/pages/MapPage.tsx` | Call new hooks; update `resolveKey`; expand weather zones; set `crimeKey` on `setSelectedArea` |
| `src/components/AreaIntelligencePanel.tsx` | Use `data.crimeKey` for lookup; add StatsCan props + badge |

---

## Task 1: Add fflate + extend types

**Files:**
- Modify: `package.json`
- Modify: `src/types/index.ts`
- Modify: `src/hooks/useCrimeStats.ts`

- [ ] **Step 1: Install fflate**

```bash
cd /home/mrotiz14/github-projects/Calgary-Watch--main
npm install fflate
```

Expected: `fflate` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Add SourceType values and crimeKey to AreaIntelligence**

In `src/types/index.ts`, replace the `SourceType` type and `AreaIntelligence` interface:

Find this block:
```ts
export type SourceType =
  | 'user_report'
  | 'env_canada_weather'
  | '511_alberta_traffic'
  | 'calgary_open_data'
  | 'calgary_water_main_breaks'
  | 'alberta_emergency_alert'
  | 'reddit_calgary'
  | 'news_rss'
  | 'calgary_police_crime'
  | 'calgary_infrastructure';
```

Replace with:
```ts
export type SourceType =
  | 'user_report'
  | 'env_canada_weather'
  | '511_alberta_traffic'
  | 'calgary_open_data'
  | 'calgary_water_main_breaks'
  | 'alberta_emergency_alert'
  | 'reddit_calgary'
  | 'news_rss'
  | 'calgary_police_crime'
  | 'calgary_infrastructure'
  | 'edmonton_open_data'
  | 'alberta_statcan_crime';
```

Then find the `AreaIntelligence` interface and add `crimeKey?`:
```ts
export interface AreaIntelligence {
  communityName: string;
  crimeKey?: string;        // stats map lookup key (e.g. "edmonton:downtown"); defaults to communityName.toLowerCase()
  safetyScore: number;
  description: string;
  activeIncidents: number;
  trend: 'improving' | 'declining' | 'stable';
  monthlyTrends: {
    month: string;
    violent_crime: number;
    property_crime: number;
    disorder_calls: number;
  }[];
  insights: string[];
  liveOverlayInsight: string;
}
```

- [ ] **Step 3: Add dataSource to CrimeStatEntry**

In `src/hooks/useCrimeStats.ts`, find:
```ts
export interface CrimeStatEntry {
  crime: number;
  violent: number;
  property: number;
  disorder: number;
  year: number;
}
```

Replace with:
```ts
export interface CrimeStatEntry {
  crime: number;
  violent: number;
  property: number;
  disorder: number;
  year: number;
  dataSource?: 'statcan';
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/mrotiz14/github-projects/Calgary-Watch--main
npm run lint
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/types/index.ts src/hooks/useCrimeStats.ts
git commit -m "feat: add fflate, extend CrimeStatEntry dataSource + AreaIntelligence crimeKey"
```

---

## Task 2: useEdmontonOpenData hook

**Files:**
- Create: `src/hooks/useEdmontonOpenData.ts`

- [ ] **Step 1: Verify EPS field names by test-fetching one row**

```bash
curl -s 'https://data.edmonton.ca/resource/ypje-j649.json?$limit=1' | python3 -m json.tool | head -30
curl -s 'https://data.edmonton.ca/resource/q7ua-agfg.json?$limit=1' | python3 -m json.tool | head -30
curl -s 'https://data.edmonton.ca/resource/k4tx-5k8p.json?$limit=1' | python3 -m json.tool | head -30
```

Confirm the field names match what's used in the code below before proceeding. Key fields to verify:
- Bylaw: `row_id`, `latitude`, `longitude`, `neighbourhood`, `complaint_category`, `type_of_complaint`, `date_created`
- 311: `row_id`, `nbhd_latitude`, `nbhd_longitude`, `neighbourhood`, `service_category`, `service_description`, `date_created`
- Traffic: `disruption_id`, `point` (with `.coordinates`), `on_street`, `activity_type`, `impact`, `status`, `date_issued`

If field names differ, update the code in Step 2 to match.

- [ ] **Step 2: Create the hook**

Create `src/hooks/useEdmontonOpenData.ts`:

```ts
import { useState, useEffect } from 'react';
import { Incident, IncidentCategory } from '@/src/types';

const BASE = 'https://data.edmonton.ca/resource';

function isoMinus48h(): string {
  return new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 19);
}

function isoMinus24h(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
}

const SAFETY_311_KEYWORDS = ['road', 'drainage', 'graffiti', 'waste', 'hazard', 'pothole', 'illegal dump'];

export function useEdmontonOpenData(isAuthReady: boolean): Incident[] {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isAuthReady) return;
    let cancelled = false;

    const fetchAll = async () => {
      const now = Date.now();
      const results: Incident[] = [];

      // ── Bylaw Complaints ─────────────────────────────────────────────────
      try {
        const url = `${BASE}/ypje-j649.json?$where=date_created>='${isoMinus48h()}'&$limit=200&$order=date_created DESC`;
        const res = await fetch(url);
        if (res.ok) {
          const rows: any[] = await res.json();
          for (const row of rows) {
            const lat = parseFloat(row.latitude ?? '');
            const lng = parseFloat(row.longitude ?? '');
            if (isNaN(lat) || isNaN(lng)) continue;
            results.push({
              id: `edm-bylaw-${row.row_id ?? String(Math.random())}`,
              title: row.complaint_category ?? 'Bylaw Complaint',
              description: `${row.type_of_complaint ?? row.complaint_category ?? 'Bylaw complaint'} in ${row.neighbourhood ?? 'Edmonton'}`,
              category: 'infrastructure' as IncidentCategory,
              neighborhood: row.neighbourhood ?? 'Edmonton',
              lat,
              lng,
              timestamp: new Date(row.date_created).getTime() || now,
              email: 'opendata@edmonton.ca',
              name: 'City of Edmonton Bylaw',
              anonymous: false,
              verified_status: 'community_confirmed',
              report_count: 1,
              data_source: 'official',
              source_name: 'City of Edmonton Open Data',
              source_url: 'https://data.edmonton.ca/',
              expires_at: now + 2 * 60 * 60 * 1000,
            });
          }
        }
      } catch { /* silent — partial failures are fine */ }

      // ── 311 Requests ─────────────────────────────────────────────────────
      try {
        const url = `${BASE}/q7ua-agfg.json?$where=date_created>='${isoMinus24h()}'&$limit=200&$order=date_created DESC`;
        const res = await fetch(url);
        if (res.ok) {
          const rows: any[] = await res.json();
          for (const row of rows) {
            const lat = parseFloat(row.nbhd_latitude ?? '');
            const lng = parseFloat(row.nbhd_longitude ?? '');
            if (isNaN(lat) || isNaN(lng)) continue;
            const cat = (row.service_category ?? '').toLowerCase();
            if (!SAFETY_311_KEYWORDS.some(k => cat.includes(k))) continue;
            results.push({
              id: `edm-311-${row.row_id ?? String(Math.random())}`,
              title: row.service_description ?? row.service_category ?? '311 Request',
              description: `${row.service_description ?? row.service_category ?? '311 request'} in ${row.neighbourhood ?? 'Edmonton'}`,
              category: 'infrastructure' as IncidentCategory,
              neighborhood: row.neighbourhood ?? 'Edmonton',
              lat,
              lng,
              timestamp: new Date(row.date_created).getTime() || now,
              email: 'opendata@edmonton.ca',
              name: 'City of Edmonton 311',
              anonymous: false,
              verified_status: 'community_confirmed',
              report_count: 1,
              data_source: 'official',
              source_name: 'City of Edmonton Open Data',
              source_url: 'https://data.edmonton.ca/',
              expires_at: now + 2 * 60 * 60 * 1000,
            });
          }
        }
      } catch { /* silent */ }

      // ── Traffic Disruptions ──────────────────────────────────────────────
      try {
        const url = `${BASE}/k4tx-5k8p.json?$where=status='Active'&$limit=100`;
        const res = await fetch(url);
        if (res.ok) {
          const rows: any[] = await res.json();
          for (const row of rows) {
            // point.coordinates is [lng, lat] GeoJSON order — swap to [lat, lng]
            const coords: number[] | undefined = row.point?.coordinates;
            if (!coords || coords.length < 2) continue;
            const lng = coords[0];
            const lat = coords[1];
            if (isNaN(lat) || isNaN(lng)) continue;
            results.push({
              id: `edm-traffic-${row.disruption_id ?? String(Math.random())}`,
              title: row.activity_type ?? 'Traffic Disruption',
              description: `${row.impact ?? ''} on ${row.on_street ?? 'Edmonton road'}${row.description ? '. ' + row.description : ''}`.trim(),
              category: 'traffic' as IncidentCategory,
              neighborhood: row.traffic_district ?? 'Edmonton',
              lat,
              lng,
              timestamp: new Date(row.date_issued ?? row.start_date).getTime() || now,
              email: 'opendata@edmonton.ca',
              name: 'City of Edmonton Traffic',
              anonymous: false,
              verified_status: 'community_confirmed',
              report_count: 1,
              data_source: 'official',
              source_name: 'City of Edmonton Open Data',
              source_url: 'https://data.edmonton.ca/',
              expires_at: now + 2 * 60 * 60 * 1000,
            });
          }
        }
      } catch { /* silent */ }

      if (!cancelled) setIncidents(results);
    };

    fetchAll();
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthReady]);

  return incidents;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useEdmontonOpenData.ts
git commit -m "feat: add useEdmontonOpenData hook (bylaw, 311, traffic feeds)"
```

---

## Task 3: Wire Edmonton live feed into MapPage

**Files:**
- Modify: `src/pages/MapPage.tsx`

- [ ] **Step 1: Import the hook**

In `src/pages/MapPage.tsx`, find the import block near the top:
```ts
import { useCrimeStats, computeCityAverages } from '@/src/hooks/useCrimeStats';
import { usePropertyAssessments } from '@/src/hooks/usePropertyAssessments';
```

Add after:
```ts
import { useEdmontonOpenData } from '@/src/hooks/useEdmontonOpenData';
```

- [ ] **Step 2: Call the hook inside MapPage**

Find:
```ts
  const officialOpenData = useOfficialOpenData(isAuthReady);
  const weatherAlerts = useWeatherAlerts(isAuthReady);
```

Add after:
```ts
  const edmontonOpenData = useEdmontonOpenData(isAuthReady);
```

- [ ] **Step 3: Merge Edmonton incidents into the combined pool**

Find:
```ts
    const combined = [...firebaseIncidents, ...officialOpenData, ...weatherAlerts];
```

Replace with:
```ts
    const combined = [...firebaseIncidents, ...officialOpenData, ...edmontonOpenData, ...weatherAlerts];
```

- [ ] **Step 4: Add edmontonOpenData to the useMemo dependency array**

Find:
```ts
  }, [firebaseIncidents, officialOpenData, weatherAlerts]);
```

Replace with:
```ts
  }, [firebaseIncidents, officialOpenData, edmontonOpenData, weatherAlerts]);
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat: merge Edmonton open data feed into incident pool"
```

---

## Task 4: Extend useCrimeStats with Edmonton EPS data

**Files:**
- Modify: `src/hooks/useCrimeStats.ts`

- [ ] **Step 1: Verify EPS field names**

```bash
curl -s 'https://dashboard.edmonton.ca/resource/xthe-mnvi.json?$limit=2' | python3 -m json.tool
```

Check that the response contains fields `neighbourhood_name`, `occurrence_year`, `occurrence_group`, `occurrence_count`. If field names differ, update Step 2 accordingly.

- [ ] **Step 2: Add Edmonton EPS fetch inside the existing useEffect**

In `src/hooks/useCrimeStats.ts`, find the block that ends with:
```ts
        setStats(merged);
        setYearlyStats(yearly);
```

Insert the following block **immediately before** `setStats(merged)`:

```ts
        // ── Edmonton EPS Crime Stats ──────────────────────────────────────
        try {
          const epsRes = await fetch(
            'https://dashboard.edmonton.ca/resource/xthe-mnvi.json?$limit=50000'
          );
          if (epsRes.ok) {
            const epsData: any[] = await epsRes.json();
            const epsCrimeByNbrYr    = new Map<string, Map<number, number>>();
            const epsViolentByNbrYr  = new Map<string, Map<number, number>>();
            const epsPropertyByNbrYr = new Map<string, Map<number, number>>();
            const epsDisorderByNbrYr = new Map<string, Map<number, number>>();
            let maxEpsYear = 0;

            for (const row of epsData) {
              const year = parseInt(row.occurrence_year ?? '0', 10);
              const neighbourhood = (row.neighbourhood_name ?? '').toLowerCase().trim();
              if (!neighbourhood || !year) continue;
              if (year > maxEpsYear) maxEpsYear = year;
              const count = parseInt(row.occurrence_count ?? '0', 10);
              const group = (row.occurrence_group ?? '').toLowerCase();

              const addTo = (map: Map<string, Map<number, number>>) => {
                if (!map.has(neighbourhood)) map.set(neighbourhood, new Map());
                const yrMap = map.get(neighbourhood)!;
                yrMap.set(year, (yrMap.get(year) ?? 0) + count);
              };

              addTo(epsCrimeByNbrYr);
              if (group.includes('violent')) addTo(epsViolentByNbrYr);
              if (group.includes('property')) addTo(epsPropertyByNbrYr);
              if (group.includes('disorder')) addTo(epsDisorderByNbrYr);
            }

            for (const neighbourhood of epsCrimeByNbrYr.keys()) {
              const nsKey     = `edmonton:${neighbourhood}`;
              const crimeYr   = epsCrimeByNbrYr.get(neighbourhood)!;
              const violentYr = epsViolentByNbrYr.get(neighbourhood);
              const propYr    = epsPropertyByNbrYr.get(neighbourhood);
              const disYr     = epsDisorderByNbrYr.get(neighbourhood);

              merged.set(nsKey, {
                crime:    crimeYr.get(maxEpsYear) ?? 0,
                violent:  violentYr?.get(maxEpsYear) ?? 0,
                property: propYr?.get(maxEpsYear) ?? 0,
                disorder: disYr?.get(maxEpsYear) ?? 0,
                year:     maxEpsYear,
              });

              const allEpsYears = new Set<number>([
                ...crimeYr.keys(),
                ...(disYr?.keys() ?? []),
              ]);
              yearly.set(nsKey, [...allEpsYears]
                .filter(y => y > 0)
                .sort((a, b) => a - b)
                .slice(-6)
                .map(yr => ({
                  year:     yr,
                  crime:    crimeYr.get(yr) ?? 0,
                  violent:  violentYr?.get(yr) ?? 0,
                  property: propYr?.get(yr) ?? 0,
                  disorder: disYr?.get(yr) ?? 0,
                })));
            }
          }
        } catch (epsErr) {
          console.warn('[CalgaryWatch] Edmonton EPS crime stats fetch failed:', epsErr);
        }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCrimeStats.ts
git commit -m "feat: extend useCrimeStats with Edmonton EPS neighbourhood crime stats"
```

---

## Task 5: Update handleViewNeighborhood for Edmonton namespace

**Files:**
- Modify: `src/pages/MapPage.tsx`

This task updates `resolveKey` to handle `edmonton:` prefixed keys, fixes `canonicalName` display, and passes `crimeKey` to `setSelectedArea`.

- [ ] **Step 1: Update resolveKey to strip namespace prefix before word matching**

In `src/pages/MapPage.tsx`, inside `handleViewNeighborhood`, find the `resolveKey` function:

```ts
      const resolveKey = (q: string): string | undefined => {
        if (crimeStats.has(q)) return q;
        // Strip leading street numbers (e.g. "1234 Banff Trail NW" → "banff trail nw")
        const stripped = q.replace(/^\d+\s+/, '');
        if (crimeStats.has(stripped)) return stripped;
        // Only do substring containment on the cleaned string and only for multi-word keys
        // (prevents single short community names like "stoney" matching long address strings)
        const subFound = allKeys.find(k => {
          if (k.split(' ').length < 2) return false; // skip single-word keys for substring
          return stripped.includes(k) || k.includes(stripped);
        });
        if (subFound) return subFound;
        // Word-overlap: use only meaningful words (after removing numbers + STOP words)
        const qWords = stripped.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
        if (qWords.length === 0) return undefined;
        let best: string | undefined;
        let bestScore = 0;
        for (const k of allKeys) {
          const kWords = k.split(/\s+/).filter(w => !STOP.has(w));
          // All community words must appear in the query — prevents partial road-name matches
          const overlap = kWords.filter(kw => qWords.some(w => w === kw || w.startsWith(kw) || kw.startsWith(w))).length;
          const score = overlap / Math.max(kWords.length, 1);
          if (score > bestScore && overlap === kWords.length) { bestScore = score; best = k; }
        }
        return bestScore >= 0.5 ? best : undefined;
      };
```

Replace with:

```ts
      const resolveKey = (q: string): string | undefined => {
        if (crimeStats.has(q)) return q;
        // Strip leading street numbers (e.g. "1234 Banff Trail NW" → "banff trail nw")
        const stripped = q.replace(/^\d+\s+/, '');
        if (crimeStats.has(stripped)) return stripped;
        // Only do substring containment on the cleaned string and only for multi-word keys.
        // Strip namespace prefix (e.g. "edmonton:") before comparing.
        const subFound = allKeys.find(k => {
          const kBare = k.replace(/^\w+:/, '');
          if (kBare.split(' ').length < 2) return false;
          return stripped.includes(kBare) || kBare.includes(stripped);
        });
        if (subFound) return subFound;
        // Word-overlap: strip namespace prefix before extracting words for matching.
        const qWords = stripped.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
        if (qWords.length === 0) return undefined;
        let best: string | undefined;
        let bestScore = 0;
        for (const k of allKeys) {
          const kBare = k.replace(/^\w+:/, '');
          const kWords = kBare.split(/\s+/).filter(w => !STOP.has(w));
          const overlap = kWords.filter(kw => qWords.some(w => w === kw || w.startsWith(kw) || kw.startsWith(w))).length;
          const score = overlap / Math.max(kWords.length, 1);
          if (score > bestScore && overlap === kWords.length) { bestScore = score; best = k; }
        }
        return bestScore >= 0.5 ? best : undefined;
      };
```

- [ ] **Step 2: Fix canonicalName to strip namespace prefix for display**

Find:
```ts
      const canonicalName = resolvedKey
        ? resolvedKey.replace(/\b\w/g, c => c.toUpperCase())
        : displayName;
```

Replace with:
```ts
      const canonicalName = resolvedKey
        ? resolvedKey.replace(/^\w+:/, '').replace(/\b\w/g, c => c.toUpperCase())
        : displayName;
```

- [ ] **Step 3: Set crimeKey on the setSelectedArea calls that have real data**

Find (the call inside `if (entry) {`):
```ts
        setSelectedArea({
          ...base,
          communityName: canonicalName,
          safetyScore: score,
          trend,
          insights: [...computedInsights, ...base.insights],
        });
```

Replace with:
```ts
        setSelectedArea({
          ...base,
          communityName: canonicalName,
          crimeKey: resolvedKey,
          safetyScore: score,
          trend,
          insights: [...computedInsights, ...base.insights],
        });
```

- [ ] **Step 4: Fix the neighbourhood ranking insight text**

The insight currently says "Calgary neighbourhoods" — after adding Edmonton it should say "neighbourhoods". Find:

```ts
          `This community ranks #${rank} of ${totalCommunities} Calgary neighbourhoods by total incident volume`,
```

Replace with:
```ts
          `This community ranks #${rank} of ${totalCommunities} neighbourhoods by total incident volume`,
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat: update resolveKey + canonicalName for Edmonton namespace, set crimeKey on AreaIntelligence"
```

---

## Task 6: Update AreaIntelligencePanel for crimeKey + StatsCan badge

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx`

- [ ] **Step 1: Add statcanStats and statcanYearlyStats props**

In `src/components/AreaIntelligencePanel.tsx`, find the `AreaIntelligencePanelProps` interface (around line 32):

```ts
interface AreaIntelligencePanelProps {
```

Find the `crimeStats` and `yearlyStats` lines inside it and add two new optional props after `yearlyStats`:

```ts
  crimeStats?: Map<string, CrimeStatEntry>;
  yearlyStats?: Map<string, CrimeYearEntry[]>;
  statcanStats?: Map<string, CrimeStatEntry>;
  statcanYearlyStats?: Map<string, CrimeYearEntry[]>;
```

Also update the destructuring in the default export signature. Find:
```ts
export default function AreaIntelligencePanel({
  data, onClose, crimeStats, yearlyStats, propertyData, cityAverages, theme = 'dark',
}: AreaIntelligencePanelProps) {
```

Replace with:
```ts
export default function AreaIntelligencePanel({
  data, onClose, crimeStats, yearlyStats, statcanStats, statcanYearlyStats, propertyData, cityAverages, theme = 'dark',
}: AreaIntelligencePanelProps) {
```

- [ ] **Step 2: Use crimeKey for stats lookup and add StatsCan fallback**

Find:
```ts
  const communityKey   = data.communityName.toLowerCase();
  const crimeEntry     = crimeStats?.get(communityKey);
  const realYearly     = yearlyStats?.get(communityKey) ?? [];
```

Replace with:
```ts
  const communityKey   = data.communityName.toLowerCase();
  const lookupKey      = data.crimeKey ?? communityKey;
  const crimeEntry     = crimeStats?.get(lookupKey) ?? statcanStats?.get(communityKey);
  const realYearly     = yearlyStats?.get(lookupKey) ?? statcanYearlyStats?.get(communityKey) ?? [];
  const isStatcanData  = !crimeStats?.get(lookupKey) && !!statcanStats?.get(communityKey);
```

- [ ] **Step 3: Add the StatsCan data-age badge**

The panel has a data source/year section somewhere in the stats display. Find the block that checks `hasRealData` and shows the data year. Look for where `crimeEntry?.year` or a data-source note is rendered. If none exists, add a badge near the top of the stats section.

Find the `ContentProps` type definition (around line 265):
```ts
  cityAverages?: { avgViolent: number; avgProperty: number; avgDisorder: number };
```

Add after it:
```ts
  isStatcanData?: boolean;
```

Find where `contentProps` object is built (around line 398) and add:
```ts
    isStatcanData,
```

Find where `ContentProps` is destructured inside the `Content` function (around line 282):
```ts
  cityAverages,
```

Add after it:
```ts
  isStatcanData,
```

Now add the badge inside the `Content` component, just after the safety score section or wherever source attribution is shown. Find a good anchor point — look for the `hasRealData` conditional that shows real data. Add the badge right after the closing of the stats badges row:

Search for a line like `{crimeEntry && (` or the closing `)}` of the stats section. Add the StatsCan badge anywhere below the main score and above the chart:

```tsx
{isStatcanData && crimeEntry && (
  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800/40 border border-slate-700/30 w-fit">
    <span className="text-[10px] font-mono text-slate-400 tracking-wide uppercase">
      Statistics Canada · Annual · {crimeEntry.year}
    </span>
  </div>
)}
```

The exact insertion point depends on the panel's JSX structure. Place it logically near the source attribution — after the crime stat badges and before the chart, or in a footer row.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: zero errors. Fix any prop-shape mismatches.

- [ ] **Step 5: Commit**

```bash
git add src/components/AreaIntelligencePanel.tsx
git commit -m "feat: AreaIntelligencePanel uses crimeKey for lookup + StatsCan data badge"
```

---

## Task 7: useAlbertaMunicipalityCrimeStats hook

**Files:**
- Create: `src/hooks/useAlbertaMunicipalityCrimeStats.ts`

- [ ] **Step 1: Verify the StatsCan WDS endpoint returns a ZIP URL**

```bash
curl -s 'https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/35100183/en'
```

Expected response shape: `{"status":"SUCCESS","object":"https://www150.statcan.gc.ca/...35100183.zip"}`

Note the exact URL pattern in the `object` field — confirm it ends in `.zip`.

- [ ] **Step 2: Create the hook**

Create `src/hooks/useAlbertaMunicipalityCrimeStats.ts`:

```ts
import { useState, useEffect } from 'react';
import { unzipSync } from 'fflate';
import { CrimeStatEntry, CrimeYearEntry } from './useCrimeStats';

// Municipalities to extract from the StatsCan bulk CSV.
// These are matched as substrings of the GEO column.
const COVERED = ['Airdrie', 'Cochrane', 'Okotoks', 'Canmore', 'High River', 'Strathmore', 'Chestermere'];

// Module-level cache — fetch once per session (the ZIP is ~5 MB).
let _statsCache: Map<string, CrimeStatEntry> | null = null;
let _yearlyCache: Map<string, CrimeYearEntry[]> | null = null;
let _fetchPromise: Promise<void> | null = null;

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function classifyViolation(violation: string): 'violent' | 'property' | 'total' | null {
  const v = violation.toLowerCase();
  if (v.includes('total criminal code') || v.includes('total, all')) return 'total';
  if (v.includes('violent')) return 'violent';
  if (v.includes('property')) return 'property';
  return null;
}

async function loadStatsCan(): Promise<void> {
  if (_statsCache) return;

  // Step 1: get the ZIP URL from the WDS API
  const wdsRes = await fetch(
    'https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/35100183/en'
  );
  if (!wdsRes.ok) throw new Error(`WDS API ${wdsRes.status}`);
  const wdsMeta: { status: string; object: string } = await wdsRes.json();
  if (!wdsMeta.object) throw new Error('WDS: no object URL in response');

  // Step 2: download the ZIP
  const zipRes = await fetch(wdsMeta.object);
  if (!zipRes.ok) throw new Error(`ZIP fetch ${zipRes.status}`);
  const zipBuffer = await zipRes.arrayBuffer();

  // Step 3: decompress
  const files = unzipSync(new Uint8Array(zipBuffer));

  // Step 4: find the data CSV (not the MetaData file)
  const csvFilename = Object.keys(files).find(
    f => f.endsWith('.csv') && !f.includes('MetaData')
  );
  if (!csvFilename) throw new Error('No data CSV found in ZIP');

  const csvText = new TextDecoder('utf-8').decode(files[csvFilename]);
  const lines = csvText.split('\n');
  if (lines.length < 2) throw new Error('CSV appears empty');

  // Step 5: parse header
  const header = parseCSVLine(lines[0]);
  const idx = (name: string) => header.findIndex(h => h.replace(/"/g, '') === name);
  const iGeo        = idx('GEO');
  const iRefDate    = idx('REF_DATE');
  const iViolations = idx('Violations');
  const iStats      = idx('Statistics');
  const iValue      = idx('VALUE');

  if ([iGeo, iRefDate, iViolations, iStats, iValue].some(i => i === -1)) {
    throw new Error('CSV header mismatch — field not found');
  }

  // Step 6: build per-municipality, per-year Maps
  const totalByMunYr    = new Map<string, Map<number, number>>();
  const violentByMunYr  = new Map<string, Map<number, number>>();
  const propertyByMunYr = new Map<string, Map<number, number>>();
  let maxYear = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < Math.max(iGeo, iRefDate, iViolations, iStats, iValue) + 1) continue;

    const geoRaw   = row[iGeo].replace(/"/g, '');
    const statsRaw = row[iStats].replace(/"/g, '');
    if (statsRaw !== 'Actual incidents') continue;

    const matchedMun = COVERED.find(m => geoRaw.includes(m));
    if (!matchedMun) continue;

    const year  = parseInt(row[iRefDate], 10);
    const value = parseFloat(row[iValue]);
    if (!year || isNaN(value) || value < 0) continue;
    if (year > maxYear) maxYear = year;

    const mun = matchedMun.toLowerCase();
    const kind = classifyViolation(row[iViolations].replace(/"/g, ''));
    if (!kind) continue;

    const addTo = (map: Map<string, Map<number, number>>) => {
      if (!map.has(mun)) map.set(mun, new Map());
      const yrMap = map.get(mun)!;
      yrMap.set(year, (yrMap.get(year) ?? 0) + value);
    };

    if (kind === 'total')    addTo(totalByMunYr);
    if (kind === 'violent')  addTo(violentByMunYr);
    if (kind === 'property') addTo(propertyByMunYr);
  }

  // Step 7: build output Maps
  const stats  = new Map<string, CrimeStatEntry>();
  const yearly = new Map<string, CrimeYearEntry[]>();

  for (const mun of totalByMunYr.keys()) {
    const totalYr    = totalByMunYr.get(mun)!;
    const violentYr  = violentByMunYr.get(mun);
    const propertyYr = propertyByMunYr.get(mun);

    stats.set(mun, {
      crime:      totalYr.get(maxYear) ?? 0,
      violent:    violentYr?.get(maxYear) ?? 0,
      property:   propertyYr?.get(maxYear) ?? 0,
      disorder:   0, // StatsCan table 35100183 does not have a clean disorder aggregate
      year:       maxYear,
      dataSource: 'statcan',
    });

    const allYears = new Set(totalYr.keys());
    yearly.set(mun, [...allYears]
      .filter(y => y > 0)
      .sort((a, b) => a - b)
      .slice(-6)
      .map(yr => ({
        year:     yr,
        crime:    totalYr.get(yr) ?? 0,
        violent:  violentYr?.get(yr) ?? 0,
        property: propertyYr?.get(yr) ?? 0,
        disorder: 0,
      })));
  }

  _statsCache  = stats;
  _yearlyCache = yearly;
}

export function useAlbertaMunicipalityCrimeStats(): {
  stats: Map<string, CrimeStatEntry>;
  yearlyStats: Map<string, CrimeYearEntry[]>;
  isLoading: boolean;
} {
  const [stats, setStats]           = useState<Map<string, CrimeStatEntry>>(new Map());
  const [yearlyStats, setYearly]    = useState<Map<string, CrimeYearEntry[]>>(new Map());
  const [isLoading, setIsLoading]   = useState(false);

  useEffect(() => {
    if (_statsCache) {
      setStats(_statsCache);
      setYearly(_yearlyCache!);
      return;
    }

    setIsLoading(true);

    if (!_fetchPromise) {
      _fetchPromise = loadStatsCan().catch(err => {
        console.warn('[CalgaryWatch] StatsCan municipality stats failed:', err);
        _fetchPromise = null;
      });
    }

    _fetchPromise.then(() => {
      if (_statsCache) {
        setStats(_statsCache);
        setYearly(_yearlyCache!);
      }
      setIsLoading(false);
    });
  }, []);

  return { stats, yearlyStats: yearlyStats, isLoading };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: zero errors. If `fflate` types are not found, run `npm install --save-dev @types/fflate` (though fflate ships its own types — check `node_modules/fflate/esm/index.d.ts` exists).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAlbertaMunicipalityCrimeStats.ts
git commit -m "feat: add useAlbertaMunicipalityCrimeStats (StatsCan annual crime for RCMP towns)"
```

---

## Task 8: Wire StatsCan hook into MapPage and AreaIntelligencePanel

**Files:**
- Modify: `src/pages/MapPage.tsx`
- Modify: `src/components/AreaIntelligencePanel.tsx`

- [ ] **Step 1: Import and call the hook in MapPage**

In `src/pages/MapPage.tsx`, add the import after the existing hook imports:
```ts
import { useAlbertaMunicipalityCrimeStats } from '@/src/hooks/useAlbertaMunicipalityCrimeStats';
```

Inside `MapPage()`, find:
```ts
  const { stats: crimeStats, yearlyStats: crimeYearlyStats } = useCrimeStats();
```

Add after:
```ts
  const { stats: statcanStats, yearlyStats: statcanYearlyStats } = useAlbertaMunicipalityCrimeStats();
```

- [ ] **Step 2: Pass StatsCan stats to AreaIntelligencePanel**

Find the `<AreaIntelligencePanel` JSX (around line 2430):
```tsx
        <AreaIntelligencePanel
          ...
          crimeStats={crimeStats}
          yearlyStats={crimeYearlyStats}
          ...
          cityAverages={cityAverages}
```

Add after `yearlyStats`:
```tsx
          statcanStats={statcanStats}
          statcanYearlyStats={statcanYearlyStats}
```

- [ ] **Step 3: Also pass to the inline panel call in the Sidebar (if one exists)**

Search for any other `AreaIntelligencePanel` call in MapPage:
```bash
grep -n "AreaIntelligencePanel" src/pages/MapPage.tsx
```

For every call site that already passes `crimeStats`, also add `statcanStats={statcanStats}` and `statcanYearlyStats={statcanYearlyStats}`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat: wire StatsCan municipality stats into MapPage and AreaIntelligencePanel"
```

---

## Task 9: Expand weather zones

**Files:**
- Modify: `src/pages/MapPage.tsx`

- [ ] **Step 1: Replace CALGARY_WEATHER_ZONES with ALBERTA_WEATHER_ZONES**

In `src/pages/MapPage.tsx`, find:
```ts
// Calgary neighbourhood zones: [name, lat, lng]
const CALGARY_WEATHER_ZONES: [string, number, number][] = [
  ['Northwest Calgary',  51.128, -114.190],
  ['Northeast Calgary',  51.128, -113.980],
  ['Downtown Calgary',   51.048, -114.065],
  ['Southwest Calgary',  50.975, -114.180],
  ['Southeast Calgary',  50.975, -113.980],
];
```

Replace with:
```ts
// Alberta weather zones: [name, lat, lng]
const ALBERTA_WEATHER_ZONES: [string, number, number][] = [
  // Calgary
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

- [ ] **Step 2: Update the reference inside useWeatherAlerts**

Find:
```ts
        CALGARY_WEATHER_ZONES.map(async ([zoneName, lat, lng]) => {
```

Replace with:
```ts
        ALBERTA_WEATHER_ZONES.map(async ([zoneName, lat, lng]) => {
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat: expand weather zones from 5 Calgary to 15 Alberta zones"
```

---

## Task 10: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open `http://localhost:3000` and sign in.

- [ ] **Step 2: Verify Edmonton live data appears on the map**

Pan the map to Edmonton (roughly 53.5°N, 113.5°W). Check that traffic disruptions and bylaw/311 incidents appear as map pins in Edmonton. Open one incident — confirm `source_name` is "City of Edmonton Open Data".

- [ ] **Step 3: Verify Edmonton crime stats in AreaIntelligencePanel**

Click on an Edmonton neighbourhood (e.g. Downtown Edmonton area). Confirm the Area Intelligence Panel opens and shows real crime stats with charts. The panel title should show "Downtown" (not "edmonton:downtown").

- [ ] **Step 4: Verify StatsCan badge for RCMP towns**

Click somewhere in Airdrie or Okotoks. If the panel opens with stats, confirm the "Statistics Canada · Annual · [year]" badge appears below the score.

- [ ] **Step 5: Verify weather alerts for new zones**

Trigger a weather event check by waiting or inspecting the `weatherAlerts` state in React DevTools. Confirm 15 zones are being polled.

- [ ] **Step 6: Verify no regressions in Calgary data**

Click a known Calgary community (e.g. Beltline, Forest Lawn). Confirm stats still show correctly without the StatsCan badge. Confirm traffic and 311 incidents still appear in Calgary.

- [ ] **Step 7: Final commit / build check**

```bash
npm run build
```

Expected: build completes with no TypeScript errors and no import errors.
