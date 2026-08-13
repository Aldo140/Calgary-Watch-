import { useState, useEffect, useMemo, useRef, RefObject, useCallback } from 'react';
import { TimeWindowFilter, type TimeWindow } from '@/src/components/TimeWindowFilter';
import { Drawer } from 'vaul';
import {
  Search, X, MapPin, Clock, Layers, Siren, AlertCircle, Car, Construction,
  CloudRain, Activity, User, ChevronDown, ChevronRight, Plus,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Incident, IncidentCategory, CATEGORY_ICONS, STATUS_ICONS, isPubliclyVisible } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { MapRef } from '@/src/components/Map';
import { useNeighborhoodPulse, RISK_CONFIG } from '@/src/hooks/useNeighborhoodPulse';
import DemoBadge from '@/src/components/DemoBadge';

export const SNAP_POINTS = ['80px', 0.38, 0.82] as const;
export type SnapPoint = (typeof SNAP_POINTS)[number];

const SORT_KEY = 'cw_sortBy';
const FEED_FILTER_KEY = 'cw_feedFilter';

type SortBy = 'newest' | 'oldest' | 'verified';

// Field-atlas palette — explicit hexes on purpose (several Tailwind color
// utilities are globally remapped in index.css).
const P = {
  paper: '#FFFDF8',
  card: '#F7F3EA',
  ink: '#1C2B3A',
  soft: '#5A6B7D',
  line: '#E7E0D2',
};

const CAT_COLOR: Record<string, string> = {
  emergency: '#E11D48',
  crime: '#DC2626',
  traffic: '#EA580C',
  infrastructure: '#2563EB',
  weather: '#0284C7',
};

const CATEGORY_OPTIONS = [
  { id: 'all' as const,            label: 'All',     Icon: Layers,       color: '#1C2B3A' },
  { id: 'emergency' as const,      label: 'SOS',     Icon: Siren,        color: '#E11D48' },
  { id: 'crime' as const,          label: 'Crime',   Icon: AlertCircle,  color: '#DC2626' },
  { id: 'traffic' as const,        label: 'Traffic', Icon: Car,          color: '#EA580C' },
  { id: 'infrastructure' as const, label: 'Infra',   Icon: Construction, color: '#2563EB' },
  { id: 'weather' as const,        label: 'Weather', Icon: CloudRain,    color: '#0284C7' },
] as const;

// ─── Vaul open-state invariant ────────────────────────────────────────────────
// Vaul mutates global touch-action/overflow during its spring open/close
// animations. A close→open cycle while the form is visible breaks Leaflet touch
// tracking and freezes form inputs on mobile (regressed 3× in project history).
//
// INVARIANT: the drawer must never become `false` while `isFormOpen` is true.
//
// This hook encodes that rule and fires a loud dev-mode warning if anything
// violates it, so a future refactor can't silently reintroduce the bug.
function useDrawerOpen(isPinMode: boolean, isFormOpen: boolean): boolean {
  // When form is open, keep vaul "open" regardless of pin mode so no
  // transition runs. Visual hide/show is handled by CSS on Drawer.Content.
  const open = !isPinMode || isFormOpen;

  const prevOpenRef = useRef(open);
  const prevFormOpenRef = useRef(isFormOpen);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const didClose = prevOpenRef.current && !open;
      const formWasOpen = prevFormOpenRef.current;
      if (didClose && formWasOpen) {
        // eslint-disable-next-line no-console
        console.error(
          '[MobileMapSheet] REGRESSION: vaul drawer closed while isFormOpen=true.\n' +
          'This causes vaul to mutate global touch-action/overflow, freezing form\n' +
          'inputs on mobile after pin drop. Fix: open={!isPinMode || isFormOpen}.\n' +
          'See project history: 5cc5d0b → b60d6fa → 8b3a5e1 → current.',
        );
      }
    }
    prevOpenRef.current = open;
    prevFormOpenRef.current = isFormOpen;
  });

  return open;
}
// ──────────────────────────────────────────────────────────────────────────────

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
  timeWindow?: TimeWindow;
  onTimeWindowChange?: (v: TimeWindow) => void;
  selectedCategory: IncidentCategory | 'all';
  onCategoryChange: (cat: IncidentCategory | 'all') => void;
  liveCount: number;
  mapRef: RefObject<MapRef | null>;
  isPinMode: boolean;
  snap: SnapPoint;
  setSnap: (s: SnapPoint) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onReportPress: () => void;
  activeIncidentId?: string | null;
  isFormOpen?: boolean;
}

