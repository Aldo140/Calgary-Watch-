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
}

export default function LayerToggle({ showLiveReports, setShowLiveReports, showHeatmap, setShowHeatmap, showCrimeLayer, setShowCrimeLayer, isPinMode = false }: LayerToggleProps) {
  if (isPinMode) return null;
  return (
    <div className="absolute left-1/2 z-30 w-auto max-w-[min(94vw,22rem)] max-lg:max-w-[min(94vw,20rem)] -translate-x-1/2 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-lg:px-1 md:max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] bottom-20 md:bottom-8">
      <Card className="flex items-center gap-0.5 max-lg:gap-1 p-1 max-lg:p-1.5 md:gap-2 md:p-1.5 bg-black/55 max-lg:border-amber-500/15 max-lg:shadow-[0_8px_32px_rgba(0,0,0,0.45)] light:bg-white/95 backdrop-blur-2xl border-white/10 light:border-slate-300 shadow-2xl max-lg:rounded-[1.35rem] rounded-2xl whitespace-nowrap overflow-x-auto no-scrollbar">
        <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 border-r border-white/10 max-lg:hidden">
          <Layers size={14} className="text-blue-400 light:text-slate-900" />
          <span className="text-[9px] font-bold text-white uppercase tracking-widest">Layers</span>
        </div>

        <button
          type="button"
          onClick={() => setShowLiveReports(!showLiveReports)}
          className={cn(
            'layer-chip flex items-center gap-1.5 md:gap-2 px-3 max-lg:px-3 py-2 rounded-xl transition-all shrink-0 max-lg:flex-1 max-lg:justify-center md:px-4',
            showLiveReports ? 'layer-chip-selected bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-white/5 light:text-slate-700 light:hover:bg-slate-100'
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
            showHeatmap ? 'layer-chip-selected bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-white/5 light:text-slate-700 light:hover:bg-slate-100'
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
              ? 'layer-chip-selected bg-blue-500 text-white shadow-lg shadow-blue-500/20'
              : 'text-slate-400 hover:bg-white/5 light:text-slate-700 light:hover:bg-slate-100'
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
