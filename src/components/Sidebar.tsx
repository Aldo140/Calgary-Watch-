import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TimeWindowFilter, type TimeWindow } from '@/src/components/TimeWindowFilter';
import { Incident, IncidentCategory, CATEGORY_ICONS, STATUS_ICONS, isCommunityFacingIncident } from '@/src/types';
import { formatDistanceToNow } from 'date-fns';
import { Search, Layers, Maximize2, AlertCircle, Car, Construction, CloudRain, User, Siren, Activity, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { cn, publicAsset } from '@/src/lib/utils';
import { categoryColor } from '@/src/lib/tokens';
import { motion, AnimatePresence, useSpring, useTransform } from 'motion/react';
import { useNeighborhoodPulse, RISK_CONFIG } from '@/src/hooks/useNeighborhoodPulse';
import DesktopMapBrandMark from '@/src/components/DesktopMapBrandMark';

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

  // Read-only at mount — this key is shared with the mobile sheet
  // (MobileMapSheet.tsx), which also writes 'nearest', a mode this sidebar's
  // <select> doesn't offer. A previous version of this effect had a sibling
  // write effect keyed on [sortBy]/[feedFilter] that fired on every mount
  // with whatever the state had just been initialised to, clobbering a
  // stored 'nearest' (or any feedFilter) back to the default before the
  // reader ever touched a control. Persisting now happens only from the
  // explicit-choice handlers below, never from an effect watching state.
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
      // One-time migration cleanup of keys this app no longer reads.
      localStorage.removeItem('cw_verifiedOnly');
      localStorage.removeItem('cw_recentOnly');
    } catch {}
  }, []);

  const persistSortBy = useCallback((next: 'newest' | 'oldest' | 'verified') => {
    setSortBy(next);
    try { localStorage.setItem('cw_sortBy', next); } catch {}
  }, []);

  const persistFeedFilter = useCallback((next: 'community' | 'recent' | null) => {
    setFeedFilter(next);
    try {
      if (next) localStorage.setItem('cw_feedFilter', next);
      else localStorage.removeItem('cw_feedFilter');
    } catch {}
  }, []);

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
            ? isCommunityFacingIncident(i)
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
    <div className="flex h-full w-full flex-col overflow-hidden border-r border-[#C9D8E4] bg-[#FFFDF8] lg:w-[23rem]">
      {/* ── Masthead ──────────────────────────────────────────────────────
          Layer 2 of the design system: the poster's *devices* on the rail's
          own ground. Deep navy, a coordinate stamp in the mono label register,
          a display headline, and the skyline linocut as a watermark. No
          vermilion — this panel sits beside incident severity. */}
      <div className="relative shrink-0 overflow-hidden bg-[#06162F] px-5 pb-4 pt-3.5">
        <img
          src={publicAsset('images/illustration/calgary-skyline-rule-light.webp')}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[4.5rem] w-full select-none object-cover opacity-[0.16]"
        />

        <div className="relative flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#AFC5DF]">
            51.05°N · 114.07°W
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#7FDCC6]">
            <span className="size-1.5 bg-[#7FDCC6]" aria-hidden="true" />
            Live · {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="relative mt-4 flex items-center gap-3.5">
          <DesktopMapBrandMark tone="dark" />
          <div className="min-w-0">
            <p className="font-display text-[25px] font-black leading-none tracking-[-0.03em] text-[#F2EFE8]">
              Calgary Watch
            </p>
            <p className="mt-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#AFC5DF]">
              Community incident map
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-4 pt-4">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6B7D] transition-colors group-focus-within:text-[#4A90D9]" size={16} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search reports or areas"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 w-full border-[1.5px] border-[#C9D8E4] bg-[#FFFDF8] py-2.5 pl-10 pr-4 text-sm font-medium text-[#0B1F33] placeholder:text-[#5A6B7D] focus:border-[#4A90D9] focus:outline-none focus:ring-2 focus:ring-[#4A90D9]/25"
          />
        </div>
        <div className="flex h-11 min-w-[62px] flex-col items-center justify-center bg-[#06162F] px-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] leading-none text-[#AFC5DF]">Shown</span>
          <motion.span className="mt-1 font-display text-[17px] font-black leading-none tabular-nums text-[#F2EFE8]">
            {displayCount}
          </motion.span>
        </div>
      </div>

      {onTimeWindowChange && timeWindow && (
        <div className="px-4 pt-3">
          <TimeWindowFilter value={timeWindow} onChange={onTimeWindowChange} />
        </div>
      )}

      <div className="grid shrink-0 grid-cols-3 gap-1.5 border-b border-[#C9D8E4] px-4 py-3">
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
                'category-chip flex h-10 min-w-0 items-center justify-center gap-1 border-[1.5px] px-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.02em] transition-colors',
                selectedCategory === cat.id
                  ? 'border-[#06162F] bg-[#06162F] text-[#F2EFE8]'
                  : 'border-[#C9D8E4] bg-[#FFFDF8] text-[#5A6B7D] hover:border-[#4A90D9] hover:bg-[#E8F3FC]'
              )}
            >
              <Icon size={13} className={selectedCategory === cat.id ? 'text-[#F2EFE8]' : 'text-[#5A6B7D]'} />
              <span className="truncate">{cat.label}</span>
              <span className={cn(
                // 9px is fine for a decorative eyebrow but not for a figure a
                // reader is meant to compare across chips — these counts are
                // the point of the filter row.
                'px-1 py-0.5 font-sans text-[11px] font-black tabular-nums tracking-normal',
                selectedCategory === cat.id ? 'bg-[rgba(242,239,232,0.2)] text-[#F2EFE8]' : 'bg-[#E8F3FC] text-[#5A6B7D]'
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Collapsible desktop feed controls */}
      <div className="border-b border-[#C9D8E4] bg-[#F7F3EA]">
        <button
          type="button"
          onClick={() => setControlsCollapsed((prev) => !prev)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#E8F3FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4A90D9]"
          aria-expanded={!controlsCollapsed}
        >
          <div className="flex size-8 shrink-0 items-center justify-center border-[1.5px] border-[#C9D8E4] bg-[#FFFDF8] text-[#4A90D9]">
            <SlidersHorizontal size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#0B1F33]">Feed controls</span>
              {(feedFilter || searchQuery || selectedCategory !== 'all') && (
                <span className="bg-[#06162F] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#F2EFE8]">
                  Filtered
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-[10px] font-semibold text-[#5A6B7D]">
              {sortBy === 'newest' ? 'Newest first' : sortBy === 'oldest' ? 'Oldest first' : 'Most verified'} · {feedFilter ? `${feedFilter === 'community' ? 'Community' : 'Recent 2h'} on` : 'All posts'} · {neighborhoodPulse.length} pulse areas
            </p>
          </div>
          <ChevronDown
            size={16}
            className={cn(
              'shrink-0 text-[#5A6B7D] transition-transform',
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
                      <div className="w-1.5 h-1.5 bg-[#C0392B]" />
                      <span className="font-mono text-[10px] font-bold text-[#5A6B7D] uppercase tracking-[0.1em]">
                        {criticalCount} Critical
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-[#C77F18]" />
                      <span className="font-mono text-[10px] font-bold text-[#5A6B7D] uppercase tracking-[0.1em]">
                        {activeCount} Active
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-[#2E8B7A]" />
                      <span className="font-mono text-[10px] font-bold text-[#5A6B7D] uppercase tracking-[0.1em]">
                        {resolvedCount} Resolved
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-[#5A6B7D] uppercase tracking-[0.18em]">Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(e) => persistSortBy(e.target.value as any)}
                    className="bg-[#FFFDF8] border-[1.5px] border-[#C9D8E4] px-2.5 py-1.5 text-[10px] font-bold text-[#1C2B3A] focus:outline-none focus:ring-1 focus:ring-[#4A90D9]/50 cursor-pointer hover:border-[#4A90D9] transition-colors"
                  >
                    <option value="newest" style={{ background: '#FFFDF8', color: '#1C2B3A' }}>Newest First</option>
                    <option value="oldest" style={{ background: '#FFFDF8', color: '#1C2B3A' }}>Oldest First</option>
                    <option value="verified" style={{ background: '#FFFDF8', color: '#1C2B3A' }}>Most Verified</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    onClick={() => persistFeedFilter(feedFilter === 'community' ? null : 'community')}
                    className={cn(
                      "px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] border-[1.5px] transition-all",
                      feedFilter === 'community'
                        ? "bg-[#2E8B7A] text-[#FFFDF8] border-[#2E8B7A]"
                        : "bg-[#FFFDF8] text-[#5A6B7D] border-[#C9D8E4] hover:bg-[#E8F3FC]"
                    )}
                    title="Show only real community user posts, including older posts that are still stored"
                  >
                    Community {feedFilter === 'community' ? 'On' : 'Off'}
                  </button>

                  <button
                    onClick={() => persistFeedFilter(feedFilter === 'recent' ? null : 'recent')}
                    className={cn(
                      "px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] border-[1.5px] transition-all",
                      feedFilter === 'recent'
                        ? "bg-[#06162F] text-[#F2EFE8] border-[#06162F]"
                        : "bg-[#FFFDF8] text-[#5A6B7D] border-[#C9D8E4] hover:bg-[#E8F3FC]"
                    )}
                    title="Show incidents from the last 2 hours (R)"
                  >
                    Recent 2h {feedFilter === 'recent' ? 'On' : 'Off'}
                  </button>

                  {(feedFilter || searchQuery || selectedCategory !== 'all') && (
                    <button
                      onClick={() => {
                        persistFeedFilter(null);
                        setSearchQuery('');
                        onCategoryChange('all');
                      }}
                      className="px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] border-[1.5px] border-[#C9D8E4] text-[#5A6B7D] hover:bg-[#E8F3FC] transition-all"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                {neighborhoodPulse.length > 0 && (
                  <div className="pt-2 border-t border-[#C9D8E4]">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <Activity size={12} className="text-[#4A90D9]" />
                      <span className="font-mono text-[10px] font-bold text-[#5A6B7D] uppercase tracking-[0.18em]">Live Area Pulse · 2h</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {neighborhoodPulse.map(({ name, count, level }) => {
                        const cfg = RISK_CONFIG[level];
                        return (
                          <div
                            key={name}
                            className={cn(
                              'flex items-center gap-1.5 border-[1.5px] border-[#C9D8E4] px-2.5 py-1 text-[10px] font-bold',
                              cfg.bg,
                            )}
                            title={`${count} incident${count !== 1 ? 's' : ''} in the last 2h`}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
                            <span className="text-[#1C2B3A] truncate max-w-[90px]">{name}</span>
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
                    {/* Square corners and a 1.5px printed edge instead of a
                        soft rounded card — the "Data" layer borrows the
                        poster's corners and its label register, nothing more. */}
                    <div className={cn(
                      'group relative cursor-pointer overflow-hidden border-[1.5px] bg-[#FFFDF8] p-4 pl-5 transition-[border-color,background-color,box-shadow,transform] duration-200 active:scale-[0.99]',
                      isEmergency
                        ? 'border-[#C0392B] bg-[#FFF4F1]'
                        : isActive
                        ? 'border-[#4A90D9] bg-[#E8F3FC] shadow-[0_0_0_2px_rgba(74,144,217,0.16)]'
                        : 'border-[#C9D8E4] hover:border-[#0B1F33] hover:bg-[#F7F3EA]'
                    )}>
                      {/* Severity spine — the category colour read as a printed
                          rule down the edge of the row. */}
                      <span
                        className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
                        style={{ background: categoryColor(incident.category) }}
                        aria-hidden="true"
                      />

                      {/* Emergency banner */}
                      {isEmergency && (
                        <div className="absolute right-3 top-3 flex items-center gap-1 bg-[#C0392B] px-2 py-1">
                          <Siren size={10} className="text-[#FFFDF8]" />
                          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#FFFDF8]">SOS</span>
                        </div>
                      )}

                      <div className={cn('flex gap-3', isEmergency && 'pt-5')}>
                        <div className="flex-1 min-w-0">
                          <div className="flex gap-3">
                            <div className={cn(
                              'flex size-10 shrink-0 items-center justify-center',
                              isEmergency ? 'bg-[#FADBD7] text-[#C0392B]' :
                              incident.category === 'crime' ? 'bg-[#FDE8E6] text-[#B5442F]' :
                              incident.category === 'traffic' ? 'bg-[#FFF0E4] text-[#C07A2A]' :
                              incident.category === 'infrastructure' ? 'bg-[#E8F3FC] text-[#3E7D8C]' :
                              'bg-[#E7F5F2] text-[#2E8B7A]'
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
                                  <h3 className="line-clamp-2 font-display text-[15px] font-black leading-[1.12] tracking-[-0.02em] text-[#0B1F33] transition-colors group-hover:text-[#4A90D9]">{incident.title}</h3>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {/* Data-source badge — only for non-community reports */}
                                    {/* Source badges share one register: mono,
                                        wide uppercase tracking, square, and an
                                        ink dark enough to read on its own tint.
                                        The old orange-400/purple-400 pairs sat
                                        under 2:1 on this cream card. */}
                                    {incident.source_type === 'reddit_calgary' && (
                                      <span className="border border-[#DCB78C] bg-[#F6E7D6] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#8A4B12]">
                                        Reddit
                                      </span>
                                    )}
                                    {incident.source_type === 'news_rss' && (
                                      <span className="border border-[#C3B2DE] bg-[#EDE6F7] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#573497]">
                                        News
                                      </span>
                                    )}
                                    {incident.data_source === 'official' && incident.source_type !== 'reddit_calgary' && incident.source_type !== 'news_rss' && (
                                      <span className="border border-[#A9C9E6] bg-[#E8F3FC] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#1F5C93]">
                                        Official
                                      </span>
                                    )}
                                    {incident.data_source === 'system' && (
                                      <span className="border border-[#C9D8E4] bg-[#E8F3FC] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#5A6B7D]">
                                        Auto
                                      </span>
                                    )}
                                    {isNew && (
                                      <span className="bg-[#2F6FB0] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFFDF8] animate-pulse">
                                        New
                                      </span>
                                    )}
                                    <div className="flex size-7 items-center justify-center bg-[#E8F3FC] text-[#5A6B7D] transition-colors group-hover:bg-[#0B1F33] group-hover:text-[#F2EFE8]">
                                      <Maximize2 size={12} />
                                    </div>
                                  </div>
                                </div>
                                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#5A6B7D]">
                                  {formatDistanceToNow(incident.timestamp)} ago · {incident.neighborhood || 'Calgary'} · by {getReporterDisplay(incident).firstName}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-2 flex gap-3">
                            {incident.image_url && (
                              <img
                                src={incident.image_url}
                                alt=""
                                className="h-16 w-16 shrink-0 border-[1.5px] border-[#C9D8E4] object-cover"
                                loading="lazy"
                              />
                            )}
                            <p className="line-clamp-3 text-xs leading-relaxed text-[#5A6B7D]">{incident.description}</p>
                          </div>
                          
                          <div className="flex items-center justify-between mt-3">
                            <div className={cn(
                              'flex items-center gap-1 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em]',
                              incident.verified_status === 'community_confirmed' ? 'bg-[#DDEFE8] text-[#1F6154]' :
                              incident.verified_status === 'multiple_reports' ? 'bg-[#F7E9CE] text-[#87560F]' :
                              'bg-[#E8F3FC] text-[#5A6B7D]'
                            )}>
                              {StatusIcon && <StatusIcon size={12} />}
                              {incident.verified_status?.replace('_', ' ') || 'Unverified'}
                            </div>
                            
                            {/* Neighborhood Initial Circle Thumbnail */}
                            <div className={cn(
                              'flex size-8 shrink-0 items-center justify-center border-[1.5px] border-[#FFFDF8] text-[#FFFDF8]',
                              isEmergency ? 'bg-[#C0392B]' :
                              incident.category === 'crime' ? 'bg-[#B5442F]' :
                              incident.category === 'traffic' ? 'bg-[#C07A2A]' :
                              incident.category === 'infrastructure' ? 'bg-[#3E7D8C]' :
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
                <div className="flex h-20 w-20 items-center justify-center border-[1.5px] border-[#C9D8E4] bg-[#F7F3EA]">
                  <Search size={32} className="text-[#5A6B7D]" />
                </div>
                <div className="space-y-2">
                  {(debouncedSearch || selectedCategory !== 'all' || feedFilter) ? (
                    <>
                      <h3 className="font-display text-lg font-black uppercase tracking-[-0.02em] text-[#0B1F33]">No reports match</h3>
                      <p className="text-[#5A6B7D] text-xs leading-relaxed">
                        Try clearing your filters or searching a different term.
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          onCategoryChange('all');
                          persistFeedFilter(null);
                        }}
                        className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#2F6FB0] hover:opacity-70 transition-opacity"
                      >
                        Clear all filters
                      </button>
                    </>
                  ) : (
                    <>
                      <h3 className="font-display text-lg font-black uppercase tracking-[-0.02em] text-[#0B1F33]">All clear right now</h3>
                      <p className="text-[#5A6B7D] text-xs leading-relaxed max-w-[200px]">
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
            /* The rail's one hard-offset press — the poster's signature depth,
               spent on the only action this surface owns. */
            className="mt-3 mb-1 ml-0 w-[calc(100%-4px)] border-[1.5px] border-[#06162F] bg-[#F2EFE8] py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#06162F] shadow-[4px_4px_0_#06162F] transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? 'Loading More...' : 'Load Older Reports'}
          </button>
        )}
      </div>

      {/* Sidebar Footer — the skyline linocut works as the rule above the
          colophon, so the divider is the city rather than a hairline. */}
      <div className="relative shrink-0 overflow-hidden border-t border-[#D6C9B4] bg-[#F7F3EA] px-4 pb-3.5 pt-2">
        <img
          src={publicAsset('images/illustration/calgary-skyline-rule.webp')}
          alt=""
          aria-hidden="true"
          className="pointer-events-none mx-auto block h-7 w-full select-none object-cover opacity-[0.28]"
        />
        <p className="relative mt-1.5 text-center font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#5A6B7D]">
          Calgary Watch · Community safety
        </p>
      </div>
    </div>
  );
}