export default function MobileMapSheet({
  incidents,
  timeWindow,
  onTimeWindowChange,
  selectedCategory,
  onCategoryChange,
  liveCount,
  mapRef,
  isPinMode,
  snap,
  setSnap,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onReportPress,
  activeIncidentId,
  isFormOpen = false,
}: MobileMapSheetProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [feedFilter, setFeedFilter] = useState<'community' | 'recent' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeCardRef = useRef<HTMLButtonElement | null>(null);

  const drawerOpen = useDrawerOpen(isPinMode, isFormOpen);

  const isExpanded = snap === 0.82;
  const isPeek    = snap === 0.38;
  const isCollapsed = snap === '80px';
  const isOpen = isPeek || isExpanded;

  // Persist/restore filter prefs (same localStorage keys as desktop Sidebar)
  useEffect(() => {
    try {
      const s = localStorage.getItem(SORT_KEY);
      if (s === 'newest' || s === 'oldest' || s === 'verified') setSortBy(s);
      const f = localStorage.getItem(FEED_FILTER_KEY);
      if (f === 'community' || f === 'recent') setFeedFilter(f);
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem(SORT_KEY, sortBy); } catch {} }, [sortBy]);
  useEffect(() => {
    try {
      if (feedFilter) localStorage.setItem(FEED_FILTER_KEY, feedFilter);
      else localStorage.removeItem(FEED_FILTER_KEY);
      localStorage.removeItem('cw_verifiedOnly');
      localStorage.removeItem('cw_recentOnly');
    } catch {}
  }, [feedFilter]);

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
      .filter(i => isPubliclyVisible(i))
      .filter(i => selectedCategory === 'all' || i.category === selectedCategory)
      .filter(i =>
        feedFilter === 'community'
          ? (!i.data_source || i.data_source === 'community')
          : feedFilter === 'recent'
            ? (Date.now() - i.timestamp) <= 2 * 60 * 60 * 1000
            : true
      )
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
  }, [incidents, selectedCategory, feedFilter, debouncedSearch, sortBy]);

  // Peek shows top 5 by recency from filtered list; expanded shows all
  const visibleIncidents = isPeek ? filteredIncidents.slice(0, 5) : filteredIncidents;

  const hasActiveFilters = !!feedFilter || !!search || selectedCategory !== 'all';

  const clearAllFilters = useCallback(() => {
    setFeedFilter(null);
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

  return (
    <Drawer.Root
      snapPoints={[...SNAP_POINTS] as (string | number)[]}
      activeSnapPoint={snap}
      setActiveSnapPoint={(s) => setSnap(s as SnapPoint)}
      modal={false}
      dismissible={false}
      open={drawerOpen}
    >
      <Drawer.Portal>
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-[50] flex flex-col rounded-t-[1.5rem] outline-none lg:hidden shadow-[0_-12px_40px_rgba(28,43,58,0.18)]"
          style={{
            maxHeight: '85vh',
            background: P.paper,
            borderTop: `1px solid ${P.line}`,
            ...(isFormOpen ? { visibility: 'hidden', pointerEvents: 'none' } : {}),
          }}
        >
          <Drawer.Title className="sr-only">Incidents</Drawer.Title>
          <Drawer.Description className="sr-only">Browse and search Calgary incidents</Drawer.Description>

          {/* Brand stripe */}
          <div
            className="h-1 w-full shrink-0 rounded-t-[1.5rem]"
            style={{ background: 'linear-gradient(to right, #4A90D9, #2E8B7A, #D4A843)' }}
          />

          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ background: P.line }} />
          </div>

          {/* ── COLLAPSED BAR ── */}
          {isCollapsed && (
            <div
              className="flex items-center justify-between px-4 py-2 cursor-pointer"
              onClick={() => setSnap(0.38)}
            >
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center w-2 h-2">
                  <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-70" />
                  <div className="relative w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: P.ink }}>
                  {liveCount} live report{liveCount !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReportPress(); }}
                className="flex items-center gap-1.5 px-3.5 h-8 rounded-full text-[10px] font-black uppercase tracking-[0.14em] transition-transform active:scale-95"
                style={{ background: P.ink, color: P.paper }}
              >
                <Plus size={11} />
                Report
              </button>
            </div>
          )}

          {/* ── OPEN CONTENT (peek + expanded) ── */}
          {isOpen && (
            <div className="flex flex-col flex-1 min-h-0">

              {/* Search + total count */}
              <div className="px-3 pt-1 pb-2 shrink-0 flex items-center gap-2">
                <div
                  className="flex items-center gap-2 rounded-2xl px-3 h-11 flex-1"
                  style={{ background: P.card, border: `1px solid ${P.line}` }}
                >
                  <Search size={15} className="shrink-0" style={{ color: P.soft }} />
                  <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onFocus={() => setSnap(0.82)}
                    placeholder="Search reports or neighbourhoods…"
                    className="flex-1 bg-transparent text-sm font-medium outline-none min-w-0"
                    style={{ color: P.ink }}
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="shrink-0 transition-colors" style={{ color: P.soft }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div
                  className="flex flex-col items-center justify-center rounded-2xl px-3 h-11 min-w-[52px] shrink-0"
                  style={{ background: P.ink }}
                >
                  <span className="font-mono text-[7.5px] font-bold uppercase tracking-[0.14em] leading-none" style={{ color: 'rgba(255,253,248,0.6)' }}>Total</span>
                  <span className="text-[15px] font-black leading-none mt-0.5 tabular-nums" style={{ color: P.paper }}>
                    {filteredIncidents.length}
                  </span>
                </div>
              </div>

              {/* Category chips — colour-coded, same system as the map chips */}
              <div className="px-3 pb-2 shrink-0">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {CATEGORY_OPTIONS.map(({ id, label, Icon, color }) => {
                    const count = id === 'all'
                      ? incidents.filter(i => isPubliclyVisible(i)).length
                      : incidents.filter(i => i.category === id && isPubliclyVisible(i)).length;
                    const isSelected = selectedCategory === id;
                    return (
                      <button
                        key={id}
                        onClick={() => onCategoryChange(id as IncidentCategory | 'all')}
                        className="category-chip shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full text-[10.5px] font-bold border transition-all whitespace-nowrap active:scale-95"
                        style={isSelected
                          ? { background: color, borderColor: color, color: '#fff' }
                          : { background: P.paper, borderColor: P.line, color: P.soft }}
                      >
                        <Icon size={12} className="category-chip-icon" style={{ color: isSelected ? '#fff' : color }} />
                        <span>{label}</span>
                        <span
                          className="category-chip-count text-[9px] px-1.5 py-0.5 rounded-full font-black tabular-nums"
                          style={isSelected
                            ? { background: 'rgba(255,255,255,0.22)', color: '#fff' }
                            : { background: P.card, color: P.soft }}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filter controls — expanded only */}
              {isExpanded && (
                <div className="px-3 pb-3 shrink-0 space-y-2" style={{ borderBottom: `1px solid ${P.line}` }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {[
                        { dot: '#ef4444', label: `${filteredIncidents.filter(i => i.verified_status === 'multiple_reports').length} Critical` },
                        { dot: '#eab308', label: `${filteredIncidents.filter(i => i.verified_status === 'unverified').length} Active` },
                        { dot: '#22c55e', label: `${filteredIncidents.filter(i => i.verified_status === 'community_confirmed').length} Resolved` },
                      ].map(({ dot, label }) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.06em]" style={{ color: P.soft }}>{label}</span>
                        </div>
                      ))}
                    </div>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as SortBy)}
                      className="rounded-lg px-2 h-7 text-[10px] font-bold focus:outline-none cursor-pointer"
                      style={{ background: P.paper, border: `1px solid ${P.line}`, color: P.ink }}
                    >
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="verified">Most Verified</option>
                    </select>
                  </div>

                  {onTimeWindowChange && timeWindow && (
                    <div className="pb-1">
                      <TimeWindowFilter value={timeWindow} onChange={onTimeWindowChange} />
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setFeedFilter((value) => value === 'community' ? null : 'community')}
                      className="px-3 h-7 rounded-full text-[10px] font-bold uppercase tracking-[0.08em] border transition-all active:scale-95"
                      style={feedFilter === 'community'
                        ? { background: 'rgba(46,139,122,0.14)', borderColor: 'rgba(46,139,122,0.45)', color: '#1F6D5F' }
                        : { background: P.paper, borderColor: P.line, color: P.soft }}
                    >
                      Community only
                    </button>
                    <button
                      onClick={() => setFeedFilter((value) => value === 'recent' ? null : 'recent')}
                      className="px-3 h-7 rounded-full text-[10px] font-bold uppercase tracking-[0.08em] border transition-all active:scale-95"
                      style={feedFilter === 'recent'
                        ? { background: P.ink, borderColor: P.ink, color: P.paper }
                        : { background: P.paper, borderColor: P.line, color: P.soft }}
                    >
                      Last 2 h
                    </button>
                    {hasActiveFilters && (
                      <button
                        onClick={clearAllFilters}
                        className="px-3 h-7 rounded-full text-[10px] font-bold uppercase tracking-[0.08em] border transition-all active:scale-95"
                        style={{ borderColor: P.line, color: '#B91C1C', background: P.paper }}
                      >
                        Clear filters
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
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-colors"
                          style={{ background: 'rgba(74,144,217,0.09)', border: '1px solid rgba(74,144,217,0.28)' }}
                        >
                          <MapPin size={14} className="shrink-0" style={{ color: '#2563EB' }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black" style={{ color: P.ink }}>{name}</p>
                            <p className="text-[10px]" style={{ color: P.soft }}>Fly to area</p>
                          </div>
                          <ChevronRight size={14} style={{ color: P.soft }} />
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Neighborhood Pulse — expanded only, when no search query */}
                {isExpanded && neighborhoodPulse.length > 0 && !debouncedSearch && (
                  <div className="py-3 mb-2" style={{ borderBottom: `1px solid ${P.line}` }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Activity size={12} style={{ color: '#2E8B7A' }} />
                      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: P.soft }}>Live area pulse · 2 h</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {neighborhoodPulse.map(({ name, count, level }) => {
                        const cfg = RISK_CONFIG[level];
                        return (
                          <button
                            key={name}
                            onClick={() => handleNeighborhoodSelect(name)}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[10px] font-bold transition-opacity hover:opacity-80',
                              cfg.bg,
                            )}
                            style={{ border: `1px solid ${P.line}` }}
                            title={`${count} incident${count !== 1 ? 's' : ''} in the last 2h`}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
                            <span style={{ color: P.ink }}>{name}</span>
                            <span className={cn('font-black tabular-nums', cfg.text)}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Incident count label */}
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] mt-2 mb-2" style={{ color: P.soft }}>
                  {filteredIncidents.length === 0
                    ? 'No reports found'
                    : `${filteredIncidents.length} report${filteredIncidents.length !== 1 ? 's' : ''}${isPeek && filteredIncidents.length > 5 ? ' · top 5' : ''}`}
                </p>

                {/* Incident list — peek = glance rows, expanded = full cards */}
                {filteredIncidents.length > 0 ? (
                  <AnimatePresence>
                    {visibleIncidents.map((incident) => {
                      const CategoryIcon = CATEGORY_ICONS[incident.category] ?? AlertCircle;
                      const StatusIcon = STATUS_ICONS[incident.verified_status];
                      const isActive = activeIncidentId === incident.id;
                      const isEmergency = incident.category === 'emergency';
                      const isNew = Date.now() - incident.timestamp < 30 * 60 * 1000;
                      const reporter = getReporterDisplay(incident);
                      const catColor = CAT_COLOR[incident.category] ?? '#0284C7';

                      if (isPeek) {
                        // ── Glance row: one tap-height line for fast scanning ──
                        return (
                          <motion.button
                            key={incident.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            onClick={() => handleIncidentSelect(incident)}
                            className="w-full flex items-center gap-3 rounded-xl mb-1.5 px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
                            style={{
                              background: isEmergency ? 'rgba(225,29,72,0.07)' : P.paper,
                              border: `1px solid ${isEmergency ? 'rgba(225,29,72,0.35)' : P.line}`,
                            }}
                          >
                            <span
                              className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', isEmergency && 'animate-pulse')}
                              style={{ background: `${catColor}18`, color: catColor }}
                            >
                              <CategoryIcon size={14} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[12.5px] font-bold leading-tight truncate" style={{ color: P.ink }}>
                                {incident.title}
                              </span>
                              <span className="block font-mono text-[9px] mt-0.5 truncate" style={{ color: P.soft }}>
                                {formatDistanceToNow(incident.timestamp)} ago · {incident.neighborhood || 'Calgary'}
                              </span>
                              {incident.data_source === 'demo' && (
                                <span className="mt-1 block">
                                  <DemoBadge size="xs" />
                                </span>
                              )}
                            </span>
                            {isNew && (
                              <span className="shrink-0 rounded px-1.5 py-0.5 text-[7.5px] font-black uppercase" style={{ background: '#2563EB', color: '#fff' }}>New</span>
                            )}
                            <ChevronRight size={14} className="shrink-0" style={{ color: P.soft }} />
                          </motion.button>
                        );
                      }

                      // ── Full card (expanded) ──
                      return (
                        <motion.button
                          key={incident.id}
                          ref={(el: HTMLButtonElement | null) => {
                            if (isActive) {
                              activeCardRef.current = el;
                            } else if (activeCardRef.current === el) {
                              activeCardRef.current = null;
                            }
                          }}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          onClick={() => handleIncidentSelect(incident)}
                          className="w-full text-left rounded-2xl mb-2 overflow-hidden transition-all active:scale-[0.99] relative"
                          style={{
                            background: isEmergency ? 'rgba(225,29,72,0.05)' : P.paper,
                            border: `1px solid ${isEmergency ? 'rgba(225,29,72,0.4)' : isActive ? '#4A90D9' : P.line}`,
                            boxShadow: isActive ? '0 0 0 2px rgba(74,144,217,0.25)' : undefined,
                          }}
                        >
                          {isEmergency && (
                            <div className="absolute top-0 right-0 flex items-center gap-1 px-2 py-0.5 rounded-bl-xl" style={{ background: '#E11D48' }}>
                              <span className="text-[8px] font-black uppercase tracking-widest text-[#fff]">SOS</span>
                            </div>
                          )}

                          <div className="flex gap-2.5 p-3">
                            <div
                              className={cn('w-1 self-stretch rounded-full shrink-0', isEmergency && 'animate-pulse')}
                              style={{ background: catColor }}
                            />
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                              style={{ background: `${catColor}18`, color: catColor }}
                            >
                              <CategoryIcon size={16} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1 mb-0.5">
                                <p className="text-[12.5px] font-black leading-tight line-clamp-2 flex-1" style={{ color: P.ink }}>
                                  {incident.title}
                                </p>
                                <div className="flex items-center gap-1 shrink-0 ml-1">
                                  {incident.source_type === 'reddit_calgary' && (
                                    <span className="px-1 py-0.5 rounded text-[7px] font-black uppercase" style={{ background: 'rgba(234,88,12,0.12)', color: '#EA580C', border: '1px solid rgba(234,88,12,0.3)' }}>Reddit</span>
                                  )}
                                  {incident.source_type === 'news_rss' && (
                                    <span className="px-1 py-0.5 rounded text-[7px] font-black uppercase" style={{ background: 'rgba(147,51,234,0.1)', color: '#7E22CE', border: '1px solid rgba(147,51,234,0.3)' }}>News</span>
                                  )}
                                  {incident.data_source === 'official' && incident.source_type !== 'reddit_calgary' && incident.source_type !== 'news_rss' && (
                                    <span className="px-1 py-0.5 rounded text-[7px] font-black uppercase" style={{ background: 'rgba(14,165,233,0.12)', color: '#0369A1', border: '1px solid rgba(14,165,233,0.3)' }}>Official</span>
                                  )}
                                  {isNew && (
                                    <span className="px-1 py-0.5 rounded text-[7px] font-black uppercase animate-pulse" style={{ background: '#2563EB', color: '#fff' }}>New</span>
                                  )}
                                </div>
                              </div>

                              <p className="font-mono text-[9.5px] mb-1.5" style={{ color: P.soft }}>
                                <Clock size={9} className="inline mr-0.5 -mt-px" />
                                {formatDistanceToNow(incident.timestamp)} ago · {incident.neighborhood || 'Calgary'} · by {reporter.firstName}
                              </p>

                              <div className="mb-2 flex gap-2">
                                {incident.image_url && (
                                  <img
                                    src={incident.image_url}
                                    alt=""
                                    className="h-14 w-14 shrink-0 rounded-xl object-cover"
                                    style={{ border: `1px solid ${P.line}` }}
                                    loading="lazy"
                                  />
                                )}
                                <p className="text-[11px] leading-relaxed line-clamp-3" style={{ color: P.soft }}>
                                  {incident.description}
                                </p>
                              </div>

                              <div className="flex items-center justify-between">
                                <div
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
                                  style={
                                    incident.verified_status === 'community_confirmed' ? { background: 'rgba(34,197,94,0.12)', color: '#15803D' } :
                                    incident.verified_status === 'multiple_reports' ? { background: 'rgba(234,179,8,0.14)', color: '#A16207' } :
                                    { background: P.card, color: P.soft }
                                  }
                                >
                                  {StatusIcon && <StatusIcon size={10} />}
                                  <span>{(incident.verified_status ?? 'unverified').replace(/_/g, ' ')}</span>
                                </div>
                                <div
                                  className="w-7 h-7 rounded-full flex items-center justify-center border border-[#fff] shadow"
                                  style={{ background: catColor, color: '#fff' }}
                                >
                                  {reporter.anonymous
                                    ? <User size={13} />
                                    : <span className="text-[11px] font-black">{reporter.initial}</span>
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
                    <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: P.card }}>
                      <Search size={26} style={{ color: P.soft }} />
                    </div>
                    {hasActiveFilters ? (
                      <>
                        <div>
                          <p className="font-bold text-sm" style={{ color: P.ink }}>No reports match</p>
                          <p className="text-xs mt-1" style={{ color: P.soft }}>Try clearing your filters or searching a different term.</p>
                        </div>
                        <button
                          onClick={clearAllFilters}
                          className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] transition-colors"
                          style={{ color: '#2563EB' }}
                        >
                          Clear all filters
                        </button>
                      </>
                    ) : (
                      <div>
                        <p className="font-bold text-sm" style={{ color: P.ink }}>All clear right now</p>
                        <p className="text-xs mt-1 max-w-[200px]" style={{ color: P.soft }}>No incidents in Calgary at the moment.</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Load More */}
                {hasMore && isExpanded && filteredIncidents.length > 0 && (
                  <button
                    onClick={onLoadMore}
                    disabled={isLoadingMore}
                    className="w-full mt-2 py-2.5 rounded-xl font-mono text-[10px] font-bold uppercase tracking-[0.18em] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ border: `1px solid ${P.line}`, background: P.paper, color: P.ink }}
                  >
                    {isLoadingMore ? 'Loading more…' : 'Load older reports'}
                  </button>
                )}

                {/* Peek hint */}
                {isPeek && filteredIncidents.length > 5 && (
                  <button
                    onClick={() => setSnap(0.82)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors"
                    style={{ color: '#2563EB' }}
                  >
                    <ChevronDown size={12} className="rotate-180" />
                    Show all {filteredIncidents.length} reports
                  </button>
                )}
              </div>

              {/* Expanded footer: Report button */}
              {isExpanded && (
                <div className="px-3 py-3 shrink-0" style={{ borderTop: `1px solid ${P.line}`, background: P.paper }}>
                  <button
                    type="button"
                    onClick={onReportPress}
                    className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl font-black text-[12.5px] transition-transform active:scale-[0.98]"
                    style={{ background: P.ink, color: P.paper }}
                  >
                    <Plus size={15} />
                    Report an incident
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
