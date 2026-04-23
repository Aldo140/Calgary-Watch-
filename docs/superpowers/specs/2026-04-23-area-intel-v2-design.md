# Area Intel v2 — Design Spec
**Date:** 2026-04-23
**Status:** Approved for implementation

---

## Overview

Four focused improvements to the `AreaIntelligencePanel`:

1. **Bug fix** — Property assessment dataset ID typo (`4ur7-wsgn` → `4ur7-wsgc`)
2. **Key Insights redesign** — Tinder-style swipeable card deck (Approach A)
3. **Property section enhancement** — Quadrant plot, correlation callout, animated value count-up
4. **Additional visuals** — Sparklines in crime bars, rank bar in hero, count-up on property value

---

## Affected Files

| File | Change |
|------|--------|
| `src/hooks/usePropertyAssessments.ts` | Fix dataset ID typo |
| `src/components/AreaIntelligencePanel.tsx` | Redesign `KeySignalsSection`, enhance `PropertyValueSection`, add sparklines to `CrimeThisYearSection`, add rank bar to `HeroSection` |
| `src/pages/MapPage.tsx` | Pass `sortedCommunityTotals` (for rank bar positioning) down to panel |

---

## Change 1 — Bug Fix: Property Assessment Dataset ID

**File:** `src/hooks/usePropertyAssessments.ts`

Change URL from:
```
https://data.calgary.ca/resource/4ur7-wsgn.json
```
To:
```
https://data.calgary.ca/resource/4ur7-wsgc.json
```

Also update the dataset ID reference in `DataSourcesSection` constant inside `AreaIntelligencePanel.tsx`.

No other changes to the hook.

---

## Change 2 — Key Insights: Tinder Card Stack

**Replaces:** `KeySignalsSection` in `AreaIntelligencePanel.tsx`

### Layout

The section renders a card stack. Only the top card is interactive. Two ghost cards sit behind it, slightly offset to create depth.

**Stack appearance:**
- Card 0 (top): full opacity, `rotate(0deg)`, `translateY(0)`
- Card 1 (behind): `scale(0.95)`, `rotate(-2deg)`, `translateY(8px)`, `opacity(0.7)`
- Card 2 (behind that): `scale(0.90)`, `rotate(+1.5deg)`, `translateY(16px)`, `opacity(0.5)`
- Stack depth capped at 3 visible cards regardless of insight count
- `position: relative` container, all cards `position: absolute`, stacked via CSS

### Card Anatomy

Each card is a `motion.div`, `rounded-3xl`, full-width, with:
- **Left accent glow**: 3px solid border-left, color-matched to icon (red/green/blue)
- **Icon badge**: 52×52px `rounded-2xl`, colored bg, 24px icon (`TrendingUp` / `TrendingDown` / `ShieldCheck`)
- **Big stat** (if extractable): first number/percentage found in insight string via regex `/#?\d+[\.\d]*%?/` — rendered at 40–48px font-black, colored
- **Insight text**: 14px font-bold, full width, line-height 1.6
- **Counter pill**: top-right, "2 / 7" format, 10px font-black
- **Thin progress bar** directly below the counter pill: `width: (current+1)/total * 100%`, color-matched to card type

### Drag / Swipe Mechanics

- `drag="x"` on top card only
- `dragConstraints={{ left: 0, right: 0 }}` — snaps back if not dismissed
- `dragElastic={0.15}` — slight resistance at constraints
- Rotation follows drag: `rotate = dragX * 0.03` (via `useTransform`)
- Opacity of ghost cards follows: card 1 fades from 0.7 → 1.0 as top card drags away

**Dismiss threshold:** `|offsetX| > 80px || |velocity.x| > 400`

**Dismiss animation:** top card `animate({ x: dir * 500, opacity: 0, rotate: dir * 20 })` over 300ms

**Entry of next card:** `initial={{ y: 40, scale: 0.9, opacity: 0 }}` → `animate({ y: 0, scale: 1, opacity: 1 })` spring (`damping: 20, stiffness: 300`)

