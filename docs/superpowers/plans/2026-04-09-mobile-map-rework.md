# Mobile Map Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Calgary Watch map page on mobile with a Citizen-style bottom sheet, working unified search, Calgary crime/disorder stats integration (choropleth + detail panel), and fix all known bugs (sun icon error, light mode, OG image).

**Architecture:** New `MobileMapSheet` component (vaul snap-point drawer) replaces the mobile slide-in sidebar entirely; desktop `Sidebar` is untouched. A `useCrimeStats` hook fetches Calgary open data APIs and feeds a choropleth GeoJSON layer in `Map.tsx` and a stats section in `AreaIntelligencePanel`. Bug fixes are standalone and targeted.

**Tech Stack:** React 19, TypeScript, vaul (drawer), motion/react (animations), Leaflet + GeoJSON, Tailwind CSS v4 with custom `light:` variant, Firebase/Firestore, Calgary Open Data SODA2 API.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/MobileMapSheet.tsx` | **Create** | Mobile bottom sheet — search, category filters, incident list, neighborhood fly-to |
| `src/hooks/useCrimeStats.ts` | **Create** | Fetch + normalize Calgary crime/disorder stats by community |
| `src/pages/MapPage.tsx` | **Modify** | Remove mobile drawer, add `MobileMapSheet`, wire `useCrimeStats`, pass choropleth props |
| `src/components/Map.tsx` | **Modify** | Add choropleth GeoJSON layer; accept `showCrimeLayer` + `crimeStats` props |
| `src/components/LayerToggle.tsx` | **Modify** | Add "Crime Stats" toggle chip |
| `src/components/AreaIntelligencePanel.tsx` | **Modify** | Add crime stats card section |
| `src/pages/LandingPage.tsx` | **Modify** | Fix light mode broken sections |
| `index.html` | **Modify** | Fix OG image for Facebook/social sharing |

---

## Task 1: Fix Facebook OG image

**Files:**
- Modify: `index.html:33-34`

- [ ] **Step 1: Verify hero image exists**

```bash
ls -lh public/images/hero-wide.webp
```
Expected: file exists, reasonable size (>100KB).

- [ ] **Step 2: Update OG and Twitter image tags**

In `index.html`, replace lines 33–34:
```html
    <meta property="og:image" content="https://aldo140.github.io/Calgary-Watch-/icon.svg" />
    <meta name="twitter:image" content="https://aldo140.github.io/Calgary-Watch-/icon.svg" />
```
With:
```html
    <meta property="og:image" content="https://calgarywatch.ca/images/hero-wide.webp" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:image" content="https://calgarywatch.ca/images/hero-wide.webp" />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix: update OG image to hero-wide.webp for social sharing previews"
