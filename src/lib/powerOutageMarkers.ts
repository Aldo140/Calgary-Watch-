/**
 * Leaflet marker + popup builders for the ENMAX outage layer.
 *
 * Kept out of Map.tsx so the map component stays readable, but deliberately
 * mirrors the existing marker conventions there: DOM built with
 * createElement/createElementNS (no innerHTML, so no XSS surface from ENMAX
 * strings), static SVG path data, and Tailwind-ish inline styling to match the
 * incident markers already on the map.
 */

import L from 'leaflet';
import type { OutageGroup, PowerOutage } from '@/src/types/powerOutage';
import {
  ENMAX_DISCLAIMER,
  ENMAX_PORTAL_URL,
  OUTAGE_GROUP_STYLES,
  describeOutageForScreenReader,
  formatAreasAffected,
  formatCustomersAffected,
  formatOutageDateTime,
  formatOutageTime,
} from '@/src/lib/powerOutages';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Lucide "zap" bolt — the same icon family the rest of the app uses. */
const BOLT_PATH = 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z';
/** Lucide "clock" — marks outages that have not started yet. */
const CLOCK_PATHS = ['M12 6v6l4 2'];

function boltSvg(size: number, color: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', color);
  svg.setAttribute('stroke-width', '2.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', BOLT_PATH);
  svg.appendChild(path);
  return svg;
}

/** Small corner glyph that distinguishes the three states without using colour. */
function cornerBadge(kind: 'planned' | 'upcoming', accent: string): HTMLElement {
  const badge = document.createElement('div');
  badge.style.cssText = [
    'position:absolute', 'bottom:-3px', 'right:-3px',
    'width:15px', 'height:15px', 'border-radius:50%',
    'background:#ffffff', `border:1.5px solid ${accent}`,
    'display:flex', 'align-items:center', 'justify-content:center',
    'z-index:20', 'box-shadow:0 1px 3px rgba(0,0,0,0.3)',
  ].join(';');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '9');
  svg.setAttribute('height', '9');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', accent);
  svg.setAttribute('stroke-width', '3');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  if (kind === 'upcoming') {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    svg.appendChild(circle);
    for (const d of CLOCK_PATHS) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
  } else {
    // Calendar-ish tick for scheduled work that is already underway.
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M20 6 9 17l-5-5');
    svg.appendChild(p);
  }

  badge.appendChild(svg);
  return badge;
}

/**
 * Build the divIcon for one outage.
 *
 * The three groups differ by colour AND by shape (solid / white-ringed /
 * dashed outline) AND by corner glyph, so they stay distinguishable in
 * greyscale and for colour-blind users. Sizing is a touch smaller than the
 * incident markers so official data reads as a separate class of pin, while
 * staying above the ~36px comfortable tap target on mobile.
 */
