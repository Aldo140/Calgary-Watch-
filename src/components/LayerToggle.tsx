import { useEffect, useRef, useState } from 'react';
import type { CrimeStatEntry } from '@/src/hooks/useCrimeStats';
import { Layers, Activity, Map as MapIcon, ShieldCheck, Video, Camera, Gauge, X } from 'lucide-react';
import type { TrafficFlowMode } from '@/src/types/trafficFlow';
import { TRAFFIC_FLOW } from '@/src/lib/tokens';
import { cn } from '@/src/lib/utils';

interface LayerToggleProps {
  showLiveReports: boolean;
  setShowLiveReports: (show: boolean) => void;
  showHeatmap: boolean;
  setShowHeatmap: (show: boolean) => void;
  showCrimeLayer: boolean;
  setShowCrimeLayer: (show: boolean) => void;
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
  /** Drives the concern-index key — this bar's own legend, docked to it. */
  crimeStats?: Map<string, CrimeStatEntry>;
  /** Lets the guided tour reveal nested controls without synthetic clicks. */
  tourTarget?: string;
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
      className="flex min-h-12 w-full items-center gap-3 border-[1.5px] border-transparent px-2.5 py-1.5 text-left transition-colors hover:border-[#C9D8E4] hover:bg-[#E8F3FC] active:bg-[#DCECF8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#4A90D9]"
    >
      <span
        className={cn('grid h-10 w-10 shrink-0 place-items-center transition-colors',
          on ? 'bg-[#06162F] text-[#F2EFE8]' : 'bg-[#E8F3FC] text-[#40566B]')}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#0B1F33]">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-[#52697D] md:text-[11px]">{meta}</span>
      </span>
      <span
        className={cn('relative h-5 w-9 shrink-0 transition-colors',
          on ? 'bg-[#06162F]' : 'bg-[#9FB4C6]')}
      >
        <span
          className="absolute top-0.5 h-4 w-4 bg-[#FFFDF8] transition-[left]"
          style={{ left: on ? 18 : 2 }}
        />
      </span>
    </button>
  );
}

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
}: LayerToggleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
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
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
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

  const chip =
    'flex min-h-11 shrink-0 items-center gap-1 px-2 font-mono uppercase transition-[background-color,color,transform] duration-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#4A90D9] max-lg:flex-1 max-lg:justify-center md:gap-2 md:px-4 lg:min-h-9';
  const on = 'bg-[#06162F] text-[#F2EFE8]';
  const off = 'text-[#40566B] hover:bg-[#E8F3FC]';

  /** Count of supplementary layers currently on, surfaced on the Layers chip. */
  const extrasOn = (showCameras ? 1 : 0) + (showSafetyCameras ? 1 : 0) + (showTrafficFlow ? 1 : 0);
  const closeMenuOnTouch = () => {
    if (window.matchMedia('(max-width: 767px), (pointer: coarse)').matches) setMenuOpen(false);
  };

  return (
    <div
      ref={wrapRef}
      // The mobile offset derives from the sheet's measured rail (--cw-rail-h)
      // rather than the 5.5rem it used to hardcode. That guess cleared the old
      // fixed 80px rail by a few pixels; the rail's height is now measured and
      // can vary with the masthead, and this bar sits below the sheet in the
      // stack, so a rail even slightly taller than the guess would have hidden
      // it outright. rail + 1.375rem reproduces the previous position exactly.
      className="absolute bottom-8 left-1/2 z-30 w-auto max-w-[min(94vw,34rem)] -translate-x-1/2 px-1 max-lg:bottom-[calc(var(--cw-rail-h,66px)+1.375rem+env(safe-area-inset-bottom))] max-lg:max-w-[min(94vw,21rem)]"
    >
      {/*
        The concern-index key, docked to the control that turns it on.

        It used to float free over the map, which meant choreographing it
        against the layer bar, the SOS/Report column and the camera hint — and
        it lost, sitting on top of the Report button. A legend has no business
        being a separate floating object anyway: it explains this bar's crime
        chip, so it belongs to this bar, moves with it, and is measured with it.
      */}
      {showCrimeLayer && (
        <div
          className="mb-2 border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.98)] px-3 py-2 shadow-[0_10px_28px_rgba(11,31,51,0.20)] backdrop-blur-lg"
          role="group"
          aria-label="Community concern index key"
        >
          {!crimeStats || crimeStats.size === 0 ? (
            <div className="flex items-center gap-2.5">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#2E8B7A] border-t-transparent motion-safe:animate-spin"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold text-[#0B1F33]">Building the picture…</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#52697D]">
                  Aggregating 311 across 270+ communities
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#52697D]">
                Community concern index
              </p>
              <div className="flex items-center gap-2.5">
                {([['#2E8B7A', 'Calm'], ['#D4A843', 'Elevated'], ['#EA580C', 'High'], ['#DC2626', 'Hot']] as const).map(
                  ([colour, label]) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colour, opacity: 0.85 }} aria-hidden="true" />
                      <span className="text-[10px] font-bold text-[#0B1F33]">{label}</span>
                    </span>
                  ),
                )}
              </div>
              <p className="mt-1.5 hidden text-[10px] font-medium text-[#52697D] lg:block">
                311 + community reports · tap a community for full intel
              </p>
            </>
          )}
        </div>
      )}

      {showTrafficFlow && (
        <div
          className="mb-2 border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.98)] px-3 py-2 shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg"
          role="group"
          aria-label={trafficFlowMode === 'baseline' ? 'Typical road demand key' : 'Traffic flow key'}
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#40566B]">
              {trafficFlowLoading ? 'Loading roads…' : trafficFlowError && trafficSegmentCount === 0 ? 'Traffic data unavailable' : trafficFlowMode === 'baseline' ? 'Typical demand · not live' : trafficFlowStale ? 'Traffic flow · stale' : 'Traffic flow'}
            </p>
            {trafficSegmentCount > 0 && <span className="text-[11px] font-bold text-[#52697D]">{trafficSegmentCount} roads</span>}
          </div>
          {trafficFlowLoading ? (
            <div className="mt-2 grid grid-cols-4 gap-2" role="status">
              <span className="sr-only">Loading traffic roads</span>
              {[0, 1, 2, 3].map((item) => <span key={item} className="h-5 animate-pulse bg-[#E8F3FC] motion-reduce:animate-none" />)}
            </div>
          ) : trafficFlowError && trafficSegmentCount === 0 ? (
            <p className="mt-1.5 text-[12px] leading-snug text-[#40566B]">The source could not be reached. The layer will retry automatically.</p>
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
                  <span className="mt-0.5 block truncate text-[10.5px] font-bold text-[#40566B]">{item.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Supplementary layers, opened from the Layers chip. */}
      {menuOpen && (
        <div
          className="mb-2 max-h-[min(52dvh,24rem)] overflow-y-auto border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.98)] p-2 shadow-[0_4px_8px_rgba(11,31,51,0.20)] backdrop-blur-lg"
          role="group"
          aria-label="Additional map layers"
        >
          <div className="-mx-2 -mt-2 mb-1.5 flex min-h-11 items-center justify-between bg-[#06162F] pl-3 pr-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#AFC5DF]">More layers</span>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close layers menu"
              className="grid h-11 w-11 place-items-center text-[#F2EFE8] transition-colors hover:bg-[rgba(242,239,232,0.16)] active:bg-[rgba(242,239,232,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#AFC5DF]"
            >
              <X size={13} />
            </button>
          </div>

          <div className="space-y-0.5">
            <OverlayRow
              icon={<Gauge size={15} />}
              label="Traffic flow"
              meta={trafficFlowLoading ? 'Loading road segments…' : trafficFlowError && trafficSegmentCount === 0 ? 'Source temporarily unavailable' : trafficFlowMode === 'baseline'
                ? `${trafficSegmentCount || 'City'} roads · typical demand`
                : trafficFlowStale ? `${trafficSegmentCount} roads · update delayed` : `${trafficSegmentCount || 'Live'} road segments`}
              on={showTrafficFlow}
              onToggle={() => { setShowTrafficFlow(!showTrafficFlow); closeMenuOnTouch(); }}
            />
            <OverlayRow
              icon={<Video size={15} />}
              label="Traffic cameras"
              tourTarget="traffic-cameras"
              meta="City of Calgary · live · zoom in"
              on={showCameras}
              onToggle={() => { setShowCameras(!showCameras); closeMenuOnTouch(); }}
            />
            <OverlayRow
              icon={<Camera size={15} />}
              label="Safety cameras"
              meta="57 fixed · red light and speed"
              on={showSafetyCameras}
              onToggle={() => { setShowSafetyCameras(!showSafetyCameras); closeMenuOnTouch(); }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 whitespace-nowrap border-[1.5px] border-[#0B1F33] bg-[rgba(255,253,248,0.96)] p-1.5 shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg">
        {/* The Layers chip is now the control it always looked like. */}
        <button
          type="button"
          data-tour="layers"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label="More map layers"
          className={cn(
            'relative flex min-h-11 shrink-0 items-center gap-1.5 px-2.5 transition-colors duration-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#4A90D9] md:px-3 lg:min-h-9',
            menuOpen || extrasOn > 0 ? on : off,
          )}
        >
          <Layers size={14} />
          <span className="hidden font-mono text-[10px] font-bold uppercase tracking-[0.18em] sm:inline">Layers</span>
          {extrasOn > 0 && !menuOpen && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 bg-[#2E8B7A] ring-2 ring-[rgba(255,253,248,0.96)]" />
          )}
        </button>

        <span className="h-6 w-px shrink-0 bg-[#C9D8E4]" aria-hidden="true" />

        <button type="button" aria-pressed={showLiveReports} onClick={() => setShowLiveReports(!showLiveReports)} className={cn(chip, showLiveReports ? on : off)}>
          <Activity size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] font-bold tracking-[0.1em] md:text-[11px]">Live</span>
          <span className="hidden font-bold text-[11px] tracking-[0.1em] md:inline">&nbsp;Reports</span>
        </button>

        <button type="button" aria-pressed={showHeatmap} onClick={() => setShowHeatmap(!showHeatmap)} className={cn(chip, showHeatmap ? on : off)}>
          <MapIcon size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] font-bold tracking-[0.1em] md:text-[11px]">Heatmap</span>
        </button>

        <button type="button" aria-pressed={showCrimeLayer} onClick={() => setShowCrimeLayer(!showCrimeLayer)} className={cn(chip, showCrimeLayer ? on : off)}>
          <ShieldCheck size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] font-bold tracking-[0.1em] md:text-[11px]">Crime</span>
          <span className="hidden font-bold text-[11px] tracking-[0.1em] md:inline">&nbsp;Stats</span>
        </button>
      </div>
    </div>
  );
}
