/**
 * Calgary Watch design tokens.
 *
 * One source, because the alternative is what this file replaced: three
 * category palettes that disagreed with each other. Crime was #DC2626 red on
 * the map sheet, #B0503A clay in the briefing, and #2C6FB5 *blue* in the admin
 * charts. The same category meant a different thing depending on which screen
 * you were looking at.
 *
 * ── The three layers ───────────────────────────────────────────────────────
 *
 * The site is converting to the poster language of the landing hero. It does
 * not convert uniformly, because a gig poster and an incident map are not
 * trying to do the same thing. Three layers, and which one a surface belongs
 * to decides what it may borrow:
 *
 *   1. EDITORIAL — landing, about, coverage.
 *      The full poster: navy ground, paper ink, vermilion accent, uppercase
 *      display at sub-1 line height, hard offset shadows, off-axis rotation,
 *      marquee strips, zero radius.
 *
 *   2. MASTHEAD — the header of a panel or page inside the app.
 *      The bridge. Poster *devices* on the surface's own ground: a coordinate
 *      stamp, a hard-offset press on the primary action, mono labels in wide
 *      uppercase tracking, square corners on small chips. Headlines stay
 *      sentence case where the surface is meant to feel warm.
 *
 *   3. DATA — map chrome, cards, lists, forms, tables.
 *      Stays legible. Borrows only the label register (mono, uppercase, wide
 *      tracking) and square corners on chips. No hard shadows — one is a
 *      signature, twelve is noise. No uppercase body: leading-[0.76] black
 *      caps is magnificent at 9vw and unreadable across forty rows.
 *
 * ── On red ─────────────────────────────────────────────────────────────────
 *
 * POSTER.accent and CATEGORY.emergency are both red and they mean different
 * things: one is the brand's ink, the other is "someone is in danger". They
 * must never appear in the same view. The rule that keeps them apart is the
 * layer rule above — editorial surfaces carry no incident severity, and data
 * surfaces carry no marketing accent. Severity always wins where they would
 * otherwise meet.
 */

/** Layer 1. The screen-printed poster: three colours, used hard. */
export const POSTER = {
  /** Night ground. */
  ground: '#06162F',
  /** The ink. Warm off-white — used as foreground, not as background. */
  paper: '#F2EFE8',
  /** The single accent. Load-bearing; never used for severity. */
  accent: '#E52C20',
  /** Eyebrow text on the dark ground. */
  eyebrow: '#AFC5DF',
  /** Body text on the dark ground. */
  body: '#D5DFEB',
} as const;

/** Layer 2/3. Warm sandstone surfaces — the resident-facing screens. */
export const SURFACE = {
  page: '#F5EFE4',
  card: '#FFFCF6',
  ink: '#2A2420',
  soft: '#6E6357',
  line: '#E4DACA',
  edge: '#D6C9B4',
  /** Brand green, kept from the original palette. */
  teal: '#2E8B7A',
  /** Foothill greens, for mastheads. */
  deep: '#1F3D37',
  deep2: '#2F5F52',
  gold: '#B0793C',
  glow: '#E8B871',
} as const;

/**
 * Incident categories, as a severity reading.
 *
 * Ordered by how much attention the thing deserves, and hued that way: red for
 * harm, amber for disruption, green and blue for the merely broken. Used
 * anywhere a resident reads an incident — the map, the sheet, the briefing.
 */
export const CATEGORY = {
  emergency: '#C0392B',
  crime: '#B5442F',
  traffic: '#C07A2A',
  infrastructure: '#3E7D8C',
  weather: '#6A63A8',
  gas: '#2E8B7A',
} as const;

export type CategoryKey = keyof typeof CATEGORY;

/** The colour for an incident category, falling back to weather's neutral. */
export function categoryColor(category: string): string {
  return (CATEGORY as Record<string, string>)[category] ?? CATEGORY.weather;
}

/**
 * Admin chart series.
 *
 * Deliberately *not* CATEGORY. A chart needs six hues that stay apart from
 * each other at a glance; a map needs hues that read as severity. Optimising
 * one for the other makes both worse, so they are separate on purpose rather
 * than by accident.
 */
