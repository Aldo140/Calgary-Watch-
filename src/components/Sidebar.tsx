import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TimeWindowFilter, type TimeWindow } from '@/src/components/TimeWindowFilter';
import IncidentRow from '@/src/components/IncidentRow';
import NowBriefing from '@/src/components/map/NowBriefing';
import type { Quadrant } from '@/src/lib/cityQuadrants';
import { Incident, IncidentCategory, isCommunityFacingIncident } from '@/src/types';
import { Search, Layers, AlertCircle, Car, Construction, CloudRain, Siren, Activity, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { cn, publicAsset } from '@/src/lib/utils';
import { categoryColor } from '@/src/lib/tokens';
import { isRecentIncident } from '@/src/lib/feed';
import { calgaryDateTimeFormat } from '@/src/lib/calgaryTz';
import { motion, AnimatePresence } from 'motion/react';
import { useNeighborhoodPulse } from '@/src/hooks/useNeighborhoodPulse';
import DesktopMapBrandMark from '@/src/components/DesktopMapBrandMark';
import '@/src/styles/map-feed.css';

const liveClock = calgaryDateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' });

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
  /** A neighbourhood the reader picked; the briefing then reads "near <area>". */
  areaName?: string;
  /** Reports inside that neighbourhood, so "near <area>" counts only them. */
  briefingIncidents?: Incident[];
  /** Flies the map to a quadrant from the briefing's Across Calgary board. */
  onQuadrant?: (q: Quadrant) => void;
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
  areaName,
  briefingIncidents,
  onQuadrant,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'verified'>('newest');
  const [feedFilter, setFeedFilter] = useState<'community' | 'recent' | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const categories = [
    { id: 'all',            label: 'All',            icon: Layers       },
    { id: 'emergency',      label: 'Emergency',      icon: Siren        },
    { id: 'crime',          label: 'Crime',          icon: AlertCircle  },
    { id: 'traffic',        label: 'Traffic',        icon: Car          },
    { id: 'infrastructure', label: 'Infrastructure', icon: Construction },
    { id: 'weather',        label: 'Weather',        icon: CloudRain    },
  ] as const;

  // The Live pill's clock, on Calgary time, kept current rather than frozen
  // at whatever minute the rail first rendered.
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClockNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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
              ? isRecentIncident(i)
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

  // Trust states describe what neighbours did, so they count neighbour posts
  // only. Public-source rows arrive stamped `community_confirmed` by the
  // pipeline; counting them as "Confirmed" (the old "Resolved") said
  // neighbours had vouched for City traffic data. Demo rows count nowhere.
  const neighbourPosts = filteredIncidents.filter((i) => isCommunityFacingIncident(i) && i.data_source !== 'demo');
  const multipleCount = neighbourPosts.filter(i => i.verified_status === 'multiple_reports').length;
  const unverifiedCount = neighbourPosts.filter(i => i.verified_status === 'unverified').length;
  const confirmedCount = neighbourPosts.filter(i => i.verified_status === 'community_confirmed').length;

  const isFiltered = Boolean(feedFilter || searchQuery || selectedCategory !== 'all');
  const clearFilters = useCallback(() => {
    persistFeedFilter(null);
    setSearchQuery('');
    onCategoryChange('all');
  }, [persistFeedFilter, onCategoryChange]);

  useEffect(() => {
    if (activeIncidentId && cardRefs.current[activeIncidentId]) {
      cardRefs.current[activeIncidentId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIncidentId]);

  return (
    <div className="lv-feed-rail flex h-full w-full flex-col overflow-hidden lg:w-[23rem]">
      {/* ── Masthead ──────────────────────────────────────────────────────
          The site's navy live sky (dot grid + corner glow), the wordmark
          treatment, and the Live pill with a Calgary-time clock. The skyline
          linocut stays as a watermark along the bottom edge. */}
      <header className="lv-feed-mast">
        <img
          src={publicAsset('images/illustration/calgary-skyline-rule-light.webp')}
          alt=""
          aria-hidden="true"
          className="lv-feed-mast-skyline"
        />

        <div className="lv-feed-mast-top">
          <a href="/" className="lv-feed-mast-back">
            ← calgarywatch.ca
          </a>
          <span className="lv-feed-live">
            <span className="lv-feed-pulse" aria-hidden="true" />
            Live · {liveClock.format(clockNow)}
          </span>
        </div>

        <div className="lv-feed-mast-brand">
          <DesktopMapBrandMark tone="dark" />
          <div className="min-w-0">
            <p className="lv-feed-mast-title">
              Community Watch<span className="lv-feed-mast-dot" aria-hidden="true">•</span>
            </p>
            <p className="lv-feed-mast-sub">
              Calgary’s live safety map · <a href="/community">How it works</a>
            </p>
          </div>
        </div>
      </header>

      <div className="lv-feed-rail-tools">
        <div className="lv-feed-search">
          <Search className="lv-feed-search-icon" size={18} aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search reports or areas"
            aria-label="Search reports or areas"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className="lv-feed-search-count" title="Reports shown in the list">
            <b>{filteredIncidents.length}</b> shown
          </span>
        </div>

        {onTimeWindowChange && timeWindow && (
          <TimeWindowFilter value={timeWindow} onChange={onTimeWindowChange} className="mt-2.5" />
        )}
      </div>

      <div ref={scrollContainerRef} className="lv-feed-rail-scroll custom-scrollbar">
        <NowBriefing
          incidents={briefingIncidents ?? incidents}
          window={timeWindow ?? 'all'}
          areaName={briefingIncidents ? areaName : undefined}
          onQuadrant={onQuadrant}
          /* No onSelectCategory here: the category chips right below are
             the filter, so the briefing lists its categories as plain text. */
        />

        <div className="lv-feed-chips" role="group" aria-label="Filter reports by category">
          {categories.map((cat) => {
            const count = cat.id === 'all'
              ? incidents.length
              : incidents.filter(i => i.category === cat.id).length;
            const Icon = cat.icon;
            const pressed = selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => onCategoryChange(cat.id as IncidentCategory | 'all')}
                className="category-chip lv-feed-chip"
              >
                {cat.id === 'all'
                  ? <Icon size={16} aria-hidden="true" />
                  : <i className="lv-feed-chip-dot" style={{ background: categoryColor(cat.id) }} aria-hidden="true" />}
                <span>{cat.label}</span>
                <b>{count}</b>
              </button>
            );
          })}
        </div>

        {/* Collapsible feed controls */}
        <div className="lv-feed-controls">
          <button
            type="button"
            onClick={() => setControlsCollapsed((prev) => !prev)}
            className="lv-feed-controls-head"
            aria-expanded={!controlsCollapsed}
          >
            <span className="lv-feed-controls-icon"><SlidersHorizontal size={16} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="lv-feed-controls-title">
                Feed controls
                {isFiltered && <span className="lv-feed-controls-flag">Filtered</span>}
              </span>
              <span className="lv-feed-controls-sum">
                {sortBy === 'newest' ? 'Newest first' : sortBy === 'oldest' ? 'Oldest first' : 'Most verified'} · {feedFilter ? `${feedFilter === 'community' ? 'Neighbours only' : 'Last 2 hours'}` : 'All sources'}
              </span>
            </span>
            <ChevronDown size={18} aria-hidden="true" className={cn('lv-feed-controls-chev', !controlsCollapsed && 'rotate-180')} />
          </button>

          <AnimatePresence initial={false}>
            {!controlsCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="lv-feed-controls-body">
                  <p className="lv-feed-trust" title="Neighbour posts in the list. Public-source rows are not counted here.">
                    <span><i className="lv-feed-trust-quiet" aria-hidden="true" />{unverifiedCount} unverified</span>
                    <span><i className="lv-feed-trust-several" aria-hidden="true" />{multipleCount} multiple reports</span>
                    <span><i className="lv-feed-trust-confirmed" aria-hidden="true" />{confirmedCount} confirmed</span>
                  </p>

                  <label className="lv-feed-sort">
                    <span>Sort by</span>
                    <select
                      value={sortBy}
                      onChange={(e) => persistSortBy(e.target.value as 'newest' | 'oldest' | 'verified')}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="verified">Most verified</option>
                    </select>
                  </label>

                  <div className="lv-feed-toggles">
                    <button
                      type="button"
                      aria-pressed={feedFilter === 'community'}
                      onClick={() => persistFeedFilter(feedFilter === 'community' ? null : 'community')}
                      className="lv-feed-toggle"
                      title="Show only posts from neighbours, including older posts that are still stored"
                    >
                      Neighbours only
                    </button>

                    <button
                      type="button"
                      aria-pressed={feedFilter === 'recent'}
                      onClick={() => persistFeedFilter(feedFilter === 'recent' ? null : 'recent')}
                      className="lv-feed-toggle"
                      title="Show reports from the last 2 hours"
                    >
                      Last 2 hours
                    </button>

                    {isFiltered && (
                      <button type="button" onClick={clearFilters} className="lv-feed-toggle lv-feed-toggle-clear">
                        Clear filters
                      </button>
                    )}
                  </div>

                  {neighborhoodPulse.length > 0 && (
                    <div className="lv-feed-pulse-areas">
                      <p className="lv-feed-eyebrow">
                        <Activity size={14} aria-hidden="true" /> Areas with reports · last 2 h
                      </p>
                      <ul>
                        {neighborhoodPulse.map(({ name, count }) => (
                          <li key={name} title={`${count} report${count !== 1 ? 's' : ''} in the last 2 hours`}>
                            <span>{name}</span>
                            <b>{count}</b>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="lv-feed-list" aria-label="Reports">
          {filteredIncidents.length > 0 ? (
            filteredIncidents.map((incident) => (
              <div key={incident.id} ref={(el) => { cardRefs.current[incident.id] = el; }}>
                <IncidentRow
                  incident={incident}
                  distanceKm={null}
                  isActive={activeIncidentId === incident.id}
                  onSelect={onIncidentClick}
                  variant="card"
                  photoUrl={incident.image_url}
                />
              </div>
            ))
          ) : (debouncedSearch || selectedCategory !== 'all' || feedFilter) ? (
            <div className="lv-feed-empty">
              <h3>No reports match</h3>
              <p>Try clearing your filters or searching a different word.</p>
              <button type="button" onClick={clearFilters} className="lv-feed-empty-link">Clear all filters</button>
            </div>
          ) : (
            <div className="lv-feed-empty">
              <img
                src={publicAsset('images/illustration/calgary-bow-emblem.webp')}
                alt=""
                aria-hidden="true"
                className="lv-feed-empty-art"
              />
              <h3>Nothing posted in this window</h3>
              <p>
                A quiet map is normal, and it isn’t proof nothing happened. If you see something
                neighbours should know about, post a report.
              </p>
            </div>
          )}
        </div>

        {hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore || !onLoadMore}
            className="lv-feed-more"
          >
            {isLoadingMore ? 'Loading more…' : 'Load older reports'}
          </button>
        )}
      </div>

      {/* Rail footer — the skyline linocut works as the rule above the
          colophon, so the divider is the city rather than a hairline. */}
      <footer className="lv-feed-rail-foot">
        <img
          src={publicAsset('images/illustration/calgary-skyline-rule.webp')}
          alt=""
          aria-hidden="true"
        />
        <p>CalgaryWatch · Neighbours + public sources</p>
      </footer>
    </div>
  );
}
