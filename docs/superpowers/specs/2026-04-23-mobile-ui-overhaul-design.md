# Mobile UI Overhaul — Design Spec
**Date:** 2026-04-23  
**Scope:** Bug fixes (light mode, tags, page views, logo), Incident Detail redesign, Area Intel redesign, Admin light mode

---

## 1. Bug Fixes

### 1.1 Light-mode white text on dark buttons
**Affected:** FAB Plus button (`MapPage.tsx` ~line 1666), "Post on X" button (`IncidentDetailPanel.tsx` ~line 443), collapsed sheet "Report" button (`MobileMapSheet.tsx` ~line 309).

**Root cause:** Global CSS rule `.light .text-white { color: #1f2937 !important }` overrides `text-white` everywhere in light mode — including on intentionally dark buttons (bg-slate-900, bg-black) where white text is correct.

**Fix:** Replace `text-white` with `[color:white]` (Tailwind arbitrary property, not caught by the global override) on each of these buttons. Do not add a global exception; patch only the three affected call sites.

### 1.2 Tags cut off in Incident Detail hero
**Affected:** `IncidentDetailPanel.tsx` hero section — mobile sheet only (`h-40`).

**Root cause:** The `<div className="absolute bottom-8 left-8 right-8">` holds both the tag row AND the h2 title. When the title wraps to 2+ lines on mobile, the combined height exceeds `h-40 - bottom-8 = 128px`, pushing the tag row above the `overflow-hidden` boundary.

**Fix:** Resolved structurally by the Dispatch Card redesign (Section 2). Tags move to a designated slot at the top of the banner, entirely outside the overflow zone.

### 1.3 Logo dark box in light mode
**Affected:** `public/icon.svg`, used in `LandingPage.tsx` header.

**Root cause:** The SVG contains `<rect width="32" height="32" rx="8" fill="#0f172a"/>` — a hard-coded dark navy background. In dark mode it's invisible; in light mode it's a visible dark box.

**Fix:** Remove the `<rect>` element from `icon.svg`. The shield paths (`#38bdf8` / `#e0f2fe`) are visible on any background without it. No wrapper CSS change needed.

### 1.4 Page views stuck, not updating
**Affected:** `firestore.rules` — `match /page_views/{viewId}` create rule. `src/App.tsx` — `PageTracker` component.

**Root cause:** The security rule allows only `['timestamp', 'path']` fields, but `PageTracker` writes 7 fields: `timestamp`, `path`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `traffic_source`, `sessionId`. Every `addDoc` call fails with permission-denied; the error is swallowed by `.catch(() => {})`. The 200 documents visible in the admin are pre-rule-tightening writes that were never deleted.

**Fix:** Expand the allowlist in `firestore.rules` to match exactly what the tracker writes:
```
allow create: if request.resource.data.keys().hasOnly([
  'timestamp', 'path', 'referrer',
  'utm_source', 'utm_medium', 'utm_campaign',
  'traffic_source', 'sessionId'
]) &&
request.resource.data.timestamp is number &&
request.resource.data.path is string &&
request.resource.data.path.size() <= 200;
```
No change to `PageTracker` code needed — it was always writing the right data.

### 1.5 Admin page light-mode text
**Affected:** `AdminPage.tsx` — stat values, card headings, table cells, chart labels that use `text-white` or `text-slate-50` without a `light:` counterpart.

**Fix:** Audit all `text-white` / `text-slate-50` in `AdminPage.tsx`. Add `light:text-slate-900` (headings/values) or `light:text-slate-600` (secondary text). Card backgrounds using `bg-white/5` or `bg-white/[0.03]` should get `light:bg-white`. Border classes `border-white/10` should get `light:border-slate-200`. Recharts `<XAxis tick fill>` / `<YAxis tick fill>` should use conditional color based on theme prop.

---

## 2. Incident Detail — Dispatch Card Redesign

### 2.1 Design direction
**Design A — Dispatch Card.** Civic/police-dispatch aesthetic. Category-coloured gradient banner replaces the fixed-height hero image. Tags always visible. Works in both light and dark mode.

