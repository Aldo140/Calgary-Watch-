import { useEffect, useRef, useState } from 'react';
import type { CrimeStatEntry } from '@/src/hooks/useCrimeStats';
import { Layers, Activity, Map as MapIcon, Building2, Video, Camera, Gauge, X, Construction } from 'lucide-react';
import type { TrafficFlowMode } from '@/src/types/trafficFlow';
import { TRAFFIC_FLOW } from '@/src/lib/tokens';
import {
  CANVAS_CATEGORY,
  CANVAS_CATEGORY_ORDER,
  COMMUNITY_311_RAMP,
  HEAT_GRADIENT,
  pinSvgMarkup,
} from '@/src/components/map/canvas/markerKit';
import '../styles/map-canvas.css';

interface LayerToggleProps {
  showLiveReports: boolean;
  setShowLiveReports: (show: boolean) => void;
  showHeatmap: boolean;
  setShowHeatmap: (show: boolean) => void;
  showCrimeLayer: boolean;
  setShowCrimeLayer: (show: boolean) => void;
  /** 311 requests, roads, outages, water and weather pins. Off by default so crime leads. */
  showCitySignals?: boolean;
  setShowCitySignals?: (show: boolean) => void;
  showCameras: boolean;
  setShowCameras: (show: boolean) => void;
  showSafetyCameras: boolean;
  setShowSafetyCameras: (show: boolean) => void;
  showTrafficFlow: boolean;
  setShowTrafficFlow: (show: boolean) => void;
  trafficFlowMode?: TrafficFlowMode;
  trafficSegmentCount?: number;
  trafficFlowStale?: boolean;
  trafficFlowLoading?: boolean;
  trafficFlowError?: string | null;
  isPinMode?: boolean;
  /** Drives the neighbourhood 311 key — this bar's own legend, docked to it. */
  crimeStats?: Map<string, CrimeStatEntry>;
  /** Lets the guided tour reveal nested controls without synthetic clicks. */
  tourTarget?: string;
  /** Small phones open the menu from the right rail; the page then owns it. */
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  /** Small phones: no pill, the menu opens from the rail. */
  compact?: boolean;
}

/** One overlay in the "More layers" panel. */
function OverlayRow({
  icon, label, meta, on, onToggle, tourTarget,
}: {
  icon: React.ReactNode;
  label: string;
  meta: string;
  on: boolean;
  onToggle: () => void;
  tourTarget?: string;
}) {
  return (
    <button
      type="button"
      data-tour={tourTarget}
      onClick={onToggle}
      aria-pressed={on}
      className="lv-row"
    >
      <span className="lv-row__icon" aria-hidden="true">{icon}</span>
      <span className="lv-row__text">
        <span className="lv-row__label">{label}</span>
        <span className="lv-row__meta">{meta}</span>
      </span>
      <span className="lv-switch" aria-hidden="true" />
    </button>
  );
}

/** Static pin art from the shared marker kit (no user data). */
function PinArt({ category, unverified = false, tab }: { category: keyof typeof CANVAS_CATEGORY; unverified?: boolean; tab?: string }) {
  return (
    <span
      className={category === 'emergency' ? 'lv-legend__mark lv-legend__mark--alert relative' : 'lv-legend__mark relative'}
      aria-hidden="true"
    >
      <span className="contents" dangerouslySetInnerHTML={{ __html: pinSvgMarkup(category, { unverified }) }} />
      {tab && <span className="lv-pin__tab">{tab}</span>}
    </span>
  );
}

/**
 * The map key: what each pin shape means, who it came from, and what the
 * pulses and bubbles are. Shapes are drawn by the same code as the pins, so
 * the key cannot drift from the map.
 */
