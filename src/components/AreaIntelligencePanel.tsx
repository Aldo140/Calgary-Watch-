import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AreaIntelligence } from '@/src/types';
import {
  X, MapPin, Info, Database, ChevronDown, Lock, Phone, PhoneCall, Siren,
  ArrowRight, Bell, Compass, Users, Radio,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Sector,
  ComposedChart, Line,
} from 'recharts';
import { publicAsset } from '@/src/lib/utils';
import { LIVE } from '@/src/lib/tokens';
import { toSlug } from '@/src/lib/communityRank';
import { Drawer } from 'vaul';
import { CrimeStatEntry, CrimeYearEntry } from '@/src/hooks/useCrimeStats';
import { PropertyYearEntry } from '@/src/hooks/usePropertyAssessments';
import { useInView } from '@/src/hooks/useInView';
import { useCountUp } from '@/src/hooks/useCountUp';
import '@/src/styles/map-area.css';

/*
 * The neighbourhood panel on /map.
 *
 * It is an awareness page, not a scorecard: what neighbours put on the map in
 * the last day, how many requests the community made to the City's 311 line,
 * and where every number comes from. There is no safety score, no risk band
 * and no rank. 311 requests are calls for City service (graffiti, needles,
 * noise, potholes), not crimes, and every label says so.
 */

/** Abbreviate large tick numbers: 1200 → 1.2k */
function fmtTick(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return String(v);
}

/** Format dollar amounts: 487000 → $487k */
function fmtDollars(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

const fmt = (n: number) => n.toLocaleString('en-CA');

interface AreaIntelligencePanelProps {
  data: AreaIntelligence | null;
  onClose: () => void;
  crimeStats?: Map<string, CrimeStatEntry>;
  yearlyStats?: Map<string, CrimeYearEntry[]>;
  statcanStats?: Map<string, CrimeStatEntry>;
  statcanYearlyStats?: Map<string, CrimeYearEntry[]>;
  propertyData?: PropertyYearEntry[];
  cityAverages?: { avgViolent: number; avgProperty: number; avgDisorder: number };
  /**
   * Optional. When MapPage passes it, "Watch this area" calls it with the
   * community name. Without it the button falls back to the existing
   * `?settings=alerts` deep link (alerts near the reader's saved home).
   */
  onWatchArea?: (communityName: string) => void;
}

// ── Colours (brand tokens; no red outside emergencies) ─────────────────────

const C = {
  ink: LIVE.ink,
  muted: LIVE.muted,
  blue: LIVE.blue,
  blueDeep: LIVE.blueDeep,
  cyan: '#0092AB', // cyan stepped down so a 2px line clears white
  slate: '#8E99AB',
  paper: LIVE.paper,
  line: '#E4E1D8',
} as const;

// ── Year coverage ───────────────────────────────────────────────────────────

/*
 * useCrimeStats asks 311 for roughly the last 30 months, so the first and the
 * last year in the series are partial. Mirrors the window in that hook; when
 * it changes, change this too. Partial years are labelled and kept out of
 * year-over-year comparisons.
 */
const STATS_WINDOW_MS = 30 * 30.5 * 24 * 3600 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Coverage = { kind: 'full' } | { kind: 'to-date' } | { kind: 'from'; month: string };

function yearCoverage(year: number, is311: boolean, now = new Date()): Coverage {
  if (!is311) return { kind: 'full' };
  if (year === now.getFullYear()) return { kind: 'to-date' };
  const start = new Date(now.getTime() - STATS_WINDOW_MS);
  if (year === start.getFullYear() && (start.getMonth() > 0 || start.getDate() > 1)) {
    return { kind: 'from', month: MONTHS[start.getMonth()] };
  }
  return { kind: 'full' };
}

function yearLabel(year: number, cov: Coverage): string {
  if (cov.kind === 'to-date') return `${year} so far`;
  if (cov.kind === 'from') return `${year} from ${cov.month}`;
  return String(year);
}

function shortYearLabel(year: number, cov: Coverage): string {
  if (cov.kind === 'full') return String(year);
  return `${year}*`;
}

// ── Desktop breakpoint ──────────────────────────────────────────────────────

/*
 * The phone sheet is a vaul portal, so a `lg:hidden` wrapper never hid it:
 * on desktop the sheet rendered over the right-hand panel. Pick one surface.
 */
function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)';
  const [is, setIs] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setIs(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return is;
}

// ── Shared tooltip styles ────────────────────────────────────────────────────

function makeTooltipStyle(): React.CSSProperties {
  return {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: `2px solid ${C.ink}`,
    boxShadow: `3px 3px 0 ${C.ink}`,
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  };
}

function makeTooltipLabelStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    color: C.ink,
    marginBottom: 4,
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    letterSpacing: '0.06em',
  };
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  // Plays on mount rather than on scroll-into-view: when the panel opens from
  // a ?near= link mid-load the observer never fired and sections stayed blank.
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="lv-area-sechead">
        <p className="lv-area-eyebrow">{subtitle ?? 'Know your community'}</p>
        <h3 className="lv-area-h3">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="lv-area-empty">
      <Info size={18} strokeWidth={2} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

// ── Comparison against most communities ─────────────────────────────────────

type Compare = 'fewer' | 'same' | 'more';

/*
 * Same thresholds MapPage uses for its insight sentence (0.8× / 1.2× the
 * median), so the ramp and the words always agree. Peers are communities in
 * the same dataset (same namespace and source) for the same year.
 */
