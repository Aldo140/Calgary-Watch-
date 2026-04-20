import { AreaIntelligence } from '@/src/types';
import { Card } from '@/src/components/ui/Card';
import { X, TrendingUp, TrendingDown, ShieldCheck, MapPin, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend } from 'recharts';
import { cn } from '@/src/lib/utils';
import { Drawer } from 'vaul';

interface AreaIntelligencePanelProps {
  data: AreaIntelligence | null;
  onClose: () => void;
  crimeStats?: Map<string, { crime: number; disorder: number; year: number }>;
}

export default function AreaIntelligencePanel({ data, onClose, crimeStats }: AreaIntelligencePanelProps) {
  if (!data) return null;

  const chartData = data.monthlyTrends.map(trend => ({
    name: trend.month,
    Violent: trend.violent_crime,
    Property: trend.property_crime,
    Disorder: trend.disorder_calls,
  }));

  const Content = () => (
    <div className="flex flex-col h-full bg-slate-950/95 light:bg-[rgb(255,250,243)] backdrop-blur-3xl overflow-hidden relative light:text-slate-900">
      {/* Background Decorative Elements */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="p-8 border-b border-white/5 light:border-stone-200/80 flex items-center justify-between relative z-10 sticky top-0 bg-slate-950/95 light:bg-[rgba(255,250,243,0.94)] backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={14} className="text-blue-400" />
            <span className="text-[10px] font-black text-slate-500 light:text-slate-600 uppercase tracking-[0.3em]">Neighborhood Intelligence</span>
          </div>
          <h2 className="text-3xl font-black text-white light:text-slate-900 tracking-tight leading-none">{data.communityName}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-3 text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 transition-all bg-white/5 light:bg-slate-100 hover:bg-white/10 light:hover:bg-slate-200 rounded-2xl border border-white/10 light:border-slate-300 group"
        >
          <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 no-scrollbar relative z-10">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white/[0.03] light:bg-white/72 rounded-[1.4rem] p-4 border border-white/10 light:border-stone-200/80">
            <p className="text-[10px] font-black text-slate-500 light:text-slate-600 uppercase tracking-widest mb-2">Safety Score</p>
            <div className="text-4xl font-black text-blue-300">{data.safetyScore}</div>
          </div>
          <div className="bg-white/[0.03] light:bg-white/72 rounded-[1.4rem] p-4 border border-white/10 light:border-stone-200/80">
            <p className="text-[10px] font-black text-slate-500 light:text-slate-600 uppercase tracking-widest mb-2">Active Incidents</p>
            <div className="text-4xl font-black text-orange-300">{data.activeIncidents}</div>
          </div>
          <div className="bg-white/[0.03] light:bg-white/72 rounded-[1.4rem] p-4 border border-white/10 light:border-stone-200/80">
            <p className="text-[10px] font-black text-slate-500 light:text-slate-600 uppercase tracking-widest mb-2">Trend</p>
            <div className={cn(
              "text-3xl font-black uppercase",
              data.trend === 'improving' ? 'text-emerald-300' : data.trend === 'declining' ? 'text-red-300' : 'text-slate-300'
            )}>
              {data.trend}
            </div>
          </div>
          <div className="bg-blue-500/10 light:bg-gradient-to-br light:from-sky-50 light:to-teal-50 border border-blue-500/20 light:border-sky-200/80 rounded-[1.4rem] p-4 flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0 border border-blue-500/30">
              <Activity className="text-blue-400" size={20} />
            </div>
            <div>
              <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Live Context</h4>
              <p className="text-blue-100 text-xs leading-relaxed font-medium line-clamp-3">{data.liveOverlayInsight}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/[0.02] light:bg-slate-50 rounded-[1.6rem] p-5 border border-white/5 light:border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
          <p className="text-slate-300 light:text-slate-700 text-sm leading-relaxed font-medium pl-2">
            {data.description}
          </p>
        </div>

        {(() => {
          const communityKey = data.communityName.toLowerCase();
          const entry = crimeStats?.get(communityKey);
          if (!entry) return null;
          return (
            <div className="bg-white/[0.02] light:bg-slate-50 rounded-[1.6rem] p-5 border border-white/5 light:border-slate-200 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50" />
              <div className="pl-2">
                <p className="text-[10px] font-black text-slate-500 light:text-slate-600 uppercase tracking-widest mb-3">
                  City Crime Statistics · {entry.year}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/[0.03] light:bg-white rounded-xl p-3 border border-white/5 light:border-slate-200">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Crime Incidents</p>
                    <p className="text-2xl font-black text-red-400 light:text-red-600">{entry.crime.toLocaleString()}</p>
                  </div>
                  <div className="bg-white/[0.03] light:bg-white rounded-xl p-3 border border-white/5 light:border-slate-200">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Disorder Calls</p>
                    <p className="text-2xl font-black text-amber-400 light:text-amber-600">{entry.disorder.toLocaleString()}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Source: City of Calgary Open Data</p>
              </div>
            </div>
          );
        })()}

        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-5">
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-[10px] font-black text-slate-500 light:text-slate-600 uppercase tracking-[0.3em]">Crime Trends</h3>
                <div className="flex gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[8px] font-bold text-slate-500 light:text-slate-600 uppercase">Violent</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-[8px] font-bold text-slate-500 light:text-slate-600 uppercase">Property</span>
                  </div>
                </div>
              </div>
              <div className="h-[280px] w-full bg-white/[0.02] light:bg-slate-50 rounded-[1.6rem] p-5 border border-white/5 light:border-slate-200">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorViolent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorProperty" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#020617',
                        borderRadius: '14px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 18px 25px -5px rgba(0, 0, 0, 0.45)',
                      }}
                      itemStyle={{ fontSize: 11, fontWeight: 'bold' }}
                      labelStyle={{ fontSize: 10, fontWeight: 'black', color: '#fff', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                    />
                    <Area type="monotone" dataKey="Violent" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorViolent)" />
                    <Area type="monotone" dataKey="Property" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorProperty)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-[10px] font-black text-slate-500 light:text-slate-600 uppercase tracking-[0.3em]">Incident Mix</h3>
                <span className="text-[8px] font-bold text-slate-500 light:text-slate-600 uppercase">Added View</span>
              </div>
              <div className="h-[240px] w-full bg-white/[0.02] light:bg-slate-50 rounded-[1.6rem] p-5 border border-white/5 light:border-slate-200">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#020617',
                        borderRadius: '14px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 18px 25px -5px rgba(0, 0, 0, 0.45)',
                      }}
                      itemStyle={{ fontSize: 11, fontWeight: 'bold' }}
                      labelStyle={{ fontSize: 10, fontWeight: 'black', color: '#fff', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, fontWeight: 700, color: '#64748b' }} />
                    <Bar dataKey="Violent" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Property" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Disorder" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-500 light:text-slate-600 uppercase tracking-[0.3em] ml-1">Key Insights</h3>
            <div className="grid grid-cols-1 gap-3">
              {data.insights.map((insight, idx) => (
                <div key={idx} className="bg-white/[0.03] light:bg-slate-50 rounded-2xl p-4 border border-white/10 light:border-slate-200 flex items-center gap-3 hover:bg-white/[0.05] light:hover:bg-slate-100 transition-all">
                  <div className="w-9 h-9 rounded-xl bg-white/5 light:bg-slate-100 flex items-center justify-center shrink-0 border border-white/10 light:border-slate-300">
                    {insight.includes('↑') ? (
                      <TrendingUp className="text-red-400" size={16} />
                    ) : insight.includes('↓') ? (
                      <TrendingDown className="text-emerald-400" size={16} />
                    ) : (
                      <ShieldCheck className="text-blue-400" size={16} />
                    )}
                  </div>
                  <p className="text-white light:text-slate-800 text-xs font-bold leading-snug">{insight}</p>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/10 light:border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span className="text-[9px] font-black text-slate-500 light:text-slate-600 uppercase tracking-widest">Verified System Data</span>
              </div>
              <p className="text-[10px] text-slate-500 light:text-slate-700 leading-relaxed font-medium">
                Safety score uses weighted incident density and trend movement across recent months, normalized against city baseline.
              </p>
            </div>

            <div className="bg-white/[0.03] light:bg-slate-50 rounded-2xl p-4 border border-white/10 light:border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-blue-400" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 light:text-slate-600">Operator Note</p>
              </div>
              <p className="text-xs text-slate-300 light:text-slate-700 leading-relaxed">
                Use Incident Mix with Crime Trends to detect short spikes versus sustained pressure in this neighborhood.
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
              <Card className="h-full w-[min(62vw,66rem)] min-w-[46rem] border-white/10 light:border-slate-200 shadow-[0_0_60px_-8px_rgba(0,0,0,0.6)] overflow-hidden rounded-[2.25rem] light:bg-white">
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
              <div className="h-full bg-slate-950 rounded-t-[3rem] overflow-hidden border-t border-white/10 flex flex-col">
                <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-white/10 mt-4 mb-2" />
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
