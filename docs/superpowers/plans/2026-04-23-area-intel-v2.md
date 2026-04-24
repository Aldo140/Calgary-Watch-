# Area Intel v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four improvements to `AreaIntelligencePanel`: fix the property assessment dataset ID typo, add sparklines to crime bars, add a city rank bar to the hero, rewrite Key Insights as a Tinder card stack, and enhance the property section with a quadrant plot, correlation callout, and animated count-up.

**Architecture:** All changes are self-contained inside `AreaIntelligencePanel.tsx` and `usePropertyAssessments.ts`. No new files are created. Each task modifies one well-bounded area of the component tree and can be tested independently by opening the panel on any community.

**Tech Stack:** React 18, framer-motion (`motion/react`), TypeScript, Tailwind CSS, Recharts (existing), pure SVG for sparklines and quadrant plot.

---

## File Map

| File | Tasks |
|------|-------|
| `src/hooks/usePropertyAssessments.ts` | Task 1 (dataset ID fix) |
| `src/components/AreaIntelligencePanel.tsx` | Tasks 1–5 (all visual/logic changes) |

---

### Task 1: Fix Dataset ID Typo

**Files:**
- Modify: `src/hooks/usePropertyAssessments.ts:39`
- Modify: `src/components/AreaIntelligencePanel.tsx:894` (DATA_SOURCES constant)

The hook fetches `4ur7-wsgn` which returns a 404. The correct ID confirmed via Calgary Open Data catalog is `4ur7-wsgc`.

- [ ] **Step 1: Fix the fetch URL in `usePropertyAssessments.ts`**

In `src/hooks/usePropertyAssessments.ts`, replace line 39:
```ts
// Before:
      `https://data.calgary.ca/resource/4ur7-wsgn.json` +
// After:
      `https://data.calgary.ca/resource/4ur7-wsgc.json` +
```

- [ ] **Step 2: Fix the dataset ID in the DATA_SOURCES constant**

In `src/components/AreaIntelligencePanel.tsx`, find the `DATA_SOURCES` array (around line 883). The third entry currently reads:
```ts
  {
    title: 'Calgary Property Assessments',
    content: 'Dataset 4ur7-wsgn. Annual tax assessment values per property, averaged by community. Reflects appraised value approximately one year behind current market prices.',
  },
```

Replace with:
```ts
  {
    title: 'Calgary Property Assessments',
    content: 'Dataset 4ur7-wsgc. Annual tax assessment values per property, averaged by community. Reflects appraised value approximately one year behind current market prices.',
  },
```

- [ ] **Step 3: Verify the fix works**

Run the dev server (`npm run dev`) and open the panel on any community (e.g., Beltline, Bridgeland). The "Property Value vs Safety" section should now render the chart instead of the empty-state card. Confirm in the Network tab that the request goes to `4ur7-wsgc.json` and returns 200.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePropertyAssessments.ts src/components/AreaIntelligencePanel.tsx
git commit -m "fix(area-intel): correct property assessment dataset ID 4ur7-wsgn → 4ur7-wsgc"
```

---

### Task 2: Sparklines in CrimeThisYearSection

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx` — `CrimeThisYearSection` function and its call site in `Content`

Add a 48×20px inline SVG polyline to each crime bar row showing the 6-year trend for that category. Green if declining, red if rising, slate if flat (delta < 5%).

- [ ] **Step 1: Add `yearlyStats` prop to `CrimeThisYearSection` and update call site**

Find the `CrimeThisYearSection` function signature (around line 410):
```ts
function CrimeThisYearSection({
  crimeEntry, cityAverages, isLight,
}: {
  crimeEntry: CrimeStatEntry | undefined;
  cityAverages: { avgViolent: number; avgProperty: number; avgDisorder: number } | undefined;
  isLight: boolean;
})
```

Replace with:
```ts
function CrimeThisYearSection({
  crimeEntry, cityAverages, isLight, yearlyStats,
}: {
  crimeEntry: CrimeStatEntry | undefined;
  cityAverages: { avgViolent: number; avgProperty: number; avgDisorder: number } | undefined;
  isLight: boolean;
  yearlyStats: CrimeYearEntry[];
})
```

Find the call site in `Content` (around line 288):
```tsx
          <CrimeThisYearSection
            crimeEntry={crimeEntry}
            cityAverages={cityAverages}
            isLight={isLight}
          />
