# Area Intel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `AreaIntelligencePanel` as a rich immersive scroll experience with animated sections, a new property value × crime chart, city-average comparisons, and fix the admin page views count bug.

**Architecture:** Single-scroll panel (tabs removed) with 7 sequential sections, each animated into view via `IntersectionObserver`. A new `usePropertyAssessments` hook fetches per-community assessed property values from Calgary Open Data on demand. A `computeCityAverages` helper derives city-wide averages from the existing `crimeStats` Map for % comparisons.

**Tech Stack:** React 18, TypeScript, framer-motion (`motion/react`), Recharts, Tailwind CSS, Vaul (mobile drawer), Firebase Firestore (`getCountFromServer`).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/pages/AdminPage.tsx` | Fix totalPageViews bug (Task 1) |
| Modify | `src/hooks/useCrimeStats.ts` | Export `computeCityAverages` pure function (Task 2) |
| Create | `src/hooks/usePropertyAssessments.ts` | Fetch + cache per-community property assessment data (Task 3) |
| Create | `src/hooks/useInView.ts` | IntersectionObserver hook — fires once when element enters viewport (Task 4) |
| Create | `src/hooks/useCountUp.ts` | Animates a number from 0 to target over a duration (Task 4) |
| Modify | `src/pages/MapPage.tsx` | Wire new hooks + computed insights into panel (Task 5) |
| Modify | `src/components/AreaIntelligencePanel.tsx` | Full rewrite — Tasks 6–11 |

---

## Task 1: Fix totalPageViews stuck at 2000

**Files:**
- Modify: `src/pages/AdminPage.tsx:8-11` (imports), `src/pages/AdminPage.tsx:333-341` (page views listener)

The bug: `setTotalPageViews(snapshot.size)` is called inside a listener with `limit(2000)`, so `snapshot.size` is always ≤ 2000. Fix by calling `getCountFromServer` separately.

- [ ] **Add `getCountFromServer` to the Firestore import**

Replace the existing import block at lines 8–11:
```ts
import {
  addDoc, collection, deleteDoc, doc, getDocs,
  onSnapshot, orderBy, query, updateDoc, limit, where, deleteField,
  getCountFromServer,
} from 'firebase/firestore';
```

- [ ] **Replace the page_views listener and add a count fetch**

Find the block starting at line 333 (`// Page views — real-time listener`) and replace it:

```ts
// Page views — real-time listener for chart/breakdown data (last 2000 docs)
const unsubPageViews = onSnapshot(
  query(collection(db, 'page_views'), orderBy('timestamp', 'desc'), limit(2000)),
  (snapshot) => {
    setPageViewDocs(snapshot.docs.map(d => d.data() as PageViewDoc));
  },
  () => {}
);

// True total count — not capped by the snapshot limit
const fetchTotalCount = async () => {
  try {
    const snap = await getCountFromServer(collection(db, 'page_views'));
    setTotalPageViews(snap.data().count);
  } catch {
    setTotalPageViews(0);
  }
};
fetchTotalCount();
const countInterval = setInterval(fetchTotalCount, 5 * 60 * 1000);
```

Also add `countInterval` to the cleanup return:
```ts
return () => { unsubIncidents(); unsubStats(); unsubUsers(); unsubPageViews(); unsubFlagged(); clearInterval(countInterval); };
```

- [ ] **Verify**
```bash
npm run lint
```
Expected: no errors.

- [ ] **Commit**
```bash
git add src/pages/AdminPage.tsx
git commit -m "fix(admin): use getCountFromServer for totalPageViews — was capped at 2000 by query limit"
```

---

## Task 2: Add `computeCityAverages` to useCrimeStats

**Files:**
- Modify: `src/hooks/useCrimeStats.ts`

- [ ] **Add the export at the bottom of the file**

Append after the closing `}` of `useCrimeStats`:

```ts
/**
 * Derives city-wide average crime/disorder counts from the full stats Map.
 * Used by AreaIntelligencePanel to show % of city average badges.
 */
export function computeCityAverages(stats: Map<string, CrimeStatEntry>): {
  avgViolent: number;
  avgProperty: number;
  avgDisorder: number;
} {
  if (stats.size === 0) return { avgViolent: 0, avgProperty: 0, avgDisorder: 0 };
  let totalViolent = 0;
  let totalProperty = 0;
  let totalDisorder = 0;
  stats.forEach(e => {
    totalViolent  += e.violent;
    totalProperty += e.property;
    totalDisorder += e.disorder;
  });
  const n = stats.size;
  return {
    avgViolent:  Math.round(totalViolent  / n),
    avgProperty: Math.round(totalProperty / n),
    avgDisorder: Math.round(totalDisorder / n),
  };
}
```

- [ ] **Verify**
```bash
npm run lint
```
Expected: no errors.

- [ ] **Commit**
```bash
git add src/hooks/useCrimeStats.ts
git commit -m "feat(hooks): export computeCityAverages helper from useCrimeStats"
```

---

## Task 3: New `usePropertyAssessments` hook

**Files:**
- Create: `src/hooks/usePropertyAssessments.ts`

Fetches Calgary Open Data property assessments for a single community on demand. Uses a module-level cache so the same community is only fetched once per session.

> **Implementation note:** The dataset ID used below is `4ur7-wsgn`. Before running this task, verify it by opening `https://data.calgary.ca/resource/4ur7-wsgn.json?$limit=2` in a browser. If it returns a 404 or wrong schema, search the Calgary Open Data portal for "Property Assessments" and update the URL. The expected row shape is `{ comm_name: string, assessed_value: string, roll_year: string }`.

- [ ] **Create the file**

