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

This app is **light-only**: `@variant light (&)` in `index.css` makes every
`light:` utility apply unconditionally. So `text-white light:text-slate-900`
renders *slate*, and deleting the `light:` half silently leaves white text on a
cream panel.

That has produced invisible text in "Sign In", the mobile live count, "Set Pin
Here", "Cancel" and the account menu. When touching an existing component,
prefer an explicit inline colour over the `light:` pair. Do not delete half of
one.
