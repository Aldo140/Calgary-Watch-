# Landing Page De-AI Design Spec

**Date:** 2026-04-10  
**Approach:** B — Copy + remove AI visual patterns  
**Scope:** Targeted fixes to the worst offenders in `src/pages/LandingPage.tsx`

---

## Problem

The landing page has been flagged as looking "AI-generated." Three root causes:

1. **Copy** — generic SaaS marketing language ("community-powered", "urban intelligence layer", "make Calgary smarter together") repeated throughout.
2. **Visual style** — gradient text on 7+ headlines; aurora glow backgrounds; rainbow multi-stop CTA buttons.
3. **Stats** — two fabricated numbers ("74% missed a nearby event", "9 apps Calgarians check") that undermine trust on a civic platform.

---

## What Changes

### 1. Copy

**Hero headline**
- Remove the gradient from `"Calgary"` in the h1. Make it solid white at the same weight.
- "right now" also loses any gradient treatment.

**Vision section headline**
- Current: *"Calgary's real-time urban intelligence layer."* (italic gradient)
- New: `"Calgary's public safety map. Free, live, and built by the community."` — plain text, no italic, no gradient. The emphasis word (e.g. "public safety map") gets solid `#4A90D9` if colour is needed, not gradient.

**Stats grid (Problem section)**
- Remove: `74% — Missed a nearby event due to slow information reach`
- Remove: `9 apps — Apps Calgarians check to piece together one incident`
- Replace with:
  - `4 — Data sources` / sub: `community, open data, 511 traffic, CPS crime`
  - `5 — Incident types` / sub: `crime, traffic, infrastructure, weather, emergency`
- Keep: `40 min — Average news lag` and `< 30s — Calgary Watch lag`

**Problem editorial rows**
- Row 02 ("r/Calgary won't cut it"): remove the stat `100s posts to scan` (fabricated). Replace with `buried in noise` as the stat label, no number.
- Row 03 ("9 apps. Still no answer."): change title to `"Scattered. No single answer."` to remove the fabricated `9` claim. Rewrite body to remove the "9 apps" reference.

**Solution section h3**
- Current: `"Calgary Watch: Real-time, together."` with gradient on "Real-time, together."
- New: `"Calgary Watch: One place. All of Calgary."` — solid white, no gradient.

**Scattered phrases to cut/replace**
- Every instance of "community-powered" → "community-built" (once) or omit
- "urban intelligence" → remove entirely
- "make Calgary smarter together" → "See what's happening before the news does"
- "optimistic UI" in user-facing copy → remove (internal jargon)

**Social proof**
- "2,400+ Calgarians this week" — keep if it's directionally true, otherwise change to "Calgarians reporting daily" with no number.

### 2. Visual Patterns

**Aurora backgrounds — remove**
- Remove the `<AuroraBackground />` JSX call from the hero section.
- Delete the `AuroraBackground` component definition entirely.
- The subtle ambient radial glow divs in the hero (`rgba(74,144,217,0.12)` ellipses) stay — they are not the problem.

**Gradient text — reduce to zero**
- Rule: no `text-transparent bg-clip-text bg-gradient-to-r` on any headline.
- Each affected element gets a solid replacement:
  | Location | Current | Replacement |
  |---|---|---|
  | Hero h1 "Calgary" | blue→teal gradient | solid white |
  | Vision h2 | blue→teal→amber gradient, italic | solid white, not italic |
  | Features h2 "actually live" | blue→teal→amber gradient | solid `#D4A843` |
  | Solution h3 | blue→teal gradient | solid white |
  | Problem h2 "Information Lag" | red→orange gradient | solid `#ef4444` |
- Any remaining gradient text instances elsewhere get the same treatment: pick the dominant colour, use it solid.

**CTA buttons — remove rainbow gradients**
- "How it Works" section CTA: `bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#8B5CF6]` → `bg-[#4A90D9] hover:bg-blue-500`
- Solution section CTA button: same gradient → `bg-[#4A90D9] hover:bg-blue-500`
- Hero CTA buttons: already solid blue — no change needed.

### 3. What Does NOT Change

- Page structure and section order
- Phone mockup and all its animations
- Bento grid layout and card content
- Mountain silhouette divider + parallax
- Mobile bottom sheet simulation
- How it Works card structure
- Colour palette (blue `#4A90D9`, teal `#2E8B7A`, amber `#D4A843`)
- All motion/animation (Framer Motion, GSAP)
- Live ticker bar
- Navigation

---

## Files Affected

- `src/pages/LandingPage.tsx` — all changes are in this one file

---

## Success Criteria

- No `bg-gradient-to-r` on any `<h1>`, `<h2>`, or `<h3>` element
- Aurora drift divs removed
- Stats grid contains only verifiable or first-party claims
- "74%", "9 apps", "urban intelligence layer", "community-powered" do not appear in rendered copy
- CTA buttons use solid `bg-[#4A90D9]`
