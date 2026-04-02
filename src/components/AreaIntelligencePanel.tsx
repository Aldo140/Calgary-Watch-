import { AreaIntelligence } from '@/src/types';
import { Card } from '@/src/components/ui/Card';
import { X, TrendingUp, TrendingDown, Info, ShieldCheck, AlertTriangle, MapPin, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { cn } from '@/src/lib/utils';
import { Drawer } from 'vaul';

interface AreaIntelligencePanelProps {
  data: AreaIntelligence | null;
  onClose: () => void;
}

export default function AreaIntelligencePanel({ data, onClose }: AreaIntelligencePanelProps) {
  if (!data) return null;

  const chartData = data.monthlyTrends.map(trend => ({
    name: trend.month,
    Violent: trend.violent_crime,
    Property: trend.property_crime,
    Disorder: trend.disorder_calls,
  }));

  const Content = () => (
    <div className="flex flex-col h-full bg-slate-950/95 backdrop-blur-3xl overflow-hidden relative">
      {/* Background Decorative Elements */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="p-8 border-b border-white/5 flex items-center justify-between relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={14} className="text-blue-400" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Neighborhood Intelligence</span>
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight leading-none">{data.communityName}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-3 text-slate-400 hover:text-white transition-all bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 group"
        >
          <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-10 no-scrollbar relative z-10">
        {/* Core Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/[0.03] rounded-[2rem] p-5 border border-white/10 text-center group hover:bg-white/[0.05] transition-all">
            <div className="text-3xl font-black text-blue-400 mb-1 group-hover:scale-110 transition-transform">{data.safetyScore}</div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Safety Score</div>
          </div>
          <div className="bg-white/[0.03] rounded-[2rem] p-5 border border-white/10 text-center group hover:bg-white/[0.05] transition-all">
            <div className="text-3xl font-black text-orange-400 mb-1 group-hover:scale-110 transition-transform">{data.activeIncidents}</div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active</div>
          </div>
          <div className="bg-white/[0.03] rounded-[2rem] p-5 border border-white/10 text-center group hover:bg-white/[0.05] transition-all">
            <div className={cn(
              "text-3xl font-black mb-1 group-hover:scale-110 transition-transform",
              data.trend === 'improving' ? 'text-emerald-400' : data.trend === 'declining' ? 'text-red-400' : 'text-slate-400'
            )}>
              {data.trend === 'improving' ? '↑' : data.trend === 'declining' ? '↓' : '→'}
            </div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{data.trend}</div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-white/[0.02] rounded-[2.5rem] p-6 border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
          <p className="text-slate-400 text-sm leading-relaxed font-medium italic">
            "{data.description}"
          </p>
        </div>

        {/* Live Context Alert */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-[2rem] p-6 flex gap-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform">
            <Zap size={48} className="text-blue-400" />
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center shrink-0 border border-blue-500/30">
            <Activity className="text-blue-400" size={24} />
          </div>
          <div>
            <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-1">Live Context</h4>
            <p className="text-blue-100 text-sm leading-relaxed font-medium">{data.liveOverlayInsight}</p>
          </div>
        </div>

        {/* Insights Grid */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Key Insights</h3>
          <div className="grid grid-cols-1 gap-4">
            {data.insights.map((insight, idx) => (
              <div key={idx} className="bg-white/[0.03] rounded-2xl p-5 border border-white/10 flex items-center gap-4 hover:bg-white/[0.05] transition-all">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                  {insight.includes('↑') ? (
                    <TrendingUp className="text-red-400" size={18} />
                  ) : insight.includes('↓') ? (
                    <TrendingDown className="text-emerald-400" size={18} />
                  ) : (
                    <ShieldCheck className="text-blue-400" size={18} />
                  )}
                </div>
                <p className="text-white text-xs font-bold leading-snug">{insight}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Charts Section */}
        <div className="space-y-8">
          <div>
            <div className="flex items-center justify-between mb-6 px-2">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Crime Trends</h3>
              <div className="flex gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[8px] font-bold text-slate-500 uppercase">Violent</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[8px] font-bold text-slate-500 uppercase">Property</span>
                </div>
              </div>
            </div>
            <div className="h-64 w-full bg-white/[0.02] rounded-[2.5rem] p-6 border border-white/5">
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
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderRadius: '16px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                    }}
                    itemStyle={{ fontSize: 10, fontWeight: 'bold' }}
                    labelStyle={{ fontSize: 10, fontWeight: 'black', color: '#fff', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                  />
                  <Area type="monotone" dataKey="Violent" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorViolent)" />
                  <Area type="monotone" dataKey="Property" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorProperty)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="pt-10 pb-6 border-t border-white/5">
          <div className="flex items-center justify-center gap-2 mb-4">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Verified System Data</span>
          </div>
          <p className="text-[10px] text-slate-600 text-center leading-relaxed font-medium px-4">
            Safety scores are calculated using a weighted average of reported incidents per capita, 
            normalized against city-wide historical averages. Updated monthly via CPS Open Data.
          </p>
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
              className="fixed inset-y-0 right-0 h-full w-full max-w-lg z-[90] p-6"
            >
              <Card className="h-full border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden rounded-[3rem]">
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