```

Replace with:
```tsx
          <CrimeThisYearSection
            crimeEntry={crimeEntry}
            cityAverages={cityAverages}
            isLight={isLight}
            yearlyStats={realYearly}
          />
```

- [ ] **Step 2: Add the `Sparkline` helper component just above `CrimeThisYearSection`**

Insert this function before `function CrimeThisYearSection`:
```tsx
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 48, H = 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const first = values[0], last = values[values.length - 1];
  const delta = first > 0 ? ((last - first) / first) * 100 : 0;
  const color = delta < -5 ? '#34d399' : delta > 5 ? '#ef4444' : '#64748b';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 3: Update the `rows` array to carry sparkline data and update the row JSX**

Inside `CrimeThisYearSection`, after the `if (!crimeEntry)` guard, the `rows` array currently is:
```ts
  const rows = [
    {
      label: 'Violent Crime',
      value: crimeEntry.violent,
      avg: cityAverages?.avgViolent ?? 0,
      color: 'bg-red-500',
    },
    {
      label: 'Property Crime',
      value: crimeEntry.property,
      avg: cityAverages?.avgProperty ?? 0,
      color: 'bg-blue-500',
    },
    {
      label: 'Disorder Calls',
      value: crimeEntry.disorder,
      avg: cityAverages?.avgDisorder ?? 0,
      color: 'bg-amber-500',
    },
  ];
```

Replace with:
```ts
  const last6 = yearlyStats.slice(-6);
  const rows = [
    {
      label: 'Violent Crime',
      value: crimeEntry.violent,
      avg: cityAverages?.avgViolent ?? 0,
      color: 'bg-red-500',
      sparkValues: last6.map(e => e.violent),
    },
    {
      label: 'Property Crime',
      value: crimeEntry.property,
      avg: cityAverages?.avgProperty ?? 0,
      color: 'bg-blue-500',
      sparkValues: last6.map(e => e.property),
    },
    {
      label: 'Disorder Calls',
      value: crimeEntry.disorder,
      avg: cityAverages?.avgDisorder ?? 0,
      color: 'bg-amber-500',
      sparkValues: last6.map(e => e.disorder),
    },
  ];
```

- [ ] **Step 4: Update the row header JSX to include the sparkline**

Inside the `.map()` over `rows`, the current row header is:
```tsx
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={cn('text-[13px] font-bold', isLight ? 'text-slate-700' : 'text-slate-300')}>{label}</span>
                  {vsCity > 0 && (
                    <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded-full border', vsColor)}>{vsLabel}</span>
                  )}
                </div>
                <span className={cn('text-base font-black', isLight ? 'text-slate-900' : 'text-white')}>{value.toLocaleString()}</span>
              </div>
```

Replace with (3-column flex):
```tsx
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={cn('text-[13px] font-bold truncate', isLight ? 'text-slate-700' : 'text-slate-300')}>{label}</span>
                  {vsCity > 0 && (
                    <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded-full border shrink-0', vsColor)}>{vsLabel}</span>
                  )}
                </div>
                <Sparkline values={sparkValues} />
                <span className={cn('text-base font-black shrink-0', isLight ? 'text-slate-900' : 'text-white')}>{value.toLocaleString()}</span>
              </div>
```

- [ ] **Step 5: Verify sparklines appear**

Open the panel on a community with real crime data. Each bar row should show a tiny colored polyline between the badge and the count. Confirm green = declining trend, red = rising, slate = flat.

- [ ] **Step 6: Commit**

