import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search, X, ChevronDown, Plus, Activity, Layers, Siren, AlertCircle, Car, Construction, CloudRain } from 'lucide-react';
import { TimeWindowFilter, type TimeWindow } from '@/src/components/TimeWindowFilter';
import { Incident, IncidentCategory, isPubliclyVisible } from '@/src/types';
import { cn, publicAsset } from '@/src/lib/utils';
import { useNeighborhoodPulse, RISK_CONFIG } from '@/src/hooks/useNeighborhoodPulse';
import IncidentRow from '@/src/components/IncidentRow';
import { useSheetDrag, type SheetState } from '@/src/hooks/useSheetDrag';
import { resolveDefaultSort, shouldAutoResolveNearest, sortIncidents, type SortBy } from '@/src/lib/feed';
import { getDistance } from '@/src/lib/geo';
import { MAP } from '@/src/lib/tokens';

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
  { id: 'all' as const,            label: 'All',     Icon: Layers,       color: '#1C2B3A' },
  { id: 'emergency' as const,      label: 'SOS',     Icon: Siren,        color: '#C0392B' },
  { id: 'crime' as const,          label: 'Crime',   Icon: AlertCircle,  color: '#C0392B' },
  { id: 'traffic' as const,        label: 'Traffic', Icon: Car,          color: '#C77F18' },
  { id: 'infrastructure' as const, label: 'Infra',   Icon: Construction, color: '#4A90D9' },
  { id: 'weather' as const,        label: 'Weather', Icon: CloudRain,    color: '#0284C7' },
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
}

export interface MobileMapSheetProps {
  incidents: Incident[];
  /** The one derived feed count, shared with the chrome badge. */
  feedCount: number;
  timeWindow?: TimeWindow;
  onTimeWindowChange?: (v: TimeWindow) => void;
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
}

