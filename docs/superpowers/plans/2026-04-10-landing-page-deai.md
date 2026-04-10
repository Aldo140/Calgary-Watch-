# Landing Page De-AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove AI-looking visual patterns and rewrite fabricated/generic copy in `LandingPage.tsx` so the page reads and looks like a hand-crafted civic product.

**Architecture:** All changes are in a single file — `src/pages/LandingPage.tsx`. No new files, no new dependencies. Changes are grouped by type: component deletion, gradient text removal, button fixes, stats replacement, and copy rewrites.

**Tech Stack:** React 19, Tailwind CSS, Framer Motion (motion/react)

---

## Files Modified

- `src/pages/LandingPage.tsx` — all changes live here

---

## Task 1: Delete the AuroraBackground component and its usage

**Files:**
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Delete the AuroraBackground component definition**

Find and remove lines 77–86 (the entire component):

```tsx
// DELETE THIS ENTIRE BLOCK:
const AuroraBackground = memo(function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="aurora-drift absolute -top-20 left-[-15%] w-[60%] h-40 rounded-full opacity-25"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(46,139,122,0.5) 0%, transparent 60%)' }} />
      <div className="aurora-drift-delay absolute -top-12 right-[-8%] w-[50%] h-36 rounded-full opacity-20"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(74,144,217,0.4) 0%, transparent 60%)' }} />
    </div>
  );
});
```

- [ ] **Step 2: Remove the `<AuroraBackground />` JSX call**

In the hero left column (around line 355), remove this line:

```tsx
// DELETE:
<AuroraBackground />
```

- [ ] **Step 3: Verify removal**

Run:
```bash
grep -n "AuroraBackground\|aurora-drift" src/pages/LandingPage.tsx
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "fix(landing): remove aurora background component"
```

---

## Task 2: Remove gradient text from all headlines

**Files:**
- Modify: `src/pages/LandingPage.tsx`

Apply all five changes below in one edit pass, then verify and commit.

- [ ] **Step 1: Hero h1 — remove gradient from "Calgary"**

Find (around line 378):
```tsx
<h1 className="text-4xl sm:text-5xl md:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight text-white mb-5">
  Know what's happening<br />in{' '}
  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A]">Calgary</span>
  {' '}right now.
</h1>
```

Replace with:
```tsx
<h1 className="text-4xl sm:text-5xl md:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight text-white mb-5">
  Know what's happening<br />in Calgary right now.
</h1>
```

- [ ] **Step 2: Vision h2 — remove italic gradient**

Find (around line 603):
```tsx
<motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] text-white mb-6 md:mb-8">
  Calgary's real-time<br/>
  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#D4A843] italic pr-2">urban intelligence layer.</span>
</motion.h2>
```

Replace with:
```tsx
<motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] text-white mb-6 md:mb-8">
  Calgary's public safety map.<br/>
  <span className="text-[#4A90D9]">Free, live, and community-built.</span>
</motion.h2>
```

- [ ] **Step 3: Features h2 — replace gradient on "actually live" with solid amber**

Find (around line 746):
```tsx
<h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.06]">
  Built for how Calgarians{' '}
  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#D4A843]">actually live.</span>
</h2>
```

Replace with:
```tsx
<h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.06]">
  Built for how Calgarians{' '}
  <span className="text-[#D4A843]">actually live.</span>
</h2>
```

- [ ] **Step 4: Problem h2 — replace gradient on "Information Lag" with solid red**

Find (around line 631):
```tsx
<h2 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight leading-[1.05] mb-5">
  The{' '}
  <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-red-600">
    Information Lag
  </span>
</h2>
```

Replace with:
```tsx
<h2 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight leading-[1.05] mb-5">
  The{' '}
  <span className="text-red-500">
    Information Lag
  </span>
</h2>
```

- [ ] **Step 5: Solution h3 — remove gradient, update text**

Find (around line 702):
```tsx
<h3 className="text-3xl md:text-4xl font-black mb-4 leading-[1.1]">
  Calgary Watch:<br />
  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A]">Real-time, together.</span>
</h3>
```

Replace with:
```tsx
<h3 className="text-3xl md:text-4xl font-black mb-4 leading-[1.1]">
  Calgary Watch:<br />
  <span className="text-white">One place. All of Calgary.</span>
</h3>
```

