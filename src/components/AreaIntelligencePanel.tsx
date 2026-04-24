import { useState, useEffect, useRef } from 'react';
import { AreaIntelligence } from '@/src/types';
import { Card } from '@/src/components/ui/Card';
import { X, MapPin, Activity, TrendingUp, TrendingDown, ShieldCheck, Info, Database, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Sector,
  ComposedChart, Line,
} from 'recharts';
import { cn } from '@/src/lib/utils';
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
  propertyData?: PropertyYearEntry[];
  cityAverages?: { avgViolent: number; avgProperty: number; avgDisorder: number };
  theme?: 'dark' | 'light';
}

// ── Shared tooltip styles ────────────────────────────────────────────────────

function makeTooltipStyle(isLight: boolean) {
  return {
    backgroundColor: isLight ? '#ffffff' : '#020617',
    borderRadius: '14px',
    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)',
    boxShadow: isLight ? '0 8px 32px -4px rgba(0,0,0,0.18)' : '0 18px 25px -5px rgba(0,0,0,0.45)',
  };
}

function makeTooltipLabelStyle(isLight: boolean) {
  return {
    fontSize: 11,
    fontWeight: 900,
    color: isLight ? '#1e293b' : '#fff',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
  };
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, subtitle, children, isLight,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  isLight: boolean;
}) {
  const [ref, inView] = useInView();
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="mb-4">
        <h3 className={cn('text-xl font-black leading-tight', isLight ? 'text-slate-900' : 'text-white')}>{title}</h3>
        {subtitle && (
          <p className="text-[11px] uppercase tracking-widest font-bold mt-0.5 text-slate-500">{subtitle}</p>
        )}
      </div>
      {children}
    </motion.div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection({
  data, onClose, glowColor, gaugeColor,
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
  const rankColor = rankPct <= 30 ? '#34d399' : rankPct <= 60 ? '#f59e0b' : '#ef4444';
  const r = 26;
  const circ = 2 * Math.PI * r;
  const [gaugeRef, gaugeInView] = useInView(0);
  const animatedScore = useCountUp(score, 900, gaugeInView);
  const dash = gaugeInView ? (score / 100) * circ : 0;

  return (
    <div
      className="relative px-5 pt-5 pb-6 md:px-8 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f1e3d 0%, #0a1628 100%)' }}
    >
      {/* Score-keyed glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 20% 50%, ${glowColor}, transparent 60%)` }}
      />

      {/* Eyebrow + close */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-1.5">
          <MapPin size={11} className="text-slate-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Neighbourhood Intelligence</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-2.5 rounded-xl border text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border-white/10 transition-all group"
        >
          <X size={17} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      {/* Community name */}
      <h2
        className="text-[clamp(26px,6vw,40px)] font-black text-white leading-none mb-4 relative z-10 truncate"
        title={data.communityName}
      >
        {data.communityName}
      </h2>

      {/* Gauge + quick stats row */}
      <div ref={gaugeRef} className="flex items-center gap-4 relative z-10">
        {/* Animated SVG gauge */}
        <div className="relative shrink-0 w-[64px] h-[64px] md:w-[72px] md:h-[72px]">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
            <circle
              cx="32" cy="32" r={r} fill="none"
              stroke={gaugeColor}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              transform="rotate(-90 32 32)"
              style={{ transition: gaugeInView ? 'stroke-dasharray 0.9s cubic-bezier(0.33,1,0.68,1)' : 'none' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[15px] font-black text-white leading-none">{animatedScore}</span>
            <span className="text-[7px] text-slate-500 uppercase tracking-wide leading-none mt-0.5">/ 100</span>
          </div>
        </div>

        {/* 3-col quick stat chips */}
        <div className="grid grid-cols-3 gap-2 flex-1">
          {[
            { label: 'Incidents', value: String(data.activeIncidents ?? 0), color: 'text-orange-400' },
            {
              label: 'Trend',
              value: data.trend ?? '–',
              color: data.trend === 'improving' ? 'text-emerald-400' : data.trend === 'declining' ? 'text-red-400' : 'text-slate-300',
            },
            {
              label: 'Risk',
              value: score >= 70 ? 'Low' : score >= 40 ? 'Medium' : 'High',
              color: score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-2 text-center">
              <p className="text-[7px] font-black uppercase tracking-wide text-slate-500 leading-none mb-1">{label}</p>
              <p className={cn('text-[11px] font-black truncate leading-none capitalize', color)}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* City rank bar */}
      {rank > 0 && total > 0 && (
        <div className="mt-4 relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-1">City Rank</p>
          <p className="text-[11px] text-white font-medium mb-1.5">
            #{rank} out of {total} neighbourhoods
          </p>
          <div className="h-[4px] rounded-full overflow-hidden bg-white/10">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: rankColor }}
              initial={{ width: '0%' }}
              animate={{ width: `${rankPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
            />
          </div>
        </div>
      )}

      {/* Live overlay insight */}
      {data.liveOverlayInsight && (
        <div className="mt-4 flex items-start gap-2.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl px-3 py-2.5 relative z-10">
          <Activity size={13} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-blue-100 font-medium leading-relaxed">{data.liveOverlayInsight}</p>
        </div>
      )}
    </div>
  );
}

// ── Content (module-level) ────────────────────────────────────────────────────

interface ContentProps {
  data: AreaIntelligence;
  onClose: () => void;
  isLight: boolean;
  crimeEntry: CrimeStatEntry | undefined;
  realYearly: CrimeYearEntry[];
  hasRealData: boolean;
  score: number;
  glowColor: string;
  gaugeColor: string;
  chartData: { name: string; Violent: number; Property: number; Disorder: number }[];
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
  propertyData: PropertyYearEntry[];
  cityAverages?: { avgViolent: number; avgProperty: number; avgDisorder: number };
}

function Content({
  data,
  onClose,
  isLight,
  crimeEntry,
  realYearly,
  hasRealData,
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
  const [miniBarVisible, setMiniBarVisible] = useState(false);

  // Reset mini-bar when community changes
  useEffect(() => { setMiniBarVisible(false); }, [data.communityName]);

  // Show mini-bar once hero scrolls out of view
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setMiniBarVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [data.communityName]);

  return (
    <div className={cn('flex flex-col h-full overflow-hidden relative', isLight ? 'text-slate-900' : 'text-white')}>
      {/* Sticky mini-bar */}
      <AnimatePresence>
        {miniBarVisible && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'sticky top-0 z-20 flex items-center justify-between px-5 py-3 border-b backdrop-blur-xl',
              isLight ? 'bg-white/90 border-slate-200' : 'bg-slate-950/90 border-white/10'
            )}
          >
            <span className="text-sm font-black truncate">{data.communityName}</span>
            <span className={cn(
              'text-xs font-black px-2.5 py-1 rounded-full border',
              score >= 70 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : score >= 40 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            )}>
              {score} / 100
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div ref={heroRef}>
          <HeroSection data={data} onClose={onClose} glowColor={glowColor} gaugeColor={gaugeColor} />
        </div>

        <div className={cn('px-5 md:px-8 py-8 space-y-12', isLight ? 'bg-[rgb(255,250,243)]' : 'bg-slate-950')}>
          <CrimeThisYearSection
            crimeEntry={crimeEntry}
            cityAverages={cityAverages}
            isLight={isLight}
            yearlyStats={realYearly}
          />
          <TrendChartSection
            chartData={chartData}
            hasRealData={hasRealData}
            yearlyStats={realYearly}
            isLight={isLight}
            tooltipStyle={tooltipStyle}
            tooltipLabelStyle={tooltipLabelStyle}
          />
          <DonutSection
            crimeEntry={crimeEntry}
            isLight={isLight}
          />
          <PropertyValueSection
            propertyData={propertyData}
            yearlyStats={realYearly}
            isLight={isLight}
            tooltipStyle={tooltipStyle}
            tooltipLabelStyle={tooltipLabelStyle}
          />
          <KeySignalsSection
            insights={data.insights}
            isLight={isLight}
          />
          <DataSourcesSection isLight={isLight} />
        </div>
      </div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function AreaIntelligencePanel({
  data, onClose, crimeStats, yearlyStats, propertyData, cityAverages, theme = 'dark',
}: AreaIntelligencePanelProps) {
  if (!data) return null;

  const isLight = theme === 'light';
  const communityKey   = data.communityName.toLowerCase();
  const crimeEntry     = crimeStats?.get(communityKey);
  const realYearly     = yearlyStats?.get(communityKey) ?? [];
  const hasRealData    = realYearly.length > 0;
  const score          = data.safetyScore ?? 0;
  const gaugeColor     = score >= 70 ? '#34d399' : score >= 40 ? '#f59e0b' : '#ef4444';
  const glowColor      = score >= 70 ? 'rgba(52,211,153,0.12)' : score >= 40 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';

  const chartData = hasRealData
    ? realYearly.map(e => ({ name: String(e.year), Violent: e.violent, Property: e.property, Disorder: e.disorder }))
    : data.monthlyTrends.map(t => ({ name: t.month, Violent: t.violent_crime, Property: t.property_crime, Disorder: t.disorder_calls }));

  const tooltipStyle      = makeTooltipStyle(isLight);
  const tooltipLabelStyle = makeTooltipLabelStyle(isLight);

  const contentProps: ContentProps = {
    data,
    onClose,
    isLight,
    crimeEntry,
    realYearly,
    hasRealData,
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
            <Card className={cn(
              'h-full w-[min(62vw,66rem)] min-w-[46rem] shadow-[0_0_60px_-8px_rgba(0,0,0,0.6)] overflow-hidden rounded-[2.25rem]',
              isLight ? 'border-slate-200 bg-[rgb(255,250,243)]' : 'border-white/10'
            )}>
              <Content {...contentProps} />
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mobile drawer */}
      <div className="lg:hidden">
        <Drawer.Root open={!!data} onClose={onClose}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 h-[92vh] z-[101] outline-none">
              <div className={cn(
                'h-full rounded-t-[3rem] overflow-hidden border-t flex flex-col',
                isLight ? 'bg-[rgb(255,250,243)] border-stone-200/80' : 'bg-slate-950 border-white/10'
              )}>
                <div className={cn('mx-auto w-12 h-1.5 flex-shrink-0 rounded-full mt-4 mb-0', isLight ? 'bg-slate-300' : 'bg-white/10')} />
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
  const color = delta < -5 ? '#34d399' : delta > 5 ? '#ef4444' : '#64748b';
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
  crimeEntry, cityAverages, isLight, yearlyStats,
}: {
  crimeEntry: CrimeStatEntry | undefined;
  cityAverages: { avgViolent: number; avgProperty: number; avgDisorder: number } | undefined;
  isLight: boolean;
  yearlyStats: CrimeYearEntry[];
}) {
  const [barsRef, barsInView] = useInView();

  if (!crimeEntry) {
    return (
      <Section title="Crime This Year" isLight={isLight}>
        <div className={cn('rounded-2xl p-4 border flex items-start gap-2.5', isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20')}>
          <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className={cn('text-sm leading-relaxed', isLight ? 'text-amber-800' : 'text-amber-300')}>
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
      color: 'bg-red-500',
      sparkValues: last6.map(e => e.violent),
    },
    {
      label: 'Property Crime',
      value: crimeEntry.property,
      avg: cityAverages?.avgProperty ?? 0,
      color: 'bg-blue-500',
      sparkValues: last6.map(e => e.property),
    },
    {
      label: 'Disorder Calls',
      value: crimeEntry.disorder,
      avg: cityAverages?.avgDisorder ?? 0,
      color: 'bg-amber-500',
      sparkValues: last6.map(e => e.disorder),
    },
  ];

  return (
    <Section
      title="Crime This Year"
      subtitle={`${crimeEntry.year} · Calgary Police Service · Open Data`}
      isLight={isLight}
    >
      <div ref={barsRef} className="space-y-5">
        {rows.map(({ label, value, avg, color, sparkValues }, i) => {
          const pct = Math.round((value / maxVal) * 100);
          const vsCity = avg > 0 ? Math.round((value / avg) * 100) : 0;
          const vsLabel = vsCity > 0 ? `${vsCity}% of city avg` : '–';
          const vsColor =
            vsCity > 120 ? (isLight ? 'text-red-600 bg-red-50 border-red-200' : 'text-red-400 bg-red-500/10 border-red-500/20') :
            vsCity > 80  ? (isLight ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-amber-400 bg-amber-500/10 border-amber-500/20') :
                           (isLight ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20');

          return (
            <div key={label}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={cn('text-[13px] font-bold truncate', isLight ? 'text-slate-700' : 'text-slate-300')}>{label}</span>
                  {vsCity > 0 && (
                    <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded-full border shrink-0', vsColor)}>{vsLabel}</span>
                  )}
                </div>
                <Sparkline values={sparkValues} />
                <span className={cn('text-base font-black shrink-0', isLight ? 'text-slate-900' : 'text-white')}>{value.toLocaleString()}</span>
              </div>
              <div className={cn('h-[10px] rounded-full overflow-hidden', isLight ? 'bg-slate-200' : 'bg-white/10')}>
                <motion.div
                  className={cn('h-full rounded-full', color)}
                  initial={{ width: '0%' }}
                  animate={{ width: barsInView ? `${pct}%` : '0%' }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.08 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] mt-4 text-slate-500">
        Criminal offences reported to Calgary Police · {crimeEntry.year} · City of Calgary Open Data (78gh-n26t, h3h6-kgme)
      </p>
    </Section>
  );
}

function TrendChartSection({
  chartData, hasRealData, yearlyStats, isLight, tooltipStyle, tooltipLabelStyle,
}: {
  chartData: { name: string; Violent: number; Property: number; Disorder: number }[];
  hasRealData: boolean;
  yearlyStats: CrimeYearEntry[];
  isLight: boolean;
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

  const pills = [
    { key: 'violent' as const,  label: 'Violent',  active: showViolent,  toggle: () => setShowViolent(p  => !p), color: 'border-red-500 bg-red-500/15 text-red-400',   inactive: isLight ? 'border-slate-300 bg-slate-100 text-slate-500' : 'border-white/10 bg-white/5 text-slate-500' },
    { key: 'property' as const, label: 'Property', active: showProperty, toggle: () => setShowProperty(p => !p), color: 'border-blue-500 bg-blue-500/15 text-blue-400',  inactive: isLight ? 'border-slate-300 bg-slate-100 text-slate-500' : 'border-white/10 bg-white/5 text-slate-500' },
    { key: 'disorder' as const, label: 'Disorder', active: showDisorder, toggle: () => setShowDisorder(p => !p), color: 'border-amber-500 bg-amber-500/15 text-amber-400', inactive: isLight ? 'border-slate-300 bg-slate-100 text-slate-500' : 'border-white/10 bg-white/5 text-slate-500' },
  ];

  return (
    <Section
      title="6-Year Picture"
      subtitle={`${startYear} – ${endYear} · Annual reported incidents${hasRealData ? ' · Calgary Open Data' : ' · Estimated'}`}
      isLight={isLight}
    >
      {/* Toggle pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {pills.map(({ key, label, active, toggle, color, inactive }) => (
          <button
            key={key}
            onClick={toggle}
            className={cn(
              'px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide border transition-all',
              active ? color : inactive
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Area chart */}
      <div
        className={cn('h-[280px] md:h-[320px] w-full rounded-[1.6rem] p-4 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}
        role="img"
        aria-label={`Crime trend chart for ${startYear}–${endYear}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="aiV" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="aiP" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="aiD" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isLight ? 'rgba(0,0,0,0.07)' : 'rgba(148,163,184,0.15)'} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} tickFormatter={fmtTick} />
            <Tooltip contentStyle={tooltipStyle} itemStyle={{ fontSize: 12, fontWeight: 'bold' }} labelStyle={tooltipLabelStyle} />
            {showViolent  && <Area type="monotone" dataKey="Violent"  stroke="#ef4444" strokeWidth={2.5} fillOpacity={1} fill="url(#aiV)" isAnimationActive animationBegin={200} animationDuration={800} />}
            {showProperty && <Area type="monotone" dataKey="Property" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#aiP)" isAnimationActive animationBegin={200} animationDuration={800} />}
            {showDisorder && <Area type="monotone" dataKey="Disorder" stroke="#f59e0b" strokeWidth={2.5} fillOpacity={1} fill="url(#aiD)" isAnimationActive animationBegin={200} animationDuration={800} />}
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
            const color = isUp
              ? (isLight ? 'text-red-600' : 'text-red-400')
              : (isLight ? 'text-emerald-700' : 'text-emerald-400');
            return (
              <div key={label} className={cn('rounded-xl p-3 border text-center', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/5')}>
                <p className="text-[10px] font-black uppercase tracking-wide mb-0.5 text-slate-500">{label}</p>
                <p className={cn('text-sm font-black', color)}>
                  {isUp ? '↑' : '↓'} {Math.abs(delta)}%
                </p>
                <p className={cn('text-[9px] mt-0.5', isLight ? 'text-slate-400' : 'text-slate-600')}>vs prior year</p>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function DonutSection({
  crimeEntry, isLight,
}: {
  crimeEntry: CrimeStatEntry | undefined;
  isLight: boolean;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const total = crimeEntry ? crimeEntry.violent + crimeEntry.property + crimeEntry.disorder : 0;

  if (!crimeEntry || total === 0) return null;
  const slices = [
    { name: 'Violent',  value: crimeEntry.violent,  color: '#ef4444', description: 'Assault, robbery, threats' },
    { name: 'Property', value: crimeEntry.property, color: '#3b82f6', description: 'Break & enter, theft' },
    { name: 'Disorder', value: crimeEntry.disorder, color: '#f59e0b', description: 'Non-criminal service calls' },
  ];

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent } = props;
    return (
      <g>
        <text x={cx} y={cy - 10} textAnchor="middle" fill={isLight ? '#0f172a' : '#fff'} style={{ fontSize: 22, fontWeight: 900 }}>
          {payload.value.toLocaleString()}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#64748b" style={{ fontSize: 11, fontWeight: 700 }}>
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
      isLight={isLight}
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
          <p className="text-[11px] font-black uppercase tracking-widest mb-3 text-slate-500">
            Total: {total.toLocaleString()} incidents
          </p>
          {slices.map(({ name, value, color, description }, i) => (
            <button
              key={name}
              onClick={() => setActiveIdx(i)}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl p-3 border text-left transition-all',
                activeIdx === i
                  ? (isLight ? 'border-slate-300 bg-slate-100' : 'border-white/15 bg-white/[0.06]')
                  : (isLight ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]')
              )}
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={cn('text-sm font-bold', isLight ? 'text-slate-900' : 'text-white')}>{name}</span>
                  <span className={cn('text-sm font-black', isLight ? 'text-slate-900' : 'text-white')}>{value.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[11px] text-slate-500">{description}</span>
                  <span className="text-[11px] font-bold" style={{ color }}>
                    {total > 0 ? `${Math.round((value / total) * 100)}%` : '–'}
                  </span>
                </div>
              </div>
            </button>
          ))}
          <p className={cn('text-[10px] pt-1', isLight ? 'text-slate-400' : 'text-slate-600')}>
            Tap a slice or row to highlight
          </p>
        </div>
      </div>
    </Section>
  );
}

function PropertyValueSection({
  propertyData, yearlyStats, isLight, tooltipStyle, tooltipLabelStyle,
}: {
  propertyData: PropertyYearEntry[];
  yearlyStats: CrimeYearEntry[];
  isLight: boolean;
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
}) {
  if (propertyData.length === 0) {
    return (
      <Section title="Property Value vs Safety" isLight={isLight}>
        <div className={cn('rounded-2xl p-4 border flex items-start gap-2.5', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}>
          <Info size={14} className={isLight ? 'text-slate-400 shrink-0 mt-0.5' : 'text-slate-600 shrink-0 mt-0.5'} />
          <p className="text-sm text-slate-500">
            Property assessment data not available for this community in the current dataset snapshot.
          </p>
        </div>
      </Section>
    );
  }

  // Build combined chart data on shared years
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
    <Section
      title="Property Value vs Safety"
      subtitle="Assessed values · City of Calgary · Cross-referenced with crime data"
      isLight={isLight}
    >
      <div
        className={cn('h-[280px] md:h-[320px] w-full rounded-[1.6rem] p-4 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}
        role="img"
        aria-label="Property value versus total crime by year"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={combined}>
            <defs>
              <linearGradient id="aiCrime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isLight ? 'rgba(0,0,0,0.07)' : 'rgba(148,163,184,0.15)'} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} dy={8} />
            <YAxis yAxisId="crime" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isLight ? '#94a3b8' : '#64748b', fontWeight: 700 }} tickFormatter={fmtTick} orientation="left" />
            <YAxis yAxisId="value" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#818cf8', fontWeight: 700 }} tickFormatter={fmtDollars} orientation="right" />
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
            <Area yAxisId="crime" type="monotone" dataKey="TotalCrime" stroke="#ef4444" strokeWidth={2} fill="url(#aiCrime)" fillOpacity={1} isAnimationActive animationBegin={200} animationDuration={800} />
            <Line  yAxisId="value" type="monotone" dataKey="AvgValue"   stroke="#818cf8" strokeWidth={3} dot={{ r: 4, fill: '#818cf8', strokeWidth: 2, stroke: isLight ? '#fff' : '#0f172a' }} isAnimationActive animationBegin={200} animationDuration={800} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Insight row */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className={cn('rounded-xl p-3 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}>
          <p className="text-[10px] font-black uppercase tracking-wide mb-1 text-slate-500">Avg. Assessed Value ({latestEntry.name})</p>
          <p className="text-xl font-black text-indigo-400">{fmtDollars(latestEntry.AvgValue)}</p>
        </div>
        <div className={cn('rounded-xl p-3 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}>
          <p className="text-[10px] font-black uppercase tracking-wide mb-1 text-slate-500">Change vs {earliestEntry.name}</p>
          {valueChange !== null ? (
            <p className={cn('text-xl font-black', valueChange >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {valueChange >= 0 ? '↑' : '↓'} {Math.abs(valueChange)}%
            </p>
          ) : (
            <p className="text-xl font-black text-slate-500">–</p>
          )}
        </div>
      </div>

      {/* Methodology note */}
      <p className="text-[12px] leading-relaxed mt-3 italic text-slate-500">
        Assessed values are the City of Calgary's annual tax appraisal — they typically lag the real estate market by approximately one year. Cross-referencing with crime trends can reveal whether safety changes precede or follow property value shifts.
      </p>
    </Section>
  );
}

function KeySignalsSection({
  insights, isLight,
}: {
  insights: string[];
  isLight: boolean;
}) {
  const [ref, inView] = useInView();
  return (
    <Section title="Key Signals" isLight={isLight}>
      <div ref={ref} className="space-y-3">
        {insights.map((insight, idx) => {
          const isUp   = insight.includes('↑');
          const isDown = insight.includes('↓');
          return (
            <motion.div
              key={insight}
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.35, ease: 'easeOut', delay: idx * 0.08 }}
              whileHover={{ y: -2, boxShadow: isLight ? '0 4px 16px -2px rgba(0,0,0,0.12)' : '0 4px 20px -4px rgba(0,0,0,0.5)' }}
              className={cn(
                'flex items-start gap-3 rounded-2xl p-4 border transition-colors cursor-default',
                isLight ? 'bg-white border-slate-200 hover:bg-slate-50' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.05]'
              )}
              style={{
                borderLeft: `2px solid ${isUp ? '#ef4444' : isDown ? '#34d399' : '#3b82f6'}`,
              }}
            >
              <div className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border',
                isUp
                  ? (isLight ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/20')
                  : isDown
                  ? (isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20')
                  : (isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-500/20')
              )}>
                {isUp
                  ? <TrendingUp size={20} className="text-red-400" />
                  : isDown
                  ? <TrendingDown size={20} className="text-emerald-400" />
                  : <ShieldCheck size={20} className="text-blue-400" />}
              </div>
              <p className={cn('text-sm font-bold leading-relaxed', isLight ? 'text-slate-800' : 'text-white')}>{insight}</p>
            </motion.div>
          );
        })}
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

function DataSourcesSection({ isLight }: { isLight: boolean }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <Section title="Data Sources" isLight={isLight}>
      <div className="space-y-2">
        {DATA_SOURCES.map(({ title, content }, idx) => (
          <div
            key={title}
            className={cn('rounded-2xl border overflow-hidden', isLight ? 'border-slate-200' : 'border-white/10')}
          >
            <button
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors',
                isLight ? 'bg-white hover:bg-slate-50' : 'bg-white/[0.02] hover:bg-white/[0.04]'
              )}
            >
              <div className="flex items-center gap-2.5">
                <Database size={13} className={isLight ? 'text-slate-400' : 'text-slate-500'} />
                <span className={cn('text-sm font-bold', isLight ? 'text-slate-800' : 'text-white')}>{title}</span>
              </div>
              <motion.div animate={{ rotate: openIdx === idx ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={15} className={isLight ? 'text-slate-400' : 'text-slate-500'} />
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
                  <p className={cn('px-4 pb-4 pt-1 text-[13px] leading-relaxed', isLight ? 'text-slate-600' : 'text-slate-400')}>
                    {content}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <p className={cn('text-[12px] mt-4 pt-4 border-t leading-relaxed', isLight ? 'text-slate-400 border-slate-200' : 'text-slate-600 border-white/5')}>
        All figures reflect reported incidents only — not all crime is reported to police. Safety scores are normalized against the Calgary city-wide average.
      </p>
    </Section>
  );
}
