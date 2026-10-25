/**
 * Everything drawn on the live map itself: incident pins, cluster bubbles,
 * the report popup, the neighbourhood 311 ramp and the heatmap gradient.
 *
 * One vocabulary, shared by Map.tsx (Leaflet divIcons) and MapLegend (React),
 * so the key can never drift from the pins it explains.
 *
 * Contrast comes from the outline, not the fill: every pin has a 2px ink
 * stroke and a white halo, so it reads on the light Positron basemap and on
 * a dark one. Shape carries the category as well as colour (WCAG 1.4.1), and
 * a second channel carries provenance: a navy corner tab for official feeds,
 * a dashed outline for a neighbour report nobody has confirmed yet.
 *
 * All SVG markup here is static. No incident text is ever interpolated into
 * an HTML string; report titles and neighbourhoods go in via textContent.
 */
import type { Incident } from '@/src/types';
import { CATEGORY, LIVE } from '@/src/lib/tokens';
import { formatRelativeTime } from '@/src/lib/format';
import { isCitySignal, isSafety311 } from '@/src/lib/crimeBoard';

export type CanvasCategory = 'emergency' | 'crime' | 'traffic' | 'infrastructure' | 'weather';
type Shape = 'diamond' | 'circle' | 'triangle' | 'square' | 'squircle';

interface CategoryStyle {
  /** What a resident reads. "Crime" is shown as "Safety": the data value stays `crime`. */
  label: string;
  fill: string;
  glyph: string;
  shape: Shape;
}

export const CANVAS_CATEGORY: Record<CanvasCategory, CategoryStyle> = {
  emergency: { label: 'Emergency', fill: CATEGORY.emergency, glyph: '#FFFFFF', shape: 'diamond' },
  crime: { label: 'Crime', fill: CATEGORY.crime, glyph: LIVE.ink, shape: 'circle' },
  traffic: { label: 'Traffic', fill: CATEGORY.traffic, glyph: LIVE.ink, shape: 'triangle' },
  infrastructure: { label: 'City & infrastructure', fill: CATEGORY.infrastructure, glyph: '#FFFFFF', shape: 'square' },
  weather: { label: 'Weather', fill: CATEGORY.weather, glyph: LIVE.ink, shape: 'squircle' },
};

export const CANVAS_CATEGORY_ORDER: CanvasCategory[] = ['emergency', 'crime', 'traffic', 'infrastructure', 'weather'];

export function canvasCategory(category: string): CanvasCategory {
  return (category in CANVAS_CATEGORY ? category : 'weather') as CanvasCategory;
}

/** Lucide glyphs (24-unit grid), static markup only. */
const GLYPH: Record<CanvasCategory, string> = {
  emergency:
    '<path d="M7 12a5 5 0 0 1 10 0v6H7z"/><path d="M5 20h14"/><path d="M12 7V3"/><path d="M5 10 3 9"/><path d="m19 10 2-1"/>',
  crime: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  traffic:
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><path d="M9 17h6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  infrastructure:
    '<rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/><path d="M10 14 2.3 6.3"/><path d="m14 14 7.7-7.7"/>',
  weather:
    '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>',
};

/** Shape geometry in a 40-unit box (emergency uses a 52-unit box). */
function shapeEl(shape: Shape, attrs: string): string {
  switch (shape) {
    case 'diamond':
      return `<rect x="13" y="13" width="26" height="26" rx="6" transform="rotate(45 26 26)" ${attrs}/>`;
    case 'circle':
      return `<circle cx="20" cy="20" r="14" ${attrs}/>`;
    case 'triangle':
      return `<path d="M20 5.5 35 32.5H5Z" stroke-linejoin="round" ${attrs}/>`;
    case 'square':
      return `<rect x="6.5" y="6.5" width="27" height="27" rx="7" ${attrs}/>`;
    case 'squircle':
      return `<path d="M20 6C31 6 34 9 34 20s-3 14-14 14S6 31 6 20 9 6 20 6Z" ${attrs}/>`;
  }
}

