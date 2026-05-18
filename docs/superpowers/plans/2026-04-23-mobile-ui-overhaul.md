# Mobile UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six production bugs (light-mode text, logo, page views, tags clipping, admin text) and redesign two mobile panels (Incident Detail → Dispatch Card; Area Intel → Mission Briefing).

**Architecture:** Purely frontend + one Firestore rule change. No new libraries required. All CSS is Tailwind with the existing `light:` variant. The two redesigns are scoped to mobile-only — desktop layouts are unchanged except for the tags-clipping fix.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (custom `light:` variant), Recharts (existing), Vaul (existing), Framer Motion (existing), Firebase Firestore rules.

---

## File Map

| File | What changes |
|---|---|
| `public/icon.svg` | Remove dark `<rect>` background |
| `firestore.rules` | Expand `page_views` create allowlist to all 7 tracker fields |
| `src/pages/MapPage.tsx` | FAB Plus icon: `text-white` → `[color:white]` |
| `src/components/IncidentDetailPanel.tsx` | Dispatch Card banner; Post on X `[color:white]`; desktop tags outside overflow-hidden |
| `src/components/MobileMapSheet.tsx` | Collapsed Report button: `text-white` → `[color:white]` |
| `src/pages/AdminPage.tsx` | Light-mode text pass on 6 elements |
| `src/components/AreaIntelligencePanel.tsx` | Mission Briefing mobile drawer; add `useState` import |

---

## Task 1: Remove dark rect from icon.svg

**Files:**
- Modify: `public/icon.svg`

- [ ] **Step 1: Edit the file**

Open `public/icon.svg`. The current content is:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Calgary Watch">
  <rect width="32" height="32" rx="8" fill="#0f172a"/>
  <path fill="#38bdf8" d="M16 5.5 24 9.2v7.3c0 4.6-3.2 8.5-8 9.5-4.8-1-8-4.9-8-9.5V9.2L16 5.5z"/>
  <path fill="#e0f2fe" d="M16 11.5c-1.9 0-3.5 1.6-3.5 3.5 0 2.2 3.5 5.5 3.5 5.5s3.5-3.3 3.5-5.5c0-1.9-1.6-3.5-3.5-3.5z"/>
</svg>
```

Replace it with (remove the `<rect>` line only):
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Calgary Watch">
  <path fill="#38bdf8" d="M16 5.5 24 9.2v7.3c0 4.6-3.2 8.5-8 9.5-4.8-1-8-4.9-8-9.5V9.2L16 5.5z"/>
  <path fill="#e0f2fe" d="M16 11.5c-1.9 0-3.5 1.6-3.5 3.5 0 2.2 3.5 5.5 3.5 5.5s3.5-3.3 3.5-5.5c0-1.9-1.6-3.5-3.5-3.5z"/>
</svg>
```

- [ ] **Step 2: Verify**

Run: `grep -c 'rect' public/icon.svg`
Expected output: `0`

- [ ] **Step 3: Commit**

```bash
git add public/icon.svg
git commit -m "fix(logo): remove dark navy rect from icon.svg — visible as box in light mode"
```

---

## Task 2: Fix Firestore page_views create rule

**Files:**
- Modify: `firestore.rules` (lines 228–234)

**Root cause recap:** The rule allows only `['timestamp','path']` but `PageTracker` in `App.tsx` writes 8 fields: `timestamp`, `path`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `traffic_source`, `sessionId`. Every write is rejected silently.

- [ ] **Step 1: Edit firestore.rules**

Find this block (lines 228–234):
```
// Anonymous page view analytics – write-only from any visitor, no PII stored.
match /page_views/{viewId} {
  allow create: if request.resource.data.keys().hasOnly(['timestamp', 'path']) &&
                request.resource.data.timestamp is number &&
                request.resource.data.path is string &&
                request.resource.data.path.size() <= 200;
  allow read, update, delete: if isAdmin();
}
```

Replace with:
```
// Anonymous page view analytics – write-only from any visitor, no PII stored.
match /page_views/{viewId} {
  allow create: if request.resource.data.keys().hasOnly([
                  'timestamp', 'path', 'referrer',
                  'utm_source', 'utm_medium', 'utm_campaign',
                  'traffic_source', 'sessionId'
                ]) &&
                request.resource.data.timestamp is number &&
                request.resource.data.path is string &&
                request.resource.data.path.size() <= 200;
  allow read, update, delete: if isAdmin();
}
```