```ts
import { useState, useEffect } from 'react';

export interface PropertyYearEntry {
  year: number;
  avgValue: number;
  sampleCount: number;
}

// Module-level cache: community lowercase key → yearly entries
const _cache = new Map<string, PropertyYearEntry[]>();

/**
 * Fetches Calgary property assessment data for a single community.
 * Returns averaged assessed values grouped by year (last 6 years).
 * Results are cached for the session lifetime.
 */
export function usePropertyAssessments(communityName: string | null): {
  data: PropertyYearEntry[];
  isLoading: boolean;
} {
  const [data, setData]         = useState<PropertyYearEntry[]>([]);
  const [isLoading, setLoading] = useState(false);

  useEffect(() => {
    if (!communityName) { setData([]); return; }
    const cacheKey = communityName.toLowerCase();

    if (_cache.has(cacheKey)) {
      setData(_cache.get(cacheKey)!);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // Calgary Open Data expects the community name in UPPER CASE
    const encoded = encodeURIComponent(communityName.toUpperCase());
    const url =
      `https://data.calgary.ca/resource/4ur7-wsgn.json` +
      `?$where=comm_name='${encoded}'` +
      `&$select=assessed_value,roll_year` +
      `&$limit=50000`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((rows: { assessed_value?: string; roll_year?: string }[]) => {
        if (cancelled) return;

        const byYear = new Map<number, { sum: number; count: number }>();
        for (const row of rows) {
          const year  = parseInt(row.roll_year ?? '0', 10);
          const value = parseFloat(row.assessed_value ?? '0');
          if (!year || isNaN(value) || value <= 0) continue;
          const entry = byYear.get(year) ?? { sum: 0, count: 0 };
          entry.sum   += value;
          entry.count += 1;
          byYear.set(year, entry);
        }

        const result: PropertyYearEntry[] = [...byYear.entries()]
          .filter(([y]) => y > 0)
          .sort(([a], [b]) => a - b)
          .slice(-6)
          .map(([year, { sum, count }]) => ({
            year,
            avgValue: Math.round(sum / count),
            sampleCount: count,
          }));

        _cache.set(cacheKey, result);
        setData(result);
      })
      .catch(() => {
        if (!cancelled) setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [communityName]);

  return { data, isLoading };
}
```

- [ ] **Verify**
```bash
npm run lint
```
Expected: no errors.

- [ ] **Commit**
```bash
git add src/hooks/usePropertyAssessments.ts
git commit -m "feat(hooks): add usePropertyAssessments — Calgary Open Data property assessment averages per community"
```

---

## Task 4: Utility hooks — `useInView` + `useCountUp`

**Files:**
- Create: `src/hooks/useInView.ts`
- Create: `src/hooks/useCountUp.ts`

- [ ] **Create `src/hooks/useInView.ts`**

```ts
import { useEffect, useRef, useState } from 'react';

/**
 * Returns a ref and a boolean that becomes true once the element enters
 * the viewport. Fires once and disconnects (scroll-in trigger only).
 */
export function useInView(threshold = 0.15): [React.RefObject<HTMLDivElement>, boolean] {
  const ref    = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inView) return; // already triggered

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, inView]);

  return [ref, inView];
}
```

- [ ] **Create `src/hooks/useCountUp.ts`**

```ts
import { useEffect, useState } from 'react';

/**
 * Animates from 0 to `target` over `duration` ms using cubic ease-out.
 * Only starts when `active` is true (wire to inView).
 */
