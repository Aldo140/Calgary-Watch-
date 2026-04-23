import { useState, useEffect, useRef } from 'react';
import { AreaIntelligence } from '@/src/types';
import { Card } from '@/src/components/ui/Card';
import { X, MapPin, Activity, TrendingUp, TrendingDown, ShieldCheck, Info, Database, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Sector,
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

function CrimeThisYearSection({
  crimeEntry, cityAverages, isLight,
}: {
  crimeEntry: CrimeStatEntry | undefined;
  cityAverages: { avgViolent: number; avgProperty: number; avgDisorder: number } | undefined;
  isLight: boolean;
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

  const rows = [
    {
      label: 'Violent Crime',
      value: crimeEntry.violent,
      avg: cityAverages?.avgViolent ?? 0,
      color: 'bg-red-500',
    },
    {
      label: 'Property Crime',
      value: crimeEntry.property,
      avg: cityAverages?.avgProperty ?? 0,
      color: 'bg-blue-500',
    },
    {
      label: 'Disorder Calls',
      value: crimeEntry.disorder,
      avg: cityAverages?.avgDisorder ?? 0,
      color: 'bg-amber-500',
    },
  ];

  return (
    <Section
      title="Crime This Year"
      subtitle={`${crimeEntry.year} · Calgary Police Service · Open Data`}
      isLight={isLight}
    >
      <div ref={barsRef} className="space-y-5">
        {rows.map(({ label, value, avg, color }, i) => {
          const pct = Math.round((value / maxVal) * 100);
          const vsCity = avg > 0 ? Math.round((value / avg) * 100) : 0;
          const vsLabel = vsCity > 0 ? `${vsCity}% of city avg` : '–';
          const vsColor =
            vsCity > 120 ? (isLight ? 'text-red-600 bg-red-50 border-red-200' : 'text-red-400 bg-red-500/10 border-red-500/20') :
            vsCity > 80  ? (isLight ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-amber-400 bg-amber-500/10 border-amber-500/20') :
                           (isLight ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20');

          return (
            <div key={label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm font-bold', isLight ? 'text-slate-700' : 'text-slate-300')}>{label}</span>
                  {vsCity > 0 && (
                    <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded-full border', vsColor)}>{vsLabel}</span>
                  )}
                </div>
                <span className={cn('text-base font-black', isLight ? 'text-slate-900' : 'text-white')}>{value.toLocaleString()}</span>
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
      <p className={cn('text-[11px] mt-4', isLight ? 'text-slate-500' : 'text-slate-500')}>
        Criminal offences reported to Calgary Police · {crimeEntry.year} · City of Calgary Open Data (78gh-n26t, h3h6-kgme)
      </p>
    </Section>
  );
}

function TrendChartSection(_: {
  chartData: { name: string; Violent: number; Property: number; Disorder: number }[];
  hasRealData: boolean;
  yearlyStats: CrimeYearEntry[];
  isLight: boolean;
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
}) { return null; }

function DonutSection(_: {
  crimeEntry: CrimeStatEntry | undefined;
  isLight: boolean;
}) { return null; }

function PropertyValueSection(_: {
  propertyData: PropertyYearEntry[];
  yearlyStats: CrimeYearEntry[];
  isLight: boolean;
  tooltipStyle: React.CSSProperties;
  tooltipLabelStyle: React.CSSProperties;
}) { return null; }

function KeySignalsSection(_: {
  insights: string[];
  isLight: boolean;
}) { return null; }

function DataSourcesSection(_: {
  isLight: boolean;
}) { return null; }
