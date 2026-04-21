import { Card } from '@/src/components/ui/Card';
import { Layers, Radio, Activity, Map as MapIcon, ShieldCheck } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface LayerToggleProps {
  showLiveReports: boolean;
  setShowLiveReports: (show: boolean) => void;
  showHeatmap: boolean;
  setShowHeatmap: (show: boolean) => void;
  showCrimeLayer: boolean;
  setShowCrimeLayer: (show: boolean) => void;
  isPinMode?: boolean;
  theme?: 'dark' | 'light';
}

export default function LayerToggle({ 
  showLiveReports, 
  setShowLiveReports, 
  showHeatmap, 
  setShowHeatmap, 
  showCrimeLayer, 
  setShowCrimeLayer, 
  isPinMode = false,
  theme = 'dark'
}: LayerToggleProps) {
  const dark = theme !== 'light';

  if (isPinMode) return null;
  return (
    <div className="absolute left-1/2 z-30 w-auto max-w-[min(94vw,22rem)] max-lg:max-w-[min(94vw,20rem)] -translate-x-1/2 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-lg:px-1 md:max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] bottom-20 md:bottom-8">
      <Card 
        theme={theme}
        className={cn(
          "flex items-center gap-0.5 max-lg:gap-1 p-1 max-lg:p-1.5 md:gap-2 md:p-1.5 max-lg:rounded-[1.35rem] rounded-2xl whitespace-nowrap overflow-x-auto no-scrollbar shadow-2xl",
          dark 
            ? 'bg-black/55 max-lg:border-amber-500/15 max-lg:shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-2xl border-white/10' 
            : 'bg-[rgba(255,250,243,0.94)] max-lg:border-stone-200/80'
        )}
      >
        <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 max-lg:hidden"
          style={{borderRight: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(120,113,108,0.2)'}}>
          <Layers size={14} className={dark ? "text-blue-400" : "text-slate-700"} />
          <span className={cn("text-[9px] font-bold uppercase tracking-widest", dark ? "text-white" : "text-slate-800")}>Layers</span>
        </div>

        <button
          type="button"
          onClick={() => setShowLiveReports(!showLiveReports)}
          className={cn(
            'layer-chip flex items-center gap-1.5 md:gap-2 px-3 max-lg:px-3 py-2 rounded-xl transition-all shrink-0 max-lg:flex-1 max-lg:justify-center md:px-4',
            showLiveReports 
              ? 'layer-chip-selected bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
              : dark
                ? 'text-slate-400 hover:bg-white/5'
                : 'text-slate-700 hover:bg-slate-100'
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
            'layer-chip flex items-center gap-1.5 md:gap-2 px-3 max-lg:px-3 py-2 rounded-xl transition-all shrink-0 max-lg:flex-1 max-lg:justify-center md:px-4',
            showHeatmap 
              ? 'layer-chip-selected bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
              : dark
                ? 'text-slate-400 hover:bg-white/5'
                : 'text-slate-700 hover:bg-slate-100'
          )}
        >
          <MapIcon size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] md:text-xs font-bold">Heatmap</span>
        </button>

        <button
          type="button"
          onClick={() => setShowCrimeLayer(!showCrimeLayer)}
          className={cn(
            'layer-chip flex items-center gap-1.5 md:gap-2 px-3 max-lg:px-3 py-2 rounded-xl transition-all shrink-0 max-lg:flex-1 max-lg:justify-center md:px-4',
            showCrimeLayer
              ? 'layer-chip-selected bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : dark
                ? 'text-slate-400 hover:bg-white/5'
                : 'text-slate-700 hover:bg-slate-100'
          )}
        >
          <ShieldCheck size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] md:text-xs font-bold">Crime</span>
          <span className="hidden md:inline font-bold text-xs"> Stats</span>
        </button>
      </Card>
    </div>
  );
}
