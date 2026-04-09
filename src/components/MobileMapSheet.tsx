import { useState, useEffect, useMemo, useRef, RefObject, useCallback } from 'react';
import { Drawer } from 'vaul';
import {
  Search, X, MapPin, Clock, Layers, Siren, AlertCircle, Car, Construction,
  CloudRain, Activity, User, ChevronDown, Plus,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Incident, IncidentCategory, CATEGORY_ICONS, STATUS_ICONS } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { MapRef } from '@/src/components/Map';
import { useNeighborhoodPulse, RISK_CONFIG } from '@/src/hooks/useNeighborhoodPulse';

export const SNAP_POINTS = ['80px', 0.38, 0.82] as const;
export type SnapPoint = (typeof SNAP_POINTS)[number];

const SORT_KEY = 'cw_sortBy';
const VERIFIED_KEY = 'cw_verifiedOnly';
const RECENT_KEY = 'cw_recentOnly';

type SortBy = 'newest' | 'oldest' | 'verified';

const CATEGORY_OPTIONS = [
  { id: 'all' as const,            label: 'All',     Icon: Layers       },
  { id: 'emergency' as const,      label: 'SOS',     Icon: Siren        },
  { id: 'crime' as const,          label: 'Crime',   Icon: AlertCircle  },
  { id: 'traffic' as const,        label: 'Traffic', Icon: Car          },
  { id: 'infrastructure' as const, label: 'Infra',   Icon: Construction },
  { id: 'weather' as const,        label: 'Weather', Icon: CloudRain    },
] as const;

function getReporterDisplay(incident: Incident) {
  const rawName = incident.name?.trim() || 'Community Member';
  const anonymous = Boolean(incident.anonymous) || rawName.toLowerCase() === 'anonymous' || rawName.toLowerCase().includes('anonymous');
  const firstName = anonymous ? 'Anonymous' : (rawName.split(/\s+/)[0] || 'Community');
  const initial = firstName.charAt(0).toUpperCase() || 'C';
  return { anonymous, firstName, initial };
}

function getNeighborhoodCenter(
  incidents: Incident[],
  name: string,
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
  snap: SnapPoint;
  setSnap: (s: SnapPoint) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onReportPress: () => void;
  activeIncidentId?: string | null;
}