export const CHART_SERIES = {
  emergency: '#C0392B',
  crime: '#2C6FB5',
  traffic: '#C77F18',
  infrastructure: '#2F855A',
  weather: '#7C5CBF',
  gas: '#0F8B8D',
} as const;

// ─── The map application ────────────────────────────────────────────────────

/**
 * Layer 3 surfaces: map chrome, panels, sheets, forms.
 *
 * An audit of the map app found **89 distinct hex colours**, of which 95 pairs
 * were within 18 units of each other in RGB — `#D8E2EA` against `#D9E2E8`,
 * `#F7FBFF` against `#F8FAFC`, `#1C2B3A` against `#1E293B`. Nobody chose those;
 * they accumulated one component at a time. Grouped by role, the usage counts
 * show the palette was only ever about a dozen values with seventy-odd near
 * misses layered on top.
 *
 * These are those dozen, picked as the most-used member of each cluster so
 * adopting them changes almost nothing visually. Import from here; a new hex
 * literal in a component is how the drift started.
 *
 * This is Layer 3, so it takes the poster's *grammar* — square corners, mono
 * labels in wide uppercase tracking, the hard-offset press on primary actions —
 * and not its display type or its dark ground. Forty report rows in
 * `leading-[0.76]` black caps is unreadable, and dark chrome over a light
 * basemap fights both the tiles and the crime choropleth.
 */
export const MAP = {
  /** Panel and card surface. Was also #FFFFFF, #FFFCF6, #F8FAFC. */
  panel: '#FFFDF8',
  /** The page behind the panels. Was also #F5F2E9, #F7F6F3. */
  paper: '#F7F3EA',
  /** Tinted surface for a selected or hovered row. Was also #EAF1F6, #EEF4F8. */
  tint: '#E8F3FC',

  /** Primary text. Was also #1E293B, #0F172A, #020617. */
  ink: '#1C2B3A',
  /** Deep chrome ink — headers and the map's own furniture. Was also #0A1628, #0F1E3D. */
  inkDeep: '#0B1F33',
  /** Secondary text. Was also #52697D, #6B8296, #64748B, #475569. */
  muted: '#5A6B7D',
  /** Tertiary text — timestamps, counts. */
  faint: '#9AA6B2',

  /** Hairline on paper. Was also #D9D2C3, #F0EBDD. */
  line: '#E7E0D2',
  /** Hairline on the cooler map chrome. Was also #D8E2EA, #D9E2E8, #E2E8F0. */
  lineCool: '#C9D8E4',

  /** Interactive accent. Was also #286FAF, #2563EB. */
  accent: '#4A90D9',
  /** Positive / live. Was also #059669, #34D399, #22C55E. */
  ok: '#2E8B7A',
  /** Warning. Was also #EA580C, #B45309, #92400E. */
  warn: '#C77F18',
  /** Danger. Was also #EF4444, #E11D48, #B91C1C, #7F1D1D. */
  danger: '#C0392B',
} as const;

/**
 * Traffic is a map data vocabulary, not a new palette. Keeping labels, colour,
 * and stroke patterns together stops the legend, roads, and inspector from
 * drifting apart. Dash patterns make observed conditions readable without
 * relying on colour alone.
 */
export const TRAFFIC_FLOW = {
  observed: {
    free: { label: 'Moving', color: MAP.ok, dashArray: undefined },
    moderate: { label: 'Slower', color: '#D4A843', dashArray: '14 5' },
    heavy: { label: 'Heavy', color: MAP.warn, dashArray: '7 5' },
    stopped: { label: 'Stopped', color: MAP.danger, dashArray: '2 5' },
    unknown: { label: 'Unknown', color: MAP.muted, dashArray: '4 5' },
  },
  baseline: {
    low: { label: 'Low', color: '#A9CBE8', dashArray: '6 7' },
    medium: { label: 'Medium', color: '#6FA4D2', dashArray: '6 7' },
    high: { label: 'High', color: '#3D7EB8', dashArray: '6 7' },
    very_high: { label: 'Very high', color: '#174F82', dashArray: '6 7' },
    unknown: { label: 'Unknown', color: '#7E94A8', dashArray: '6 7' },
  },
} as const;
