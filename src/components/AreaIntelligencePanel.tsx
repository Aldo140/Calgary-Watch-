import { AreaIntelligence } from '@/src/types';
import { Card } from '@/src/components/ui/Card';
import { X, TrendingUp, TrendingDown, ShieldCheck, MapPin, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend } from 'recharts';
import { cn } from '@/src/lib/utils';
import { Drawer } from 'vaul';
import { CrimeYearEntry } from '@/src/hooks/useCrimeStats';

interface AreaIntelligencePanelProps {
  data: AreaIntelligence | null;
  onClose: () => void;
  crimeStats?: Map<string, { crime: number; disorder: number; year: number }>;
  yearlyStats?: Map<string, CrimeYearEntry[]>;
  theme?: 'dark' | 'light';
}

export default function AreaIntelligencePanel({ data, onClose, crimeStats, yearlyStats, theme = 'dark' }: AreaIntelligencePanelProps) {
  if (!data) return null;

  const isLight = theme === 'light';

  // Prefer real yearly data from Open Data API; fall back to mock monthly trends
  const communityKey = data.communityName.toLowerCase();
  const realYearly = yearlyStats?.get(communityKey);
  const chartData = realYearly && realYearly.length > 0
    ? realYearly.map(e => ({ name: String(e.year), Violent: e.crime, Property: 0, Disorder: e.disorder }))
    : data.monthlyTrends.map(t => ({ name: t.month, Violent: t.violent_crime, Property: t.property_crime, Disorder: t.disorder_calls }));
  const chartXLabel = realYearly && realYearly.length > 0 ? 'Year' : 'Month';

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
      {/* Background Decorative Elements */}
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
          </div>
          <div className={cn('rounded-[1.4rem] p-4 border', isLight ? 'bg-white/72 border-stone-200/80' : 'bg-white/[0.03] border-white/10')}>
            <p className={cn('text-[10px] font-black uppercase tracking-widest mb-2', isLight ? 'text-slate-600' : 'text-slate-500')}>Active Incidents</p>
            <div className="text-4xl font-black text-orange-400">{data.activeIncidents}</div>
          </div>
          <div className={cn('rounded-[1.4rem] p-4 border', isLight ? 'bg-white/72 border-stone-200/80' : 'bg-white/[0.03] border-white/10')}>
            <p className={cn('text-[10px] font-black uppercase tracking-widest mb-2', isLight ? 'text-slate-600' : 'text-slate-500')}>Trend</p>
            <div className={cn(
              'text-3xl font-black uppercase',
              data.trend === 'improving' ? 'text-emerald-400' : data.trend === 'declining' ? 'text-red-400' : isLight ? 'text-slate-600' : 'text-slate-300'
            )}>
              {data.trend}
            </div>
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
              <p className={cn('text-[10px] font-black uppercase tracking-widest mb-3', isLight ? 'text-slate-600' : 'text-slate-500')}>
                City Crime Statistics · {crimeEntry.year}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className={cn('rounded-xl p-3 border', isLight ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/5')}>
                  <p className={cn('text-[9px] font-black uppercase tracking-widest mb-1', isLight ? 'text-slate-500' : 'text-slate-500')}>Crime Incidents</p>
                  <p className={cn('text-2xl font-black', isLight ? 'text-red-600' : 'text-red-400')}>{crimeEntry.crime.toLocaleString()}</p>
                </div>
                <div className={cn('rounded-xl p-3 border', isLight ? 'bg-white border-slate-200' : 'bg-white/[0.03] border-white/5')}>
                  <p className={cn('text-[9px] font-black uppercase tracking-widest mb-1', isLight ? 'text-slate-500' : 'text-slate-500')}>Disorder Calls</p>
                  <p className={cn('text-2xl font-black', isLight ? 'text-amber-600' : 'text-amber-400')}>{crimeEntry.disorder.toLocaleString()}</p>
                </div>
              </div>
              <p className={cn('text-[10px] mt-2', isLight ? 'text-slate-500' : 'text-slate-500')}>Source: City of Calgary Open Data</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-5">
          <div className="space-y-5">
            {/* Crime / Disorder trend chart */}
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className={cn('text-[10px] font-black uppercase tracking-[0.3em]', isLight ? 'text-slate-600' : 'text-slate-500')}>
                  {realYearly ? 'Year-over-Year Trends' : 'Crime Trends'}
                </h3>
                <div className="flex gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className={cn('text-[8px] font-bold uppercase', isLight ? 'text-slate-600' : 'text-slate-500')}>
                      {realYearly ? 'Crime' : 'Violent'}
                    </span>
                  </div>
                  {!realYearly && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className={cn('text-[8px] font-bold uppercase', isLight ? 'text-slate-600' : 'text-slate-500')}>Property</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className={cn('text-[8px] font-bold uppercase', isLight ? 'text-slate-600' : 'text-slate-500')}>Disorder</span>
                  </div>
                </div>
              </div>
              <div className={cn('h-[280px] w-full rounded-[1.6rem] p-5 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}>
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
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ fontSize: 11, fontWeight: 'bold' }} labelStyle={tooltipLabelStyle} />
                    <Area type="monotone" dataKey="Violent" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorViolent)" />
                    {!realYearly && <Area type="monotone" dataKey="Property" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorProperty)" />}
                    <Area type="monotone" dataKey="Disorder" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorDisorder)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Incident mix bar chart */}
            {!realYearly && (
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className={cn('text-[10px] font-black uppercase tracking-[0.3em]', isLight ? 'text-slate-600' : 'text-slate-500')}>Incident Mix</h3>
                  <span className={cn('text-[8px] font-bold uppercase', isLight ? 'text-slate-600' : 'text-slate-500')}>Added View</span>
                </div>
                <div className={cn('h-[240px] w-full rounded-[1.6rem] p-5 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/5')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isLight ? 'rgba(0,0,0,0.08)' : 'rgba(148,163,184,0.2)'} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: isLight ? '#475569' : '#64748b', fontWeight: 700 }} />
                      <Tooltip contentStyle={tooltipStyle} itemStyle={{ fontSize: 11, fontWeight: 'bold' }} labelStyle={tooltipLabelStyle} />
                      <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700, color: isLight ? '#475569' : '#64748b' }} />
                      <Bar dataKey="Violent" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Property" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Disorder" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
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

            <div className={cn('pt-2 border-t', isLight ? 'border-slate-200' : 'border-white/10')}>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span className={cn('text-[9px] font-black uppercase tracking-widest', isLight ? 'text-slate-600' : 'text-slate-500')}>Verified System Data</span>
              </div>
              <p className={cn('text-[10px] leading-relaxed font-medium', isLight ? 'text-slate-700' : 'text-slate-500')}>
                Safety score uses weighted incident density and trend movement across recent months, normalized against city baseline.
              </p>
            </div>

            <div className={cn('rounded-2xl p-4 border', isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.03] border-white/10')}>
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-blue-400" />
                <p className={cn('text-[10px] font-black uppercase tracking-[0.2em]', isLight ? 'text-slate-600' : 'text-slate-500')}>Operator Note</p>
              </div>
              <p className={cn('text-xs leading-relaxed', isLight ? 'text-slate-700' : 'text-slate-300')}>
                {realYearly
                  ? 'Year-over-year trends use live Calgary Open Data. Crime and disorder totals reflect annual reported incidents per community.'
                  : 'Use Incident Mix with Crime Trends to detect short spikes versus sustained pressure in this neighborhood.'}
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
