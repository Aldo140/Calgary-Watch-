import { AreaIntelligence } from '@/src/types';
import { Card } from '@/src/components/ui/Card';
import { X, TrendingUp, TrendingDown, ShieldCheck, MapPin, Activity, Info, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend } from 'recharts';
import { cn } from '@/src/lib/utils';
import { Drawer } from 'vaul';
import { CrimeYearEntry } from '@/src/hooks/useCrimeStats';

/** Abbreviate large tick numbers: 1200 → 1.2k, 15000 → 15k */
function fmtTick(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return String(v);
}

interface AreaIntelligencePanelProps {
  data: AreaIntelligence | null;
  onClose: () => void;
  crimeStats?: Map<string, { crime: number; violent: number; property: number; disorder: number; year: number }>;
  yearlyStats?: Map<string, CrimeYearEntry[]>;
  theme?: 'dark' | 'light';
}

export default function AreaIntelligencePanel({ data, onClose, crimeStats, yearlyStats, theme = 'dark' }: AreaIntelligencePanelProps) {
  if (!data) return null;

  const isLight = theme === 'light';

  const communityKey = data.communityName.toLowerCase();
  const realYearly = yearlyStats?.get(communityKey);
  const hasRealData = realYearly && realYearly.length > 0;

  const chartData = hasRealData
    ? realYearly.map(e => ({ name: String(e.year), Violent: e.violent, Property: e.property, Disorder: e.disorder }))
    : data.monthlyTrends.map(t => ({ name: t.month, Violent: t.violent_crime, Property: t.property_crime, Disorder: t.disorder_calls }));

  const tooltipStyle = {
    backgroundColor: isLight ? '#ffffff' : '#020617',
    borderRadius: '14px',
    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)',
    boxShadow: isLight ? '0 8px 32px -4px rgba(0,0,0,0.18)' : '0 18px 25px -5px rgba(0,0,0,0.45)',
  };
  const tooltipLabelStyle = {
    fontSize: 10,
    fontWeight: 900,
    color: isLight ? '#1e293b' : '#fff',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
  };

  const crimeEntry = crimeStats?.get(communityKey);

  const Content = () => (
    <div className={cn(
      'flex flex-col h-full backdrop-blur-3xl overflow-hidden relative',
      isLight ? 'bg-[rgb(255,250,243)] text-slate-900' : 'bg-slate-950/95'
    )}>
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className={cn(
        'p-8 border-b flex items-center justify-between relative z-10 sticky top-0 backdrop-blur-xl',
        isLight ? 'border-stone-200/80 bg-[rgba(255,250,243,0.94)]' : 'border-white/5 bg-slate-950/95'
      )}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={14} className="text-blue-400" />
            <span className={cn('text-[10px] font-black uppercase tracking-[0.3em]', isLight ? 'text-slate-600' : 'text-slate-500')}>
              Neighborhood Intelligence
            </span>
          </div>
          <h2 className={cn('text-3xl font-black tracking-tight leading-none', isLight ? 'text-slate-900' : 'text-white')}>
            {data.communityName}
          </h2>
        </div>
        <button
          onClick={onClose}
          className={cn(
            'p-3 transition-all rounded-2xl border group',
            isLight
              ? 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border-slate-300'
              : 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border-white/10'
          )}
        >
          <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 no-scrollbar relative z-10">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className={cn('rounded-[1.4rem] p-4 border', isLight ? 'bg-white/72 border-stone-200/80' : 'bg-white/[0.03] border-white/10')}>
            <p className={cn('text-[10px] font-black uppercase tracking-widest mb-2', isLight ? 'text-slate-600' : 'text-slate-500')}>Safety Score</p>
            <div className="text-4xl font-black text-blue-400">{data.safetyScore}</div>
            <p className={cn('text-[9px] mt-1', isLight ? 'text-slate-500' : 'text-slate-600')}>Out of 100 · weighted vs city avg</p>
          </div>
          <div className={cn('rounded-[1.4rem] p-4 border', isLight ? 'bg-white/72 border-stone-200/80' : 'bg-white/[0.03] border-white/10')}>
            <p className={cn('text-[10px] font-black uppercase tracking-widest mb-2', isLight ? 'text-slate-600' : 'text-slate-500')}>Active Incidents</p>
            <div className="text-4xl font-black text-orange-400">{data.activeIncidents}</div>
            <p className={cn('text-[9px] mt-1', isLight ? 'text-slate-500' : 'text-slate-600')}>Reported in last 2 hours</p>
          </div>
          <div className={cn('rounded-[1.4rem] p-4 border', isLight ? 'bg-white/72 border-stone-200/80' : 'bg-white/[0.03] border-white/10')}>
            <p className={cn('text-[10px] font-black uppercase tracking-widest mb-2', isLight ? 'text-slate-600' : 'text-slate-500')}>Trend</p>
            <div className={cn(
              'text-3xl font-black uppercase',
              data.trend === 'improving' ? 'text-emerald-400' : data.trend === 'declining' ? 'text-red-400' : isLight ? 'text-slate-600' : 'text-slate-300'
            )}>
              {data.trend}
            </div>
            <p className={cn('text-[9px] mt-1', isLight ? 'text-slate-500' : 'text-slate-600')}>Recent months vs prior period</p>
          </div>
          <div className={cn(
            'rounded-[1.4rem] p-4 flex gap-3 border',
            isLight ? 'bg-gradient-to-br from-sky-50 to-teal-50 border-sky-200/80' : 'bg-blue-500/10 border-blue-500/20'
          )}>
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0 border border-blue-500/30">
              <Activity className="text-blue-400" size={20} />
            </div>
            <div>
              <h4 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Live Context</h4>
              <p className={cn('text-xs leading-relaxed font-medium line-clamp-3', isLight ? 'text-blue-900' : 'text-blue-100')}>
                {data.liveOverlayInsight}
              </p>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className={cn('rounded-[1.6rem] p-5 border relative overflow-hidden', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}>
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
          <p className={cn('text-sm leading-relaxed font-medium pl-2', isLight ? 'text-slate-700' : 'text-slate-300')}>
            {data.description}
          </p>
        </div>

        {/* Live crime stats from Open Data */}
        {crimeEntry && (
          <div className={cn('rounded-[1.6rem] p-5 border relative overflow-hidden', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}>
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50" />
            <div className="pl-2">
              <div className="flex items-center justify-between mb-1">
                <p className={cn('text-[10px] font-black uppercase tracking-widest', isLight ? 'text-slate-600' : 'text-slate-500')}>
                  City Crime Statistics · {crimeEntry.year}
                </p>
                <div className="flex items-center gap-1">
                  <Database size={10} className={isLight ? 'text-slate-400' : 'text-slate-600'} />
                  <span className={cn('text-[9px]', isLight ? 'text-slate-400' : 'text-slate-600')}>Calgary Open Data</span>
                </div>
              </div>
              <p className={cn('text-[9px] mb-3', isLight ? 'text-slate-500' : 'text-slate-600')}>
                Criminal offences reported to Calgary Police Service for this community in {crimeEntry.year}
              </p>
              {/* Show a gentle notice when violent + property both read zero —
                  usually means the CPS dataset uses a slightly different community name
                  than the Open Data crime dataset (e.g. "Downtown West" vs "West Village").
                  We still show disorder if it has data. */}
              {crimeEntry.violent === 0 && crimeEntry.property === 0 && crimeEntry.disorder === 0 ? (
                <div className={cn('rounded-xl p-3 border flex items-start gap-2.5', isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20')}>
                  <Info size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className={cn('text-[9px] leading-relaxed', isLight ? 'text-amber-800' : 'text-amber-300')}>
                    Detailed crime breakdowns are not available for this community in the current Open Data snapshot.
                    The community name may differ between data sources. Totals shown above reflect the matched record from the crime dataset.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className={cn('rounded-xl p-3 border', isLight ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/5')}>
                      <p className={cn('text-[9px] font-black uppercase tracking-widest mb-0.5', isLight ? 'text-slate-500' : 'text-slate-500')}>Violent Crime</p>
                      <p className={cn('text-2xl font-black', isLight ? 'text-red-600' : 'text-red-400')}>{crimeEntry.violent.toLocaleString()}</p>
                      <p className={cn('text-[8px] mt-0.5', isLight ? 'text-slate-400' : 'text-slate-600')}>Assault · robbery · threats</p>
                    </div>
                    <div className={cn('rounded-xl p-3 border', isLight ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/5')}>
                      <p className={cn('text-[9px] font-black uppercase tracking-widest mb-0.5', isLight ? 'text-slate-500' : 'text-slate-500')}>Property Crime</p>
                      <p className={cn('text-2xl font-black', isLight ? 'text-blue-600' : 'text-blue-400')}>{crimeEntry.property.toLocaleString()}</p>
                      <p className={cn('text-[8px] mt-0.5', isLight ? 'text-slate-400' : 'text-slate-600')}>Break &amp; enter · theft</p>
                    </div>
                  </div>
                  <div className={cn('rounded-xl p-3 border', isLight ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/5')}>
                    <p className={cn('text-[9px] font-black uppercase tracking-widest mb-0.5', isLight ? 'text-slate-500' : 'text-slate-500')}>Disorder Calls</p>
                    <p className={cn('text-2xl font-black', isLight ? 'text-amber-600' : 'text-amber-400')}>{crimeEntry.disorder.toLocaleString()}</p>
                    <p className={cn('text-[8px] mt-0.5', isLight ? 'text-slate-400' : 'text-slate-600')}>Non-criminal police calls: noise, suspicious activity, nuisance</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-5">
          <div className="space-y-5">
            {/* Crime / Disorder trend chart */}
            <div>
              <div className="mb-3 px-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className={cn('text-[10px] font-black uppercase tracking-[0.3em]', isLight ? 'text-slate-600' : 'text-slate-500')}>
                    {hasRealData ? 'Year-over-Year Trends' : 'Crime Trends'}
                  </h3>
                  <div className="flex gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className={cn('text-[8px] font-bold uppercase', isLight ? 'text-slate-600' : 'text-slate-500')}>Violent</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className={cn('text-[8px] font-bold uppercase', isLight ? 'text-slate-600' : 'text-slate-500')}>Property</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className={cn('text-[8px] font-bold uppercase', isLight ? 'text-slate-600' : 'text-slate-500')}>Disorder</span>
                    </div>
                  </div>
                </div>
                <p className={cn('text-[9px]', isLight ? 'text-slate-500' : 'text-slate-600')}>
                  {hasRealData
                    ? 'Annual criminal offences reported to Calgary Police (left axis) alongside non-criminal disorder service calls — sourced from City of Calgary Open Data'
                    : 'Estimated monthly breakdown across violent, property, and disorder categories based on available community data'}
                </p>
              </div>
              <div
                className={cn('h-[280px] w-full rounded-[1.6rem] p-5 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}
                role="img"
                aria-label={`${hasRealData ? 'Year-over-year' : 'Monthly'} crime trend chart for ${data.communityName}: violent crime (red), property crime (blue), disorder calls (amber)`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorViolent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorDisorder" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorProperty" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isLight ? 'rgba(0,0,0,0.08)' : 'rgba(148,163,184,0.2)'} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} tickFormatter={fmtTick} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ fontSize: 11, fontWeight: 'bold' }} labelStyle={tooltipLabelStyle} />
                    <Area type="monotone" dataKey="Violent" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorViolent)" />
                    <Area type="monotone" dataKey="Property" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorProperty)" />
                    <Area type="monotone" dataKey="Disorder" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorDisorder)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Incident mix bar chart — show for both real and mock data */}
            <div>
              <div className="mb-3 px-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className={cn('text-[10px] font-black uppercase tracking-[0.3em]', isLight ? 'text-slate-600' : 'text-slate-500')}>Incident Mix</h3>
                  <span className={cn('text-[8px] font-bold uppercase', isLight ? 'text-slate-400' : 'text-slate-600')}>Stacked comparison</span>
                </div>
                <p className={cn('text-[9px]', isLight ? 'text-slate-500' : 'text-slate-600')}>
                  Side-by-side bars show the relative proportion of violent crime, property crime, and disorder calls each {hasRealData ? 'year' : 'month'} — useful for spotting which category is driving any overall change
                </p>
              </div>
              <div
                className={cn('h-[240px] w-full rounded-[1.6rem] p-5 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}
                role="img"
                aria-label={`Stacked bar chart showing incident mix by ${hasRealData ? 'year' : 'month'} for ${data.communityName}: violent (red), property (blue), disorder (amber)`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  {/* stackId groups the three series into one stacked column per period —
                      makes proportional comparison far clearer at this chart height */}
                  <BarChart data={chartData} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isLight ? 'rgba(0,0,0,0.08)' : 'rgba(148,163,184,0.2)'} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} tickFormatter={fmtTick} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ fontSize: 11, fontWeight: 'bold' }} labelStyle={tooltipLabelStyle} />
                    <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700, color: isLight ? '#475569' : '#64748b' }} />
                    <Bar dataKey="Violent"  fill="#ef4444" stackId="a" />
                    <Bar dataKey="Property" fill="#3b82f6" stackId="a" />
                    <Bar dataKey="Disorder" fill="#f59e0b" stackId="a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className={cn('text-[10px] font-black uppercase tracking-[0.3em] ml-1', isLight ? 'text-slate-600' : 'text-slate-500')}>Key Insights</h3>
            <div className="grid grid-cols-1 gap-3">
              {data.insights.map((insight, idx) => (
                <div key={idx} className={cn(
                  'rounded-2xl p-4 border flex items-center gap-3 transition-all',
                  isLight
                    ? 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.05]'
                )}>
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border', isLight ? 'bg-slate-100 border-slate-300' : 'bg-white/5 border-white/10')}>
                    {insight.includes('↑') ? (
                      <TrendingUp className="text-red-400" size={16} />
                    ) : insight.includes('↓') ? (
                      <TrendingDown className="text-emerald-400" size={16} />
                    ) : (
                      <ShieldCheck className="text-blue-400" size={16} />
                    )}
                  </div>
                  <p className={cn('text-xs font-bold leading-snug', isLight ? 'text-slate-800' : 'text-white')}>{insight}</p>
                </div>
              ))}
            </div>

            {/* Data Glossary */}
            <div className={cn('rounded-2xl p-4 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/10')}>
              <div className="flex items-center gap-2 mb-3">
                <Info size={13} className="text-blue-400 shrink-0" />
                <p className={cn('text-[10px] font-black uppercase tracking-[0.2em]', isLight ? 'text-slate-600' : 'text-slate-500')}>What Each Category Means</p>
              </div>
              <div className="space-y-2.5">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <p className={cn('text-[9px] font-black uppercase tracking-wide', isLight ? 'text-red-700' : 'text-red-400')}>Violent Crime</p>
                  </div>
                  <p className={cn('text-[9px] leading-relaxed pl-3', isLight ? 'text-slate-600' : 'text-slate-500')}>
                    Assault (non-domestic), commercial robbery, street robbery, and other violent offences reported to police. Domestic violence is tracked separately by CPS and is not included here.
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <p className={cn('text-[9px] font-black uppercase tracking-wide', isLight ? 'text-blue-700' : 'text-blue-400')}>Property Crime</p>
                  </div>
                  <p className={cn('text-[9px] leading-relaxed pl-3', isLight ? 'text-slate-600' : 'text-slate-500')}>
                    Break &amp; enter (commercial, dwelling, other premises), theft from vehicle, and theft of vehicle. Counts the number of reported incidents, not individual items stolen.
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <p className={cn('text-[9px] font-black uppercase tracking-wide', isLight ? 'text-amber-700' : 'text-amber-400')}>Disorder Calls</p>
                  </div>
                  <p className={cn('text-[9px] leading-relaxed pl-3', isLight ? 'text-slate-600' : 'text-slate-500')}>
                    Non-criminal service calls dispatched to CPS: noise complaints, suspicious persons or vehicles, nuisance behaviour, and similar quality-of-life concerns. High disorder does not necessarily indicate criminal activity.
                  </p>
                </div>
              </div>
            </div>

            {/* Data source */}
            <div className={cn('rounded-2xl p-4 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/10')}>
              <div className="flex items-center gap-2 mb-2">
                <Database size={13} className="text-slate-400 shrink-0" />
                <p className={cn('text-[10px] font-black uppercase tracking-[0.2em]', isLight ? 'text-slate-600' : 'text-slate-500')}>Data Sources</p>
              </div>
              <div className={cn('space-y-1.5 text-[9px] leading-relaxed', isLight ? 'text-slate-600' : 'text-slate-500')}>
                <p><span className="font-bold">Crime:</span> City of Calgary — Community Crime Statistics (dataset 78gh-n26t). Includes UCR-classified criminal offences by community, year, and month.</p>
                <p><span className="font-bold">Disorder:</span> City of Calgary — Community Disorder Statistics (dataset h3h6-kgme). Counts non-criminal CPS dispatch events.</p>
                <p className={cn('pt-1 border-t', isLight ? 'border-slate-200' : 'border-white/10')}>
                  Both datasets update quarterly. Figures reflect reported incidents only — not all crime is reported.
                </p>
              </div>
            </div>

            <div className={cn('pt-2 border-t', isLight ? 'border-slate-200' : 'border-white/10')}>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span className={cn('text-[9px] font-black uppercase tracking-widest', isLight ? 'text-slate-600' : 'text-slate-500')}>Safety Score Method</span>
              </div>
              <p className={cn('text-[9px] leading-relaxed font-medium', isLight ? 'text-slate-700' : 'text-slate-500')}>
                Weighted incident density and trend direction across recent periods, normalized against the city-wide baseline. Higher = safer relative to Calgary average.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Panel */}
      <div className="hidden lg:block">
        <AnimatePresence>
          {data && (
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
                <Content />
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Drawer */}
      <div className="lg:hidden">
        <Drawer.Root open={!!data} onClose={onClose}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
            <Drawer.Content className="fixed bottom-0 left-0 right-0 h-[92vh] z-[101] outline-none">
              <div className={cn(
                'h-full rounded-t-[3rem] overflow-hidden border-t flex flex-col',
                isLight ? 'bg-[rgb(255,250,243)] border-stone-200/80' : 'bg-slate-950 border-white/10'
              )}>
                <div className={cn('mx-auto w-12 h-1.5 flex-shrink-0 rounded-full mt-4 mb-2', isLight ? 'bg-slate-300' : 'bg-white/10')} />
                <Drawer.Title className="sr-only">{data.communityName} Neighborhood Intelligence</Drawer.Title>
                <Drawer.Description className="sr-only">Safety scores, crime trends, and historical data for {data.communityName}.</Drawer.Description>
                <div className="flex-1 overflow-hidden">
                  <Content />
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </>
  );
}