### 2.2 Layout structure (mobile sheet)

```
┌─────────────────────────────┐
│  ── drag handle ──           │
│                              │
│  [CRIME]  [Community ✓]      │  ← tag row (never clipped)
│  Suspicious vehicle near...  │  ← title
│  Brentwood · 14 min ago      │  ← location / time sub-line
│  ░░░░░░░░ category watermark │
├─────────────────────────────┤
│  ┌──────────┐ ┌──────────┐   │
│  │ 14m ago  │ │Brentwood │   │  ← 2-col stats grid
│  └──────────┘ └──────────┘   │
│                              │
│  Description                 │
│  …text…                      │
│                              │
│  Reporter                    │
│  [A]  Alex K.  ·  Community  │
│                              │
│  Community Source            │
│  [shield]  Calgary Watch     │
│  Verify with official...     │
│  ···························  │
│  Sharing                     │
│  [WhatsApp] [Facebook] [Mail]│
├─────────────────────────────┤
│  [🚨 Report Related] [𝕏][🔗] │  ← sticky action bar
└─────────────────────────────┘
```

### 2.3 Banner section
- **Container:** Remove fixed `h-40`/`h-64` hero. Use `min-h-[140px] p-6 relative` — no `overflow-hidden`, no fixed height cap. Tags and title flow naturally (not absolute-positioned), so the banner grows to fit any title length. Close button only is `absolute top-4 right-4` within this container.
- **Background:** `bg-gradient-to-br` using category colour pairs:
  - crime: `from-red-950 via-red-900 to-slate-950`
  - traffic: `from-orange-950 via-orange-900 to-slate-950`
  - infrastructure: `from-blue-950 via-blue-900 to-slate-950`
  - weather: `from-sky-950 via-sky-900 to-slate-950`
  - emergency: `from-red-900 via-rose-900 to-slate-950`
- **Light mode banner:** `from-red-50 via-red-100 to-stone-50` (etc. per category). Title `text-slate-900`, tags use coloured light-mode pills.
- **Watermark:** Category emoji (🚨 / 🚗 / 🏗 / 🌧 / 🆘) absolutely positioned bottom-right, `text-[80px] opacity-[0.08]`, `pointer-events-none`.
- **Tag row:** `flex flex-wrap gap-2 mb-3`. Pills use coloured bg/border matching category. **Never inside overflow-hidden.** 
- **Close button:** `absolute top-4 right-4` — stays in banner.
- **Background cityscape image:** removed from mobile sheet (was causing the clipping). Desktop side-panel keeps it.

### 2.4 Scrollable body
- Padding `p-6`, `space-y-8`, `overflow-y-auto flex-1`.
- Stats 2-col grid: `bg-white/[0.03] light:bg-white/72 rounded-3xl`.
- Description, Reporter, Community Source, Sharing sections — unchanged in structure, only light-mode classes patched.

### 2.5 Action bar
- `sticky bottom-0` inside the sheet, `border-t border-white/5 light:border-slate-200 bg-slate-950/95 light:bg-[rgb(255,250,243)]/95 backdrop-blur-md`.
- Three buttons: Report Related (full width red), Post on X (dark, `[color:white]`), Copy Link.

### 2.6 Desktop panel
- Keeps the existing hero image approach (`h-64`) since there's enough height.
- Tags move outside the `overflow-hidden` div — placed in a `pt-4 px-8` area below the hero.

---

## 3. Area Intel — Mission Briefing Redesign

### 3.1 Design direction
**Design A — Mission Briefing.** SVG circular safety gauge header + three tabbed panels (Crime / Trend / Intel). Compact, dark, ops-dashboard feel.

### 3.2 Layout structure (mobile drawer)

