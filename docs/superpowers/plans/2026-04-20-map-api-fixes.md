# Map API Fixes & CPS Crime Statistics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix duplicate/noisy infrastructure pins, eliminate invisible Reddit crime stacking, and surface CPS community crime statistics as incident cards on the map.

**Architecture:** Four independent changes — (1) extract shared coords table, (2) fix Reddit null-location logic in the ingest script, (3) tighten 311/water-main client-side fetches, (4) new `useCrimeStatIncidents` hook wired into MapPage's incidents memo.

**Tech Stack:** React 18, TypeScript, Vite, Firestore, Leaflet, City of Calgary Open Data (SoQL API), Calgary Police Service Open Data

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/data/neighbourhoodCoords.ts` | **Create** | Shared neighbourhood → [lat, lng] lookup table |
| `scripts/ingest/sources/reddit.ts` | **Modify** | Import coords from shared module; return `null` instead of city-center fallback |
| `src/hooks/useCrimeStatIncidents.ts` | **Create** | Fetch CPS crime + disorder stats; return top-20 communities as `Incident[]` |
| `src/pages/MapPage.tsx` | **Modify** | 311 date filter + traffic skip; water main 7-day window; wire new hook into incidents memo |

---

## Task 1: Extract shared neighbourhood coords module

**Files:**
- Create: `src/data/neighbourhoodCoords.ts`

- [ ] **Step 1: Create `src/data/neighbourhoodCoords.ts`**

Create the file with the exported coords table (copied from `scripts/ingest/sources/reddit.ts` lines 74–157):

```typescript
export const NEIGHBOURHOOD_COORDS: Record<string, [number, number]> = {
  'downtown': [51.0478, -114.0625],
  'beltline': [51.0381, -114.0680],
  'kensington': [51.0603, -114.0903],
  'bridgeland': [51.0602, -114.0412],
  'mission': [51.0347, -114.0670],
  'inglewood': [51.0406, -114.0201],
  'bowness': [51.0975, -114.1807],
  'saddleridge': [51.1494, -113.9670],
  'evanston': [51.1902, -114.0792],
  'mahogany': [50.9011, -113.9603],
  'auburn bay': [50.9099, -114.0010],
  'signal hill': [51.0660, -114.2161],
  'tuscany': [51.1303, -114.2208],
  'royal oak': [51.1303, -114.1827],
  'panorama hills': [51.1655, -114.0448],
  'midnapore': [50.9497, -114.0683],
  'shawnessy': [50.9251, -114.1245],
  'mckenzie towne': [50.9083, -113.9534],
  'cranston': [50.8986, -113.9836],
  'copperfield': [50.9141, -113.9951],
  'forest lawn': [51.0331, -113.9798],
  'ramsay': [51.0284, -114.0353],
  'ogden': [50.9897, -113.9901],
  'acadia': [50.9756, -114.0420],
  'braeside': [50.9656, -114.1270],
  'cougar ridge': [51.0694, -114.2161],
  'coach hill': [51.0619, -114.2161],
  'west springs': [51.0713, -114.2161],
  'arbour lake': [51.1303, -114.2208],
  'citadel': [51.1524, -114.2075],
  'hamptons': [51.1600, -114.2075],
  'nolan hill': [51.1787, -114.1659],
  'sage hill': [51.1862, -114.1303],
  'sherwood': [51.1787, -114.1303],
  'skyview': [51.1597, -113.9670],
  'taradale': [51.1597, -113.9403],
  'martindale': [51.1494, -113.9403],
  'false creek': [51.1200, -114.0625],
  'ranchlands': [51.1200, -114.2208],
  'charleswood': [51.0992, -114.1659],
  'varsity': [51.0992, -114.1303],
  'dalhousie': [51.0992, -114.1659],
  'north haven': [51.0992, -114.1100],
  'brentwood': [51.0788, -114.1440],
  'montgomery': [51.0694, -114.1659],
  'parkdale': [51.0694, -114.1303],
  'st. andrews heights': [51.0527, -114.1525],
  'hillhurst': [51.0563, -114.0903],
  'sunnyside': [51.0563, -114.0903],
  'rosedale': [51.0694, -114.0791],
  'crescent heights': [51.0694, -114.0625],
  'capitol hill': [51.0788, -114.0791],
  'tuxedo park': [51.0788, -114.0625],
  'highland park': [51.0788, -114.0459],
  'thorncliffe': [51.0992, -114.0459],
  'greenview': [51.0992, -114.0459],
  'renfrew': [51.0694, -114.0459],
  'dover': [51.0331, -113.9798],
  'radisson heights': [51.0331, -113.9966],
  'southwood': [50.9756, -114.1100],
  'willow park': [50.9666, -114.0791],
  'bonavista': [50.9497, -114.0420],
  'lake bonavista': [50.9497, -114.0420],
  'crestmont': [51.0694, -114.2161],
  'springbank hill': [51.0527, -114.2161],
  'patterson': [51.0527, -114.1659],
  'lakeview': [51.0412, -114.1659],
  'glenbrook': [51.0412, -114.1659],
  'glendale': [51.0412, -114.1440],
  'lincoln park': [51.0274, -114.1525],
  'woodbine': [51.0038, -114.1440],
  'palliser': [50.9906, -114.1303],
  'oakridge': [50.9756, -114.1303],
  'cedarbrae': [50.9756, -114.1440],
  'glamorgan': [51.0274, -114.1659],
  'richmond': [51.0412, -114.1100],
  'mount royal': [51.0284, -114.1100],
  'elbow park': [51.0195, -114.0903],
  'erlton': [51.0195, -114.0625],
  'victoria park': [51.0427, -114.0559],
  'eau claire': [51.0538, -114.0757],
};
```

- [ ] **Step 2: Update `scripts/ingest/sources/reddit.ts` to import from the shared module**

Replace the inline `NEIGHBOURHOOD_COORDS` constant (lines 74–157) and the `CALGARY_CENTER` constant with an import:

```typescript
import { NEIGHBOURHOOD_COORDS } from '../../../src/data/neighbourhoodCoords.js';
```

Delete the `const NEIGHBOURHOOD_COORDS: Record<string, [number, number]> = { ... }` block (lines 74–157) and the `const CALGARY_CENTER: [number, number] = [51.0447, -114.0719];` line (line 159) — they are now provided by the shared module.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/mrotiz14/github-projects/Calgary-Watch--main
npx tsc --noEmit
```

