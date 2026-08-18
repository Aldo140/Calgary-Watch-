import { useState, useEffect, useRef } from 'react';
import { AreaIntelligence } from '@/src/types';
import { Card } from '@/src/components/ui/Card';
import { X, MapPin, Activity, TrendingUp, TrendingDown, ShieldCheck, Info, Database, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Sector,
  ComposedChart, Line,
} from 'recharts';
import { cn, publicAsset } from '@/src/lib/utils';
import { Drawer } from 'vaul';
import { CrimeStatEntry, CrimeYearEntry } from '@/src/hooks/useCrimeStats';
import { PropertyYearEntry } from '@/src/hooks/usePropertyAssessments';
import { useInView } from '@/src/hooks/useInView';
import { useCountUp } from '@/src/hooks/useCountUp';

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

interface AreaIntelligencePanelProps {
  data: AreaIntelligence | null;
  onClose: () => void;
  crimeStats?: Map<string, CrimeStatEntry>;
  yearlyStats?: Map<string, CrimeYearEntry[]>;
  statcanStats?: Map<string, CrimeStatEntry>;
  statcanYearlyStats?: Map<string, CrimeYearEntry[]>;
  propertyData?: PropertyYearEntry[];
  cityAverages?: { avgViolent: number; avgProperty: number; avgDisorder: number };
}

// ── Shared tooltip styles ────────────────────────────────────────────────────

function makeTooltipStyle() {
  return {
    backgroundColor: '#ffffff',
    borderRadius: '0px',
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 8px 32px -4px rgba(0,0,0,0.18)',
  };
}

