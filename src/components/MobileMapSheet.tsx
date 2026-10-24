import {
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search, X, ChevronDown, ChevronUp, Plus, Activity, Layers, Siren, AlertCircle, Car, Construction, CloudRain } from 'lucide-react';
import type { MapTimeWindow } from '@/src/lib/mapTimeWindow';
import { windowWord } from '@/src/components/map/ChromeParts';
import { Incident, IncidentCategory, isCommunityFacingIncident, isPubliclyVisible } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { useNeighborhoodPulse, RISK_CONFIG } from '@/src/hooks/useNeighborhoodPulse';
import IncidentRow from '@/src/components/IncidentRow';
import { useSheetDrag, type SheetState } from '@/src/hooks/useSheetDrag';
import { isRecentIncident, resolveDefaultSort, shouldAutoResolveNearest, sortIncidents, type SortBy } from '@/src/lib/feed';
import { getDistance } from '@/src/lib/geo';
import { CATEGORY, LIVE, MAP } from '@/src/lib/tokens';

const SORT_KEY = 'cw_sortBy';
const FEED_FILTER_KEY = 'cw_feedFilter';

/**
 * Fraction of the viewport the raised sheet occupies.
 *
 * Exported so the page's tap-to-close scrim can size itself off the same
 * number instead of carrying a second `82vh` literal that could drift from
 * this one.
 */
export const RAISED_FRACTION = 0.82;
/**
 * Rough collapsed-rail height, in px — used only to seed `travel` for the
 * very first paint, before the masthead has ever been laid out and measured.
 * It never drives the actual resting position; see the `travel` state below.
 */
const INITIAL_RAIL_ESTIMATE = 66;

// Palette aliases onto MAP so this file holds no hex of its own. Colour is
// applied inline because index.css globally remaps Tailwind colour utilities.
const P = {
  paper: MAP.panel,
  card: MAP.tint,
  ink: MAP.inkDeep,
  soft: MAP.muted,
  line: MAP.lineCool,
  ground: '#06162F',
  onGround: '#F2EFE8',
  eyebrow: '#AFC5DF',
  accent: MAP.accent,
  live: '#7FDCC6',
};

const CATEGORY_OPTIONS = [
  { id: 'all' as const,            label: 'All',     Icon: Layers,       color: LIVE.ink },
  { id: 'emergency' as const,      label: 'Emergency', Icon: Siren,        color: CATEGORY.emergency },
  { id: 'crime' as const,          label: 'Crime',   Icon: AlertCircle,  color: CATEGORY.crime },
  { id: 'traffic' as const,        label: 'Traffic', Icon: Car,          color: CATEGORY.traffic },
  { id: 'infrastructure' as const, label: 'Infra',   Icon: Construction, color: CATEGORY.infrastructure },
  { id: 'weather' as const,        label: 'Weather', Icon: CloudRain,    color: CATEGORY.weather },
] as const;

export interface MapSheetRef {
  /**
   * Raise the sheet and put the caret in the search field in one motion.
   *
   * Called from the chrome's search-shaped button. Focus runs synchronously
   * inside the tap gesture because iOS Safari only opens the keyboard for a
   * synchronous focus on an element already in the DOM — which is why this
   * component's tree stays mounted at the rail rather than being conditionally
   * rendered.
   */
  raiseAndFocusSearch: () => void;
  /** Raise the list without opening the keyboard (the chrome's report count). */
  raise: () => void;
}

