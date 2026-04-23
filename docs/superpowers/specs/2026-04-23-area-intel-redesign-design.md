# Area Intel Redesign — Design Spec
**Date:** 2026-04-23
**Status:** Approved for implementation

---

## Overview

Rework `AreaIntelligencePanel.tsx` from a tab-based mobile drawer into a rich, single-scroll immersive experience. Add a new `usePropertyAssessments` hook to cross-reference Calgary assessed property values against crime trends. Fix the Traffic page views total count bug in `AdminPage.tsx`. Apply the `ui-ux-pro-max` and `frontend-design` aesthetic principles throughout — completely unique, non-generic design that works in both dark and light themes.

---

## Goals

- Replace 3 mobile tabs with a single continuous scroll — the scroll IS the experience
- Minimum readable text: 13px body, 20px section titles, 40px hero stats
- Every section animates into view (Intersection Observer + framer-motion)
- Surface community rank, city-average comparisons, and year-over-year deltas — data that does not exist today
- Add property value × crime cross-reference as the signature section
- Fix totalPageViews stuck at 2000 in Admin traffic section

---

## Affected Files

| File | Change |
|------|--------|
| `src/components/AreaIntelligencePanel.tsx` | Full rewrite |
| `src/hooks/usePropertyAssessments.ts` | New hook |
| `src/hooks/useCrimeStats.ts` | Add city-average computation helper export |
| `src/pages/MapPage.tsx` | Pass new hook data to panel |
| `src/pages/AdminPage.tsx` | Fix totalPageViews bug |

---

## Shell & Layout

### Mobile (Vaul Drawer)
- 92vh drawer, rounded-top-[3rem], drag handle at top — unchanged
- **Remove the 3 tabs entirely**
- Single `overflow-y-auto` scroll body
- Sticky mini-bar appears after scrolling 120px past hero: shows community name (14px font-black) + safety score chip (color-coded). `position: sticky; top: 0; z-index: 10`. Uses IntersectionObserver on the hero to toggle visibility.

### Desktop (Sliding Panel)
- Slides in from right as today (spring animation, 62vw, max 66rem)
- Same single-scroll layout
- Some sections use side-by-side layout at `xl:` breakpoint (e.g. donut chart beside 6-year trend)

### Typography Upgrade (applies everywhere)
| Element | Before | After |
|---------|--------|-------|
| Section eyebrow | 10px | 11px uppercase tracked |
| Section title | 10px | 20–22px font-black |
| Body / explanations | 9–10px | 13–14px |
| Chart axis labels | 9–10px | 11–12px |
| Hero community name | 18–32px | 36–40px |
| Hero stat numbers | 12–14px | 40–52px |
| Insight card text | 12px | 14px font-bold |
| Data source text | 9px | 12–13px |

---

## Section 1 — Hero Header

**Always dark regardless of theme** (like the existing Mission Briefing header). Provides a consistent dramatic entry.

### Layout
- Top: eyebrow "Neighbourhood Intelligence" (11px, uppercase, slate-500) + close button (top-right)
- Community name: 36–40px font-black, white, truncates with ellipsis if > 24 chars
- Safety gauge row:
  - Left: SVG donut gauge, 64px mobile / 72px desktop, animated stroke on mount
  - Right: 3 quick-stat chips in a row (Active Incidents, Trend, Risk Level) in a 3-col grid
- Below: `liveOverlayInsight` in a blue-accented pill, 12px, full width

### Safety Score Gauge Animation
- On mount: `stroke-dashoffset` animates from `circumference` to `(1 - score/100) * circumference` over 900ms cubic-ease-out
- Center number counts up from 0 to score using `useCountUp` hook (same duration)
- Gauge color: `score >= 70 → #34d399`, `score 40–69 → #f59e0b`, `score < 40 → #ef4444`

### Background Treatment
Dynamic radial glow behind the community name, keyed to safety score:
- Score ≥ 70: teal glow (`rgba(52,211,153,0.12)`)
- Score 40–69: amber glow (`rgba(245,158,11,0.12)`)
- Score < 40: red glow (`rgba(239,68,68,0.12)`)
Applied as `bg-gradient-to-br` with the glow at `from-` and dark navy at `to-`. Works identically in both themes since the hero is always dark.

---

## Section 2 — Crime This Year

**Section title:** "Crime This Year" (20px font-black)
**Subtitle:** "{year} · Calgary Police Service · Open Data"

### Animated Horizontal Bars
Three rows: Violent (red), Property (blue), Disorder (amber).

Each row:
- Category label: 13px font-bold
- `% of city average` badge: computed as `(value / cityAvgForCategory) * 100`. Renders as "148% of city avg" (red if >120%, amber if 80–120%, green if <80%)
- Raw count: 16px font-black, right-aligned
- Bar: 10px tall, rounded-full, animates `width` from 0 to `(value / maxOfThree) * 100%` using `framer-motion` `animate` triggered by IntersectionObserver. Duration 700ms ease-out.