function makeTooltipLabelStyle() {
  return {
    fontSize: 11,
    fontWeight: 900,
    color: '#1C2B3A',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
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
  const [ref, inView] = useInView();
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {/*
        Section heads take the poster's display register: a mono eyebrow in
        wide uppercase tracking over a black display headline. The body below
        stays sentence case — leading-[0.76] caps is magnificent at 9vw and
        unreadable across forty rows of data.
      */}
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <span className="h-[3px] w-5 shrink-0" style={{ background: '#4A90D9' }} aria-hidden="true" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#5A6B7D' }}>
            {subtitle ?? 'Area intelligence'}
          </p>
        </div>
        <h3
          className="mt-2 font-display text-[clamp(24px,5.4vw,30px)] font-black uppercase leading-[0.9] tracking-[-0.035em]"
          style={{ color: '#0B1F33' }}
        >
          {title}
        </h3>
      </div>
      {children}
    </motion.div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection({
  data, onClose, glowColor,
}: {
  data: AreaIntelligence;
  onClose: () => void;
  glowColor: string;
  gaugeColor: string;
}) {
  const score = data.safetyScore ?? 0;
  const rankMatch = (data.insights[0] ?? '').match(/#(\d+) of (\d+)/);
  const rank  = rankMatch ? parseInt(rankMatch[1], 10) : 0;
  const total = rankMatch ? parseInt(rankMatch[2], 10) : 0;
  const rankPct = rank > 0 && total > 0
    ? Math.round(((total - rank + 1) / total) * 100)
    : 0;
  const [gaugeRef, gaugeInView] = useInView(0);
  const animatedScore = useCountUp(score, 900, gaugeInView);

  /*
   * The severity ramp, lifted for the dark masthead.
   *
   * #C0392B is a 2.5:1 read against #0B1F33 — fine as a 10px bar on a light
   * card, unusable as the largest figure on the page. These are the same three
   * severity steps taken up in luminance until each clears the ground, and
   * none of them is the brand vermilion: on a map surface red means emergency,
   * so the marketing accent never appears here at all.
   */
  const ON_GROUND = { good: '#5FD3BC', mid: '#E8B871', bad: '#EE8C7B' } as const;
  const figureColor = score >= 70 ? ON_GROUND.good : score >= 40 ? ON_GROUND.mid : ON_GROUND.bad;
  const rankTone = rankPct <= 30 ? ON_GROUND.good : rankPct <= 60 ? ON_GROUND.mid : ON_GROUND.bad;
  const band = score >= 70 ? 'Low risk' : score >= 40 ? 'Medium risk' : 'High risk';

  const statTone = (v: string) => {
    if (v === 'improving' || v === 'Low') return ON_GROUND.good;
    if (v === 'declining' || v === 'High') return ON_GROUND.bad;
    if (v === 'Medium') return ON_GROUND.mid;
    return '#F2EFE8';
  };

  return (
    <div
      /*
       * ── Masthead ──────────────────────────────────────────────────────────
       * The header of a panel inside the app: poster devices on the poster's
       * own ground, with the single most important figure — the safety score —
       * given the size it deserves. Everything below the navigator stays on
       * the light data layer, because that is where people read numbers.
       */
      className="relative px-5 pt-6 pb-7 md:px-8 overflow-hidden"
      style={{ background: 'linear-gradient(150deg, #06162F 0%, #0B1F33 58%, #14324F 100%)' }}
    >
      {/* Calgary at the Bow, printed into the ground. */}
      <img
        src={publicAsset('images/illustration/calgary-bow-emblem.webp')}
        alt=""
        aria-hidden="true"
        /*
         * Anchored bottom-right so it never sits under the close button.
         *
         * The mobile values used to be the desktop ones with the offsets
         * pushed further out: 220px wide, dragged 48px past the right edge and
         * 56px past the bottom, then clipped by this header's overflow-hidden.
         * On a 375px-wide sheet that left a fragment — the emblem's top-left
         * corner cut on two sides — which reads as a rendering fault rather
         * than a watermark. Scaled to the narrower panel and pulled back inside
         * the right edge, it bleeds off one edge instead of two.
         */
        className="pointer-events-none absolute -right-4 -bottom-7 w-[150px] select-none opacity-[0.10] md:right-6 md:-bottom-16 md:w-[290px]"
        style={{ filter: 'invert(1)' }}
      />

      {/* Score-keyed glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 18% 55%, ${glowColor.replace('0.12)', '0.20)')}, transparent 62%)` }}
      />

      {/* Eyebrow + close */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-2">
          <MapPin size={11} style={{ color: '#AFC5DF' }} />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: '#AFC5DF' }}>Area Intel · YYC</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-2.5 rounded-none border transition-colors group hover:bg-[rgba(242,239,232,0.14)]"
          style={{ color: '#AFC5DF', borderColor: 'rgba(242,239,232,0.28)' }}
        >
          <X size={17} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      {/* Community name */}
      <h2
        className="font-display text-[clamp(30px,7vw,46px)] font-black uppercase tracking-[-0.04em] leading-[0.86] mb-5 relative z-10 truncate"
        style={{ color: '#F2EFE8' }}
        title={data.communityName}
      >
        {data.communityName}
      </h2>

      {/* The figure that leads the page. */}
      <div ref={gaugeRef} className="relative z-10">
        <div className="flex items-end gap-4">
          <span
            className="font-display font-black leading-[0.74] tabular-nums"
            style={{ color: figureColor, fontSize: 'clamp(3.6rem, 15vw, 5.25rem)' }}
          >
            {animatedScore}
          </span>
          <div className="min-w-0 pb-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: '#AFC5DF' }}>
              Safety score
            </p>
            <p className="mt-1 font-display text-[15px] font-black uppercase tracking-[-0.01em]" style={{ color: '#F2EFE8' }}>
              Out of 100 · {band}
            </p>
          </div>
        </div>
        {/* The gauge, unrolled: a meter reads at a glance where a 64px ring did not. */}
        <div className="mt-3.5 h-[9px] overflow-hidden md:max-w-[34rem]" style={{ background: 'rgba(242,239,232,0.16)' }}>
          <motion.div
            className="h-full"
            style={{ backgroundColor: figureColor }}
            initial={{ width: '0%' }}
            animate={{ width: gaugeInView ? `${score}%` : '0%' }}
            transition={{ duration: 0.9, ease: [0.33, 1, 0.68, 1] }}
          />
        </div>
      </div>

      {/* 3-col quick stat cards */}
      <div className="mt-4 grid grid-cols-3 gap-2 relative z-10 md:max-w-[34rem]">
        {[
          { label: 'Incidents', value: String(data.activeIncidents ?? 0) },
          { label: 'Trend', value: data.trend ?? '–' },
          { label: 'Risk', value: score >= 70 ? 'Low' : score >= 40 ? 'Medium' : 'High' },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-none px-2.5 py-2.5 border"
            style={{ background: 'rgba(242,239,232,0.06)', borderColor: 'rgba(242,239,232,0.20)' }}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] leading-none mb-1.5" style={{ color: '#AFC5DF' }}>{label}</p>
            <p className="font-display text-[14px] font-black truncate leading-none capitalize" style={{ color: statTone(value) }}>{value}</p>
          </div>
        ))}
      </div>

      {/* City rank bar */}
      {rank > 0 && total > 0 && (
        <div className="mt-4 relative z-10 md:max-w-[34rem]">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: '#AFC5DF' }}>City rank</p>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] tabular-nums" style={{ color: '#F2EFE8' }}>
              #{rank} of {total} neighbourhoods
            </p>
          </div>
          <div className="mt-2 h-[4px] rounded-none overflow-hidden" style={{ background: 'rgba(242,239,232,0.16)' }}>
            <motion.div
              className="h-full rounded-none"
              style={{ backgroundColor: rankTone }}
              initial={{ width: '0%' }}
              animate={{ width: `${rankPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
            />
          </div>
        </div>
      )}

      {/* Live overlay insight */}
      {data.liveOverlayInsight && (
        <div
          className="mt-4 flex items-start gap-2.5 rounded-none px-3.5 py-3 relative z-10 md:max-w-[46rem]"
          style={{ background: 'rgba(74,144,217,0.16)', borderLeft: '3px solid #4A90D9' }}
        >
          <Activity size={13} style={{ color: '#8DBBDB' }} className="shrink-0 mt-0.5" />
          <p className="text-[12px] font-medium leading-relaxed" style={{ color: '#DCE7F4' }}>
            {data.liveOverlayInsight}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Content (module-level) ────────────────────────────────────────────────────

interface ContentProps {
  data: AreaIntelligence;
  onClose: () => void;
  crimeEntry: CrimeStatEntry | undefined;
  realYearly: CrimeYearEntry[];
  hasRealData: boolean;
  isStatcanData: boolean;
  score: number;
  glowColor: string;
  gaugeColor: string;
  chartData: { name: string; Violent: number; Property: number; Disorder: number }[];
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
  propertyData: PropertyYearEntry[];
  cityAverages?: { avgViolent: number; avgProperty: number; avgDisorder: number };
}

const INTEL_SECTIONS = [
  { id: 'sec-year', label: 'This year' },
  { id: 'sec-trends', label: 'Trends' },
  { id: 'sec-mix', label: 'Crime mix' },
  { id: 'sec-property', label: 'Property' },
  { id: 'sec-signals', label: 'Signals' },
  { id: 'sec-sources', label: 'Sources' },
] as const;

function Content({
  data,
  onClose,
  crimeEntry,
  realYearly,
  hasRealData,
  isStatcanData,
  score,
  glowColor,
  gaugeColor,
  chartData,
  tooltipStyle,
  tooltipLabelStyle,
  propertyData,
  cityAverages,
}: ContentProps) {
  const heroRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [miniBarVisible, setMiniBarVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<string>(INTEL_SECTIONS[0].id);

  // Reset mini-bar when community changes
  useEffect(() => { setMiniBarVisible(false); setActiveSection(INTEL_SECTIONS[0].id); }, [data.communityName]);

  // Show mini-bar once hero scrolls out of view
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setMiniBarVisible(!entry.isIntersecting),
      { threshold: 0, root: scrollRef.current }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [data.communityName]);

  // Scrollspy for the section navigator
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
      { root, rootMargin: '-30% 0px -55% 0px' }
    );
    INTEL_SECTIONS.forEach(({ id }) => {
      const el = root.querySelector(`#${id}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [data.communityName]);

  const jumpTo = (id: string) => {
    scrollRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative text-[#1C2B3A]">
      {/* Sticky mini-bar */}
      <AnimatePresence>
        {miniBarVisible && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="sticky top-0 z-20 flex items-center justify-between px-5 py-2.5 border-b backdrop-blur-xl bg-[rgba(255,253,248,0.94)] border-[#E7E0D2]"
          >
            <span className="font-display text-[15px] font-black uppercase tracking-[-0.02em] truncate" style={{ color: '#0B1F33' }}>{data.communityName}</span>
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] tabular-nums px-2.5 py-1.5 rounded-none"
                style={{ background: '#0B1F33', color: '#F2EFE8' }}
              >
                {score} / 100
              </span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-none hover:bg-black/5"
                style={{ color: '#5A6B7D' }}
              >
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar">
        <div ref={heroRef}>
          <HeroSection data={data} onClose={onClose} glowColor={glowColor} gaugeColor={gaugeColor} />
        </div>

        {/* Section navigator — sticks under the mini-bar, scrollspy-highlighted */}
        <div
          className="sticky top-0 z-10 flex gap-2 overflow-x-auto no-scrollbar px-5 md:px-8 pt-3.5 pb-4 border-b backdrop-blur-xl bg-[rgba(255,253,248,0.94)] border-[#E7E0D2]"
        >
          {INTEL_SECTIONS.map(({ id, label }) => {
            const active = activeSection === id;
            return (
              /*
                The one hard-offset press in this view, and it only ever lands
                on one tab at a time — the offset shadow is the depth, so
                pressing collapses the tab into the page. Nothing else in the
                panel carries a shadow: one is a signature, twelve is noise.
              */
              <button
                key={id}
                type="button"
                onClick={() => jumpTo(id)}
                className={cn(
                  'shrink-0 rounded-none px-3.5 h-9 font-mono text-[10px] font-bold uppercase tracking-[0.14em] border transition-transform',
                  active && 'shadow-[3px_3px_0_#4A90D9] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
                )}
                style={active
                  ? { background: '#0B1F33', borderColor: '#0B1F33', color: '#F2EFE8' }
                  : { background: '#F7F3EA', borderColor: '#E7E0D2', color: '#5A6B7D' }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="px-5 md:px-8 py-8 space-y-12 bg-[#FFFDF8]">
          <div id="sec-year" className="scroll-mt-16">
            <CrimeThisYearSection
              crimeEntry={crimeEntry}
              cityAverages={cityAverages}
              yearlyStats={realYearly}
              isStatcanData={isStatcanData}
            />
          </div>
          <div id="sec-trends" className="scroll-mt-16">
            <TrendChartSection
              chartData={chartData}
              hasRealData={hasRealData}
              yearlyStats={realYearly}
              tooltipStyle={tooltipStyle}
              tooltipLabelStyle={tooltipLabelStyle}
            />
          </div>
          <div id="sec-mix" className="scroll-mt-16">
            <DonutSection
              crimeEntry={crimeEntry}
            />
          </div>
          <div id="sec-property" className="scroll-mt-16">
            <PropertyValueSection
              key={`pv-${data.communityName}`}
              propertyData={propertyData}
              yearlyStats={realYearly}
              tooltipStyle={tooltipStyle}
              tooltipLabelStyle={tooltipLabelStyle}
              score={score}
              communityName={data.communityName}
            />
          </div>
          <div id="sec-signals" className="scroll-mt-16">
            <KeySignalsSection
              insights={data.insights}
            />
          </div>
          {/* The city itself, as the rule that closes the reading. */}
          <img
            src={publicAsset('images/illustration/calgary-skyline-rule.webp')}
            alt=""
            aria-hidden="true"
            className="pointer-events-none -mb-4 h-14 w-full select-none object-contain object-bottom opacity-[0.18] md:h-20"
          />
          <div id="sec-sources" className="scroll-mt-16">
            <DataSourcesSection />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function AreaIntelligencePanel({
  data, onClose, crimeStats, yearlyStats, statcanStats, statcanYearlyStats, propertyData, cityAverages,
}: AreaIntelligencePanelProps) {
  if (!data) return null;

  const communityKey   = data.crimeKey ?? data.communityName.toLowerCase();
  const crimeEntry     = crimeStats?.get(communityKey);
  const realYearly     = yearlyStats?.get(communityKey) ?? [];
  const hasRealData    = realYearly.length > 0;
  const isStatcanData  = crimeEntry?.dataSource === 'statcan';
  const score          = data.safetyScore ?? 0;
  const gaugeColor     = score >= 70 ? '#2E8B7A' : score >= 40 ? '#C77F18' : '#C0392B';
  const glowColor      = score >= 70 ? 'rgba(52,211,153,0.12)' : score >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';

  const chartData = hasRealData
    ? realYearly.map(e => ({ name: String(e.year), Violent: e.violent, Property: e.property, Disorder: e.disorder }))
    : data.monthlyTrends.map(t => ({ name: t.month, Violent: t.violent_crime, Property: t.property_crime, Disorder: t.disorder_calls }));

  const tooltipStyle      = makeTooltipStyle();
  const tooltipLabelStyle = makeTooltipLabelStyle();

  const contentProps: ContentProps = {
    data,
    onClose,
    crimeEntry,
    realYearly,
    hasRealData,
    isStatcanData,
    score,
    glowColor,
    gaugeColor,
    chartData,
    tooltipStyle,
    tooltipLabelStyle,
    propertyData: propertyData ?? [],
    cityAverages,
  };

  return (
    <>
      {/* Desktop panel */}
      <div className="hidden lg:block">
        <AnimatePresence>
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 h-full z-[90] p-5 md:p-6"
          >
            <Card className="h-full w-[min(62vw,66rem)] min-w-[46rem] shadow-[0_24px_80px_-24px_rgba(28,43,58,0.55)] overflow-hidden rounded-none relative border-[#E7E0D2] bg-[#FFFDF8]">
              <div className="absolute top-0 inset-x-0 h-1 z-20" style={{ background: gaugeColor }} aria-hidden="true" />
              <Content {...contentProps} />
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mobile drawer */}
      <div className="lg:hidden">
        <Drawer.Root open={!!data} onClose={onClose}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-[rgba(20,28,38,0.5)] backdrop-blur-sm z-[100]" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 h-[94dvh] z-[101] outline-none">
              <div className="h-full rounded-none overflow-hidden flex flex-col relative bg-[#FFFDF8]">
                {/* score-keyed accent spine */}
                <div className="absolute top-0 inset-x-0 h-1 z-20" style={{ background: gaugeColor }} aria-hidden="true" />
                <div className="mx-auto w-10 h-1 flex-shrink-0 rounded-none mt-3 mb-0 bg-[#E7E0D2]" />
                <Drawer.Title className="sr-only">{data.communityName} Area Intelligence</Drawer.Title>
                <Drawer.Description className="sr-only">Safety scores, crime trends, and historical data for {data.communityName}.</Drawer.Description>
                <Content {...contentProps} />
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </>
  );
}

// ── Section stubs (filled in Tasks 7–11) ─────────────────────────────────────

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 48, H = 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const first = values[0], last = values[values.length - 1];
  const delta = first > 0 ? ((last - first) / first) * 100
              : last > 0  ? 100
              : 0;
  const color = delta < -5 ? '#2E8B7A' : delta > 5 ? '#C0392B' : '#6E6357';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrimeThisYearSection({
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
      <Section title="Crime This Year" subtitle="Calgary Police Service · Open Data">
        {/*
          A notice, not an alarm: paper card, one gold spine on the left. The
          amber-50 / amber-800 pair it replaced put 14px body on a wash that
          composited to #FEF6E7 — legible, but it read as a warning banner for
          what is only a name mismatch between two datasets.
        */}
        <div
          className="rounded-none p-4 pl-4 flex items-start gap-2.5"
          style={{ background: '#F7F3EA', border: '1px solid #E7E0D2', borderLeft: '3px solid #C77F18' }}
        >
          <Info size={14} style={{ color: '#8A5710' }} className="shrink-0 mt-0.5" />
          <p className="text-[13.5px] leading-relaxed" style={{ color: '#1C2B3A' }}>
            Detailed breakdown not available for this community. The community name may differ between datasets.
          </p>
        </div>
      </Section>
    );
  }

  const maxVal = Math.max(crimeEntry.violent, crimeEntry.property, crimeEntry.disorder, 1);

  const last6 = yearlyStats.slice(-6);
  const rows = [
    {
      label: 'Violent Crime',
      value: crimeEntry.violent,
      avg: cityAverages?.avgViolent ?? 0,
      color: 'bg-[#C0392B]',
      sparkValues: last6.map(e => e.violent),
    },
    {
      label: 'Property Crime',
      value: crimeEntry.property,
      avg: cityAverages?.avgProperty ?? 0,
      color: 'bg-[#4A90D9]',
      sparkValues: last6.map(e => e.property),
    },
    {
      label: 'Disorder Calls',
      value: crimeEntry.disorder,
      avg: cityAverages?.avgDisorder ?? 0,
      color: 'bg-[#C77F18]',
      sparkValues: last6.map(e => e.disorder),
    },
  ];

  return (
    <Section
      title="Crime This Year"
      subtitle={`${crimeEntry.year} · Calgary Police Service · Open Data`}
    >
      {/*
        The StatsCan badge was #8DBBDB on a 20% wash of #4A90D9 — 1.7:1 against
        the tint it actually sat on, which a parent-only contrast check misses
        entirely. Solid ground, ink reversed out: 7.4:1.
      */}
      {isStatcanData && (
        <span
          className="px-2 py-1 rounded-none font-mono text-[10px] font-bold uppercase tracking-[0.18em] inline-block mb-4"
          style={{ background: '#2A6099', color: '#F2EFE8' }}
        >
          StatsCan
        </span>
      )}
      <div ref={barsRef} className="space-y-5">
        {rows.map(({ label, value, avg, color, sparkValues }, i) => {
          const pct = Math.round((value / maxVal) * 100);
          const vsCity = avg > 0 ? Math.round((value / avg) * 100) : 0;
          const vsLabel = vsCity > 0 ? `${vsCity}% of city avg` : '–';
          /*
           * Each chip is checked against its OWN composited tint, not the card
           * behind it. On #FFFDF8 these land at 5.4:1, 4.6:1 and 4.4:1; the
           * `text-red-600 bg-red-50` pairs they replaced were authored against
           * a white page that this panel does not have.
           */
          const vsColor: React.CSSProperties =
            vsCity > 120 ? { color: '#A6332A', background: 'rgba(192,57,43,0.12)',  borderColor: 'rgba(192,57,43,0.38)' } :
            vsCity > 80  ? { color: '#8A5710', background: 'rgba(199,127,24,0.14)', borderColor: 'rgba(199,127,24,0.42)' } :
                           { color: '#1F6355', background: 'rgba(46,139,122,0.14)', borderColor: 'rgba(46,139,122,0.42)' };

          return (
            <div key={label}>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] truncate" style={{ color: '#1C2B3A' }}>{label}</span>
                  {vsCity > 0 && (
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] tabular-nums px-1.5 py-0.5 rounded-none border shrink-0" style={vsColor}>{vsLabel}</span>
                  )}
                </div>
                <Sparkline values={sparkValues} />
                <span className="font-display text-[22px] font-black leading-none tabular-nums shrink-0" style={{ color: '#0B1F33' }}>{value.toLocaleString()}</span>
              </div>
              <div className="h-[10px] rounded-none overflow-hidden bg-[#E7E0D2]">
                <motion.div
                  className={cn('h-full rounded-none', color)}
                  initial={{ width: '0%' }}
                  animate={{ width: barsInView ? `${pct}%` : '0%' }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.08 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="font-mono text-[10px] leading-relaxed tracking-[0.06em] mt-5 pt-4" style={{ color: '#5A6B7D', borderTop: '1px solid #E7E0D2' }}>
        Criminal offences reported to Calgary Police · {crimeEntry.year} · City of Calgary Open Data (78gh-n26t, h3h6-kgme)
      </p>
    </Section>
  );
}

function TrendChartSection({
  chartData, hasRealData, yearlyStats, tooltipStyle, tooltipLabelStyle,
}: {
  chartData: { name: string; Violent: number; Property: number; Disorder: number }[];
  hasRealData: boolean;
  yearlyStats: CrimeYearEntry[];
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
}) {
  const [showViolent,  setShowViolent]  = useState(true);
  const [showProperty, setShowProperty] = useState(true);
  const [showDisorder, setShowDisorder] = useState(true);

  // Year-over-year deltas for most recent year
  const deltaRow = (() => {
    if (yearlyStats.length < 2) return null;
    const latest = yearlyStats[yearlyStats.length - 1];
    const prior  = yearlyStats[yearlyStats.length - 2];
    const pct = (a: number, b: number) => b === 0 ? null : Math.round(((a - b) / b) * 100);
    return {
      violent:  pct(latest.violent,  prior.violent),
      property: pct(latest.property, prior.property),
      disorder: pct(latest.disorder, prior.disorder),
      year: latest.year,
    };
  })();

  const startYear = chartData[0]?.name ?? '';
  const endYear   = chartData[chartData.length - 1]?.name ?? '';

  /*
   * The series colour states the series; the *text* is a darkened step of it.
   * #C77F18 label type on a 14% tint of itself is a 3:1 read at 10px, which is
   * not good enough for a control — so the line keeps the true hue and the
   * word keeps the contrast.
   */
  const INACTIVE_PILL = { background: '#F7F3EA', borderColor: '#E7E0D2', color: '#5A6B7D' } as const;
  const pills = [
    { key: 'violent'  as const, label: 'Violent',  active: showViolent,  toggle: () => setShowViolent(p  => !p), on: { background: 'rgba(192,57,43,0.13)',  borderColor: '#C0392B', color: '#A6332A' } },
    { key: 'property' as const, label: 'Property', active: showProperty, toggle: () => setShowProperty(p => !p), on: { background: 'rgba(74,144,217,0.15)', borderColor: '#4A90D9', color: '#2A6099' } },
    { key: 'disorder' as const, label: 'Disorder', active: showDisorder, toggle: () => setShowDisorder(p => !p), on: { background: 'rgba(199,127,24,0.15)', borderColor: '#C77F18', color: '#8A5710' } },
  ];

  return (
    <Section
      title="6-Year Picture"
      subtitle={`${startYear} – ${endYear} · Annual reported incidents${hasRealData ? ' · Calgary Open Data' : ' · Estimated'}`}
    >
      {/* Toggle pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {pills.map(({ key, label, active, toggle, on }) => (
          <button
            key={key}
            onClick={toggle}
            className="px-3 h-8 rounded-none font-mono text-[10px] font-bold uppercase tracking-[0.18em] border-2 transition-colors"
            style={active ? on : INACTIVE_PILL}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Area chart */}
      <div
        className="h-[280px] md:h-[320px] w-full rounded-none p-4 border bg-[#F7F3EA] border-[#E7E0D2]"
        role="img"
        aria-label={`Crime trend chart for ${startYear}–${endYear}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="aiV" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#C0392B" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#C0392B" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="aiP" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#4A90D9" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#4A90D9" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="aiD" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#C77F18" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#C77F18" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={'rgba(0,0,0,0.07)'} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5A5247', fontWeight: 700 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5A5247', fontWeight: 700 }} tickFormatter={fmtTick} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ fontSize: 12, fontWeight: 'bold' }} labelStyle={tooltipLabelStyle} />
            {showViolent  && <Area type="monotone" dataKey="Violent"  stroke="#C0392B" strokeWidth={2.5} fillOpacity={1} fill="url(#aiV)" isAnimationActive animationBegin={200} animationDuration={800} />}
            {showProperty && <Area type="monotone" dataKey="Property" stroke="#4A90D9" strokeWidth={2.5} fillOpacity={1} fill="url(#aiP)" isAnimationActive animationBegin={200} animationDuration={800} />}
            {showDisorder && <Area type="monotone" dataKey="Disorder" stroke="#C77F18" strokeWidth={2.5} fillOpacity={1} fill="url(#aiD)" isAnimationActive animationBegin={200} animationDuration={800} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Year-delta row */}
      {deltaRow && (
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: 'Violent',  delta: deltaRow.violent  },
            { label: 'Property', delta: deltaRow.property },
            { label: 'Disorder', delta: deltaRow.disorder },
          ].map(({ label, delta }) => {
            if (delta === null) return null;
            const isUp  = delta > 0;
            // Darkened steps of the severity ramp: #C0392B and #2E8B7A read at
            // 4.9:1 and 3.7:1 on this card, #A6332A and #1F6355 at 6.4 and 6.0.
            const color = isUp ? '#A6332A' : '#1F6355';
            return (
              <div
                key={label}
                className="rounded-none p-3 text-center"
                style={{ background: '#F7F3EA', border: '1px solid #E7E0D2', borderTop: `3px solid ${color}` }}
              >
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: '#5A6B7D' }}>{label}</p>
                <p className="font-display text-[24px] font-black leading-none tabular-nums" style={{ color }}>
                  {isUp ? '↑' : '↓'}{Math.abs(delta)}%
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] mt-1.5" style={{ color: '#5A6B7D' }}>vs prior year</p>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function DonutSection({
  crimeEntry,
}: {
  crimeEntry: CrimeStatEntry | undefined;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const total = crimeEntry ? crimeEntry.violent + crimeEntry.property + crimeEntry.disorder : 0;

  if (!crimeEntry || total === 0) return null;
  const slices = [
    { name: 'Violent',  value: crimeEntry.violent,  color: '#C0392B', description: 'Assault, robbery, threats' },
    { name: 'Property', value: crimeEntry.property, color: '#4A90D9', description: 'Break & enter, theft' },
    { name: 'Disorder', value: crimeEntry.disorder, color: '#C77F18', description: 'Non-criminal service calls' },
  ];

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent } = props;
    return (
      <g>
        <text x={cx} y={cy - 10} textAnchor="middle" fill={'#0B1F33'} style={{ fontSize: 22, fontWeight: 900 }}>
          {payload.value.toLocaleString()}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#6E6357" style={{ fontSize: 11, fontWeight: 700 }}>
          {(percent * 100).toFixed(0)}% of total
        </text>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
        <Sector cx={cx} cy={cy} innerRadius={outerRadius + 12} outerRadius={outerRadius + 16} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      </g>
    );
  };

  return (
    <Section
      title="What's Driving Activity"
      subtitle={`Proportional breakdown · ${crimeEntry.year}`}
    >
      <div className="flex flex-col md:flex-row gap-6 items-center">
        <div className="w-full md:w-auto flex justify-center">
          <PieChart width={240} height={240}>
            {/* activeIndex is untyped in recharts 3.x — cast required */}
            <Pie
              {...{ activeIndex: activeIdx } as object}
              activeShape={renderActiveShape}
              data={slices}
              cx={120} cy={120}
              innerRadius={68} outerRadius={100}
              dataKey="value"
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

        {/* Legend */}
        <div className="flex-1 space-y-3 w-full">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] mb-3 pb-3" style={{ color: '#5A6B7D', borderBottom: '1px solid #E7E0D2' }}>
            Total: {total.toLocaleString()} incidents
          </p>
          {slices.map(({ name, value, color, description }, i) => (
            <button
              key={name}
              onClick={() => setActiveIdx(i)}
              className={cn(
                'w-full flex items-center gap-3 rounded-none p-3 border text-left transition-all',
                activeIdx === i
                  ? ('border-[#C9D8E4] bg-[#E8F3FC]')
                  : ('border-[#E7E0D2] bg-[#FFFDF8] hover:bg-[#F7F3EA]')
              )}
            >
              {/* A legend has to be the real colours or it is not a legend. */}
              <div className="w-4 h-8 rounded-none shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#0B1F33' }}>{name}</span>
                  <span className="font-display text-[19px] font-black leading-none tabular-nums" style={{ color: '#0B1F33' }}>{value.toLocaleString()}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1">
                  <span className="text-[11.5px] truncate" style={{ color: '#5A6B7D' }}>{description}</span>
                  <span className="font-mono text-[10px] font-bold tabular-nums shrink-0" style={{ color: '#5A6B7D' }}>
                    {total > 0 ? `${Math.round((value / total) * 100)}%` : '–'}
                  </span>
                </div>
              </div>
            </button>
          ))}
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] pt-2" style={{ color: '#5A6B7D' }}>
            Tap a slice or row to highlight
          </p>
        </div>
      </div>
    </Section>
  );
}

interface PropertyValueContentProps {
  combined: { name: string; TotalCrime: number; AvgValue: number }[];
  latestEntry: { name: string; TotalCrime: number; AvgValue: number };
  earliestEntry: { name: string; TotalCrime: number; AvgValue: number };
  valueChange: number | null;
  score: number;
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
}

function PropertyValueContent({
  combined, latestEntry, earliestEntry, valueChange, score, tooltipStyle, tooltipLabelStyle,
}: PropertyValueContentProps) {
  const [valueRef, valueInView] = useInView();
  const animatedValue  = useCountUp(latestEntry.AvgValue, 1200, valueInView);
  const animatedChange = useCountUp(Math.abs(valueChange ?? 0), 1000, valueInView);

  const gaugeColor  = score >= 70 ? '#2E8B7A' : score >= 40 ? '#C77F18' : '#C0392B';
  const CHART_W     = 216;
  const CHART_H     = 216;
  const PAD         = 32;
  // Both axes are centred on a city benchmark, so the crosshair in the middle
  // of the plot genuinely is "city average" and the four quadrant labels mean
  // something relative.
  //
  // The value axis used to run 0–$1M, which put the divider at $500k and
  // labelled it City Avg. Calgary's 2025 residential assessments (dataset
  // 4ur7-wsgc, n=20,000) are median $598k with p10 $334.5k and p90 $858.5k, so
  // a flat 0–$1M scale pushed ordinary communities into the bottom half and
  // marked them "Hidden Gem" whatever they were worth. Scaling p10→p90 lands
  // the median in the centre, because the median sits almost exactly midway
  // between those percentiles.
  //
  // Safety runs 40–100 rather than 0–100: these scores cluster high, so a
  // midpoint of 50 put nearly every community on the safe side of the divider.
  const clamp01     = (n: number) => Math.min(Math.max(n, 0), 1);
  const dotX        = PAD + clamp01((score - SAFETY_AXIS_MIN) / (SAFETY_AXIS_MAX - SAFETY_AXIS_MIN)) * CHART_W;
  const dotY        = PAD + (1 - clamp01((latestEntry.AvgValue - VALUE_AXIS_MIN) / (VALUE_AXIS_MAX - VALUE_AXIS_MIN))) * CHART_H;

  const crimeFirst  = combined[0].TotalCrime;
  const crimeLast   = combined[combined.length - 1].TotalCrime;
  const valuFirst   = combined[0].AvgValue;
  const valueLast   = combined[combined.length - 1].AvgValue;
  const crimeDelta  = crimeFirst > 0 ? Math.round(((crimeLast - crimeFirst) / crimeFirst) * 100) : null;
  const valuDelta   = valuFirst  > 0 ? Math.round(((valueLast  - valuFirst)  / valuFirst)  * 100) : null;
  const startYear   = combined[0].name;
  const endYear     = combined[combined.length - 1].name;

  const correlationText = (() => {
    if (crimeDelta === null || valuDelta === null) return null;
    if (crimeDelta < 0 && valuDelta > 0)
      return `As incidents fell ${Math.abs(crimeDelta)}% (${startYear}–${endYear}), assessed values climbed ${valuDelta}% — values tracked the safety improvement.`;
    if (crimeDelta > 0 && valuDelta > 0)
      return `Despite a ${crimeDelta}% rise in incidents, values grew ${valuDelta}% — demand outpaced safety concerns.`;
    if (crimeDelta < 0 && valuDelta < 0)
      return `Incidents fell ${Math.abs(crimeDelta)}% but values also declined ${Math.abs(valuDelta)}% — other factors drove the market.`;
    return `Property values and crime trends moved independently over this period.`;
  })();

  return (
    <Section
      title="Property Value vs Safety"
      subtitle="Assessed values · City of Calgary · Cross-referenced with crime data"
    >
      {/* Quadrant plot */}
      <div
        ref={valueRef}
        className="rounded-none border p-4 mb-4 bg-[#F7F3EA] border-[#E7E0D2]"
        role="img"
        aria-label="Safety score vs property value quadrant"
      >
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: '#5A6B7D' }}>
          Safety Score vs Assessed Value
        </p>
        {/*
          Capped, not fluid. `width="100%"` over a 280-unit viewBox let the plot
          stretch to the full 1376px desktop panel, which scaled its 10px
          quadrant labels to roughly 55px — the axis titles rendered larger than
          the section headline. The plot is a fixed-size diagram, so it gets a
          fixed size and the panel's width is spent on the charts that use it.
        */}
        <svg
          width="100%"
          viewBox={`0 0 ${CHART_W + PAD * 2} ${CHART_H + PAD * 2}`}
          style={{ display: 'block', maxWidth: CHART_W + PAD * 2, marginRight: 'auto' }}
        >
          {/*
            Quadrant zones. The washes used to be slate-50 / green-50 / red-50
            / blue-50 at 80% — cold greys and pinks laid over a warm #F7F3EA
            card, which is what made this plot look pasted in from another app.
            Same four meanings, tinted from the severity ramp so they sit on
            the card's own ground.
          */}
          <rect x={PAD} y={PAD} width={CHART_W / 2} height={CHART_H / 2} fill="rgba(90,107,125,0.07)" />
          <rect x={PAD + CHART_W / 2} y={PAD} width={CHART_W / 2} height={CHART_H / 2} fill="rgba(46,139,122,0.11)" />
          <rect x={PAD} y={PAD + CHART_H / 2} width={CHART_W / 2} height={CHART_H / 2} fill="rgba(192,57,43,0.09)" />
          <rect x={PAD + CHART_W / 2} y={PAD + CHART_H / 2} width={CHART_W / 2} height={CHART_H / 2} fill="rgba(74,144,217,0.11)" />
          {/* Dividing lines */}
          <line x1={PAD} y1={PAD + CHART_H / 2} x2={PAD + CHART_W} y2={PAD + CHART_H / 2} stroke="#C9D8E4" strokeWidth="1" strokeDasharray="4,4" />
          <line x1={PAD + CHART_W / 2} y1={PAD} x2={PAD + CHART_W / 2} y2={PAD + CHART_H} stroke="#C9D8E4" strokeWidth="1" strokeDasharray="4,4" />
          {/* Quadrant labels — the panel's mono label register, in SVG. */}
          <text x={PAD + 6} y={PAD + 14} fontSize="10" fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" letterSpacing="1.2" fill="#5A6B7D">TRANSITIONING</text>
          <text x={PAD + CHART_W / 2 + 4} y={PAD + 14} fontSize="10" fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" letterSpacing="1.2" fill="#1F6355">PREMIER</text>
          <text x={PAD + 6} y={PAD + CHART_H - 4} fontSize="10" fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" letterSpacing="1.2" fill="#A6332A">CHALLENGED</text>
          <text x={PAD + CHART_W / 2 + 4} y={PAD + CHART_H - 4} fontSize="10" fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" letterSpacing="1.2" fill="#2A6099">HIDDEN GEM</text>
          {/* City avg crosshair */}
          <line x1={PAD + CHART_W / 2 - 6} y1={PAD + CHART_H / 2} x2={PAD + CHART_W / 2 + 6} y2={PAD + CHART_H / 2} stroke="#6E6357" strokeWidth="1.5" />
          <line x1={PAD + CHART_W / 2} y1={PAD + CHART_H / 2 - 6} x2={PAD + CHART_W / 2} y2={PAD + CHART_H / 2 + 6} stroke="#6E6357" strokeWidth="1.5" />
          <text x={PAD + CHART_W / 2 + 8} y={PAD + CHART_H / 2 - 4} fontSize="10" fill="#5A6B7D" fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" letterSpacing="1">CITY AVG</text>
          {/* Community dot with pulsing ring */}
          <motion.g
            initial={{ scale: 0, opacity: 0 }}
            animate={valueInView ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            transition={{ delay: 0.4, type: 'spring', damping: 14, stiffness: 250 }}
            style={{ transformOrigin: `${dotX}px ${dotY}px` } as React.CSSProperties}
          >
            <circle cx={dotX} cy={dotY} r="14" fill={gaugeColor} opacity="0.15">
              <animate attributeName="r" values="10;16;10" dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.15;0;0.15" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle cx={dotX} cy={dotY} r="7" fill={gaugeColor} />
          </motion.g>
          {/* Axis labels */}
          <text x={PAD + CHART_W / 2} y={PAD + CHART_H + 18} fontSize="10" fill="#5A6B7D" textAnchor="middle" fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" letterSpacing="1.2">SAFETY SCORE →</text>
          <text x={PAD - 20} y={PAD + CHART_H / 2} fontSize="10" fill="#5A6B7D" textAnchor="middle" transform={`rotate(-90, ${PAD - 20}, ${PAD + CHART_H / 2})`} fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" letterSpacing="1.2">VALUE →</text>
        </svg>
      </div>

      {/* Correlation callout */}
      {correlationText && combined.length >= 2 && (
        <div className="rounded-none px-4 py-3 mb-4" style={{ background: '#E8F3FC', borderLeft: '3px solid #4A90D9' }}>
          <p className="text-[13px] italic leading-relaxed" style={{ color: '#174A6E' }}>
            {correlationText}
          </p>
        </div>
      )}

      <div
        className="h-[280px] md:h-[320px] w-full rounded-none p-4 border bg-[#F7F3EA] border-[#E7E0D2]"
        role="img"
        aria-label="Property value versus total crime by year"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={combined}>
            <defs>
              <linearGradient id="aiCrime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#C0392B" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#C0392B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={'rgba(0,0,0,0.07)'} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#5A5247', fontWeight: 700 }} dy={8} />
            <YAxis yAxisId="crime" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#A6332A', fontWeight: 700 }} tickFormatter={fmtTick} orientation="left" />
            <YAxis yAxisId="value" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6A63A8', fontWeight: 700 }} tickFormatter={fmtDollars} orientation="right" />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(val: any, name: any) => {
                const n: number = typeof val === 'number' ? val : 0;
                return name === 'AvgValue'
                  ? [fmtDollars(n), 'Avg. Assessed Value']
                  : [n.toLocaleString(), 'Total Incidents'];
              }}
              itemStyle={{ fontSize: 12, fontWeight: 'bold' }}
            />
            <Area yAxisId="crime" type="monotone" dataKey="TotalCrime" stroke="#C0392B" strokeWidth={2} fill="url(#aiCrime)" fillOpacity={1} isAnimationActive animationBegin={200} animationDuration={800} />
            <Line  yAxisId="value" type="monotone" dataKey="AvgValue"   stroke="#6A63A8" strokeWidth={3} dot={{ r: 4, fill: '#6A63A8', strokeWidth: 2, stroke: '#F7F3EA' }} isAnimationActive animationBegin={200} animationDuration={800} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Insight row */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-none p-3 border bg-[#F7F3EA] border-[#E7E0D2]">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: '#5A6B7D' }}>Avg. Assessed Value ({latestEntry.name})</p>
          <p className="font-display text-[28px] font-black tabular-nums leading-none" style={{ color: '#4F4A85' }}>{fmtDollars(animatedValue)}</p>
        </div>
        <div className="rounded-none p-3 border bg-[#F7F3EA] border-[#E7E0D2]">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: '#5A6B7D' }}>Change vs {earliestEntry.name}</p>
          {valueChange !== null ? (
            <p className="font-display text-[28px] font-black tabular-nums leading-none" style={{ color: valueChange >= 0 ? '#1F6355' : '#A6332A' }}>
              {valueChange >= 0 ? '↑' : '↓'}{animatedChange}%
            </p>
          ) : (
            <p className="font-display text-[28px] font-black leading-none" style={{ color: '#5A6B7D' }}>–</p>
          )}
        </div>
      </div>

      {/* Methodology note */}
      <p className="text-[12px] leading-relaxed mt-3 italic" style={{ color: '#5A6B7D' }}>
        Assessed values are the City of Calgary's annual tax appraisal — they typically lag the real estate market by approximately one year. Cross-referencing with crime trends can reveal whether safety changes precede or follow property value shifts.
      </p>
    </Section>
  );
}

/**
 * City benchmarks for the safety-vs-value quadrant.
 *
 * Value figures are Calgary residential assessments for roll year 2025
 * (Open Data 4ur7-wsgc, 20,000-row sample): median $598,000, p10 $334,500,
 * p90 $858,500. The axis spans p10→p90 so communities spread across the plot
 * and the median falls in the centre, where the "City Avg" crosshair is drawn.
 *
 * Safety scores in this app cluster well above 50, so the axis starts at 40 to
 * put a typical score near the middle rather than hard against the right edge.
 */
const VALUE_AXIS_MIN = 334_500;
const VALUE_AXIS_MAX = 858_500;
const SAFETY_AXIS_MIN = 40;
const SAFETY_AXIS_MAX = 100;

function PropertyValueSection({
  propertyData, yearlyStats, tooltipStyle, tooltipLabelStyle, score, communityName,
}: {
  propertyData: PropertyYearEntry[];
  communityName: string;
  yearlyStats: CrimeYearEntry[];
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
  score: number;
}) {
  // Names the city uses for land with no housing on it.
  const isNonResidentialArea = /\b(industrial|park|business|commercial|airport|reserve)\b/i.test(
    communityName,
  );

  if (propertyData.length === 0) {
    return (
      <Section title="Property Value vs Safety" subtitle="Assessed values · City of Calgary">
        <div className="rounded-none p-4 border flex items-start gap-2.5 bg-[#F7F3EA] border-[#E7E0D2]">
          <Info size={14} className={'text-[#5A6B7D] shrink-0 mt-0.5'} />
          <p className="text-[13.5px] leading-relaxed" style={{ color: '#5A6B7D' }}>
            {/* Industrial estates, parks and survey parcels have no homes to
                value, so the city publishes no residential assessment for them.
                Saying "not available" made a correct, expected result read as a
                loading failure. */}
            {isNonResidentialArea
              ? `${communityName} is an industrial or park area, so the city publishes no residential assessments for it.`
              : 'No residential assessment has been published for this community yet.'}
          </p>
        </div>
      </Section>
    );
  }

  const propByYear  = new Map(propertyData.map(e => [e.year, e]));
  const crimeByYear = new Map(yearlyStats.map(e => [e.year, e]));
  const sharedYears = [...propByYear.keys()].filter(y => crimeByYear.has(y)).sort((a, b) => a - b).slice(-6);

  if (sharedYears.length < 2) return null;

  const combined = sharedYears.map(year => ({
    name:       String(year),
    TotalCrime: (crimeByYear.get(year)?.violent ?? 0) + (crimeByYear.get(year)?.property ?? 0) + (crimeByYear.get(year)?.disorder ?? 0),
    AvgValue:   propByYear.get(year)?.avgValue ?? 0,
  }));

  const latestEntry   = combined[combined.length - 1];
  const earliestEntry = combined[0];
  const valueChange = earliestEntry.AvgValue > 0
    ? Math.round(((latestEntry.AvgValue - earliestEntry.AvgValue) / earliestEntry.AvgValue) * 100)
    : null;

  return (
    <PropertyValueContent
      combined={combined}
      latestEntry={latestEntry}
      earliestEntry={earliestEntry}
      valueChange={valueChange}
      score={score}
      tooltipStyle={tooltipStyle}
      tooltipLabelStyle={tooltipLabelStyle}
    />
  );
}

function KeySignalsSection({
  insights,
}: {
  insights: string[];
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const isAnimating = useRef(false);
  const dragX = useMotionValue(0);
  const rotate = useTransform(dragX, [-200, 200], [-6, 6]);

  useEffect(() => {
    setCurrentIdx(0);
    dragX.set(0);
  }, [insights, dragX]);

  if (insights.length === 0) return null;

  function getCardType(insight: string): 'up' | 'down' | 'neutral' {
    if (insight.includes('↑')) return 'up';
    if (insight.includes('↓')) return 'down';
    return 'neutral';
  }

  /*
   * The badge is a solid block of the severity colour with the ink reversed
   * out of it, rather than a pale tint of the same hue. A 24px glyph in
   * #2E8B7A on an `emerald-50` wash reads at 1.6:1 — it looked fine against
   * the card behind it and was illegible against the tint it actually sat on.
   * Solid ground fixes that by construction and states the signal harder.
   *
   * The big figure keeps a darkened step of the same hue so it clears the
   * card: #4A90D9 on #F7F3EA is 3.0:1, #2A6099 is 5.9:1.
   */
  function cardColors(type: 'up' | 'down' | 'neutral') {
    if (type === 'up')   return { border: '#C0392B', badge: '#C0392B', icon: <TrendingUp   size={24} style={{ color: '#F2EFE8' }} />, statColor: '#A6332A' };
    if (type === 'down') return { border: '#2E8B7A', badge: '#2E8B7A', icon: <TrendingDown size={24} style={{ color: '#F2EFE8' }} />, statColor: '#1F6355' };
    return               { border: '#4A90D9', badge: '#2A6099', icon: <ShieldCheck  size={24} style={{ color: '#F2EFE8' }} />, statColor: '#2A6099' };
  }

  function extractStat(text: string): string | null {
    const m = text.match(/#?\d+(\.\d+)?%?/);
    return m ? m[0] : null;
  }

  function dismiss() {
    if (isAnimating.current || insights.length === 0) return;
    isAnimating.current = true;
    setCurrentIdx(prev => (prev + 1) % insights.length);
    setTimeout(() => { isAnimating.current = false; }, 350);
  }

  function previous() {
    if (isAnimating.current || insights.length === 0) return;
    isAnimating.current = true;
    setCurrentIdx(prev => (prev - 1 + insights.length) % insights.length);
    setTimeout(() => { isAnimating.current = false; }, 350);
  }

  const n = insights.length;
  const visibleCards = Math.min(3, n);

  return (
    <Section title="Key Signals" subtitle="What stands out in this community">
      {/* Counter + progress bar above stack */}
      <div className="flex items-center mb-3 md:max-w-[44rem]">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] tabular-nums shrink-0" style={{ color: '#5A6B7D' }}>
          {currentIdx + 1} / {n}
        </p>
        <div className="h-[3px] rounded-none flex-1 mx-3 overflow-hidden bg-[#E7E0D2]">
          <motion.div
            className="h-full rounded-none bg-[#4A90D9]"
            animate={{ width: `${((currentIdx + 1) / n) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Card stack */}
      <div className="relative md:max-w-[44rem]" style={{ minHeight: 240 }}>
        {/* Ghost card 2 (furthest back) */}
        {visibleCards >= 3 && (
          <div
            className="absolute inset-x-0 top-0 rounded-none"
            style={{
              height: 200,
              background: '#FFFDF8',
              border: '1px solid #E7E0D2',
              transform: 'scale(0.92) translateY(18px) rotate(1deg)',
              transformOrigin: 'bottom center',
              zIndex: 1,
            }}
          />
        )}
        {/* Ghost card 1 (middle) */}
        {visibleCards >= 2 && (
          <div
            className="absolute inset-x-0 top-0 rounded-none"
            style={{
              height: 200,
              background: '#FFFDF8',
              border: '1px solid #E7E0D2',
              transform: 'scale(0.96) translateY(9px) rotate(-1.4deg)',
              transformOrigin: 'bottom center',
              zIndex: 2,
            }}
          />
        )}

        {/* Top (active) card */}
        <AnimatePresence mode="wait">
          {(() => {
            const insight = insights[currentIdx];
            const type = getCardType(insight);
            const colors = cardColors(type);
            const stat = extractStat(insight);

            return (
              <motion.div
                key={currentIdx}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.15}
                style={{
                  x: dragX,
                  rotate,
                  zIndex: 3,
                  position: 'relative',
                  borderLeft: `3px solid ${colors.border}`,
                }}
                initial={{ y: 40, scale: 0.9, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                onDragEnd={(_, info) => {
                  const { offset, velocity } = info;
                  if (Math.abs(offset.x) > 80 || Math.abs(velocity.x) > 400) {
                    dismiss();
                  }
                  dragX.set(0);
                }}
                className="rounded-none border p-5 cursor-grab active:cursor-grabbing select-none bg-[#F7F3EA] border-[#E7E0D2]"
              >
                <div className="flex items-start gap-4">
                  {/* Icon badge — solid severity, ink reversed out. */}
                  <div
                    className="w-[52px] h-[52px] rounded-none flex items-center justify-center shrink-0"
                    style={{ background: colors.badge }}
                  >
                    {colors.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Big stat */}
                    {stat && (
                      <p
                        className="font-display text-[44px] font-black leading-[0.86] tracking-[-0.035em] tabular-nums mb-1.5"
                        style={{ color: colors.statColor }}
                      >
                        {stat}
                      </p>
                    )}
                    {/* Insight text */}
                    <p className="text-[14px] font-bold leading-[1.55]" style={{ color: '#1C2B3A' }}>
                      {insight}
                    </p>
                  </div>
                </div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] mt-4" style={{ color: '#5A6B7D' }}>
                  ← Swipe to see next →
                </p>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>

      {/* Desktop arrow buttons */}
      <div className="hidden md:flex items-center justify-center gap-3 mt-4 md:max-w-[44rem]">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={previous}
          className="w-10 h-10 rounded-none border flex items-center justify-center text-lg font-black transition-colors border-[#E7E0D2] bg-[#FFFDF8] hover:bg-[#F7F3EA] text-[#5A6B7D]"
          aria-label="Previous insight"
        >
          ←
        </motion.button>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] tabular-nums" style={{ color: '#5A6B7D' }}>{currentIdx + 1} / {n}</span>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={dismiss}
          className="w-10 h-10 rounded-none border flex items-center justify-center text-lg font-black transition-colors border-[#E7E0D2] bg-[#FFFDF8] hover:bg-[#F7F3EA] text-[#5A6B7D]"
          aria-label="Next insight"
        >
          →
        </motion.button>
      </div>
    </Section>
  );
}

const DATA_SOURCES = [
  {
    title: 'Calgary Crime Statistics',
    content: 'Dataset 78gh-n26t. UCR-classified criminal offences reported to Calgary Police Service, broken down by community, year, and crime category. Updates quarterly.',
  },
  {
    title: 'Calgary Disorder Statistics',
    content: 'Dataset h3h6-kgme. Non-criminal CPS dispatch events such as noise complaints, suspicious persons, and nuisance behaviour. Updates quarterly.',
  },
  {
    title: 'Calgary Property Assessments',
    content: 'Dataset 4ur7-wsgc. Annual tax assessment values per property, averaged by community. Reflects appraised value approximately one year behind current market prices.',
  },
];

function DataSourcesSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <Section title="Data Sources" subtitle="Where every number on this page comes from">
      <div className="space-y-2">
        {DATA_SOURCES.map(({ title, content }, idx) => (
          <div
            key={title}
            className="rounded-none border overflow-hidden border-[#E7E0D2]"
          >
            <button
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors bg-[#FFFDF8] hover:bg-[#F7F3EA]"
            >
              <div className="flex items-center gap-2.5">
                <Database size={13} className={'text-[#5A6B7D]'} />
                <span className="text-[13.5px] font-bold" style={{ color: '#1C2B3A' }}>{title}</span>
              </div>
              <motion.div animate={{ rotate: openIdx === idx ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={15} className={'text-[#5A6B7D]'} />
              </motion.div>
            </button>
            <AnimatePresence initial={false}>
              {openIdx === idx && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <p className="px-4 pb-4 pt-1 text-[13px] leading-relaxed" style={{ color: '#5A6B7D' }}>
                    {content}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <p className="text-[12px] mt-4 pt-4 border-t leading-relaxed text-[#5A6B7D] border-[#E7E0D2]">
        All figures reflect reported incidents only — not all crime is reported to police. Safety scores are normalized against the Calgary city-wide average.
      </p>
    </Section>
  );
}