- [ ] **Step 6: Verify no gradient text remains on any heading**

Run:
```bash
grep -n "bg-gradient-to-r\|bg-clip-text" src/pages/LandingPage.tsx | grep -v "\/\/" | grep -v "radial-gradient\|linear-gradient"
```

The only remaining hits should be background gradients on non-text elements (glows, cards). There should be zero hits where the line also contains `<h1`, `<h2`, `<h3`, or `<span` inside a heading. Check any remaining hits manually.

- [ ] **Step 7: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "fix(landing): replace gradient headlines with solid colour text"
```

---

## Task 3: Fix rainbow gradient CTA buttons

**Files:**
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Fix the "How it Works" section CTA button (line ~1171)**

Find:
```tsx
<motion.button whileHover={!reducedMotion ? { scale: 1.04, boxShadow: '0 20px 50px rgba(74,144,217,0.35)' } : undefined} whileTap={!reducedMotion ? { scale: 0.96 } : undefined} onClick={() => navigate('/map')}
  className="rounded-xl px-10 py-4 bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#8B5CF6] text-white font-bold transition-all flex items-center gap-2 cursor-pointer mx-auto text-base shadow-lg">
  <MapPin size={18} />Start Reporting<ArrowRight size={16} />
</motion.button>
```

Replace with:
```tsx
<motion.button whileHover={!reducedMotion ? { scale: 1.04, boxShadow: '0 20px 50px rgba(74,144,217,0.35)' } : undefined} whileTap={!reducedMotion ? { scale: 0.96 } : undefined} onClick={() => navigate('/map')}
  className="rounded-xl px-10 py-4 bg-[#4A90D9] hover:bg-blue-500 text-white font-bold transition-colors flex items-center gap-2 cursor-pointer mx-auto text-base shadow-lg">
  <MapPin size={18} />Start Reporting<ArrowRight size={16} />
</motion.button>
```

- [ ] **Step 2: Fix the Solution section CTA button (line ~719)**

Find:
```tsx
<motion.button whileHover={!reducedMotion ? { scale: 1.04 } : undefined} whileTap={!reducedMotion ? { scale: 0.96 } : undefined} onClick={() => navigate('/map')}
  className="w-fit rounded-xl px-7 py-3.5 bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] text-white font-bold flex items-center gap-2 cursor-pointer text-sm">
  <MapPin size={16} />View Live Map<ArrowRight size={15} />
</motion.button>
```

Replace with:
```tsx
<motion.button whileHover={!reducedMotion ? { scale: 1.04 } : undefined} whileTap={!reducedMotion ? { scale: 0.96 } : undefined} onClick={() => navigate('/map')}
  className="w-fit rounded-xl px-7 py-3.5 bg-[#4A90D9] hover:bg-blue-500 text-white font-bold flex items-center gap-2 cursor-pointer text-sm transition-colors">
  <MapPin size={16} />View Live Map<ArrowRight size={15} />
</motion.button>
```

- [ ] **Step 3: Verify no rainbow buttons remain**

Run:
```bash
grep -n "from-\[#4A90D9\].*via-\[#2E8B7A\].*to-\[#8B5CF6\]\|from-\[#4A90D9\].*to-\[#2E8B7A\]" src/pages/LandingPage.tsx
```

Expected: no output from `<button` or `<motion.button` lines.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "fix(landing): replace rainbow gradient CTA buttons with solid blue"
```

---

## Task 4: Replace fabricated stats in the Problem section

**Files:**
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Replace the stats array (around line 646)**

Find the four-element array inside the stats grid:
```tsx
{ value: 40, suffix: ' min', label: 'Average news lag', sub: 'after an incident occurs', color: '#ef4444', bg: 'from-red-500/8' },
{ value: 9, suffix: ' apps', label: 'Apps Calgarians check', sub: 'to piece together one incident', color: '#a855f7', bg: 'from-purple-500/8' },
{ value: 74, suffix: '%', label: 'Missed a nearby event', sub: 'due to slow information reach', color: '#f59e0b', bg: 'from-amber-500/8' },
{ value: 30, suffix: 's', prefix: '< ', label: 'Calgary Watch lag', sub: 'community report to live map', color: '#4A90D9', bg: 'from-[#4A90D9]/12' },
```