Expected: no errors related to `NEIGHBOURHOOD_COORDS`.

- [ ] **Step 4: Commit**

```bash
git add src/data/neighbourhoodCoords.ts scripts/ingest/sources/reddit.ts
git commit -m "refactor(coords): extract NEIGHBOURHOOD_COORDS to shared module"
```

---

## Task 2: Fix Reddit city-center location fallback

**Files:**
- Modify: `scripts/ingest/sources/reddit.ts`

- [ ] **Step 1: Change `extractLocationFromText` return type and remove city-center fallback**

Replace the entire `extractLocationFromText` function (lines 161–188) with:

```typescript
function extractLocationFromText(text: string): { neighborhood: string; lat: number; lng: number } | null {
  const lower = text.toLowerCase();
  for (const [name, coords] of Object.entries(NEIGHBOURHOOD_COORDS)) {
    if (lower.includes(name)) {
      return {
        neighborhood: name.replace(/\b\w/g, (c) => c.toUpperCase()),
        lat: coords[0],
        lng: coords[1],
      };
    }
  }

  if (/\bnw\s+calgary|\bcalgary\s+nw\b/i.test(text)) {
    return { neighborhood: 'Northwest Calgary', lat: 51.128, lng: -114.190 };
  }
  if (/\bne\s+calgary|\bcalgary\s+ne\b/i.test(text)) {
    return { neighborhood: 'Northeast Calgary', lat: 51.128, lng: -113.980 };
  }
  if (/\bsw\s+calgary|\bcalgary\s+sw\b/i.test(text)) {
    return { neighborhood: 'Southwest Calgary', lat: 50.975, lng: -114.180 };
  }
  if (/\bse\s+calgary|\bcalgary\s+se\b/i.test(text)) {
    return { neighborhood: 'Southeast Calgary', lat: 50.975, lng: -113.980 };
  }

  return null;
}
```

- [ ] **Step 2: Skip posts with no location in `fetchRedditCalgary`**

In the main loop inside `fetchRedditCalgary` (around line 264), change the location extraction and usage:

```typescript
const location = extractLocationFromText(`${post.title} ${post.selftext}`);
if (!location) continue;
```

Then update the `results.push({ ... })` block — replace `neighborhood: location.neighborhood, lat: location.lat, lng: location.lng` (these stay the same, just `location` is now guaranteed non-null):