export function createOutageIcon(group: OutageGroup): L.DivIcon {
  const style = OUTAGE_GROUP_STYLES[group];
  const size = 36;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;`;

  if (style.shape === 'filled') {
    // Active unplanned gets the same pulse language as urgent incident pins.
    const pulse = document.createElement('div');
    pulse.className = 'animate-pulse-ring';
    pulse.style.cssText = `position:absolute;inset:0;border-radius:12px;background:${style.color};opacity:0.45;`;
    wrapper.appendChild(pulse);
  }

  const body = document.createElement('div');
  const base = [
    'position:relative', `width:${size}px`, `height:${size}px`,
    'border-radius:12px',
    'display:flex', 'align-items:center', 'justify-content:center',
    'cursor:pointer', 'z-index:10',
    'transition:transform 0.15s ease',
  ];

  if (style.shape === 'dashed') {
    body.style.cssText = [
      ...base,
      'background:#ffffff',
      `border:2.5px dashed ${style.color}`,
      'box-shadow:0 4px 14px rgba(15,23,42,0.28)',
    ].join(';');
    body.appendChild(boltSvg(18, style.color));
    body.appendChild(cornerBadge('upcoming', style.color));
  } else if (style.shape === 'ringed') {
    body.style.cssText = [
      ...base,
      `background:${style.color}`,
      'border:2.5px solid #ffffff',
      `box-shadow:0 0 0 2.5px ${style.color},0 4px 14px rgba(15,23,42,0.35)`,
    ].join(';');
    body.appendChild(boltSvg(18, '#ffffff'));
    body.appendChild(cornerBadge('planned', style.color));
  } else {
    body.style.cssText = [
      ...base,
      `background:${style.color}`,
      'border:2.5px solid rgba(255,255,255,0.9)',
      `box-shadow:0 4px 16px ${style.color}66`,
    ].join(';');
    body.appendChild(boltSvg(19, '#ffffff'));
  }

  wrapper.appendChild(body);

  return L.divIcon({
    html: wrapper,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Cluster badge for the outage layer — a bolt plus the child count. */
export function createOutageClusterIcon(count: number, hasUnplanned: boolean): L.DivIcon {
  const accent = hasUnplanned
    ? OUTAGE_GROUP_STYLES.active_unplanned.color
    : OUTAGE_GROUP_STYLES.active_planned.color;

  const el = document.createElement('div');
  el.style.cssText = [
    'width:44px', 'height:44px',
    'background:rgba(255,255,255,0.97)',
    `border:2.5px solid ${accent}`,
    'border-radius:14px',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'gap:1px', 'cursor:pointer',
    'box-shadow:0 4px 20px rgba(15,23,42,0.35)',
  ].join(';');

  el.appendChild(boltSvg(14, accent));

  const label = document.createElement('span');
  label.style.cssText = `color:${accent};font-size:11px;font-weight:900;line-height:1;letter-spacing:-0.01em;`;
  label.textContent = String(count);
  el.appendChild(label);

  return L.divIcon({ html: el, className: '', iconSize: [44, 44], iconAnchor: [22, 22] });
}

// ---------------------------------------------------------------------------
// Popup
// ---------------------------------------------------------------------------

function detailRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:baseline;';

  const key = document.createElement('span');
  key.style.cssText = 'flex:0 0 92px;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;';
  key.textContent = label;

  const val = document.createElement('span');
  val.style.cssText = 'flex:1;font-size:12px;font-weight:600;color:#e2e8f0;line-height:1.45;';
  val.textContent = value;

  row.append(key, val);
  return row;
}

/**
 * Build the outage popup.
 *
 * Mirrors the dark incident popup styling in Map.tsx so the layer feels native,
 * while stating plainly that this is official ENMAX data rather than a
 * community report, and that Calgary Watch does not control the restoration.
 */
export function createOutagePopupContent(
  outage: PowerOutage,
  group: OutageGroup,
  updatedAt: string | null,
): HTMLElement {
  const style = OUTAGE_GROUP_STYLES[group];

  const wrapper = document.createElement('div');
  wrapper.setAttribute('role', 'dialog');
  wrapper.setAttribute('aria-label', `Official ENMAX power outage. ${style.description}.`);
  wrapper.className =
    'min-w-[272px] max-w-[320px] bg-slate-950 text-white rounded-[1.4rem] border border-white/10 shadow-[0_14px_34px_rgba(0,0,0,0.42)] overflow-hidden';

  const content = document.createElement('div');
  content.className = 'p-4 space-y-3';

  // ── Header: official source line ──────────────────────────────────────────
  const sourceLine = document.createElement('div');
  sourceLine.style.cssText = 'display:flex;align-items:center;gap:6px;';
  const boltMark = boltSvg(13, style.color);
  const officialLabel = document.createElement('span');
  officialLabel.style.cssText = 'font-size:10px;font-weight:900;letter-spacing:0.16em;text-transform:uppercase;color:#cbd5e1;';
  officialLabel.textContent = 'Official source · ENMAX';
  sourceLine.append(boltMark, officialLabel);
  content.appendChild(sourceLine);

  const title = document.createElement('h3');
  title.className = 'text-sm font-black tracking-tight leading-tight text-white';
  title.textContent = 'Official ENMAX Power Outage';
  content.appendChild(title);

  // ── Badges: planned/unplanned + active/upcoming, as text not colour ───────
  const badges = document.createElement('div');
  badges.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';

  const typeBadge = document.createElement('span');
  typeBadge.style.cssText = `display:inline-flex;align-items:center;padding:3px 8px;border-radius:9999px;font-size:10px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:#0f172a;background:${style.color};`;
  typeBadge.textContent = outage.type === 'planned' ? 'Planned' : 'Unplanned';

  const stateBadge = document.createElement('span');
  stateBadge.style.cssText = 'display:inline-flex;align-items:center;padding:3px 8px;border-radius:9999px;font-size:10px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:#e2e8f0;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);';
  stateBadge.textContent = group === 'upcoming_planned' ? 'Upcoming' : 'Active';

  const statusBadge = document.createElement('span');
  statusBadge.style.cssText = 'display:inline-flex;align-items:center;padding:3px 8px;border-radius:9999px;font-size:10px;font-weight:700;color:#94a3b8;background:rgba(255,255,255,0.06);';
  statusBadge.textContent = outage.status;

  badges.append(typeBadge, stateBadge, statusBadge);
  content.appendChild(badges);

  // ── Details ───────────────────────────────────────────────────────────────
  const details = document.createElement('div');
  details.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding-top:2px;';
  details.append(
    detailRow('Areas', formatAreasAffected(outage.areasAffected)),
    detailRow('Customers', formatCustomersAffected(outage.customersAffected)),
    detailRow('Cause', outage.cause),
    detailRow('Started', formatOutageDateTime(outage.startedAt, 'Not provided')),
    detailRow('Est. restore', formatOutageDateTime(outage.estimatedRestorationAt, 'Not provided')),
  );
  if (outage.referenceNumber) {
    details.appendChild(detailRow('Reference', outage.referenceNumber));
  }
  content.appendChild(details);

  // ── Attribution + disclaimer ──────────────────────────────────────────────
  const footer = document.createElement('div');
  footer.style.cssText = 'padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:8px;';

  const disclaimer = document.createElement('p');
  disclaimer.style.cssText = 'font-size:10.5px;line-height:1.5;color:#94a3b8;margin:0;';
  disclaimer.textContent = ENMAX_DISCLAIMER;
  footer.appendChild(disclaimer);

  const link = document.createElement('a');
  link.href = ENMAX_PORTAL_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 12px;border-radius:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:#e2e8f0;font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;';
  link.textContent = 'View on ENMAX portal';
  link.setAttribute('aria-label', 'View this outage on the ENMAX outage portal (opens in a new tab)');
  footer.appendChild(link);

  const refreshed = document.createElement('p');
  refreshed.style.cssText = 'font-size:9.5px;color:#64748b;margin:0;';
  refreshed.textContent = updatedAt
    ? `ENMAX data refreshed ${formatOutageTime(updatedAt)}`
    : 'ENMAX refresh time unavailable';
  footer.appendChild(refreshed);

  content.appendChild(footer);
  wrapper.appendChild(content);
  return wrapper;
}

/** Accessible name applied to the marker element itself. */
export function outageMarkerLabel(outage: PowerOutage, group: OutageGroup): string {
  return describeOutageForScreenReader(outage, group);
}