Replace with:
```tsx
{ value: 40, suffix: ' min', label: 'Average news lag', sub: 'after an incident occurs', color: '#ef4444', bg: 'from-red-500/8' },
{ value: 4, suffix: '', label: 'Live data sources', sub: 'community, open data, 511, CPS crime', color: '#a855f7', bg: 'from-purple-500/8' },
{ value: 5, suffix: '', label: 'Incident types tracked', sub: 'crime, traffic, infrastructure, weather, emergency', color: '#f59e0b', bg: 'from-amber-500/8' },
{ value: 30, suffix: 's', prefix: '< ', label: 'Calgary Watch lag', sub: 'community report to live map', color: '#4A90D9', bg: 'from-[#4A90D9]/12' },
```

- [ ] **Step 2: Verify the fake numbers are gone**

Run:
```bash
grep -n "74\|9 apps\|Missed a nearby\|Apps Calgarians" src/pages/LandingPage.tsx
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "fix(landing): replace fabricated stats with verifiable data source counts"
```

---

## Task 5: Rewrite Problem section editorial rows

**Files:**
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Update the three editorial rows array (around line 663)**

Find the rows array (it renders three items with `num`, `tag`, `tagColor`, `title`, `body`, `icon`, `stat`, `statLabel`, `reverse`):

```tsx
{ num: '01', tag: '30+ min delayed', tagColor: '#ef4444', title: "By the time it's in the news...", body: 'Local media reports incidents 30 or more minutes after they happen. That gap costs real decisions: a detour you could have taken, a street you would have avoided, a family member you could have warned.', icon: Radio, stat: '30+', statLabel: 'min delayed', reverse: false },
{ num: '02', tag: 'Lost in noise', tagColor: '#a855f7', title: "r/Calgary won't cut it", body: 'Critical alerts drown three pages down in memes and off-topic threads. The signal is there, somewhere, buried under noise. You need what you need, when you need it.', icon: Users, stat: '100s', statLabel: 'posts to scan', reverse: true },
{ num: '03', tag: 'Fragmented sources', tagColor: '#f59e0b', title: '9 apps. Still no answer.', body: '311, Twitter, Nextdoor, local news: each has one piece. Checking them all takes more time than the incident itself. Calgary Watch pulls every signal into a single live map.', icon: ShieldAlert, stat: '9', statLabel: 'apps to check', reverse: false },
```

Replace with:
```tsx
{ num: '01', tag: '30+ min delayed', tagColor: '#ef4444', title: "By the time it's in the news...", body: 'Local media reports incidents 30 or more minutes after they happen. That gap costs real decisions: a detour you could have taken, a street you would have avoided, a family member you could have warned.', icon: Radio, stat: '30+', statLabel: 'min delayed', reverse: false },
{ num: '02', tag: 'Lost in noise', tagColor: '#a855f7', title: "r/Calgary won't cut it", body: 'Critical alerts drown three pages down in memes and off-topic threads. The signal is there, somewhere, buried under noise. You need what you need, when you need it.', icon: Users, stat: '⌁', statLabel: 'buried in noise', reverse: true },
{ num: '03', tag: 'Fragmented sources', tagColor: '#f59e0b', title: 'Scattered. No single answer.', body: '311, social media, local news: each has one piece. Checking them all takes longer than the incident itself. Calgary Watch pulls every signal into one live map.', icon: ShieldAlert, stat: '→1', statLabel: 'unified source', reverse: false },
```

- [ ] **Step 2: Verify the fabricated claims are gone**

Run:
```bash
grep -n "9 apps\|Still no answer\|100s" src/pages/LandingPage.tsx
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "fix(landing): rewrite problem section editorial rows, remove fabricated claims"
```

---

## Task 6: Rewrite scattered copy — Vision body, Solution body, How it Works CTA text

**Files:**
- Modify: `src/pages/LandingPage.tsx`

- [ ] **Step 1: Update Vision section body text (around line 607)**

Find:
```tsx
<motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }} className="text-lg md:text-xl lg:text-2xl text-slate-300 font-light max-w-4xl mx-auto leading-relaxed mb-6">
  Where community-reported incidents and verified public data combine to provide immediate awareness into city activity.
</motion.p>
```

