import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Incident, IncidentCategory, CATEGORY_ICONS, STATUS_ICONS } from '@/src/types';
import { Card } from '@/src/components/ui/Card';
import { formatDistanceToNow } from 'date-fns';
import { Search, Layers, Maximize2, ShieldCheck, AlertCircle, Car, Construction, CloudRain, UserCircle2, Siren } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence, useSpring, useTransform } from 'motion/react';

interface SidebarProps {
  incidents: Incident[];
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
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
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
      const persistedVerifiedOnly = localStorage.getItem('cw_verifiedOnly');
      const persistedRecentOnly = localStorage.getItem('cw_recentOnly');

      if (persistedSort === 'newest' || persistedSort === 'oldest' || persistedSort === 'verified') {
        setSortBy(persistedSort);
      }
      if (persistedVerifiedOnly === 'true') {
        setVerifiedOnly(true);
      }
      if (persistedRecentOnly === 'true') {
        setRecentOnly(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('cw_sortBy', sortBy); } catch {}
  }, [sortBy]);

  useEffect(() => {
    try { localStorage.setItem('cw_verifiedOnly', String(verifiedOnly)); } catch {}
  }, [verifiedOnly]);

  useEffect(() => {
    try { localStorage.setItem('cw_recentOnly', String(recentOnly)); } catch {}
  }, [recentOnly]);

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
        const matchesVerified = !verifiedOnly || i.verified_status === 'community_confirmed';
        const matchesRecent = !recentOnly || (Date.now() - i.timestamp) <= 2 * 60 * 60 * 1000;
        return matchesCategory && matchesSearch && matchesVerified && matchesRecent;
      })
      .sort((a, b) => {
        // Emergencies always float to top regardless of sort mode
        if (a.category === 'emergency' && b.category !== 'emergency') return -1;
        if (b.category === 'emergency' && a.category !== 'emergency') return 1;
        if (sortBy === 'newest') return b.timestamp - a.timestamp;
        if (sortBy === 'oldest') return a.timestamp - b.timestamp;
        if (sortBy === 'verified') {
          const score = { community_confirmed: 3, multiple_reports: 2, unverified: 1 };
          return score[b.verified_status] - score[a.verified_status];
        }
        return 0;
      });
  }, [incidents, debouncedSearch, selectedCategory, verifiedOnly, recentOnly, sortBy]);

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
    <div className="flex flex-col h-full w-full lg:w-[22rem] bg-slate-950/50 light:bg-white/95 backdrop-blur-2xl border-r border-white/5 light:border-slate-200 overflow-hidden shadow-2xl z-20">
      {/* Calgary Watch brand gradient - sky blue → Bow River teal (dark) / mountain stone → night (light) */}
      <div
        className="h-1.5 w-full shrink-0"
        style={{
          background: 'linear-gradient(to right, #4A90D9, #2E8B7A, #D4A843)',
        }}
      />
      
      <div className="p-6 border-b border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-purple-600/10 z-0" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="text-blue-400 light:text-slate-900" />
            Calgary Watch
          </h1>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Feed</span>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 flex items-center gap-3">
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 light:group-focus-within:text-slate-900 transition-colors" size={16} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search reports or neighborhood... (Press /)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 light:bg-white light:border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white light:text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 light:focus:ring-slate-900/40 focus:border-blue-500/50 light:focus:border-slate-900/40 transition-all"
          />
        </div>
        <div className="flex flex-col items-center justify-center bg-blue-500/10 border border-blue-500/20 light:bg-slate-900 light:border-slate-900 rounded-xl px-3 py-2 min-w-[56px]">
          <span className="text-[10px] font-bold text-blue-400 light:text-white uppercase tracking-tighter leading-none">Total</span>
          <motion.span className="text-lg font-black text-white leading-none mt-1">
            {displayCount}
          </motion.span>
        </div>
      </div>

      <div className="pl-8 pr-6 py-4 flex gap-2 overflow-x-auto no-scrollbar shrink-0 border-b border-white/5 light:border-slate-200 scroll-smooth items-center min-w-0 snap-x scroll-px-8">
        <div className="w-2 shrink-0" />
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
                'category-chip px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-tight transition-all whitespace-nowrap flex items-center gap-2 border shrink-0 snap-start',
                selectedCategory === cat.id
                  ? 'category-chip-selected bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/20'
                  : 'bg-slate-800/50 text-slate-400 border-white/5 hover:bg-slate-800 hover:border-white/10 light:bg-white light:text-slate-700 light:border-slate-300 light:hover:bg-slate-100'
              )}
            >
              <Icon size={14} className={cn('category-chip-icon', selectedCategory === cat.id ? "text-white" : "text-blue-400 light:text-slate-700")} />
              <span>{cat.label}</span>
              <span className={cn(
                "category-chip-count text-[9px] px-1.5 py-0.5 rounded-full font-black",
                selectedCategory === cat.id ? "bg-white/20 text-white" : "bg-white/10 text-slate-500"
              )}>
                {count}
              </span>
            </button>
          );
        })}
        <div className="w-8 shrink-0" />
      </div>

      {/* Stats and Sorting */}
      <div className="px-4 py-3 bg-slate-900/40 light:bg-slate-100 border-b border-white/5 light:border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
              <span className="text-[10px] font-bold text-slate-400 light:text-slate-600 uppercase tracking-tighter">
                {incidents.filter(i => i.verified_status === 'multiple_reports').length} Critical
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
              <span className="text-[10px] font-bold text-slate-400 light:text-slate-600 uppercase tracking-tighter">
                {incidents.filter(i => i.verified_status === 'unverified').length} Active
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              <span className="text-[10px] font-bold text-slate-400 light:text-slate-600 uppercase tracking-tighter">
                {incidents.filter(i => i.verified_status === 'community_confirmed').length} Resolved
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
            onClick={() => setVerifiedOnly((prev) => !prev)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all",
              verifiedOnly
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : "bg-white/5 light:bg-white text-slate-400 light:text-slate-700 border-white/10 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-50"
            )}
            title="Show only community-confirmed incidents (V)"
          >
            Verified Only {verifiedOnly ? 'On' : 'Off'}
          </button>

          <button
            onClick={() => setRecentOnly((prev) => !prev)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all",
              recentOnly
                ? "bg-blue-500/20 text-blue-400 border-blue-500/40 light:bg-slate-900 light:text-white light:border-slate-900"
                : "bg-white/5 light:bg-white text-slate-400 light:text-slate-700 border-white/10 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-50"
            )}
            title="Show incidents from the last 2 hours (R)"
          >
            Recent 2h {recentOnly ? 'On' : 'Off'}
          </button>

          {(verifiedOnly || recentOnly || searchQuery || selectedCategory !== 'all') && (
            <button
              onClick={() => {
                setVerifiedOnly(false);
                setRecentOnly(false);
                setSearchQuery('');
                onCategoryChange('all');
              }}
              className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide border border-white/10 light:border-slate-300 text-slate-400 light:text-slate-700 hover:bg-white/10 light:hover:bg-slate-50 transition-all"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
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
          className="space-y-4"
        >
          <AnimatePresence mode="popLayout">
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
                    layout
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      show: { opacity: 1, y: 0 }
                    }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => onIncidentClick(incident)}
                  >
                    <Card className={cn(
                      "cursor-pointer transition-all duration-300 group border bg-white/[0.03] active:scale-[0.98] relative overflow-hidden light:bg-white light:border-slate-200 hover:scale-[1.02]",
                      isEmergency
                        ? "border-red-500/60 bg-red-950/30 shadow-xl shadow-red-600/20 ring-1 ring-red-500/30"
                        : isActive
                        ? "border-blue-500 bg-blue-500/10 shadow-xl shadow-blue-500/20 ring-1 ring-blue-500/50 animate-active-glow light:border-slate-900 light:bg-slate-900/5 light:ring-slate-900/50"
                        : "border-white/5 hover:bg-white/10 hover:border-white/10 hover:shadow-xl hover:shadow-blue-500/5 light:hover:bg-slate-50 light:hover:shadow-lg light:hover:shadow-slate-300/50"
                    )}>
                      {/* Category Indicator Border */}
                      <div className={cn(
                        "absolute left-0 top-0 bottom-0 w-1 transition-all",
                        isEmergency ? 'bg-red-600 animate-pulse' :
                        incident.category === 'crime' ? 'bg-red-500' :
                        incident.category === 'traffic' ? 'bg-orange-500' :
                        incident.category === 'infrastructure' ? 'bg-blue-500' :
                        'bg-purple-500'
                      )} />

                      {/* Emergency banner */}
                      {isEmergency && (
                        <div className="absolute top-0 right-0 flex items-center gap-1 bg-red-600 px-2 py-0.5 rounded-bl-xl">
                          <Siren size={10} className="text-white animate-pulse" />
                          <span className="text-[8px] font-black uppercase tracking-widest text-white">SOS</span>
                        </div>
                      )}

                      <div className="flex gap-3 pl-1">
                        <div className="flex-1 min-w-0">
                          <div className="flex gap-3">
                            <div className={cn(
                              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110',
                              isEmergency ? 'bg-red-600/30 text-red-400' :
                              incident.category === 'crime' ? 'bg-red-500/20 text-red-400' :
                              incident.category === 'traffic' ? 'bg-orange-500/20 text-orange-400' :
                              incident.category === 'infrastructure' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-purple-500/20 text-purple-400'
                            )}>
                              <Icon size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between gap-2">
                                  <h3 className="text-white text-sm font-bold leading-tight group-hover:text-blue-400 transition-colors light:text-slate-900 line-clamp-2">{incident.title}</h3>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isNew && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-500 text-[8px] font-black text-white uppercase tracking-tighter animate-pulse">
                                        New
                                      </span>
                                    )}
                                    <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                      <Maximize2 size={12} />
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[10px] text-slate-500 font-medium">
                                  {formatDistanceToNow(incident.timestamp)} ago • {incident.neighborhood || 'Calgary'} • by {getReporterDisplay(incident).firstName}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <p className="text-slate-400 text-xs mt-2 leading-relaxed light:text-slate-600 line-clamp-2">{incident.description}</p>
                          
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
                              "w-12 h-12 rounded-full flex items-center justify-center shrink-0 border border-white/20 transition-all group-hover:scale-110 shadow-lg",
                              isEmergency ? 'bg-red-600 text-white ring-2 ring-red-500/50' :
                              incident.category === 'crime' ? 'bg-red-500 text-white' :
                              incident.category === 'traffic' ? 'bg-orange-500 text-white' :
                              incident.category === 'infrastructure' ? 'bg-blue-500 text-white' :
                              'bg-purple-500 text-white'
                            )}>
                              {getReporterDisplay(incident).anonymous ? (
                                <UserCircle2 size={22} />
                              ) : (
                                <span className="text-lg font-black tracking-tighter">
                                  {getReporterDisplay(incident).initial}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
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
                <div className="space-y-1">
                  <h3 className="text-white font-bold">No reports found</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    We couldn't find any reports matching your current filter or search criteria.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    onCategoryChange('all');
                    setVerifiedOnly(false);
                    setRecentOnly(false);
                  }}
                  className="text-blue-400 text-[10px] font-bold uppercase tracking-widest hover:text-blue-300 transition-colors"
                >
                  Clear all filters
                </button>
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
