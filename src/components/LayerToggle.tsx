import { Card } from '@/src/components/ui/Card';
import { Layers, Radio, Activity, Map as MapIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface LayerToggleProps {
  showLiveReports: boolean;
  setShowLiveReports: (show: boolean) => void;
  showHeatmap: boolean;
  setShowHeatmap: (show: boolean) => void;
}

export default function LayerToggle({ showLiveReports, setShowLiveReports, showHeatmap, setShowHeatmap }: LayerToggleProps) {
  return (
    <div className="absolute bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-30 w-auto max-w-[90vw]">
      <Card className="flex items-center gap-1 md:gap-2 p-1 md:p-1.5 bg-slate-950/80 backdrop-blur-2xl border-white/10 shadow-2xl rounded-2xl whitespace-nowrap overflow-x-auto no-scrollbar">
        <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 border-r border-white/10">
          <Layers size={14} className="text-blue-400" />
          <span className="text-[9px] font-bold text-white uppercase tracking-widest">Layers</span>
        </div>

        <button
          onClick={() => setShowLiveReports(!showLiveReports)}
          className={cn(
            'flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-xl transition-all shrink-0',
            showLiveReports ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-white/5'
          )}
        >
          <Activity size={14} />
          <span className="text-[10px] md:text-xs font-bold">Live Reports</span>
        </button>

        <button
          onClick={() => setShowHeatmap(!showHeatmap)}
          className={cn(
            'flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-xl transition-all shrink-0',
            showHeatmap ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-white/5'
          )}
        >
          <MapIcon size={14} />
          <span className="text-[10px] md:text-xs font-bold">Heatmap</span>
        </button>
      </Card>
    </div>
  );
}