```bash
git add src/components/AreaIntelligencePanel.tsx
git commit -m "feat(area-intel): add sparkline trend indicators to crime bar rows"
```

---

### Task 3: City Rank Bar in HeroSection

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx` — `HeroSection` function

Parse `#N of M` from `data.insights[0]` via regex and render a rank progress bar below the 3-chip grid.

- [ ] **Step 1: Parse rank data inside `HeroSection`**

At the top of the `HeroSection` function body, after `const score = data.safetyScore ?? 0;`, add:
```ts
  const rankMatch = (data.insights[0] ?? '').match(/#(\d+) of (\d+)/);
  const rank  = rankMatch ? parseInt(rankMatch[1], 10) : 0;
  const total = rankMatch ? parseInt(rankMatch[2], 10) : 0;
  const rankPct = rank > 0 && total > 0 ? Math.round((rank / total) * 100) : 0;
  const rankColor = rankPct <= 30 ? '#34d399' : rankPct <= 60 ? '#f59e0b' : '#ef4444';
```

Note: rank 1 = most crime (worst), rank N = least crime (best). So higher `rankPct` → worse safety → red.

- [ ] **Step 2: Add rank bar JSX to `HeroSection`**

Find the closing of the `{/* Gauge + quick stats row */}` div (the `</div>` after the `3-col quick stat chips` div, around line 187). Insert the rank bar between that closing div and the `{/* Live overlay insight */}` block:

```tsx
      {/* City rank bar */}
      {rank > 0 && total > 0 && (
        <div className="mt-4 relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-1">City Rank</p>
          <p className="text-[11px] text-white font-medium mb-1.5">
            #{rank} out of {total} neighbourhoods
          </p>
          <div className="h-[4px] rounded-full overflow-hidden bg-white/10">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: rankColor }}
              initial={{ width: '0%' }}
              animate={{ width: `${rankPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
            />
          </div>
        </div>
      )}
```

- [ ] **Step 3: Verify rank bar renders**

Open the panel on a community. The rank bar should appear between the stat chips and the blue insight pill. Confirm it only renders when `data.insights[0]` contains `#N of M`. Open a community without rank in insights — the bar should be absent (no crash).

- [ ] **Step 4: Commit**

```bash
git add src/components/AreaIntelligencePanel.tsx
git commit -m "feat(area-intel): add city rank progress bar to hero section"
```

---