export interface MobileMapSheetProps {
  incidents: Incident[];
  /** The one derived feed count, shared with the chrome badge. */
  feedCount: number;
  /** The page's time window; the chrome's chips change it, the sheet names it. */
  timeWindow?: MapTimeWindow;
  onTimeWindowChange?: (v: MapTimeWindow) => void;
  selectedCategory: IncidentCategory | 'all';
  onCategoryChange: (c: IncidentCategory | 'all') => void;
  state: SheetState;
  onStateChange: (s: SheetState) => void;
  userLocation: { lat: number; lng: number } | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onIncidentClick: (i: Incident) => void;
  onNeighbourhoodSelect: (name: string) => void;
  onReportPress: () => void;
  activeIncidentId?: string | null;
  /** Report form open or a pin being placed — translate fully offscreen. */
  hidden: boolean;
  /**
   * Shown at the top of the raised sheet. MapPage mounts <NowBriefing />
   * here ("Tonight near Seton: …") so the first thing the list says is one
   * honest sentence about the window.
   */
  briefing?: ReactNode;
}

const MobileMapSheet = forwardRef<MapSheetRef, MobileMapSheetProps>(function MobileMapSheet(
  {
    incidents,
    feedCount,
    timeWindow = 'all',
    selectedCategory,
    onCategoryChange,
    state,
    onStateChange,
    userLocation,
    hasMore,
    isLoadingMore,
    onLoadMore,
    onIncidentClick,
    onNeighbourhoodSelect,
    onReportPress,
    activeIncidentId,
    hidden,
    briefing,
  },
  ref,
) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [feedFilter, setFeedFilter] = useState<'community' | 'recent' | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const mastheadRef = useRef<HTMLDivElement>(null);

  const isRaised = state === 'raised';
  const hasLocation = Boolean(userLocation);

  /** Skip the spring entirely when the reader has asked for less motion. */
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  ).current;

  // Pixel distance between the two resting positions. Measured, not computed
  // from a formula: the sheet's box is sized in `vh`, which resolves against
  // the *large* viewport, while a formula built from window.innerHeight is
  // the *layout* viewport — the two disagree the moment browser chrome (an
  // iOS toolbar, an Android keyboard) changes the visible area, which made
  // the sheet stop short of raised or refuse to track the finger at all. The
  // seed value below is only a best-effort guess for the very first paint,
  // before the masthead has been laid out; the layout effect corrects it
  // before the browser gets a chance to show that guess on screen.
  const [travel, setTravel] = useState(() =>
    typeof window === 'undefined'
      ? 0
      : Math.max(0, window.innerHeight * RAISED_FRACTION - INITIAL_RAIL_ESTIMATE),
  );
  useLayoutEffect(() => {
    const measure = () => {
      const sheetHeight = sectionRef.current?.offsetHeight ?? 0;
      const mastheadHeight = mastheadRef.current?.offsetHeight ?? 0;
      if (sheetHeight > 0 && mastheadHeight > 0) {
        setTravel(Math.max(0, sheetHeight - mastheadHeight));
        // Publish the rail's real height so bottom-anchored overlays can clear
        // it instead of guessing. Every one of them used to hardcode an offset
        // — the Near Me panel sat at 24px and spent its whole life underneath
        // the rail, buttons and all. The sheet is the only thing that knows
        // this number, and it only knows it by measuring, so it says it out
        // loud. Mirrors --cw-chrome-h, which MapPage publishes for the scrim.
        document.documentElement.style.setProperty('--cw-rail-h', `${mastheadHeight}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    // The masthead's height also moves when web fonts arrive or the count
    // wraps; without this the rail could rest a few pixels short.
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (observer && mastheadRef.current) observer.observe(mastheadRef.current);
    // The sheet's own height follows --cw-chrome-h, which grows when the
    // phone bar gains its alert strip; a stale travel pushed the rail off
    // the bottom of the screen.
    if (observer && sectionRef.current) observer.observe(sectionRef.current);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
    // Re-measures on every rail/raised toggle too, not just resize — the
    // masthead's own content (and so its height) differs slightly between
    // the two states, and this keeps travel matched to whichever variant is
    // currently on screen rather than whatever last happened to be measured.
  }, [state]);

  // Drop --cw-rail-h on unmount only. It cannot live in the measure effect's
  // cleanup, which re-runs on every rail/raised toggle and would remove the
  // property each time before re-publishing it.
  useEffect(() => () => {
    document.documentElement.style.removeProperty('--cw-rail-h');
  }, []);

  const { headerHandlers, listHandlers, offsetY, isDragging } = useSheetDrag({
    state,
    onStateChange,
    scrollRef,
    travel,
    enabled: !hidden,
  });

  useImperativeHandle(ref, () => ({
    raiseAndFocusSearch: () => {
      inputRef.current?.focus({ preventScroll: true });
      onStateChange('raised');
    },
    raise: () => onStateChange('raised'),
  }), [onStateChange]);

  // The raw persisted value, kept current rather than re-read: set once from
  // localStorage on mount, and updated in lockstep by the <select>'s onChange
  // below whenever the reader makes an explicit choice. Using a ref rather
  // than state means the one-time "location just arrived" resolution further
  // down can always see the reader's latest intent without becoming a third
  // effect that has to be kept in sync with it.
  const storedSortRef = useRef<string | null>(null);
  const locationAutoResolvedRef = useRef(false);

  // Resolve the effective sort once at mount. hasLocation here is captured
  // from *this* render only — geolocation resolves asynchronously in
  // MapPage, so it is reliably false on the very first mount, which is
  // exactly what must happen: a stored 'nearest' has to fall back rather
  // than be treated as satisfied. It does not get overwritten by this,
  // because persistence now happens only on user intent (the <select>'s
  // onChange), never from an effect watching sortBy — an effect keyed on
  // sortBy cannot tell "the reader chose this" apart from "this is what we
  // just fell back to," and would happily persist the fallback over a
  // perfectly good stored 'nearest' on every single load.
  useEffect(() => {
    try {
      storedSortRef.current = localStorage.getItem(SORT_KEY);
      const f = localStorage.getItem(FEED_FILTER_KEY);
      if (f === 'community' || f === 'recent') setFeedFilter(f);
    } catch { /* private mode */ }
    setSortBy(resolveDefaultSort(storedSortRef.current, hasLocation));
    // Runs once; location arriving later must not re-sort under the reader
    // on its own — see the effect below for the one narrow exception.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The one-time exception, fired at most once, gated on two conditions:
  //
  // 1. Nothing survives that isn't eligible for 'nearest' — either nothing
  //    valid was persisted at all (a first visit), or what was persisted is
  //    exactly 'nearest' (which fell back to 'newest' above only because
  //    location wasn't known yet). A reader who stored something else
  //    explicit, e.g. 'oldest', keeps it: it is valid and is not 'nearest',
  //    so this condition is false and they are left alone — the preference
  //    they picked, not merely "wasn't nearest", is what must survive.
  // 2. The sheet is still at rest on the rail. Someone who has already
  //    raised it and started reading is by definition mid-read; resolving
  //    again out from under them would resort the list beneath their thumb,
  //    which is exactly what firing on hasLocation alone used to risk. If
  //    they were raised when location arrived, they're left alone entirely
  //    — not deferred until they later lower the sheet, since a resort that
  //    pounces later is the same surprise, just postponed.
  //
  // Together these let a stored 'nearest' actually take effect once location
  // arrives (which storedSortRef alone made impossible, since 'nearest' is a
  // valid SortBy and so always failed a plain isSortBy-only gate) without
  // ever reordering the feed under a reader who is already looking at it.
  // The two-condition check itself lives in shouldAutoResolveNearest, kept
  // pure and tested the same way resolveDefaultSort already is.
  useEffect(() => {
    if (!hasLocation || locationAutoResolvedRef.current) return;
    locationAutoResolvedRef.current = true;
    if (shouldAutoResolveNearest(storedSortRef.current, state === 'rail')) {
      setSortBy(resolveDefaultSort(storedSortRef.current, true));
    }
  }, [hasLocation, state]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Hidden means a form or pin flow owns the screen; drop the query so
  // returning to the sheet is not filtered by something forgotten.
  useEffect(() => {
    if (hidden) setSearch('');
  }, [hidden]);

  const neighborhoodPulse = useNeighborhoodPulse(incidents);
  const latestLead = useMemo(() => {
    let best: Incident | null = null;
    for (const i of incidents) {
      if (i.category !== 'crime' && i.category !== 'emergency') continue;
      if (selectedCategory !== 'all' && i.category !== selectedCategory) continue;
      if (!best || i.timestamp > best.timestamp) best = i;
    }
    return best;
  }, [incidents, selectedCategory]);

  const neighborhoods = useMemo(() => {
    const seen = new Set<string>();
    for (const i of incidents) if (i.neighborhood) seen.add(i.neighborhood);
    return [...seen].sort();
  }, [incidents]);

  const neighborhoodResults = useMemo(() => {
    if (debouncedSearch.length < 2) return [];
    const q = debouncedSearch.toLowerCase();
    return neighborhoods.filter((n) => n.toLowerCase().includes(q)).slice(0, 3);
  }, [debouncedSearch, neighborhoods]);

  const filteredIncidents = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    const matching = incidents
      .filter((i) => isPubliclyVisible(i))
      .filter((i) => selectedCategory === 'all' || i.category === selectedCategory)
      .filter((i) =>
        feedFilter === 'community'
          ? isCommunityFacingIncident(i)
          : feedFilter === 'recent'
            ? isRecentIncident(i)
            : true,
      )
      .filter((i) =>
        !q ||
        i.title.toLowerCase().includes(q) ||
        (i.neighborhood || '').toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q),
      );
    return sortIncidents(matching, sortBy, userLocation);
  }, [incidents, selectedCategory, feedFilter, debouncedSearch, sortBy, userLocation]);

  const distanceFor = useCallback(
    (incident: Incident) =>
      userLocation ? getDistance(userLocation.lat, userLocation.lng, incident.lat, incident.lng) : null,
    [userLocation],
  );

  const hasActiveFilters = Boolean(feedFilter) || Boolean(search) || selectedCategory !== 'all';

  // Same shape as handleSortChange below, and for the same reason: persist
  // only on the reader's explicit choice, never from an effect keyed on the
  // state itself, which cannot tell "the reader chose this" apart from "this
  // is what we just read from storage at mount" and clobbers a stored value
  // on every load.
  const handleFeedFilterChange = useCallback((next: 'community' | 'recent' | null) => {
    setFeedFilter(next);
    try {
      if (next) localStorage.setItem(FEED_FILTER_KEY, next);
      else localStorage.removeItem(FEED_FILTER_KEY);
    } catch { /* private mode */ }
  }, []);

  const clearAllFilters = useCallback(() => {
    handleFeedFilterChange(null);
    setSearch('');
    onCategoryChange('all');
  }, [onCategoryChange, handleFeedFilterChange]);

  const handleNeighborhood = useCallback(
    (name: string) => {
      setSearch('');
      onNeighbourhoodSelect(name);
    },
    [onNeighbourhoodSelect],
  );

  // Persisting here, on the explicit choice, rather than from an effect
  // watching sortBy — see the comment above storedSortRef — is what lets a
  // stored 'nearest' survive a load where location hasn't resolved yet.
  const handleSortChange = useCallback((next: SortBy) => {
    setSortBy(next);
    storedSortRef.current = next;
    try { localStorage.setItem(SORT_KEY, next); } catch { /* private mode */ }
  }, []);

  // Selection routes up to MapPage rather than reaching into the map, so a row
  // tap and a marker tap are the same code path and activeIncidentId is set
  // either way.
  const handleSelect = useCallback((incident: Incident) => onIncidentClick(incident), [onIncidentClick]);

  // Pure pixels, driven by the same measured `travel` the drag hook clamps
  // and thresholds against — no `vh` here, on purpose. Mixing a CSS `vh`
  // resting offset with a `window.innerHeight`-derived drag threshold was
  // the original bug: the two only agreed when no browser UI was expanded.
  // Using one measured number for both makes them agree by construction.
  const translate = hidden ? '110%' : `${(isRaised ? 0 : travel) + offsetY}px`;

  return (
    <section
      ref={sectionRef}
      aria-label="Incident feed"
      aria-hidden={hidden || undefined}
      // `aria-hidden` alone hides the sheet from the accessibility tree but
      // leaves every descendant — search input, chips, rows, footer button —
      // in the tab order and pointer-hit-testable in every browser that
      // doesn't honour `pointer-events: none` for focus. A keyboard user can
      // still Tab into an invisible sheet, and if focus was already inside
      // the search field when a report form opened, it stays parked in an
      // aria-hidden subtree. `inert` removes focusability and hit-testing
      // together — this is exactly what the deleted `visibility: hidden`
      // vaul hack was actually doing.
      inert={hidden}
      // z-[52]: strictly above the chrome bar and the right-edge action
      // column (both z-[51], MapPage.tsx), which are themselves above the
      // tap-to-close scrim (z-[49]). Raising the sheet — rather than lowering
      // the chrome — is deliberate: it keeps Home, near-me, notifications and
      // account tappable in the band the sheet doesn't cover, while nothing
      // floats over the sheet's own masthead/search row where it does.
      className="lv-sheet fixed inset-x-0 bottom-0 z-[52] flex flex-col lg:hidden"
      style={{
        // Raised, it stops just under the phone chrome so the time chips and
        // search entry stay reachable above it.
        height: `min(${RAISED_FRACTION * 100}vh, calc(100dvh - var(--cw-chrome-h, 0px) - 10px))`,
        transform: `translateY(${translate})`,
        transition: isDragging || reducedMotion ? 'none' : 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)',
        pointerEvents: hidden ? 'none' : undefined,
      }}
    >
      {/* ── Masthead (navy peek bar). Always the drag zone; touch-action is
             scoped here and nowhere else. ─────────────────────────────── */}
      <div
        ref={mastheadRef}
        {...headerHandlers}
        className="lv-sheet-head lv-sky shrink-0"
      >
        <button
          type="button"
          className="lv-sheet-handle"
          onClick={() => onStateChange(isRaised ? 'rail' : 'raised')}
          aria-label={isRaised ? 'Lower the feed' : 'Open the feed'}
          aria-expanded={isRaised}
          tabIndex={-1}
        >
          <span aria-hidden="true" />
        </button>

        {!isRaised ? (
          <button
            type="button"
            onClick={() => onStateChange('raised')}
            // The accessible name contains the visible label (WCAG 2.5.3).
            aria-label={`${feedCount} report${feedCount !== 1 ? 's' : ''}, ${windowWord(timeWindow)}: open the feed`}
            aria-expanded={isRaised}
            className="lv-sheet-peek"
          >
            <span className="min-w-0 flex-1">
              <span className="lv-sheet-count block">
                {feedCount} report{feedCount !== 1 ? 's' : ''}
                <small>{windowWord(timeWindow)}</small>
              </span>
              {/* The newest crime or emergency, so the closed sheet already
                  says what is happening rather than only how much. */}
              {latestLead ? (
                <span className="lv-sheet-lead block">
                  <i style={{ background: latestLead.category === 'emergency' ? CATEGORY.emergency : CATEGORY.crime }} aria-hidden="true" />
                  {latestLead.title}
                </span>
              ) : (
                <span className="lv-sheet-window block">Neighbours, police and local news</span>
              )}
            </span>
            <span className="lv-sheet-open" aria-hidden="true">
              List <ChevronUp size={15} strokeWidth={2.6} />
            </span>
          </button>
        ) : (
          <div className="lv-sheet-raised">
            <div className="min-w-0">
              <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: LIVE.cyanOnNavy }}>
                {feedCount} report{feedCount !== 1 ? 's' : ''} · {windowWord(timeWindow)}
              </p>
              <h2>What neighbours reported</h2>
            </div>
            <button
              type="button"
              onClick={() => onStateChange('rail')}
              aria-label="Lower the feed"
              aria-expanded={isRaised}
              className="lv-sheet-down"
            >
              <ChevronDown size={20} />
            </button>
          </div>
        )}
      </div>

      {/* ── Search. Mounted at the rail as well as raised, so focus() can run
             synchronously inside the chrome's tap. ─────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3.5 pb-2.5">
        <label className="lv-sheet-input">
          <Search size={17} className="shrink-0" style={{ color: LIVE.ink }} />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => onStateChange('raised')}
            placeholder="Search reports or neighbourhoods…"
            aria-label="Search reports or neighbourhoods"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="shrink-0 grid size-7 place-items-center rounded-full" style={{ color: LIVE.ink }}>
              <X size={15} />
            </button>
          )}
        </label>
      </div>

      {/* Category chips. Kept mounted at the rail (offscreen) but `inert`, so
          they leave the tab order without unmounting. Never gate the search
          wrapper this way: its synchronous focus() opens the iOS keyboard. */}
      <div className="shrink-0 px-4 pb-2.5" inert={state === 'rail'}>
        <div className="lv-chips pb-1">
          {CATEGORY_OPTIONS.map(({ id, label, Icon, color }) => {
            const count = id === 'all'
              ? incidents.filter((i) => isPubliclyVisible(i)).length
              : incidents.filter((i) => i.category === id && isPubliclyVisible(i)).length;
            const isSelected = selectedCategory === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onCategoryChange(id as IncidentCategory | 'all')}
                className="lv-chip lv-sheet-cat"
              >
                <Icon size={14} strokeWidth={2.3} style={{ color: isSelected ? '#fff' : color }} />
                <span>{label}</span>
                <span className="lv-n">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters — raised only. The time window lives in the phone chrome
          above the sheet, where it also drives the map. */}
      {isRaised && (
        <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 pb-3" style={{ borderBottom: `2px solid ${LIVE.ink}` }}>
          <label className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: LIVE.muted }}>
            Sort
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as SortBy)}
              className="lv-sheet-select cursor-pointer"
            >
              <option value="nearest" disabled={!hasLocation}>
                {hasLocation ? 'Nearest first' : 'Nearest (needs location)'}
              </option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="verified">Most confirmed</option>
            </select>
          </label>
          <button
            type="button"
            aria-pressed={feedFilter === 'community'}
            onClick={() => handleFeedFilterChange(feedFilter === 'community' ? null : 'community')}
            className="lv-chip lv-chip-sm"
          >
            Neighbours only
          </button>
          <button
            type="button"
            aria-pressed={feedFilter === 'recent'}
            onClick={() => handleFeedFilterChange(feedFilter === 'recent' ? null : 'recent')}
            className="lv-chip lv-chip-sm"
          >
            Last 2 h
          </button>
          {hasActiveFilters && (
            <button type="button" onClick={clearAllFilters} className="lv-link text-[12.5px]">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Scrollable list. Drags only from scrollTop 0 and only downward.
          `inert` at the rail keeps offscreen rows out of the tab order. */}
      <div
        {...listHandlers}
        ref={scrollRef}
        inert={state === 'rail'}
        className="flex-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] no-scrollbar"
        style={{
          overflowY: isRaised ? 'auto' : 'hidden',
          overscrollBehavior: 'contain',
        }}
      >
        {/* ── Briefing slot: <NowBriefing /> from MapPage. Hidden while
               searching so results come first. ─────────────────────────── */}
        {isRaised && briefing && !debouncedSearch && (
          <div className="lv-briefing-slot">{briefing}</div>
        )}

        {neighborhoodResults.length > 0 && (
          <div className="mb-2 mt-3 space-y-1.5">
            {neighborhoodResults.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleNeighborhood(name)}
                className="flex w-full items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-left"
                style={{ background: LIVE.yellowSoft, border: `2px solid ${LIVE.ink}` }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold" style={{ color: LIVE.ink }}>{name}</span>
                  <span className="block text-[12px]" style={{ color: LIVE.muted }}>Show this area</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {isRaised && neighborhoodPulse.length > 0 && !debouncedSearch && (
          <div className="mb-1 py-3" style={{ borderBottom: `1px solid ${MAP.lineCool}` }}>
            <div className="mb-2 flex items-center gap-1.5">
              <Activity size={13} style={{ color: LIVE.blue }} />
              <span className="font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: LIVE.muted }}>
                Reported in the last 2 h
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {neighborhoodPulse.map(({ name, count, level }) => {
                const cfg = RISK_CONFIG[level];
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleNeighborhood(name)}
                    className={cn('flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold', cfg.bg)}
                    style={{ border: `2px solid ${LIVE.ink}` }}
                    title={`${count} report${count !== 1 ? 's' : ''} in the last 2 h`}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', cfg.dot)} />
                    <span style={{ color: LIVE.ink }}>{name}</span>
                    <span className="font-black tabular-nums" style={{ color: LIVE.ink }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="mb-2 mt-3 font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: LIVE.muted }}>
          {filteredIncidents.length === 0
            ? 'No reports found'
            : `${filteredIncidents.length} report${filteredIncidents.length !== 1 ? 's' : ''}`}
        </p>

        {filteredIncidents.length > 0 ? (
          filteredIncidents.map((incident) => (
            <IncidentRow
              key={incident.id}
              incident={incident}
              photoUrl={incident.image_url}
              distanceKm={distanceFor(incident)}
              isActive={activeIncidentId === incident.id}
              onSelect={handleSelect}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center space-y-3 py-10 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-[16px]" style={{ background: LIVE.yellowSoft, border: `2px solid ${LIVE.ink}` }}>
              <Search size={24} style={{ color: LIVE.ink }} />
            </div>
            {hasActiveFilters ? (
              <>
                <div>
                  <p className="font-display text-[18px] font-extrabold tracking-[-0.02em]" style={{ color: LIVE.ink }}>No reports match</p>
                  <p className="mt-1 text-[13px]" style={{ color: LIVE.muted }}>Try clearing your filters or searching a different word.</p>
                </div>
                <button type="button" onClick={clearAllFilters} className="lv-link text-[13px]">
                  Clear all filters
                </button>
              </>
            ) : (
              <div>
                <p className="font-display text-[18px] font-extrabold tracking-[-0.02em]" style={{ color: LIVE.ink }}>Nothing posted in this window</p>
                <p className="mx-auto mt-1 max-w-[250px] text-[13px]" style={{ color: LIVE.muted }}>
                  Quiet maps are normal, and an empty map isn&rsquo;t proof nothing happened.
                </p>
              </div>
            )}
          </div>
        )}

        {hasMore && isRaised && filteredIncidents.length > 0 && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="lv-btn lv-btn-ghost lv-btn-block mt-3"
          >
            {isLoadingMore ? 'Loading more…' : 'Load older reports'}
          </button>
        )}
      </div>

      {isRaised && (
        <div className="shrink-0 px-4 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))]" style={{ borderTop: `2px solid ${LIVE.ink}`, background: '#fff' }}>
          <button
            type="button"
            onClick={onReportPress}
            className="lv-btn lv-btn-primary lv-btn-block"
            style={{ width: 'calc(100% - 4px)' }}
          >
            <Plus size={17} strokeWidth={2.6} />
            Post a report
          </button>
        </div>
      )}
    </section>
  );
});

export default MobileMapSheet;