```
┌──────────────────────────┐
│  ── drag handle ──        │
│  Area Intelligence        │  ← breadcrumb label
│  Brentwood                │  ← neighbourhood name (large)
│  ┌──gauge──┐ ┌─┐ ┌─┐ ┌─┐│
│  │   74    │ │A│ │T│ │R│││  ← SVG gauge + 2×2 quick-stats
│  └─────────┘ └─┘ └─┘ └─┘│
│  [Crime] [Trend] [Intel]  │  ← tab bar
├──────────────────────────┤
│  ← tab content (scrolls) │
│                           │
│  (Crime tab default:)     │
│  Violent  ████░░░  24     │
│  Property ███████  87     │
│  Disorder ███░░░░  41     │
│                           │
│  ┌────────────────────┐   │
│  │ 📉 Property crime   │   │  ← insight cards
│  │ down 12% vs last yr │   │
│  └────────────────────┘   │
└──────────────────────────┘
```

### 3.3 Header
- Background: `bg-gradient-to-br from-[#0f1e3d] to-[#0a1628]` dark navy.
- **Breadcrumb:** `"Area Intelligence"` in 8px uppercase slate-500.
- **Neighbourhood name:** 18px font-black white.
- **SVG gauge:** Pure SVG, no extra library. `viewBox="0 0 60 60"`. Two `<circle>` elements: track (`stroke="rgba(255,255,255,0.07)"`) and fill arc (`stroke="#34d399"`, `stroke-dasharray` computed as `score/100 * circumference`). Score number centred via absolute positioning. Colour: green (≥70), amber (40–69), red (<40).
- **2×2 quick-stats grid:** Active Incidents / Trend / Data Year / Risk Level. Each cell `bg-white/4 border border-white/7 rounded-lg`.

### 3.4 Tab bar
- Three tabs: Crime · Trend · Intel.
- Active tab: `bg-blue-500/15 text-blue-400 border-t-2 border-blue-500`.
- Inactive: `text-slate-500`.
- State managed with `useState<'crime'|'trend'|'intel'>`.

### 3.5 Tab panels

**Crime tab (default):**
- Three horizontal bar rows: Violent / Property / Disorder.
- Each row: label · bar track · numeric value.
- Bar fill colour: red (violent), orange (property), amber (disorder).
- Width computed as `(value / maxValue) * 100%`.
- Below the bars: insight cards (existing `insights` array from `useNeighborhoodPulse`).

**Trend tab:**
- The existing Recharts `AreaChart` (crime trends over time), full-width.
- Remove the existing stacked bar chart (redundant on mobile — intel goes here instead).
- Chart height `160px` on mobile.

**Intel tab:**
- Key insight cards from `insights` array — icon + text rows.
- Data year badge.
- "Source: Calgary Open Data" footer line.

### 3.6 Light mode
- Header: keep dark navy (intentional — same approach as Design B's header).
- Tab content area: `bg-[rgb(255,250,243)]`, bar tracks `bg-slate-200`, bar fills keep colour.
- Text: `text-slate-900` for values, `text-slate-500` for labels.

### 3.7 No new libraries required
- SVG gauge: raw SVG in JSX.
- Tabs: local `useState` + Tailwind.
- Charts: existing Recharts (already installed).

---

## 4. Scope boundaries
- Desktop layout of Area Intel (right-side panel) — **no change**.
- Desktop layout of Incident Detail — hero image kept, tags moved outside overflow-hidden.
- About / Landing pages — only icon.svg fix applies.
- Admin page — light-mode text/colour pass only; no structural changes.

---

## 5. Files affected

| File | Change |
|---|---|
| `public/icon.svg` | Remove `<rect fill="#0f172a"/>` |
| `firestore.rules` | Expand `page_views` create allowlist |
| `src/pages/MapPage.tsx` | FAB Plus button: `text-white` → `[color:white]` |
| `src/components/IncidentDetailPanel.tsx` | Full Dispatch Card redesign; Post on X `[color:white]`; desktop tags moved out of overflow-hidden |
| `src/components/AreaIntelligencePanel.tsx` | Full Mission Briefing redesign (mobile drawer only) |
| `src/components/MobileMapSheet.tsx` | Collapsed Report button `[color:white]` |
| `src/pages/AdminPage.tsx` | Light-mode text/bg/border pass |