**City average computation:** Export a `useCityAverages()` helper from `useCrimeStats.ts` that iterates the full `stats` Map and returns `{avgViolent, avgProperty, avgDisorder}` once the stats are loaded.

**Empty state:** If `crimeEntry` is null or all zeros, render a yellow info card: "Detailed breakdown not available for this community. The community name may differ between datasets."

**Source note** (13px, slate-500): "Criminal offences reported to Calgary Police · {year} · City of Calgary Open Data (78gh-n26t, h3h6-kgme)"

---

## Section 3 — 6-Year Crime Trend

**Section title:** "6-Year Picture" (20px)
**Subtitle:** "{startYear} – {endYear} · Annual reported incidents"

### Chart
- Recharts `AreaChart`, 280px tall mobile / 320px desktop
- Three series: Violent (red), Property (blue), Disorder (amber)
- `isAnimationActive={true}` with `animationBegin={200}` — chart draws in after entering viewport
- `CartesianGrid` horizontal lines only, subtle opacity
- Axis labels: 11px, font-weight 700
- Custom tooltip: rounded-2xl, theme-aware background, shows all 3 values

### Category Toggle Pills
Three pills above the chart: `Violent` / `Property` / `Disorder`.
- Active: colored background (red/blue/amber at 15% opacity), colored text, colored border
- Inactive: slate background, muted text
- Toggling a pill hides/shows that `<Area>` series (controlled via `useState`)

### Year-Delta Row
Below the chart, a 3-column row showing change for most recent year vs prior year:
- e.g. `↓ 12%` in green (violent), `↑ 8%` in red (property), `↓ 3%` in green (disorder)
- 12px font-black, uppercase
- Computed from `yearlyStats`: `(latestYear.value - priorYear.value) / priorYear.value * 100`

---

## Section 4 — Crime Category Breakdown

**Section title:** "What's Driving Activity" (20px)
**Subtitle:** "Proportional breakdown · {year}"

### Donut Chart
- Recharts `PieChart` with `innerRadius={60}` `outerRadius={90}` mobile / `innerRadius={70}` `outerRadius={110}` desktop
- Three slices: Violent (red), Property (blue), Disorder (amber)
- Center: total count (28px font-black) + "Total Incidents" label (11px)
- `activeShape` prop: hovered/tapped slice expands to `outerRadius + 8`, shows exact % in an outer label
- On mobile: first slice activates on mount to show users it's interactive

### Legend
Three rows below (or beside at desktop), each: colored dot (10px) + category name (13px font-bold) + count (13px) + percentage badge (11px, colored background).

---

## Section 5 — Property Value × Safety

**Section title:** "Property Value vs Safety" (20px)
**Subtitle:** "Assessed values · City of Calgary · Cross-referenced with crime data"

### New Hook: `usePropertyAssessments`

File: `src/hooks/usePropertyAssessments.ts`

```
Fetches: https://data.calgary.ca/resource/4ur7-wsgn.json
Query params: $where=comm_name='COMMUNITY_NAME'&$select=assessed_value,roll_year&$limit=50000
```

- Community name must be uppercased to match the dataset convention
- Groups by `roll_year`, computes average `assessed_value` per year
- Returns `Map<community_lowercase, {year: number, avgValue: number}[]>` (sorted ascending, last 6 years)
- Caches using `useState` + `setInterval(24h)` — same lifecycle pattern as `useCrimeStats`
- Falls back gracefully: if fetch fails or returns 0 records, the Map entry is absent → empty state shown
- **Note:** Verify dataset ID `4ur7-wsgn` during implementation; check Calgary Open Data portal if it returns 404

### ComposedChart
- Recharts `ComposedChart`, 280px tall mobile / 320px desktop
- Left Y-axis: total crime + disorder (slate label, abbreviated `fmtTick`)
- Right Y-axis: average assessed value (indigo label, formatted as `$450k`)
- Crime: single `<Area>` (slate/red fill) representing total incidents (violent + property + disorder combined) — this chart shows correlation, not breakdown; breakdown is already in Section 4
- Property value: `<Line>` indigo, `strokeWidth={3}`, dots at each year
- X-axis: shared years (intersection of crime years and assessment years)
- Subtle grey `<ReferenceArea>` band on the most recent year column
- `isAnimationActive={true}`

### Insight Row
Below the chart, 2-column grid (13px):
- "Avg. Assessed Value ({year})" → `$487,000` formatted, indigo font-black
- "Change vs 5 years ago" → `↑ 23%` green or `↓ 8%` red

