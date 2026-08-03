import { Card } from '@/src/components/ui/Card';
import { Layers, Activity, Map as MapIcon, ShieldCheck, Zap } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { OutageGroup } from '@/src/types/powerOutage';
import { OUTAGE_GROUP_STYLES } from '@/src/lib/powerOutages';

/** Sub-filter chips shown while the power-outage layer is on. */
const OUTAGE_SUBFILTERS: { group: OutageGroup; short: string }[] = [
  { group: 'active_unplanned', short: 'Unplanned' },
  { group: 'active_planned', short: 'Planned' },
  { group: 'upcoming_planned', short: 'Upcoming' },
];

interface LayerToggleProps {
  showLiveReports: boolean;
  setShowLiveReports: (show: boolean) => void;
  showHeatmap: boolean;
  setShowHeatmap: (show: boolean) => void;
  showCrimeLayer: boolean;
  setShowCrimeLayer: (show: boolean) => void;
  /** Master switch for the official ENMAX outage layer. */
  showPowerOutages: boolean;
  setShowPowerOutages: (show: boolean) => void;
  /** Which outage classifications are drawn while the layer is on. */
  outageGroupFilter: Record<OutageGroup, boolean>;
  onToggleOutageGroup: (group: OutageGroup) => void;
  isPinMode?: boolean;
}

export default function LayerToggle({
  showLiveReports,
  setShowLiveReports,
  showHeatmap,
  setShowHeatmap,
  showCrimeLayer,
  setShowCrimeLayer,
  showPowerOutages,
  setShowPowerOutages,
  outageGroupFilter,
  onToggleOutageGroup,
  isPinMode = false
}: LayerToggleProps) {
  if (isPinMode) return null;
  return (
    <div data-tour="layers" className="absolute left-1/2 z-30 w-auto max-w-[min(94vw,22rem)] max-lg:max-w-[min(94vw,20rem)] -translate-x-1/2 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-lg:px-1 md:max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] bottom-20 md:bottom-8">
      <Card
        className="flex flex-col gap-1 p-1 max-lg:p-1.5 md:p-1.5 max-lg:rounded-[1.35rem] rounded-2xl shadow-2xl bg-[rgba(255,250,243,0.94)] max-lg:border-stone-200/80"
      >
      <div className="flex items-center gap-0.5 max-lg:gap-1 md:gap-2 whitespace-nowrap overflow-x-auto no-scrollbar">
        <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 max-lg:hidden"
          style={{ borderRight: '1px solid rgba(120,113,108,0.2)' }}>
          <Layers size={14} className="text-slate-700" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-800">Layers</span>
        </div>

        <button
          type="button"
          onClick={() => setShowLiveReports(!showLiveReports)}
          className={cn(
            'layer-chip flex items-center gap-1.5 md:gap-2 px-3 max-lg:px-3 py-2 rounded-xl transition-all shrink-0 max-lg:flex-1 max-lg:justify-center md:px-4',
            showLiveReports
              ? 'layer-chip-selected bg-blue-600 text-white shadow-lg shadow-blue-600/20'
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
              : 'text-slate-700 hover:bg-slate-100'
          )}
        >
          <ShieldCheck size={14} className="max-lg:shrink-0" />
          <span className="text-[10px] md:text-xs font-bold">Crime</span>
          <span className="hidden md:inline font-bold text-xs"> Stats</span>
        </button>
      </div>

      {/* Official third-party data gets its own row. Row 1 was already at the
          edge of its max-width with three chips — adding a fourth pushed it
          into the hidden horizontal scroll area, where nobody could find it. */}
      <button
        type="button"
        onClick={() => setShowPowerOutages(!showPowerOutages)}
        aria-pressed={showPowerOutages}
        aria-label="Toggle official ENMAX power outages layer"
        className={cn(
          'layer-chip flex w-full items-center justify-center gap-1.5 md:gap-2 px-3 py-2 rounded-xl transition-all',
          showPowerOutages
            ? 'layer-chip-selected bg-blue-600 text-white shadow-lg shadow-blue-600/20'
            : 'text-slate-700 hover:bg-slate-100'
        )}
      >
        <Zap size={14} className="shrink-0" />
        <span className="text-[10px] md:text-xs font-bold">Power Outages</span>
        <span
          className={cn(
            'text-[8px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-md',
            showPowerOutages ? 'bg-white/20 text-white' : 'bg-stone-200/70 text-slate-600'
          )}
        >
          ENMAX
        </span>
      </button>

      {/* Outage sub-filters — only meaningful while the layer is on. */}
      {showPowerOutages && (
        <div
          role="group"
          aria-label="Power outage type filters"
          className="flex items-center gap-1 px-0.5 pb-0.5 whitespace-nowrap overflow-x-auto no-scrollbar"
        >
          {OUTAGE_SUBFILTERS.map(({ group, short }) => {
            const style = OUTAGE_GROUP_STYLES[group];
            const enabled = outageGroupFilter[group];
            return (
              <button
                key={group}
                type="button"
                onClick={() => onToggleOutageGroup(group)}
                aria-pressed={enabled}
                aria-label={`Show ${style.description} outages`}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all shrink-0 flex-1 justify-center',
                  enabled
                    ? 'bg-white border-stone-300 text-slate-800 shadow-sm'
                    : 'bg-transparent border-stone-200 text-slate-400'
                )}
              >
                <span
                  className="h-2 w-2 rounded-[2px] shrink-0"
                  style={
                    style.shape === 'dashed'
                      ? { border: `1.5px dashed ${style.color}`, background: '#fff' }
                      : style.shape === 'ringed'
                        ? { background: style.color, boxShadow: 'inset 0 0 0 1px #fff' }
                        : { background: style.color }
                  }
                  aria-hidden="true"
                />
                <span className="text-[9.5px] md:text-[10px] font-bold">{short}</span>
              </button>
            );
          })}
        </div>
      )}
      </Card>
    </div>
  );
}