```

---

## Task 2: Fix Plus button color in light mode

**Files:**
- Modify: `src/pages/MapPage.tsx` (~line 1460–1500)

- [ ] **Step 1: Locate the FAB button**

Find the block starting with `className={cn(` that contains `"fixed bottom-"` and renders the `<Plus>` icon. It's the floating action button at the bottom-right corner. The Plus icon at line ~1494 has no light mode color class.

- [ ] **Step 2: Add explicit light mode color to Plus icon**

Find:
```tsx
<Plus size={28} className="transition-transform group-hover:rotate-90 duration-150" />
```
Replace with:
```tsx
<Plus size={28} className="transition-transform group-hover:rotate-90 duration-150 text-white light:text-slate-900" />
```

- [ ] **Step 3: Ensure the FAB button itself has proper light mode background**

Find the FAB `<Button>` element just above the Plus icon. Its `className` likely has `bg-blue-600` (from the `primary` variant). In light mode the `primary` variant renders fine (blue bg, white text). But verify the wrapping `<div>` around the button doesn't override text color.

The containing div at ~line 1450 uses:
```tsx
className={cn(
  "fixed ...",
  (isPinMode || isEmergencyPinMode) && "opacity-0 invisible translate-x-4 pointer-events-none"
)}
```
This is fine. No change needed to the wrapper.

- [ ] **Step 4: Compile and commit**

```bash
npm run lint
git add src/pages/MapPage.tsx
git commit -m "fix: add light mode color to FAB plus icon"
```

---

## Task 3: Diagnose and fix the sun icon error screen

**Files:**
- Modify: `src/components/ErrorBoundary.tsx`
- Modify: whichever component is crashing (identified during this task)

- [ ] **Step 1: Improve ErrorBoundary to log component stack**

In `src/components/ErrorBoundary.tsx`, update `componentDidCatch` to capture the component tree:

```tsx
public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  console.error('=== Calgary Watch Error Boundary ===');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  console.error('Component stack:', errorInfo.componentStack);
}
```

- [ ] **Step 2: Start dev server and reproduce**

```bash
npm run dev
```

Open http://localhost:3000/map in a browser with DevTools open on the Console tab. Click the sun/moon icon. Read the full error message in the console — specifically the **component stack** which shows exactly which component crashed.

- [ ] **Step 3: Apply the fix**

Based on component stack output, apply the targeted fix. The most common crash patterns in this codebase are:

**Pattern A — A `useMemo` or `useEffect` receives `undefined` that it doesn't guard against:**
Add a null/undefined guard to the offending line.

**Pattern B — A Leaflet method called on a destroyed map instance:**
Add `if (!map.current) return;` before the Leaflet call.

**Pattern C — A CSS module class or animation ref accessed during re-render:**
Wrap in a conditional render or null check.

After identifying the exact error, fix it, then verify the theme toggle works in both directions (dark → light → dark) without error.

- [ ] **Step 4: Compile and commit**

```bash
npm run lint
git add src/components/ErrorBoundary.tsx <fixed-file>
git commit -m "fix: resolve sun icon theme toggle error boundary crash"
```

---

## Task 4: Fix landing page light mode

**Files:**
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Start dev server and navigate to landing in light mode**

```bash
npm run dev
```

Navigate to http://localhost:3000, open DevTools, run in the console:
```js
localStorage.setItem('cw-theme', 'light');
location.reload();
```

Scroll through the entire landing page and note every section where:
- Text is invisible (white text on white background)
- Contrast is too low
- Elements overlap or break

- [ ] **Step 2: Fix hero section hardcoded text colors**

In `LandingPage.tsx`, find the hero section `<section>` element (the first full-screen section). Look for any `text-white` class without a `light:text-slate-900` counterpart. Add the light variant.

For example, find all occurrences of `"text-white"` that aren't already in a `light:text-*` context and add the pair. The key areas:
- Hero headline text
- Stat bubble numbers/labels
- Feature section descriptions
- Footer/CTA area text

Note: `index.css` already handles `.light .text-white { color: #0f172a !important; }` globally, so many text issues are already resolved. Focus on sections where text is hardcoded as literal white hex (`#ffffff`) in inline styles, or where a background isn't adapting.

- [ ] **Step 3: Fix background sections that stay dark**

Look for sections with `bg-slate-950` without a `light:bg-slate-50` or `light:bg-white`. The known problematic pattern in `LandingPage.tsx` is around the stats grid and the "how it works" section — some inner divs have `bg-slate-900` without light variants.

Find:
```tsx
className="... bg-slate-900/80 ..."
```
If it's missing a `light:` background variant and the content inside becomes unreadable, add:
```tsx
className="... bg-slate-900/80 light:bg-white ..."
```

- [ ] **Step 4: Verify scrolling through entire page in light mode looks correct**

Re-check http://localhost:3000 in light mode after fixes. Every section should have readable text and appropriate backgrounds.

- [ ] **Step 5: Compile and commit**

```bash
npm run lint
git add src/pages/LandingPage.tsx
git commit -m "fix: repair landing page light mode styling"
```

---

## Task 5: Create `useCrimeStats` hook

**Files:**
- Create: `src/hooks/useCrimeStats.ts`

This hook fetches Calgary Community Crime Statistics and Community Disorder Statistics from the City of Calgary Open Data API and returns a `Map` keyed by normalized community name.

- [ ] **Step 1: Create the hook file**

Create `src/hooks/useCrimeStats.ts` with:

```typescript
import { useState, useEffect } from 'react';

export interface CrimeStatEntry {
  crime: number;
  disorder: number;
  year: number;
}

/**
 * Fetches Calgary Community Crime + Disorder statistics from Open Data.
 * Returns a Map<communityName_lowercase, CrimeStatEntry> for the most recent year.
 * Refreshes every 24 hours (data is not real-time).
 */
export function useCrimeStats(): {
  stats: Map<string, CrimeStatEntry>;
  isLoading: boolean;
} {
  const [stats, setStats] = useState<Map<string, CrimeStatEntry>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      setIsLoading(true);
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

        if (cancelled) return;

        // Find the most recent year in each dataset
        const crimeByYearCommunity = new Map<string, number>();
        let maxCrimeYear = 0;
        for (const row of crimeData) {
          const year = parseInt(row.year ?? row.report_year ?? '0', 10);
          if (year > maxCrimeYear) maxCrimeYear = year;
        }
        for (const row of crimeData) {
          const year = parseInt(row.year ?? row.report_year ?? '0', 10);
          if (year !== maxCrimeYear) continue;
          const community = (row.community_name ?? row.comm_name ?? '').toLowerCase().trim();
          if (!community) continue;
          const count = parseInt(row.crime_count ?? row.count ?? '0', 10);
          crimeByYearCommunity.set(community, (crimeByYearCommunity.get(community) ?? 0) + count);
        }

        const disorderByYearCommunity = new Map<string, number>();
        let maxDisorderYear = 0;
        for (const row of disorderData) {
          const year = parseInt(row.year ?? row.report_year ?? '0', 10);
          if (year > maxDisorderYear) maxDisorderYear = year;
        }
        for (const row of disorderData) {
          const year = parseInt(row.year ?? row.report_year ?? '0', 10);
          if (year !== maxDisorderYear) continue;
          const community = (row.community_name ?? row.comm_name ?? '').toLowerCase().trim();
          if (!community) continue;
          const count = parseInt(row.disorder_count ?? row.count ?? '0', 10);
          disorderByYearCommunity.set(community, (disorderByYearCommunity.get(community) ?? 0) + count);
        }

        // Merge into a single Map
        const merged = new Map<string, CrimeStatEntry>();
        const allCommunities = new Set([
          ...crimeByYearCommunity.keys(),
          ...disorderByYearCommunity.keys(),
        ]);
        for (const community of allCommunities) {
          merged.set(community, {
            crime: crimeByYearCommunity.get(community) ?? 0,
            disorder: disorderByYearCommunity.get(community) ?? 0,
            year: Math.max(maxCrimeYear, maxDisorderYear),
          });
        }

        setStats(merged);
      } catch (err) {
        console.warn('[CalgaryWatch] Crime stats fetch failed:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 24 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { stats, isLoading };
}
```

- [ ] **Step 2: Verify the API field names are correct**

Fetch one record from each API to inspect the actual field names:

```bash
curl "https://data.calgary.ca/resource/78gh-n26t.json?\$limit=1" | head -c 500
curl "https://data.calgary.ca/resource/h3h6-kgme.json?\$limit=1" | head -c 500
```

Adjust the field names in the hook (`row.year`, `row.community_name`, `row.crime_count`, `row.disorder_count`) to match the actual API response. For example if the crime count field is named `crime_count_total` instead, update accordingly.

- [ ] **Step 3: Compile**

```bash
npm run lint
```
Expected: no errors in `src/hooks/useCrimeStats.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCrimeStats.ts
git commit -m "feat: add useCrimeStats hook for Calgary crime/disorder open data"
```

---

## Task 6: Add choropleth crime layer to Map + LayerToggle

**Files:**
- Modify: `src/components/Map.tsx`
- Modify: `src/components/LayerToggle.tsx`

### Part A — LayerToggle

- [ ] **Step 1: Update LayerToggle props interface**

In `src/components/LayerToggle.tsx`, update the interface and component to add crime layer props:

```tsx
interface LayerToggleProps {
  showLiveReports: boolean;
  setShowLiveReports: (show: boolean) => void;
  showHeatmap: boolean;
  setShowHeatmap: (show: boolean) => void;
  showCrimeLayer: boolean;
  setShowCrimeLayer: (show: boolean) => void;
}

export default function LayerToggle({
  showLiveReports, setShowLiveReports,
  showHeatmap, setShowHeatmap,
  showCrimeLayer, setShowCrimeLayer,
}: LayerToggleProps) {
```

- [ ] **Step 2: Add the Crime Stats chip after the Heatmap chip**

Inside the `<Card>` in `LayerToggle.tsx`, add after the Heatmap button:

```tsx
<button
  type="button"
  onClick={() => setShowCrimeLayer(!showCrimeLayer)}
  className={cn(
    'layer-chip flex items-center gap-1.5 md:gap-2 px-3 max-lg:px-3 py-2 rounded-xl transition-all shrink-0 max-lg:flex-1 max-lg:justify-center md:px-4',
    showCrimeLayer
      ? 'layer-chip-selected bg-blue-500 text-white shadow-lg shadow-blue-500/20'
      : 'text-slate-400 hover:bg-white/5 light:text-slate-700 light:hover:bg-slate-100'
  )}
>
  <ShieldCheck size={14} className="max-lg:shrink-0" />
  <span className="text-[10px] md:text-xs font-bold">Crime</span>
  <span className="hidden md:inline font-bold text-xs"> Stats</span>
</button>
```

Add `ShieldCheck` to the existing import from `lucide-react`:
```tsx
import { Layers, Radio, Activity, Map as MapIcon, ShieldCheck } from 'lucide-react';
```

### Part B — Map component choropleth layer

- [ ] **Step 3: Add choropleth props to Map interface**

In `src/components/Map.tsx`, add to `MapProps`:
```tsx
showCrimeLayer?: boolean;
crimeStats?: Map<string, { crime: number; disorder: number; year: number }>;
```

Add to the `Map` forwardRef signature parameter list (after `isPinMode`):
```tsx
showCrimeLayer = false,
crimeStats,
```

- [ ] **Step 4: Add choropleth state and refs**

Inside the `Map` component, add:
```tsx
const choroplethLayer = useRef<L.GeoJSON | null>(null);
const communityGeoJson = useRef<any>(null); // cached GeoJSON
```

- [ ] **Step 5: Fetch community boundaries GeoJSON once**

Add a new `useEffect` after the tile-layer effect:

```tsx
// Fetch Calgary community boundaries once for choropleth
useEffect(() => {
  if (communityGeoJson.current) return; // already loaded
  fetch('https://data.calgary.ca/resource/surr-xmvs.json?$limit=500')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data) communityGeoJson.current = data;
    })
    .catch(err => console.warn('[CalgaryWatch] Community boundaries fetch failed:', err));
}, []);
```

**Note:** If `surr-xmvs` doesn't return GeoJSON geometry, try the `j9ps-fyst` dataset ID instead. Verify with:
```bash
curl "https://data.calgary.ca/resource/surr-xmvs.json?\$limit=1" | head -c 500
```
The response must include a `multipolygon` or `the_geom` field with polygon geometry. If the geometry is in a nested `the_geom` key with `type: "MultiPolygon"`, it's usable.

- [ ] **Step 6: Add choropleth layer effect**

Add a new `useEffect` that renders/clears the choropleth layer:

```tsx
useEffect(() => {
  if (!map.current || !isMapLoaded) return;

  // Remove existing choropleth layer
  if (choroplethLayer.current) {
    map.current.removeLayer(choroplethLayer.current);
    choroplethLayer.current = null;
  }

  if (!showCrimeLayer || !crimeStats || !communityGeoJson.current) return;

  const geoData = communityGeoJson.current;

  // Build FeatureCollection from the flat records if needed
  // The SODA2 API returns records with geometry as a nested object
  const features = geoData
    .filter((row: any) => row.the_geom)
    .map((row: any) => ({
      type: 'Feature',
      properties: {
        name: (row.name ?? row.comm_name ?? row.community_name ?? '').toLowerCase(),
      },
      geometry: row.the_geom,
    }));

  if (!features.length) return;

  const featureCollection = { type: 'FeatureCollection', features };

  // Color scale by crime count
  const getColor = (communityName: string): string => {
    const entry = crimeStats.get(communityName);
    if (!entry) return 'transparent';
    const total = entry.crime + entry.disorder;
    if (total >= 80) return 'rgba(239, 68, 68, 0.45)';   // red-500
    if (total >= 30) return 'rgba(245, 158, 11, 0.40)';  // amber-500
    if (total >= 10) return 'rgba(59, 130, 246, 0.25)';  // blue-500
    return 'rgba(34, 197, 94, 0.15)';                    // green-500 (low)
  };

  choroplethLayer.current = L.geoJSON(featureCollection as any, {
    style: (feature) => ({
      fillColor: getColor(feature?.properties?.name ?? ''),
      weight: 0.5,
      opacity: 0.6,
      color: 'rgba(255,255,255,0.2)',
      fillOpacity: 1,
    }),
    onEachFeature: (feature, layer) => {
      const name = feature.properties?.name ?? '';
      const entry = crimeStats.get(name);
      if (entry) {
        layer.bindTooltip(
          `<strong>${name.replace(/\b\w/g, (c: string) => c.toUpperCase())}</strong><br/>` +
          `Crime: ${entry.crime} · Disorder: ${entry.disorder} (${entry.year})`,
          { className: 'custom-map-tooltip', sticky: true }
        );
      }
    },
  }).addTo(map.current);

  // Keep choropleth below incident markers
  choroplethLayer.current.bringToBack();
}, [showCrimeLayer, crimeStats, isMapLoaded]);
```

- [ ] **Step 7: Compile**

```bash
npm run lint
```
Fix any TypeScript errors — most likely around the GeoJSON type casting (`as any` should handle Leaflet's GeoJSON types).

- [ ] **Step 8: Commit**

```bash
git add src/components/Map.tsx src/components/LayerToggle.tsx
git commit -m "feat: add crime stats choropleth layer to map and layer toggle"
```

---

## Task 7: Wire crime stats into MapPage + AreaIntelligencePanel

**Files:**
- Modify: `src/pages/MapPage.tsx`
- Modify: `src/components/AreaIntelligencePanel.tsx`

### Part A — MapPage wiring

- [ ] **Step 1: Import and call `useCrimeStats` in MapPage**

At the top of `src/pages/MapPage.tsx`, add import:
```tsx
import { useCrimeStats } from '@/src/hooks/useCrimeStats';
```

Inside `MapPage` component, after `useWeatherAlerts`:
```tsx
const { stats: crimeStats } = useCrimeStats();
```

- [ ] **Step 2: Add `showCrimeLayer` state**

In the state declarations block:
```tsx
const [showCrimeLayer, setShowCrimeLayer] = useState(false);
```

- [ ] **Step 3: Pass new props to Map component**

Find the `<Map>` component in the JSX and add:
```tsx
showCrimeLayer={showCrimeLayer}
crimeStats={crimeStats}
```

- [ ] **Step 4: Pass new props to LayerToggle**

Find the `<LayerToggle>` component and add:
```tsx
showCrimeLayer={showCrimeLayer}
setShowCrimeLayer={setShowCrimeLayer}
```

### Part B — AreaIntelligencePanel crime stats section

- [ ] **Step 5: Add crime stats prop to AreaIntelligencePanel**

In `src/components/AreaIntelligencePanel.tsx`, update the props interface:
```tsx
interface AreaIntelligencePanelProps {
  data: AreaIntelligence | null;
  onClose: () => void;
  crimeStats?: Map<string, { crime: number; disorder: number; year: number }>;
}
```

Update the component signature:
```tsx
export default function AreaIntelligencePanel({ data, onClose, crimeStats }: AreaIntelligencePanelProps) {
```

- [ ] **Step 6: Add crime stats card inside the panel**

Inside the `Content` component, in the scrollable `<div className="flex-1 overflow-y-auto ...">`, add a new card after the `data.description` block:

```tsx
{(() => {
  const communityKey = data.communityName.toLowerCase();
  const entry = crimeStats?.get(communityKey);
  if (!entry) return null;
  return (
    <div className="bg-white/[0.02] light:bg-slate-50 rounded-[1.6rem] p-5 border border-white/5 light:border-slate-200 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50" />
      <div className="pl-2">
        <p className="text-[10px] font-black text-slate-500 light:text-slate-600 uppercase tracking-widest mb-3">
          City Crime Statistics · {entry.year}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/[0.03] light:bg-white rounded-xl p-3 border border-white/5 light:border-slate-200">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Crime Incidents</p>
            <p className="text-2xl font-black text-red-400 light:text-red-600">{entry.crime.toLocaleString()}</p>
          </div>
          <div className="bg-white/[0.03] light:bg-white rounded-xl p-3 border border-white/5 light:border-slate-200">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Disorder Calls</p>
            <p className="text-2xl font-black text-amber-400 light:text-amber-600">{entry.disorder.toLocaleString()}</p>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-2">Source: City of Calgary Open Data</p>
      </div>
    </div>
  );
})()}
```

- [ ] **Step 7: Pass `crimeStats` to AreaIntelligencePanel in MapPage**

Find `<AreaIntelligencePanel>` in `MapPage.tsx` and add:
```tsx
crimeStats={crimeStats}
```

- [ ] **Step 8: Compile and commit**

```bash
npm run lint
git add src/pages/MapPage.tsx src/components/AreaIntelligencePanel.tsx
git commit -m "feat: wire crime stats into map layer and area intelligence panel"
```

---

## Task 8: Create MobileMapSheet component

**Files:**
- Create: `src/components/MobileMapSheet.tsx`

This is the Citizen-style bottom sheet that replaces the mobile slide-in sidebar. It uses vaul with snap points: collapsed (80px handle), peek (38vh), expanded (82vh).

- [ ] **Step 1: Create the file**

Create `src/components/MobileMapSheet.tsx`:

```tsx
import { useState, useEffect, useMemo, useRef, RefObject } from 'react';
import { Drawer } from 'vaul';
import { Search, X, MapPin, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Incident, IncidentCategory, CATEGORY_ICONS } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { MapRef } from '@/src/components/Map';

const SNAP_POINTS = ['80px', 0.38, 0.82] as const;
type SnapPoint = (typeof SNAP_POINTS)[number];

const CATEGORY_OPTIONS: (IncidentCategory | 'all')[] = [
  'all', 'crime', 'traffic', 'infrastructure', 'weather', 'emergency',
];

const CATEGORY_COLORS: Record<IncidentCategory | 'all', string> = {
  all:            'bg-slate-700 text-white',
  crime:          'bg-red-500/20 text-red-300 border-red-500/30',
  traffic:        'bg-amber-500/20 text-amber-300 border-amber-500/30',
  infrastructure: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  weather:        'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  emergency:      'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

function getNeighborhoodCenter(
  incidents: Incident[],
  name: string
): { lat: number; lng: number } | null {
  const matching = incidents.filter(i => i.neighborhood === name && isFinite(i.lat) && isFinite(i.lng));
  if (!matching.length) return null;
  return {
    lat: matching.reduce((s, i) => s + i.lat, 0) / matching.length,
    lng: matching.reduce((s, i) => s + i.lng, 0) / matching.length,
  };
}

interface MobileMapSheetProps {
  incidents: Incident[];
  selectedCategory: IncidentCategory | 'all';
  onCategoryChange: (cat: IncidentCategory | 'all') => void;
  onIncidentClick: (incident: Incident) => void;
  liveCount: number;
  mapRef: RefObject<MapRef | null>;
  isPinMode: boolean;
  theme?: 'dark' | 'light';
}

export default function MobileMapSheet({
  incidents,
  selectedCategory,
  onCategoryChange,
  onIncidentClick,
  liveCount,
  mapRef,
  isPinMode,
  theme = 'dark',
}: MobileMapSheetProps) {
  const [snap, setSnap] = useState<SnapPoint>('80px');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Collapse sheet and reset search when pin mode activates
  useEffect(() => {
    if (isPinMode) {
      setSnap('80px');
      setSearch('');
    }
  }, [isPinMode]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Neighborhoods derived from incident data (for search fly-to)
  const neighborhoods = useMemo(() => {
    const seen = new Set<string>();
    for (const i of incidents) if (i.neighborhood) seen.add(i.neighborhood);
    return [...seen].sort();
  }, [incidents]);

  // Neighborhood search results
  const neighborhoodResults = useMemo(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) return [];
    const q = debouncedSearch.toLowerCase();
    return neighborhoods.filter(n => n.toLowerCase().includes(q)).slice(0, 3);
  }, [debouncedSearch, neighborhoods]);

  // Filtered + sorted incidents
  const filteredIncidents = useMemo(() => {
    let list = incidents.filter(i => !i.deleted);
    if (selectedCategory !== 'all') {
      list = list.filter(i => i.category === selectedCategory || i.category === 'emergency');
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        i =>
          i.title.toLowerCase().includes(q) ||
          i.neighborhood.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.timestamp - a.timestamp).slice(0, 60);
  }, [incidents, selectedCategory, debouncedSearch]);

  const handleNeighborhoodSelect = (name: string) => {
    const center = getNeighborhoodCenter(incidents, name);
    if (center) {
      mapRef.current?.flyTo(center.lat, center.lng, 14);
    }
    setSearch('');
    setSnap('80px');
  };

  const handleIncidentSelect = (incident: Incident) => {
    onIncidentClick(incident);
    setSnap('80px');
  };

  const isExpanded = snap === 0.82;
  const isPeek = snap === 0.38;
  const isCollapsed = snap === '80px';

  return (
    <Drawer.Root
      snapPoints={[...SNAP_POINTS]}
      activeSnapPoint={snap}
      setActiveSnapPoint={(s) => setSnap(s as SnapPoint)}
      modal={false}
      dismissible={false}
      open={!isPinMode}
    >
      <Drawer.Portal>
        <Drawer.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-[50] flex flex-col rounded-t-[1.6rem] outline-none lg:hidden',
            'transition-colors duration-200',
            theme === 'light'
              ? 'bg-white border-t border-slate-200 shadow-[0_-8px_32px_rgba(0,0,0,0.10)]'
              : 'bg-slate-950 border-t border-white/10 shadow-[0_-8px_32px_rgba(0,0,0,0.45)]'
          )}
          style={{ maxHeight: '85vh' }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className={cn(
              'w-10 h-1 rounded-full',
              theme === 'light' ? 'bg-slate-300' : 'bg-slate-700'
            )} />
          </div>

          {/* Collapsed state — just count badge */}
          {isCollapsed && (
            <div
              className="flex items-center justify-between px-4 py-2 cursor-pointer"
              onClick={() => setSnap(0.38)}
            >
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center w-2 h-2">
                  <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
                  <div className="relative w-2 h-2 rounded-full bg-green-500" />
                </div>
                <span className={cn(
                  'text-xs font-black uppercase tracking-widest',
                  theme === 'light' ? 'text-slate-700' : 'text-slate-300'
                )}>
                  {liveCount} live report{liveCount !== 1 ? 's' : ''}
                </span>
              </div>
              <span className={cn(
                'text-[10px] font-bold',
                theme === 'light' ? 'text-slate-500' : 'text-slate-500'
              )}>
                Tap to view
              </span>
            </div>
          )}

          {/* Peek + Expanded state */}
          {(isPeek || isExpanded) && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Search bar */}
              <div className="px-3 pb-2 shrink-0">
                <div className={cn(
                  'flex items-center gap-2 rounded-2xl px-3 py-2.5 border',
                  theme === 'light'
                    ? 'bg-slate-100 border-slate-200'
                    : 'bg-white/5 border-white/10'
                )}>
                  <Search size={15} className={theme === 'light' ? 'text-slate-400 shrink-0' : 'text-slate-500 shrink-0'} />
                  <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={e => {
                      setSearch(e.target.value);
                      if (snap !== 0.82) setSnap(0.38);
                    }}
                    onFocus={() => { if (snap === '80px') setSnap(0.38); }}
                    placeholder="Search reports or neighborhoods…"
                    className={cn(
                      'flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-500 min-w-0',
                      theme === 'light' ? 'text-slate-900' : 'text-white'
                    )}
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Category pills */}
              <div className="px-3 pb-2 shrink-0">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {CATEGORY_OPTIONS.map(cat => (
                    <button
                      key={cat}
                      onClick={() => onCategoryChange(cat)}
                      className={cn(
                        'shrink-0 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors',
                        selectedCategory === cat
                          ? theme === 'light'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-900 border-white'
                          : theme === 'light'
                            ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            : cn('border', CATEGORY_COLORS[cat], 'bg-transparent')
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results list */}
              <div className="flex-1 overflow-y-auto no-scrollbar px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {/* Neighborhood results */}
                <AnimatePresence>
                  {neighborhoodResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-2"
                    >
                      {neighborhoodResults.map(name => (
                        <button
                          key={name}
                          onClick={() => handleNeighborhoodSelect(name)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-colors',
                            theme === 'light'
                              ? 'bg-blue-50 hover:bg-blue-100 border border-blue-200'
                              : 'bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20'
                          )}
                        >
                          <MapPin size={14} className="text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <p className={cn(
                              'text-xs font-black',
                              theme === 'light' ? 'text-slate-900' : 'text-white'
                            )}>{name}</p>
                            <p className="text-[10px] text-slate-500">Fly to area</p>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Incident count label */}
                <p className={cn(
                  'text-[10px] font-black uppercase tracking-widest mb-2',
                  theme === 'light' ? 'text-slate-500' : 'text-slate-500'
                )}>
                  {filteredIncidents.length === 0
                    ? 'No reports found'
                    : `${filteredIncidents.length} report${filteredIncidents.length !== 1 ? 's' : ''}`}
                </p>

                {/* Incident cards */}
                {filteredIncidents.map(incident => {
                  const CategoryIcon = CATEGORY_ICONS[incident.category] ?? CATEGORY_ICONS.crime;
                  return (
                    <button
                      key={incident.id}
                      onClick={() => handleIncidentSelect(incident)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1.5 text-left border transition-colors active:scale-[0.99]',
                        theme === 'light'
                          ? 'bg-white border-slate-200 hover:bg-slate-50'
                          : 'bg-white/[0.04] border-white/8 hover:bg-white/[0.07]'
                      )}
                    >
                      {/* Category color stripe */}
                      <div className={cn(
                        'shrink-0 w-8 h-8 rounded-xl flex items-center justify-center',
                        incident.category === 'emergency' ? 'bg-orange-500/20 text-orange-400' :
                        incident.category === 'crime'     ? 'bg-red-500/20 text-red-400'      :
                        incident.category === 'traffic'   ? 'bg-amber-500/20 text-amber-400'  :
                        incident.category === 'weather'   ? 'bg-cyan-500/20 text-cyan-400'    :
                                                            'bg-blue-500/20 text-blue-400'
                      )}>
                        <CategoryIcon size={14} />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'text-xs font-black truncate',
                          theme === 'light' ? 'text-slate-900' : 'text-white'
                        )}>{incident.title}</p>
                        <p className={cn(
                          'text-[10px] truncate',
                          theme === 'light' ? 'text-slate-500' : 'text-slate-500'
                        )}>{incident.neighborhood}</p>
                      </div>

                      {/* Timestamp */}
                      <div className="shrink-0 flex items-center gap-1 text-slate-500">
                        <Clock size={10} />
                        <span className="text-[9px] font-bold">
                          {formatDistanceToNow(incident.timestamp, { addSuffix: false })}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

- [ ] **Step 2: Compile**

```bash
npm run lint
```
Expected: no errors. If vaul's TypeScript types complain about `snapPoints` prop, cast `[...SNAP_POINTS]` to `(string | number)[]`.

- [ ] **Step 3: Commit**

```bash
git add src/components/MobileMapSheet.tsx
git commit -m "feat: create MobileMapSheet bottom sheet with search and snap states"
```

---

## Task 9: Wire MobileMapSheet into MapPage (replace mobile drawer)

**Files:**
- Modify: `src/pages/MapPage.tsx`

This is the largest change. We remove the mobile slide-in sidebar drawer (the `isSidebarOpen` motion.div) and the fake top-chrome search button behavior, replacing them with the new `MobileMapSheet`.

- [ ] **Step 1: Import MobileMapSheet**

In `src/pages/MapPage.tsx`, add import:
```tsx
import MobileMapSheet from '@/src/components/MobileMapSheet';
```

- [ ] **Step 2: Remove the `isSidebarOpen` mobile drawer**

Find and delete the entire `{/* Mobile Sidebar Drawer */}` `<AnimatePresence>` block (~lines 862–902). This is the block with `motion.div initial={{ x: '-100%' }}` and the `isSidebarOpen` condition. Delete from `{/* Mobile Sidebar Drawer */}` through the closing `</AnimatePresence>`.

Also delete the `isSidebarOpen` state declaration (line ~364):
```tsx
const [isSidebarOpen, setIsSidebarOpen] = useState(false);
```

After deletion, grep for any remaining references:
```bash
grep -n "isSidebarOpen" src/pages/MapPage.tsx
```
Expected: zero results. Remove any stragglers.

- [ ] **Step 3: Convert the top-chrome search bar button to open the sheet**

The top-chrome "search bar" button (line ~938–955) currently calls `setIsSidebarOpen(true)`. Remove that `onClick`. Instead, it becomes purely decorative — tapping it should focus the `MobileMapSheet`'s input. Since the sheet's input auto-focuses when the sheet opens, simply remove the onClick or replace it with a no-op. The sheet is always present; the user just taps it or drags up.

Find the button with `onClick={() => setIsSidebarOpen(true)}` in the top chrome area and remove the `onClick`:
```tsx
<button
  type="button"
  // Remove: onClick={() => setIsSidebarOpen(true)}
  className="flex min-w-0 flex-1 items-center gap-3 ..."
>
```

Or if you want tapping the top bar to snap the sheet to peek state, you'll need to lift the `snap` state up to MapPage. The simpler approach is to just remove the onClick — the sheet's own handle and the drag gesture are enough.

- [ ] **Step 4: Add MobileMapSheet to the JSX**

Inside `<main className="flex-1 relative min-w-0">`, after the `<Map>` component and before the `{/* Near Me Panel */}` block, add:

```tsx
{/* Mobile Bottom Sheet */}
<MobileMapSheet
  incidents={incidents}
  selectedCategory={selectedCategory}
  onCategoryChange={setSelectedCategory}
  onIncidentClick={(incident) => {
    handleMarkerClick(incident);
  }}
  liveCount={mapIncidents.length}
  mapRef={mapRef}
  isPinMode={isPinMode || isEmergencyPinMode}
  theme={theme}
/>
```

- [ ] **Step 5: Adjust LayerToggle bottom position for mobile**

The `LayerToggle` is positioned at `max-lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]`. With the new bottom sheet always present (80px handle), the LayerToggle will be obscured. Update its mobile bottom offset:

In `src/components/LayerToggle.tsx`, change the `max-lg:bottom-` value from `max-lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]` to:
```
max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]
```
This pushes the layer bar above the 80px sheet handle.

- [ ] **Step 6: Verify FAB button position**

The FAB report button (fixed bottom-right) is at `bottom-24` or similar. Ensure it's above the 80px sheet. Check the `fixed` positioned button's `bottom` value and adjust to `bottom-28` or `bottom-[calc(5rem+env(safe-area-inset-bottom))]` if needed.

Find the FAB div wrapper (search for `"fixed"` near `Siren` or `Plus` in MapPage JSX) and adjust its `bottom-*` class.

- [ ] **Step 7: Compile and test**

```bash
npm run lint
```

Then start dev server:
```bash
npm run dev
```

On a mobile viewport (or DevTools mobile emulation), verify:
1. The sheet handle is visible at bottom
2. Dragging/tapping opens it to peek state with search + category pills + incident list
3. Dragging further opens to expanded state with full list
4. Searching for an incident filters the list
5. Searching for a neighborhood name (e.g. "Beltline") shows a fly-to option
6. Tapping an incident closes the sheet and flies the map to the incident
7. The FAB report button and LayerToggle are both visible and not obscured by the sheet handle

- [ ] **Step 8: Commit**

```bash
git add src/pages/MapPage.tsx src/components/LayerToggle.tsx
git commit -m "feat: replace mobile sidebar drawer with MobileMapSheet bottom sheet"
```

---

## Task 10: Final verification

- [ ] **Step 1: TypeScript clean build**

```bash
npm run lint && npm run build
```
Expected: build succeeds with no TypeScript errors. Bundle warnings (chunk size) are OK.

- [ ] **Step 2: Mobile smoke test**

Start dev server and open on a mobile device or DevTools emulation:
- [ ] Bottom sheet handle visible at all times (except pin mode — should hide)
- [ ] Search filters incidents AND surfaces neighborhood fly-to results
- [ ] Category pills filter the list
- [ ] Tapping incident closes sheet + map flies to pin
- [ ] Sun/Moon icon toggles theme with no error screen
- [ ] Plus button (FAB) is visible in both dark and light mode
- [ ] Crime Stats layer toggle appears in LayerToggle bar
- [ ] Enabling Crime Stats colors neighborhoods on the map
- [ ] Tapping a neighborhood shows crime/disorder counts in AreaIntelligencePanel
- [ ] Facebook OG image (verify via https://developers.facebook.com/tools/debug/ after deploy)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: mobile map rework — final verification pass"
```