**Cycling:** Wraps infinitely (index = `(currentIdx + 1) % insights.length`)

### Desktop Fallback

Two arrow buttons `←` `→` below the stack. Clicking triggers the same dismiss animation without drag. Buttons use `whileHover`, `whileTap` framer-motion props.

### Implementation Notes

- `currentIdx` state: `useState(0)`
- `isAnimating` ref to block rapid taps during dismiss animation
- `dragX` = `useMotionValue(0)`, passed to `useTransform` for live rotation
- Ghost cards are plain `div`s (not draggable), styled with CSS transforms
- Section title "Key Signals" + counter rendered above the stack, not inside cards
- Minimum height of stack container = `240px` to avoid layout shift as cards cycle

---

## Change 3 — Property Section Enhancement

**Modifies:** `PropertyValueSection` in `AreaIntelligencePanel.tsx`

The section now has three sub-components arranged vertically:

**New props for `PropertyValueSection`:** Add `score: number` (the community's safety score, used to color the quadrant dot — recomputed as `score >= 70 ? '#34d399' : score >= 40 ? '#f59e0b' : '#ef4444'` inside the section).

**New prop for `CrimeThisYearSection`:** Add `yearlyStats: CrimeYearEntry[]` (thread from `Content` component's `realYearly` variable).

### 3a. Quadrant Plot (new, replaces nothing — added above existing chart)

A `280px × 280px` SVG-based (not Recharts) 2×2 matrix:

**Axes:**
- X: Safety Score (0–100), reference line at city median safety score
- Y: Avg Assessed Value, reference line at city median property value
- City median safety score = `cityAverages` safety approximation: `Math.max(10, Math.round(100 - ((cityAverages.avgViolent + cityAverages.avgProperty + cityAverages.avgDisorder) / Math.max(cityMax, 1)) * 75))` — this matches the `safetyScore` formula in `MapPage.tsx`
- City median property value = average of `propertyData[propertyData.length-1].avgValue` across all communities (not available — use the community's own latest value relative to known city-wide estimates; OR simply show the community dot at relative position without other dots)

**Simplified approach** (avoids needing city-wide property data not in scope):
- Show only the 2×2 quadrant grid with labeled sections
- Plot this community's dot at position `(safetyScore / 100 * chartWidth, (1 - normalizedValue) * chartHeight)` where `normalizedValue` is `latestAvgValue / 1_000_000` capped at 1 (Calgary homes range $200k–$1M+, treat $1M as ceiling)
- Reference lines at 50% X (safety score 50) and 50% Y ($500k assessed value)
- City avg crosshair: render a `+` marker at `(50, 50)` — center of the quadrant — labeled "City Avg"

**Quadrant labels** (12px, font-black, positioned in each corner):
- Top-left (low safety, high value): "Transitioning"
- Top-right (high safety, high value): "Premier"
- Bottom-left (low safety, low value): "Challenged"
- Bottom-right (high safety, low value): "Hidden Gem"

**Community dot:**
- 14px circle, filled with `gaugeColor` (green/amber/red matching safety score)
- Pulsing ring: `<circle>` with CSS `animation: ping 1.5s ease-out infinite` — same as Tailwind's `animate-ping`
- Scales from 0 to full size on mount (framer-motion on the SVG `<g>`)
- Tooltip on hover: community name + safety score + avg value

### 3b. Correlation Callout (new, between quadrant and existing chart)

A single callout card computed from `combined` array (shared crime + property years):

Logic:
```ts
const crimeFirst = combined[0].TotalCrime;
const crimeLast  = combined[combined.length - 1].TotalCrime;
const valuFirst  = combined[0].AvgValue;
const valueLast  = combined[combined.length - 1].AvgValue;
const crimeDelta = crimeFirst > 0 ? Math.round(((crimeLast - crimeFirst) / crimeFirst) * 100) : null;
const valueDelta = valuFirst  > 0 ? Math.round(((valueLast  - valuFirst)  / valuFirst)  * 100) : null;
```

Rendered as a single sentence in a pill card (13px, italic):
- Crime ↓ + Value ↑: `"As incidents fell {|crimeDelta|}% ({startYear}–{endYear}), assessed values climbed {valueDelta}% — values tracked the safety improvement."`
- Crime ↑ + Value ↑: `"Despite a {crimeDelta}% rise in incidents, values grew {valueDelta}% — demand outpaced safety concerns."`  
- Crime ↓ + Value ↓: `"Incidents fell {|crimeDelta|}% but values also declined {|valueDelta|}% — other factors drove the market."`
- Otherwise: `"Property values and crime trends moved independently over this period."`

Only rendered when `combined.length >= 2` and both deltas are non-null.

### 3c. Animated Value Count-Up

In the existing insight row, the `fmtDollars(latestEntry.AvgValue)` display:
- Extract the raw `latestEntry.AvgValue` number
- Run through `useCountUp(latestEntry.AvgValue, 1200, inView)` — `inView` from the section's existing `useInView`
- Format result with `fmtDollars` for display
- The `%` change figure in the second cell also counts up from 0 to `|valueChange|`

### 3d. Keep existing ComposedChart

The dual-axis chart remains unchanged below the correlation callout. It becomes the "detailed view" supporting the quadrant's "big picture."

---

## Change 4 — Additional Visuals

### 4a. Sparklines in CrimeThisYearSection

Each bar row gains a tiny sparkline to its right showing the 6-year trend for that category.

**Data source:** `yearlyStats` prop (already passed to the parent `Content` component — needs threading into `CrimeThisYearSection` as an additional prop: `yearlyStats: CrimeYearEntry[]`).

**Sparkline spec:**
- 48×20px inline SVG (no Recharts — pure SVG path)
- Input: last 6 years of that category's values from `yearlyStats`
- Renders a single polyline, normalized to the 20px height
- Color: green if last value < first value (declining = good), red if rising, slate if flat (delta < 5%)
- No axes, no labels — purely decorative trend indicator
- `strokeWidth: 1.5`, `fill: none`, `strokeLinecap: round`, `strokeLinejoin: round`

**Layout change:** Row header becomes a 3-column flex:
```
[label + badge]   [sparkline 48×20]   [count]
```

### 4b. City Rank Bar in Hero

Added to `HeroSection` below the 3-chip grid, above the `liveOverlayInsight` pill.

**Requires:** `totalCommunities: number` and `rank: number` props added to `HeroSection` (sourced from the computed insights already in `data.insights[0]` — extract rank via regex, or pass as separate props from `Content`).

**Simpler approach:** Parse rank from `data.insights` — the first computed insight is always `"This community ranks #N of M Calgary neighbourhoods..."`. Extract N and M with regex `/#(\d+) of (\d+)/`.

**Visual:**
- Eyebrow label: "CITY RANK" (10px uppercase slate-500)
- Single line: `#38 out of 224 neighbourhoods`  (11px, white)
- Progress bar: 4px tall, `rounded-full`, dark bg, colored fill at `(rank / total) * 100%` — but inverted: rank 1 = worst (most crime) = 100% fill red; rank 224 = best = near 0% fill green. Animate width on mount.
- Shown only when `rank > 0 && total > 0`
- If regex fails to match (e.g. no computed insights), the rank bar is not rendered (safe fallback — no crash)

### 4c. Count-up on Property Value

Already covered in Change 3c above.

---

## Dual-Theme Tokens

All new elements follow the existing `isLight` pattern. Quadrant plot:
- Light: white SVG bg, `stroke: #e2e8f0` grid, `fill: #f8fafc` quadrant zones
- Dark: transparent SVG bg, `stroke: rgba(255,255,255,0.05)` grid, `fill: rgba(255,255,255,0.01)` quadrant zones

---

## Out of Scope

- Fetching city-wide property assessment averages (no endpoint provides pre-aggregated community averages)
- Any new API endpoints beyond the dataset ID fix
- Changes to `AdminPage.tsx`, `useCrimeStats.ts`, or other hooks