export function MapLegend() {
  return (
    <div className="lv-legend" role="group" aria-label="Map key">
      <p className="lv-mlayers__section" style={{ margin: '6px 0 6px' }}>Report types</p>
      <div className="lv-legend__grid">
        {CANVAS_CATEGORY_ORDER.map((key) => (
          <span key={key} className="lv-legend__item">
            <PinArt category={key} />
            {CANVAS_CATEGORY[key].label}
          </span>
        ))}
        <span className="lv-legend__item">
          <span className="lv-legend__mark" aria-hidden="true"><span className="lv-legend__cluster"><span>4</span></span></span>
          Group of reports
        </span>
      </div>
      <div className="lv-legend__rule" />
      <p className="lv-mlayers__section" style={{ margin: '0 0 6px' }}>Where it came from</p>
      <div className="lv-legend__grid">
        <span className="lv-legend__item"><PinArt category="crime" />Neighbour report</span>
        <span className="lv-legend__item"><PinArt category="crime" unverified />Not yet confirmed</span>
        <span className="lv-legend__item"><PinArt category="infrastructure" tab="C" />City or official feed</span>
        <span className="lv-legend__item">
          <span className="lv-legend__mark" aria-hidden="true"><span className="lv-legend__pulse" /></span>
          Posted in the last hour
        </span>
      </div>
    </div>
  );
}

// Sorted numerically: Object.entries lists the integer-like key "1" first.
const HEAT_CSS = `linear-gradient(90deg, ${Object.entries(HEAT_GRADIENT)
  .sort(([a], [b]) => Number(a) - Number(b))
  .map(([stop, colour]) => `${colour} ${Math.round(Number(stop) * 100)}%`)
  .join(', ')})`;

/**
 * Map layer controls.
 *
 * The bar holds the three views people switch between constantly. Adding
 * cameras as a fourth chip pushed the row into a horizontal scroll on a phone,
 * which both looked wrong and hid whichever toggle fell off the end.
 *
 * The "Layers" chip — previously a decorative label, and hidden on mobile —
 * is now the button it always looked like. Supplementary overlays live in it,
 * so the bar keeps a fixed width at every screen size and there is somewhere
 * for the next layer to go.
 */
