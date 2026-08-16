# Calgary Watch — design system

The site is converting to the language of the landing hero: a screen-printed
poster. It does not convert uniformly, because a gig poster and an incident map
are not trying to do the same thing.

Colours live in `src/lib/tokens.ts`. Import from there rather than pasting hex
literals — that habit is what produced three different colours for "crime".

---

## The poster language

What the hero is made of, so it can be recognised and reused:

| Device | Value |
|---|---|
| Ground | `#06162F` near-black navy |
| Ink | `#F2EFE8` warm off-white — a *foreground*, not a background |
| Accent | `#E52C20` vermilion, load-bearing |
| Display type | Bricolage, `font-black`, UPPERCASE, `leading-[0.76]`, `tracking-[-0.04em]` |
| Label type | 9–12px, `font-black`, UPPERCASE, `tracking-[0.18em]` — wide *positive* tracking |
| Depth | `shadow-[4px_4px_0_#E52C20]` — zero blur, pure offset, in the accent |
| Press | `hover:-translate-y-1` + `active:translate-x-1 active:translate-y-1 active:shadow-none` |
| Angle | `-rotate-2`, `rotate-6` — pinned paper, never a grid |
| Corners | zero radius |

The press is the best of these: the offset shadow *is* the depth, so pressing
collapses the button into the page. Reuse it for primary actions anywhere.

---

## The three layers

**1. Editorial** — landing, about, coverage.
The full poster. Everything in the table above.

**2. Masthead** — the header of a panel or page inside the app.
The bridge. Poster *devices* on the surface's own ground: a coordinate stamp,
a hard-offset press on the primary action, mono labels in wide uppercase
tracking, square corners on small chips. Headlines stay sentence case where the
surface is meant to feel warm — the personal briefing greets someone by name,
and `KNOW YOUR CITY.` is the wrong register for that.

**3. Data** — map chrome, cards, lists, forms, tables.
Stays legible. Borrows only the label register and square corners on chips.

Two rules that hold the third layer together:

- **No hard shadows.** One is a signature; twelve is noise.
- **No uppercase body.** `leading-[0.76]` black caps is magnificent at 9vw and
  unreadable across forty rows.

---

## Red

`POSTER.accent` and `CATEGORY.emergency` are both red and mean different
things: one is the brand's ink, the other is *someone is in danger*.

**They must never appear in the same view.** The layer rule keeps them apart —
editorial surfaces carry no incident severity, and data surfaces carry no
marketing accent. Where they would otherwise meet, severity wins.

This is true by construction almost everywhere: the landing page renders no
severity colours, and the app renders no marketing accent. Keep it that way. If
a marketing CTA ever has to sit next to an incident chip, the CTA gives up the
red.

**The one exception is the legend.** "What we track" on the landing page shows
the five category markers, and a legend has to be the real colours or it is not
a legend. So that section carries the severity palette and spends *no*
vermilion at all — the badges hold every colour on screen and the type stays
ink. That is also why its headline is not accented: tinting it with one
category would be arbitrary, and tinting it with the brand red would break the
very rule the section exists to illustrate.

---

## Two palettes, on purpose

`CATEGORY` and `CHART_SERIES` are deliberately different.

A map needs hues that read as **severity** — red for harm, amber for
disruption, cool for the merely broken. A chart needs six hues that stay apart
from each other at a glance. Optimising one for the other makes both worse, so
they are separate by intent rather than by accident. That distinction is why
crime is warm on the map and blue in the admin charts.

---

## The failure mode this codebase has

Read this before changing a colour on any map-heavy screen.

`index.css` lines 277–340 hold an **`!important` remap of specific dark-first
class names to light values**. Not a theme, not a variant — a hard-coded list:

```css
.bg-slate-950  { background-color: rgba(246,239,226,0.96) !important; }
.bg-slate-900  { background-color: rgba(255,251,245,0.96) !important; }
.text-white    { color: #1f2937 !important; }
.text-slate-300{ color: #44403c !important; }
.text-slate-400{ color: #6b7280 !important; }
.text-slate-500{ color: #78716c !important; }
.border-white\/10, .bg-white\/5, .text-blue-400 …
```

Pages here are authored with dark utility names and rendered light by this
remap. Three consequences, each of which has already cost real debugging time:

**1. `text-white` is not white.** It is `#1f2937`. A pair like
`text-white light:text-slate-900` renders dark because of the remap, not
because the `light:` half won. Deleting either half changes what renders, and
which one matters depends on whether the class is in the list above.

**2. Renaming `slate-*` to `stone-*` silently escapes the remap.** `stone` is
not in the list. `bg-slate-950` was rendering cream; `bg-stone-950` renders
near-black. `text-slate-300` was rendering `#44403c`; `text-stone-300` is
`#D6D3D1` — invisible on a cream panel. A bulk rename across the map chrome
broke the loading shell, the account dropdown, the report tooltip, the sort
select and eight menu rows in one pass. **If you rename a remapped class, you
must replace it with an explicit colour, not another Tailwind name.**

**3. It only covers the names on that list.** Anything outside it renders its
literal Tailwind value, so two visually identical-looking classes can behave
completely differently.

**4. It only covers the *unprefixed* class.** The remap targets `.text-white`,
not `.light\:text-white`. So in the same class list, `text-white` renders
`#1f2937` while `light:text-white` renders true white. This is the detail that
makes the pairs so confusing to read: in `bg-white text-stone-950
light:bg-stone-950 light:text-white`, the light half is white-on-near-black at
20:1 and perfectly fine, while the same words without the prefix would be
invisible. Measure before you "fix" one of these — the sign-in button looks
like the classic bug and is not.

The safe move when touching any of these: replace the whole pair with **one
explicit colour** (`style={{ color: '#1C2B3A' }}`) and look at the element
afterwards. Never delete half of a pair, and never bulk-rename across the list.

This has produced invisible text in "Sign In", the mobile live count, "Set Pin
Here", "Cancel", the account menu and the SOS close button. It is the single
most expensive gotcha in this repo.

## A trap in the Button component

`ui/Button.tsx` used to ship `shadow-blue-500/20` on its primary variant. That
sets `--tw-shadow-color`, which repaints **any** `shadow-[…]` a caller passes
through `className` — so every hard-offset press placed on a Button rendered
blue regardless of the colour written, including the SOS button's red one. The
colour utilities are gone; keep it that way.

Its base `active:scale-95` now only applies when the caller has not written
their own `active:` press, because the two are different properties and
otherwise compose into a button that shrinks *and* slides.