- [ ] **Step 2: Verify rule syntax**

Run: `grep -A 10 'page_views' firestore.rules`

Expected: the 8-field `hasOnly` list is present, no syntax errors visible.

- [ ] **Step 3: Deploy rules**

```bash
npx firebase deploy --only firestore:rules
```

Expected: `Deploy complete!`

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "fix(analytics): expand page_views Firestore rule to allow all 8 tracker fields"
```

---

## Task 3: Fix white text on intentionally dark buttons

**Root cause:** Global CSS `.light .text-white { color: #1f2937 !important }` overrides `text-white` on dark buttons in light mode. Fix: use Tailwind arbitrary property `[color:white]` which generates a different class name not caught by the override.

**Files:**
- Modify: `src/pages/MapPage.tsx` (line 1666)
- Modify: `src/components/IncidentDetailPanel.tsx` (line 443)
- Modify: `src/components/MobileMapSheet.tsx` (line 306)

- [ ] **Step 1: Fix MapPage.tsx FAB Plus icon**

At line 1666, find:
```tsx
<Plus size={28} className="transition-transform group-hover:rotate-90 duration-150 text-white" />
```

Replace with:
```tsx
<Plus size={28} className="transition-transform group-hover:rotate-90 duration-150 [color:white]" />
```

- [ ] **Step 2: Fix IncidentDetailPanel.tsx Post on X button**

At line 443, find:
```tsx
className="flex-1 flex items-center justify-center gap-2 bg-black light:bg-slate-900 hover:bg-neutral-900 light:hover:bg-slate-800 border border-white/10 light:border-slate-700 rounded-2xl h-12 text-white text-xs font-black tracking-wide transition-all active:scale-95"
```

Replace `text-white` with `[color:white]`:
```tsx
className="flex-1 flex items-center justify-center gap-2 bg-black light:bg-slate-900 hover:bg-neutral-900 light:hover:bg-slate-800 border border-white/10 light:border-slate-700 rounded-2xl h-12 [color:white] text-xs font-black tracking-wide transition-all active:scale-95"
```

- [ ] **Step 3: Fix MobileMapSheet.tsx collapsed Report button**

At lines 302–307, find:
```tsx
className={cn(
  'flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors',
  dark
    ? 'bg-blue-600/20 border-blue-500/40 text-blue-400 hover:bg-blue-600/30'
    : 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800',
)}
```

Replace `text-white` with `[color:white]`:
```tsx
className={cn(
  'flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors',
  dark
    ? 'bg-blue-600/20 border-blue-500/40 text-blue-400 hover:bg-blue-600/30'
    : 'bg-slate-900 border-slate-900 [color:white] hover:bg-slate-800',
)}
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -E 'error TS' | head -20`
Expected: no errors in these files.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MapPage.tsx src/components/IncidentDetailPanel.tsx src/components/MobileMapSheet.tsx
git commit -m "fix(light-mode): use [color:white] on dark buttons to bypass global text-white override"
```

---

## Task 4: Admin page light-mode text pass

**Files:**
- Modify: `src/pages/AdminPage.tsx`

Six `text-white` instances without a `light:` counterpart, confirmed by grep. All are inside the mobile context card (lines 892, 895, 916, 923) or incident/city review cards (lines 1298, 1646).

- [ ] **Step 1: Fix mobile context card — h1 title (line 892)**

Find:
```tsx
<h1 className="mt-2 max-w-[14rem] text-[1.65rem] font-black leading-none text-white">{activeSectionTheme.title}</h1>
```

Replace:
```tsx
<h1 className="mt-2 max-w-[14rem] text-[1.65rem] font-black leading-none text-white light:text-slate-900">{activeSectionTheme.title}</h1>
```

- [ ] **Step 2: Fix mobile context card — active section icon (line 895)**

Find:
```tsx
<ActiveIcon size={20} className="text-white" />
```

Replace:
```tsx
<ActiveIcon size={20} className="text-white light:text-slate-700" />
```

- [ ] **Step 3: Fix mobile context card — "Review incidents" button text (line 916)**

Find:
```tsx
<p className="mt-1 text-sm font-bold text-white">Review incidents</p>
```

Replace:
```tsx
<p className="mt-1 text-sm font-bold text-white light:text-slate-800">Review incidents</p>
```

- [ ] **Step 4: Fix mobile context card — "Open public map" button text (line 923)**

Find:
```tsx
<p className="mt-1 text-sm font-bold text-white">Open public map</p>
```

Replace:
```tsx
<p className="mt-1 text-sm font-bold text-white light:text-slate-800">Open public map</p>
```

- [ ] **Step 5: Fix incident review card — neighborhood text (line 1298)**

Find:
```tsx
<p className="mt-1 text-sm font-black text-white">{incident.neighborhood || 'Unknown area'}</p>
```

Replace:
```tsx
<p className="mt-1 text-sm font-black text-white light:text-slate-900">{incident.neighborhood || 'Unknown area'}</p>
```

- [ ] **Step 6: Fix city review card — community text (line 1646)**

Find:
```tsx
<p className="mt-1 text-sm font-black text-white">{draft.community || 'Community'}</p>
```

Replace:
```tsx
<p className="mt-1 text-sm font-black text-white light:text-slate-900">{draft.community || 'Community'}</p>
```

- [ ] **Step 7: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -E 'error TS' | head -20`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/AdminPage.tsx
git commit -m "fix(admin): add light: text counterparts to 6 text-white elements"
```

---

## Task 5: Incident Detail — Dispatch Card redesign

**Files:**
- Modify: `src/components/IncidentDetailPanel.tsx`

**What changes (mobile only):**
- Remove `h-40 overflow-hidden` hero. Replace with natural-height gradient banner.
- Tags + title flow naturally (not absolute-positioned) — no more clipping.
- Category-colour gradient per incident type (dark + light variants via `light:` classes).
- Category emoji watermark bottom-right at `text-[80px] opacity-[0.08]`.
- Close button `absolute top-4 right-4` stays in banner.

**What stays (desktop):**
- `h-64 overflow-hidden` hero image is kept.
- Tags are moved below the `overflow-hidden` div into a `px-8 pt-4` row.

- [ ] **Step 1: Add BANNER_GRAD constant after CATEGORY_EMOJI**

At line 19 (after the closing `};` of `CATEGORY_EMOJI`), insert:
```tsx
const BANNER_GRAD: Record<string, string> = {
  crime:          'from-red-950 via-red-900 to-slate-950 light:from-red-50 light:via-red-100 light:to-stone-50',
  traffic:        'from-orange-950 via-orange-900 to-slate-950 light:from-orange-50 light:via-orange-100 light:to-stone-50',
  infrastructure: 'from-blue-950 via-blue-900 to-slate-950 light:from-blue-50 light:via-blue-100 light:to-stone-50',
  weather:        'from-sky-950 via-sky-900 to-slate-950 light:from-sky-50 light:via-sky-100 light:to-stone-50',
  emergency:      'from-red-900 via-rose-900 to-slate-950 light:from-rose-50 light:via-red-100 light:to-stone-50',
};
```

- [ ] **Step 2: Replace the entire hero section (lines 233–293)**

Find the current hero block — from the comment `{/* Header / Hero Section */}` through the closing `</div>` of that section (inclusive). The block starts at:
```tsx
            {/* Header / Hero Section */}
            <div
              className={cn(
                'relative w-full shrink-0 overflow-hidden',
                isMobileSheet ? 'h-40' : 'h-64'
              )}
            >