export function useCountUp(target: number, duration = 900, active = true): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active || target === 0) {
      setValue(target);
      return;
    }
    setValue(0);
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed  = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // cubic ease-out: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };

    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, duration, active]);

  return value;
}
```

- [ ] **Verify**
```bash
npm run lint
```
Expected: no errors.

- [ ] **Commit**
```bash
git add src/hooks/useInView.ts src/hooks/useCountUp.ts
git commit -m "feat(hooks): add useInView and useCountUp animation utilities"
```

---

## Task 5: Wire MapPage.tsx — new hooks + computed insights

**Files:**
- Modify: `src/pages/MapPage.tsx`

Adds `usePropertyAssessments`, `computeCityAverages`, two computed insights, and passes new props to `AreaIntelligencePanel`.

- [ ] **Add imports at the top of MapPage.tsx**

Find the existing import:
```ts
import { useCrimeStats } from '@/src/hooks/useCrimeStats';
```
Replace with:
```ts
import { useCrimeStats, computeCityAverages } from '@/src/hooks/useCrimeStats';
import { usePropertyAssessments } from '@/src/hooks/usePropertyAssessments';
```

- [ ] **Add `usePropertyAssessments` call near where `useCrimeStats` is called (line ~443)**

Find:
```ts
const { stats: crimeStats, yearlyStats: crimeYearlyStats } = useCrimeStats();
```
Replace with:
```ts
const { stats: crimeStats, yearlyStats: crimeYearlyStats } = useCrimeStats();
const { data: propertyData } = usePropertyAssessments(selectedArea?.communityName ?? null);
const cityAverages = useMemo(() => computeCityAverages(crimeStats), [crimeStats]);
```

(`useMemo` is already imported in MapPage.tsx.)

- [ ] **Add computed insights in `handleViewNeighborhood`**

Find the block in `handleViewNeighborhood` that calls `setSelectedArea`:

```ts
if (entry) {
  const total = entry.crime + entry.disorder;
  const score = Math.max(10, Math.round(100 - (total / Math.max(cityMax, 1)) * 75));
  const delta = total - cityAvg;
  const trend: 'improving' | 'stable' | 'declining' =
    delta < -cityAvg * 0.2 ? 'improving' : delta > cityAvg * 0.2 ? 'declining' : 'stable';
  setSelectedArea({ ...base, communityName: displayName, safetyScore: score, trend });
```

Replace with:
```ts
if (entry) {
  const total = entry.crime + entry.disorder;
  const score = Math.max(10, Math.round(100 - (total / Math.max(cityMax, 1)) * 75));
  const delta = total - cityAvg;
  const trend: 'improving' | 'stable' | 'declining' =
    delta < -cityAvg * 0.2 ? 'improving' : delta > cityAvg * 0.2 ? 'declining' : 'stable';

  // Computed insights from real data
  const sortedTotals = [...crimeStats.entries()]
    .map(([, e]) => e.crime + e.disorder)
    .sort((a, b) => b - a);
  const rank = sortedTotals.findIndex(v => v <= total) + 1;
  const totalCommunities = crimeStats.size;

  const propPct = entry.violent + entry.property > 0
    ? Math.round((entry.property / (entry.violent + entry.property)) * 100)
    : 0;
  const cityPropPct = cityAverages.avgProperty + cityAverages.avgViolent > 0
    ? Math.round((cityAverages.avgProperty / (cityAverages.avgProperty + cityAverages.avgViolent)) * 100)
    : 0;
  const propVsCityText = propPct > cityPropPct
    ? `above the city average of ${cityPropPct}%`
    : propPct < cityPropPct
    ? `below the city average of ${cityPropPct}%`
    : `equal to the city average of ${cityPropPct}%`;

  const computedInsights = [
    `This community ranks #${rank} of ${totalCommunities} Calgary neighbourhoods by total incident volume`,
    `Property crime accounts for ${propPct}% of all incidents — ${propVsCityText}`,
  ];

  setSelectedArea({
    ...base,
    communityName: displayName,
    safetyScore: score,
    trend,
    insights: [...computedInsights, ...base.insights],
  });
```

- [ ] **Pass new props to `AreaIntelligencePanel`**

Find:
```tsx
<AreaIntelligencePanel
  data={selectedArea}
  onClose={() => setSelectedArea(null)}
  crimeStats={crimeStats}
  yearlyStats={crimeYearlyStats}
  theme={theme}
/>
```
Replace with:
```tsx
<AreaIntelligencePanel
  data={selectedArea}
  onClose={() => setSelectedArea(null)}
  crimeStats={crimeStats}
  yearlyStats={crimeYearlyStats}
  propertyData={propertyData}
  cityAverages={cityAverages}
  theme={theme}
/>
```

- [ ] **Verify**
```bash
npm run lint
```
TypeScript will error on `AreaIntelligencePanel` because the props interface doesn't have `propertyData`/`cityAverages` yet — that's expected and will be fixed in Task 6.

- [ ] **Commit (after Task 6 passes lint)**

Hold this commit — do it together with Task 6.

---

## Task 6: AreaIntelligencePanel — shell, props interface, hero, sticky mini-bar

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx` (full rewrite — replace entire file)

This task replaces the entire file. Start with the shell + hero. Sections 2–7 are stubs that will be filled in Tasks 7–11.

- [ ] **Replace the entire file with the following**

```tsx
import { useState, useEffect, useRef } from 'react';
import { AreaIntelligence } from '@/src/types';
import { Card } from '@/src/components/ui/Card';
import { X, MapPin, Activity, TrendingUp, TrendingDown, ShieldCheck, Info, Database, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Sector,
  ComposedChart, Line,
} from 'recharts';
import { cn } from '@/src/lib/utils';
import { Drawer } from 'vaul';
import { CrimeStatEntry, CrimeYearEntry } from '@/src/hooks/useCrimeStats';
import { PropertyYearEntry } from '@/src/hooks/usePropertyAssessments';
import { useInView } from '@/src/hooks/useInView';
import { useCountUp } from '@/src/hooks/useCountUp';

/** Abbreviate large tick numbers: 1200 → 1.2k */
function fmtTick(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return String(v);
}

/** Format dollar amounts: 487000 → $487k */
function fmtDollars(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

interface AreaIntelligencePanelProps {
  data: AreaIntelligence | null;
  onClose: () => void;
  crimeStats?: Map<string, CrimeStatEntry>;
  yearlyStats?: Map<string, CrimeYearEntry[]>;
  propertyData?: PropertyYearEntry[];
  cityAverages?: { avgViolent: number; avgProperty: number; avgDisorder: number };
  theme?: 'dark' | 'light';
}

// ── Shared tooltip styles ────────────────────────────────────────────────────

function makeTooltipStyle(isLight: boolean) {
  return {
    backgroundColor: isLight ? '#ffffff' : '#020617',
    borderRadius: '14px',
    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)',
    boxShadow: isLight ? '0 8px 32px -4px rgba(0,0,0,0.18)' : '0 18px 25px -5px rgba(0,0,0,0.45)',
  };
}

function makeTooltipLabelStyle(isLight: boolean) {
  return {
    fontSize: 11,
    fontWeight: 900,
    color: isLight ? '#1e293b' : '#fff',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
  };
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, subtitle, children, isLight,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  isLight: boolean;
}) {
  const [ref, inView] = useInView();
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="mb-4">
        <h3 className={cn('text-xl font-black leading-tight', isLight ? 'text-slate-900' : 'text-white')}>{title}</h3>
        {subtitle && (
          <p className={cn('text-[11px] uppercase tracking-widest font-bold mt-0.5', isLight ? 'text-slate-500' : 'text-slate-500')}>{subtitle}</p>
        )}
      </div>
      {children}
    </motion.div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection({
  data, onClose, glowColor, gaugeColor,
}: {
  data: AreaIntelligence;
  onClose: () => void;
  glowColor: string;
  gaugeColor: string;
}) {
  const score = data.safetyScore ?? 0;
  const r = 26;
  const circ = 2 * Math.PI * r;
  const [gaugeRef, gaugeInView] = useInView(0);
  const animatedScore = useCountUp(score, 900, gaugeInView);
  const dash = gaugeInView ? (score / 100) * circ : 0;

  return (
    // Hero is always dark regardless of theme
    <div
      className="relative px-5 pt-5 pb-6 md:px-8 overflow-hidden"
      style={{ background: `linear-gradient(135deg, #0f1e3d 0%, #0a1628 100%)` }}
    >
      {/* Score-keyed glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 20% 50%, ${glowColor}, transparent 60%)` }}
      />

      {/* Eyebrow + close */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-1.5">
          <MapPin size={11} className="text-slate-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Neighbourhood Intelligence</span>
        </div>
        <button
          onClick={onClose}
          className="p-2.5 rounded-xl border text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border-white/10 transition-all group"
        >
          <X size={17} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      {/* Community name */}
      <h2
        className="text-[clamp(26px,6vw,40px)] font-black text-white leading-none mb-4 relative z-10 truncate"
        title={data.communityName}
      >
        {data.communityName}
      </h2>

      {/* Gauge + quick stats row */}
      <div ref={gaugeRef} className="flex items-center gap-4 relative z-10">
        {/* Animated SVG gauge */}
        <div className="relative shrink-0 w-[64px] h-[64px] md:w-[72px] md:h-[72px]">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
            <circle
              cx="32" cy="32" r={r} fill="none"
              stroke={gaugeColor}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              transform="rotate(-90 32 32)"
              style={{ transition: gaugeInView ? 'stroke-dasharray 0.9s cubic-bezier(0.33,1,0.68,1)' : 'none' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[15px] font-black text-white leading-none">{animatedScore}</span>
            <span className="text-[7px] text-slate-500 uppercase tracking-wide leading-none mt-0.5">/ 100</span>
          </div>
        </div>

        {/* 3-col quick stat chips */}
        <div className="grid grid-cols-3 gap-2 flex-1">
          {[
            { label: 'Incidents', value: String(data.activeIncidents ?? 0), color: 'text-orange-400' },
            {
              label: 'Trend',
              value: data.trend ?? '–',
              color: data.trend === 'improving' ? 'text-emerald-400' : data.trend === 'declining' ? 'text-red-400' : 'text-slate-300',
            },
            {
              label: 'Risk',
              value: score >= 70 ? 'Low' : score >= 40 ? 'Medium' : 'High',
              color: score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-2 text-center">
              <p className="text-[7px] font-black uppercase tracking-wide text-slate-500 leading-none mb-1">{label}</p>
              <p className={cn('text-[11px] font-black truncate leading-none', color)}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Live overlay insight */}
      {data.liveOverlayInsight && (
        <div className="mt-4 flex items-start gap-2.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl px-3 py-2.5 relative z-10">
          <Activity size={13} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-blue-100 font-medium leading-relaxed">{data.liveOverlayInsight}</p>
        </div>
      )}
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function AreaIntelligencePanel({
  data, onClose, crimeStats, yearlyStats, propertyData, cityAverages, theme = 'dark',
}: AreaIntelligencePanelProps) {
  const isLight = theme === 'light';
  const heroRef = useRef<HTMLDivElement>(null);
  const [miniBarVisible, setMiniBarVisible] = useState(false);

  // Reset mini-bar when community changes
  useEffect(() => { setMiniBarVisible(false); }, [data?.communityName]);

  // Show mini-bar once hero scrolls out of view
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setMiniBarVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [data?.communityName]);

  if (!data) return null;

  const communityKey   = data.communityName.toLowerCase();
  const crimeEntry     = crimeStats?.get(communityKey);
  const realYearly     = yearlyStats?.get(communityKey) ?? [];
  const hasRealData    = realYearly.length > 0;
  const score          = data.safetyScore ?? 0;
  const gaugeColor     = score >= 70 ? '#34d399' : score >= 40 ? '#f59e0b' : '#ef4444';
  const glowColor      = score >= 70 ? 'rgba(52,211,153,0.12)' : score >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';

  const chartData = hasRealData
    ? realYearly.map(e => ({ name: String(e.year), Violent: e.violent, Property: e.property, Disorder: e.disorder }))
    : data.monthlyTrends.map(t => ({ name: t.month, Violent: t.violent_crime, Property: t.property_crime, Disorder: t.disorder_calls }));

  const tooltipStyle      = makeTooltipStyle(isLight);
  const tooltipLabelStyle = makeTooltipLabelStyle(isLight);

  const Content = () => (
    <div className={cn('flex flex-col h-full overflow-hidden relative', isLight ? 'text-slate-900' : 'text-white')}>
      {/* Sticky mini-bar */}
      <AnimatePresence>
        {miniBarVisible && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'sticky top-0 z-20 flex items-center justify-between px-5 py-3 border-b backdrop-blur-xl',
              isLight ? 'bg-white/90 border-slate-200' : 'bg-slate-950/90 border-white/10'
            )}
          >
            <span className="text-sm font-black truncate">{data.communityName}</span>
            <span className={cn(
              'text-xs font-black px-2.5 py-1 rounded-full border',
              score >= 70 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : score >= 40 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            )}>
              {score} / 100
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div ref={heroRef}>
          <HeroSection data={data} onClose={onClose} glowColor={glowColor} gaugeColor={gaugeColor} />
        </div>

        <div className={cn('px-5 md:px-8 py-8 space-y-12', isLight ? 'bg-[rgb(255,250,243)]' : 'bg-slate-950')}>
          {/* Section 2 — Crime This Year */}
          <CrimeThisYearSection
            crimeEntry={crimeEntry}
            cityAverages={cityAverages}
            isLight={isLight}
          />

          {/* Section 3 — 6-Year Trend */}
          <TrendChartSection
            chartData={chartData}
            hasRealData={hasRealData}
            yearlyStats={realYearly}
            isLight={isLight}
            tooltipStyle={tooltipStyle}
            tooltipLabelStyle={tooltipLabelStyle}
          />

          {/* Section 4 — Donut */}
          <DonutSection
            crimeEntry={crimeEntry}
            isLight={isLight}
          />

          {/* Section 5 — Property Value × Safety */}
          <PropertyValueSection
            propertyData={propertyData ?? []}
            yearlyStats={realYearly}
            isLight={isLight}
            tooltipStyle={tooltipStyle}
            tooltipLabelStyle={tooltipLabelStyle}
          />

          {/* Section 6 — Key Signals */}
          <KeySignalsSection
            insights={data.insights}
            isLight={isLight}
          />

          {/* Section 7 — Data Sources */}
          <DataSourcesSection isLight={isLight} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop panel */}
      <div className="hidden lg:block">
        <AnimatePresence>
          {data && (
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 right-0 h-full z-[90] p-5 md:p-6"
            >
              <Card className={cn(
                'h-full w-[min(62vw,66rem)] min-w-[46rem] shadow-[0_0_60px_-8px_rgba(0,0,0,0.6)] overflow-hidden rounded-[2.25rem]',
                isLight ? 'border-slate-200 bg-[rgb(255,250,243)]' : 'border-white/10'
              )}>
                <Content />
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile drawer */}
      <div className="lg:hidden">
        <Drawer.Root open={!!data} onClose={onClose}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 h-[92vh] z-[101] outline-none">
              <div className={cn(
                'h-full rounded-t-[3rem] overflow-hidden border-t flex flex-col',
                isLight ? 'bg-[rgb(255,250,243)] border-stone-200/80' : 'bg-slate-950 border-white/10'
              )}>
                <div className={cn('mx-auto w-12 h-1.5 flex-shrink-0 rounded-full mt-4 mb-0', isLight ? 'bg-slate-300' : 'bg-white/10')} />
                <Drawer.Title className="sr-only">{data.communityName} Area Intelligence</Drawer.Title>
                <Drawer.Description className="sr-only">Safety scores, crime trends, and historical data for {data.communityName}.</Drawer.Description>
                <Content />
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </>
  );
}

// ── Section stubs (filled in Tasks 7–11) ─────────────────────────────────────

function CrimeThisYearSection(_: any) { return null; }
function TrendChartSection(_: any)    { return null; }
function DonutSection(_: any)         { return null; }
function PropertyValueSection(_: any) { return null; }
function KeySignalsSection(_: any)    { return null; }
function DataSourcesSection(_: any)   { return null; }
```

- [ ] **Verify and commit Tasks 5 + 6 together**
```bash
npm run lint
```
Expected: no errors.
```bash
git add src/pages/MapPage.tsx src/components/AreaIntelligencePanel.tsx
git commit -m "feat(area-intel): panel shell — single scroll, hero with animated gauge, sticky mini-bar; wire MapPage hooks"
```

---

## Task 7: Section 2 — Crime This Year (animated bars)

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx` — replace `CrimeThisYearSection` stub

- [ ] **Replace the `CrimeThisYearSection` stub with the full implementation**

Find:
```ts
function CrimeThisYearSection(_: any) { return null; }
```
Replace with:
```tsx
function CrimeThisYearSection({
  crimeEntry, cityAverages, isLight,
}: {
  crimeEntry: CrimeStatEntry | undefined;
  cityAverages: { avgViolent: number; avgProperty: number; avgDisorder: number } | undefined;
  isLight: boolean;
}) {
  const [barsRef, barsInView] = useInView();

  if (!crimeEntry) {
    return (
      <Section title="Crime This Year" isLight={isLight}>
        <div className={cn('rounded-2xl p-4 border flex items-start gap-2.5', isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20')}>
          <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className={cn('text-sm leading-relaxed', isLight ? 'text-amber-800' : 'text-amber-300')}>
            Detailed breakdown not available for this community. The community name may differ between datasets.
          </p>
        </div>
      </Section>
    );
  }

  const maxVal = Math.max(crimeEntry.violent, crimeEntry.property, crimeEntry.disorder, 1);

  const rows = [
    {
      label: 'Violent Crime',
      value: crimeEntry.violent,
      avg: cityAverages?.avgViolent ?? 0,
      color: 'bg-red-500',
      textColor: isLight ? 'text-red-700' : 'text-red-400',
    },
    {
      label: 'Property Crime',
      value: crimeEntry.property,
      avg: cityAverages?.avgProperty ?? 0,
      color: 'bg-blue-500',
      textColor: isLight ? 'text-blue-700' : 'text-blue-400',
    },
    {
      label: 'Disorder Calls',
      value: crimeEntry.disorder,
      avg: cityAverages?.avgDisorder ?? 0,
      color: 'bg-amber-500',
      textColor: isLight ? 'text-amber-700' : 'text-amber-400',
    },
  ];

  return (
    <Section
      title="Crime This Year"
      subtitle={`${crimeEntry.year} · Calgary Police Service · Open Data`}
      isLight={isLight}
    >
      <div ref={barsRef} className="space-y-5">
        {rows.map(({ label, value, avg, color, textColor }, i) => {
          const pct = Math.round((value / maxVal) * 100);
          const vsCity = avg > 0 ? Math.round((value / avg) * 100) : 0;
          const vsLabel =
            vsCity > 120 ? `${vsCity}% of city avg` :
            vsCity > 0   ? `${vsCity}% of city avg` :
                           '–';
          const vsColor =
            vsCity > 120 ? (isLight ? 'text-red-600 bg-red-50 border-red-200' : 'text-red-400 bg-red-500/10 border-red-500/20') :
            vsCity > 80  ? (isLight ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-amber-400 bg-amber-500/10 border-amber-500/20') :
                           (isLight ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20');

          return (
            <div key={label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm font-bold', isLight ? 'text-slate-700' : 'text-slate-300')}>{label}</span>
                  {vsCity > 0 && (
                    <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded-full border', vsColor)}>{vsLabel}</span>
                  )}
                </div>
                <span className={cn('text-base font-black', isLight ? 'text-slate-900' : 'text-white')}>{value.toLocaleString()}</span>
              </div>
              <div className={cn('h-[10px] rounded-full overflow-hidden', isLight ? 'bg-slate-200' : 'bg-white/10')}>
                <motion.div
                  className={cn('h-full rounded-full', color)}
                  initial={{ width: '0%' }}
                  animate={{ width: barsInView ? `${pct}%` : '0%' }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.08 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className={cn('text-[11px] mt-4', isLight ? 'text-slate-500' : 'text-slate-500')}>
        Criminal offences reported to Calgary Police · {crimeEntry.year} · City of Calgary Open Data (78gh-n26t, h3h6-kgme)
      </p>
    </Section>
  );
}
```

- [ ] **Verify**
```bash
npm run lint
```
Expected: no errors.

- [ ] **Commit**
```bash
git add src/components/AreaIntelligencePanel.tsx
git commit -m "feat(area-intel): Section 2 — Crime This Year with animated bars and city-average badges"
```

---

## Task 8: Section 3 — 6-Year Crime Trend (toggle pills + delta row)

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx` — replace `TrendChartSection` stub

- [ ] **Replace the `TrendChartSection` stub**

Find:
```ts
function TrendChartSection(_: any) { return null; }
```
Replace with:
```tsx
function TrendChartSection({
  chartData, hasRealData, yearlyStats, isLight, tooltipStyle, tooltipLabelStyle,
}: {
  chartData: { name: string; Violent: number; Property: number; Disorder: number }[];
  hasRealData: boolean;
  yearlyStats: CrimeYearEntry[];
  isLight: boolean;
  tooltipStyle: object;
  tooltipLabelStyle: object;
}) {
  const [showViolent,  setShowViolent]  = useState(true);
  const [showProperty, setShowProperty] = useState(true);
  const [showDisorder, setShowDisorder] = useState(true);

  // Year-over-year deltas for most recent year
  const deltaRow = (() => {
    if (yearlyStats.length < 2) return null;
    const latest = yearlyStats[yearlyStats.length - 1];
    const prior  = yearlyStats[yearlyStats.length - 2];
    const pct = (a: number, b: number) => b === 0 ? null : Math.round(((a - b) / b) * 100);
    return {
      violent:  pct(latest.violent,  prior.violent),
      property: pct(latest.property, prior.property),
      disorder: pct(latest.disorder, prior.disorder),
      year: latest.year,
    };
  })();

  const startYear = chartData[0]?.name ?? '';
  const endYear   = chartData[chartData.length - 1]?.name ?? '';

  const pills = [
    { key: 'violent' as const,  label: 'Violent',  active: showViolent,  toggle: () => setShowViolent(p  => !p), color: 'border-red-500 bg-red-500/15 text-red-400',   inactive: isLight ? 'border-slate-300 bg-slate-100 text-slate-500' : 'border-white/10 bg-white/5 text-slate-500' },
    { key: 'property' as const, label: 'Property', active: showProperty, toggle: () => setShowProperty(p => !p), color: 'border-blue-500 bg-blue-500/15 text-blue-400',  inactive: isLight ? 'border-slate-300 bg-slate-100 text-slate-500' : 'border-white/10 bg-white/5 text-slate-500' },
    { key: 'disorder' as const, label: 'Disorder', active: showDisorder, toggle: () => setShowDisorder(p => !p), color: 'border-amber-500 bg-amber-500/15 text-amber-400', inactive: isLight ? 'border-slate-300 bg-slate-100 text-slate-500' : 'border-white/10 bg-white/5 text-slate-500' },
  ];

  return (
    <Section
      title="6-Year Picture"
      subtitle={`${startYear} – ${endYear} · Annual reported incidents${hasRealData ? ' · Calgary Open Data' : ' · Estimated'}`}
      isLight={isLight}
    >
      {/* Toggle pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {pills.map(({ key, label, active, toggle, color, inactive }) => (
          <button
            key={key}
            onClick={toggle}
            className={cn(
              'px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide border transition-all',
              active ? color : inactive
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Area chart */}
      <div
        className={cn('h-[280px] md:h-[320px] w-full rounded-[1.6rem] p-4 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}
        role="img"
        aria-label={`Crime trend chart for ${startYear}–${endYear}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="aiV" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="aiP" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="aiD" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isLight ? 'rgba(0,0,0,0.07)' : 'rgba(148,163,184,0.15)'} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} tickFormatter={fmtTick} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ fontSize: 12, fontWeight: 'bold' }} labelStyle={tooltipLabelStyle} />
            {showViolent  && <Area type="monotone" dataKey="Violent"  stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill="url(#aiV)" isAnimationActive animationBegin={200} animationDuration={800} />}
            {showProperty && <Area type="monotone" dataKey="Property" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#aiP)" isAnimationActive animationBegin={200} animationDuration={800} />}
            {showDisorder && <Area type="monotone" dataKey="Disorder" stroke="#f59e0b" strokeWidth={2.5} fillOpacity={1} fill="url(#aiD)" isAnimationActive animationBegin={200} animationDuration={800} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Year-delta row */}
      {deltaRow && (
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: 'Violent',  delta: deltaRow.violent  },
            { label: 'Property', delta: deltaRow.property },
            { label: 'Disorder', delta: deltaRow.disorder },
          ].map(({ label, delta }) => {
            if (delta === null) return null;
            const isUp  = delta > 0;
            const color = isUp
              ? (isLight ? 'text-red-600' : 'text-red-400')
              : (isLight ? 'text-emerald-700' : 'text-emerald-400');
            return (
              <div key={label} className={cn('rounded-xl p-3 border text-center', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/5')}>
                <p className={cn('text-[10px] font-black uppercase tracking-wide mb-0.5', isLight ? 'text-slate-500' : 'text-slate-500')}>{label}</p>
                <p className={cn('text-sm font-black', color)}>
                  {isUp ? '↑' : '↓'} {Math.abs(delta)}%
                </p>
                <p className={cn('text-[9px] mt-0.5', isLight ? 'text-slate-400' : 'text-slate-600')}>vs prior year</p>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
```

- [ ] **Verify**
```bash
npm run lint
```
Expected: no errors.

- [ ] **Commit**
```bash
git add src/components/AreaIntelligencePanel.tsx
git commit -m "feat(area-intel): Section 3 — 6-year trend chart with toggle pills and year-delta row"
```

---

## Task 9: Section 4 — Crime Category Donut

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx` — replace `DonutSection` stub

- [ ] **Replace the `DonutSection` stub**

Find:
```ts
function DonutSection(_: any) { return null; }
```
Replace with:
```tsx
function DonutSection({
  crimeEntry, isLight,
}: {
  crimeEntry: CrimeStatEntry | undefined;
  isLight: boolean;
}) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (!crimeEntry || (crimeEntry.violent + crimeEntry.property + crimeEntry.disorder) === 0) return null;

  const total  = crimeEntry.violent + crimeEntry.property + crimeEntry.disorder;
  const slices = [
    { name: 'Violent',  value: crimeEntry.violent,  color: '#ef4444', description: 'Assault, robbery, threats' },
    { name: 'Property', value: crimeEntry.property, color: '#3b82f6', description: 'Break & enter, theft' },
    { name: 'Disorder', value: crimeEntry.disorder, color: '#f59e0b', description: 'Non-criminal service calls' },
  ];

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent } = props;
    return (
      <g>
        <text x={cx} y={cy - 10} textAnchor="middle" fill={isLight ? '#0f172a' : '#fff'} style={{ fontSize: 22, fontWeight: 900 }}>
          {payload.value.toLocaleString()}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill={isLight ? '#64748b' : '#64748b'} style={{ fontSize: 11, fontWeight: 700 }}>
          {(percent * 100).toFixed(0)}% of total
        </text>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
        <Sector cx={cx} cy={cy} innerRadius={outerRadius + 12} outerRadius={outerRadius + 16} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      </g>
    );
  };

  return (
    <Section
      title="What's Driving Activity"
      subtitle={`Proportional breakdown · ${crimeEntry.year}`}
      isLight={isLight}
    >
      <div className="flex flex-col md:flex-row gap-6 items-center">
        <div className="w-full md:w-auto flex justify-center">
          <PieChart width={240} height={240}>
            <Pie
              activeIndex={activeIdx}
              activeShape={renderActiveShape}
              data={slices}
              cx={120} cy={120}
              innerRadius={68} outerRadius={100}
              dataKey="value"
              onMouseEnter={(_, idx) => setActiveIdx(idx)}
              onClick={(_, idx) => setActiveIdx(idx)}
              isAnimationActive
              animationBegin={200}
              animationDuration={800}
            >
              {slices.map(({ color }, i) => (
                <Cell key={i} fill={color} />
              ))}
            </Pie>
          </PieChart>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3 w-full">
          <p className={cn('text-[11px] font-black uppercase tracking-widest mb-3', isLight ? 'text-slate-500' : 'text-slate-500')}>
            Total: {total.toLocaleString()} incidents
          </p>
          {slices.map(({ name, value, color, description }, i) => (
            <button
              key={name}
              onClick={() => setActiveIdx(i)}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl p-3 border text-left transition-all',
                activeIdx === i
                  ? (isLight ? 'border-slate-300 bg-slate-100' : 'border-white/15 bg-white/[0.06]')
                  : (isLight ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]')
              )}
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={cn('text-sm font-bold', isLight ? 'text-slate-900' : 'text-white')}>{name}</span>
                  <span className={cn('text-sm font-black', isLight ? 'text-slate-900' : 'text-white')}>{value.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className={cn('text-[11px]', isLight ? 'text-slate-500' : 'text-slate-500')}>{description}</span>
                  <span className="text-[11px] font-bold" style={{ color }}>
                    {total > 0 ? `${Math.round((value / total) * 100)}%` : '–'}
                  </span>
                </div>
              </div>
            </button>
          ))}
          <p className={cn('text-[10px] pt-1', isLight ? 'text-slate-400' : 'text-slate-600')}>
            Tap a slice or row to highlight
          </p>
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Verify**
```bash
npm run lint
```
Expected: no errors.

- [ ] **Commit**
```bash
git add src/components/AreaIntelligencePanel.tsx
git commit -m "feat(area-intel): Section 4 — interactive donut chart for crime category breakdown"
```

---

## Task 10: Section 5 — Property Value × Safety (ComposedChart)

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx` — replace `PropertyValueSection` stub

- [ ] **Replace the `PropertyValueSection` stub**

Find:
```ts
function PropertyValueSection(_: any) { return null; }
```
Replace with:
```tsx
function PropertyValueSection({
  propertyData, yearlyStats, isLight, tooltipStyle, tooltipLabelStyle,
}: {
  propertyData: PropertyYearEntry[];
  yearlyStats: CrimeYearEntry[];
  isLight: boolean;
  tooltipStyle: object;
  tooltipLabelStyle: object;
}) {
  if (propertyData.length === 0) {
    return (
      <Section title="Property Value vs Safety" isLight={isLight}>
        <div className={cn('rounded-2xl p-4 border flex items-start gap-2.5', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}>
          <Info size={14} className={isLight ? 'text-slate-400 shrink-0 mt-0.5' : 'text-slate-600 shrink-0 mt-0.5'} />
          <p className={cn('text-sm', isLight ? 'text-slate-500' : 'text-slate-500')}>
            Property assessment data not available for this community in the current dataset snapshot.
          </p>
        </div>
      </Section>
    );
  }

  // Build combined chart data on shared years
  const propByYear  = new Map(propertyData.map(e => [e.year, e]));
  const crimeByYear = new Map(yearlyStats.map(e => [e.year, e]));
  const sharedYears = [...propByYear.keys()].filter(y => crimeByYear.has(y)).sort((a, b) => a - b).slice(-6);

  if (sharedYears.length < 2) return null;

  const combined = sharedYears.map(year => ({
    name:       String(year),
    TotalCrime: (crimeByYear.get(year)?.violent ?? 0) + (crimeByYear.get(year)?.property ?? 0) + (crimeByYear.get(year)?.disorder ?? 0),
    AvgValue:   propByYear.get(year)?.avgValue ?? 0,
  }));

  const latest   = propertyData[propertyData.length - 1];
  const earliest = propertyData[0];
  const valueChange = earliest.avgValue > 0
    ? Math.round(((latest.avgValue - earliest.avgValue) / earliest.avgValue) * 100)
    : null;

  const latestYear = sharedYears[sharedYears.length - 1];

  return (
    <Section
      title="Property Value vs Safety"
      subtitle="Assessed values · City of Calgary · Cross-referenced with crime data"
      isLight={isLight}
    >
      <div
        className={cn('h-[280px] md:h-[320px] w-full rounded-[1.6rem] p-4 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}
        role="img"
        aria-label="Property value versus total crime by year"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={combined}>
            <defs>
              <linearGradient id="aiCrime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isLight ? 'rgba(0,0,0,0.07)' : 'rgba(148,163,184,0.15)'} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} dy={8} />
            <YAxis yAxisId="crime" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isLight ? '#94a3b8' : '#64748b', fontWeight: 700 }} tickFormatter={fmtTick} orientation="left" />
            <YAxis yAxisId="value" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#818cf8', fontWeight: 700 }} tickFormatter={fmtDollars} orientation="right" />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              formatter={(val: number, name: string) =>
                name === 'AvgValue'
                  ? [fmtDollars(val), 'Avg. Assessed Value']
                  : [val.toLocaleString(), 'Total Incidents']
              }
              itemStyle={{ fontSize: 12, fontWeight: 'bold' }}
            />
            {/* Highlight most recent year */}
            {latestYear && (
              <defs>
                <rect id="recentBand" />
              </defs>
            )}
            <Area yAxisId="crime" type="monotone" dataKey="TotalCrime" stroke="#ef4444" strokeWidth={2} fill="url(#aiCrime)" fillOpacity={1} isAnimationActive animationBegin={200} animationDuration={800} />
            <Line  yAxisId="value" type="monotone" dataKey="AvgValue"   stroke="#818cf8" strokeWidth={3} dot={{ r: 4, fill: '#818cf8', strokeWidth: 2, stroke: isLight ? '#fff' : '#0f172a' }} isAnimationActive animationBegin={200} animationDuration={800} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Insight row */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className={cn('rounded-xl p-3 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}>
          <p className={cn('text-[10px] font-black uppercase tracking-wide mb-1', isLight ? 'text-slate-500' : 'text-slate-500')}>Avg. Assessed Value ({latest.year})</p>
          <p className="text-xl font-black text-indigo-400">{fmtDollars(latest.avgValue)}</p>
        </div>
        <div className={cn('rounded-xl p-3 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}>
          <p className={cn('text-[10px] font-black uppercase tracking-wide mb-1', isLight ? 'text-slate-500' : 'text-slate-500')}>Change vs {earliest.year}</p>
          {valueChange !== null ? (
            <p className={cn('text-xl font-black', valueChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {valueChange >= 0 ? '↑' : '↓'} {Math.abs(valueChange)}%
            </p>
          ) : (
            <p className={cn('text-xl font-black', isLight ? 'text-slate-400' : 'text-slate-600')}>–</p>
          )}
        </div>
      </div>

      {/* Methodology note */}
      <p className={cn('text-[12px] leading-relaxed mt-3 italic', isLight ? 'text-slate-500' : 'text-slate-500')}>
        Assessed values are the City of Calgary's annual tax appraisal — they typically lag the real estate market by approximately one year. Cross-referencing with crime trends can reveal whether safety changes precede or follow property value shifts.
      </p>
    </Section>
  );
}
```

- [ ] **Verify**
```bash
npm run lint
```
Expected: no errors.

- [ ] **Commit**
```bash
git add src/components/AreaIntelligencePanel.tsx
git commit -m "feat(area-intel): Section 5 — property value vs safety ComposedChart with dual Y-axes"
```

---

## Task 11: Sections 6 + 7 — Key Signals + Data Sources accordion

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx` — replace `KeySignalsSection` and `DataSourcesSection` stubs

- [ ] **Replace the `KeySignalsSection` stub**

Find:
```ts
function KeySignalsSection(_: any) { return null; }
```
Replace with:
```tsx
function KeySignalsSection({
  insights, isLight,
}: {
  insights: string[];
  isLight: boolean;
}) {
  const [ref, inView] = useInView();
  return (
    <Section title="Key Signals" isLight={isLight}>
      <div ref={ref} className="space-y-3">
        {insights.map((insight, idx) => {
          const isUp   = insight.includes('↑');
          const isDown = insight.includes('↓');
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.35, ease: 'easeOut', delay: idx * 0.08 }}
              whileHover={{ y: -2, boxShadow: isLight ? '0 4px 16px -2px rgba(0,0,0,0.12)' : '0 4px 20px -4px rgba(0,0,0,0.5)' }}
              className={cn(
                'flex items-start gap-3 rounded-2xl p-4 border transition-colors cursor-default',
                isLight ? 'bg-white border-slate-200 hover:bg-slate-50' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.05]'
              )}
              style={{
                borderLeft: `2px solid ${isUp ? '#ef4444' : isDown ? '#34d399' : '#3b82f6'}`,
              }}
            >
              <div className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border',
                isUp
                  ? (isLight ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/20')
                  : isDown
                  ? (isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20')
                  : (isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-500/20')
              )}>
                {isUp
                  ? <TrendingUp size={20} className="text-red-400" />
                  : isDown
                  ? <TrendingDown size={20} className="text-emerald-400" />
                  : <ShieldCheck size={20} className="text-blue-400" />}
              </div>
              <p className={cn('text-sm font-bold leading-relaxed', isLight ? 'text-slate-800' : 'text-white')}>{insight}</p>
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}
```

- [ ] **Replace the `DataSourcesSection` stub**

Find:
```ts
function DataSourcesSection(_: any) { return null; }
```
Replace with:
```tsx
const DATA_SOURCES = [
  {
    title: 'Calgary Crime Statistics',
    content: 'Dataset 78gh-n26t. UCR-classified criminal offences reported to Calgary Police Service, broken down by community, year, and crime category. Updates quarterly.',
  },
  {
    title: 'Calgary Disorder Statistics',
    content: 'Dataset h3h6-kgme. Non-criminal CPS dispatch events such as noise complaints, suspicious persons, and nuisance behaviour. Updates quarterly.',
  },
  {
    title: 'Calgary Property Assessments',
    content: 'Dataset 4ur7-wsgn. Annual tax assessment values per property, averaged by community. Reflects appraised value approximately one year behind current market prices.',
  },
];

function DataSourcesSection({ isLight }: { isLight: boolean }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <Section title="Data Sources" isLight={isLight}>
      <div className="space-y-2">
        {DATA_SOURCES.map(({ title, content }, idx) => (
          <div
            key={idx}
            className={cn('rounded-2xl border overflow-hidden', isLight ? 'border-slate-200' : 'border-white/10')}
          >
            <button
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors',
                isLight ? 'bg-white hover:bg-slate-50' : 'bg-white/[0.02] hover:bg-white/[0.04]'
              )}
            >
              <div className="flex items-center gap-2.5">
                <Database size={13} className={isLight ? 'text-slate-400' : 'text-slate-500'} />
                <span className={cn('text-sm font-bold', isLight ? 'text-slate-800' : 'text-white')}>{title}</span>
              </div>
              <motion.div animate={{ rotate: openIdx === idx ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={15} className={isLight ? 'text-slate-400' : 'text-slate-500'} />
              </motion.div>
            </button>
            <AnimatePresence initial={false}>
              {openIdx === idx && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <p className={cn('px-4 pb-4 pt-1 text-[13px] leading-relaxed', isLight ? 'text-slate-600' : 'text-slate-400')}>
                    {content}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <p className={cn('text-[12px] mt-4 pt-4 border-t leading-relaxed', isLight ? 'text-slate-400 border-slate-200' : 'text-slate-600 border-white/5')}>
        All figures reflect reported incidents only — not all crime is reported to police. Safety scores are normalized against the Calgary city-wide average.
      </p>
    </Section>
  );
}
```

- [ ] **Verify**
```bash
npm run lint
```
Expected: no errors.

- [ ] **Commit**
```bash
git add src/components/AreaIntelligencePanel.tsx
git commit -m "feat(area-intel): Sections 6+7 — redesigned key signals cards and data sources accordion"
```

---

## Task 12: Final verification + build

- [ ] **Run TypeScript check**
```bash
npm run lint
```
Expected: no errors or warnings.

- [ ] **Run production build**
```bash
npm run build
```
Expected: build completes with no errors.

- [ ] **Manual browser verification**

Start the dev server and open the map:
```bash
npm run dev
```
1. Click any community boundary on the map → panel opens
2. **Hero:** safety gauge animates on open; score counts up; glow color matches score level
3. **Sticky mini-bar:** scroll down inside the panel — mini-bar appears once hero is out of view
4. **Section 2:** bars animate in on scroll; city-average badges appear (or empty state if no data)
5. **Section 3:** toggle pills show/hide chart series; delta row shows % changes
6. **Section 4:** donut chart draws in; tapping a slice or legend row highlights it
7. **Section 5:** composed chart renders (or empty state if no assessment data); insight row shows avg value + change
8. **Section 6:** insight cards stagger in; hover lifts them
9. **Section 7:** accordion opens/closes with height animation
10. Both dark and light themes look correct (toggle theme and re-open panel)
11. Mobile (resize browser to < 1024px): drawer opens, all sections scroll, charts are correct height

- [ ] **Commit build verification**
```bash
git add -A
git commit -m "feat(area-intel): complete redesign — immersive scroll, property value cross-ref, animated sections, page views fix" 
```
