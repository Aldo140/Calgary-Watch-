import { Incident, STATUS_ICONS, CATEGORY_ICONS } from '@/src/types';
import { Card } from '@/src/components/ui/Card';
import { X, MapPin, Clock, ShieldCheck, Share2, AlertTriangle, Navigation, Layers, ExternalLink, MessageSquare, UserCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { cn, publicAsset } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/Button';
import { useState, useEffect } from 'react';

interface IncidentDetailPanelProps {
  incident: Incident | null;
  onClose: () => void;
  onViewNeighborhood: (neighborhood: string) => void;
}

export default function IncidentDetailPanel({ incident, onClose, onViewNeighborhood }: IncidentDetailPanelProps) {
  const [isMobileSheet, setIsMobileSheet] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const fn = () => setIsMobileSheet(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  if (!incident) return null;

  const Icon = CATEGORY_ICONS[incident.category];
  const StatusIcon = STATUS_ICONS[incident.verified_status];
  const safeSourceUrl = (() => {
    if (!incident.source_url) return null;
    try {
      const parsed = new URL(incident.source_url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
      return null;
    } catch {
      return null;
    }
  })();
  const safeSourceLogoUrl = (() => {
    if (!incident.source_logo) return null;
    try {
      const parsed = new URL(incident.source_logo);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
      return null;
    } catch {
      return null;
    }
  })();
  const hasCoords = Number.isFinite(incident.lat) && Number.isFinite(incident.lng);
  const canNavigate = hasCoords && incident.category !== 'weather';
  const isAnonymous = Boolean(incident.anonymous) || incident.name?.toLowerCase() === 'anonymous' || incident.name?.toLowerCase().includes('anonymous');
  const reporterName = isAnonymous ? 'Anonymous' : (incident.name?.trim() || 'Community Member');
  const reporterInitial = reporterName.charAt(0).toUpperCase() || 'C';
  const directionsUrl = canNavigate
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(incident.lat)},${encodeURIComponent(incident.lng)}`
    : null;

  // Build a share payload for the Web Share API; fall back to clipboard copy.
  const handleShare = async () => {
    const shareData = {
      title: `Calgary Watch: ${incident.title}`,
      text: `${incident.title} . Reported in ${incident.neighborhood || 'Calgary'}. Check the live map for details.`,
      url: typeof window !== 'undefined' ? window.location.href : '',
    };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}`);
      }
    } catch {
      // User cancelled share or API unavailable — fail silently.
    }
  };

  const sheetMotion = isMobileSheet
    ? { initial: { y: '100%', opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 0 } }
    : { initial: { x: '100%', opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: '100%', opacity: 0 } };

  return (
    <AnimatePresence>
      {incident && (
        <motion.div
          key="incident-panel"
          initial={sheetMotion.initial}
          animate={sheetMotion.animate}
          exit={sheetMotion.exit}
          transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ willChange: 'transform' }}
          className={cn(
            'fixed z-[100] w-full flex flex-col p-0',
            isMobileSheet
              ? 'inset-x-0 bottom-0 justify-end max-h-[88dvh]'
              : 'inset-y-0 right-0 h-full sm:max-w-lg justify-start sm:p-6'
          )}
        >
          <Card
            className={cn(
              'flex flex-col bg-slate-950/97 light:bg-white backdrop-blur-md border-white/10 light:border-slate-200 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.55)] overflow-hidden p-0 relative min-h-0',
              isMobileSheet
                ? 'max-h-[88dvh] w-full rounded-t-[1.75rem] rounded-b-none border-x-0 border-b-0'
                : 'h-full rounded-none sm:rounded-[2.5rem]'
            )}
          >
            {/* Background Glow */}
            <div className={cn(
              "absolute -top-24 -right-24 w-64 h-64 blur-[120px] opacity-20 rounded-full pointer-events-none",
              incident.category === 'crime' ? 'bg-red-500' :
              incident.category === 'traffic' ? 'bg-orange-500' :
              incident.category === 'infrastructure' ? 'bg-blue-500' :
              incident.category === 'gas' ? 'bg-emerald-500' :
              'bg-purple-500'
            )} />

            {/* Drag affordance — mobile sheet */}
            {isMobileSheet && (
              <div className="flex shrink-0 justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-white/20 light:bg-slate-300" aria-hidden />
              </div>
            )}

            {/* Header / Hero Section */}
            <div
              className={cn(
                'relative w-full shrink-0 overflow-hidden',
                isMobileSheet ? 'h-40' : 'h-64'
              )}
            >
              {/* Background image — local WebP, no network round-trip */}
              <img
                src={publicAsset('images/calgary7.webp')}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover grayscale opacity-25 light:opacity-15"
                loading="eager"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent light:from-white light:via-white/70" />
              
              <button
                onClick={onClose}
                className="absolute top-6 right-6 p-3 text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 transition-all bg-white/5 light:bg-white/90 hover:bg-white/10 light:hover:bg-slate-100 backdrop-blur-xl rounded-2xl border border-white/10 light:border-slate-200 z-20 group"
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
                <div className="bg-white/[0.03] light:bg-slate-50 rounded-3xl p-5 border border-white/10 light:border-slate-200 hover:bg-white/[0.05] light:hover:bg-slate-100 transition-colors group">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={16} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Time Ago</span>
                  </div>
                  <p className="text-white text-lg font-black">{formatDistanceToNow(incident.timestamp)}</p>
                </div>
                <div className="bg-white/[0.03] light:bg-slate-50 rounded-3xl p-5 border border-white/10 light:border-slate-200 hover:bg-white/[0.05] light:hover:bg-slate-100 transition-colors group">
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
                  Community Source
                </h3>
                <div className="bg-gradient-to-br from-white/[0.05] to-transparent light:from-slate-50 light:to-slate-50 rounded-[2rem] p-6 border border-white/10 light:border-slate-200 relative overflow-hidden group">
                  <div className="flex items-start gap-5 relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-white/10 light:bg-white p-2 shrink-0 border border-white/10 light:border-slate-200 overflow-hidden flex items-center justify-center">
                      {safeSourceLogoUrl ? (
                        <img 
                          src={safeSourceLogoUrl} 
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
                        <h4 className="text-lg font-black text-white light:text-slate-900">{incident.source_name || 'Community Source'}</h4>
                        {safeSourceUrl && (
                          <a 
                            href={safeSourceUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-blue-400"
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                      </div>
                      <p className="text-slate-400 light:text-slate-600 text-xs leading-relaxed">
                        Community-reported information shared by Calgary Watch users. Please verify details with official channels before taking action.
                      </p>
                    </div>
                  </div>
                  {/* Decorative background logo */}
                  <div className="absolute -bottom-4 -right-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                    <ShieldCheck size={120} />
                  </div>
                </div>
              </div>

              {/* Reporter */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Reporter</h3>
                <div className="bg-white/[0.03] light:bg-slate-50 rounded-3xl p-4 border border-white/10 light:border-slate-200 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-white/10 light:bg-white border border-white/20 light:border-slate-300 flex items-center justify-center overflow-hidden">
                    {isAnonymous ? (
                      <UserCircle2 size={26} className="text-slate-400 light:text-slate-600" />
                    ) : (
                      <span className="text-sm font-black text-white light:text-slate-900">{reporterInitial}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white light:text-slate-900 truncate">{reporterName}</p>
                    <p className="text-[11px] text-slate-400 light:text-slate-600">
                      {isAnonymous ? 'Posted anonymously' : 'Community member'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Description Section */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <MessageSquare size={14} />
                  Community Note
                </h3>
                <div className="bg-white/[0.02] light:bg-slate-50 p-6 rounded-[2rem] border border-white/5 light:border-slate-200 relative group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50 rounded-full group-hover:w-2 transition-all" />
                  <p className="text-slate-200 light:text-slate-800 text-base leading-relaxed font-medium pl-2">
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
                <Button
                  variant="secondary"
                  className="flex-1 bg-white/5 light:bg-slate-100 hover:bg-white/10 light:hover:bg-slate-200 border-white/10 light:border-slate-300 rounded-2xl h-14 font-black tracking-wide text-sm"
                  onClick={() => void handleShare()}
                >
                  <Share2 size={20} className="mr-2" />
                  Share Report
                </Button>
                {canNavigate && directionsUrl ? (
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center bg-white/5 light:bg-slate-100 hover:bg-white/10 light:hover:bg-slate-200 border border-white/10 light:border-slate-300 rounded-2xl h-14 font-black tracking-wide text-sm text-white light:text-slate-900 transition-all active:scale-95"
                  >
                    <Navigation size={20} className="mr-2" />
                    Navigate
                  </a>
                ) : null}
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-white/5 light:border-slate-200 bg-slate-950/80 light:bg-white/95 backdrop-blur-md">
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