```
…and ends before `<div className="flex-1 overflow-y-auto p-8 space-y-10 no-scrollbar">`.

Replace the entire hero block with:
```tsx
            {/* Header / Banner — mobile dispatch card vs desktop hero */}
            {isMobileSheet ? (
              /* Mobile: gradient dispatch card, natural height, no overflow-hidden */
              <div className={cn('relative min-h-[140px] p-6 bg-gradient-to-br', BANNER_GRAD[incident.category] ?? BANNER_GRAD.crime)}>
                {/* Category watermark */}
                <div className="absolute bottom-2 right-4 text-[80px] opacity-[0.08] pointer-events-none select-none" aria-hidden="true">
                  {CATEGORY_EMOJI[incident.category] ?? '📍'}
                </div>
                {/* Close button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-3 text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 transition-all bg-white/10 light:bg-white/90 hover:bg-white/20 light:hover:bg-slate-100 backdrop-blur-xl rounded-2xl border border-white/20 light:border-slate-200 z-20 group"
                >
                  <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>
                {/* Tags — always visible, never clipped */}
                <div className="flex flex-wrap gap-2 mb-3 pr-14">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={cn(
                      'px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border',
                      incident.category === 'crime'          ? 'bg-red-500/20 text-red-400 border-red-500/30 light:bg-red-100 light:text-red-700 light:border-red-200' :
                      incident.category === 'traffic'        ? 'bg-orange-500/20 text-orange-400 border-orange-500/30 light:bg-orange-100 light:text-orange-700 light:border-orange-200' :
                      incident.category === 'infrastructure' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 light:bg-blue-100 light:text-blue-700 light:border-blue-200' :
                      incident.category === 'emergency'      ? 'bg-rose-500/20 text-rose-400 border-rose-500/30 light:bg-rose-100 light:text-rose-700 light:border-rose-200' :
                                                               'bg-purple-500/20 text-purple-400 border-purple-500/30 light:bg-purple-100 light:text-purple-700 light:border-purple-200'
                    )}
                  >
                    <Icon size={14} />
                    {incident.category}
                  </motion.div>
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className={cn(
                      'px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border',
                      incident.verified_status === 'community_confirmed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 light:bg-emerald-100 light:text-emerald-700 light:border-emerald-200' :
                      incident.verified_status === 'multiple_reports'    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 light:bg-amber-100 light:text-amber-700 light:border-amber-200' :
                                                                           'bg-slate-500/20 text-slate-400 border-slate-500/30 light:bg-slate-100 light:text-slate-600 light:border-slate-300'
                    )}
                  >
                    {StatusIcon && <StatusIcon size={14} />}
                    {incident.verified_status?.replace('_', ' ')}
                  </motion.div>
                </div>
                {/* Title */}
                <h2 className="text-2xl font-black text-white light:text-slate-900 tracking-tight leading-[1.1]">
                  {incident.title}
                </h2>
                {/* Location + time sub-line */}
                <p className="text-[11px] text-white/60 light:text-slate-600 mt-1.5 font-bold">
                  {incident.neighborhood || 'Calgary'} · {timeAgo} ago
                </p>
              </div>
            ) : (
              /* Desktop: original hero with image; tags moved below overflow-hidden */
              <>
                <div className="relative w-full shrink-0 overflow-hidden h-64">
                  <img
                    src={publicAsset('images/calgary7.webp')}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover grayscale opacity-25 light:opacity-15"
                    loading="eager"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent light:from-[rgb(255,250,243)] light:via-[rgba(255,250,243,0.74)]" />
                  <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-3 text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 transition-all bg-white/5 light:bg-white/90 hover:bg-white/10 light:hover:bg-slate-100 backdrop-blur-xl rounded-2xl border border-white/10 light:border-slate-200 z-20 group"
                  >
                    <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                  </button>
                  <div className="absolute bottom-8 left-8 right-8 z-10">
                    <h2 className="text-3xl font-black text-white tracking-tight leading-[1.1] drop-shadow-lg">
                      {incident.title}
                    </h2>
                  </div>
                </div>
                {/* Tags outside overflow-hidden — never clip */}
                <div className="px-8 pt-4 flex flex-wrap items-center gap-3">
                  <div
                    className={cn(
                      'px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border',
                      incident.category === 'crime'          ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                      incident.category === 'traffic'        ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                      incident.category === 'infrastructure' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                                               'bg-purple-500/20 text-purple-400 border-purple-500/30'
                    )}
                  >
                    <Icon size={14} />
                    {incident.category}
                  </div>
                  <div
                    className={cn(
                      'px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border',
                      incident.verified_status === 'community_confirmed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      incident.verified_status === 'multiple_reports'    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                                                           'bg-slate-500/20 text-slate-400 border-slate-500/30'
                    )}
                  >
                    {StatusIcon && <StatusIcon size={14} />}
                    {incident.verified_status?.replace('_', ' ')}
                  </div>
                </div>
              </>
            )}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -E 'error TS' | head -20`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/IncidentDetailPanel.tsx
git commit -m "feat(incident-detail): Dispatch Card redesign — gradient banner, tags never clip, desktop tags outside overflow-hidden"
```