function compareToPeers(
  key: string,
  entry: CrimeStatEntry,
  stats: Map<string, CrimeStatEntry> | undefined,
): Compare | null {
  if (!stats || stats.size < 5) return null;
  const ns = key.includes(':') ? key.split(':')[0] : '';
  const totals: number[] = [];
  for (const [k, e] of stats) {
    const kns = k.includes(':') ? k.split(':')[0] : '';
    if (kns !== ns || e.year !== entry.year || (e.dataSource ?? '311') !== (entry.dataSource ?? '311')) continue;
    totals.push(e.crime + e.disorder);
  }
  if (totals.length < 5) return null;
  totals.sort((a, b) => a - b);
  const median = totals[Math.floor(totals.length / 2)] ?? 0;
  if (median <= 0) return null;
  const total = entry.crime + entry.disorder;
  return total > median * 1.2 ? 'more' : total < median * 0.8 ? 'fewer' : 'same';
}

function CompareRamp({ value, noun }: { value: Compare; noun: string }) {
  const steps: { id: Compare; label: string }[] = [
    { id: 'fewer', label: 'Fewer' },
    { id: 'same', label: 'About the same' },
    { id: 'more', label: 'More' },
  ];
  const sentence =
    value === 'fewer' ? `Fewer ${noun} than most Calgary communities`
    : value === 'more' ? `More ${noun} than most Calgary communities`
    : `About the same number of ${noun} as most Calgary communities`;
  return (
    <div className="lv-area-ramp" role="img" aria-label={sentence}>
      <div className="lv-area-ramp__track">
        {steps.map((s) => (
          <span key={s.id} className="lv-area-ramp__seg" data-step={s.id} data-on={s.id === value ? 'true' : undefined}>
            {s.id === value && <span className="lv-area-ramp__marker" aria-hidden="true" />}
          </span>
        ))}
      </div>
      <div className="lv-area-ramp__labels" aria-hidden="true">
        {steps.map((s) => (
          <span key={s.id} data-on={s.id === value ? 'true' : undefined}>{s.label}</span>
        ))}
      </div>
      <p className="lv-area-ramp__caption">than most Calgary communities</p>
    </div>
  );
}

// ── Masthead ────────────────────────────────────────────────────────────────

function Masthead({
  data, onClose, crimeEntry, compare, isStatcanData, hasPropertyData,
}: {
  data: AreaIntelligence;
  onClose: () => void;
  crimeEntry: CrimeStatEntry | undefined;
  compare: Compare | null;
  isStatcanData: boolean;
  hasPropertyData: boolean;
}) {
  const reports = data.activeIncidents ?? 0;
  const total = crimeEntry ? crimeEntry.crime + crimeEntry.disorder : 0;
  const [ref, inView] = useInView(0);
  const shownTotal = useCountUp(total, 900, inView);
  const year = crimeEntry?.year;
  const cov = year ? yearCoverage(year, !isStatcanData) : null;
  const noun = isStatcanData ? 'police-reported incidents' : '311 requests';

  return (
    <header className="lv-area-mast" ref={ref}>
      <img
        src={publicAsset('images/illustration/calgary-bow-emblem.webp')}
        alt=""
        aria-hidden="true"
        className="lv-area-mast__emblem"
      />
      <div className="lv-area-mast__top">
        <p className="lv-area-mast__eyebrow">
          <MapPin size={14} strokeWidth={2} aria-hidden="true" />
          Area intel · Community
        </p>
        <button type="button" onClick={onClose} aria-label="Close" className="lv-area-close">
          <X size={18} strokeWidth={2.4} />
        </button>
      </div>

      <h2 className="lv-area-mast__name" title={data.communityName}>
        <span>{data.communityName}</span>
      </h2>
      <p className="lv-area-mast__lede">What neighbours reported, and what the City&rsquo;s open data shows.</p>

      <div className="lv-area-mast__stats">
        <div className="lv-area-stat">
          <p className="lv-area-stat__label">
            <span className="lv-area-pulse" data-live={reports > 0 ? 'true' : undefined} aria-hidden="true" />
            Map reports · 24 h
          </p>
          <p className="lv-area-stat__num">{fmt(reports)}</p>
          <p className="lv-area-stat__sub">
            {reports === 0
              ? 'Nothing on the map from here in the last 24 hours.'
              : `${reports === 1 ? 'report' : 'reports'} on the map from neighbours and public sources`}
          </p>
        </div>

        <div className="lv-area-stat">
          {crimeEntry && cov ? (
            <>
              <p className="lv-area-stat__label">{isStatcanData ? 'StatCan incidents' : '311 requests'} · {yearLabel(crimeEntry.year, cov)}</p>
              <p className="lv-area-stat__num">{fmt(shownTotal)}</p>
              {compare ? (
                <CompareRamp value={compare} noun={noun} />
              ) : (
                <p className="lv-area-stat__sub">{noun} to date</p>
              )}
            </>
          ) : (
            <>
              <p className="lv-area-stat__label">311 requests</p>
              <p className="lv-area-stat__num lv-area-stat__num--none">No data</p>
              <p className="lv-area-stat__sub">The City&rsquo;s 311 data doesn&rsquo;t list a community under this name yet.</p>
            </>
          )}
        </div>
      </div>

      {data.liveOverlayInsight && (
        <p className="lv-area-mast__live">
          <Radio size={16} strokeWidth={2} aria-hidden="true" />
          {data.liveOverlayInsight}
        </p>
      )}

      <ul className="lv-area-sources" aria-label="Sources">
        <li>Community reports · live</li>
        {crimeEntry && !isStatcanData && <li>Calgary 311 Open Data · {crimeEntry.year}</li>}
        {crimeEntry && isStatcanData && <li>Statistics Canada · {crimeEntry.year}</li>}
        {hasPropertyData && <li>City assessments</li>}
      </ul>
    </header>
  );
}