export default function LayerToggle({
  showLiveReports,
  setShowLiveReports,
  showHeatmap,
  setShowHeatmap,
  showCrimeLayer,
  setShowCrimeLayer,
  showCitySignals = false,
  setShowCitySignals,
  showCameras,
  setShowCameras,
  showSafetyCameras,
  setShowSafetyCameras,
  showTrafficFlow,
  setShowTrafficFlow,
  trafficFlowMode,
  trafficSegmentCount = 0,
  trafficFlowStale = false,
  trafficFlowLoading = false,
  trafficFlowError = null,
  isPinMode = false,
  crimeStats,
  tourTarget,
  menuOpen: menuOpenProp,
  onMenuOpenChange,
  compact = false,
}: LayerToggleProps) {
  const [menuOpenState, setMenuOpenState] = useState(false);
  const menuOpen = menuOpenProp ?? menuOpenState;
  const setMenuOpen = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(menuOpen) : next;
    if (onMenuOpenChange) onMenuOpenChange(value); else setMenuOpenState(value);
  };
  const wrapRef = useRef<HTMLDivElement>(null);

  /**
   * Publish this bar's real height so everything stacked above it can clear it.
   *
   * The bar is not a fixed-height object: it grows a concern-index key when the
   * crime layer is on and an overlay panel when "More layers" opens. Every
   * neighbour used to guess at it with a hardcoded rem value, and the guesses
   * were wrong in both directions — the SOS/Report column was lifted to 10.25rem
   * after the bar grew through it once already, and the map's zoom buttons still
   * sit underneath. Measuring is the only version of this that stays true.
   */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty('--cw-layerbar-h', `${el.offsetHeight}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    window.addEventListener('orientationchange', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', publish);
      document.documentElement.style.removeProperty('--cw-layerbar-h');
    };
    // Keyed on isPinMode because this component returns null during a pin
    // drop: the bar's node is unmounted and a new one is created on the way
    // back, so an effect that only ran on mount would end up observing a
    // detached element and publishing a stale height forever after.
  }, [isPinMode]);

  // Close on outside tap and on Escape — a floating panel over a draggable map
  // must never trap the user.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      // The rail's Layers button toggles the menu itself.
      if ((e.target as Element | null)?.closest?.('[data-layers-toggle]')) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    // preventDefault tells MapPage's window-level Escape handler (which skips
    // defaultPrevented events) that this press is spent on the menu.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMenuOpen(false); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (tourTarget === 'traffic-cameras') setMenuOpen(true);
    else if (tourTarget === 'layers' || tourTarget === 'camera-viewer') setMenuOpen(false);
  }, [tourTarget]);

  if (isPinMode) return null;

  /** Count of supplementary layers currently on, surfaced on the Layers chip. */
  const extrasOn = (showCitySignals ? 1 : 0) + (showCameras ? 1 : 0) + (showSafetyCameras ? 1 : 0) + (showTrafficFlow ? 1 : 0);
  const closeMenuOnTouch = () => {
    if (window.matchMedia('(max-width: 767px), (pointer: coarse)').matches) setMenuOpen(false);
  };
  const viewName = [showLiveReports && 'Reports', showHeatmap && 'Heat', showCrimeLayer && '311'].filter(Boolean).join(' + ') || 'Map only';
  const statsYear = crimeStats && crimeStats.size > 0 ? Math.max(...Array.from(crimeStats.values(), (e) => e.year || 0)) : null;

  return (
    <div
      ref={wrapRef}
      // The mobile offset derives from the sheet's measured rail (--cw-rail-h);
      // rail + 1.375rem keeps the bar just above the sheet at any rail height.
      // While the layers menu is open it lifts above the floating map buttons
      // so the panel is never half-covered on a phone.
      // Phones: bottom-left, sharing one row with Post just above the sheet
      // rail. Desktop: the centred segmented bar.
      data-compact={compact ? 'true' : undefined}
      className={`lv-layerdock absolute bottom-8 left-1/2 ${menuOpen ? 'z-[52]' : 'z-30'} w-auto max-w-[min(94vw,36rem)] -translate-x-1/2 px-1 max-lg:left-3 max-lg:translate-x-0 max-lg:px-0 max-lg:bottom-[calc(var(--cw-rail-h,66px)+0.875rem+env(safe-area-inset-bottom))]`}
    >
      {/*
        The neighbourhood 311 key, docked to the control that turns it on, so
        it moves and is measured with the bar instead of floating over the
        Report button. This is City 311 service requests, not crime.
      */}
      {showCrimeLayer && !menuOpen && (
        <div className="lv-mkey" role="group" aria-label="Neighbourhood 311 layer key">
          {!crimeStats || crimeStats.size === 0 ? (
            <div className="flex items-center gap-2.5" role="status">
              <span
                className="h-4 w-4 shrink-0 rounded-full border-[3px] border-[#1554D1] border-t-transparent motion-safe:animate-spin"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="lv-mkey__title" style={{ marginTop: 0, fontSize: 14 }}>Loading City 311 requests…</p>
                <p className="lv-mkey__eyebrow">Counting requests in each community</p>
              </div>
            </div>
          ) : (
            <>
              <p className="lv-mkey__eyebrow">City 311 requests{statsYear ? ` · ${statsYear}` : ''}</p>
              <p className="lv-mkey__title">Neighbourhood 311 layer</p>
              <div className="lv-ramp" aria-hidden="true">
                {COMMUNITY_311_RAMP.map((colour) => <span key={colour} style={{ background: colour }} />)}
              </div>
              <div className="lv-ramp-labels">
                <span>Fewer</span>
                <span>More 311 requests</span>
              </div>
              <p className="lv-mkey__note">
                Compared with most Calgary communities. Service requests, not a crime rate. Tap a community for its overview.
              </p>
            </>
          )}
        </div>
      )}

      {showHeatmap && !menuOpen && (
        <div className="lv-mkey" role="group" aria-label="Heatmap key">
          <p className="lv-mkey__eyebrow">Heatmap</p>
          <p className="lv-mkey__title">Where reports cluster</p>
          <span className="lv-ramp--heat mt-2" style={{ background: HEAT_CSS }} aria-hidden="true" />
          <div className="lv-ramp-labels">
            <span>Fewer</span>
            <span>More reports</span>
          </div>
        </div>
      )}

      {showTrafficFlow && !menuOpen && (
        <div
          className="lv-mkey"
          role="group"
          aria-label={trafficFlowMode === 'baseline' ? 'Typical road demand key' : 'Traffic flow key'}
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="lv-mkey__eyebrow">
              {trafficFlowLoading ? 'Loading roads…' : trafficFlowError && trafficSegmentCount === 0 ? 'Traffic data unavailable' : trafficFlowMode === 'baseline' ? 'Typical demand · not live' : trafficFlowStale ? 'Traffic flow · stale' : 'Traffic flow'}
            </p>
            {trafficSegmentCount > 0 && <span className="text-[12px] font-bold text-[#565A61]">{trafficSegmentCount} roads</span>}
          </div>
          {trafficFlowLoading ? (
            <div className="mt-2 grid grid-cols-4 gap-2" role="status">
              <span className="sr-only">Loading traffic roads</span>
              {[0, 1, 2, 3].map((item) => <span key={item} className="h-5 animate-pulse rounded bg-[#EAF0FC] motion-reduce:animate-none" />)}
            </div>
          ) : trafficFlowError && trafficSegmentCount === 0 ? (
            <p className="lv-mkey__note">The source could not be reached. The layer will retry automatically.</p>
          ) : (
            <div className="mt-2 grid grid-cols-4 gap-2">
              {(trafficFlowMode === 'baseline'
                ? Object.values(TRAFFIC_FLOW.baseline).slice(0, 4)
                : Object.values(TRAFFIC_FLOW.observed).slice(0, 4)
              ).map((item) => (
                <span key={item.label} className="min-w-0">
                  <svg className="h-2 w-full" viewBox="0 0 48 6" preserveAspectRatio="none" aria-hidden="true">
                    <line x1="1" y1="3" x2="47" y2="3" stroke={item.color} strokeWidth="4" strokeDasharray={item.dashArray} strokeLinecap="round" />
                  </svg>
                  <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#151515]">{item.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Supplementary layers and the map key, opened from the Layers chip.
          It floats above the bar instead of joining the measured stack, so
          opening it does not shove the zoom and Post buttons up the screen;
          the docked keys step aside while it is open. */}
      {menuOpen && (
        <div className="lv-mkey lv-mlayers lv-mlayers--float" role="group" aria-label="Additional map layers">
          <div className="lv-mlayers__head">
            <h2>Layers and key</h2>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close layers menu"
              className="lv-mlayers__close"
            >
              <X size={18} strokeWidth={2.25} />
            </button>
          </div>

          <div className="lv-mlayers__scroll">
            {/* Phones: the three views as big toggles, since the bar is one pill there. */}
            <p className="lv-mlayers__section lg:hidden">Show on the map</p>
            <div className="lv-views lg:hidden">
              <button type="button" aria-pressed={showLiveReports} onClick={() => setShowLiveReports(!showLiveReports)} className="lv-view" data-view="reports">
                <span className="lv-view__art" aria-hidden="true"><i /><i /><i /><i /></span>
                <span className="lv-view__label"><Activity size={15} strokeWidth={2.4} aria-hidden="true" />Reports</span>
                <span className="lv-view__meta">Every pin</span>
              </button>
              <button type="button" aria-pressed={showHeatmap} onClick={() => setShowHeatmap(!showHeatmap)} className="lv-view" data-view="heat">
                <span className="lv-view__art" aria-hidden="true" style={{ background: HEAT_CSS }} />
                <span className="lv-view__label"><MapIcon size={15} strokeWidth={2.4} aria-hidden="true" />Heat</span>
                <span className="lv-view__meta">Where they cluster</span>
              </button>
              <button type="button" aria-pressed={showCrimeLayer} onClick={() => setShowCrimeLayer(!showCrimeLayer)} className="lv-view" data-view="311" aria-label="Neighbourhood 311 requests layer">
                <span className="lv-view__art" aria-hidden="true">
                  {COMMUNITY_311_RAMP.slice(0, 4).map((c) => <i key={c} style={{ background: c }} />)}
                </span>
                <span className="lv-view__label"><Building2 size={15} strokeWidth={2.4} aria-hidden="true" />311</span>
                <span className="lv-view__meta">By community</span>
              </button>
            </div>
            <p className="lv-mlayers__section">More layers</p>
            <div className="space-y-0.5">
              {setShowCitySignals && (
                <OverlayRow
                  icon={<Construction size={18} strokeWidth={2} />}
                  label="City signals"
                  meta="311 requests, roads, outages, weather"
                  on={showCitySignals}
                  onToggle={() => { setShowCitySignals(!showCitySignals); closeMenuOnTouch(); }}
                />
              )}
              <OverlayRow
                icon={<Gauge size={18} strokeWidth={2} />}
                label="Traffic flow"
                meta={trafficFlowLoading ? 'Loading road segments…' : trafficFlowError && trafficSegmentCount === 0 ? 'Source temporarily unavailable' : trafficFlowMode === 'baseline'
                  ? `${trafficSegmentCount || 'City'} roads · typical demand`
                  : trafficFlowStale ? `${trafficSegmentCount} roads · update delayed` : `${trafficSegmentCount || 'Live'} road segments`}
                on={showTrafficFlow}
                onToggle={() => { setShowTrafficFlow(!showTrafficFlow); closeMenuOnTouch(); }}
              />
              <OverlayRow
                icon={<Video size={18} strokeWidth={2} />}
                label="Traffic cameras"
                tourTarget="traffic-cameras"
                meta="City of Calgary · live · zoom in"
                on={showCameras}
                onToggle={() => { setShowCameras(!showCameras); closeMenuOnTouch(); }}
              />
              <OverlayRow
                icon={<Camera size={18} strokeWidth={2} />}
                label="Safety cameras"
                meta="City data · red light and speed"
                on={showSafetyCameras}
                onToggle={() => { setShowSafetyCameras(!showSafetyCameras); closeMenuOnTouch(); }}
              />
            </div>
            <MapLegend />
          </div>
        </div>
      )}

      {/* Phone: one pill that names what the map shows and opens the views. */}
      {!compact && <button
        type="button"
        data-tour="layers"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-label={`Map view: ${viewName}. Change map view and layers`}
        className="lv-viewpill lg:hidden"
        data-active={menuOpen ? 'true' : undefined}
      >
        <span className="lv-viewpill__ico" aria-hidden="true"><Layers size={17} strokeWidth={2.3} /></span>
        <span className="lv-viewpill__text" aria-hidden="true">
          <small>Map view</small>
          <b>{viewName}</b>
        </span>
        {extrasOn > 0 && <span className="lv-seg__badge lv-viewpill__badge" aria-hidden="true">+{extrasOn}</span>}
      </button>}

      <div className="lv-layerbar max-lg:hidden">
        {/* The Layers chip opens the extra layers and the map key. */}
        <button
          type="button"
          data-tour="layers"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label="More map layers"
          data-active={menuOpen ? 'true' : undefined}
          className="lv-seg lv-seg--layers"
        >
          <Layers size={18} strokeWidth={2} className="lv-seg__icon" aria-hidden="true" />
          <span className="lv-seg__long">Layers</span>
          {extrasOn > 0 && !menuOpen && <span className="lv-seg__badge" aria-hidden="true">{extrasOn}</span>}
        </button>

        <span className="lv-seg-divider" aria-hidden="true" />

        <button type="button" aria-pressed={showLiveReports} onClick={() => setShowLiveReports(!showLiveReports)} className="lv-seg">
          <Activity size={18} strokeWidth={2} className="lv-seg__icon" aria-hidden="true" />
          <span className="lv-seg__long">Live reports</span>
          <span className="lv-seg__short">Reports</span>
        </button>

        <button type="button" aria-pressed={showHeatmap} onClick={() => setShowHeatmap(!showHeatmap)} className="lv-seg">
          <MapIcon size={18} strokeWidth={2} className="lv-seg__icon" aria-hidden="true" />
          <span className="lv-seg__long">Heatmap</span>
          <span className="lv-seg__short">Heat</span>
        </button>

        <button
          type="button"
          aria-pressed={showCrimeLayer}
          onClick={() => setShowCrimeLayer(!showCrimeLayer)}
          aria-label="Neighbourhood 311 requests layer"
          className="lv-seg"
        >
          <Building2 size={18} strokeWidth={2} className="lv-seg__icon" aria-hidden="true" />
          <span className="lv-seg__long">311 requests</span>
          <span className="lv-seg__short">311</span>
        </button>
      </div>
    </div>
  );
}