const MobileMapSheet = forwardRef<MapSheetRef, MobileMapSheetProps>(function MobileMapSheet(
  {
    incidents,
    feedCount,
    timeWindow,
    onTimeWindowChange,
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
    return () => {
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
          ? !i.data_source || i.data_source === 'community'
          : feedFilter === 'recent'
            ? Date.now() - i.timestamp <= 2 * 60 * 60 * 1000
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
      className="fixed inset-x-0 bottom-0 z-[52] flex flex-col lg:hidden"
      style={{
        height: `${RAISED_FRACTION * 100}vh`,
        background: P.paper,
        boxShadow: '0 -4px 12px rgba(11,31,51,0.16)',
        transform: `translateY(${translate})`,
        transition: isDragging || reducedMotion ? 'none' : 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)',
        pointerEvents: hidden ? 'none' : undefined,
      }}
    >
      {/* ── Masthead. Always the drag zone; touch-action is scoped here and
             nowhere else, which is the whole point of not using vaul. ──── */}
      <div
        ref={mastheadRef}
        {...headerHandlers}
        className="relative shrink-0 overflow-hidden"
        style={{ background: P.ground, touchAction: 'none' }}
      >
        <img
          src={publicAsset('images/illustration/calgary-bow-emblem.webp')}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-5 -top-6 h-32 w-32 select-none object-contain opacity-[0.18]"
          style={{ filter: 'invert(1)' }}
        />

        <div className="relative flex justify-center pt-2 pb-1.5">
          <div className="w-10 h-1" style={{ background: 'rgba(242,239,232,0.42)' }} />
        </div>

        {!isRaised ? (
          <div className="relative flex items-center justify-between px-4 pb-3">
            <button
              type="button"
              onClick={() => onStateChange('raised')}
              // The accessible name must contain the visible label (WCAG
              // 2.5.3) — folding the count into the label rather than
              // dropping aria-label keeps the "open the feed" action verb a
              // screen-reader user would otherwise lose.
              aria-label={`${feedCount} live report${feedCount !== 1 ? 's' : ''} — open the feed`}
              aria-expanded={isRaised}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <span className="relative flex h-2 w-2 items-center justify-center">
                <span className="absolute inset-0 animate-ping opacity-70" style={{ background: P.live }} />
                <span className="relative h-2 w-2" style={{ background: P.live }} />
              </span>
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: P.onGround }}>
                {feedCount} live report{feedCount !== 1 ? 's' : ''}
              </span>
            </button>
            {/* A sibling of the expand button, never nested inside it. Nesting
                interactive elements breaks keyboard and screen-reader
                behaviour — the same fix this codebase already made to the
                notification card in MapPage. */}
            <button
              type="button"
              onClick={onReportPress}
              className="ml-3 flex h-9 shrink-0 items-center gap-1.5 px-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
              style={{ background: P.onGround, color: P.ground, boxShadow: `4px 4px 0 ${P.accent}` }}
            >
              <Plus size={11} />
              Report
            </button>
          </div>
        ) : (
          <div className="relative flex items-end justify-between gap-3 px-4 pb-2.5">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: P.eyebrow }}>
                51.05°N · 114.07°W
              </p>
              <h2 className="mt-1 font-display text-[21px] font-black uppercase leading-[0.9] tracking-[-0.035em]" style={{ color: P.onGround }}>
                Calgary Watch
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onStateChange('rail')}
              aria-label="Lower the feed"
              aria-expanded={isRaised}
              className="flex h-9 w-9 shrink-0 items-center justify-center"
              style={{ color: P.eyebrow }}
            >
              <ChevronDown size={18} />
            </button>
          </div>
        )}
      </div>

      {/* ── Search. Mounted at the rail as well as raised, so focus() can run
             synchronously inside the chrome's tap. ─────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-2">
        <div className="flex h-11 flex-1 items-center gap-2 px-3" style={{ background: P.card, border: `1.5px solid ${P.line}` }}>
          <Search size={15} className="shrink-0" style={{ color: P.soft }} />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => onStateChange('raised')}
            placeholder="Search reports or neighbourhoods…"
            aria-label="Search reports or neighbourhoods"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
            style={{ color: P.ink }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="shrink-0" style={{ color: P.soft }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category chips — the only copy in the app now.
          At rail, this row sits translated below the viewport (position:
          fixed, so nothing scrolls it into view) but stays mounted for the
          same reason the whole sheet does — see the section-level `inert`
          comment above. `inert` removes it from the tab order and hit-testing
          at rail without unmounting it. Never gate the search wrapper this
          way: its input's synchronous focus() is the only thing that opens
          the iOS keyboard from raiseAndFocusSearch, and `inert` would block
          that focus() call outright. */}
      <div className="shrink-0 px-3 pb-2" inert={state === 'rail'}>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
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
                className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap border-[1.5px] px-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] transition-transform active:scale-[0.98]"
                style={isSelected
                  ? { background: color, borderColor: color, color: '#fff' }
                  : { background: P.paper, borderColor: P.line, color: P.soft }}
              >
                <Icon size={12} style={{ color: isSelected ? '#fff' : color }} />
                <span>{label}</span>
                <span
                  className="px-1 py-0.5 font-sans text-[10px] font-black tabular-nums tracking-normal"
                  style={isSelected ? { background: 'rgba(255,255,255,0.22)', color: '#fff' } : { background: P.card, color: P.soft }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters — raised only. */}
      {isRaised && (
        <div className="shrink-0 space-y-2 px-3 pb-3" style={{ borderBottom: `1px solid ${P.line}` }}>
          <div className="flex items-center justify-between gap-2">
            <label className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: P.soft }}>
              Sort
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value as SortBy)}
                className="ml-2 h-7 cursor-pointer px-2 text-[10px] font-bold focus:outline-none"
                style={{ background: P.paper, border: `1.5px solid ${P.line}`, color: P.ink }}
              >
                <option value="nearest" disabled={!hasLocation}>
                  {hasLocation ? 'Nearest First' : 'Nearest (needs location)'}
                </option>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="verified">Most Verified</option>
              </select>
            </label>
          </div>

          {onTimeWindowChange && timeWindow && (
            <div className="pb-1">
              <TimeWindowFilter value={timeWindow} onChange={onTimeWindowChange} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={feedFilter === 'community'}
              onClick={() => handleFeedFilterChange(feedFilter === 'community' ? null : 'community')}
              className="h-7 border-[1.5px] px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-transform active:scale-95"
              style={feedFilter === 'community'
                ? { background: 'rgba(46,139,122,0.14)', borderColor: 'rgba(46,139,122,0.45)', color: '#1F6D5F' }
                : { background: P.paper, borderColor: P.line, color: P.soft }}
            >
              Community only
            </button>
            <button
              type="button"
              aria-pressed={feedFilter === 'recent'}
              onClick={() => handleFeedFilterChange(feedFilter === 'recent' ? null : 'recent')}
              className="h-7 border-[1.5px] px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-transform active:scale-95"
              style={feedFilter === 'recent'
                ? { background: P.ink, borderColor: P.ink, color: P.paper }
                : { background: P.paper, borderColor: P.line, color: P.soft }}
            >
              Last 2 h
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="h-7 border-[1.5px] px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-transform active:scale-95"
                style={{ borderColor: P.line, color: '#8E2B23', background: P.paper }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scrollable list. Drags only from scrollTop 0 and only downward.
          At rail, up to 60 incident rows and the pulse buttons stay mounted
          but translated offscreen with no visible focus ring reachable —
          `inert` pulls them out of the tab order and hit-testing without
          unmounting them, matching the chips row above. */}
      <div
        {...listHandlers}
        ref={scrollRef}
        inert={state === 'rail'}
        className="flex-1 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] no-scrollbar"
        style={{
          overflowY: isRaised ? 'auto' : 'hidden',
          overscrollBehavior: 'contain',
        }}
      >
        {neighborhoodResults.length > 0 && (
          <div className="mb-2 mt-2">
            {neighborhoodResults.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleNeighborhood(name)}
                className="mb-1 flex w-full items-center gap-3 px-3 py-2.5 text-left"
                style={{ background: 'rgba(74,144,217,0.09)', border: `1.5px solid rgba(74,144,217,0.40)` }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-black" style={{ color: P.ink }}>{name}</span>
                  <span className="block text-[10px]" style={{ color: P.soft }}>Fly to area</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {isRaised && neighborhoodPulse.length > 0 && !debouncedSearch && (
          <div className="mb-2 py-3" style={{ borderBottom: `1px solid ${P.line}` }}>
            <div className="mb-2 flex items-center gap-1.5">
              <Activity size={12} style={{ color: MAP.ok }} />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: P.soft }}>
                Live area pulse · 2 h
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
                    className={cn('flex h-7 items-center gap-1.5 px-2.5 text-[10px] font-bold', cfg.bg)}
                    style={{ border: `1.5px solid ${P.line}` }}
                    title={`${count} incident${count !== 1 ? 's' : ''} in the last 2h`}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', cfg.dot)} />
                    <span style={{ color: P.ink }}>{name}</span>
                    <span className={cn('font-black tabular-nums', cfg.text)}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="mb-2 mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: P.soft }}>
          {filteredIncidents.length === 0
            ? 'No reports found'
            : `${filteredIncidents.length} report${filteredIncidents.length !== 1 ? 's' : ''}`}
        </p>

        {filteredIncidents.length > 0 ? (
          filteredIncidents.map((incident) => (
            <IncidentRow
              key={incident.id}
              incident={incident}
              distanceKm={distanceFor(incident)}
              isActive={activeIncidentId === incident.id}
              onSelect={handleSelect}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center space-y-3 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center" style={{ background: P.card, border: `1.5px solid ${P.line}` }}>
              <Search size={26} style={{ color: P.soft }} />
            </div>
            {hasActiveFilters ? (
              <>
                <div>
                  <p className="font-display text-base font-black uppercase tracking-[-0.02em]" style={{ color: P.ink }}>No reports match</p>
                  <p className="mt-1 text-xs" style={{ color: P.soft }}>Try clearing your filters or searching a different term.</p>
                </div>
                <button type="button" onClick={clearAllFilters} className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#2F6FB0' }}>
                  Clear all filters
                </button>
              </>
            ) : (
              <div>
                <p className="font-display text-base font-black uppercase tracking-[-0.02em]" style={{ color: P.ink }}>All clear right now</p>
                <p className="mt-1 max-w-[200px] text-xs" style={{ color: P.soft }}>No incidents in Calgary at the moment.</p>
              </div>
            )}
          </div>
        )}

        {hasMore && isRaised && filteredIncidents.length > 0 && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="mt-2 w-full py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ border: `1.5px solid ${P.line}`, background: P.paper, color: P.ink }}
          >
            {isLoadingMore ? 'Loading more…' : 'Load older reports'}
          </button>
        )}
      </div>

      {isRaised && (
        <div className="shrink-0 px-3 py-3" style={{ borderTop: `1px solid ${P.line}`, background: P.paper }}>
          <button
            type="button"
            onClick={onReportPress}
            className="flex h-12 w-[calc(100%-4px)] items-center justify-center gap-2 font-display text-[13px] font-black uppercase tracking-[0.02em] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
            style={{ background: P.ground, color: P.onGround, boxShadow: `4px 4px 0 ${P.accent}` }}
          >
            <Plus size={15} />
            Report an incident
          </button>
        </div>
      )}
    </section>
  );
});

export default MobileMapSheet;