// ── Content ──────────────────────────────────────────────────────────────────

interface ContentProps {
  data: AreaIntelligence;
  onClose: () => void;
  crimeEntry: CrimeStatEntry | undefined;
  realYearly: CrimeYearEntry[];
  hasRealData: boolean;
  isStatcanData: boolean;
  compare: Compare | null;
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
  propertyData: PropertyYearEntry[];
  cityAverages?: { avgViolent: number; avgProperty: number; avgDisorder: number };
  onWatchArea?: (communityName: string) => void;
  variant: 'desktop' | 'phone';
}

const INTEL_SECTIONS = [
  { id: 'sec-year', label: 'This year' },
  { id: 'sec-trends', label: 'Year by year' },
  { id: 'sec-mix', label: 'Request mix' },
  { id: 'sec-property', label: 'Property' },
  { id: 'sec-signals', label: 'Signals' },
  { id: 'sec-todo', label: 'What to do' },
  { id: 'sec-sources', label: 'Sources' },
] as const;

function Content({
  data,
  onClose,
  crimeEntry,
  realYearly,
  hasRealData,
  isStatcanData,
  compare,
  tooltipStyle,
  tooltipLabelStyle,
  propertyData,
  cityAverages,
  onWatchArea,
  variant,
}: ContentProps) {
  const heroRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [miniBarVisible, setMiniBarVisible] = useState(false);

  const mixTotal = crimeEntry ? crimeEntry.violent + crimeEntry.property + crimeEntry.disorder : 0;
  const sections = INTEL_SECTIONS.filter(({ id }) => {
    if (id === 'sec-mix') return mixTotal > 0;
    if (id === 'sec-signals') return data.insights.length > 0;
    return true;
  });
  const [activeSection, setActiveSection] = useState<string>(sections[0].id);

  // Reset mini-bar when community changes
  useEffect(() => {
    setMiniBarVisible(false);
    setActiveSection(INTEL_SECTIONS[0].id);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [data.communityName]);

  // Show mini-bar once the masthead scrolls out of view
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setMiniBarVisible(!entry.isIntersecting),
      { threshold: 0, root: scrollRef.current },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [data.communityName]);

  // Scrollspy for the section navigator
  const sectionKey = sections.map((s) => s.id).join('|');
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActiveSection(hit.target.id);
      },
      { root, rootMargin: '-30% 0px -55% 0px' },
    );
    sectionKey.split('|').forEach((id) => {
      const el = root.querySelector(`#${id}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [data.communityName, sectionKey]);

  const navRef = useRef<HTMLDivElement>(null);
  // Keep the active chip in view on phones, where the row scrolls sideways.
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>(`[data-target="${activeSection}"]`);
    if (!nav || !chip) return;
    const left = chip.offsetLeft - 16;
    if (left < nav.scrollLeft || chip.offsetLeft + chip.offsetWidth > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo({ left, behavior: 'smooth' });
    }
  }, [activeSection]);

  const jumpTo = (id: string) => {
    scrollRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const reports = data.activeIncidents ?? 0;

  return (
    <div className="lv-area" data-variant={variant} data-mini={miniBarVisible ? 'true' : undefined}>
      {/* Mini-bar: name + the one live figure, once the masthead is gone. */}
      <AnimatePresence>
        {miniBarVisible && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="lv-area-mini"
          >
            <span className="lv-area-mini__name">{data.communityName}</span>
            <span className="lv-area-mini__count">{fmt(reports)} {reports === 1 ? 'report' : 'reports'} · 24 h</span>
            <button type="button" onClick={onClose} aria-label="Close" className="lv-area-mini__close">
              <X size={16} strokeWidth={2.4} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={scrollRef} className="lv-area-scroll no-scrollbar">
        <div ref={heroRef}>
          <Masthead
            data={data}
            onClose={onClose}
            crimeEntry={crimeEntry}
            compare={compare}
            isStatcanData={isStatcanData}
            hasPropertyData={propertyData.length > 0}
          />
        </div>

        {/* Section navigator — sticky, scrollspy-highlighted */}
        <nav ref={navRef} className="lv-area-nav no-scrollbar" aria-label="Sections">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              data-target={id}
              aria-current={activeSection === id ? 'true' : undefined}
              onClick={() => jumpTo(id)}
              className="lv-area-navbtn"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="lv-area-body">
          <div id="sec-year" className="lv-area-anchor">
            <ThisYearSection
              crimeEntry={crimeEntry}
              cityAverages={cityAverages}
              yearlyStats={realYearly}
              isStatcanData={isStatcanData}
            />
          </div>
          <div id="sec-trends" className="lv-area-anchor">
            <TrendChartSection
              hasRealData={hasRealData}
              yearlyStats={realYearly}
              isStatcanData={isStatcanData}
              tooltipStyle={tooltipStyle}
              tooltipLabelStyle={tooltipLabelStyle}
            />
          </div>
          {mixTotal > 0 && (
            <div id="sec-mix" className="lv-area-anchor">
              <DonutSection crimeEntry={crimeEntry} isStatcanData={isStatcanData} />
            </div>
          )}
          <div id="sec-property" className="lv-area-anchor">
            <PropertyValueSection
              key={`pv-${data.communityName}`}
              propertyData={propertyData}
              yearlyStats={realYearly}
              isStatcanData={isStatcanData}
              tooltipStyle={tooltipStyle}
              tooltipLabelStyle={tooltipLabelStyle}
              communityName={data.communityName}
            />
          </div>
          {data.insights.length > 0 && (
            <div id="sec-signals" className="lv-area-anchor">
              <KeySignalsSection insights={data.insights} />
            </div>
          )}
          <div id="sec-todo" className="lv-area-anchor">
            <WhatToDoSection
              communityName={data.communityName}
              crimeKey={data.crimeKey}
              onWatchArea={onWatchArea}
            />
          </div>
          <img
            src={publicAsset('images/illustration/calgary-skyline-rule.webp')}
            alt=""
            aria-hidden="true"
            className="lv-area-skyline"
          />
          <div id="sec-sources" className="lv-area-anchor">
            <DataSourcesSection isStatcanData={isStatcanData} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function AreaIntelligencePanel({
  data, onClose, crimeStats, yearlyStats, statcanStats, statcanYearlyStats, propertyData, cityAverages, onWatchArea,
}: AreaIntelligencePanelProps) {
  const isDesktop = useIsDesktop();
  const communityKey = data ? (data.crimeKey ?? data.communityName.toLowerCase()) : '';
  const crimeEntry = data ? (crimeStats?.get(communityKey) ?? statcanStats?.get(communityKey)) : undefined;
  const compare = useMemo(() => {
    // Only 311 rows compare against "most Calgary communities"; a StatCan
    // municipality has no honest Calgary peer group.
    if (!crimeEntry || crimeEntry.dataSource === 'statcan' || !crimeStats?.has(communityKey)) return null;
    return compareToPeers(communityKey, crimeEntry, crimeStats);
  }, [communityKey, crimeEntry, crimeStats]);

  if (!data) return null;

  const realYearly = yearlyStats?.get(communityKey) ?? statcanYearlyStats?.get(communityKey) ?? [];
  // Only real yearly rows ever reach the chart; there is no estimated series.
  const hasRealData = realYearly.length > 0;
  const isStatcanData = crimeEntry?.dataSource === 'statcan';

  const contentProps: Omit<ContentProps, 'variant'> = {
    data,
    onClose,
    crimeEntry,
    realYearly,
    hasRealData,
    isStatcanData,
    compare,
    tooltipStyle: makeTooltipStyle(),
    tooltipLabelStyle: makeTooltipLabelStyle(),
    propertyData: propertyData ?? [],
    cityAverages,
    onWatchArea,
  };

  if (isDesktop) {
    return (
      <AnimatePresence>
        <motion.aside
          key="area-desk"
          initial={{ x: '110%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '110%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="lv-area-desk"
          aria-label={`${data.communityName} area intel`}
        >
          <div className="lv-area-desk__card">
            <Content {...contentProps} variant="desktop" />
          </div>
        </motion.aside>
      </AnimatePresence>
    );
  }

  return (
    <Drawer.Root open={!!data} onClose={onClose}>
      <Drawer.Portal>
        <Drawer.Overlay className="lv-area-overlay" />
        <Drawer.Content className="lv-area-sheet">
          <div className="lv-area-sheet__inner">
            <div className="lv-area-sheet__grip" aria-hidden="true" />
            <Drawer.Title className="sr-only">{data.communityName} Area Intelligence</Drawer.Title>
            <Drawer.Description className="sr-only">
              Map reports from the last 24 hours (neighbours and public sources), Calgary 311 requests and City open data for {data.communityName}.
            </Drawer.Description>
            <Content {...contentProps} variant="phone" />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 52, H = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="lv-area-spark">
      <polyline points={pts} fill="none" stroke={C.ink} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function bucketCopy(isStatcan: boolean) {
  return isStatcan
    ? {
        violent: { label: 'Violent incidents', hint: 'Assault, robbery, threats' },
        property: { label: 'Property incidents', hint: 'Break and enter, theft, mischief' },
        disorder: { label: 'Other incidents', hint: 'Everything else police recorded' },
        noun: 'incidents',
      }
    : {
        violent: { label: 'Safety-related requests', hint: 'Disturbances, needles, encampments, noise' },
        property: { label: 'Property-related requests', hint: 'Graffiti, vandalism, theft, abandoned vehicles' },
        disorder: { label: 'All other 311 requests', hint: 'Roads, bylaw, waste, parks and more' },
        noun: 'requests',
      };
}

function ThisYearSection({
  crimeEntry, cityAverages, yearlyStats, isStatcanData,
}: {
  crimeEntry: CrimeStatEntry | undefined;
  cityAverages: { avgViolent: number; avgProperty: number; avgDisorder: number } | undefined;
  yearlyStats: CrimeYearEntry[];
  isStatcanData: boolean;
}) {
  const [barsRef, barsInView] = useInView();

  if (!crimeEntry) {
    return (
      <Section title="This year" subtitle="Calgary 311 Open Data">
        <EmptyNote>
          No 311 breakdown for this community yet. The name on the map may differ from the one in the City&rsquo;s 311 data.
        </EmptyNote>
      </Section>
    );
  }

  const copy = bucketCopy(isStatcanData);
  const cov = yearCoverage(crimeEntry.year, !isStatcanData);
  // Sparklines use complete years only, so a half-finished year never reads as a drop.
  const complete = yearlyStats.filter((e) => yearCoverage(e.year, !isStatcanData).kind === 'full').slice(-6);
  const rows = [
    { key: 'violent', ...copy.violent, value: crimeEntry.violent, avg: cityAverages?.avgViolent ?? 0, color: C.blue, spark: complete.map((e) => e.violent) },
    { key: 'property', ...copy.property, value: crimeEntry.property, avg: cityAverages?.avgProperty ?? 0, color: C.cyan, spark: complete.map((e) => e.property) },
    { key: 'disorder', ...copy.disorder, value: crimeEntry.disorder, avg: cityAverages?.avgDisorder ?? 0, color: C.slate, spark: complete.map((e) => e.disorder) },
  ];
  const showAvg = !isStatcanData && rows.some((r) => r.avg > 0);

  return (
    <Section
      title={isStatcanData ? 'Incidents this year' : '311 requests this year'}
      subtitle={`${yearLabel(crimeEntry.year, cov)} · ${isStatcanData ? 'Statistics Canada' : 'Calgary 311 Open Data'}`}
    >
      <div className="lv-area-box" ref={barsRef}>
        {rows.map(({ key, label, hint, value, avg, color, spark }, i) => {
          const scale = Math.max(value, avg, 1) * 1.1;
          const pct = Math.round((value / scale) * 100);
          const avgPct = avg > 0 ? Math.round((avg / scale) * 100) : 0;
          return (
            <div key={key} className="lv-area-row">
              <div className="lv-area-row__head">
                <div className="lv-area-row__text">
                  <p className="lv-area-row__label">{label}</p>
                  <p className="lv-area-row__hint">{hint}</p>
                </div>
                <Sparkline values={spark} />
                <p className="lv-area-row__num">{fmt(value)}</p>
              </div>
              <div className="lv-area-bar">
                <motion.div
                  className="lv-area-bar__fill"
                  style={{ background: color }}
                  initial={{ width: '0%' }}
                  animate={{ width: barsInView ? `${pct}%` : '0%' }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.08 }}
                />
                {showAvg && avgPct > 0 && (
                  <span className="lv-area-bar__avg" style={{ left: `${avgPct}%` }} aria-hidden="true" />
                )}
              </div>
              {showAvg && avg > 0 && (
                <p className="lv-area-row__avg">City average {fmt(Math.round(avg))}</p>
              )}
            </div>
          );
        })}
        {showAvg && (
          <p className="lv-area-legend">
            <span className="lv-area-legend__tick" aria-hidden="true" /> Tick marks the average Calgary community
          </p>
        )}
      </div>
      <p className="lv-area-foot">
        {isStatcanData
          ? `Police-reported incidents published by Statistics Canada · ${crimeEntry.year}.`
          : `Requests to the City's 311 line, grouped by service type · ${yearLabel(crimeEntry.year, cov)} · City of Calgary Open Data (iahh-g8bj). A 311 request is a call for City service, not a crime.`}
      </p>
    </Section>
  );
}

function TrendChartSection({
  hasRealData, yearlyStats, isStatcanData, tooltipStyle, tooltipLabelStyle,
}: {
  hasRealData: boolean;
  yearlyStats: CrimeYearEntry[];
  isStatcanData: boolean;
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
}) {
  const [show, setShow] = useState({ violent: true, property: true, disorder: true });
  const copy = bucketCopy(isStatcanData);
  const short = isStatcanData
    ? { violent: 'Violent', property: 'Property', disorder: 'Other' }
    : { violent: 'Safety', property: 'Property', disorder: 'Other 311' };

  if (!hasRealData) {
    return (
      <Section title="Year by year" subtitle={isStatcanData ? 'Statistics Canada' : 'Calgary 311 Open Data'}>
        <EmptyNote>No yearly 311 history for this community yet.</EmptyNote>
      </Section>
    );
  }

  const withCov = yearlyStats.map((e) => ({ e, cov: yearCoverage(e.year, !isStatcanData) }));
  const chartData = withCov.map(({ e, cov }) => ({
    name: shortYearLabel(e.year, cov),
    full: yearLabel(e.year, cov),
    [short.violent]: e.violent,
    [short.property]: e.property,
    [short.disorder]: e.disorder,
  }));
  const partial = withCov.filter(({ cov }) => cov.kind !== 'full');

  // Year-over-year only between two complete years.
  const complete = withCov.filter(({ cov }) => cov.kind === 'full').map(({ e }) => e);
  const deltaRow = (() => {
    if (complete.length < 2) return null;
    const latest = complete[complete.length - 1];
    const prior = complete[complete.length - 2];
    // Back-to-back years only; a gap would make "vs prior year" misleading.
    if (prior.year !== latest.year - 1) return null;
    const pct = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 100));
    return {
      rows: [
        { label: short.violent, delta: pct(latest.violent, prior.violent) },
        { label: short.property, delta: pct(latest.property, prior.property) },
        { label: short.disorder, delta: pct(latest.disorder, prior.disorder) },
      ],
      year: latest.year,
      prior: prior.year,
    };
  })();

  const series = [
    { key: 'violent' as const, name: short.violent, color: C.blue, label: copy.violent.label },
    { key: 'property' as const, name: short.property, color: C.cyan, label: copy.property.label },
    { key: 'disorder' as const, name: short.disorder, color: C.slate, label: copy.disorder.label },
  ];
  const startYear = chartData[0]?.full ?? '';
  const endYear = chartData[chartData.length - 1]?.full ?? '';

  return (
    <Section
      title="Year by year"
      subtitle={`${isStatcanData ? 'Statistics Canada' : 'Calgary 311 Open Data'} · ${yearlyStats[0].year}–${yearlyStats[yearlyStats.length - 1].year}`}
    >
      <div className="lv-area-toggles" role="group" aria-label="Series">
        {series.map(({ key, name, color }) => (
          <button
            key={key}
            type="button"
            aria-pressed={show[key]}
            onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
            className="lv-area-toggle"
          >
            <span className="lv-area-toggle__swatch" style={{ background: color }} aria-hidden="true" />
            {name}
          </button>
        ))}
      </div>

      <div className="lv-area-box lv-area-chart" role="img" aria-label={`Yearly ${isStatcanData ? 'incident' : '311 request'} chart, ${startYear} to ${endYear}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              {series.map(({ key, color }) => (
                <linearGradient key={key} id={`lvA-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(21,21,21,0.08)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: C.muted, fontWeight: 600 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: C.muted, fontWeight: 600 }} tickFormatter={fmtTick} width={44} />
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={{ fontSize: 12, fontWeight: 600 }}
              labelStyle={tooltipLabelStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(_l: any, payload: any) => payload?.[0]?.payload?.full ?? _l}
            />
            {series.map(({ key, name, color }) => show[key] && (
              <Area key={key} type="monotone" dataKey={name} stroke={color} strokeWidth={2.5} fillOpacity={1} fill={`url(#lvA-${key})`} isAnimationActive animationBegin={200} animationDuration={800} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {partial.length > 0 && (
        <p className="lv-area-foot">
          * Partial year: {partial.map(({ e, cov }) => yearLabel(e.year, cov)).join(', ')}. Partial years are lower because they cover fewer months.
        </p>
      )}

      {deltaRow && (
        <div className="lv-area-deltas">
          {deltaRow.rows.map(({ label, delta }) => delta === null ? null : (
            <div key={label} className="lv-area-delta">
              <p className="lv-area-delta__label">{label}</p>
              <p className="lv-area-delta__num">{delta > 0 ? '↑' : delta < 0 ? '↓' : ''}{Math.abs(delta)}%</p>
              <p className="lv-area-delta__sub">{deltaRow.year} vs {deltaRow.prior}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function DonutSection({
  crimeEntry, isStatcanData,
}: {
  crimeEntry: CrimeStatEntry | undefined;
  isStatcanData: boolean;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const total = crimeEntry ? crimeEntry.violent + crimeEntry.property + crimeEntry.disorder : 0;

  if (!crimeEntry || total === 0) return null;
  const copy = bucketCopy(isStatcanData);
  const slices = [
    { name: copy.violent.label, value: crimeEntry.violent, color: C.blue, description: copy.violent.hint },
    { name: copy.property.label, value: crimeEntry.property, color: C.cyan, description: copy.property.hint },
    { name: copy.disorder.label, value: crimeEntry.disorder, color: C.slate, description: copy.disorder.hint },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent } = props;
    return (
      <g>
        <text x={cx} y={cy - 6} textAnchor="middle" fill={C.ink} style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          {payload.value.toLocaleString('en-CA')}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill={C.muted} style={{ fontSize: 11, fontWeight: 600 }}>
          {(percent * 100).toFixed(0)}% of all
        </text>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} stroke={C.ink} strokeWidth={2} />
      </g>
    );
  };

  return (
    <Section
      title={isStatcanData ? 'What was recorded' : 'What people called about'}
      subtitle={`${isStatcanData ? 'Incident' : 'Request'} mix · ${crimeEntry.year}`}
    >
      <div className="lv-area-box lv-area-mix">
        <div className="lv-area-mix__pie">
          <PieChart width={200} height={200}>
            <Pie
              {...{ activeIndex: activeIdx } as object}
              activeShape={renderActiveShape}
              data={slices}
              cx={100} cy={100}
              innerRadius={56} outerRadius={84}
              dataKey="value"
              stroke="#fff"
              strokeWidth={2}
              onMouseEnter={(_: unknown, idx: number) => setActiveIdx(idx)}
              onClick={(_: unknown, idx: number) => setActiveIdx(idx)}
              isAnimationActive
              animationBegin={200}
              animationDuration={800}
            >
              {slices.map(({ name, color }) => (
                <Cell key={name} fill={color} />
              ))}
            </Pie>
          </PieChart>
        </div>
        <div className="lv-area-mix__legend">
          <p className="lv-area-mix__total">{fmt(total)} {copy.noun} in total</p>
          {slices.map(({ name, value, color, description }, i) => (
            <button
              key={name}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-pressed={activeIdx === i}
              className="lv-area-mix__row"
            >
              <span className="lv-area-mix__swatch" style={{ background: color }} aria-hidden="true" />
              <span className="lv-area-mix__text">
                <span className="lv-area-mix__name">{name}</span>
                <span className="lv-area-mix__hint">{description}</span>
              </span>
              <span className="lv-area-mix__val">
                {fmt(value)}
                <small>{Math.round((value / total) * 100)}%</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

function PropertyValueSection({
  propertyData, yearlyStats, isStatcanData, tooltipStyle, tooltipLabelStyle, communityName,
}: {
  propertyData: PropertyYearEntry[];
  communityName: string;
  yearlyStats: CrimeYearEntry[];
  isStatcanData: boolean;
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
}) {
  // Names the city uses for land with no housing on it.
  const isNonResidentialArea = /\b(industrial|park|business|commercial|airport|reserve)\b/i.test(communityName);

  if (propertyData.length === 0) {
    return (
      <Section title="Property values" subtitle="City of Calgary assessments">
        <EmptyNote>
          {isNonResidentialArea
            ? `${communityName} is an industrial or park area, so the city publishes no residential assessments for it.`
            : 'No residential assessment has been published for this community yet.'}
        </EmptyNote>
      </Section>
    );
  }

  const sortedProp = [...propertyData].sort((a, b) => a.year - b.year);
  const latestProp = sortedProp[sortedProp.length - 1];
  const earliestProp = sortedProp.length > 1 ? sortedProp[Math.max(0, sortedProp.length - 6)] : null;
  const valueChange = earliestProp && earliestProp.avgValue > 0
    ? Math.round(((latestProp.avgValue - earliestProp.avgValue) / earliestProp.avgValue) * 100)
    : null;

  // Only complete years of requests sit beside a year of assessments.
  const crimeByYear = new Map(
    yearlyStats
      .filter((e) => yearCoverage(e.year, !isStatcanData).kind === 'full')
      .map((e) => [e.year, e]),
  );
  const sharedYears = sortedProp.map((e) => e.year).filter((y) => crimeByYear.has(y)).slice(-6);
  const combined = sharedYears.map((year) => {
    const c = crimeByYear.get(year)!;
    return {
      name: String(year),
      Requests: c.violent + c.property + c.disorder,
      AvgValue: sortedProp.find((p) => p.year === year)?.avgValue ?? 0,
    };
  });

  return (
    <PropertyValueContent
      latestProp={latestProp}
      earliestProp={earliestProp}
      valueChange={valueChange}
      combined={combined}
      isStatcanData={isStatcanData}
      tooltipStyle={tooltipStyle}
      tooltipLabelStyle={tooltipLabelStyle}
    />
  );
}

function PropertyValueContent({
  latestProp, earliestProp, valueChange, combined, isStatcanData, tooltipStyle, tooltipLabelStyle,
}: {
  latestProp: PropertyYearEntry;
  earliestProp: PropertyYearEntry | null;
  valueChange: number | null;
  combined: { name: string; Requests: number; AvgValue: number }[];
  isStatcanData: boolean;
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
}) {
  const [valueRef, valueInView] = useInView();
  const animatedValue = useCountUp(latestProp.avgValue, 1200, valueInView);
  const noun = isStatcanData ? 'incidents' : '311 requests';

  return (
    <Section title="Property values" subtitle="City of Calgary assessments">
      <div className="lv-area-tiles" ref={valueRef}>
        <div className="lv-area-tile">
          <p className="lv-area-tile__label">Avg. assessed value · {latestProp.year}</p>
          <p className="lv-area-tile__num">{fmtDollars(animatedValue)}</p>
        </div>
        <div className="lv-area-tile">
          <p className="lv-area-tile__label">{earliestProp ? `Change since ${earliestProp.year}` : 'Change'}</p>
          <p className="lv-area-tile__num">
            {valueChange === null ? '–' : `${valueChange > 0 ? '↑' : valueChange < 0 ? '↓' : ''}${Math.abs(valueChange)}%`}
          </p>
        </div>
      </div>

      {combined.length >= 2 ? (
        <>
          <div className="lv-area-box lv-area-chart" role="img" aria-label={`Average assessed value and ${noun} by year`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={combined} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="lvReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.slate} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.slate} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(21,21,21,0.08)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: C.muted, fontWeight: 600 }} dy={8} />
                <YAxis yAxisId="req" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: C.muted, fontWeight: 600 }} tickFormatter={fmtTick} orientation="left" width={44} />
                <YAxis yAxisId="value" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: C.blueDeep, fontWeight: 600 }} tickFormatter={fmtDollars} orientation="right" width={52} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(val: any, name: any) => {
                    const n: number = typeof val === 'number' ? val : 0;
                    return name === 'AvgValue'
                      ? [fmtDollars(n), 'Avg. assessed value']
                      : [n.toLocaleString('en-CA'), isStatcanData ? 'Incidents' : '311 requests'];
                  }}
                  itemStyle={{ fontSize: 12, fontWeight: 600 }}
                />
                <Area yAxisId="req" type="monotone" dataKey="Requests" stroke={C.slate} strokeWidth={2} fill="url(#lvReq)" fillOpacity={1} isAnimationActive animationBegin={200} animationDuration={800} />
                <Line yAxisId="value" type="monotone" dataKey="AvgValue" stroke={C.blueDeep} strokeWidth={3} dot={{ r: 4, fill: C.blueDeep, strokeWidth: 2, stroke: '#fff' }} isAnimationActive animationBegin={200} animationDuration={800} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="lv-area-legend">
            <span className="lv-area-legend__line" style={{ background: C.blueDeep }} aria-hidden="true" /> Avg. assessed value
            <span className="lv-area-legend__line" style={{ background: C.slate }} aria-hidden="true" /> {noun} (complete years)
          </p>
        </>
      ) : null}

      <p className="lv-area-foot">
        Assessed values are the City&rsquo;s annual tax appraisal and lag the market by about a year. Values and {noun} often move for unrelated reasons.
      </p>
    </Section>
  );
}

function KeySignalsSection({ insights }: { insights: string[] }) {
  if (insights.length === 0) return null;
  return (
    <Section title="What stands out" subtitle="Signals from the data">
      <ul className="lv-area-signals">
        {insights.map((insight, i) => (
          <li key={`${i}-${insight.slice(0, 24)}`} className="lv-area-signal">
            <span className="lv-area-signal__dot" aria-hidden="true" />
            <p>{insight}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function WhatToDoSection({
  communityName, crimeKey, onWatchArea,
}: {
  communityName: string;
  crimeKey?: string;
  onWatchArea?: (communityName: string) => void;
}) {
  // Only Calgary keys have a /check-your-community page; namespaced keys
  // (e.g. "edmonton:downtown") belong to other cities.
  const isCalgary = !(crimeKey ?? '').includes(':');
  const slug = toSlug((crimeKey ?? communityName).replace(/^\w+:/, ''));

  return (
    <Section title="What to do" subtitle="Simple habits, the right number">
      <ul className="lv-area-tips">
        <li className="lv-area-tip">
          <span className="lv-area-tip__icon" aria-hidden="true"><Lock size={18} strokeWidth={2} /></span>
          <div>
            <p className="lv-area-tip__title">Lock up</p>
            <p className="lv-area-tip__body">Lock cars, bikes and garages, and keep valuables out of sight.</p>
          </div>
        </li>
        <li className="lv-area-tip">
          <span className="lv-area-tip__icon" aria-hidden="true"><Phone size={18} strokeWidth={2} /></span>
          <div>
            <p className="lv-area-tip__title">Report it to 311</p>
            <p className="lv-area-tip__body">Graffiti, needles, streetlights, noise: call <a href="tel:311">311</a> or use the City&rsquo;s 311 app.</p>
          </div>
        </li>
        <li className="lv-area-tip">
          <span className="lv-area-tip__icon" aria-hidden="true"><PhoneCall size={18} strokeWidth={2} /></span>
          <div>
            <p className="lv-area-tip__title">Police, not urgent</p>
            <p className="lv-area-tip__body">CPS non-emergency line: <a href="tel:4032661234">403-266-1234</a>.</p>
          </div>
        </li>
        <li className="lv-area-tip" data-tone="emergency">
          <span className="lv-area-tip__icon" aria-hidden="true"><Siren size={18} strokeWidth={2} /></span>
          <div>
            <p className="lv-area-tip__title">Emergency</p>
            <p className="lv-area-tip__body">If someone is in danger or a crime is happening now, call <a href="tel:911">911</a>.</p>
          </div>
        </li>
      </ul>

      <div className="lv-area-links">
        {onWatchArea ? (
          <button type="button" className="lv-area-cta" onClick={() => onWatchArea(communityName)}>
            <Bell size={18} strokeWidth={2} aria-hidden="true" />
            <span><b>Watch this area</b><small>Get alerts when neighbours report here</small></span>
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : (
          <Link to="/map?settings=alerts" className="lv-area-cta">
            <Bell size={18} strokeWidth={2} aria-hidden="true" />
            <span><b>Alerts near home</b><small>Get a note when neighbours report near your address</small></span>
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
        )}
        {isCalgary && slug && (
          <Link to={`/check-your-community?c=${slug}`} className="lv-area-link">
            <Compass size={18} strokeWidth={2} aria-hidden="true" />
            <span><b>Know your community</b><small>A year of {communityName}&rsquo;s reports to the City</small></span>
            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </Link>
        )}
        <Link to="/neighbourhoods" className="lv-area-link">
          <Users size={18} strokeWidth={2} aria-hidden="true" />
          <span><b>All neighbourhoods</b><small>Browse Calgary communities</small></span>
          <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    </Section>
  );
}

function dataSources(isStatcan: boolean) {
  const list = [
    {
      title: 'Community reports',
      content: 'Reports neighbours post on the Calgary Watch map. They are what people saw, shown as reported; check the source before you act. The 24-hour count only includes reports placed in this community.',
    },
    {
      title: 'Calgary 311 service requests',
      content: 'City of Calgary Open Data, dataset iahh-g8bj. Requests people made to the City’s 311 line, counted by community and grouped by service type. A request is a call for service, not a crime, and counts follow population and foot traffic.',
    },
    {
      title: 'Calgary property assessments',
      content: 'City of Calgary Open Data, dataset 4ur7-wsgc. Annual tax assessment values, averaged by community. They lag the market by about a year.',
    },
  ];
  if (isStatcan) {
    list.splice(2, 0, {
      title: 'Statistics Canada',
      content: 'Police-reported incident counts published by Statistics Canada, used where the City’s 311 data does not cover a community.',
    });
  }
  return list;
}

function DataSourcesSection({ isStatcanData }: { isStatcanData: boolean }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const sources = dataSources(isStatcanData);
  return (
    <Section title="Sources" subtitle="Where every number comes from">
      <div className="lv-area-acc">
        {sources.map(({ title, content }, idx) => (
          <div key={title} className="lv-area-acc__item">
            <button
              type="button"
              aria-expanded={openIdx === idx}
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className="lv-area-acc__btn"
            >
              <Database size={16} strokeWidth={2} aria-hidden="true" />
              <span>{title}</span>
              <motion.span animate={{ rotate: openIdx === idx ? 180 : 0 }} transition={{ duration: 0.2 }} className="lv-area-acc__chev">
                <ChevronDown size={16} strokeWidth={2} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {openIdx === idx && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="lv-area-acc__panel"
                >
                  <p>{content}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <p className="lv-area-foot">
        Reports aren&rsquo;t a score. Not everything gets reported, and busy places see more reports because more people are there.
      </p>
    </Section>
  );
}