---

## Task 6: Area Intel — Mission Briefing redesign (mobile only)

**Files:**
- Modify: `src/components/AreaIntelligencePanel.tsx`

**What changes:**
- Mobile drawer: replace the `<Content />` call with inline Mission Briefing layout.
- New layout: dark navy header with SVG safety gauge + 2×2 quick-stats, tab bar (Crime / Trend / Intel), scrollable tab content.
- `useState` added to parent component for `mobileTab`.
- Desktop panel: `<Content />` call unchanged.

- [ ] **Step 1: Add useState import**

Find line 1:
```tsx
import { AreaIntelligence } from '@/src/types';
```

Replace with:
```tsx
import { useState } from 'react';
import { AreaIntelligence } from '@/src/types';
```

- [ ] **Step 2: Add mobileTab state to AreaIntelligencePanel**

In `AreaIntelligencePanel`, add state after the existing variable declarations. Find the line:
```tsx
  const crimeEntry = crimeStats?.get(communityKey);
```

Insert after it:
```tsx

  const [mobileTab, setMobileTab] = useState<'crime' | 'trend' | 'intel'>('crime');
```

- [ ] **Step 3: Replace mobile drawer content**

In the mobile drawer section (lines 404–424), find:
```tsx
      {/* Mobile Drawer */}
      <div className="lg:hidden">
        <Drawer.Root open={!!data} onClose={onClose}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 h-[92vh] z-[101] outline-none">
              <div className={cn(
                'h-full rounded-t-[3rem] overflow-hidden border-t flex flex-col',
                isLight ? 'bg-[rgb(255,250,243)] border-stone-200/80' : 'bg-slate-950 border-white/10'
              )}>
                <div className={cn('mx-auto w-12 h-1.5 flex-shrink-0 rounded-full mt-4 mb-2', isLight ? 'bg-slate-300' : 'bg-white/10')} />
                <Drawer.Title className="sr-only">{data.communityName} Neighborhood Intelligence</Drawer.Title>
                <Drawer.Description className="sr-only">Safety scores, crime trends, and historical data for {data.communityName}.</Drawer.Description>
                <div className="flex-1 overflow-hidden">
                  <Content />
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
```

