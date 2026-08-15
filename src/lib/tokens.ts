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
