import { Layers, Activity, Map as MapIcon, ShieldCheck } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface LayerToggleProps {
  showLiveReports: boolean;
  setShowLiveReports: (show: boolean) => void;
  showHeatmap: boolean;
  setShowHeatmap: (show: boolean) => void;
  showCrimeLayer: boolean;
  setShowCrimeLayer: (show: boolean) => void;
  isPinMode?: boolean;
}

export default function LayerToggle({
  showLiveReports,
  setShowLiveReports,
  showHeatmap,
  setShowHeatmap,
  showCrimeLayer,
  setShowCrimeLayer,
  isPinMode = false
}: LayerToggleProps) {
  if (isPinMode) return null;
  return (
    <div data-tour="layers" className="absolute bottom-8 left-1/2 z-30 w-auto max-w-[min(94vw,22rem)] -translate-x-1/2 px-1 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-lg:max-w-[min(94vw,20rem)]">
      <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap rounded-2xl border border-[#C9D8E4] bg-[rgba(248,250,252,0.96)] p-1.5 shadow-[0_4px_8px_rgba(11,31,51,0.14)] backdrop-blur-lg no-scrollbar">
        <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 max-lg:hidden"
          style={{ borderRight: '1px solid #C9D8E4' }}>
          <Layers size={14} className="text-[#52697D]" />
          <span className="text-[9px] font-black uppercase tracking-widest text-[#40566B]">Layers</span>
        </div>

        <button
          type="button"
          onClick={() => setShowLiveReports(!showLiveReports)}
          className={cn(
            'flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 transition-[background-color,color,transform] active:scale-[0.98] max-lg:flex-1 max-lg:justify-center md:gap-2 md:px-4',
            showLiveReports
              ? 'bg-[#286FAF] text-[#F7FBFF]'
              : 'text-[#40566B] hover:bg-[#E8F3FC]'
          )}
        >
          <Activity size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] md:text-xs font-bold max-lg:tracking-tight">Live</span>
          <span className="hidden md:inline font-bold text-xs"> Reports</span>
        </button>

        <button
          type="button"
          onClick={() => setShowHeatmap(!showHeatmap)}
          className={cn(
            'flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 transition-[background-color,color,transform] active:scale-[0.98] max-lg:flex-1 max-lg:justify-center md:gap-2 md:px-4',
            showHeatmap
              ? 'bg-[#286FAF] text-[#F7FBFF]'
              : 'text-[#40566B] hover:bg-[#E8F3FC]'
          )}
        >
          <MapIcon size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] md:text-xs font-bold">Heatmap</span>
        </button>

        <button
          type="button"
          onClick={() => setShowCrimeLayer(!showCrimeLayer)}
          className={cn(
            'flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 transition-[background-color,color,transform] active:scale-[0.98] max-lg:flex-1 max-lg:justify-center md:gap-2 md:px-4',
            showCrimeLayer
              ? 'bg-[#286FAF] text-[#F7FBFF]'
              : 'text-[#40566B] hover:bg-[#E8F3FC]'
          )}
        >
          <ShieldCheck size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] md:text-xs font-bold">Crime</span>
          <span className="hidden md:inline font-bold text-xs"> Stats</span>
        </button>
      </div>
    </div>
  );
}