```typescript
results.push({
  title: cleanText(post.title, 100),
  description,
  category,
  neighborhood: location.neighborhood,
  lat: location.lat,
  lng: location.lng,
  source_name: 'Reddit r/Calgary',
  source_url: `https://reddit.com${post.permalink}`,
  source_type: 'reddit_calgary',
  data_source: 'official',
  dedup_key: `reddit:${post.id}`,
  expires_at: now + 6 * 60 * 60 * 1000,
  verified_status: 'community_confirmed',
  report_count: 1,
  email: 'ingest@calgarywatch.app',
  name: 'Reddit r/Calgary',
  anonymous: false,
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/sources/reddit.ts
git commit -m "fix(ingest): skip Reddit posts with no locatable neighborhood"
```

---

## Task 3: Tighten 311 and water main API fetches

**Files:**
- Modify: `src/pages/MapPage.tsx` (lines 110–114 for 311, line 199 for water main)

- [ ] **Step 1: Fix the 311 URL — add 7-day date filter, drop traffic category, reduce limit**

Replace lines 110–114 (the `three11Url` construction):

```typescript
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const three11Url =
  'https://data.calgary.ca/resource/iahh-g8bj.json' +
  '?$limit=30' +
  '&$where=' + encodeURIComponent(`status_description='Open' AND requested_date > '${sevenDaysAgo}'`) +
  '&$order=' + encodeURIComponent('requested_date DESC');
```

- [ ] **Step 2: Skip traffic-category 311 items**

After the category assignment block (lines 130–134) — the block that sets `category` based on `sName` — add one guard immediately after it:

```typescript
if (category === 'traffic') continue;
```

The full block after this change looks like:

```typescript
let category: IncidentCategory = 'infrastructure';
if (sName.includes('road') || sName.includes('traffic') || sName.includes('pothole') || sName.includes('pavement') || sName.includes('sidewalk') || sName.includes('signal')) category = 'traffic';
if (sName.includes('snow') || sName.includes('ice') || sName.includes('drain') || sName.includes('spill') || sName.includes('water') || sName.includes('flood')) category = 'weather';
if (sName.includes('bylaw') || sName.includes('disturbance') || sName.includes('noise') || sName.includes('graffiti')) category = 'crime';
if (sName.includes('hazard') || sName.includes('emergency') || sName.includes('danger') || sName.includes('fire')) category = 'emergency';

if (category === 'traffic') continue;
```

- [ ] **Step 3: Fix water main recency threshold — 180 days → 7 days**

Find line 199 (inside the water main fetch block):

```typescript
const recentThreshold = now - 180 * 24 * 60 * 60 * 1000;
```

Replace with:

```typescript
const recentThreshold = now - 7 * 24 * 60 * 60 * 1000;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manually verify in the browser**

Start the dev server:

```bash
npm run dev
```

Open the map. Check:
- Water main pins: should be a small number (0–5 in a typical week), not dozens
- 311 pins: should be infrastructure/bylaw/graffiti only — no "Road Surface Repair", "Pothole", "Sidewalk Damage" type pins
- Traffic pins still appear (from City Traffic API, unchanged)

- [ ] **Step 6: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "fix(map): 311 7-day filter + drop traffic dupes; water main 7-day window"
```

---

## Task 4: Create `useCrimeStatIncidents` hook

**Files:**
- Create: `src/hooks/useCrimeStatIncidents.ts`

- [ ] **Step 1: Create the hook file**

Create `src/hooks/useCrimeStatIncidents.ts`:

```typescript
import { useState, useEffect } from 'react';
import type { Incident, IncidentCategory } from '../types/index';
import { NEIGHBOURHOOD_COORDS } from '../data/neighbourhoodCoords';

function titleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useCrimeStatIncidents(isAuthReady: boolean): Incident[] {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isAuthReady) return;

    const fetchStats = async () => {
      try {
        const [crimeRes, disorderRes] = await Promise.allSettled([
          fetch('https://data.calgary.ca/resource/78gh-n26t.json?$limit=5000'),
          fetch('https://data.calgary.ca/resource/h3h6-kgme.json?$limit=5000'),
        ]);

        const crimeData: any[] =
          crimeRes.status === 'fulfilled' && crimeRes.value.ok
            ? await crimeRes.value.json()
            : [];

        const disorderData: any[] =
          disorderRes.status === 'fulfilled' && disorderRes.value.ok
            ? await disorderRes.value.json()
            : [];

        // Find most recent year across both datasets
        let maxYear = 0;
        for (const row of [...crimeData, ...disorderData]) {
          const y = parseInt(row.year ?? '0', 10);
          if (y > maxYear) maxYear = y;
        }
        if (!maxYear) return;

        // Aggregate crime counts by community and category for maxYear
        const crimeByCommunity = new Map<string, Map<string, number>>();
        for (const row of crimeData) {
          if (parseInt(row.year ?? '0', 10) !== maxYear) continue;
          const community = (row.community ?? '').trim().toUpperCase();
          if (!community) continue;
          const category = (row.category ?? 'Criminal Incident').trim();
          const count = parseInt(row.crime_count ?? '0', 10);
          if (!crimeByCommunity.has(community)) crimeByCommunity.set(community, new Map());
          const catMap = crimeByCommunity.get(community)!;
          catMap.set(category, (catMap.get(category) ?? 0) + count);
        }

        // Aggregate disorder counts by community for maxYear
        const disorderByCommunity = new Map<string, number>();
        for (const row of disorderData) {
          if (parseInt(row.year ?? '0', 10) !== maxYear) continue;
          const community = (row.community ?? '').trim().toUpperCase();
          if (!community) continue;
          const count = parseInt(row.event_count ?? '0', 10);
          disorderByCommunity.set(community, (disorderByCommunity.get(community) ?? 0) + count);
        }

        type Entry = {
          community: string;
          totalCrime: number;
          totalDisorder: number;
          dominantCategory: string;
          coords: [number, number];
        };

        const entries: Entry[] = [];

        for (const [community, catMap] of crimeByCommunity) {
          const coords = NEIGHBOURHOOD_COORDS[community.toLowerCase()];
          if (!coords) continue;

          let totalCrime = 0;
          let dominantCategory = 'Criminal Incident';
          let dominantCount = 0;
          for (const [cat, count] of catMap) {
            totalCrime += count;
            if (count > dominantCount) {
              dominantCount = count;
              dominantCategory = cat;
            }
          }
          const totalDisorder = disorderByCommunity.get(community) ?? 0;
          entries.push({ community, totalCrime, totalDisorder, dominantCategory, coords });
        }

        // Top 20 by combined total
        entries.sort((a, b) => (b.totalCrime + b.totalDisorder) - (a.totalCrime + a.totalDisorder));
        const top20 = entries.slice(0, 20);

        const yearTs = new Date(`${maxYear}-01-01T00:00:00.000Z`).getTime();

        const result: Incident[] = top20.map(({ community, totalCrime, totalDisorder, dominantCategory, coords }) => ({
          id: `cps-crime-stat-${community.toLowerCase().replace(/[\s/]+/g, '-')}`,
          title: `${dominantCategory} · ${titleCase(community)}`,
          description: `${totalCrime} criminal incidents and ${totalDisorder} disorder events reported in ${maxYear}. Source: Calgary Police Service Community Crime Statistics.`,
          category: 'crime' as IncidentCategory,
          neighborhood: titleCase(community),
          lat: coords[0],
          lng: coords[1],
          timestamp: yearTs,
          email: 'opendata@calgarypolice.ca',
          name: 'Calgary Police Service',
          anonymous: false,
          verified_status: 'community_confirmed' as const,
          report_count: totalCrime + totalDisorder,
          data_source: 'official' as const,
          source_name: 'Calgary Police Service',
          source_url: 'https://data.calgary.ca/',
          expires_at: undefined,
        }));

        setIncidents(result);
      } catch (err) {
        console.warn('[CalgaryWatch] CPS crime stats fetch failed:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthReady]);

  return incidents;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCrimeStatIncidents.ts src/data/neighbourhoodCoords.ts
git commit -m "feat(hooks): add useCrimeStatIncidents — CPS top-20 communities as incident cards"
```

---

## Task 5: Wire `useCrimeStatIncidents` into MapPage

**Files:**
- Modify: `src/pages/MapPage.tsx`

- [ ] **Step 1: Import the new hook**

At line 22 in `MapPage.tsx`, after the existing `useCrimeStats` import, add:

```typescript
import { useCrimeStatIncidents } from '@/src/hooks/useCrimeStatIncidents';
```

- [ ] **Step 2: Call the hook inside `MapPage`**

After line 410 (`const { stats: crimeStats } = useCrimeStats();`), add:

```typescript
const crimeStatIncidents = useCrimeStatIncidents(isAuthReady);
```

- [ ] **Step 3: Spread into the incidents memo**

Find the `incidents` useMemo (line 652). Change:

```typescript
const combined = [...firebaseIncidents, ...officialOpenData, ...weatherAlerts];
```

to:

```typescript
const combined = [...firebaseIncidents, ...officialOpenData, ...weatherAlerts, ...crimeStatIncidents];
```

Also add `crimeStatIncidents` to the dependency array on line 662:

```typescript
}, [firebaseIncidents, officialOpenData, weatherAlerts, crimeStatIncidents]);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manually verify in the browser**

```bash
npm run dev
```

Open the map and check:
- Switch category filter to **Crime** — you should see up to 20 pins placed at specific Calgary neighbourhoods (Beltline, Downtown, Forest Lawn, etc.) labelled with the dominant crime type (e.g. "Theft From Vehicle · Beltline")
- Click one pin — `IncidentDetailPanel` opens showing the description with crime + disorder counts and "Calgary Police Service" as the source
- Switch category filter to **All** — CPS pins appear mixed in with live incidents, sorted toward the bottom (oldest timestamp = Jan 1 of the data year)
- Open the sidebar — CPS cards appear with the "official" badge styling

- [ ] **Step 6: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "feat(map): wire CPS crime stat incidents into map and sidebar"
```
