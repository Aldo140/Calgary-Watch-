import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TimeWindowFilter, type TimeWindow } from '@/src/components/TimeWindowFilter';
import { Incident, IncidentCategory, CATEGORY_ICONS, STATUS_ICONS } from '@/src/types';
import { formatDistanceToNow } from 'date-fns';
import { Search, Layers, Maximize2, AlertCircle, Car, Construction, CloudRain, User, Siren, Activity, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence, useSpring, useTransform } from 'motion/react';
import { useNeighborhoodPulse, RISK_CONFIG } from '@/src/hooks/useNeighborhoodPulse';
import DemoBadge from '@/src/components/DemoBadge';

interface SidebarProps {
  incidents: Incident[];
  timeWindow?: TimeWindow;
  onTimeWindowChange?: (v: TimeWindow) => void;
  onIncidentClick: (incident: Incident) => void;
  selectedCategory: IncidentCategory | 'all';
  onCategoryChange: (category: IncidentCategory | 'all') => void;
  activeIncidentId?: string | null;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export default function Sidebar({
  incidents,
  timeWindow,
  onTimeWindowChange,
  onIncidentClick,
  selectedCategory,
  onCategoryChange,
  activeIncidentId,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: SidebarProps) {
  const getReporterDisplay = useCallback((incident: Incident) => {
    const rawName = incident.name?.trim() || 'Community Member';
    const anonymous = Boolean(incident.anonymous) || rawName.toLowerCase() === 'anonymous' || rawName.toLowerCase().includes('anonymous');
    const firstName = anonymous ? 'Anonymous' : (rawName.split(/\s+/)[0] || 'Community');
    const initial = firstName.charAt(0).toUpperCase() || 'C';
    return { anonymous, firstName, initial };
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'verified'>('newest');
  const [feedFilter, setFeedFilter] = useState<'community' | 'recent' | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const categories = [
    { id: 'all',            label: 'All',       icon: Layers       },
    { id: 'emergency',      label: 'SOS',        icon: Siren        },
    { id: 'crime',          label: 'Crime',      icon: AlertCircle  },
    { id: 'traffic',        label: 'Traffic',    icon: Car          },
    { id: 'infrastructure', label: 'Infra',      icon: Construction },
    { id: 'weather',        label: 'Weather',    icon: CloudRain    },
  ] as const;

  useEffect(() => {
    try {
      const persistedSort = localStorage.getItem('cw_sortBy');
      const persistedFeedFilter = localStorage.getItem('cw_feedFilter');

      if (persistedSort === 'newest' || persistedSort === 'oldest' || persistedSort === 'verified') {
        setSortBy(persistedSort);
      }
      if (persistedFeedFilter === 'community' || persistedFeedFilter === 'recent') {
        setFeedFilter(persistedFeedFilter);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('cw_sortBy', sortBy); } catch {}
  }, [sortBy]);

  useEffect(() => {
    try {
      if (feedFilter) localStorage.setItem('cw_feedFilter', feedFilter);
      else localStorage.removeItem('cw_feedFilter');
      localStorage.removeItem('cw_verifiedOnly');
      localStorage.removeItem('cw_recentOnly');
    } catch {}
  }, [feedFilter]);

  // Debounce search input by 200ms to avoid filtering on every keystroke
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Keyboard shortcuts removed - they interfered with typing in report forms.

  const filteredIncidents = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    return incidents
      .filter((i) => {
        const matchesCategory = selectedCategory === 'all' || i.category === selectedCategory;
        const matchesSearch =
          q.length === 0 ||
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          (i.neighborhood || '').toLowerCase().includes(q);
        const matchesFeedFilter =
          feedFilter === 'community'
            ? (!i.data_source || i.data_source === 'community')
            : feedFilter === 'recent'
              ? (Date.now() - i.timestamp) <= 2 * 60 * 60 * 1000
              : true;
        return matchesCategory && matchesSearch && matchesFeedFilter;
      })
      .sort((a, b) => {
        // Emergencies always float to top regardless of sort mode
        if (a.category === 'emergency' && b.category !== 'emergency') return -1;
        if (b.category === 'emergency' && a.category !== 'emergency') return 1;
        if (sortBy === 'newest') return b.timestamp - a.timestamp;
        if (sortBy === 'oldest') return a.timestamp - b.timestamp;
        if (sortBy === 'verified') {
          const score: Record<string, number> = { community_confirmed: 3, multiple_reports: 2, pending_review: 1, unverified: 0 };
          return score[b.verified_status] - score[a.verified_status];
        }
        return 0;
      });
  }, [incidents, debouncedSearch, selectedCategory, feedFilter, sortBy]);

  const neighborhoodPulse = useNeighborhoodPulse(incidents);
  const criticalCount = filteredIncidents.filter(i => i.verified_status === 'multiple_reports').length;
  const activeCount = filteredIncidents.filter(i => i.verified_status === 'unverified').length;
  const resolvedCount = filteredIncidents.filter(i => i.verified_status === 'community_confirmed').length;

  // Count-up animation for total count
  const countValue = useSpring(0, { stiffness: 50, damping: 20 });
  const displayCount = useTransform(countValue, (latest) => Math.floor(latest));

  useEffect(() => {
    countValue.set(filteredIncidents.length);
  }, [filteredIncidents.length, countValue]);

  useEffect(() => {
    if (activeIncidentId && cardRefs.current[activeIncidentId]) {
      cardRefs.current[activeIncidentId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIncidentId]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-r border-[#C9D8E4] bg-[#F8FAFC] lg:w-[23rem]">
      <div className="h-1 w-full shrink-0 bg-[#4A90D9]" />
      
      <div className="border-b border-[#D8E2EA] bg-[#F8FAFC] px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F3FC]">
            <img src="/icon.svg" alt="" width={24} height={24} className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black tracking-[-0.025em] text-[#0B1F33]">Calgary Watch</h1>
            <p className="mt-0.5 text-[11px] font-semibold text-[#52697D]">Community incident map</p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-[#176A5D]">
              <span className="size-1.5 rounded-full bg-[#2E8B7A]" aria-hidden="true" /> Live
            </span>
            <span className="mt-0.5 block text-[9px] font-semibold tabular-nums text-[#6B8296]">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-4 pt-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B8296] transition-colors group-focus-within:text-[#286FAF]" size={16} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search reports or areas"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 w-full rounded-xl border border-[#C9D8E4] bg-[#FFFFFF] py-2.5 pl-10 pr-4 text-sm font-medium text-[#0B1F33] placeholder:text-[#6B8296] focus:border-[#4A90D9] focus:outline-none focus:ring-2 focus:ring-[#4A90D9]/25"
          />
        </div>
        <div className="flex h-11 min-w-[62px] flex-col items-center justify-center rounded-xl bg-[#0B1F33] px-3">
          <span className="text-[8px] font-black uppercase tracking-[0.12em] leading-none text-[#AFC5D9]">Shown</span>
          <motion.span className="mt-1 text-base font-black leading-none tabular-nums text-[#F7FBFF]">
            {displayCount}
          </motion.span>
        </div>
      </div>

      {onTimeWindowChange && timeWindow && (
        <div className="px-4 pt-3">
          <TimeWindowFilter value={timeWindow} onChange={onTimeWindowChange} />
        </div>
      )}

      <div className="grid shrink-0 grid-cols-3 gap-1.5 border-b border-[#D8E2EA] px-4 py-3">
        {categories.map((cat) => {
          const count = cat.id === 'all' 
            ? incidents.length 
            : incidents.filter(i => i.category === cat.id).length;
          const Icon = cat.icon;
          
          return (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id as any)}
              className={cn(
                'category-chip flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-[10px] font-bold transition-colors',
                selectedCategory === cat.id
                  ? 'border-[#286FAF] bg-[#286FAF] text-[#F7FBFF]'
                  : 'border-[#C9D8E4] bg-[#FFFFFF] text-[#40566B] hover:border-[#8DBBDB] hover:bg-[#E8F3FC]'
              )}
            >
              <Icon size={13} className={selectedCategory === cat.id ? 'text-[#F7FBFF]' : 'text-[#52697D]'} />
              <span className="truncate">{cat.label}</span>
              <span className={cn(
                'rounded-md px-1.5 py-0.5 text-[9px] font-black tabular-nums',
                selectedCategory === cat.id ? 'bg-[rgba(255,255,255,0.18)] text-[#F7FBFF]' : 'bg-[#EEF4F8] text-[#52697D]'
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Collapsible desktop feed controls */}
      <div className="border-b border-[#D8E2EA] bg-[#F2F6F9]">
        <button
          type="button"
          onClick={() => setControlsCollapsed((prev) => !prev)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#E8F3FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4A90D9]"
          aria-expanded={!controlsCollapsed}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#C9D8E4] bg-[#FFFFFF] text-[#286FAF]">
            <SlidersHorizontal size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-[#0B1F33]">Feed controls</span>
              {(feedFilter || searchQuery || selectedCategory !== 'all') && (
                <span className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-blue-300 light:text-blue-700">
                  Filtered
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[10px] font-semibold text-[#52697D]">
              {sortBy === 'newest' ? 'Newest first' : sortBy === 'oldest' ? 'Oldest first' : 'Most verified'} · {feedFilter ? `${feedFilter === 'community' ? 'Community' : 'Recent 2h'} on` : 'All posts'} · {neighborhoodPulse.length} pulse areas
            </p>
          </div>
          <ChevronDown
            size={16}
            className={cn(
              'shrink-0 text-slate-500 transition-transform',
              !controlsCollapsed && 'rotate-180'
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {!controlsCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                      <span className="text-[10px] font-bold text-slate-400 light:text-slate-600 uppercase tracking-tighter">
                        {criticalCount} Critical
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                      <span className="text-[10px] font-bold text-slate-400 light:text-slate-600 uppercase tracking-tighter">
                        {activeCount} Active
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                      <span className="text-[10px] font-bold text-slate-400 light:text-slate-600 uppercase tracking-tighter">
                        {resolvedCount} Resolved
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 light:text-slate-700 uppercase tracking-widest">Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-slate-900 light:bg-white border border-white/10 light:border-slate-300 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-300 light:text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/50 light:focus:ring-slate-900/40 cursor-pointer hover:border-white/20 light:hover:border-slate-400 transition-colors"
                  >
                    <option value="newest" className="bg-slate-900">Newest First</option>
                    <option value="oldest" className="bg-slate-900">Oldest First</option>
                    <option value="verified" className="bg-slate-900">Most Verified</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    onClick={() => setFeedFilter((prev) => prev === 'community' ? null : 'community')}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all",
                      feedFilter === 'community'
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                        : "bg-white/5 light:bg-white text-slate-400 light:text-slate-700 border-white/10 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-50"
                    )}
                    title="Show only real community user posts, including older posts that are still stored"
                  >
                    Community {feedFilter === 'community' ? 'On' : 'Off'}
                  </button>

                  <button
                    onClick={() => setFeedFilter((prev) => prev === 'recent' ? null : 'recent')}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all",
                      feedFilter === 'recent'
                        ? "bg-blue-500/20 text-blue-400 border-blue-500/40 light:bg-slate-900 light:text-white light:border-slate-900"
                        : "bg-white/5 light:bg-white text-slate-400 light:text-slate-700 border-white/10 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-50"
                    )}
                    title="Show incidents from the last 2 hours (R)"
                  >
                    Recent 2h {feedFilter === 'recent' ? 'On' : 'Off'}
                  </button>

                  {(feedFilter || searchQuery || selectedCategory !== 'all') && (
                    <button
                      onClick={() => {
                        setFeedFilter(null);
                        setSearchQuery('');
                        onCategoryChange('all');
                      }}
                      className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border border-white/10 light:border-slate-300 text-slate-400 light:text-slate-700 hover:bg-white/10 light:hover:bg-slate-50 transition-all"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                {neighborhoodPulse.length > 0 && (
                  <div className="pt-2 border-t border-white/5 light:border-slate-200">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <Activity size={12} className="text-blue-400" />
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live Area Pulse · 2h</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {neighborhoodPulse.map(({ name, count, level }) => {
                        const cfg = RISK_CONFIG[level];
                        return (
                          <div
                            key={name}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold',
                              cfg.bg,
                              'border-white/5 light:border-slate-200'
                            )}
                            title={`${count} incident${count !== 1 ? 's' : ''} in the last 2h`}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
                            <span className="text-white light:text-slate-800 truncate max-w-[90px]">{name}</span>
                            <span className={cn('font-black', cfg.text)}>{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-3 custom-scrollbar">
        <motion.div
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: {
                staggerChildren: 0.1
              }
            }
          }}
          initial="hidden"
          animate="show"
          className="space-y-2.5"
        >
          <AnimatePresence>
            {filteredIncidents.length > 0 ? (
              filteredIncidents.map((incident) => {
                const Icon = CATEGORY_ICONS[incident.category as keyof typeof CATEGORY_ICONS] || AlertCircle;
                const StatusIcon = STATUS_ICONS[incident.verified_status];
                const isActive = activeIncidentId === incident.id;
                const isNew = Date.now() - incident.timestamp < 30 * 60 * 1000;

                const isEmergency = incident.category === 'emergency';

                return (
                  <motion.div
                    key={incident.id}
                    ref={(el) => { cardRefs.current[incident.id] = el; }}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      show: { opacity: 1, y: 0 }
                    }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => onIncidentClick(incident)}
                  >
                    <div className={cn(
                      'group relative cursor-pointer overflow-hidden rounded-2xl border bg-[#FFFFFF] p-4 transition-[border-color,background-color,box-shadow,transform] duration-200 active:scale-[0.99]',
                      isEmergency
                        ? 'border-[#E7A8A0] bg-[#FFF4F1]'
                        : isActive
                        ? 'border-[#4A90D9] bg-[#E8F3FC] shadow-[0_0_0_2px_rgba(74,144,217,0.16)]'
                        : 'border-[#D8E2EA] hover:border-[#8DBBDB] hover:bg-[#F4F8FB]'
                    )}>
                      {/* Emergency banner */}
                      {isEmergency && (
                        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-[#B42318] px-2 py-1">
                          <Siren size={10} className="text-[#F7FBFF]" />
                          <span className="text-[8px] font-black uppercase tracking-widest text-[#F7FBFF]">SOS</span>
                        </div>
                      )}

                      <div className={cn('flex gap-3', isEmergency && 'pt-5')}>
                        <div className="flex-1 min-w-0">
                          <div className="flex gap-3">
                            <div className={cn(
                              'flex size-10 shrink-0 items-center justify-center rounded-xl',
                              isEmergency ? 'bg-[#FADBD7] text-[#B42318]' :
                              incident.category === 'crime' ? 'bg-[#FDE8E6] text-[#C0392B]' :
                              incident.category === 'traffic' ? 'bg-[#FFF0E4] text-[#C65514]' :
                              incident.category === 'infrastructure' ? 'bg-[#E8F3FC] text-[#286FAF]' :
                              'bg-[#E7F5F2] text-[#176A5D]'
                            )}>
                              <Icon size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col gap-1">
                                {/* Title takes the full width and the badges wrap
                                    beneath it. Sharing one row meant the badge
                                    group squeezed the heading into a narrow
                                    column, so ordinary 511 titles clamped down to
                                    "RestrictionClass on Queen…" and lost the road
                                    name — the one part a reader needs. */}
                                <div className="flex flex-col gap-1.5">
                                  <h3 className="line-clamp-2 text-sm font-black leading-tight tracking-[-0.01em] text-[#0B1F33] transition-colors group-hover:text-[#174A6E]">{incident.title}</h3>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {/* Sample reports are labelled before any other
                                        source badge — it is the most important thing
                                        to know about the row. */}
                                    {incident.data_source === 'demo' && <DemoBadge size="xs" />}
                                    {/* Data-source badge — only for non-community reports */}
                                    {incident.source_type === 'reddit_calgary' && (
                                      <span className="px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-500/30 text-[8px] font-black text-orange-400 uppercase tracking-tighter">
                                        Reddit
                                      </span>
                                    )}
                                    {incident.source_type === 'news_rss' && (
                                      <span className="px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-[8px] font-black text-purple-400 uppercase tracking-tighter">
                                        News
                                      </span>
                                    )}
                                    {incident.data_source === 'official' && incident.source_type !== 'reddit_calgary' && incident.source_type !== 'news_rss' && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-[8px] font-black text-blue-400 uppercase tracking-tighter">
                                        Official
                                      </span>
                                    )}
                                    {incident.data_source === 'system' && (
                                      <span className="px-1.5 py-0.5 rounded bg-slate-500/20 border border-slate-500/30 text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                                        Auto
                                      </span>
                                    )}
                                    {isNew && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-500 text-[8px] font-black text-white uppercase tracking-tighter animate-pulse">
                                        New
                                      </span>
                                    )}
                                    <div className="flex size-7 items-center justify-center rounded-lg bg-[#EEF4F8] text-[#52697D] transition-colors group-hover:bg-[#286FAF] group-hover:text-[#F7FBFF]">
                                      <Maximize2 size={12} />
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[10px] font-medium text-[#6B8296]">
                                  {formatDistanceToNow(incident.timestamp)} ago • {incident.neighborhood || 'Calgary'} • by {getReporterDisplay(incident).firstName}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-2 flex gap-3">
                            {incident.image_url && (
                              <img
                                src={incident.image_url}
                                alt=""
                                className="h-16 w-16 shrink-0 rounded-xl border border-white/10 object-cover light:border-slate-200"
                                loading="lazy"
                              />
                            )}
                            <p className="line-clamp-3 text-xs leading-relaxed text-[#52697D]">{incident.description}</p>
                          </div>
                          
                          <div className="flex items-center justify-between mt-3">
                            <div className={cn(
                              'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium',
                              incident.verified_status === 'community_confirmed' ? 'bg-green-500/20 text-green-400' :
                              incident.verified_status === 'multiple_reports' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-slate-500/20 text-slate-400'
                            )}>
                              {StatusIcon && <StatusIcon size={12} />}
                              {incident.verified_status?.replace('_', ' ') || 'Unverified'}
                            </div>
                            
                            {/* Neighborhood Initial Circle Thumbnail */}
                            <div className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-full border border-[#FFFFFF] text-[#F7FBFF]',
                              isEmergency ? 'bg-[#B42318]' :
                              incident.category === 'crime' ? 'bg-[#C0392B]' :
                              incident.category === 'traffic' ? 'bg-[#C65514]' :
                              incident.category === 'infrastructure' ? 'bg-[#286FAF]' :
                              'bg-[#2E8B7A]'
                            )}>
                              {getReporterDisplay(incident).anonymous ? (
                                <User size={14} />
                              ) : (
                                <span className="text-xs font-black">
                                  {getReporterDisplay(incident).initial}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-4"
              >
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                  <Search size={32} className="text-slate-600" />
                </div>
                <div className="space-y-2">
                  {(debouncedSearch || selectedCategory !== 'all' || feedFilter) ? (
                    <>
                      <h3 className="text-white font-bold">No reports match</h3>
                      <p className="text-slate-500 text-xs leading-relaxed">
                        Try clearing your filters or searching a different term.
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          onCategoryChange('all');
                          setFeedFilter(null);
                        }}
                        className="text-blue-400 text-[10px] font-bold uppercase tracking-widest hover:text-blue-300 transition-colors"
                      >
                        Clear all filters
                      </button>
                    </>
                  ) : (
                    <>
                      <h3 className="text-white font-bold">All clear right now</h3>
                      <p className="text-slate-500 text-xs leading-relaxed max-w-[200px]">
                        No incidents reported in Calgary at the moment. Be the first to report something you see.
                      </p>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore || !onLoadMore}
            className="w-full mt-2 py-2 rounded-xl border border-white/10 light:border-slate-300 bg-white/5 light:bg-white text-[10px] font-bold uppercase tracking-widest text-slate-300 light:text-slate-700 hover:bg-white/10 light:hover:bg-slate-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? 'Loading More...' : 'Load Older Reports'}
          </button>
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-white/5 light:border-slate-200 bg-slate-950/30 light:bg-white">
        <p className="text-[9px] text-slate-500 light:text-slate-700 font-bold uppercase tracking-[0.2em] text-center">
          Powered by Calgary Watch • Community Safety Platform
        </p>
      </div>
    </div>
  );
}