Replace with:
```tsx
      {/* Mobile Drawer — Mission Briefing layout */}
      <div className="lg:hidden">
        <Drawer.Root open={!!data} onClose={onClose}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 h-[92vh] z-[101] outline-none">
              <div className={cn(
                'h-full rounded-t-[3rem] overflow-hidden border-t flex flex-col',
                isLight ? 'bg-[rgb(255,250,243)] border-stone-200/80' : 'bg-slate-950 border-white/10'
              )}>
                {/* Drag handle */}
                <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full mt-4 mb-2 bg-white/10" />
                <Drawer.Title className="sr-only">{data.communityName} Area Intelligence</Drawer.Title>
                <Drawer.Description className="sr-only">Safety scores, crime trends, and historical data for {data.communityName}.</Drawer.Description>

                {/* ── Mission Briefing header (always dark navy) ── */}
                {(() => {
                  const score = data.safetyScore ?? 0;
                  const r = 22;
                  const circ = 2 * Math.PI * r;
                  const dash = (score / 100) * circ;
                  const gaugeColor = score >= 70 ? '#34d399' : score >= 40 ? '#f59e0b' : '#ef4444';
                  const maxVal = Math.max(crimeEntry?.violent ?? 0, crimeEntry?.property ?? 0, crimeEntry?.disorder ?? 0, 1);
                  return (
                    <div className="bg-gradient-to-br from-[#0f1e3d] to-[#0a1628] px-5 pt-3 pb-5 shrink-0">
                      <p className="text-[8px] font-black uppercase tracking-[0.35em] text-slate-500 mb-1">Area Intelligence</p>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h2 className="text-[18px] font-black text-white leading-none mb-3 truncate">{data.communityName}</h2>
                          <div className="flex items-center gap-3">
                            {/* SVG Safety Gauge */}
                            <div className="relative shrink-0 w-[60px] h-[60px]">
                              <svg width="60" height="60" viewBox="0 0 60 60">
                                <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
                                <circle
                                  cx="30" cy="30" r={r} fill="none"
                                  stroke={gaugeColor}
                                  strokeWidth="6"
                                  strokeLinecap="round"
                                  strokeDasharray={`${dash} ${circ}`}
                                  transform="rotate(-90 30 30)"
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[13px] font-black text-white">{score}</span>
                              </div>
                            </div>
                            {/* 2×2 quick-stats */}
                            <div className="grid grid-cols-2 gap-1.5 flex-1">
                              <div className="bg-white/[0.04] border border-white/[0.07] rounded-lg p-2">
                                <p className="text-[7px] font-black uppercase tracking-wide text-slate-500 leading-none mb-0.5">Incidents</p>
                                <p className="text-sm font-black text-orange-400 leading-none">{data.activeIncidents ?? 0}</p>
                              </div>
                              <div className="bg-white/[0.04] border border-white/[0.07] rounded-lg p-2">
                                <p className="text-[7px] font-black uppercase tracking-wide text-slate-500 leading-none mb-0.5">Trend</p>
                                <p className={cn('text-[11px] font-black uppercase truncate leading-none',
                                  data.trend === 'improving' ? 'text-emerald-400' :
                                  data.trend === 'declining' ? 'text-red-400' : 'text-slate-300'
                                )}>{data.trend ?? '–'}</p>
                              </div>
                              <div className="bg-white/[0.04] border border-white/[0.07] rounded-lg p-2">
                                <p className="text-[7px] font-black uppercase tracking-wide text-slate-500 leading-none mb-0.5">Data Year</p>
                                <p className="text-sm font-black text-white leading-none">{crimeEntry?.year ?? '–'}</p>
                              </div>
                              <div className="bg-white/[0.04] border border-white/[0.07] rounded-lg p-2">
                                <p className="text-[7px] font-black uppercase tracking-wide text-slate-500 leading-none mb-0.5">Risk</p>
                                <p className={cn('text-[11px] font-black leading-none',
                                  score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400'
                                )}>{score >= 70 ? 'Low' : score >= 40 ? 'Medium' : 'High'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Close button */}
                        <button
                          onClick={onClose}
                          className="p-2.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all shrink-0 mt-1"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      {/* Hidden for TS; maxVal used in tab content below */}
                      <span className="hidden">{maxVal}</span>
                    </div>
                  );
                })()}

                {/* Tab bar */}
                <div className={cn(
                  'flex border-b shrink-0',
                  isLight ? 'border-stone-200/80 bg-[rgb(255,250,243)]' : 'border-white/5 bg-slate-950'
                )}>
                  {(['crime', 'trend', 'intel'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setMobileTab(tab)}
                      className={cn(
                        'flex-1 py-3 text-[11px] font-black uppercase tracking-[0.2em] transition-all border-t-2',
                        mobileTab === tab
                          ? 'bg-blue-500/15 text-blue-400 border-blue-500'
                          : isLight
                            ? 'text-slate-500 border-transparent hover:text-slate-700'
                            : 'text-slate-500 border-transparent hover:text-slate-400'
                      )}
                    >
                      {tab === 'crime' ? 'Crime' : tab === 'trend' ? 'Trend' : 'Intel'}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className={cn(
                  'flex-1 overflow-y-auto p-5 no-scrollbar',
                  isLight ? 'bg-[rgb(255,250,243)]' : 'bg-slate-950'
                )}>
                  {mobileTab === 'crime' && (() => {
                    const maxVal = Math.max(crimeEntry?.violent ?? 0, crimeEntry?.property ?? 0, crimeEntry?.disorder ?? 0, 1);
                    const hasBars = crimeEntry && (crimeEntry.violent + crimeEntry.property + crimeEntry.disorder) > 0;
                    return (
                      <div className="space-y-4">
                        {hasBars ? (
                          <>
                            {[
                              { label: 'Violent',  value: crimeEntry!.violent,  color: 'bg-red-500' },
                              { label: 'Property', value: crimeEntry!.property, color: 'bg-orange-500' },
                              { label: 'Disorder', value: crimeEntry!.disorder, color: 'bg-amber-500' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className={cn('text-[11px] font-black uppercase tracking-widest', isLight ? 'text-slate-600' : 'text-slate-400')}>{label}</span>
                                  <span className={cn('text-[11px] font-black', isLight ? 'text-slate-900' : 'text-white')}>{value.toLocaleString()}</span>
                                </div>
                                <div className={cn('h-2 rounded-full overflow-hidden', isLight ? 'bg-slate-200' : 'bg-white/10')}>
                                  <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.round((value / maxVal) * 100)}%` }} />
                                </div>
                              </div>
                            ))}
                          </>
                        ) : (
                          <p className={cn('text-xs text-center py-8', isLight ? 'text-slate-500' : 'text-slate-600')}>
                            Detailed breakdown not available for this community.
                          </p>
                        )}
                        <div className="pt-2 space-y-2">
                          {data.insights.slice(0, 3).map((insight, idx) => (
                            <div key={idx} className={cn('rounded-2xl p-4 border flex items-center gap-3',
                              isLight ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/10'
                            )}>
                              <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border',
                                isLight ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/10'
                              )}>
                                {insight.includes('↑') ? <TrendingUp className="text-red-400" size={14} /> :
                                 insight.includes('↓') ? <TrendingDown className="text-emerald-400" size={14} /> :
                                 <ShieldCheck className="text-blue-400" size={14} />}
                              </div>
                              <p className={cn('text-xs font-bold leading-snug', isLight ? 'text-slate-800' : 'text-white')}>{insight}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {mobileTab === 'trend' && (
                    <div>
                      <div
                        className={cn('h-[160px] w-full rounded-[1.4rem] p-4 border mb-3', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}
                        role="img"
                        aria-label={`Crime trend chart for ${data.communityName}`}
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="mbV" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="mbP" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="mbD" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isLight ? 'rgba(0,0,0,0.08)' : 'rgba(148,163,184,0.2)'} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} dy={4} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} tickFormatter={fmtTick} width={32} />
                            <Tooltip contentStyle={tooltipStyle} itemStyle={{ fontSize: 10, fontWeight: 'bold' }} labelStyle={tooltipLabelStyle} />
                            <Area type="monotone" dataKey="Violent"  stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#mbV)" />
                            <Area type="monotone" dataKey="Property" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#mbP)" />
                            <Area type="monotone" dataKey="Disorder" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#mbD)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <p className={cn('text-[9px] text-center', isLight ? 'text-slate-500' : 'text-slate-600')}>
                        {hasRealData ? 'Annual crime data · Calgary Open Data' : 'Estimated monthly trend'}
                      </p>
                    </div>
                  )}

                  {mobileTab === 'intel' && (
                    <div className="space-y-3">
                      {data.insights.map((insight, idx) => (
                        <div key={idx} className={cn('rounded-2xl p-4 border flex items-center gap-3',
                          isLight ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/10'
                        )}>
                          <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border',
                            isLight ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/10'
                          )}>
                            {insight.includes('↑') ? <TrendingUp className="text-red-400" size={14} /> :
                             insight.includes('↓') ? <TrendingDown className="text-emerald-400" size={14} /> :
                             <ShieldCheck className="text-blue-400" size={14} />}
                          </div>
                          <p className={cn('text-xs font-bold leading-snug', isLight ? 'text-slate-800' : 'text-white')}>{insight}</p>
                        </div>
                      ))}
                      {crimeEntry && (
                        <div className={cn('rounded-2xl p-4 border mt-2', isLight ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/10')}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Database size={11} className="text-slate-400" />
                            <p className={cn('text-[9px] font-black uppercase tracking-[0.15em]', isLight ? 'text-slate-600' : 'text-slate-500')}>Data Year: {crimeEntry.year}</p>
                          </div>
                          <p className={cn('text-[9px] leading-relaxed', isLight ? 'text-slate-600' : 'text-slate-500')}>
                            Source: City of Calgary Open Data (datasets 78gh-n26t, h3h6-kgme). Updates quarterly.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -E 'error TS' | head -20`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/AreaIntelligencePanel.tsx
git commit -m "feat(area-intel): Mission Briefing mobile redesign — SVG gauge, Crime/Trend/Intel tabs"
```

---

## Task 7: Build verification and push

- [ ] **Step 1: Full build**

Run: `npm run build 2>&1 | tail -20`
Expected: `✓ built in` with no errors. Fix any TypeScript or build errors before continuing.

- [ ] **Step 2: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage check:**
- §1.1 Light-mode dark buttons → Task 3 ✓
- §1.2 Tags cut off → Task 5 (Dispatch Card) ✓
- §1.3 Logo dark box → Task 1 ✓
- §1.4 Page views stuck → Task 2 ✓
- §1.5 Admin light mode → Task 4 ✓
- §2 Dispatch Card redesign → Task 5 ✓
- §3 Mission Briefing redesign → Task 6 ✓
- §4 Scope boundaries (desktop Area Intel unchanged, desktop Incident Detail hero kept) → preserved in Task 5/6 ✓

**Placeholder scan:** No TBDs. All code blocks are complete.

**Type consistency:** `BANNER_GRAD` defined in Task 5 Step 1 before it's referenced in Step 2. `mobileTab` state defined in Task 6 Step 2 before it's used in Step 3. `useState` import added in Task 6 Step 1.
