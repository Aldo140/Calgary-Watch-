import { useEffect, useRef, useState } from 'react';
import { Layers, Activity, Map as MapIcon, ShieldCheck, Video, Camera, X } from 'lucide-react';
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
  isPinMode?: boolean;
}

/** One overlay in the "More layers" panel. */
function OverlayRow({
  icon, label, meta, on, onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  meta: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[#E8F3FC]"
    >
      <span
        className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors',
          on ? 'bg-[#286FAF] text-[#F7FBFF]' : 'bg-[#E8F3FC] text-[#40566B]')}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold text-[#0B1F33]">{label}</span>
        <span className="block text-[10.5px] text-[#52697D]">{meta}</span>
      </span>
      <span
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors',
          on ? 'bg-[#286FAF]' : 'bg-[#C9D8E4]')}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]"
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
  isPinMode = false,
}: LayerToggleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  if (isPinMode) return null;

  const chip =
    'flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 transition-[background-color,color,transform] active:scale-[0.98] max-lg:flex-1 max-lg:justify-center md:gap-2 md:px-4';
  const on = 'bg-[#286FAF] text-[#F7FBFF]';
  const off = 'text-[#40566B] hover:bg-[#E8F3FC]';

  /** Count of supplementary layers currently on, surfaced on the Layers chip. */
  const extrasOn = (showCameras ? 1 : 0) + (showSafetyCameras ? 1 : 0);

  return (
    <div
      ref={wrapRef}
      data-tour="layers"
      className="absolute bottom-8 left-1/2 z-30 w-auto max-w-[min(94vw,34rem)] -translate-x-1/2 px-1 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-lg:max-w-[min(94vw,21rem)]"
    >
      {/* Supplementary layers, opened from the Layers chip. */}
      {menuOpen && (
        <div
          className="mb-2 rounded-2xl border border-[#C9D8E4] bg-[rgba(248,250,252,0.98)] p-2 shadow-[0_10px_28px_rgba(11,31,51,0.20)] backdrop-blur-lg"
          role="group"
          aria-label="Additional map layers"
        >
          <div className="flex items-center justify-between px-2 pb-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#40566B]">More layers</span>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close layers menu"
              className="grid h-6 w-6 place-items-center rounded-lg text-[#52697D] hover:bg-[#E8F3FC]"
            >
              <X size={13} />
            </button>
          </div>

          <div className="space-y-0.5">
            <OverlayRow
              icon={<Video size={15} />}
              label="Traffic cameras"
              meta="City of Calgary · live · zoom in"
              on={showCameras}
              onToggle={() => setShowCameras(!showCameras)}
            />
            <OverlayRow
              icon={<Camera size={15} />}
              label="Safety cameras"
              meta="57 fixed · red light and speed"
              on={showSafetyCameras}
              onToggle={() => setShowSafetyCameras(!showSafetyCameras)}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 whitespace-nowrap rounded-2xl border border-[#C9D8E4] bg-[rgba(248,250,252,0.96)] p-1.5 shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg">
        {/* The Layers chip is now the control it always looked like. */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label="More map layers"
          className={cn(
            'relative flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 transition-colors active:scale-[0.98] md:px-3',
            menuOpen || extrasOn > 0 ? on : off,
          )}
        >
          <Layers size={14} />
          <span className="hidden text-[10px] font-black uppercase tracking-widest sm:inline md:text-[10px]">Layers</span>
          {extrasOn > 0 && !menuOpen && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#2E8B7A] ring-2 ring-[rgba(248,250,252,0.96)]" />
          )}
        </button>

        <span className="h-6 w-px shrink-0 bg-[#C9D8E4]" aria-hidden="true" />

        <button type="button" onClick={() => setShowLiveReports(!showLiveReports)} className={cn(chip, showLiveReports ? on : off)}>
          <Activity size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] md:text-xs font-bold max-lg:tracking-tight">Live</span>
          <span className="hidden md:inline font-bold text-xs"> Reports</span>
        </button>

        <button type="button" onClick={() => setShowHeatmap(!showHeatmap)} className={cn(chip, showHeatmap ? on : off)}>
          <MapIcon size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] md:text-xs font-bold">Heatmap</span>
        </button>

        <button type="button" onClick={() => setShowCrimeLayer(!showCrimeLayer)} className={cn(chip, showCrimeLayer ? on : off)}>
          <ShieldCheck size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] md:text-xs font-bold">Crime</span>
          <span className="hidden md:inline font-bold text-xs"> Stats</span>
        </button>
      </div>
    </div>
  );
}
