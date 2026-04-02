import { Incident, STATUS_ICONS, CATEGORY_ICONS } from '@/src/types';
import { Card } from '@/src/components/ui/Card';
import { X, MapPin, Clock, ShieldCheck, Share2, AlertTriangle, Info, Navigation, Layers, ExternalLink, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/Button';

interface IncidentDetailPanelProps {
  incident: Incident | null;
  onClose: () => void;
  onViewNeighborhood: (neighborhood: string) => void;
}

export default function IncidentDetailPanel({ incident, onClose, onViewNeighborhood }: IncidentDetailPanelProps) {
  if (!incident) return null;

  const Icon = CATEGORY_ICONS[incident.category];
  const StatusIcon = STATUS_ICONS[incident.verified_status];

  return (
    <AnimatePresence>
      {incident && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-y-0 right-0 h-full w-full sm:max-w-lg z-[100] p-0 sm:p-6"
        >
          <Card className="h-full flex flex-col bg-slate-950/95 backdrop-blur-3xl border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden p-0 rounded-none sm:rounded-[2.5rem] relative">
            {/* Background Glow */}
            <div className={cn(
              "absolute -top-24 -right-24 w-64 h-64 blur-[120px] opacity-20 rounded-full pointer-events-none",
              incident.category === 'crime' ? 'bg-red-500' :
              incident.category === 'traffic' ? 'bg-orange-500' :
              incident.category === 'infrastructure' ? 'bg-blue-500' :
              incident.category === 'gas' ? 'bg-emerald-500' :
              'bg-purple-500'
            )} />

            {/* Header / Hero Section */}
            <div className="relative h-64 w-full shrink-0 overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80')] bg-cover bg-center grayscale opacity-30" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
              
              <button
                onClick={onClose}
                className="absolute top-6 right-6 p-3 text-slate-400 hover:text-white transition-all bg-white/5 hover:bg-white/10 backdrop-blur-xl rounded-2xl border border-white/10 z-20 group"
              >
                <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
              </button>

              <div className="absolute bottom-8 left-8 right-8 z-10">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={cn(
                      'px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border',
                      incident.category === 'crime' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                      incident.category === 'traffic' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                      incident.category === 'infrastructure' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                      incident.category === 'gas' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      'bg-purple-500/20 text-purple-400 border-purple-500/30'
                    )}
                  >
                    <Icon size={14} />
                    {incident.category}
                  </motion.div>
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className={cn(
                      'px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border',
                      incident.verified_status === 'community_confirmed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      incident.verified_status === 'multiple_reports' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                      'bg-slate-500/20 text-slate-400 border-slate-500/30'
                    )}
                  >
                    {StatusIcon && <StatusIcon size={14} />}
                    {incident.verified_status?.replace('_', ' ')}
                  </motion.div>
                </div>
                <h2 className="text-3xl font-black text-white tracking-tight leading-[1.1] drop-shadow-lg">
                  {incident.title}
                </h2>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10 no-scrollbar">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/[0.03] rounded-3xl p-5 border border-white/10 hover:bg-white/[0.05] transition-colors group">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={16} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Time Ago</span>
                  </div>
                  <p className="text-white text-lg font-black">{formatDistanceToNow(incident.timestamp)}</p>
                </div>
                <div className="bg-white/[0.03] rounded-3xl p-5 border border-white/10 hover:bg-white/[0.05] transition-colors group">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={16} className="text-slate-500 group-hover:text-red-400 transition-colors" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Location</span>
                  </div>
                  <p className="text-white text-lg font-black truncate">{incident.neighborhood || 'Calgary'}</p>
                </div>
              </div>

              {/* Source Information - NEW & PREMIUM */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <ShieldCheck size={14} />
                  Official Source & Verification
                </h3>
                <div className="bg-gradient-to-br from-white/[0.05] to-transparent rounded-[2rem] p-6 border border-white/10 relative overflow-hidden group">
                  <div className="flex items-start gap-5 relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-white/10 p-2 shrink-0 border border-white/10 overflow-hidden flex items-center justify-center">
                      {incident.source_logo ? (
                        <img 
                          src={incident.source_logo} 
                          alt={incident.source_name} 
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <ShieldCheck size={32} className="text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-black text-white">{incident.source_name || 'Verified Source'}</h4>
                        {incident.source_url && (
                          <a 
                            href={incident.source_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-blue-400"
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed">
                        {incident.verified_status === 'community_confirmed' 
                          ? 'This report is cross-referenced with official city data and has been validated by our automated integrity system.'
                          : 'Community-sourced report with high credibility. Verification is ongoing through official channels.'}
                      </p>
                    </div>
                  </div>
                  {/* Decorative background logo */}
                  <div className="absolute -bottom-4 -right-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                    <ShieldCheck size={120} />
                  </div>
                </div>
              </div>

              {/* Description Section */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <MessageSquare size={14} />
                  Community Note
                </h3>
                <div className="bg-white/[0.02] p-6 rounded-[2rem] border border-white/5 relative group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50 rounded-full group-hover:w-2 transition-all" />
                  <p className="text-slate-200 text-base leading-relaxed font-medium pl-2">
                    {incident.description}
                  </p>
                </div>
              </div>

              {/* Intelligence CTA */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onViewNeighborhood(incident.neighborhood)}
                className="w-full group relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-[2.5rem] text-left transition-all shadow-2xl shadow-blue-500/20"
              >
                <div className="absolute -top-10 -right-10 p-4 opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-all duration-500">
                  <Layers size={180} />
                </div>
                <div className="relative z-10 space-y-3">
                  <div className="flex items-center gap-2 text-blue-200/80">
                    <Layers size={14} />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Neighborhood Intel</span>
                  </div>
                  <h4 className="text-2xl font-black text-white">Explore {incident.neighborhood}</h4>
                  <p className="text-blue-100/70 text-sm leading-relaxed max-w-[85%] font-medium">
                    Analyze safety scores, crime trends, and historical data for this specific area.
                  </p>
                </div>
              </motion.button>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                <Button variant="secondary" className="flex-1 bg-white/5 hover:bg-white/10 border-white/10 rounded-2xl h-14 font-black tracking-wide text-sm">
                  <Share2 size={20} className="mr-2" />
                  Share Report
                </Button>
                <Button variant="secondary" className="flex-1 bg-white/5 hover:bg-white/10 border-white/10 rounded-2xl h-14 font-black tracking-wide text-sm">
                  <Navigation size={20} className="mr-2" />
                  Navigate
                </Button>
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-white/5 bg-slate-950/80 backdrop-blur-md">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                  Report ID: {incident.id}
                </p>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">Live System</span>
                </div>
              </div>
              <p className="text-[9px] text-slate-600 leading-relaxed">
                This information is provided for community awareness. In case of emergency, always contact 9-1-1 immediately.
              </p>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
