import { useState, useEffect, useMemo, useRef, RefObject } from 'react';
import { Drawer } from 'vaul';
import { Search, X, MapPin, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Incident, IncidentCategory, CATEGORY_ICONS } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { MapRef } from '@/src/components/Map';

const SNAP_POINTS = ['80px', 0.38, 0.82] as const;
type SnapPoint = (typeof SNAP_POINTS)[number];

const CATEGORY_OPTIONS: (IncidentCategory | 'all')[] = [
  'all', 'crime', 'traffic', 'infrastructure', 'weather', 'emergency',
];

const CATEGORY_COLORS: Record<IncidentCategory | 'all', string> = {
  all:            'bg-slate-700 text-white',
  crime:          'bg-red-500/20 text-red-300 border-red-500/30',
  traffic:        'bg-amber-500/20 text-amber-300 border-amber-500/30',
  infrastructure: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  weather:        'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  emergency:      'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

function getNeighborhoodCenter(
  incidents: Incident[],
  name: string
): { lat: number; lng: number } | null {
  const matching = incidents.filter(i => i.neighborhood === name && isFinite(i.lat) && isFinite(i.lng));
  if (!matching.length) return null;
  return {
    lat: matching.reduce((s, i) => s + i.lat, 0) / matching.length,
    lng: matching.reduce((s, i) => s + i.lng, 0) / matching.length,
  };
}

interface MobileMapSheetProps {
  incidents: Incident[];
  selectedCategory: IncidentCategory | 'all';
  onCategoryChange: (cat: IncidentCategory | 'all') => void;
  onIncidentClick: (incident: Incident) => void;
  liveCount: number;
  mapRef: RefObject<MapRef | null>;
  isPinMode: boolean;
  theme?: 'dark' | 'light';
}

export default function MobileMapSheet({
  incidents,
  selectedCategory,
  onCategoryChange,
  onIncidentClick,
  liveCount,
  mapRef,
  isPinMode,
  theme = 'dark',
}: MobileMapSheetProps) {
  const [snap, setSnap] = useState<SnapPoint>('80px');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isPinMode) {
      setSnap('80px');
      setSearch('');
    }
  }, [isPinMode]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const neighborhoods = useMemo(() => {
    const seen = new Set<string>();
    for (const i of incidents) if (i.neighborhood) seen.add(i.neighborhood);
    return [...seen].sort();
  }, [incidents]);

  const neighborhoodResults = useMemo(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) return [];
    const q = debouncedSearch.toLowerCase();
    return neighborhoods.filter(n => n.toLowerCase().includes(q)).slice(0, 3);
  }, [debouncedSearch, neighborhoods]);

  const filteredIncidents = useMemo(() => {
    let list = incidents.filter(i => !i.deleted);
    if (selectedCategory !== 'all') {
      list = list.filter(i => i.category === selectedCategory || i.category === 'emergency');
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        i =>
          i.title.toLowerCase().includes(q) ||
          i.neighborhood.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.timestamp - a.timestamp).slice(0, 60);
  }, [incidents, selectedCategory, debouncedSearch]);

  const handleNeighborhoodSelect = (name: string) => {
    const center = getNeighborhoodCenter(incidents, name);
    if (center) {
      mapRef.current?.flyTo(center.lat, center.lng, 14);
    }
    setSearch('');
    setSnap('80px');
  };

  const handleIncidentSelect = (incident: Incident) => {
    onIncidentClick(incident);
    setSnap('80px');
  };

  const isExpanded = snap === 0.82;
  const isPeek = snap === 0.38;
  const isCollapsed = snap === '80px';

  return (
    <Drawer.Root
      snapPoints={[...SNAP_POINTS] as (string | number)[]}
      activeSnapPoint={snap}
      setActiveSnapPoint={(s) => setSnap(s as SnapPoint)}
      modal={false}
      dismissible={false}
      open={!isPinMode}
    >
      <Drawer.Portal>
        <Drawer.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-[50] flex flex-col rounded-t-[1.6rem] outline-none lg:hidden',
            'transition-colors duration-200',
            theme === 'light'
              ? 'bg-white border-t border-slate-200 shadow-[0_-8px_32px_rgba(0,0,0,0.10)]'
              : 'bg-slate-950 border-t border-white/10 shadow-[0_-8px_32px_rgba(0,0,0,0.45)]'
          )}
          style={{ maxHeight: '85vh' }}
        >
          <Drawer.Title className="sr-only">Incidents</Drawer.Title>
          <Drawer.Description className="sr-only">Browse and search nearby Calgary incidents</Drawer.Description>

          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className={cn(
              'w-10 h-1 rounded-full',
              theme === 'light' ? 'bg-slate-300' : 'bg-slate-700'
            )} />
          </div>

          {isCollapsed && (
            <div
              className="flex items-center justify-between px-4 py-2 cursor-pointer"
              onClick={() => setSnap(0.38)}
            >
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center w-2 h-2">
                  <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
                  <div className="relative w-2 h-2 rounded-full bg-green-500" />
                </div>
                <span className={cn(
                  'text-xs font-black uppercase tracking-widest',
                  theme === 'light' ? 'text-slate-700' : 'text-slate-300'
                )}>
                  {liveCount} live report{liveCount !== 1 ? 's' : ''}
                </span>
              </div>
              <span className="text-[10px] font-bold text-slate-500">
                Tap to view
              </span>
            </div>
          )}

          {(isPeek || isExpanded) && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="px-3 pb-2 shrink-0">
                <div className={cn(
                  'flex items-center gap-2 rounded-2xl px-3 py-2.5 border',
                  theme === 'light'
                    ? 'bg-slate-100 border-slate-200'
                    : 'bg-white/5 border-white/10'
                )}>
                  <Search size={15} className="text-slate-500 shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={e => {
                      setSearch(e.target.value);
                      if (!isExpanded) setSnap(0.38);
                    }}
                    onFocus={() => { if (isCollapsed) setSnap(0.38); }}
                    placeholder="Search reports or neighborhoods…"
                    className={cn(
                      'flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-500 min-w-0',
                      theme === 'light' ? 'text-slate-900' : 'text-white'
                    )}
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="px-3 pb-2 shrink-0">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {CATEGORY_OPTIONS.map(cat => (
                    <button
                      key={cat}
                      onClick={() => onCategoryChange(cat)}
                      className={cn(
                        'shrink-0 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors',
                        selectedCategory === cat
                          ? theme === 'light'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-900 border-white'
                          : theme === 'light'
                            ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            : cn('border', CATEGORY_COLORS[cat], 'bg-transparent')
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <AnimatePresence>
                  {neighborhoodResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-2"
                    >
                      {neighborhoodResults.map(name => (
                        <button
                          key={name}
                          onClick={() => handleNeighborhoodSelect(name)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-colors',
                            theme === 'light'
                              ? 'bg-blue-50 hover:bg-blue-100 border border-blue-200'
                              : 'bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20'
                          )}
                        >
                          <MapPin size={14} className="text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <p className={cn(
                              'text-xs font-black',
                              theme === 'light' ? 'text-slate-900' : 'text-white'
                            )}>{name}</p>
                            <p className="text-[10px] text-slate-500">Fly to area</p>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-slate-500">
                  {filteredIncidents.length === 0
                    ? 'No reports found'
                    : `${filteredIncidents.length} report${filteredIncidents.length !== 1 ? 's' : ''}`}
                </p>

                {filteredIncidents.map(incident => {
                  const CategoryIcon = CATEGORY_ICONS[incident.category] ?? CATEGORY_ICONS.crime;
                  return (
                    <button
                      key={incident.id}
                      onClick={() => handleIncidentSelect(incident)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1.5 text-left border transition-colors active:scale-[0.99]',
                        theme === 'light'
                          ? 'bg-white border-slate-200 hover:bg-slate-50'
                          : 'bg-white/[0.04] border-white/8 hover:bg-white/[0.07]'
                      )}
                    >
                      <div className={cn(
                        'shrink-0 w-8 h-8 rounded-xl flex items-center justify-center',
                        incident.category === 'emergency' ? 'bg-orange-500/20 text-orange-400' :
                        incident.category === 'crime'     ? 'bg-red-500/20 text-red-400'      :
                        incident.category === 'traffic'   ? 'bg-amber-500/20 text-amber-400'  :
                        incident.category === 'weather'   ? 'bg-cyan-500/20 text-cyan-400'    :
                                                            'bg-blue-500/20 text-blue-400'
                      )}>
                        <CategoryIcon size={14} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'text-xs font-black truncate',
                          theme === 'light' ? 'text-slate-900' : 'text-white'
                        )}>{incident.title}</p>
                        <p className="text-[10px] truncate text-slate-500">{incident.neighborhood}</p>
                      </div>

                      <div className="shrink-0 flex items-center gap-1 text-slate-500">
                        <Clock size={10} />
                        <span className="text-[9px] font-bold">
                          {formatDistanceToNow(incident.timestamp, { addSuffix: false })}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