function glyphTransform(shape: Shape): string {
  if (shape === 'diamond') return 'translate(15 15) scale(0.9167)';
  if (shape === 'triangle') return 'translate(13.5 17) scale(0.54)';
  return 'translate(12 12) scale(0.6667)';
}

export interface PinOptions {
  /** Dashed outline: a neighbour report not yet confirmed by anyone else. */
  unverified?: boolean;
}

/**
 * The pin's SVG markup. Static: category comes from a fixed lookup, never from
 * user input. Used by the Leaflet icon and by the legend.
 */
export function pinSvgMarkup(category: CanvasCategory, opts: PinOptions = {}): string {
  const style = CANVAS_CATEGORY[category];
  const box = style.shape === 'diamond' ? 52 : 40;
  const dash = opts.unverified ? ' stroke-dasharray="4 3"' : '';
  const halo =
    style.shape === 'diamond'
      ? shapeEl(style.shape, `fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linejoin="round"`) +
        shapeEl(style.shape, `fill="none" stroke="${LIVE.yellow}" stroke-width="8" stroke-linejoin="round"`)
      : shapeEl(style.shape, `fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round"`);
  // Unverified pins keep their white halo solid and dash only the ink line,
  // with a paper underlay so the gaps read as "dashed", not "broken".
  const underlay = opts.unverified
    ? shapeEl(style.shape, `fill="none" stroke="#FFFFFF" stroke-width="2"`)
    : '';
  const body = shapeEl(style.shape, `fill="${style.fill}" stroke="${LIVE.ink}" stroke-width="2"${dash}`);
  return (
    `<svg class="lv-pin__svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" aria-hidden="true" focusable="false">` +
    halo +
    underlay +
    body +
    `<g transform="${glyphTransform(style.shape)}" fill="none" stroke="${style.glyph}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${GLYPH[category]}</g>` +
    `</svg>`
  );
}

export const FRESH_MS = 60 * 60 * 1000;

/** Official feeds carry a one-letter source tab. */
export function officialTabLetter(incident: Pick<Incident, 'source_type' | 'data_source'>): string | null {
  if (incident.data_source !== 'official' && incident.data_source !== 'system') return null;
  switch (incident.source_type) {
    case 'calgary_police_crime':
      return 'P';
    case 'news_rss':
      return 'N';
    case 'enmax_power_outage':
      return 'E';
    case 'alberta_emergency_alert':
      return 'A';
    case 'env_canada_weather':
      return 'W';
    default:
      return 'C';
  }
}

export function isUnverifiedNeighbourReport(incident: Pick<Incident, 'verified_status' | 'data_source'>): boolean {
  if (incident.data_source === 'official' || incident.data_source === 'system') return false;
  return incident.verified_status === 'unverified' || incident.verified_status === 'pending_review';
}