export default function MobileMapSheet({
  incidents,
  selectedCategory,
  onCategoryChange,
  liveCount,
  mapRef,
  isPinMode,
  theme = 'dark',
  snap,
  setSnap,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onReportPress,
  activeIncidentId,
}: MobileMapSheetProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeCardRef = useRef<HTMLButtonElement | null>(null);

  const isExpanded = snap === 0.82;
  const isPeek    = snap === 0.38;
  const isCollapsed = snap === '80px';
  const isOpen = isPeek || isExpanded;

  // Persist/restore filter prefs (same localStorage keys as desktop Sidebar)
  useEffect(() => {
    try {
      const s = localStorage.getItem(SORT_KEY);
      if (s === 'newest' || s === 'oldest' || s === 'verified') setSortBy(s);
      if (localStorage.getItem(VERIFIED_KEY) === 'true') setVerifiedOnly(true);
      if (localStorage.getItem(RECENT_KEY) === 'true') setRecentOnly(true);
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem(SORT_KEY, sortBy); } catch {} }, [sortBy]);
  useEffect(() => { try { localStorage.setItem(VERIFIED_KEY, String(verifiedOnly)); } catch {} }, [verifiedOnly]);
  useEffect(() => { try { localStorage.setItem(RECENT_KEY, String(recentOnly)); } catch {} }, [recentOnly]);

  // Collapse + clear when pin mode activates
  useEffect(() => {
    if (isPinMode) {
      setSnap('80px');
      setSearch('');
    }
  }, [isPinMode, setSnap]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const neighborhoodPulse = useNeighborhoodPulse(incidents);

  // Neighborhood search results
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

  // Filtered + sorted incidents (matches desktop logic exactly)
  const filteredIncidents = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    return incidents
      .filter(i => !i.deleted)
      .filter(i => selectedCategory === 'all' || i.category === selectedCategory)
      .filter(i => !verifiedOnly || i.verified_status === 'community_confirmed')
      .filter(i => !recentOnly || (Date.now() - i.timestamp) <= 2 * 60 * 60 * 1000)
      .filter(i =>
        !q ||
        i.title.toLowerCase().includes(q) ||
        (i.neighborhood || '').toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        if (a.category === 'emergency' && b.category !== 'emergency') return -1;
        if (b.category === 'emergency' && a.category !== 'emergency') return 1;
        if (sortBy === 'newest') return b.timestamp - a.timestamp;
        if (sortBy === 'oldest') return a.timestamp - b.timestamp;
        if (sortBy === 'verified') {
          const score: Record<string, number> = { community_confirmed: 3, multiple_reports: 2, pending_review: 1, unverified: 0 };
          return (score[b.verified_status] ?? 0) - (score[a.verified_status] ?? 0);
        }
        return 0;
      });
  }, [incidents, selectedCategory, verifiedOnly, recentOnly, debouncedSearch, sortBy]);

  // Peek shows top 5 by recency from filtered list; expanded shows all
  const visibleIncidents = isPeek ? filteredIncidents.slice(0, 5) : filteredIncidents;

  const hasActiveFilters = verifiedOnly || recentOnly || !!search || selectedCategory !== 'all';

  const clearAllFilters = useCallback(() => {
    setVerifiedOnly(false);
    setRecentOnly(false);
    setSearch('');
    onCategoryChange('all');
  }, [onCategoryChange]);

  const handleNeighborhoodSelect = useCallback((name: string) => {
    const center = getNeighborhoodCenter(incidents, name);
    if (center) {
      mapRef.current?.flyToWithOffset(center.lat, center.lng, { zoom: 13 });
    }
    setSearch('');
    setSnap('80px');
  }, [incidents, mapRef, setSnap]);

  const handleIncidentSelect = useCallback((incident: Incident) => {
    setSnap('80px');
    mapRef.current?.flyToWithOffset(incident.lat, incident.lng, {
      zoom: 15,
      onComplete: () => {
        window.requestAnimationFrame(() => mapRef.current?.showPopup(incident));
      },
    });
  }, [mapRef, setSnap]);

  // Scroll active card into view when expanded
  useEffect(() => {
    if (isExpanded && activeIncidentId && activeCardRef.current) {
      activeCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isExpanded, activeIncidentId]);

  const dark = theme !== 'light';

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
            dark
              ? 'bg-slate-950 border-t border-white/10 shadow-[0_-8px_32px_rgba(0,0,0,0.45)]'
              : 'bg-white border-t border-slate-200 shadow-[0_-8px_32px_rgba(0,0,0,0.10)]',
          )}
          style={{ maxHeight: '85vh' }}
        >
          <Drawer.Title className="sr-only">Incidents</Drawer.Title>
          <Drawer.Description className="sr-only">Browse and search Calgary incidents</Drawer.Description>

          {/* Brand gradient stripe */}
          <div
            className="h-1.5 w-full shrink-0 rounded-t-[1.6rem]"
            style={{ background: 'linear-gradient(to right, #4A90D9, #2E8B7A, #D4A843)' }}
          />

          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <div className={cn('w-10 h-1 rounded-full', dark ? 'bg-slate-700' : 'bg-slate-300')} />
          </div>

          {/* ── COLLAPSED BAR ── */}
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
                <span className={cn('text-xs font-black uppercase tracking-widest', dark ? 'text-slate-300' : 'text-slate-700')}>
                  {liveCount} live report{liveCount !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReportPress(); }}
                className={cn(
                  'flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors',
                  dark
                    ? 'bg-blue-600/20 border-blue-500/40 text-blue-400 hover:bg-blue-600/30'
                    : 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800',
                )}
              >
                <Plus size={10} />
                Report
              </button>
            </div>
          )}

          {/* ── OPEN CONTENT (peek + expanded) ── */}
          {isOpen && (
            <div className="flex flex-col flex-1 min-h-0">

              {/* Search + total count */}
              <div className="px-3 pt-1 pb-2 shrink-0 flex items-center gap-2">
                <div className={cn(
                  'flex items-center gap-2 rounded-2xl px-3 py-2.5 border flex-1',
                  dark ? 'bg-white/5 border-white/10' : 'bg-slate-100 border-slate-200',
                )}>
                  <Search size={15} className="text-slate-500 shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onFocus={() => { if (isCollapsed) setSnap(0.38); }}
                    placeholder="Search reports or neighborhoods…"
                    className={cn(
                      'flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-slate-500 min-w-0',
                      dark ? 'text-white' : 'text-slate-900',
                    )}
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>
                {/* Total count badge */}
                <div className={cn(
                  'flex flex-col items-center justify-center rounded-xl px-3 py-1.5 min-w-[48px] border shrink-0',
                  dark ? 'bg-blue-500/10 border-blue-500/20' : 'bg-slate-900 border-slate-900',
                )}>
                  <span className={cn('text-[9px] font-bold uppercase tracking-tighter leading-none', dark ? 'text-blue-400' : 'text-white')}>Total</span>
                  <span className={cn('text-base font-black leading-none mt-0.5', dark ? 'text-white' : 'text-white')}>
                    {filteredIncidents.length}
                  </span>
                </div>
              </div>

              {/* Category chips */}
              <div className="px-3 pb-2 shrink-0">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {CATEGORY_OPTIONS.map(({ id, label, Icon }) => {
                    const count = id === 'all'
                      ? incidents.filter(i => !i.deleted).length
                      : incidents.filter(i => i.category === id && !i.deleted).length;
                    const isSelected = selectedCategory === id;
                    return (
                      <button
                        key={id}
                        onClick={() => onCategoryChange(id as IncidentCategory | 'all')}
                        className={cn(
                          'category-chip shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight border transition-all whitespace-nowrap',
                          isSelected
                            ? 'category-chip-selected bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/20'
                            : dark
                              ? 'bg-slate-800/50 text-slate-400 border-white/5 hover:bg-slate-800'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100',
                        )}
                      >
                        <Icon size={12} className={cn('category-chip-icon', isSelected ? 'text-white' : dark ? 'text-blue-400' : 'text-slate-700')} />
                        <span>{label}</span>
                        <span className={cn(
                          'category-chip-count text-[9px] px-1.5 py-0.5 rounded-full font-black',
                          isSelected ? 'bg-white/20 text-white' : dark ? 'bg-white/10 text-slate-500' : 'bg-slate-200 text-slate-600',
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filter controls — expanded only */}
              {isExpanded && (
                <div className={cn(
                  'px-3 pb-3 shrink-0 border-b space-y-2',
                  dark ? 'border-white/5' : 'border-slate-200',
                )}>
                  {/* Sort + status counts row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span className={cn('text-[9px] font-bold uppercase tracking-tighter', dark ? 'text-slate-400' : 'text-slate-600')}>
                          {filteredIncidents.filter(i => i.verified_status === 'multiple_reports').length} Critical
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                        <span className={cn('text-[9px] font-bold uppercase tracking-tighter', dark ? 'text-slate-400' : 'text-slate-600')}>
                          {filteredIncidents.filter(i => i.verified_status === 'unverified').length} Active
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className={cn('text-[9px] font-bold uppercase tracking-tighter', dark ? 'text-slate-400' : 'text-slate-600')}>
                          {filteredIncidents.filter(i => i.verified_status === 'community_confirmed').length} Resolved
                        </span>
                      </div>
                    </div>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as SortBy)}
                      className={cn(
                        'rounded-lg px-2 py-1 text-[10px] font-bold border focus:outline-none cursor-pointer transition-colors',
                        dark
                          ? 'bg-slate-900 border-white/10 text-slate-300 hover:border-white/20'
                          : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400',
                      )}
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="verified">Most Verified</option>
                    </select>
                  </div>

                  {/* Toggle pills row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setVerifiedOnly(v => !v)}
                      className={cn(
                        'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all',
                        verifiedOnly
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : dark
                            ? 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      Verified Only {verifiedOnly ? 'On' : 'Off'}
                    </button>
                    <button
                      onClick={() => setRecentOnly(r => !r)}
                      className={cn(
                        'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all',
                        recentOnly
                          ? dark ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-slate-900 text-white border-slate-900'
                          : dark
                            ? 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      Recent 2h {recentOnly ? 'On' : 'Off'}
                    </button>
                    {hasActiveFilters && (
                      <button
                        onClick={clearAllFilters}
                        className={cn(
                          'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all',
                          dark
                            ? 'border-white/10 text-slate-400 hover:bg-white/10'
                            : 'border-slate-300 text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Scrollable content area */}
              <div className="flex-1 overflow-y-auto no-scrollbar px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">

                {/* Neighborhood search results */}
                <AnimatePresence>
                  {neighborhoodResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-2 mt-2"
                    >
                      {neighborhoodResults.map(name => (
                        <button
                          key={name}
                          onClick={() => handleNeighborhoodSelect(name)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-colors border',
                            dark
                              ? 'bg-blue-500/10 hover:bg-blue-500/15 border-blue-500/20'
                              : 'bg-blue-50 hover:bg-blue-100 border-blue-200',
                          )}
                        >
                          <MapPin size={14} className="text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <p className={cn('text-xs font-black', dark ? 'text-white' : 'text-slate-900')}>{name}</p>
                            <p className="text-[10px] text-slate-500">Fly to area</p>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Neighborhood Pulse — expanded only, when no search query */}
                {isExpanded && neighborhoodPulse.length > 0 && !debouncedSearch && (
                  <div className={cn('py-3 mb-2 border-b', dark ? 'border-white/5' : 'border-slate-200')}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Activity size={12} className="text-blue-400" />
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live Area Pulse · 2h</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {neighborhoodPulse.map(({ name, count, level }) => {
                        const cfg = RISK_CONFIG[level];
                        return (
                          <button
                            key={name}
                            onClick={() => handleNeighborhoodSelect(name)}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold transition-opacity hover:opacity-80',
                              cfg.bg,
                              dark ? 'border-white/5' : 'border-slate-200',
                            )}
                            title={`${count} incident${count !== 1 ? 's' : ''} in the last 2h`}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
                            <span className={dark ? 'text-white' : 'text-slate-800'}>{name}</span>
                            <span className={cn('font-black', cfg.text)}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Incident count label */}
                <p className="text-[10px] font-black uppercase tracking-widest mt-2 mb-2 text-slate-500">
                  {filteredIncidents.length === 0
                    ? 'No reports found'
                    : `${filteredIncidents.length} report${filteredIncidents.length !== 1 ? 's' : ''}${isPeek && filteredIncidents.length > 5 ? ' · showing top 5' : ''}`}
                </p>

                {/* Incident list */}
                {filteredIncidents.length > 0 ? (
                  <AnimatePresence>
                    {visibleIncidents.map((incident) => {
                      const CategoryIcon = CATEGORY_ICONS[incident.category] ?? AlertCircle;
                      const StatusIcon = STATUS_ICONS[incident.verified_status];
                      const isActive = activeIncidentId === incident.id;
                      const isEmergency = incident.category === 'emergency';
                      const isNew = Date.now() - incident.timestamp < 30 * 60 * 1000;
                      const reporter = getReporterDisplay(incident);

                      return (
                        <motion.button
                          key={incident.id}
                          ref={(el: HTMLButtonElement | null) => { if (isActive) activeCardRef.current = el; }}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          onClick={() => handleIncidentSelect(incident)}
                          className={cn(
                            'w-full text-left rounded-xl mb-2 border overflow-hidden transition-all active:scale-[0.99] relative',
                            dark ? 'bg-white/[0.04]' : 'bg-white',
                            isEmergency
                              ? 'border-red-500/60 bg-red-950/30 ring-1 ring-red-500/30'
                              : isActive
                                ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50 animate-active-glow'
                                : dark
                                  ? 'border-white/8 hover:bg-white/[0.07] hover:border-white/15'
                                  : 'border-slate-200 hover:bg-slate-50',
                          )}
                        >
                          {/* Emergency SOS banner */}
                          {isEmergency && (
                            <div className="absolute top-0 right-0 flex items-center gap-1 bg-red-600 px-2 py-0.5 rounded-bl-xl">
                              <span className="text-[8px] font-black uppercase tracking-widest text-white">SOS</span>
                            </div>
                          )}

                          <div className="flex gap-2 p-3">
                            {/* Left color stripe */}
                            <div className={cn(
                              'w-1 self-stretch rounded-full shrink-0',
                              isEmergency ? 'bg-red-600 animate-pulse' :
                              incident.category === 'crime' ? 'bg-red-500' :
                              incident.category === 'traffic' ? 'bg-orange-500' :
                              incident.category === 'infrastructure' ? 'bg-blue-500' :
                              'bg-purple-500',
                            )} />

                            {/* Category icon */}
                            <div className={cn(
                              'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                              isEmergency ? 'bg-red-600/30 text-red-400' :
                              incident.category === 'crime' ? 'bg-red-500/20 text-red-400' :
                              incident.category === 'traffic' ? 'bg-orange-500/20 text-orange-400' :
                              incident.category === 'infrastructure' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-purple-500/20 text-purple-400',
                            )}>
                              <CategoryIcon size={16} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              {/* Title row */}
                              <div className="flex items-start justify-between gap-1 mb-0.5">
                                <p className={cn(
                                  'text-xs font-black leading-tight line-clamp-2 flex-1',
                                  dark ? 'text-white' : 'text-slate-900',
                                )}>
                                  {incident.title}
                                </p>
                                <div className="flex items-center gap-1 shrink-0 ml-1">
                                  {incident.source_type === 'reddit_calgary' && (
                                    <span className="px-1 py-0.5 rounded bg-orange-500/20 border border-orange-500/30 text-[7px] font-black text-orange-400 uppercase">Reddit</span>
                                  )}
                                  {incident.source_type === 'news_rss' && (
                                    <span className="px-1 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-[7px] font-black text-purple-400 uppercase">News</span>
                                  )}
                                  {incident.data_source === 'official' && incident.source_type !== 'reddit_calgary' && incident.source_type !== 'news_rss' && (
                                    <span className="px-1 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-[7px] font-black text-blue-400 uppercase">Official</span>
                                  )}
                                  {isNew && (
                                    <span className="px-1 py-0.5 rounded bg-blue-500 text-[7px] font-black text-white uppercase animate-pulse">New</span>
                                  )}
                                </div>
                              </div>

                              {/* Meta line */}
                              <p className="text-[10px] text-slate-500 mb-1">
                                <Clock size={9} className="inline mr-0.5 -mt-px" />
                                {formatDistanceToNow(incident.timestamp)} ago · {incident.neighborhood || 'Calgary'} · by {reporter.firstName}
                              </p>

                              {/* Description */}
                              <p className={cn(
                                'text-[11px] leading-relaxed line-clamp-2 mb-2',
                                dark ? 'text-slate-400' : 'text-slate-600',
                              )}>
                                {incident.description}
                              </p>

                              {/* Bottom row: status + avatar */}
                              <div className="flex items-center justify-between">
                                <div className={cn(
                                  'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium',
                                  incident.verified_status === 'community_confirmed' ? 'bg-green-500/20 text-green-400' :
                                  incident.verified_status === 'multiple_reports' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-slate-500/20 text-slate-400',
                                )}>
                                  {StatusIcon && <StatusIcon size={10} />}
                                  <span>{(incident.verified_status ?? 'unverified').replace(/_/g, ' ')}</span>
                                </div>
                                <div className={cn(
                                  'w-8 h-8 rounded-full flex items-center justify-center border border-white/20 shadow',
                                  isEmergency ? 'bg-red-600 text-white' :
                                  incident.category === 'crime' ? 'bg-red-500 text-white' :
                                  incident.category === 'traffic' ? 'bg-orange-500 text-white' :
                                  incident.category === 'infrastructure' ? 'bg-blue-500 text-white' :
                                  'bg-purple-500 text-white',
                                )}>
                                  {reporter.anonymous
                                    ? <User size={14} />
                                    : <span className="text-xs font-black">{reporter.initial}</span>
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                ) : (
                  /* Empty state */
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-10 text-center space-y-3"
                  >
                    <div className={cn('w-16 h-16 rounded-full flex items-center justify-center', dark ? 'bg-white/5' : 'bg-slate-100')}>
                      <Search size={28} className="text-slate-500" />
                    </div>
                    {hasActiveFilters ? (
                      <>
                        <div>
                          <p className={cn('font-bold text-sm', dark ? 'text-white' : 'text-slate-900')}>No reports match</p>
                          <p className="text-slate-500 text-xs mt-1">Try clearing your filters or searching a different term.</p>
                        </div>
                        <button
                          onClick={clearAllFilters}
                          className="text-blue-400 text-[10px] font-bold uppercase tracking-widest hover:text-blue-300 transition-colors"
                        >
                          Clear all filters
                        </button>
                      </>
                    ) : (
                      <div>
                        <p className={cn('font-bold text-sm', dark ? 'text-white' : 'text-slate-900')}>All clear right now</p>
                        <p className="text-slate-500 text-xs mt-1 max-w-[200px]">No incidents in Calgary at the moment.</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Load More */}
                {hasMore && isExpanded && filteredIncidents.length > 0 && (
                  <button
                    onClick={onLoadMore}
                    disabled={isLoadingMore}
                    className={cn(
                      'w-full mt-2 py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed',
                      dark
                        ? 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    {isLoadingMore ? 'Loading More...' : 'Load Older Reports'}
                  </button>
                )}

                {/* Peek hint */}
                {isPeek && filteredIncidents.length > 5 && (
                  <button
                    onClick={() => setSnap(0.82)}
                    className="w-full flex items-center justify-center gap-1 py-2 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <ChevronDown size={12} className="rotate-180" />
                    Show all {filteredIncidents.length} reports
                  </button>
                )}
              </div>

              {/* Expanded footer: Report button */}
              {isExpanded && (
                <div className={cn(
                  'px-3 py-3 border-t shrink-0',
                  dark ? 'border-white/5 bg-slate-950/60' : 'border-slate-200 bg-white',
                )}>
                  <button
                    type="button"
                    onClick={onReportPress}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-[0.99]',
                      dark
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25'
                        : 'bg-slate-900 hover:bg-slate-800 text-white',
                    )}
                  >
                    <Plus size={14} />
                    Report an Incident
                  </button>
                </div>
              )}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
