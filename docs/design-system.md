# CalgaryWatch ? design system

## Master brand
CalgaryWatch answers ?What?s happening in Calgary?? Discovery and Live are two modes of one product. Use the CALGARYWATCH wordmark without a Community Safety subtitle. A single future primary mark can replace it; the plane, shield and Bow illustrations remain secondary heritage artwork.

## Discovery and editorial
Clean, warm editorial surfaces. One clear hero proposition, one human Calgary image, useful search, asymmetric grids and generous space. Use image scale and typography for hierarchy. Avoid rotating cards, constant tickers, offset shadows, glass effects and decorative motion. Page content lives in small reusable components rather than a monolithic landing page.

## Live
Keep the existing map and its established interaction model. Use deep navy, timestamps and precise source language for the homepage Live preview. The exact Live tagline is ?See it. Share it. Calgary knows.? Emergencies are never presented as lifestyle content or advertising opportunities.

## Admin
Reuse AdminShell, useAdminData, attention queues and audit patterns. New workspaces are Content, Demand and Partners. Unimplemented workspaces must say so; do not show fictional metrics or controls that imply persistence.

## Typography
Bricolage Grotesque: display and editorial headings, sentence case. Inter: readable body and UI. IBM Plex Mono: timestamps, coordinates and data labels only. Small uppercase eyebrow labels are permitted; body copy is never uppercase. Headings must have semantic order independent of font size.

## Colour
Discovery tokens are scoped to .cw-site in src/styles/discovery.css:
- Background #FAF8F3; surface #FFFFFF; text #151515; muted #565A61.
- Border #D8D9D7; brand #1554D1; Live #06162F.
- Red remains reserved for emergency/severity; do not make it a generic discovery CTA colour.
Legacy map CATEGORY and admin CHART_SERIES palettes remain independent because severity and data series serve different purposes.

## Spacing and cards
Maximum reading grid 1320px including gutters. Desktop gutters 44px; mobile 20px. Section spacing 40?65px. Use open editorial cards with 3:2-ish imagery, category, headline and summary. Borders separate sections; avoid a dashboard of boxed tiles. Hero corners may be softly shaped; ordinary controls remain restrained.

## Photography
Use local optimized assets with truthful alt text, dimensions and provenance. The foundation reuses existing city photography; rights/provenance should be reviewed before adding new assets. One high-priority hero image; lower images lazy load. Do not mislabel generic stock as a particular venue or imply fixture images document a real event.

## Motion
Use short hover affordances only in discovery. Respect prefers-reduced-motion. No animation should compete with reading or search. Keep map animation isolated to the Live bundle.

## Accessibility
Target WCAG 2.2 AA: visible keyboard focus, skip link, labelled search, semantic headings, navigation landmarks, 44px primary touch targets, 200% zoom and small-screen reflow. Never communicate severity or paid status by colour alone. Check actual computed contrast because legacy utility names can be misleading.

## Data visualization and provenance
Never invent live counts, availability, trending ranks or freshness. Show sources and timestamps on entity details. Market masters and occurrences are distinct. Development fixtures must be labelled and excluded from production and indexing. An honest empty state is the correct presentation when verified inventory is missing.

## Sponsored content
Label paid placements ?Sponsored? or ?Featured Partner.? Keep claimed, listed, editorial selection and partner states separate. Payment cannot establish a ?best? editorial ranking. No ads inside emergency information. Use only verified organizational claims; ?Free for residents? is acceptable without inventing a legal status.

## Legacy CSS compatibility
New discovery UI uses explicit scoped CSS variables. Do not bulk-replace dark Tailwind utility classes in legacy surfaces. Existing safety/admin pages migrate progressively only with visual verification.

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