### Task 4: Tinder Card Stack for KeySignalsSection

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx` — `KeySignalsSection` function + imports

Full rewrite of `KeySignalsSection` as a swipeable Tinder-style card deck. Drag `x` > 80px or velocity > 400 dismisses. Cards cycle infinitely. Ghost cards show stack depth. Desktop gets ← → buttons.

- [ ] **Step 1: Add missing framer-motion imports**

Find the existing import line (around line 5):
```ts
import { motion, AnimatePresence } from 'motion/react';
```

Replace with:
```ts
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
```

- [ ] **Step 2: Rewrite `KeySignalsSection` — full replacement**

Find the entire `KeySignalsSection` function (lines ~832–881) and replace it completely:

```tsx
function KeySignalsSection({
  insights, isLight,
}: {
  insights: string[];
  isLight: boolean;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const isAnimating = useRef(false);
  const dragX = useMotionValue(0);
  const rotate = useTransform(dragX, [-200, 200], [-6, 6]);

  if (insights.length === 0) return null;

  function getCardType(insight: string): 'up' | 'down' | 'neutral' {
    if (insight.includes('↑')) return 'up';
    if (insight.includes('↓')) return 'down';
    return 'neutral';
  }

  function cardColors(type: 'up' | 'down' | 'neutral', isLight: boolean) {
    if (type === 'up')      return { border: '#ef4444', iconBg: isLight ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/20', icon: <TrendingUp size={24} className="text-red-400" />, statColor: '#ef4444', progressColor: '#ef4444' };
    if (type === 'down')    return { border: '#34d399', iconBg: isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20', icon: <TrendingDown size={24} className="text-emerald-400" />, statColor: '#34d399', progressColor: '#34d399' };
    return { border: '#3b82f6', iconBg: isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-500/20', icon: <ShieldCheck size={24} className="text-blue-400" />, statColor: '#3b82f6', progressColor: '#3b82f6' };
  }

  function extractStat(text: string): string | null {
    const m = text.match(/#?\d+[\.\d]*%?/);
    return m ? m[0] : null;
  }

  function dismiss(dir: 1 | -1) {
    if (isAnimating.current || insights.length === 0) return;
    isAnimating.current = true;
    setCurrentIdx(prev => (prev + 1) % insights.length);
    setTimeout(() => { isAnimating.current = false; }, 350);
  }

  const n = insights.length;
  const visibleCards = Math.min(3, n);

  return (
    <Section title="Key Signals" isLight={isLight}>
      {/* Counter above stack */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-widest font-black text-slate-500">
          {currentIdx + 1} / {n}
        </p>
        <div
          className={cn('h-[3px] rounded-full flex-1 mx-3 overflow-hidden', isLight ? 'bg-slate-200' : 'bg-white/10')}
        >
          <motion.div
            className="h-full rounded-full bg-blue-500"
            animate={{ width: `${((currentIdx + 1) / n) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Card stack */}
      <div className="relative" style={{ minHeight: 240 }}>
        {/* Ghost cards (behind) */}
        {visibleCards >= 3 && (
          <div
            className={cn('absolute inset-x-0 top-0 rounded-3xl border', isLight ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/10')}
            style={{
              height: 200,
              transform: 'scale(0.90) translateY(16px) rotate(1.5deg)',
              transformOrigin: 'bottom center',
              opacity: 0.5,
              zIndex: 1,
            }}
          />
        )}
        {visibleCards >= 2 && (
          <div
            className={cn('absolute inset-x-0 top-0 rounded-3xl border', isLight ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/10')}
            style={{
              height: 200,
              transform: 'scale(0.95) translateY(8px) rotate(-2deg)',
              transformOrigin: 'bottom center',
              opacity: 0.7,
              zIndex: 2,
            }}
          />
        )}

        {/* Top (active) card */}
        <AnimatePresence mode="wait">
          {(() => {
            const insight = insights[currentIdx];
            const type = getCardType(insight);
            const colors = cardColors(type, isLight);
            const stat = extractStat(insight);

            return (
              <motion.div
                key={currentIdx}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.15}
                style={{ x: dragX, rotate, zIndex: 3, position: 'relative' }}
                initial={{ y: 40, scale: 0.9, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                onDragEnd={(_, info) => {
                  const { offset, velocity } = info;
                  if (Math.abs(offset.x) > 80 || Math.abs(velocity.x) > 400) {
                    const dir = offset.x > 0 ? 1 : -1;
                    dismiss(dir);
                  }
                  dragX.set(0);
                }}
                className={cn(
                  'rounded-3xl border p-5 cursor-grab active:cursor-grabbing select-none',
                  isLight ? 'bg-white border-slate-200' : 'bg-white/[0.04] border-white/10'
                )}
                style={{
                  borderLeft: `3px solid ${colors.border}`,
                  zIndex: 3,
                  position: 'relative',
                  x: dragX,
                  rotate,
                }}
              >
                <div className="flex items-start gap-4">
                  {/* Icon badge */}
                  <div className={cn('w-[52px] h-[52px] rounded-2xl flex items-center justify-center shrink-0 border', colors.iconBg)}>
                    {colors.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Big stat */}
                    {stat && (
                      <p className="text-[40px] font-black leading-none mb-1" style={{ color: colors.statColor }}>
                        {stat}
                      </p>
                    )}
                    {/* Insight text */}
                    <p className={cn('text-[14px] font-bold leading-[1.6]', isLight ? 'text-slate-800' : 'text-white')}>
                      {insight}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-3 font-medium">← swipe to see next →</p>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>

      {/* Desktop arrow buttons */}
      <div className="hidden md:flex items-center justify-center gap-3 mt-4">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            if (!isAnimating.current) {
              isAnimating.current = true;
              setCurrentIdx(prev => (prev - 1 + n) % n);
              setTimeout(() => { isAnimating.current = false; }, 350);
            }
          }}
          className={cn(
            'w-10 h-10 rounded-full border flex items-center justify-center text-lg font-black transition-colors',
            isLight ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600' : 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-300'
          )}
          aria-label="Previous insight"
        >
          ←
        </motion.button>
        <span className="text-[11px] font-black text-slate-500">{currentIdx + 1} / {n}</span>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => dismiss(1)}
          className={cn(
            'w-10 h-10 rounded-full border flex items-center justify-center text-lg font-black transition-colors',
            isLight ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600' : 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-300'
          )}
          aria-label="Next insight"
        >
          →
        </motion.button>
      </div>
    </Section>
  );
}
```

- [ ] **Step 3: Verify card stack works**

Open the panel. Key Signals should show a stacked card UI. Drag left/right on mobile; use arrows on desktop. Cards cycle infinitely. Ghost cards behind the top card create depth. Confirm no crash when `insights` is short (1–2 items).

- [ ] **Step 4: Commit**

```bash
git add src/components/AreaIntelligencePanel.tsx
git commit -m "feat(area-intel): rewrite Key Insights as Tinder swipeable card stack"
```

---

### Task 5: PropertyValueSection — Quadrant Plot, Correlation Callout, Count-Up

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx` — `PropertyValueSection` function, its call site in `Content`, and `ContentProps`

Three sub-changes: (a) SVG quadrant plot above the existing chart, (b) correlation callout sentence between quadrant and chart, (c) animated count-up on the value figure.

- [ ] **Step 1: Add `score` prop to `PropertyValueSection` and thread it from `Content`**

Find the `PropertyValueSection` function signature (around line 724):
```ts
function PropertyValueSection({
  propertyData, yearlyStats, isLight, tooltipStyle, tooltipLabelStyle,
}: {
  propertyData: PropertyYearEntry[];
  yearlyStats: CrimeYearEntry[];
  isLight: boolean;
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
})
```

Replace with:
```ts
function PropertyValueSection({
  propertyData, yearlyStats, isLight, tooltipStyle, tooltipLabelStyle, score,
}: {
  propertyData: PropertyYearEntry[];
  yearlyStats: CrimeYearEntry[];
  isLight: boolean;
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
  score: number;
})
```

Find the call site in `Content` (around line 305):
```tsx
          <PropertyValueSection
            propertyData={propertyData}
            yearlyStats={realYearly}
            isLight={isLight}
            tooltipStyle={tooltipStyle}
            tooltipLabelStyle={tooltipLabelStyle}
          />
```

Replace with:
```tsx
          <PropertyValueSection
            propertyData={propertyData}
            yearlyStats={realYearly}
            isLight={isLight}
            tooltipStyle={tooltipStyle}
            tooltipLabelStyle={tooltipLabelStyle}
            score={score}
          />
```

- [ ] **Step 2: Add `useInView` call inside `PropertyValueSection` for count-up**

Inside `PropertyValueSection`, after the early returns (empty state and `sharedYears.length < 2`), add a `useInView` hook call and count-up hooks at the top of the main render body:

```ts
  const [valueRef, valueInView] = useInView();
  const animatedValue   = useCountUp(latestEntry.AvgValue, 1200, valueInView);
  const animatedChange  = useCountUp(Math.abs(valueChange ?? 0), 1000, valueInView);
```

Note: These lines must come after the `combined`, `latestEntry`, `earliestEntry`, and `valueChange` declarations that already exist in the function.

- [ ] **Step 3: Add the quadrant SVG plot above the existing `<Section>` return**

Inside `PropertyValueSection`, just before the `return (` statement, compute the quadrant dot position:

```ts
  const gaugeColor    = score >= 70 ? '#34d399' : score >= 40 ? '#f59e0b' : '#ef4444';
  const CHART_W       = 216;
  const CHART_H       = 216;
  const PAD           = 32;
  const dotX          = PAD + (score / 100) * CHART_W;
  const dotY          = PAD + (1 - Math.min(latestEntry.AvgValue / 1_000_000, 1)) * CHART_H;
```

Then, inside the `<Section>` JSX, insert the quadrant SVG **before** the `<div className="h-[280px]...">` chart div:

```tsx
      {/* Quadrant plot */}
      <div
        ref={valueRef}
        className={cn('rounded-[1.6rem] border p-4 mb-4', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}
        role="img"
        aria-label="Safety score vs property value quadrant"
      >
        <p className={cn('text-[10px] font-black uppercase tracking-widest mb-3', isLight ? 'text-slate-500' : 'text-slate-500')}>
          Safety Score vs Assessed Value
        </p>
        <svg
          width="100%"
          viewBox={`0 0 ${CHART_W + PAD * 2} ${CHART_H + PAD * 2}`}
          style={{ display: 'block' }}
        >
          {/* Quadrant zones */}
          <rect x={PAD} y={PAD} width={CHART_W / 2} height={CHART_H / 2} fill={isLight ? 'rgba(248,250,252,0.8)' : 'rgba(255,255,255,0.01)'} />
          <rect x={PAD + CHART_W / 2} y={PAD} width={CHART_W / 2} height={CHART_H / 2} fill={isLight ? 'rgba(240,253,244,0.8)' : 'rgba(52,211,153,0.02)'} />
          <rect x={PAD} y={PAD + CHART_H / 2} width={CHART_W / 2} height={CHART_H / 2} fill={isLight ? 'rgba(254,242,242,0.8)' : 'rgba(239,68,68,0.02)'} />
          <rect x={PAD + CHART_W / 2} y={PAD + CHART_H / 2} width={CHART_W / 2} height={CHART_H / 2} fill={isLight ? 'rgba(239,246,255,0.8)' : 'rgba(59,130,246,0.02)'} />
          {/* Grid lines */}
          <line x1={PAD} y1={PAD + CHART_H / 2} x2={PAD + CHART_W} y2={PAD + CHART_H / 2} stroke={isLight ? '#e2e8f0' : 'rgba(255,255,255,0.05)'} strokeWidth="1" strokeDasharray="4,4" />
          <line x1={PAD + CHART_W / 2} y1={PAD} x2={PAD + CHART_W / 2} y2={PAD + CHART_H} stroke={isLight ? '#e2e8f0' : 'rgba(255,255,255,0.05)'} strokeWidth="1" strokeDasharray="4,4" />
          {/* Quadrant labels */}
          <text x={PAD + 6} y={PAD + 14} fontSize="10" fontWeight="900" fill={isLight ? '#94a3b8' : '#475569'}>Transitioning</text>
          <text x={PAD + CHART_W / 2 + 4} y={PAD + 14} fontSize="10" fontWeight="900" fill={isLight ? '#94a3b8' : '#475569'}>Premier</text>
          <text x={PAD + 6} y={PAD + CHART_H - 4} fontSize="10" fontWeight="900" fill={isLight ? '#94a3b8' : '#475569'}>Challenged</text>
          <text x={PAD + CHART_W / 2 + 4} y={PAD + CHART_H - 4} fontSize="10" fontWeight="900" fill={isLight ? '#94a3b8' : '#475569'}>Hidden Gem</text>
          {/* City avg crosshair */}
          <line x1={PAD + CHART_W / 2 - 6} y1={PAD + CHART_H / 2} x2={PAD + CHART_W / 2 + 6} y2={PAD + CHART_H / 2} stroke="#64748b" strokeWidth="1.5" />
          <line x1={PAD + CHART_W / 2} y1={PAD + CHART_H / 2 - 6} x2={PAD + CHART_W / 2} y2={PAD + CHART_H / 2 + 6} stroke="#64748b" strokeWidth="1.5" />
          <text x={PAD + CHART_W / 2 + 8} y={PAD + CHART_H / 2 - 4} fontSize="9" fill="#64748b" fontWeight="700">City Avg</text>
          {/* Community dot */}
          <motion.g
            initial={{ scale: 0, opacity: 0 }}
            animate={valueInView ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            transition={{ delay: 0.4, type: 'spring', damping: 14, stiffness: 250 }}
            style={{ transformOrigin: `${dotX}px ${dotY}px` }}
          >
            <circle cx={dotX} cy={dotY} r="14" fill={gaugeColor} opacity="0.15">
              <animate attributeName="r" values="10;16;10" dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.15;0;0.15" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle cx={dotX} cy={dotY} r="7" fill={gaugeColor} />
          </motion.g>
          {/* Axis labels */}
          <text x={PAD + CHART_W / 2} y={PAD + CHART_H + 18} fontSize="9" fill="#64748b" textAnchor="middle" fontWeight="700">Safety Score →</text>
          <text x={PAD - 20} y={PAD + CHART_H / 2} fontSize="9" fill="#64748b" textAnchor="middle" transform={`rotate(-90, ${PAD - 20}, ${PAD + CHART_H / 2})`} fontWeight="700">Value →</text>
        </svg>
      </div>
```

- [ ] **Step 4: Add correlation callout between quadrant and existing chart**

Insert a correlation callout div after the quadrant plot div and before the existing chart div. Add this computed logic before the `return (`:

```ts
  const crimeFirst  = combined[0].TotalCrime;
  const crimeLast   = combined[combined.length - 1].TotalCrime;
  const valuFirst   = combined[0].AvgValue;
  const valueLast   = combined[combined.length - 1].AvgValue;
  const crimeDelta  = crimeFirst > 0 ? Math.round(((crimeLast - crimeFirst) / crimeFirst) * 100) : null;
  const valueDelta  = valuFirst  > 0 ? Math.round(((valueLast  - valuFirst)  / valuFirst)  * 100) : null;
  const startYear   = combined[0].name;
  const endYear     = combined[combined.length - 1].name;

  const correlationText = (() => {
    if (crimeDelta === null || valueDelta === null) return null;
    if (crimeDelta < 0 && valueDelta > 0)
      return `As incidents fell ${Math.abs(crimeDelta)}% (${startYear}–${endYear}), assessed values climbed ${valueDelta}% — values tracked the safety improvement.`;
    if (crimeDelta > 0 && valueDelta > 0)
      return `Despite a ${crimeDelta}% rise in incidents, values grew ${valueDelta}% — demand outpaced safety concerns.`;
    if (crimeDelta < 0 && valueDelta < 0)
      return `Incidents fell ${Math.abs(crimeDelta)}% but values also declined ${Math.abs(valueDelta)}% — other factors drove the market.`;
    return `Property values and crime trends moved independently over this period.`;
  })();
```

Then insert the callout JSX after the quadrant div and before the chart div:

```tsx
      {/* Correlation callout */}
      {correlationText && combined.length >= 2 && (
        <div className={cn('rounded-2xl border px-4 py-3 mb-4', isLight ? 'bg-indigo-50 border-indigo-100' : 'bg-indigo-500/5 border-indigo-500/15')}>
          <p className={cn('text-[13px] italic leading-relaxed', isLight ? 'text-indigo-700' : 'text-indigo-300')}>
            {correlationText}
          </p>
        </div>
      )}
```

- [ ] **Step 5: Wire count-up to the insight row**

In the insight row (the `grid grid-cols-2` div near the bottom of `PropertyValueSection`), find:
```tsx
          <p className="text-xl font-black text-indigo-400">{fmtDollars(latestEntry.AvgValue)}</p>
```

Replace with:
```tsx
          <p className="text-xl font-black text-indigo-400">{fmtDollars(animatedValue)}</p>
```

And find:
```tsx
            <p className={cn('text-xl font-black', valueChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {valueChange >= 0 ? '↑' : '↓'} {Math.abs(valueChange)}%
            </p>
```

Replace with:
```tsx
            <p className={cn('text-xl font-black', valueChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {valueChange >= 0 ? '↑' : '↓'} {animatedChange}%
            </p>
```

- [ ] **Step 6: Verify property section renders correctly**

Open the panel on a community with property data (e.g., Beltline after Task 1 fix). Confirm:
- Quadrant plot appears with the community dot in the correct quadrant
- The pulsing animation ring plays on the dot
- Correlation callout sentence renders below the quadrant
- The existing chart is still present below the callout
- The `$XXXk` value and `↑ XX%` change count up from 0 on scroll-into-view

- [ ] **Step 7: Commit**

```bash
git add src/components/AreaIntelligencePanel.tsx
git commit -m "feat(area-intel): quadrant plot, correlation callout, count-up on property section"
```

---

### Task 6: Build Verification

**Files:** None — verification only.

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors. Fix any type errors (most likely `motion.g` requiring a cast — if framer-motion's SVG `<motion.g>` causes a type error, wrap the style prop in `as any` or use `style={{ transformOrigin: ... } as React.CSSProperties}`).

- [ ] **Step 2: Run linter**

```bash
npm run lint
```

Expected: zero new errors introduced.

- [ ] **Step 3: Manual smoke test**

Open the dev server. Test the full panel flow:
1. Open any community → hero loads with rank bar (if rank in insights)
2. Crime This Year section shows sparklines beside each bar
3. Key Insights shows the card stack; swipe/drag and arrow buttons both work
4. Property Value section shows quadrant plot, correlation callout, animated count-up, and existing chart
5. Data Sources accordion shows correct dataset ID `4ur7-wsgc`
6. Test light theme: open Settings → switch theme → reopen panel. All sections should render correctly in both modes.
7. Test a community with no property data — Property section shows the empty state card (no crash)
8. Test a community with no crime data — Crime This Year shows the yellow info card (no crash)

- [ ] **Step 4: Final commit**

```bash
git add src/components/AreaIntelligencePanel.tsx src/hooks/usePropertyAssessments.ts
git commit -m "chore(area-intel): v2 build verification — all changes complete"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Dataset ID fix `4ur7-wsgn → 4ur7-wsgc` | Task 1 |
| Update `DataSourcesSection` constant | Task 1 |
| Tinder card stack for Key Insights | Task 4 |
| Ghost cards (3 visible, CSS transforms) | Task 4 |
| Drag x, dismiss threshold >80px or velocity >400 | Task 4 |
| Infinite cycling | Task 4 |
| Counter pill (N/M) + progress bar | Task 4 |
| Big stat extracted from insight text | Task 4 |
| Desktop arrow buttons with framer-motion hover/tap | Task 4 |
| Quadrant SVG plot 280×280, 4 quadrant labels | Task 5 |
| Community dot with pulsing ring, gaugeColor | Task 5 |
| Correlation callout sentence (4 cases) | Task 5 |
| Count-up on property value + change% | Task 5 |
| Sparklines 48×20 inline SVG for each crime bar | Task 2 |
| Green/red/slate coloring based on trend direction | Task 2 |
| 3-col row layout: [label+badge][sparkline][count] | Task 2 |
| City rank bar in hero, parse #N of M regex | Task 3 |
| Rank bar animated on mount | Task 3 |
| Rank bar hidden when regex fails | Task 3 |

**No placeholders found.** All code is complete and concrete.

**Type consistency:** `useCountUp`, `useInView`, `CrimeYearEntry`, `PropertyYearEntry` all match existing codebase types.