/** The provenance phrase shown on the popup chip and read by screen readers. */
export function provenanceLabel(incident: Incident): string {
  const official = officialTabLetter(incident);
  if (official) return incident.source_name?.trim() || 'Official feed';
  if (isUnverifiedNeighbourReport(incident)) return 'Neighbour report · not yet confirmed';
  if (incident.verified_status === 'community_confirmed') return 'Neighbour report · confirmed by neighbours';
  if (incident.verified_status === 'multiple_reports') return 'Neighbour report · several reports';
  return 'Neighbour report';
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Spoken name for a pin: category, title, neighbourhood, time, provenance. */
export function pinAccessibleName(incident: Incident, now = Date.now()): string {
  const cat = CANVAS_CATEGORY[canvasCategory(incident.category)].label;
  const when = Number.isFinite(incident.timestamp) ? formatRelativeTime(incident.timestamp, now) : '';
  const hood = typeof incident.neighborhood === 'string' && incident.neighborhood ? titleCase(incident.neighborhood) : 'Calgary';
  const title = typeof incident.title === 'string' && incident.title ? incident.title : 'Untitled report';
  return [`${cat}: ${title}`, hood, when, provenanceLabel(incident)].filter(Boolean).join(', ');
}

/** The full pin element for a Leaflet divIcon. */
export function buildPinElement(incident: Incident, now = Date.now()): { el: HTMLElement; size: number } {
  const category = canvasCategory(incident.category);
  const style = CANVAS_CATEGORY[category];
  const unverified = isUnverifiedNeighbourReport(incident);
  const tab = officialTabLetter(incident);
  const fresh = Number.isFinite(incident.timestamp) && now - incident.timestamp >= 0 && now - incident.timestamp < FRESH_MS;
  const size = style.shape === 'diamond' ? 52 : 40;

  const el = document.createElement('div');
  el.className = [
    'lv-pin',
    `lv-pin--${category}`,
    category === 'emergency' ? 'lv-pin--alert' : fresh ? 'lv-pin--fresh' : '',
    unverified ? 'lv-pin--unverified' : '',
    tab ? 'lv-pin--official' : '',
    // City 311, roads, outages and weather sit smaller and quieter than crime;
    // so do neighbours' 311 safety reports, which show with crime but under
    // police releases and news.
    isCitySignal(incident) || isSafety311(incident) ? 'lv-pin--signal' : '',
  ].filter(Boolean).join(' ');
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  // Red pulse for emergencies only; a single quiet cyan ring for fresh reports.
  if (category === 'emergency' || fresh) {
    const pulse = document.createElement('span');
    pulse.className = 'lv-pin__pulse';
    pulse.setAttribute('aria-hidden', 'true');
    el.appendChild(pulse);
  }

  const art = document.createElement('span');
  art.className = 'lv-pin__art';
  art.innerHTML = pinSvgMarkup(category, { unverified }); // static markup only
  el.appendChild(art);

  if (tab) {
    const badge = document.createElement('span');
    badge.className = 'lv-pin__tab';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = tab;
    el.appendChild(badge);
  }

  const name = document.createElement('span');
  name.className = 'lv-sr';
  name.textContent = pinAccessibleName(incident, now);
  el.appendChild(name);

  return { el, size };
}

/**
 * Cluster bubble: navy, white count, and a thin ring split by category mix
 * so a cluster that holds an emergency still says so without turning red.
 */
export function buildClusterElement(categories: string[]): { el: HTMLElement; size: number } {
  const count = categories.length;
  const size = count >= 50 ? 52 : count >= 10 ? 46 : 40;
  const tally = new Map<CanvasCategory, number>();
  for (const c of categories) {
    const key = canvasCategory(c);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let acc = 0;
  const stops: string[] = [];
  for (const key of CANVAS_CATEGORY_ORDER) {
    const n = tally.get(key);
    if (!n) continue;
    const from = (acc / count) * 360;
    acc += n;
    const to = (acc / count) * 360;
    stops.push(`${CANVAS_CATEGORY[key].fill} ${from.toFixed(1)}deg ${to.toFixed(1)}deg`);
  }

  const el = document.createElement('div');
  el.className = 'lv-cluster';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.setProperty('--lv-mix', `conic-gradient(${stops.join(', ')})`);

  const core = document.createElement('span');
  core.className = 'lv-cluster__core';
  core.setAttribute('aria-hidden', 'true');
  core.textContent = count > 99 ? '99+' : String(count);
  el.appendChild(core);

  const emergencies = tally.get('emergency') ?? 0;
  const name = document.createElement('span');
  name.className = 'lv-sr';
  name.textContent =
    `${count} reports in this area` +
    (emergencies ? `, including ${emergencies} emergency ${emergencies === 1 ? 'alert' : 'alerts'}` : '') +
    '. Press Enter to zoom in.';
  el.appendChild(name);
  return { el, size };
}

// ─── Popup ──────────────────────────────────────────────────────────────────

export interface PopupParts {
  reporterFirstName: string;
}

/** "By Dana" / "By Anonymous": first name only, never a surname. */
export function reporterFirstName(incident: Pick<Incident, 'name' | 'anonymous'>): string {
  const raw = incident.name?.trim() || 'Community Member';
  if (incident.anonymous || raw.toLowerCase().includes('anonymous')) return 'Anonymous';
  return raw.split(/\s+/)[0] || 'Community';
}

/**
 * The report card that opens over a pin. Built with DOM APIs; every piece of
 * report text goes in through textContent.
 */
export function buildPopupContent(incident: Incident, parts: PopupParts, now = Date.now()): HTMLElement {
  const category = canvasCategory(incident.category);
  const style = CANVAS_CATEGORY[category];
  const str = (v: unknown, fallback = '') => (typeof v === 'string' && v ? v : fallback);

  const card = document.createElement('article');
  card.className = 'lv-popup';
  card.style.setProperty('--lv-cat', style.fill);

  if (incident.image_url) {
    const photo = document.createElement('img');
    photo.src = incident.image_url;
    photo.alt = '';
    photo.loading = 'lazy';
    photo.className = 'lv-popup__photo';
    photo.addEventListener('error', () => photo.remove());
    card.appendChild(photo);
  }

  const body = document.createElement('div');
  body.className = 'lv-popup__body';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'lv-popup__eyebrow';
  const dot = document.createElement('span');
  dot.className = 'lv-popup__dot';
  dot.setAttribute('aria-hidden', 'true');
  const when = Number.isFinite(incident.timestamp) ? formatRelativeTime(incident.timestamp, now) : '';
  const eyebrowText = document.createElement('span');
  eyebrowText.textContent = [style.label, when, titleCase(str(incident.neighborhood, 'Calgary'))].filter(Boolean).join(' · ');
  eyebrow.append(dot, eyebrowText);
  body.appendChild(eyebrow);

  const title = document.createElement('h3');
  title.className = 'lv-popup__title';
  title.textContent = str(incident.title, 'Untitled report');
  body.appendChild(title);

  const description = str(incident.description);
  if (description) {
    const desc = document.createElement('p');
    desc.className = 'lv-popup__desc';
    desc.textContent = description;
    body.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'lv-popup__meta';
  const chip = document.createElement('span');
  const tab = officialTabLetter(incident);
  chip.className = 'lv-popup__chip' + (tab ? ' lv-popup__chip--official' : isUnverifiedNeighbourReport(incident) ? ' lv-popup__chip--unverified' : '');
  chip.textContent = provenanceLabel(incident);
  meta.appendChild(chip);
  if (!tab) {
    const by = document.createElement('span');
    by.className = 'lv-popup__by';
    by.textContent = `By ${parts.reporterFirstName}`;
    meta.appendChild(by);
  }
  body.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'lv-popup__actions';
  const viewDetails = document.createElement('button');
  viewDetails.type = 'button';
  viewDetails.className = 'view-details-btn lv-popup__btn lv-popup__btn--primary';
  viewDetails.setAttribute('data-id', str(incident.id));
  viewDetails.setAttribute('aria-label', 'View details');
  viewDetails.textContent = 'Details';
  const learnMore = document.createElement('button');
  learnMore.type = 'button';
  learnMore.className = 'learn-more-btn lv-popup__btn lv-popup__btn--ghost';
  learnMore.setAttribute('data-neighborhood', str(incident.neighborhood));
  learnMore.textContent = 'Area intel';
  actions.append(viewDetails, learnMore);
  body.appendChild(actions);

  card.appendChild(body);
  return card;
}

// ─── Neighbourhood 311 layer ────────────────────────────────────────────────

/** Single-hue brand-blue ramp, lightest to darkest. No heat, no rank. */
export const COMMUNITY_311_RAMP = ['#DFE7FF', '#9DB7F0', '#5B86E0', '#1554D1'] as const;

export const COMMUNITY_311_STEPS = [
  'Fewer 311 requests than most communities',
  'Around the middle for 311 requests',
  'More 311 requests than most communities',
  'Many more 311 requests than most communities',
] as const;

/** Step 0-3 relative to the quartile cut points of communities with data. */
export function community311Step(total: number | null, cuts: { p50: number; p75: number; p90: number }): number | null {
  if (total === null || total <= 0) return null;
  if (total >= cuts.p90) return 3;
  if (total >= cuts.p75) return 2;
  if (total >= cuts.p50) return 1;
  return 0;
}

/** Calm heatmap: blue to cyan to yellow. No fire red. */
export const HEAT_GRADIENT: Record<number, string> = {
  0.2: '#9DB7F0',
  0.45: LIVE.blue,
  0.7: LIVE.cyan,
  1.0: LIVE.yellow,
};
