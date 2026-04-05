import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, animate, AnimatePresence } from 'motion/react';
import { gsap } from 'gsap';
import {
  ShieldCheck,
  Map as MapIcon,
  AlertCircle,
  Radio,
  Users,
  ArrowRight,
  ShieldAlert,
  Layers,
  Sun,
  Moon,
  MapPin,
  Zap,
  BarChart2,
  Clock,
  CheckCircle2,
  Lock,
  X,
  Menu,
  Briefcase,
  Activity,
} from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { cn, publicAsset } from '@/src/lib/utils';
import { db } from '@/src/firebase';
import { addDoc, collection } from 'firebase/firestore';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// Animated counter
// ---------------------------------------------------------------------------
const AnimatedCounter = memo(function AnimatedCounter({
  to, suffix = '', prefix = '', duration = 2, decimals = 0,
}: { to: number; suffix?: string; prefix?: string; duration?: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (!inView || !ref.current) return;
    if (reduced) { ref.current.textContent = `${prefix}${to.toFixed(decimals)}${suffix}`; return; }
    const ctrl = animate(0, to, {
      duration,
      ease: [0.25, 0.46, 0.45, 0.94],
      onUpdate(v) { if (ref.current) ref.current.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`; },
    });
    return () => ctrl.stop();
  }, [inView, to, suffix, prefix, duration, decimals, reduced]);

  return <span ref={ref}>{prefix}0{suffix}</span>;
});

// ---------------------------------------------------------------------------
// Mountain silhouette divider
// ---------------------------------------------------------------------------
const MountainSilhouette = memo(function MountainSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1440 220" fill="currentColor" preserveAspectRatio="xMidYMax meet" className={className} aria-hidden="true">
      <path opacity="0.18" d="M0 220 L0 160 L60 120 L120 140 L200 80 L280 130 L360 70 L440 110 L520 50 L600 100 L680 60 L760 90 L840 40 L920 80 L1000 30 L1080 75 L1160 45 L1240 85 L1320 55 L1440 90 L1440 220 Z" />
      <path opacity="0.32" d="M0 220 L0 180 L80 145 L160 165 L240 110 L320 148 L400 95 L480 138 L560 88 L640 125 L720 72 L800 115 L880 65 L960 105 L1040 58 L1120 98 L1200 70 L1280 108 L1360 80 L1440 115 L1440 220 Z" />
      <path d="M0 220 L0 200 L100 168 L200 185 L300 148 L400 170 L500 138 L600 162 L700 130 L800 155 L900 122 L1000 150 L1100 118 L1200 145 L1300 125 L1400 148 L1440 155 L1440 220 Z" />
    </svg>
  );
});

// ---------------------------------------------------------------------------
// Aurora background overlay
// ---------------------------------------------------------------------------
const AuroraBackground = memo(function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="aurora-drift absolute -top-20 left-[-15%] w-[60%] h-40 rounded-full opacity-25"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(46,139,122,0.5) 0%, transparent 60%)' }} />
      <div className="aurora-drift-delay absolute -top-12 right-[-8%] w-[50%] h-36 rounded-full opacity-20"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(74,144,217,0.4) 0%, transparent 60%)' }} />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Legal Modal
// ---------------------------------------------------------------------------
function LegalModal({ legalModal, onClose }: { legalModal: 'privacy' | 'terms' | 'contact' | null; onClose: () => void }) {
  if (!legalModal) return null;
  const content = {
    privacy: { title: 'Privacy Policy', body: 'Calgary Watch stores report metadata to operate safety alerts. We do not sell personal data. Reporter identity can be anonymised per report and admin access is restricted to verified administrators only.' },
    terms: { title: 'Terms of Use', body: 'Calgary Watch is for informational awareness only. Always verify critical incidents with official agencies. Misleading or abusive submissions may be removed by administrators.' },
    contact: { title: 'Contact', body: 'For support, account issues, or policy requests, contact: jorti104@mtroyal.ca' },
  }[legalModal];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose} role="dialog" aria-modal="true" aria-label={content.title}>
      <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.96 }}
        className="w-full max-w-xl rounded-3xl border border-white/10 light:border-slate-200 bg-slate-900 light:bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <h3 className="text-2xl font-black text-white light:text-slate-900">{content.title}</h3>
        <p className="mt-4 text-sm text-slate-300 light:text-slate-700 leading-relaxed">{content.body}</p>
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose} className="bg-[#4A90D9] hover:bg-blue-600 px-5">Close</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Real-looking diverse avatar images (pravatar.cc stock photos)
// ---------------------------------------------------------------------------
const AVATARS = [
  { src: 'https://i.pravatar.cc/40?img=47', alt: 'Community member' },
  { src: 'https://i.pravatar.cc/40?img=32', alt: 'Community member' },
  { src: 'https://i.pravatar.cc/40?img=5',  alt: 'Community member' },
  { src: 'https://i.pravatar.cc/40?img=65', alt: 'Community member' },
  { src: 'https://i.pravatar.cc/40?img=23', alt: 'Community member' },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function LandingPage() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLElement>(null);
  const mountainRef = useRef<HTMLDivElement>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | 'contact' | null>(null);
  const [cityRequest, setCityRequest] = useState('');
  const [isSubmittingCityRequest, setIsSubmittingCityRequest] = useState(false);
  const [cityRequestMessage, setCityRequestMessage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const [navScrolled, setNavScrolled] = useState(false);
  const lastNavScrollY = useRef(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      return localStorage.getItem('cw-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    if (theme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
    try {
      localStorage.setItem('cw-theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Nav scroll-aware hide/show + background once past hero
  useEffect(() => {
    const hideThreshold = 80;
    const onScroll = () => {
      const current = window.scrollY;
      // background only appears once user has scrolled past the entire hero section
      const heroBottom = heroRef.current
        ? heroRef.current.offsetTop + heroRef.current.offsetHeight - 80
        : 600;
      setNavScrolled(current > heroBottom);
      if (current < hideThreshold) {
        setNavVisible(true);
      } else if (current > lastNavScrollY.current + 4) {
        setNavVisible(false);
      } else if (current < lastNavScrollY.current - 4) {
        setNavVisible(true);
      }
      lastNavScrollY.current = current;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // GSAP pulse dots removed for Safari memory optimization on iOS
  useEffect(() => {
    // Keeping hook skeleton so React hook order stays identical if component unmounts
  }, [reducedMotion]);

  // Mountain parallax
  const rafId = useRef<number | null>(null);
  const lastScrollY = useRef(0);
  const mountainParallax = useCallback(() => {
    if (!mountainRef.current || reducedMotion) return;
    const scrollY = window.scrollY;
    if (scrollY === lastScrollY.current) return;
    lastScrollY.current = scrollY;
    const layers = mountainRef.current.querySelectorAll<SVGPathElement>('path');
    const rates = [0.06, 0.12, 0.22];
    layers.forEach((path, i) => { const rate = rates[i] ?? 0.15; path.style.transform = `translateY(${scrollY * rate}px)`; });
    rafId.current = null;
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const onScroll = () => { if (rafId.current === null) { rafId.current = requestAnimationFrame(mountainParallax); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (rafId.current !== null) cancelAnimationFrame(rafId.current); };
  }, [mountainParallax, reducedMotion]);

  // Intersection observer for staggered reveal
  useEffect(() => {
    if (reducedMotion) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement;
          const delay = el.dataset.delay ?? '0';
          el.style.animationDelay = `${delay}ms`;
          el.classList.add('fade-up');
          el.style.opacity = '1';
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.15 });
    const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');
    targets.forEach((el) => { el.style.opacity = '0'; observer.observe(el); });
    return () => observer.disconnect();
  }, [reducedMotion]);

  // City expansion request
  const handleCityRequest = async () => {
    const city = cityRequest.trim().slice(0, 100);
    if (city.length < 2) { setCityRequestMessage('Please enter a valid city name.'); return; }
    setIsSubmittingCityRequest(true);
    setCityRequestMessage(null);
    const requestedAt = Date.now();
    try {
      const existing = JSON.parse(localStorage.getItem('cw_city_requests') || '[]') as Array<{ city: string; requestedAt: number }>;
      existing.unshift({ city, requestedAt });
      localStorage.setItem('cw_city_requests', JSON.stringify(existing.slice(0, 100)));
    } catch { /* optional */ }
    try {
      if (db) {
        await addDoc(collection(db, 'city_requests'), { city, requestedAt, source: 'landing_page' });
      }
    } catch { /* continue */ } finally { setIsSubmittingCityRequest(false); }
    const subject = encodeURIComponent(`City Expansion Request: ${city}`);
    const body = encodeURIComponent(`Hello Calgary Watch team,\n\nPlease add support for ${city}.\n\nRequested via landing page at ${new Date(requestedAt).toISOString()}.`);
    window.open(`mailto:jorti104@mtroyal.ca?subject=${subject}&body=${body}`, '_blank');
    setCityRequestMessage(`Request queued for ${city}. Thank you.`);
    setCityRequest('');
  };

  return (
    <div className="min-h-dvh bg-slate-950 light:bg-slate-50 text-white light:text-slate-900 font-sans overflow-x-hidden">

      {/* ================================================================
          NAVIGATION - clean fixed bar, consistent h-16
          ================================================================ */}
      <nav className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        navVisible ? 'translate-y-0' : '-translate-y-full',
        navScrolled
          ? 'bg-slate-950/85 light:bg-white/90 backdrop-blur-xl border-b border-white/8 light:border-slate-200'
          : 'bg-transparent border-b border-transparent',
      )}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">

          {/* Logo */}
          <button
            type="button"
            className="flex items-center gap-2.5 shrink-0 group"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Calgary Watch home"
          >
            <img
              src={publicAsset('icon.svg')}
              alt=""
              className="w-8 h-8 object-contain drop-shadow-md"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="flex flex-col leading-none">
              <span className="text-base font-black tracking-tight"
                style={{ background: 'linear-gradient(to right,#4A90D9,#2E8B7A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Calgary Watch
              </span>
              <span className="text-[9px] font-bold tracking-[0.3em] text-slate-500 uppercase mt-px">Community Safety</span>
            </div>
          </button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            <a href="#features" className="px-3 py-1.5 text-sm font-medium text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 rounded-lg hover:bg-white/5 light:hover:bg-slate-100 transition-all">Features</a>
            <a href="#how-it-works" className="px-3 py-1.5 text-sm font-medium text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 rounded-lg hover:bg-white/5 light:hover:bg-slate-100 transition-all">How it Works</a>
            <button type="button" onClick={() => navigate('/about')} className="px-3 py-1.5 text-sm font-medium text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 rounded-lg hover:bg-white/5 light:hover:bg-slate-100 transition-all">About</button>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 light:bg-slate-100 border border-white/10 light:border-slate-200 text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 transition-colors"
              aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <Button variant="primary" className="hidden md:flex bg-[#4A90D9] hover:bg-blue-500 rounded-full px-5 h-9 text-sm font-bold" onClick={() => navigate('/map')}>
              Open Map
            </Button>
            <button type="button" className="md:hidden w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-slate-400"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
              {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="md:hidden border-t border-white/8 bg-slate-950/95 backdrop-blur-xl px-5 py-4 flex flex-col gap-1">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white rounded-xl hover:bg-white/5 transition-all">Features</a>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white rounded-xl hover:bg-white/5 transition-all">How it Works</a>
              <button type="button" onClick={() => { navigate('/about'); setMobileMenuOpen(false); }} className="text-left px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white rounded-xl hover:bg-white/5 transition-all">About</button>
              <div className="pt-2 border-t border-white/8 mt-1">
                <Button variant="primary" className="w-full bg-[#4A90D9] hover:bg-blue-500 rounded-xl h-11 font-bold" onClick={() => { navigate('/map'); setMobileMenuOpen(false); }}>Open Live Map</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ================================================================
          HERO
          ================================================================ */}
      <section ref={heroRef} className="relative flex flex-col overflow-hidden bg-slate-950 w-full">
        
        {/* Full-width seamless background image */}
        <div className="absolute inset-0 pointer-events-none">
            <img src={publicAsset('images/calgary2.jpg')} className="w-full h-full object-cover opacity-40 brightness-75 scale-105" alt="Calgary Skyline Ambient" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-slate-950/40" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-90" />
        </div>

        {/* Large ambient glows — use radial-gradient to avoid paint-heavy blur filter */}
        <div className="absolute top-1/4 left-[10%] w-96 h-96 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(74,144,217,0.12) 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-[20%] w-96 h-96 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(46,139,122,0.10) 0%, transparent 70%)' }} />

        <div className="relative z-10 flex flex-col lg:grid lg:grid-cols-[45fr_55fr] gap-4 lg:gap-12 px-6 sm:px-12 lg:px-16 xl:px-20 pt-24 sm:pt-28 lg:pt-32 pb-10 sm:pb-16 lg:pb-20 min-h-dvh lg:min-h-[900px]">

          {/* Left - content (Text naturally comes first on mobile) */}
          <div className="flex flex-col justify-center max-w-xl self-center pt-8 pb-4 lg:py-0">
            <AuroraBackground />

            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, x: -28 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="relative z-10"
            >
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-7">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#4A90D9]/10 border border-[#4A90D9]/30 rounded-full">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4A90D9] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4A90D9]" />
                  </span>
                  <span className="text-[11px] font-bold text-[#4A90D9] uppercase tracking-widest">Live · Calgary, AB</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#2E8B7A]/10 border border-[#2E8B7A]/30 rounded-full">
                  <span className="text-[11px] font-bold text-[#2E8B7A] uppercase tracking-widest">Non-Profit</span>
                </div>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight text-white mb-5">
                Know what's happening<br />in{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A]">Calgary</span>
                {' '}right now.
              </h1>

              {/* Description */}
              <p className="text-base sm:text-lg text-slate-400 leading-relaxed mb-9 max-w-lg">
                A live map where Calgarians report incidents the moment they happen. Road closures, fires, flooding, safety alerts - all in one place, verified and real-time.
              </p>

              {/* CTAs (Desktop Only - Mobile buttons moved below phone) */}
              <div className="hidden lg:flex flex-wrap gap-3 mb-8">
                <Button size="lg" className="bg-[#4A90D9] hover:bg-blue-500 rounded-xl px-8 h-14 text-base font-bold group shadow-[0_6px_24px_rgba(74,144,217,0.35)]" onClick={() => navigate('/map')}>
                  Open Live Map
                  <ArrowRight className="ml-2 transition-transform group-hover:translate-x-1" size={17} />
                </Button>
                <Button variant="secondary" size="lg" className="bg-white/5 border border-white/15 hover:bg-white/10 rounded-xl px-8 h-14 text-base font-bold text-white" onClick={() => navigate('/map?report=true')}>
                  Report an Incident
                </Button>
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-3 pt-3">
                <div className="flex -space-x-2.5 shrink-0" aria-hidden="true">
                  {AVATARS.map((av, i) => (
                    <img key={i} src={av.src} alt="" className="w-8 h-8 rounded-full border-2 border-slate-950 object-cover shrink-0"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  ))}
                </div>
                <p className="text-sm text-slate-400">
                  <span className="text-white font-bold">2,400+</span> Calgarians this week
                </p>
              </div>
            </motion.div>
          </div>

          {/* Right - Interactive Visual Simulation (Phone) */}
          <div className="relative w-full flex flex-col items-center justify-center pt-8 pb-10 lg:py-0 self-center">
             
             {/* Dynamic Floating iPhone Mockup */}
             <motion.div 
               initial={reducedMotion ? undefined : { opacity: 0, y: 40, scale: 0.95 }}
               whileInView={{ opacity: 1, y: 0, scale: 1 }}
               viewport={{ once: true, margin: "0px" }}
               transition={{ duration: 0.9, ease: 'easeOut' }}
               className="relative w-full max-w-[300px] sm:max-w-[340px] aspect-[9/19.5] mx-auto rounded-[2.5rem] sm:rounded-[3rem] bg-slate-950 border-[6px] sm:border-[8px] border-slate-900 shadow-[0_30px_80px_rgba(0,0,0,0.9)] overflow-hidden ring-1 ring-white/10 shrink-0"
             >
                {/* The iPhone Notch */}
                <div className="absolute top-0 inset-x-0 h-6 sm:h-7 flex justify-center z-50">
                   <div className="w-28 sm:w-32 h-[90%] bg-slate-900 rounded-b-2xl sm:rounded-b-3xl shadow-inner" />
                </div>

                {/* iPhone Screen Content: NATIVE FULL REAL-ESTATE UI */}
                <div className="absolute inset-0 bg-slate-950 flex flex-col">
                   
                   {/* Floating Top UI (Native feel, no fake headers) */}
                   <div className="absolute top-9 inset-x-4 flex items-center justify-between z-20 pointer-events-none">
                       <div className="w-9 h-9 rounded-full bg-slate-900/90 backdrop-blur-xl border border-white/5 flex items-center justify-center shadow-lg">
                           <Menu size={16} className="text-white" />
                       </div>
                       <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1 }} className="px-3 py-1.5 rounded-full bg-green-500/10 backdrop-blur-xl border border-green-500/20 shadow-lg flex items-center gap-1.5">
                           <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                           <span className="text-[10px] font-bold text-green-400 tracking-wide">Sync Live</span>
                       </motion.div>
                   </div>

                   {/* Background Map filling top half completely seamlessly */}
                   <div className="absolute top-0 inset-x-0 h-[55%] bg-slate-900 overflow-hidden">
                       <img
                          src={publicAsset('images/calgary_map.png')}
                          className="absolute inset-0 w-[110%] h-[110%] object-cover opacity-90"
                          alt="Calgary Top Down Neon Map"
                          loading="lazy"
                       />
                       
                       {/* Floating Action Buttons (Right side native map feel) */}
                       <div className="absolute top-[25%] right-3 flex flex-col gap-2 z-20">
                           <motion.div whileHover={{ scale: 1.1 }} className="w-9 h-9 rounded-full bg-[#4A90D9] shadow-[0_0_15px_rgba(74,144,217,0.5)] flex items-center justify-center text-white cursor-pointer"><MapPin size={16} className="fill-white" /></motion.div>
                           <div className="w-9 h-9 rounded-full bg-slate-800/90 backdrop-blur-md border border-white/5 shadow-lg flex items-center justify-center text-slate-300"><Layers size={16} /></div>
                       </div>

                       {/* PING 1: User Location */}
                       <motion.div animate={{ opacity: [0, 0.6, 0], scale: [0.5, 2.5, 0.5] }} transition={{ duration: 4, repeat: Infinity, ease: "easeOut" }} className="absolute top-[35%] left-[25%] w-16 h-16 bg-[#4A90D9]/30 rounded-full -translate-x-1/2 -translate-y-1/2" />
                       <div className="absolute top-[35%] left-[25%] w-3 h-3 bg-[#4A90D9] rounded-full shadow-[0_0_10px_#4A90D9] border-2 border-white -translate-x-1/2 -translate-y-1/2" />

                       {/* PING 2: Major Incident */}
                       <motion.div animate={{ opacity: [0, 0.5, 0], scale: [0.5, 2, 0.5] }} transition={{ duration: 3, repeat: Infinity, delay: 0.5 }} className="absolute top-[25%] left-[65%] w-20 h-20 sm:w-24 sm:h-24 bg-red-500/20 rounded-full -translate-x-1/2 -translate-y-1/2" />
                       <div className="absolute top-[25%] left-[65%] text-red-500 drop-shadow-[0_0_10px_#ef4444] -translate-x-1/2 -translate-y-1/2">
                           <Activity size={22} className="text-white fill-red-500" />
                       </div>

                       {/* PING 3: Minor Warning */}
                       <motion.div animate={{ opacity: [0, 0.5, 0], scale: [0.5, 1.5, 0.5] }} transition={{ duration: 2.5, repeat: Infinity, delay: 1.5 }} className="absolute top-[60%] left-[80%] w-12 h-12 bg-amber-500/30 rounded-full -translate-x-1/2 -translate-y-1/2" />
                       <div className="absolute top-[60%] left-[80%] text-amber-500 drop-shadow-[0_0_8px_#fbbf24] -translate-x-1/2 -translate-y-1/2"><AlertCircle size={16} className="fill-amber-500 text-slate-900" /></div>
                   </div>

                   {/* Native Bottom Sheet overlapping the map securely */}
                   <div className="absolute bottom-0 inset-x-0 h-[50%] bg-slate-900/95 backdrop-blur-md rounded-t-[2rem] border-t border-white/10 flex flex-col pt-2 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] z-30">
                       
                       {/* Drag Handle */}
                       <div className="w-10 h-1.5 rounded-full bg-white/20 mx-auto mb-3" />
                       
                       <div className="px-4 pb-2 flex justify-between items-end border-b border-white/5">
                           <span className="text-white font-bold text-sm">Nearby Activity</span>
                           <span className="text-[10px] text-slate-400 font-semibold bg-white/5 px-2 py-0.5 rounded-full">3 Active</span>
                       </div>

                       {/* Scrolling Feed Container */}
                       <div className="flex-1 overflow-hidden px-3 pt-3 flex flex-col gap-2.5 relative">
                           
                           {/* Item 1: High Priority */}
                           <motion.div 
                              initial={{ x: -20, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.4, type: "spring" }} 
                              className="p-3 bg-red-500/5 rounded-[1rem] border border-red-500/20 flex gap-3 relative overflow-hidden"
                           >
                               <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500 shadow-[0_0_10px_#ef4444]" />
                               <div className="p-1.5 rounded-full bg-red-500/10 text-red-400 shrink-0 self-start"><AlertCircle size={14} /></div>
                               <div className="flex-1 min-w-0">
                                   <div className="flex justify-between items-start gap-1">
                                      <h4 className="text-white font-bold text-[11px] sm:text-xs truncate">Major Collision</h4>
                                      <span className="text-[8px] text-red-400 font-black animate-pulse bg-red-500/10 px-1 rounded whitespace-nowrap">JUST NOW</span>
                                   </div>
                                   <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 truncate">Deerfoot Tr & 16 Ave block...</p>
                               </div>
                           </motion.div>

                           {/* Item 2: Warning */}
                           <motion.div 
                              initial={{ x: -20, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.6, type: "spring" }} 
                              className="p-3 bg-slate-800/40 rounded-[1rem] border border-slate-700/50 flex gap-3 relative"
                           >
                               <div className="p-1.5 rounded-full bg-amber-500/10 text-amber-500 shrink-0 self-start"><ShieldAlert size={14} /></div>
                               <div className="flex-1 min-w-0">
                                   <div className="flex justify-between items-start gap-1">
                                      <h4 className="text-white font-bold text-[11px] sm:text-xs truncate">Flood Hazard</h4>
                                      <span className="text-[8px] text-slate-500 font-bold whitespace-nowrap">15m ago</span>
                                   </div>
                                   <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 truncate">Memorial Dr pooling rapid...</p>
                               </div>
                           </motion.div>

                           {/* Item 3: Information */}
                           <motion.div 
                              initial={{ x: -20, opacity: 0 }} whileInView={{ x: 0, opacity: 0.5 }} viewport={{ once: true }} transition={{ delay: 0.8, type: "spring" }} 
                              className="p-3 bg-slate-800/20 rounded-[1rem] border border-slate-700/30 flex gap-3 relative grayscale-[30%]"
                           >
                               <div className="p-1.5 rounded-full bg-[#4A90D9]/10 text-[#4A90D9] shrink-0 self-start"><CheckCircle2 size={14} /></div>
                               <div className="flex-1 min-w-0">
                                   <div className="flex justify-between items-start gap-1">
                                      <h4 className="text-white font-bold text-[11px] sm:text-xs truncate">Road Cleared</h4>
                                      <span className="text-[8px] text-slate-500 font-bold whitespace-nowrap">1h ago</span>
                                   </div>
                               </div>
                           </motion.div>

                           {/* Bottom fade */}
                           <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />
                       </div>

                       {/* Logo watermark - bottom right of phone */}
                       <div className="absolute bottom-3 right-4 flex items-center gap-1.5 opacity-40 pointer-events-none">
                         <img src={publicAsset('icon.svg')} alt="" className="w-4 h-4 object-contain" />
                         <span className="text-[9px] font-black tracking-tight"
                           style={{ background: 'linear-gradient(to right,#4A90D9,#2E8B7A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                           Calgary Watch
                         </span>
                       </div>
                   </div>
                </div>
             </motion.div>

             {/* CTAs (Mobile Only - Readily accessible below phone layout) */}
             <div className="flex lg:hidden flex-col sm:flex-row gap-3 mt-8 w-full max-w-sm z-10 px-2 shrink-0">
                <Button size="lg" className="bg-[#4A90D9] hover:bg-blue-500 rounded-xl px-8 h-14 text-base font-bold shadow-[0_6px_24px_rgba(74,144,217,0.35)] w-full flex-1" onClick={() => navigate('/map')}>
                  Open Live Map
                </Button>
                <Button variant="secondary" size="lg" className="bg-white/5 border border-white/15 hover:bg-white/10 rounded-xl px-8 h-14 text-base font-bold text-white w-full flex-1" onClick={() => navigate('/map?report=true')}>
                  Report an Incident
                </Button>
             </div>
          </div>
        </div>

        {/* Live ticker */}
        <div className="relative z-20 bg-slate-900/90 backdrop-blur-md border-t border-white/10 px-4 sm:px-8 py-3 flex items-center gap-4 overflow-x-auto no-scrollbar">
          <span className="inline-flex items-center gap-2 bg-[#4A90D9] text-white text-[11px] font-black uppercase tracking-widest px-3.5 py-1.5 rounded-lg shrink-0">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-white" /></span>
            Live Feed
          </span>
          <div className="flex items-center gap-5 shrink-0">
            {[
              { color: 'bg-red-500', glow: 'rgba(239,68,68,0.9)', text: '3 active alerts in Calgary' },
              { color: 'bg-amber-400', glow: 'rgba(251,191,36,0.9)', text: '12 community reports today' },
              { color: 'bg-[#2E8B7A]', glow: 'rgba(46,139,122,0.9)', text: 'All quadrants monitored · YYC' },
            ].map(({ color, glow, text }) => (
              <div key={text} className="flex items-center gap-2 shrink-0">
                <div className={`w-2 h-2 rounded-full pulse-dot ${color}`} style={{ boxShadow: `0 0 8px ${glow}` }} />
                <span className="text-xs font-medium text-slate-300 whitespace-nowrap">{text}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-600 shrink-0 ml-4 hidden sm:block">Updated in real time · Community-powered</p>
        </div>

        {/* Mountain silhouette */}
        <div ref={mountainRef} className="relative w-full -mb-1 bg-slate-950 light:bg-slate-100" aria-hidden="true">
          <MountainSilhouette className={cn('w-full text-slate-900 light:text-slate-200', 'drop-shadow-[0_-4px_24px_rgba(74,144,217,0.12)]')} />
          <div className="absolute bottom-0 left-0 right-0 h-0.5 river-flow bg-gradient-to-r from-[#2E8B7A] via-[#4A90D9] to-[#2E8B7A] opacity-50" />
        </div>
      </section>

      {/* ================================================================
          VISION SECTION
          ================================================================ */}
      <section className="relative py-16 md:py-28 lg:py-40 overflow-hidden bg-slate-950 flex items-center justify-center border-t border-b border-white/5">
        <div 
          className="absolute w-[600px] md:w-[1000px] aspect-square rounded-full bg-gradient-to-tr from-[#4A90D9]/10 via-[#2E8B7A]/5 to-[#D4A843]/10 pointer-events-none"
          style={{ background: 'radial-gradient(circle at center, rgba(74,144,217,0.08) 0%, transparent 60%)' }}
        />
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl mb-8">
            <span className="text-[10px] uppercase font-black tracking-widest text-[#4A90D9]">Vision</span>
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] text-white mb-6 md:mb-8">
            Calgary's real-time<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#D4A843] italic pr-2">urban intelligence layer.</span>
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }} className="text-lg md:text-xl lg:text-2xl text-slate-300 font-light max-w-4xl mx-auto leading-relaxed mb-6">
            Where community-reported incidents and verified public data combine to provide immediate awareness into city activity.
          </motion.p>
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 }} className="h-px w-24 bg-gradient-to-r from-transparent via-white/30 to-transparent mx-auto my-8" />
          <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.4 }} className="hidden sm:block text-sm md:text-base text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Our long-term goal is to expand beyond Calgary into a scalable platform for cities across Canada, enabling safer, more informed communities through accessible, real-time data.
          </motion.p>
        </div>
      </section>

      {/* ================================================================
          PROBLEM SECTION
          ================================================================ */}
      <section className="py-16 md:py-28 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -left-80 top-0 w-[500px] h-[500px] rounded-full opacity-[0.06]"
            style={{ background: 'radial-gradient(ellipse at center, #4A90D9 0%, transparent 70%)' }} aria-hidden="true" />
          <div className="absolute -right-80 bottom-0 w-[500px] h-[500px] rounded-full opacity-[0.06]"
            style={{ background: 'radial-gradient(ellipse at center, #2E8B7A 0%, transparent 70%)' }} aria-hidden="true" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.7 }} className="max-w-4xl mb-10 md:mb-16">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500 mb-4">The Problem</p>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight leading-[1.05] mb-5">
              The{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-red-600">
                Information Lag
              </span>
            </h2>
            <p className="text-lg text-slate-400 light:text-slate-600 leading-relaxed max-w-3xl">
              A collision on Macleod Trail. Smoke south of the Bow. Police tape in Beltline. You'll hear about it on social media - maybe - 40 minutes after everyone nearby already knew. That gap costs real decisions.
            </p>
          </motion.div>

          {/* Stats grid */}
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-px mb-16 rounded-2xl overflow-hidden border border-white/8 light:border-slate-200 bg-white/8 light:bg-slate-200">
            {[
              { value: 40, suffix: ' min', label: 'Average news lag', sub: 'after an incident occurs', color: '#ef4444', bg: 'from-red-500/8' },
              { value: 9, suffix: ' apps', label: 'Apps Calgarians check', sub: 'to piece together one incident', color: '#a855f7', bg: 'from-purple-500/8' },
              { value: 74, suffix: '%', label: 'Missed a nearby event', sub: 'due to slow information reach', color: '#f59e0b', bg: 'from-amber-500/8' },
              { value: 30, suffix: 's', prefix: '< ', label: 'Calgary Watch lag', sub: 'community report to live map', color: '#4A90D9', bg: 'from-[#4A90D9]/12' },
            ].map((stat, i) => (
              <div key={i} className={`relative bg-gradient-to-b ${stat.bg} to-transparent bg-slate-900/80 light:bg-white px-3 py-6 sm:px-6 sm:py-8 flex flex-col items-center text-center`}>
                <div className="text-3xl sm:text-4xl md:text-5xl font-black tabular-nums mb-1 tracking-tight" style={{ color: stat.color }}>
                  <AnimatedCounter to={stat.value} suffix={stat.suffix} prefix={stat.prefix ?? ''} duration={1.8 + i * 0.2} />
                </div>
                <p className="text-sm font-bold text-white light:text-slate-900 mb-0.5">{stat.label}</p>
                <p className="text-xs text-slate-500 leading-snug">{stat.sub}</p>
              </div>
            ))}
          </motion.div>

          {/* 3 editorial rows - hidden on mobile to reduce scroll length */}
          <div className="hidden md:block space-y-0 border border-white/8 light:border-slate-200 rounded-2xl overflow-hidden divide-y divide-white/8 light:divide-slate-200">
            {[
              { num: '01', tag: '30+ min delayed', tagColor: '#ef4444', title: "By the time it's in the news...", body: 'Local media reports incidents 30 or more minutes after they happen. That gap costs real decisions: a detour you could have taken, a street you would have avoided, a family member you could have warned.', icon: Radio, stat: '30+', statLabel: 'min delayed', reverse: false },
              { num: '02', tag: 'Lost in noise', tagColor: '#a855f7', title: "r/Calgary won't cut it", body: 'Critical alerts drown three pages down in memes and off-topic threads. The signal is there, somewhere, buried under noise. You need what you need, when you need it.', icon: Users, stat: '100s', statLabel: 'posts to scan', reverse: true },
              { num: '03', tag: 'Fragmented sources', tagColor: '#f59e0b', title: '9 apps. Still no answer.', body: '311, Twitter, Nextdoor, local news: each has one piece. Checking them all takes more time than the incident itself. Calgary Watch pulls every signal into a single live map.', icon: ShieldAlert, stat: '9', statLabel: 'apps to check', reverse: false },
            ].map((row, i) => (
              <motion.div key={i}
                initial={reducedMotion ? undefined : { opacity: 0, x: row.reverse ? 24 : -24 }}
                whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.6, delay: 0.05 }}
                className={`flex flex-col ${row.reverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-stretch`}>
                <div className="flex-shrink-0 md:w-48 flex flex-col items-center justify-center py-8 px-6 gap-1" style={{ background: `${row.tagColor}08` }}>
                  <span className="text-5xl md:text-6xl font-black tabular-nums leading-none" style={{ color: row.tagColor }}>{row.stat}</span>
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-1">{row.statLabel}</span>
                  <div className="mt-3 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${row.tagColor}20`, color: row.tagColor }}>
                    <row.icon size={18} />
                  </div>
                </div>
                <div className="flex-1 px-8 py-8 flex flex-col justify-center">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded w-fit mb-3" style={{ color: row.tagColor, background: `${row.tagColor}15` }}>{row.tag}</span>
                  <h3 className="text-xl md:text-2xl font-black mb-2 text-white light:text-slate-900">{row.title}</h3>
                  <p className="text-sm text-slate-400 light:text-slate-600 leading-relaxed max-w-xl">{row.body}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Solution pivot */}
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, scale: 0.97 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.65 }}
            className="mt-12 relative rounded-2xl overflow-hidden shadow-2xl border border-[#4A90D9]/25">
            <picture>
              <source srcSet={publicAsset('images/calgary3.webp')} type="image/webp" />
              <img src={publicAsset('images/calgary3.webp')} alt="Calgary skyline" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-950/40" />
            <div className="relative z-10 grid md:grid-cols-2 gap-0 min-h-[380px]">
              <div className="p-6 md:p-10 lg:p-12 flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 mb-4 w-fit">
                  <div className="w-2 h-2 rounded-full bg-[#4A90D9] shadow-[0_0_8px_#4A90D9]" />
                  <span className="text-xs font-black uppercase tracking-wider text-[#4A90D9]">The Solution</span>
                </div>
                <h3 className="text-3xl md:text-4xl font-black mb-4 leading-[1.1]">
                  Calgary Watch:<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A]">Real-time, together.</span>
                </h3>
                <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-6 max-w-md">
                  A live, community-powered incident map built specifically for this city. Calgarians report real-time incidents and they appear on the map in seconds.
                </p>
                <div className="space-y-2 mb-7">
                  {['Live updates with no lag or delay', 'Verified with CPS data and community input', 'One map, every alert, all of Calgary'].map((point, i) => (
                    <motion.div key={i} className="flex items-center gap-2.5 text-sm"
                      initial={reducedMotion ? undefined : { opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: 0.4 + i * 0.08 }}>
                      <CheckCircle2 size={15} className="text-[#4A90D9] flex-shrink-0" />
                      <span className="text-slate-300">{point}</span>
                    </motion.div>
                  ))}
                </div>
                <motion.button whileHover={!reducedMotion ? { scale: 1.04 } : undefined} whileTap={!reducedMotion ? { scale: 0.96 } : undefined} onClick={() => navigate('/map')}
                  className="w-fit rounded-xl px-7 py-3.5 bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] text-white font-bold flex items-center gap-2 cursor-pointer text-sm">
                  <MapPin size={16} />View Live Map<ArrowRight size={15} />
                </motion.button>
              </div>
              <div className="hidden md:flex flex-col items-center justify-center gap-2 px-12">
                <div className="text-[88px] font-black leading-none text-[#4A90D9] drop-shadow-[0_0_40px_rgba(74,144,217,0.55)]">
                  <AnimatedCounter to={30} suffix="s" prefix="< " duration={1.5} />
                </div>
                <p className="text-base font-bold text-white/60 text-center">From report to live map</p>
                <div className="mt-3 flex gap-2 flex-wrap justify-center">
                  {['Under 30s to report', 'Anonymous option', 'Real-time sync'].map((tag) => (
                    <span key={tag} className="text-xs px-3 py-1.5 rounded-full border border-[#4A90D9]/35 text-[#4A90D9] bg-[#4A90D9]/8 font-semibold">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          FEATURES SECTION
          ================================================================ */}
      <section className="py-16 md:py-28 px-4 sm:px-6" id="features">
        <div className="max-w-7xl mx-auto">
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6 }} className="max-w-3xl mb-10 md:mb-12">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500 mb-4">Features</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[1.06]">
              Built for how Calgarians{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#D4A843]">actually live.</span>
            </h2>
            <p className="mt-3 text-base text-slate-400 light:text-slate-600 leading-relaxed">
              Not a generic alert app. Every feature was designed around this city, its neighbourhoods, its patterns, and its people.
            </p>
          </motion.div>

          {/* Bento feature grid */}
          <div className="grid grid-cols-12 gap-3 sm:gap-4 mb-10 md:mb-12">

            {/* 01 - Live Map (wide) */}
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6 }}
              className="col-span-12 sm:col-span-7 relative rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-900 border border-white/8 min-h-[300px] flex flex-col transition-colors duration-300 hover:border-[#4A90D9]/40"
            >
              {/* Atmosphere */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 80% 40%, rgba(74,144,217,0.13) 0%, transparent 60%)' }} />
              <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(74,144,217,1) 1px,transparent 1px),linear-gradient(90deg,rgba(74,144,217,1) 1px,transparent 1px)', backgroundSize: '28px 28px' }} />

              {/* Live feed cards - right half */}
              <div className="absolute right-0 top-0 bottom-0 w-[46%] flex flex-col justify-center gap-2 px-4 pointer-events-none">
                {/* Radar rings behind feed */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  {[150, 100, 56].map((s, i) => (
                    <motion.div key={i} className="absolute rounded-full border border-[#4A90D9]/15"
                      style={{ width: s, height: s, top: -s/2, left: -s/2 }}
                      animate={reducedMotion ? {} : { scale:[1,1.14,1], opacity:[0.4,0.06,0.4] }}
                      transition={{ duration:3, delay:i*0.7, repeat:Infinity }} />
                  ))}
                  <div className="w-3 h-3 rounded-full bg-[#4A90D9] shadow-[0_0_16px_#4A90D9]">
                    <span className="absolute inset-0 rounded-full bg-[#4A90D9] animate-ping opacity-50" />
                  </div>
                </div>
                {/* Incident cards */}
                {[
                  { dot:'bg-red-500', glow:'#ef4444', label:'Major Collision · Deerfoot', time:'LIVE', timeColor:'text-red-400', bold:true },
                  { dot:'bg-amber-400', glow:'#fbbf24', label:'Road Closed · Memorial Dr', time:'4m ago', timeColor:'text-slate-500', bold:false },
                  { dot:'bg-[#2E8B7A]', glow:'#2E8B7A', label:'All Clear · Beltline', time:'12m ago', timeColor:'text-slate-600', bold:false },
                ].map((item, i) => (
                  <motion.div key={i}
                    initial={reducedMotion ? undefined : { opacity:0, x:12 }} whileInView={{ opacity: i===2 ? 0.45 : 1, x:0 }} viewport={{ once:true }} transition={{ delay:0.4+i*0.12 }}
                    className="relative z-10 bg-slate-800/75 backdrop-blur-md rounded-xl border border-white/8 px-3 py-2 shadow-lg">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.dot}`} style={{ boxShadow:`0 0 5px ${item.glow}` }} />
                      <span className="text-[10px] font-medium text-white truncate flex-1">{item.label}</span>
                      <span className={`text-[9px] font-black shrink-0 ${item.timeColor} ${item.bold ? 'animate-pulse' : ''}`}>{item.time}</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="relative z-10 p-6 sm:p-7 flex flex-col h-full w-[55%] sm:w-full">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4A90D9]/12 border border-[#4A90D9]/25 w-fit">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4A90D9] animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#4A90D9]">Real-time</span>
                </div>
                <div className="mt-auto pt-6 sm:pt-0">
                  <h3 className="text-xl font-black text-white mb-1.5 leading-tight sm:leading-normal">Live Community Map</h3>
                  <p className="text-[11px] sm:text-sm text-slate-400 leading-relaxed max-w-[24ch]">Incidents hit the map in under 30 seconds - no refresh, no lag.</p>
                </div>
                <div className="mt-5 flex items-center justify-between pt-4 border-t border-white/5">
                  <span className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Community powered</span>
                  <span className="text-2xl font-black text-[#4A90D9]">&lt;&nbsp;30s</span>
                </div>
              </div>
            </motion.div>

            {/* 02 - Neighbourhood Intelligence (narrow) */}
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6, delay: 0.08 }}
              className="col-span-12 sm:col-span-5 relative rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-900 border border-white/8 min-h-[300px] flex flex-col transition-colors duration-300 hover:border-[#2E8B7A]/40"
            >
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 85%, rgba(46,139,122,0.16) 0%, transparent 60%)' }} />

              {/* Calgary zone heatmap */}
              <div className="absolute inset-x-5 top-12 bottom-[5.5rem] pointer-events-none">
                <div className="grid grid-cols-3 grid-rows-2 gap-1.5 h-full">
                  {[
                    { z:'NW', v:0.45, c:'#2E8B7A' }, { z:'N',  v:0.72, c:'#4A90D9' }, { z:'NE', v:0.55, c:'#2E8B7A' },
                    { z:'SW', v:0.88, c:'#D4A843' }, { z:'S',  v:0.32, c:'#2E8B7A' }, { z:'SE', v:0.60, c:'#4A90D9' },
                  ].map((zone, i) => (
                    <motion.div key={zone.z}
                      className="rounded-xl flex items-center justify-center relative overflow-hidden"
                      style={{ background:`${zone.c}${Math.round(zone.v*28).toString(16).padStart(2,'0')}`, border:`1px solid ${zone.c}22` }}
                      initial={{ opacity:0, scale:0.85 }} whileInView={{ opacity:1, scale:1 }} viewport={{ once:true }}
                      transition={{ delay:0.25+i*0.07 }}>
                      <span className="text-[9px] font-black tracking-wide" style={{ color:`${zone.c}cc` }}>{zone.z}</span>
                      <div className="absolute bottom-1 right-1.5 text-[7px] font-bold text-white/30">{Math.round(zone.v*100)}%</div>
                    </motion.div>
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-[11px] font-black text-white/5 tracking-[0.3em]">YYC</span>
                </div>
              </div>

              <div className="relative z-10 p-6 sm:p-7 flex flex-col h-full">
                <div className="w-9 h-9 rounded-xl bg-[#2E8B7A]/15 border border-[#2E8B7A]/25 flex items-center justify-center">
                  <BarChart2 size={16} style={{ color:'#2E8B7A' }} />
                </div>
                <div className="mt-auto">
                  <h3 className="text-xl font-black text-white mb-1.5">Neighbourhood Intelligence</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">Safety trends and incident history by quadrant - live.</p>
                </div>
              </div>
            </motion.div>

            {/* 03 - Verified Data (narrow) */}
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6, delay: 0.14 }}
              className="col-span-12 sm:col-span-5 relative rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-900 border border-white/8 min-h-[300px] flex flex-col transition-colors duration-300 hover:border-[#D4A843]/40"
            >
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 85% 15%, rgba(212,168,67,0.12) 0%, transparent 55%)' }} />

              {/* Verification pipeline visual */}
              <div className="absolute inset-x-5 top-12 bottom-[5.5rem] flex flex-col justify-center gap-3 pointer-events-none">
                {[
                  { label:'CPS Open Data',   icon: ShieldCheck,   color:'#D4A843', status:'Verified' },
                  { label:'Community Input', icon: Users,          color:'#4A90D9', status:'Confirmed' },
                  { label:'Admin Review',    icon: CheckCircle2,   color:'#2E8B7A', status:'Reviewed' },
                ].map((step, i) => (
                  <motion.div key={step.label}
                    className="flex items-center gap-2.5"
                    initial={reducedMotion ? undefined : { opacity:0, x:-10 }} whileInView={{ opacity:1, x:0 }} viewport={{ once:true }}
                    transition={{ delay:0.3+i*0.12 }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background:`${step.color}15`, border:`1px solid ${step.color}30` }}>
                      <step.icon size={14} style={{ color:step.color }} />
                    </div>
                    <div className="flex-1 h-px" style={{ background:`linear-gradient(to right,${step.color}35,transparent)` }} />
                    <span className="text-[9px] font-black uppercase tracking-wide shrink-0" style={{ color:step.color }}>✓ {step.status}</span>
                  </motion.div>
                ))}
              </div>

              <div className="relative z-10 p-6 sm:p-7 flex flex-col h-full">
                <div className="flex gap-1.5">
                  {['CPS Data','Community','Admin'].map((tag) => (
                    <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full border"
                      style={{ background:'rgba(212,168,67,0.08)', color:'#D4A843', borderColor:'rgba(212,168,67,0.22)' }}>{tag}</span>
                  ))}
                </div>
                <div className="mt-auto">
                  <h3 className="text-xl font-black text-white mb-1.5">Source-Verified Reports</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">Every incident shows its source - community or cross-referenced CPS data.</p>
                </div>
              </div>
            </motion.div>

            {/* 04 - Post Anonymously (wide) */}
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.6, delay: 0.2 }}
              className="col-span-12 sm:col-span-7 relative rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-900 border border-white/8 min-h-[300px] flex flex-col transition-colors duration-300 hover:border-purple-500/40"
            >
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 15% 55%, rgba(139,92,246,0.10) 0%, transparent 55%)' }} />

              {/* Redacted report doc */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 w-[44%] pointer-events-none select-none">
                <div className="bg-slate-800/70 backdrop-blur-sm rounded-2xl border border-white/8 p-4 shadow-2xl">
                  <div className="text-[8px] font-mono text-slate-500 mb-3 uppercase tracking-widest border-b border-white/5 pb-2">Incident Report</div>
                  {[
                    { label:'Reporter ID', bars: 9 },
                    { label:'Location',    bars: 7 },
                    { label:'Contact',     bars: 11 },
                  ].map((row) => (
                    <div key={row.label} className="mb-2.5">
                      <div className="text-[7px] text-slate-600 mb-1 uppercase tracking-wider">{row.label}</div>
                      <div className="h-5 rounded-lg flex items-center px-2.5" style={{ background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.18)' }}>
                        <span className="text-[9px] font-mono text-purple-400/50">{'█'.repeat(row.bars)}</span>
                      </div>
                    </div>
                  ))}
                  <motion.div className="mt-3 flex justify-end"
                    animate={reducedMotion ? {} : { scale:[1,1.04,1] }} transition={{ duration:2, repeat:Infinity }}>
                    <div className="px-2.5 py-1 rounded-lg border-2 text-[8px] font-black tracking-widest uppercase rotate-[-6deg]"
                      style={{ borderColor:'rgba(139,92,246,0.45)', color:'#a78bfa', background:'rgba(139,92,246,0.08)' }}>
                      Anonymous
                    </div>
                  </motion.div>
                </div>
              </div>

              <div className="relative z-10 p-6 sm:p-7 flex flex-col h-full w-[55%] sm:w-full">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full w-fit" style={{ background:'rgba(139,92,246,0.10)', border:'1px solid rgba(139,92,246,0.22)' }}>
                  <Lock size={10} className="text-purple-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">Privacy First</span>
                </div>
                <div className="mt-auto pt-6 sm:pt-0">
                  <h3 className="text-xl font-black text-white mb-1.5 leading-tight sm:leading-normal">Post Anonymously</h3>
                  <p className="text-[11px] sm:text-sm text-slate-400 leading-relaxed max-w-[26ch]">Report anything sensitive with zero identity attached. Yours by default.</p>
                </div>
                <div className="mt-5 pt-4 border-t border-white/5">
                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">100% Optional Identity</span>
                </div>
              </div>
            </motion.div>

          </div>

          {/* Real Calgary scenarios - hidden on mobile */}
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.65, delay: 0.15 }}
            className="hidden md:block rounded-2xl border border-white/10 light:border-slate-200 overflow-hidden shadow-xl">
            <div className="grid md:grid-cols-2 gap-0">
              <div className="relative h-48 md:h-full overflow-hidden">
                <motion.img src={publicAsset('images/calgary1.webp')} alt="Calgary neighbourhood" className="w-full h-full object-cover" loading="lazy" whileHover={!reducedMotion ? { scale: 1.04 } : undefined} transition={{ duration: 0.5 }} />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/60 to-transparent" />
              </div>
              <div className="p-6 md:p-8 lg:p-12 flex flex-col justify-center bg-slate-900/60 light:bg-white">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#4A90D9] mb-4">Real Calgary situations</p>
                <h3 className="text-2xl md:text-3xl font-black mb-4 light:text-slate-900">Built for this city</h3>
                <p className="text-sm text-slate-300 light:text-slate-700 leading-relaxed mb-5">
                  Rerouting around a Deerfoot closure. Checking your kids' walk home from school. Wondering why the helicopter is circling your block. Calgary Watch gives you the answer before anyone else does.
                </p>
                <div className="space-y-2.5 mb-6">
                  {['Traffic delays and road closures', 'Safety alerts for neighbourhoods', 'Emergency and incident tracking'].map((point, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle2 size={15} className="text-[#4A90D9] flex-shrink-0" />
                      <span className="text-slate-300 light:text-slate-700">{point}</span>
                    </div>
                  ))}
                </div>
                <motion.button whileHover={!reducedMotion ? { scale: 1.04 } : undefined} whileTap={!reducedMotion ? { scale: 0.96 } : undefined} onClick={() => navigate('/map')}
                  className="w-fit rounded-xl px-6 py-3 bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] text-white font-bold flex items-center gap-2 cursor-pointer text-sm">
                  <MapPin size={15} />Try Now<ArrowRight size={14} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          MOBILE EXPERIENCE SECTION
          ================================================================ */}
      <section className="py-12 md:py-24 px-4 sm:px-6 border-t border-white/5 light:border-slate-200 bg-slate-950 light:bg-slate-50 overflow-hidden">
        <div className="max-w-7xl mx-auto">

          {/* Mobile: compact 2×2 feature grid only */}
          <div className="md:hidden">
            <div className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Mobile First</p>
              <h2 className="text-2xl font-black tracking-tight leading-tight">Built for one-handed use</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Layers, title: 'Bottom Sheet', desc: 'Swipe-driven browsing', color: '#8B5CF6' },
                { icon: Zap,    title: 'Instant Post', desc: 'Under 30s to submit',  color: '#4A90D9' },
                { icon: MapIcon,title: 'Fluid Maps',   desc: 'Hardware panning',     color: '#2E8B7A' },
                { icon: Lock,   title: 'No Install',   desc: 'Direct from browser',  color: '#D4A843' },
              ].map((item, i) => (
                <motion.div key={i}
                  initial={reducedMotion ? undefined : { opacity:0, y:16 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }} transition={{ delay:i*0.07 }}
                  className="flex flex-col gap-2 p-4 rounded-2xl border border-white/8 bg-slate-900/60">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:`${item.color}18`, border:`1px solid ${item.color}30` }}>
                    <item.icon size={16} style={{ color:item.color }} />
                  </div>
                  <h4 className="text-white font-bold text-sm leading-tight">{item.title}</h4>
                  <p className="text-[11px] text-slate-500 leading-tight">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Desktop: original two-column layout */}
          <div className="hidden md:grid md:grid-cols-2 gap-16 items-center">
            <motion.div initial={reducedMotion ? undefined : { opacity: 0, x: -24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-purple-500/10 border border-purple-500/20 mb-6">
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Mobile First Layout</span>
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] mb-6">
                Optimized for real-time usage on the go
              </h2>
              <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-xl">
                Calgary Watch uses a modern bottom-sheet interface designed for quick, one-handed use. It feels like a native app right in your browser.
              </p>
              <div className="grid sm:grid-cols-2 gap-5">
                {[
                  { icon: Layers, title: 'Bottom Sheet UI', desc: 'Gesture-driven incident browsing', color: '#8B5CF6' },
                  { icon: Zap,    title: 'Instant Submit',  desc: 'Optimistic UI updates avoid lag',  color: '#4A90D9' },
                  { icon: MapIcon,title: 'Fluid Maps',      desc: 'Hardware-accelerated panning',     color: '#2E8B7A' },
                  { icon: Lock,   title: 'No App Required', desc: 'Instant access via web browser',   color: '#D4A843' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background:`${item.color}15`, border:`1px solid ${item.color}25` }}>
                      <item.icon size={16} style={{ color:item.color }} />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-sm">{item.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
            <div className="relative flex justify-center perspective-[1200px]">
              <motion.div style={{ rotateY:-15, rotateX:5 }} whileHover={{ rotateY:0, rotateX:0, scale:1.05 }} transition={{ type:'spring', stiffness:100, damping:20 }}
                className="relative w-full max-w-[320px] aspect-[9/19] rounded-[2.5rem] border-[8px] border-slate-900 bg-slate-950 shadow-[-30px_30px_80px_rgba(168,85,247,0.2)] overflow-hidden ring-1 ring-white/10">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-30" />
                <div className="absolute inset-0 bg-slate-900"><img src={publicAsset('images/calgary7.webp')} className="w-full h-full object-cover opacity-60 mix-blend-screen" alt="" /></div>
                <div className="absolute top-16 left-4 right-4 flex gap-2 z-20">
                  <div className="h-10 flex-1 bg-white/10 backdrop-blur-md rounded-xl border border-white/20" />
                  <div className="h-10 w-10 bg-white/10 backdrop-blur-md rounded-xl border border-white/20" />
                </div>
                <motion.div animate={{ y:[0,-8,0] }} transition={{ repeat:Infinity, duration:4 }} className="absolute bottom-40 right-4 w-12 h-12 bg-purple-500 rounded-full z-20 flex items-center justify-center shadow-lg shadow-purple-500/40">
                  <Zap size={20} className="text-white" />
                </motion.div>
                <div className="absolute bottom-0 left-0 right-0 h-[35%] bg-slate-900/95 backdrop-blur-xl rounded-t-3xl border-t border-white/20 p-5 z-20">
                  <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-4" />
                  <div className="h-4 w-2/3 bg-white/10 rounded-md mb-3" />
                  <div className="h-4 w-1/2 bg-white/10 rounded-md mb-4" />
                  <div className="flex gap-3">
                    <div className="h-10 flex-1 bg-blue-500/20 rounded-xl border border-blue-500/50" />
                    <div className="h-10 flex-1 bg-teal-500/20 rounded-xl border border-teal-500/50" />
                  </div>
                </div>
              </motion.div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 -z-10 rounded-full"
                style={{ background: 'radial-gradient(ellipse at center, rgba(168,85,247,0.25) 0%, transparent 70%)' }} />
            </div>
          </div>

        </div>
      </section>

      {/* ================================================================
          HOW IT WORKS
          ================================================================ */}
      <section className="py-16 md:py-28 px-4 sm:px-6 relative overflow-hidden" id="how-it-works">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 opacity-[0.035] light:opacity-[0.025]" style={{ backgroundImage: 'linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px)', backgroundSize: '72px 72px' }} aria-hidden="true" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6 }} className="mb-10 md:mb-16">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500 mb-4">Workflow</p>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight leading-[1.05] mb-3">How it Works</h2>
            <p className="text-lg text-slate-400 light:text-slate-600 leading-relaxed max-w-xl">Three fast steps for live local awareness.</p>
          </motion.div>

          {/* Mobile: horizontal snap-scroll steps */}
          <div className="lg:hidden -mx-4 px-4 flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2">
            {([
              { step:'01', Icon:MapPin,    title:'Spot it. Tap it.', desc:'Pick a category, drop a pin, add a note. Under 30 seconds. Anonymous if you prefer.', accentColor:'#4A90D9', metric:'< 30s', metricLabel:'report time' },
              { step:'02', Icon:Zap,       title:'Live in seconds.', desc:'Your report hits the map instantly. No queue, no moderation lag. Everyone sees it now.', accentColor:'#2E8B7A', metric:'< 2s',  metricLabel:'to appear' },
              { step:'03', Icon:BarChart2, title:'Context surfaces.', desc:'History, safety scores, and verified CPS data appear around every incident automatically.', accentColor:'#D4A843', metric:'100+', metricLabel:'data points' },
            ] as const).map((item, i) => (
              <div key={item.step} className="snap-start shrink-0 w-[78vw] max-w-[300px] rounded-2xl border overflow-hidden bg-slate-900/80" style={{ borderColor:`${item.accentColor}22` }}>
                <div className="px-5 pt-5 pb-4 flex flex-col gap-3" style={{ background:`linear-gradient(160deg,${item.accentColor}10 0%,transparent 60%)` }}>
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background:`${item.accentColor}18`, border:`1.5px solid ${item.accentColor}35` }}>
                      <item.Icon size={22} style={{ color:item.accentColor }} />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ color:item.accentColor, background:`${item.accentColor}12`, border:`1px solid ${item.accentColor}22` }}>Step {item.step}</span>
                  </div>
                  <div>
                    <span className="text-2xl font-black" style={{ color:item.accentColor }}>{item.metric}</span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest ml-2">{item.metricLabel}</span>
                  </div>
                </div>
                <div className="px-5 pb-5 pt-3">
                  <h3 className="text-base font-black text-white mb-1.5">{item.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: original 3-col grid */}
          <div className="hidden lg:block relative">
            <div className="absolute top-[4.5rem] left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-px pointer-events-none"
              style={{ background: 'linear-gradient(to right, #4A90D9, #2E8B7A, #D4A843)' }} aria-hidden="true" />
            <div className="grid lg:grid-cols-3 gap-5">
              {([
                { step:'01', Icon:MapPin,    title:'Spot it. Tap it. Done.', desc:'Pick a category, drop a pin on the map, and add a quick note. Under 30 seconds. Post anonymously if you prefer.', accentColor:'#4A90D9', metric:'< 30s', metricLabel:'Average report time', facts:['7 incident categories','Anonymous option','One tap to submit'] },
                { step:'02', Icon:Zap,       title:'Live in seconds.', desc:"Your report appears on the map the moment it's submitted. No moderation queue, no delay. Everyone watching that area sees it instantly.", accentColor:'#2E8B7A', metric:'< 2s', metricLabel:'Time to appear on map', facts:['Real-time Firestore sync','Push to all active users','Zero moderation lag'] },
                { step:'03', Icon:BarChart2, title:'Context tells the full story.', desc:"Neighbourhood history, safety trends, and verified police data surface automatically around every incident, so you understand what's actually happening.", accentColor:'#D4A843', metric:'100+', metricLabel:'Data points per area', facts:['CPS verified data layer','Historical trend charts','Safety score per zone'] },
              ] as const).map((item, i) => (
                <motion.div key={item.step}
                  initial={reducedMotion ? undefined : { opacity:0, y:32 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, amount:0.2 }} transition={{ duration:0.6, delay:i*0.12 }}
                  className="group relative">
                  <div className="relative h-full flex flex-col rounded-2xl border overflow-hidden shadow-lg bg-slate-900/60 light:bg-white" style={{ borderColor:`${item.accentColor}22` }}>
                    <div className="relative flex flex-col items-center justify-center gap-4 px-8 py-10 overflow-hidden" style={{ background:`linear-gradient(160deg,${item.accentColor}10 0%,transparent 60%)` }}>
                      <span className="absolute right-4 top-3 text-[5rem] font-black leading-none select-none pointer-events-none" style={{ color:item.accentColor, opacity:0.07 }}>{item.step}</span>
                      {!reducedMotion && (<>
                        <motion.div className="absolute w-32 h-32 rounded-full pointer-events-none" style={{ border:`1px solid ${item.accentColor}20` }} animate={{ scale:[1,1.2,1], opacity:[0.4,0.1,0.4] }} transition={{ duration:3.5, repeat:Infinity, delay:i*0.6 }} />
                        <motion.div className="absolute w-20 h-20 rounded-full pointer-events-none" style={{ border:`1px solid ${item.accentColor}35` }} animate={{ scale:[1,1.3,1], opacity:[0.5,0.15,0.5] }} transition={{ duration:2.8, repeat:Infinity, delay:i*0.6+0.4 }} />
                      </>)}
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center z-20 border-2 border-slate-950" style={{ background:item.accentColor }}>
                        <CheckCircle2 size={11} className="text-white" />
                      </div>
                      <motion.div className="relative z-10 w-18 h-18 rounded-2xl flex items-center justify-center"
                        style={{ background:`linear-gradient(135deg,${item.accentColor}20,${item.accentColor}08)`, border:`1.5px solid ${item.accentColor}40`, boxShadow:`0 6px 24px ${item.accentColor}15` }}
                        whileHover={!reducedMotion ? { scale:1.08 } : undefined}>
                        <item.Icon size={32} style={{ color:item.accentColor }} strokeWidth={1.6} />
                      </motion.div>
                      <div className="relative z-10 text-center">
                        <span className="block text-2xl font-black" style={{ color:item.accentColor }}>{item.metric}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{item.metricLabel}</span>
                      </div>
                    </div>
                    <div className="flex flex-col flex-1 p-6 gap-3">
                      <div className="flex items-center gap-2">
                        <motion.div className="h-0.5 rounded-full" style={{ background:item.accentColor }} initial={{ width:0 }} whileInView={{ width:20 }} viewport={{ once:true }} transition={{ duration:0.45, delay:i*0.12+0.15 }} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color:item.accentColor }}>Step {item.step}</span>
                      </div>
                      <h3 className="text-base font-black text-white leading-snug">{item.title}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed flex-1">{item.desc}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {item.facts.map((fact) => (
                          <span key={fact} className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background:`${item.accentColor}10`, color:item.accentColor, border:`1px solid ${item.accentColor}22` }}>{fact}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.6, delay: 0.3 }} className="mt-14 text-center">
            <p className="text-base text-slate-400 light:text-slate-600 mb-5">Ready to make Calgary smarter together?</p>
            <motion.button whileHover={!reducedMotion ? { scale: 1.04, boxShadow: '0 20px 50px rgba(74,144,217,0.35)' } : undefined} whileTap={!reducedMotion ? { scale: 0.96 } : undefined} onClick={() => navigate('/map')}
              className="rounded-xl px-10 py-4 bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#8B5CF6] text-white font-bold transition-all flex items-center gap-2 cursor-pointer mx-auto text-base shadow-lg">
              <MapPin size={18} />Start Reporting<ArrowRight size={16} />
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          ROADMAP & SUSTAINABILITY
          ================================================================ */}
      <section className="py-16 md:py-24 px-4 sm:px-6 border-t border-white/5 light:border-slate-200 bg-slate-900/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_350px] gap-8">
            {/* Roadmap */}
            <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }}>
              <span className="inline-block px-3 py-1 rounded bg-[#2E8B7A]/10 text-[10px] font-black uppercase tracking-[0.25em] text-[#2E8B7A] mb-4">Scalability Roadmap</span>
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight leading-[1.1] mb-6 md:mb-8">Building the app &amp; beyond</h2>

              {/* Mobile: compact timeline */}
              <div className="sm:hidden space-y-0 border border-white/8 rounded-2xl overflow-hidden divide-y divide-white/8">
                {[
                  { phase:'01', title:'Calgary Launch',  color:'#2E8B7A', active:true  },
                  { phase:'02', title:'Native App',      color:'#4A90D9', active:false },
                  { phase:'03', title:'More Cities',     color:'#D4A843', active:false },
                  { phase:'04', title:'Enterprise',      color:'#8B5CF6', active:false },
                ].map((p) => (
                  <div key={p.phase} className="flex items-center gap-4 px-4 py-3.5" style={{ background: p.active ? `${p.color}08` : 'transparent' }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black" style={{ background:`${p.color}18`, color:p.color, border:`1px solid ${p.color}30` }}>{p.phase}</div>
                    <span className="text-sm font-bold text-white flex-1">{p.title}</span>
                    {p.active && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ color:p.color, background:`${p.color}15` }}>Live</span>}
                  </div>
                ))}
              </div>

              {/* Desktop: 2×2 card grid */}
              <div className="hidden sm:grid sm:grid-cols-2 gap-4">
                {[
                  { phase: '01', title: 'Calgary Launch', items: ['Calgary-only launch', 'Real-time incident reporting', 'Community engagement'], active: true },
                  { phase: '02', title: 'Native App', items: ['iOS & Android app', 'Push notifications for alerts', 'Enhanced credibility system'], active: false },
                  { phase: '03', title: 'More Cities', items: ['Multi-city expansion', 'City demand onboarding', 'Advanced data APIs'], active: false },
                  { phase: '04', title: 'Enterprise', items: ['Public safety insights', 'Data business partnerships', 'Premium custom alerts'], active: false }
                ].map((p, i) => (
                  <motion.div whileHover={{ y: -4, scale: 1.01 }} key={i} className={`relative p-6 rounded-[2rem] border overflow-hidden ${p.active ? 'border-[#2E8B7A]/50 bg-gradient-to-br from-[#2E8B7A]/10 to-transparent' : 'border-white/5 light:border-slate-200 bg-white/5 light:bg-slate-50'}`}>
                    <div className="absolute -top-4 -right-4 text-7xl font-black text-slate-800/10 light:text-slate-200/50 pointer-events-none">{p.phase}</div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${p.active ? 'text-[#2E8B7A]' : 'text-slate-500'}`}>Phase {p.phase}</span>
                    <h4 className="text-lg font-black mt-2 mb-4 text-white light:text-slate-900">{p.title}</h4>
                    <ul className="space-y-2">
                      {p.items.map(item => (
                        <li key={item} className="text-[13px] text-slate-400 light:text-slate-600 flex items-start gap-2">
                          <CheckCircle2 size={14} className={p.active ? "text-[#2E8B7A] shrink-0 mt-0.5" : "text-slate-600 shrink-0 mt-0.5"} />
                          <span className="leading-tight">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Sustainability Glass Card */}
            <motion.div initial={reducedMotion ? undefined : { opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ delay: 0.2 }} className="flex flex-col h-full">
              <div className="h-full mt-10 lg:mt-0 p-8 rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-900 to-[#D4A843]/10 border border-[#D4A843]/30 shadow-[0_0_50px_rgba(212,168,67,0.1)] relative overflow-hidden flex flex-col">
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full"
                  style={{ background: 'radial-gradient(ellipse at top right, rgba(212,168,67,0.22) 0%, transparent 70%)' }} />
                <div className="w-14 h-14 rounded-2xl bg-[#D4A843]/20 border border-[#D4A843]/40 flex items-center justify-center mb-6 backdrop-blur-md">
                   <Briefcase className="text-[#D4A843]" size={24} />
                </div>
                <h3 className="text-2xl font-black mb-3 text-white">Sustainability</h3>
                <p className="text-sm text-slate-300 leading-relaxed mb-4 flex-1">
                  Calgary Watch is a non-profit initiative. We're seeking investors and funding partners to build the native app and scale to more cities.
                </p>
                <div className="space-y-3 mb-4 bg-slate-950/50 p-4 rounded-xl border border-white/5">
                  {['Native iOS & Android app', 'Investor & grant partnerships', 'Local business sponsorships'].map(i => (
                    <div key={i} className="text-sm font-medium text-slate-200 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[#D4A843] rounded-full" />{i}</div>
                  ))}
                </div>
                <a
                  href="mailto:jorti104@mtroyal.ca?subject=Investment%20Inquiry%20-%20Calgary%20Watch"
                  className="text-xs uppercase tracking-widest font-bold text-[#D4A843] bg-[#D4A843]/10 py-2 px-3 rounded text-center border border-[#D4A843]/20 mt-auto hover:bg-[#D4A843]/20 transition-colors block"
                >
                  Reach Out About Investing
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ================================================================
          TRUST, TRANSPARENCY & LEGAL
          ================================================================ */}
      <section className="py-16 md:py-24 px-4 sm:px-6 bg-slate-950 border-t border-white/5 relative overflow-hidden">
        {/* Terminal/Hacker Grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
        
        <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} className="relative z-10 max-w-6xl mx-auto">
          <div className="flex flex-col items-center mb-10 md:mb-16">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
               <ShieldCheck size={28} className="text-blue-400" />
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight leading-[1] text-white text-center mb-4">
              Security & Transparency
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl text-center font-mono text-sm">
              [SYSTEM_INTEGRITY: OK] Calgary Watch distinguishes data layers to protect users and ensure trust.
            </p>
          </div>

          <div className="hidden md:grid lg:grid-cols-2 gap-6 mb-8">
            {/* Realtime Data Box */}
            <div className="p-5 sm:p-8 rounded-2xl md:rounded-[2rem] bg-slate-900 border border-white/10 group hover:border-[#4A90D9]/50 transition-colors">
              <div className="flex items-center justify-between mb-6">
                 <h3 className="text-2xl font-black text-white">Community Engine</h3>
                 <span className="px-3 py-1 bg-[#4A90D9]/10 text-[#4A90D9] text-[10px] uppercase font-black tracking-widest rounded-full border border-[#4A90D9]/20">Real-Time</span>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start gap-4"><div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-white/5"><Users size={14} className="text-slate-400" /></div><div><p className="text-sm font-bold text-white mb-1">User Submitted</p><p className="text-xs text-slate-400">Reports appear instantly. May be unverified at the time of posting.</p></div></li>
                <li className="flex items-start gap-4"><div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-white/5"><ShieldCheck size={14} className="text-slate-400" /></div><div><p className="text-sm font-bold text-white mb-2">Trust Indicators</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[10px] font-mono border border-slate-700">Unverified</span>
                    <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-[10px] font-mono border border-blue-500/20">Multiple Reports</span>
                    <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded text-[10px] font-mono border border-green-500/20">Community Confirmed</span>
                  </div>
                </div></li>
              </ul>
            </div>

            {/* Official Data Box */}
            <div className="p-5 sm:p-8 rounded-2xl md:rounded-[2rem] bg-slate-900 border border-white/10 group hover:border-[#2E8B7A]/50 transition-colors">
              <div className="flex items-center justify-between mb-6">
                 <h3 className="text-2xl font-black text-white">Official Data</h3>
                 <span className="px-3 py-1 bg-[#2E8B7A]/10 text-[#2E8B7A] text-[10px] uppercase font-black tracking-widest rounded-full border border-[#2E8B7A]/20">Verified</span>
              </div>
              <ul className="space-y-4">
                <li className="flex items-start gap-4"><div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-white/5"><ShieldCheck size={14} className="text-slate-400" /></div><div><p className="text-sm font-bold text-white mb-1">Calgary Police Service</p><p className="text-xs text-slate-400">Sourced from open datasets. Not intended to represent or replace emergency services.</p></div></li>
                <li className="flex items-start gap-4"><div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-white/5"><Clock size={14} className="text-slate-400" /></div><div><p className="text-sm font-bold text-white mb-1">Periodic Sync</p><p className="text-xs text-slate-400">Aggregated at the community level. Updated periodically (not real-time).</p></div></li>
              </ul>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="p-6 rounded-3xl bg-red-500/5 border border-red-500/20 backdrop-blur-sm hover:bg-red-500/10 transition-colors">
              <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider mb-3 text-red-400"><ShieldAlert size={14}/> Disclaimer</h4>
              <p className="text-[11px] text-slate-400 font-mono mb-2">User-generated content is not independently verified. Information may be inaccurate.</p>
              <p className="text-[11px] font-bold text-red-400 font-mono mt-4">DO NOT RELY ON CALGARY WATCH FOR EMERGENCY RESPONSE. ALWAYS CALL 911.</p>
            </div>
            <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl pointer-events-none" />
              <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider mb-3 text-white"><Lock size={14}/> Privacy Focus</h4>
              <ul className="space-y-2">
                {['Anonymous reporting supported', 'Emails are strictly hidden', 'Data collection minimized'].map(t => (
                  <li key={t} className="text-[11px] text-slate-400 font-mono flex gap-2"><span className="text-green-400">{'>'}</span> {t}</li>
                ))}
              </ul>
            </div>
            <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 backdrop-blur-sm">
              <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider mb-3 text-white"><AlertCircle size={14}/> Limitations</h4>
              <ul className="space-y-2">
                {['Official data lags live events', 'Underreporting by area', 'Map density varies by source'].map(t => (
                  <li key={t} className="text-[11px] text-slate-400 font-mono flex gap-2"><span className="text-amber-400">{'>'}</span> {t}</li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ================================================================
          FINAL CTA
          ================================================================ */}
      <section className="py-12 md:py-24 px-4 sm:px-6">
        <motion.div initial={reducedMotion ? undefined : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55 }}
          className="max-w-6xl mx-auto relative overflow-hidden rounded-2xl md:rounded-[2.5rem] border border-white/10 light:border-slate-300 bg-slate-900/70 light:bg-white px-6 py-10 md:px-12 md:py-14">
          <img src={publicAsset('images/calgary8.webp')} alt="" loading="lazy" decoding="async" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-8 light:opacity-5" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 10% 15%,rgba(46,139,122,0.12),transparent 35%),radial-gradient(circle at 90% 85%,rgba(74,144,217,0.12),transparent 45%)' }} aria-hidden="true" />
          <div className="relative z-10 grid lg:grid-cols-[1.2fr_auto] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 light:border-slate-300 bg-white/5 light:bg-slate-50 mb-5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 light:text-slate-600">Live Community Network</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight leading-[1.06] max-w-3xl light:text-slate-900">
                Join Calgary's real-time awareness network.
              </h2>
              <p className="mt-4 text-sm md:text-base text-slate-400 light:text-slate-600 leading-relaxed max-w-2xl">
                Open the city map to monitor incidents in motion, or add your report to strengthen neighbourhood awareness for everyone.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:min-w-[15rem]">
              <Button size="lg" className="h-13 px-8 rounded-2xl text-base font-black w-full" style={{ background: 'linear-gradient(135deg,#4A90D9 0%,#2E8B7A 100%)', boxShadow: '0 10px 30px -14px rgba(74,144,217,0.7)' }} onClick={() => navigate('/map')}>
                Open Live Map
              </Button>
              <Button variant="secondary" size="lg" className="h-13 px-8 rounded-2xl bg-white/8 light:bg-white border border-white/15 light:border-slate-300 hover:bg-white/12 light:hover:bg-slate-100 text-base font-black text-white light:text-slate-900 w-full" onClick={() => navigate('/map?report=true')}>
                Submit Report
              </Button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ================================================================
          CITY EXPANSION REQUEST
          ================================================================ */}
      <section className="py-12 md:py-16 px-4 sm:px-6 border-t border-white/5 light:border-slate-200">
        <div className="max-w-md mx-auto text-center space-y-5">
          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Want this in your city?</h4>
          <div className="flex gap-2">
            <label htmlFor="city-request-input" className="sr-only">Enter your city name</label>
            <input id="city-request-input" type="text" placeholder="Enter your city name" value={cityRequest} maxLength={100}
              onChange={(e) => setCityRequest(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCityRequest(); } }}
              className="flex-1 bg-white/5 light:bg-white border border-white/10 light:border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9] light:text-slate-900" />
            <Button onClick={() => void handleCityRequest()} disabled={isSubmittingCityRequest} className="bg-white text-slate-950 hover:bg-slate-200 rounded-xl px-5 font-bold disabled:opacity-60 text-sm">
              {isSubmittingCityRequest ? 'Sending...' : 'Request'}
            </Button>
          </div>
          {cityRequestMessage && <p className="text-xs text-emerald-400 font-semibold">{cityRequestMessage}</p>}
          <p className="text-[10px] text-slate-600">In demand: Edmonton (420), Vancouver (310), Toronto (280)</p>
        </div>
      </section>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <footer className="py-10 px-4 sm:px-6 border-t border-white/5 light:border-slate-200 bg-slate-950 light:bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="text-[#4A90D9]" size={20} />
            <span className="text-base font-bold tracking-tight light:text-slate-900">Calgary Watch</span>
          </div>
          <div className="flex gap-6 text-sm text-slate-500 light:text-slate-500">
            <button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-white light:hover:text-slate-900 transition-colors">Privacy</button>
            <button type="button" onClick={() => setLegalModal('terms')} className="hover:text-white light:hover:text-slate-900 transition-colors">Terms</button>
            <button type="button" onClick={() => setLegalModal('contact')} className="hover:text-white light:hover:text-slate-900 transition-colors">Contact</button>
          </div>
          <p className="text-xs text-slate-600 light:text-slate-400">&copy; 2026 Calgary Watch. Community Safety Platform.</p>
        </div>
        <div className="max-w-7xl mx-auto mt-6 p-3 bg-red-500/5 light:bg-red-50 border border-red-500/8 light:border-red-200 rounded-2xl text-center">
          <p className="text-[10px] text-red-400/70 uppercase font-bold tracking-widest">Disclaimer: User-generated content. Always verify with official sources before taking action.</p>
        </div>
      </footer>

      {/* Legal modal */}
      <AnimatePresence>
        {legalModal && <LegalModal legalModal={legalModal} onClose={() => setLegalModal(null)} />}
      </AnimatePresence>
    </div>
  );
}