Replace the body text only (keep all the motion props and className):
```tsx
<motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }} className="text-lg md:text-xl lg:text-2xl text-slate-300 font-light max-w-4xl mx-auto leading-relaxed mb-6">
  Community-reported incidents and verified public data, all on one map. See what's happening before the news does.
</motion.p>
```

- [ ] **Step 2: Update Solution section body text (around line 706)**

Find:
```tsx
<p className="text-sm md:text-base text-slate-300 leading-relaxed mb-6 max-w-md">
  A live, community-powered incident map built specifically for this city. Calgarians report real-time incidents and they appear on the map in seconds.
</p>
```

Replace with:
```tsx
<p className="text-sm md:text-base text-slate-300 leading-relaxed mb-6 max-w-md">
  A live incident map built specifically for Calgary. Report something in under 30 seconds and it appears on the map for everyone nearby.
</p>
```

- [ ] **Step 3: Update "How it Works" CTA lead-in text (around line 1169)**

Find:
```tsx
<p className="text-base text-slate-400 light:text-slate-600 mb-5">Ready to make Calgary smarter together?</p>
```

Replace with:
```tsx
<p className="text-base text-slate-400 light:text-slate-600 mb-5">See what's happening before the news does.</p>
```

- [ ] **Step 4: Fix "Optimistic UI" jargon in the Mobile Experience section (around line 1027)**

"Optimistic UI updates avoid lag" is internal developer jargon — users don't know what it means.

Find:
```tsx
{ icon: Zap,    title: 'Instant Submit',  desc: 'Optimistic UI updates avoid lag',  color: '#4A90D9' },
```

Replace with:
```tsx
{ icon: Zap,    title: 'Instant Submit',  desc: 'Your report appears before you close the form',  color: '#4A90D9' },
```

Also find the desktop version of the same card (around line 1027):
```tsx
{ icon: Zap,    title: 'Instant Submit',  desc: 'Optimistic UI updates avoid lag',  color: '#4A90D9' },
```
Apply the same replacement. (There may be two instances — one for mobile grid, one for desktop grid. Replace both.)

- [ ] **Step 5: Update the Live Map bento card footer label (around line 809)**

Find:
```tsx
<span className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Community powered</span>
```

Replace with:
```tsx
<span className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Community built</span>
```

- [ ] **Step 6: Verify removed phrases are gone**

Run:
```bash
grep -n "community-powered\|urban intelligence\|make Calgary smarter\|smarter together\|Optimistic UI" src/pages/LandingPage.tsx
```
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/pages/LandingPage.tsx
git commit -m "fix(landing): rewrite generic marketing copy with direct civic language"
```

---

## Task 7: Final verification pass

- [ ] **Step 1: Check for any remaining gradient text on headings**

Run:
```bash
grep -n "bg-clip-text bg-gradient" src/pages/LandingPage.tsx
```
Expected: zero results.

- [ ] **Step 2: Check for any remaining fabricated figures**

Run:
```bash
grep -n '"74\|9 apps\|2,400\|community-powered\|urban intelligence\|smarter together' src/pages/LandingPage.tsx
```

- `74`, `9 apps`, `community-powered`, `urban intelligence`, `smarter together` → should return zero results.
- `2,400` → if it appears, update line ~410 from `2,400+ Calgarians this week` to `Calgarians reporting daily` (remove the number if you can't verify it).

- [ ] **Step 3: Check for any remaining rainbow buttons**

Run:
```bash
grep -n "via-\[#2E8B7A\].*to-\[#8B5CF6\]\|via-\[#8B5CF6\]" src/pages/LandingPage.tsx
```
Expected: zero results.

- [ ] **Step 4: Run the dev server and do a visual pass**

```bash
npm run dev
```

Open `http://localhost:5173` and scroll the landing page end-to-end. Check:
- Hero headline: "Know what's happening in Calgary right now." — no gradient on any word
- Vision section: "Calgary's public safety map. Free, live, and community-built." — solid blue on second line, not italic, not gradient
- Stats grid: 40 min / 4 data sources / 5 incident types / <30s — no purple "9" or amber "74%"
- Problem rows: Row 03 title reads "Scattered. No single answer." not "9 apps"
- Features h2: "actually live." is amber, not a three-colour gradient
- "How it Works" CTA button: solid blue, no rainbow
- No aurora glow drifting behind the hero text