### Methodology Note
Below the insight row (13px, slate-500, italic):
"Assessed values are the City of Calgary's annual tax appraisal — they typically lag the real estate market by approximately one year. Cross-referencing with crime trends can reveal whether safety changes precede or follow property value shifts."

### Empty State
If no assessment data: `<InfoCard>` "Property assessment data not available for this community in the current dataset snapshot."

---

## Section 6 — Key Signals

**Section title:** "Key Signals" (20px)

### Insight Cards (redesigned)
- Icon: 20px in a 44×44px rounded-xl square (not 36px)
- Text: 14px font-bold, generous line-height (1.5)
- Left accent border: 2px, color-matched to icon (red/green/blue)
- Hover/tap: `translateY(-2px)` + soft shadow via framer-motion `whileHover`
- Staggered entry: each card `initial={{ opacity: 0, y: 12 }}` → `animate={{ opacity: 1, y: 0 }}`, 80ms delay per card

### 2 Computed Insights (new, not from mock strings)
Added to the insights array in `MapPage.tsx` when building the `AreaIntelligence` object:

1. **Community rank:** Sort `crimeStats` Map by `(crime + disorder)` descending, find index of this community → "This community ranks #12 of 224 Calgary neighbourhoods by total incident volume."
2. **Property crime ratio:** `property / (violent + property) * 100` → "Property crime accounts for 68% of all incidents — above the city average of 54%."

Both computed at `handleViewNeighborhood` call time and injected into `base.insights`.

---

## Section 7 — Data Sources Accordion

Three accordion items, collapsed by default, with visible 13px headers. Clicking a header expands to show full description.

| Item | Content |
|------|---------|
| Calgary Crime Statistics | Dataset 78gh-n26t. UCR-classified offences by community, year, category. Updates quarterly. |
| Calgary Disorder Statistics | Dataset h3h6-kgme. Non-criminal CPS dispatch events. Updates quarterly. |
| Calgary Property Assessments | Dataset 4ur7-wsgn. Annual tax assessment per property, averaged by community. Lags market ~1 year. |

Each header has an external-link icon (12px). Footer note below accordion: "All figures reflect reported incidents only — not all crime is reported to police."

Accordion implemented with framer-motion `AnimatePresence` + `motion.div` height animation (no library dependency).

---

## Animation System

All section-entry animations use a shared `useInView` hook wrapping `IntersectionObserver` with `threshold: 0.15, once: true`.

| Element | Animation |
|---------|-----------|
| Section titles | `opacity: 0 → 1`, `y: 16 → 0`, 400ms ease-out |
| Stat bars | `width: 0 → target%`, 700ms ease-out, triggered by section entering view |
| Count-up numbers | 0 → value over 900ms cubic-ease-out |
| Insight cards | Staggered `opacity+y`, 80ms between cards |
| Charts | Recharts `isAnimationActive`, `animationBegin: 200ms` |
| Sticky mini-bar | Fade in when hero scrolls out of view |
| Hero gauge | Stroke-dashoffset 900ms on mount |

No bounce/elastic easing anywhere (anti-pattern per impeccable).

---

## Traffic Page Views Bug Fix

**File:** `src/pages/AdminPage.tsx`

**Root cause:** Line 338 sets `setTotalPageViews(snapshot.size)` inside a `onSnapshot` listener that has `limit(2000)` — `snapshot.size` is therefore always capped at 2000.

**Fix:**
1. Import `getCountFromServer` from `firebase/firestore`
2. On mount (inside the existing `isAuthReady && isAdmin` effect), call `getCountFromServer(collection(db, 'page_views'))` and set `setTotalPageViews(result.data().count)`
3. Re-run the count every 5 minutes via `setInterval`
4. The `onSnapshot` with `limit(2000)` stays for the chart/breakdown data — only `totalPageViews` changes

```ts
// Fetch true total count (not capped by the snapshot limit)
const snap = await getCountFromServer(collection(db, 'page_views'));
setTotalPageViews(snap.data().count);
```

---

## Dual-Theme Tokens

All color decisions use the existing `isLight` boolean already in the component. Key additions:

| Token use | Dark | Light |
|-----------|------|-------|
| Section bg | `bg-white/[0.02]` | `bg-slate-50` |
| Section border | `border-white/5` | `border-slate-200` |
| Section title | `text-white` | `text-slate-900` |
| Body text | `text-slate-300` | `text-slate-700` |
| Source/meta text | `text-slate-500` | `text-slate-500` |
| Accent bars | same colors both themes | same |
| Hero | Always dark (`from-[#0f1e3d]`) | Always dark |

---

## Out of Scope

- Fetching 311, traffic, or weather data per-community on panel open (deferred)
- AI-generated narrative summaries
- Push notifications per neighbourhood
- Map flyTo changes
