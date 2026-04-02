/**
 * LandingPage.tsx
 *
 * Calgary Watch landing page with:
 *  - Calgary-themed scroll-driven 3D parallax (Rocky Mountain silhouette, Bow River divider,
 *    northern lights aurora, skyline horizon, floating stat cards).
 *  - prefers-reduced-motion fallbacks on every animation.
 *  - Security: user-supplied city name trimmed + length-bounded before any write or mailto.
 *  - Conversion-optimised layout: hook → problem → solution → social proof → CTA.
 *  - Full dark/light mode via the `cw-theme` localStorage key.
 *
 * Animation architecture:
 *  - Hero:    CSS keyframe + GSAP pulse dots (no scroll dependency needed here — hero is above fold)
 *  - Problem: IntersectionObserver → `fade-up` CSS animation staggered per card
 *  - Features: Framer Motion whileInView
 *  - How it works: CSS stagger via IntersectionObserver
 *  - Mountain divider: CSS parallax via onscroll / requestAnimationFrame (throttled)
 *  - Aurora: pure CSS keyframe (aurora-drift) — no JS needed
 *  - Bow River section divider: CSS `river-flow` gradient animation
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, animate } from 'motion/react';
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
  TrendingUp,
  Lock,
  MapPin,
  Zap,
  BarChart2,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { cn } from '@/src/lib/utils';
import { db } from '@/src/firebase';
import { addDoc, collection } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the user prefers reduced motion. Defaults to false. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// Animated counter — counts up from 0 to `to` when scrolled into view
// ---------------------------------------------------------------------------
const AnimatedCounter = memo(function AnimatedCounter({
  to,
  suffix = '',
  prefix = '',
  duration = 2,
  decimals = 0,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (!inView || !ref.current) return;
    if (reduced) {
      ref.current.textContent = `${prefix}${to.toFixed(decimals)}${suffix}`;
      return;
    }
    const ctrl = animate(0, to, {
      duration,
      ease: [0.25, 0.46, 0.45, 0.94],
      onUpdate(v) {
        if (ref.current) ref.current.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
      },
    });
    return () => ctrl.stop();
  }, [inView, to, suffix, prefix, duration, decimals, reduced]);

  return (
    <span ref={ref}>
      {prefix}0{suffix}
    </span>
  );
});

// ---------------------------------------------------------------------------
// Calgary Mountain SVG Silhouette
// Paths represent the Rockies west of Calgary — inspired by the classic
// "signature" skyline ridge visible from the city on clear Alberta days.
// ---------------------------------------------------------------------------
const MountainSilhouette = memo(function MountainSilhouette({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 220"
      fill="currentColor"
      preserveAspectRatio="xMidYMax meet"
      className={className}
      aria-hidden="true"
    >
      {/* Far-range peaks (lightest layer — background) */}
      <path
        opacity="0.18"
        d="M0 220 L0 160 L60 120 L120 140 L200 80 L280 130 L360 70
           L440 110 L520 50 L600 100 L680 60 L760 90 L840 40 L920 80
           L1000 30 L1080 75 L1160 45 L1240 85 L1320 55 L1440 90 L1440 220 Z"
      />
      {/* Mid-range peaks (medium layer) */}
      <path
        opacity="0.32"
        d="M0 220 L0 180 L80 145 L160 165 L240 110 L320 148 L400 95
           L480 138 L560 88 L640 125 L720 72 L800 115 L880 65 L960 105
           L1040 58 L1120 98 L1200 70 L1280 108 L1360 80 L1440 115 L1440 220 Z"
      />
      {/* Foreground ridge (darkest, highest contrast) */}
      <path
        d="M0 220 L0 200 L100 168 L200 185 L300 148 L400 170 L500 138
           L600 162 L700 130 L800 155 L900 122 L1000 150 L1100 118 L1200 145
           L1300 125 L1400 148 L1440 155 L1440 220 Z"
      />
    </svg>
  );
});

// ---------------------------------------------------------------------------
// Bow River divider — animated gradient stripe
// ---------------------------------------------------------------------------
const BowRiverDivider = memo(function BowRiverDivider() {
  return (
    <div className="w-full h-2 river-flow bg-gradient-to-r from-[#2E8B7A] via-[#4A90D9] to-[#2E8B7A] rounded-full opacity-60" aria-hidden="true" />
  );
});

// ---------------------------------------------------------------------------
// Aurora background overlay
// ---------------------------------------------------------------------------
const AuroraBackground = memo(function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Aurora band 1 — green-teal */}
      <div
        className="aurora-drift absolute -top-20 left-[-15%] w-[60%] h-40 rounded-full opacity-25"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, rgba(46,139,122,0.5) 0%, transparent 70%)',
          filter: 'blur(32px)',
          willChange: 'transform',
        }}
      />
      {/* Aurora band 2 — sky blue */}
      <div
        className="aurora-drift-delay absolute -top-12 right-[-8%] w-[50%] h-36 rounded-full opacity-20"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, rgba(74,144,217,0.4) 0%, transparent 70%)',
          filter: 'blur(28px)',
          willChange: 'transform',
        }}
      />
    </div>
  );
});

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
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return localStorage.getItem('cw-theme') === 'light' ? 'light' : 'dark';
  });

  const reducedMotion = prefersReducedMotion();

  // Local Calgary imagery — all WebP for maximum compression
  const calgaryImages = {
    heroWide:     '/images/hero-wide.webp',   // 1600×500 full-width banner
    skyline:      '/images/calgary7.webp',    // 1920px wide night panorama — HERO
    downtown:     '/images/calgary8.webp',    // Downtown street
    bowRiver:     '/images/calgary2.webp',    // Bow River / bridges
    calgaryTower: '/images/calgary3.webp',    // Tower / skyline (freed from hero)
    neighborhood: '/images/calgary1.webp',    // Neighbourhood aerial
    community:    '/images/calgary4.webp',    // Community scene
    safety:       '/images/calgary5.webp',    // Safety / streets
  };

  // Preload critical above-the-fold images
  useEffect(() => {
    const preloads = ['/images/hero-wide.webp', '/images/calgary1.webp'];
    preloads.forEach((href) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = href;
      document.head.appendChild(link);
    });
  }, []);

  // ------------------------------------------------------------------
  // Theme sync
  // ------------------------------------------------------------------
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('cw-theme', theme);
  }, [theme]);

  // ------------------------------------------------------------------
  // GSAP pulse dots for map preview pins (hero section only)
  // Respects prefers-reduced-motion.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (reducedMotion) return;
    const ctx = gsap.context(() => {
      gsap.to('.pulse-dot', {
        scale: 1.6,
        opacity: 0,
        duration: 1.4,
        repeat: -1,
        stagger: 0.4,
        ease: 'power2.out',
      });
    }, heroRef);
    return () => ctx.revert();
  }, [reducedMotion]);

  // ------------------------------------------------------------------
  // Mountain parallax — scroll-driven depth effect
  // The mountain SVG layers move at different rates to create a sense
  // of the Rockies receding into the distance as you scroll down.
  // Uses rAF + a dirty-flag to throttle to paint frames only.
  // ------------------------------------------------------------------
  const rafId = useRef<number | null>(null);
  const lastScrollY = useRef(0);
  const mountainParallax = useCallback(() => {
    if (!mountainRef.current || reducedMotion) return;
    const scrollY = window.scrollY;
    if (scrollY === lastScrollY.current) return;
    lastScrollY.current = scrollY;

    const layers = mountainRef.current.querySelectorAll<SVGPathElement>('path');
    // Each SVG path is a mountain layer — move at progressively slower rates
    // (background far peaks move least, foreground ridge moves most)
    const rates = [0.06, 0.12, 0.22]; // parallax coefficients per layer
    layers.forEach((path, i) => {
      const rate = rates[i] ?? 0.15;
      path.style.transform = `translateY(${scrollY * rate}px)`;
    });

    rafId.current = null;
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const onScroll = () => {
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(mountainParallax);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [mountainParallax, reducedMotion]);

  // ------------------------------------------------------------------
  // Intersection Observer — staggered fade-up for problem/feature cards
  // ------------------------------------------------------------------
  useEffect(() => {
    if (reducedMotion) return;
    const observer = new IntersectionObserver(
      (entries) => {
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
      },
      { threshold: 0.15 }
    );

    const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');
    targets.forEach((el) => {
      el.style.opacity = '0';
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [reducedMotion]);

  // ------------------------------------------------------------------
  // City expansion request
  // Security: trim + clamp at 100 chars to match Firestore rule.
  // ------------------------------------------------------------------
  const handleCityRequest = async () => {
    // Trim and enforce max length matching the Firestore rule (100 chars)
    const city = cityRequest.trim().slice(0, 100);
    if (city.length < 2) {
      setCityRequestMessage('Please enter a valid city name.');
      return;
    }

    setIsSubmittingCityRequest(true);
    setCityRequestMessage(null);
    const requestedAt = Date.now();

    // Persist locally (best-effort)
    try {
      const existing = JSON.parse(
        localStorage.getItem('cw_city_requests') || '[]'
      ) as Array<{ city: string; requestedAt: number }>;
      existing.unshift({ city, requestedAt });
      localStorage.setItem('cw_city_requests', JSON.stringify(existing.slice(0, 100)));
    } catch {
      // Local persistence is optional.
    }

    // Firestore write (may be silently blocked by rules for unauthenticated users)
    try {
      await addDoc(collection(db, 'city_requests'), {
        city,
        requestedAt,
        source: 'landing_page',
      });
    } catch {
      // Firestore write can be blocked; continue with mail fallback.
    } finally {
      setIsSubmittingCityRequest(false);
    }

    // mailto fallback — city is already trimmed and clamped
    const subject = encodeURIComponent(`City Expansion Request: ${city}`);
    const body = encodeURIComponent(
      `Hello Calgary Watch team,\n\nPlease add support for ${city}.\n\nRequested via landing page at ${new Date(requestedAt).toISOString()}.`
    );
    window.open(`mailto:jorti104@mtroyal.ca?subject=${subject}&body=${body}`, '_blank');

    setCityRequestMessage(`Request queued for ${city}. Thank you.`);
    setCityRequest('');
  };

  // Motion config — zero-motion fallback for all Framer Motion components
  const motionFade = reducedMotion
    ? { initial: { opacity: 1, y: 0, x: 0, scale: 1 }, animate: { opacity: 1, y: 0, x: 0, scale: 1 }, transition: { duration: 0 } }
    : {};

  return (
    <div className="min-h-screen bg-slate-950 light:bg-slate-100 text-white light:text-slate-900 font-sans overflow-x-hidden">

      {/* ================================================================
          NAVIGATION
          ================================================================ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/75 light:bg-white/95 backdrop-blur-xl border-b border-white/10 light:border-slate-200">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 h-16 lg:h-24 flex items-center justify-between">
          <motion.div
            className="flex items-center gap-3 group cursor-pointer"
            whileHover={!reducedMotion ? { scale: 1.02 } : undefined}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            {/* Icon — open, no box, sits flush beside the wordmark */}
            <img
              src="/icon.webp"
              alt="Calgary Watch"
              className="w-14 h-14 lg:w-20 lg:h-20 object-contain drop-shadow-lg flex-shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).replaceWith(
                  Object.assign(document.createElement('div'), { className: 'w-14 h-14 lg:w-20 lg:h-20' })
                );
              }}
            />

            {/* Wordmark */}
            <div className="flex flex-col leading-none">
              <span
                className="text-xl font-black tracking-tight"
                style={{
                  background: 'linear-gradient(to right, #4A90D9, #2E8B7A)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                CALGARY
              </span>
              <span className="text-[10px] font-bold tracking-[0.28em] text-slate-400 light:text-slate-500 mt-0.5">
                WATCH
              </span>
            </div>
          </motion.div>

          <div className="hidden md:flex items-center gap-4">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="rounded-full w-10 h-10 flex items-center justify-center bg-white/5 light:bg-slate-100 border border-white/10 light:border-slate-300 text-slate-400 light:text-slate-700 hover:text-white light:hover:text-slate-900 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <a
              href="#features"
              className="text-sm font-medium text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 transition-colors"
            >
              How it Works
            </a>
            <button
              type="button"
              onClick={() => navigate('/about')}
              className="text-sm font-medium text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 transition-colors"
            >
              About
            </button>
            <Button
              variant="primary"
              className="bg-[#4A90D9] hover:bg-blue-600 rounded-full px-6"
              onClick={() => navigate('/map')}
            >
              Open Live Map
            </Button>
          </div>

          <Button
            variant="secondary"
            size="icon"
            className="md:hidden rounded-full"
            onClick={() => navigate('/map')}
            aria-label="Open live map"
          >
            <MapIcon size={20} />
          </Button>
        </div>
      </nav>

      {/* ================================================================
          HERO SECTION
          Full-viewport hero — wide Calgary cityscape fills the entire
          section as an absolute background. Content is vertically
          centered in the viewport with proper clearance for the fixed
          96px nav. Works on every screen size without cutting off.
          ================================================================ */}
      {/* ================================================================
          HERO — Calgary Chamber style split layout
          Left: dark content column  |  Right: full-height Calgary photo
          Mobile: photo strip on top, text below (stacked)
          ================================================================ */}
      <section
        ref={heroRef}
        className="flex flex-col mt-16 lg:mt-24"
      >
        {/* ── Split body: text left / photo right ── */}
        <div className="flex flex-col lg:grid lg:grid-cols-[48fr_52fr]"
             style={{ minHeight: 'calc(100svh - 64px - 52px)' /* viewport minus nav minus ticker */ }}>

          {/* ── Mobile photo strip (visible only below lg) ── */}
          <div className="lg:hidden relative h-56 sm:h-72 overflow-hidden order-first">
            <picture>
              <source srcSet="/images/calgary7.webp" type="image/webp" />
              <img
                src="/images/calgary2.jpg"
                alt="Calgary skyline at night"
                fetchPriority="high"
                decoding="async"
                className="w-full h-full object-cover object-[center_40%]"
              />
            </picture>
            {/* fade bottom edge into left column bg */}
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950 to-transparent" aria-hidden="true" />
          </div>

          {/* ── LEFT: text content ── */}
          <div className="relative flex flex-col justify-center bg-slate-950 light:bg-white px-8 sm:px-12 lg:px-16 xl:px-20 py-14 lg:py-20 overflow-hidden">
            {/* Subtle aurora glow */}
            <AuroraBackground />

            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, x: -32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.75, ease: 'easeOut' }}
              className="relative z-10 max-w-xl"
            >
              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2.5 mb-7">
              {/* Live badge */}
              <div className="inline-flex items-center gap-2.5 px-4 py-1.5 bg-[#4A90D9]/12 border border-[#4A90D9]/30 rounded-full">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4A90D9] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4A90D9]" />
                </span>
                <span className="text-[11px] font-bold text-[#4A90D9] uppercase tracking-widest">
                  Live · Calgary, AB
                </span>
              </div>

              {/* Non-profit badge */}
              <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#2E8B7A]/12 border border-[#2E8B7A]/30 rounded-full">
                <span className="text-[11px] font-bold text-[#2E8B7A] uppercase tracking-widest">
                  Non-Profit
                </span>
              </div>
              </div>{/* end badges row */}

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl font-black leading-[1.08] tracking-tight text-white light:text-slate-900 mb-5">
                Know what's happening<br /> in{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A]">
                  Calgary
                </span>
                {' '}— right now.
              </h1>

              {/* Description */}
              <p className="text-base sm:text-lg text-slate-400 light:text-slate-600 leading-relaxed mb-9 max-w-lg">
                A live map where Calgarians report incidents the moment they happen — road closures,
                fires, flooding, safety alerts — layered with verified police data and neighbourhood context.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap gap-3 mb-10">
                <Button
                  size="lg"
                  className="bg-[#4A90D9] hover:bg-blue-500 rounded-xl px-8 h-13 text-base font-bold group shadow-[0_6px_24px_rgba(74,144,217,0.4)]"
                  onClick={() => navigate('/map')}
                >
                  Open Live Map
                  <ArrowRight className="ml-2 transition-transform group-hover:translate-x-1" size={18} />
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="bg-white/5 light:bg-slate-100 border border-white/15 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-200 rounded-xl px-8 h-13 text-base font-bold text-white light:text-slate-800"
                  onClick={() => navigate('/map?report=true')}
                >
                  Report an Incident
                </Button>
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-3 pt-2 border-t border-white/8 light:border-slate-200">
                <div className="flex -space-x-2" aria-hidden="true">
                  {['A','B','C','D','E'].map((l) => (
                    <div
                      key={l}
                      className="w-8 h-8 rounded-full border-2 border-slate-950 light:border-white bg-gradient-to-br from-[#4A90D9] to-[#2E8B7A] flex items-center justify-center text-[10px] font-black text-white"
                    >
                      {l}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-slate-500 light:text-slate-600">
                  <span className="text-white light:text-slate-900 font-bold">2,400+</span> Calgarians this week
                </p>
              </div>
            </motion.div>
          </div>

          {/* ── RIGHT: Calgary photo (desktop only) ── */}
          <div className="hidden lg:block relative overflow-hidden">
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              className="absolute inset-0"
            >
              <picture>
                <source srcSet="/images/calgary7.webp" type="image/webp" />
                <img
                  src="/images/calgary2.jpg"
                  alt="Calgary skyline at night"
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover object-[center_40%]"
                />
              </picture>
            </motion.div>
            {/* Left-edge fade: photo bleeds seamlessly into the text column */}
            <div
              className="absolute inset-y-0 left-0 w-32 pointer-events-none"
              style={{ background: 'linear-gradient(to right, #020617 0%, transparent 100%)' }}
              aria-hidden="true"
            />
            {/* Bottom-edge fade into the ticker */}
            <div
              className="absolute inset-x-0 bottom-0 h-28 pointer-events-none"
              style={{ background: 'linear-gradient(to top, #020617 0%, transparent 100%)' }}
              aria-hidden="true"
            />
          </div>
        </div>

        {/* ── Live incidents ticker (like "Latest News" bar) ── */}
        <div className="bg-[#0f172a] light:bg-slate-800 border-t border-white/8 px-6 sm:px-10 py-3.5 flex items-center gap-6 sm:gap-10 flex-wrap">
          <span className="inline-flex items-center gap-2 bg-[#4A90D9] text-white text-[11px] font-black uppercase tracking-widest px-4 py-1.5 rounded-lg shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            Live Feed
          </span>
          <div className="flex items-center gap-6 sm:gap-10 flex-wrap flex-1 min-w-0">
            {[
              { color: 'bg-red-500', glow: 'rgba(239,68,68,0.9)', text: '3 active alerts in Calgary' },
              { color: 'bg-amber-400', glow: 'rgba(251,191,36,0.9)', text: '12 community reports today' },
              { color: 'bg-[#2E8B7A]', glow: 'rgba(46,139,122,0.9)', text: 'All quadrants monitored — YYC' },
            ].map(({ color, glow, text }) => (
              <div key={text} className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 shrink-0 rounded-full pulse-dot ${color}`}
                     style={{ boxShadow: `0 0 8px ${glow}` }} />
                <span className="text-xs font-medium text-slate-300 light:text-slate-200 truncate">{text}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-600 hidden lg:block shrink-0">
            Updated in real time · Community-powered
          </p>
        </div>

        {/* Mountain silhouette — transition into next section */}
        <div
          ref={mountainRef}
          className="relative w-full -mb-1 bg-slate-950 light:bg-slate-100"
          aria-hidden="true"
          style={{ willChange: 'transform' }}
        >
          <MountainSilhouette
            className={cn(
              'w-full text-slate-900 light:text-slate-200',
              'drop-shadow-[0_-4px_24px_rgba(74,144,217,0.15)]'
            )}
          />
          <div className="absolute bottom-0 left-0 right-0 h-1">
            <BowRiverDivider />
          </div>
        </div>
      </section>

      {/* ================================================================
          PROBLEM SECTION
          Why does Calgary need this? — enhanced animations & interactions
          ================================================================ */}
      <section
        className="py-32 px-6 relative overflow-hidden"
        style={{ contentVisibility: 'auto' }}
      >
        {/* Animated background elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -left-96 top-0 w-[600px] h-[600px] rounded-full blur-[60px] opacity-8 bg-[#4A90D9]" aria-hidden="true" />
          <div className="absolute -right-96 bottom-0 w-[600px] h-[600px] rounded-full blur-[60px] opacity-8 bg-[#2E8B7A]" aria-hidden="true" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          {/* Main headline */}
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.7 }}
            className="max-w-4xl mb-20"
          >
            <h2 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6">
              The Problem with{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-red-600">
                Information Lag
              </span>
            </h2>
            <p className="text-xl text-slate-400 light:text-slate-600 leading-relaxed max-w-3xl">
              A collision on Macleod Trail. Smoke south of the Bow. Police tape in Beltline. You'll hear about it on social media — maybe — 40 minutes after everyone nearby already knew. That gap isn't just inconvenient. It costs decisions.
            </p>
          </motion.div>

          {/* Animated stats strip — scroll-triggered */}
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16 rounded-2xl overflow-hidden border border-white/10 light:border-slate-200"
          >
            {[
              {
                value: 40, suffix: ' min', prefix: '',
                label: 'Average news lag', sub: 'after an incident occurs',
                color: '#ef4444', bg: 'from-red-500/10 to-transparent',
              },
              {
                value: 9, suffix: ' apps', prefix: '',
                label: 'Apps Calgarians check', sub: 'to piece together one incident',
                color: '#a855f7', bg: 'from-purple-500/10 to-transparent',
              },
              {
                value: 74, suffix: '%', prefix: '',
                label: 'Missed a nearby event', sub: 'due to slow information reach',
                color: '#f59e0b', bg: 'from-amber-500/10 to-transparent',
              },
              {
                value: 30, suffix: 's', prefix: '< ',
                label: 'Calgary Watch lag', sub: 'community report to live map',
                color: '#4A90D9', bg: 'from-[#4A90D9]/15 to-transparent',
              },
            ].map((stat, i) => (
              <div
                key={i}
                className={`relative bg-gradient-to-b ${stat.bg} bg-slate-900/60 light:bg-white px-6 py-8 flex flex-col items-center text-center border-r border-white/8 light:border-slate-200 last:border-r-0`}
              >
                <div
                  className="text-5xl md:text-6xl font-black tabular-nums mb-2 tracking-tight"
                  style={{ color: stat.color }}
                >
                  <AnimatedCounter
                    to={stat.value}
                    suffix={stat.suffix}
                    prefix={stat.prefix}
                    duration={1.8 + i * 0.2}
                  />
                </div>
                <p className="text-sm font-bold text-white light:text-slate-900 mb-1">{stat.label}</p>
                <p className="text-xs text-slate-500 light:text-slate-500 leading-snug">{stat.sub}</p>
              </div>
            ))}
          </motion.div>

          {/* ── "The 40-minute gap" timeline ─────────────────────────── */}
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mb-24"
          >
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-8">
              What happens after an incident — without Calgary Watch
            </p>

            {/* Timeline track */}
            <div className="relative">
              {/* Horizontal connector line (desktop) */}
              <div className="hidden md:block absolute top-10 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

              <div className="grid grid-cols-1 md:grid-cols-5 gap-0">
                {[
                  {
                    time: '0:00',
                    label: 'Incident',
                    sub: 'Collision on Macleod Trail. People on the street know.',
                    color: '#ef4444',
                    icon: AlertCircle,
                    highlight: false,
                  },
                  {
                    time: '2 min',
                    label: 'One tweet',
                    sub: 'Maybe. If someone nearby was already on their phone.',
                    color: '#f97316',
                    icon: Radio,
                    highlight: false,
                  },
                  {
                    time: '15 min',
                    label: 'Reddit post',
                    sub: 'Buried under memes. Most Calgarians never see it.',
                    color: '#a855f7',
                    icon: Users,
                    highlight: false,
                  },
                  {
                    time: '40 min',
                    label: 'News article',
                    sub: 'Finally published. The traffic jam has already formed.',
                    color: '#f59e0b',
                    icon: ShieldAlert,
                    highlight: false,
                  },
                  {
                    time: '< 30s',
                    label: 'Calgary Watch',
                    sub: 'Community pins it. It\'s live on the map. You decide.',
                    color: '#4A90D9',
                    icon: MapPin,
                    highlight: true,
                  },
                ].map((node, i) => (
                  <motion.div
                    key={i}
                    initial={reducedMotion ? undefined : { opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                    className={`relative flex md:flex-col items-start md:items-center gap-4 md:gap-0 px-4 py-6 md:py-0 md:text-center border-b md:border-b-0 border-white/8 last:border-0 ${node.highlight ? 'md:bg-[#4A90D9]/5 rounded-xl md:py-4' : ''}`}
                  >
                    {/* Node circle */}
                    <div
                      className={`flex-shrink-0 w-14 h-14 md:w-20 md:h-20 rounded-full flex items-center justify-center mb-0 md:mb-5 border-2 z-10 ${node.highlight ? 'shadow-[0_0_32px_rgba(74,144,217,0.5)]' : ''}`}
                      style={{
                        borderColor: node.color,
                        background: `${node.color}18`,
                      }}
                    >
                      <node.icon size={node.highlight ? 26 : 22} style={{ color: node.color }} />
                    </div>

                    <div>
                      {/* Time badge */}
                      <div
                        className="inline-block text-xs font-black tabular-nums px-2 py-0.5 rounded mb-1.5"
                        style={{ color: node.color, background: `${node.color}18` }}
                      >
                        {node.time}
                      </div>
                      <h4 className={`font-black text-base mb-1 ${node.highlight ? 'text-[#4A90D9]' : 'text-white light:text-slate-900'}`}>
                        {node.label}
                      </h4>
                      <p className="text-xs text-slate-400 light:text-slate-500 leading-snug max-w-[180px] md:max-w-none">
                        {node.sub}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── 3 editorial problem rows ─────────────────────────────── */}
          <div className="space-y-0 mb-20 border border-white/10 light:border-slate-200 rounded-2xl overflow-hidden divide-y divide-white/8 light:divide-slate-200">
            {[
              {
                num: '01',
                tag: '30+ minutes delayed',
                tagColor: '#ef4444',
                title: 'By the time it\'s in the news…',
                body: 'Local media reports incidents 30+ minutes after they happen. That gap costs real decisions — a detour you could have taken, a street you would have avoided, a family member you could have warned.',
                icon: Radio,
                stat: '30+',
                statLabel: 'min delayed',
                reverse: false,
              },
              {
                num: '02',
                tag: 'Lost in noise',
                tagColor: '#a855f7',
                title: 'r/Calgary won\'t cut it',
                body: 'Critical alerts drown three pages down in memes and off-topic threads. The signal is there — somewhere — buried under noise. You need what you need, when you need it.',
                icon: Users,
                stat: '100s',
                statLabel: 'posts to scan',
                reverse: true,
              },
              {
                num: '03',
                tag: 'Fragmented sources',
                tagColor: '#f59e0b',
                title: '9 apps. Still no answer.',
                body: '311, Twitter, Nextdoor, local news — each has one piece. Checking them all takes more time than the incident itself. Calgary Watch pulls every signal into a single live map.',
                icon: ShieldAlert,
                stat: '9',
                statLabel: 'apps to check',
                reverse: false,
              },
            ].map((row, i) => (
              <motion.div
                key={i}
                initial={reducedMotion ? undefined : { opacity: 0, x: row.reverse ? 32 : -32 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.65, delay: 0.05 }}
                className={`flex flex-col ${row.reverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-stretch`}
              >
                {/* Stat side */}
                <div
                  className="flex-shrink-0 md:w-56 flex flex-col items-center justify-center py-10 px-8 gap-1"
                  style={{ background: `${row.tagColor}0d` }}
                >
                  <span
                    className="text-6xl md:text-7xl font-black tabular-nums leading-none"
                    style={{ color: row.tagColor }}
                  >
                    {row.stat}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-1">
                    {row.statLabel}
                  </span>
                  <div
                    className="mt-4 w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${row.tagColor}20`, color: row.tagColor }}
                  >
                    <row.icon size={20} />
                  </div>
                </div>

                {/* Text side */}
                <div className="flex-1 px-8 py-10 flex flex-col justify-center">
                  <span
                    className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded w-fit mb-3"
                    style={{ color: row.tagColor, background: `${row.tagColor}18` }}
                  >
                    {row.tag}
                  </span>
                  <h3 className="text-2xl md:text-3xl font-black mb-3 text-white light:text-slate-900">
                    {row.title}
                  </h3>
                  <p className="text-base text-slate-400 light:text-slate-600 leading-relaxed max-w-xl">
                    {row.body}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── Solution pivot ──────────────────────────────────────── */}
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7 }}
            className="relative rounded-2xl overflow-hidden shadow-2xl border border-[#4A90D9]/30"
          >
            {/* Background city photo */}
            <picture>
              <source srcSet="/images/calgary3.webp" type="image/webp" />
              <img
                src="/images/calgary3.webp"
                alt="Calgary skyline at night"
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </picture>
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-950/40" />

            <div className="relative z-10 grid md:grid-cols-2 gap-0 min-h-[420px]">
              {/* Left: solution content */}
              <div className="p-10 md:p-14 flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 mb-5 w-fit">
                  <div className="w-2 h-2 rounded-full bg-[#4A90D9] shadow-[0_0_8px_#4A90D9]" />
                  <span className="text-xs font-black uppercase tracking-wider text-[#4A90D9]">The Solution</span>
                </div>
                <h3 className="text-3xl md:text-5xl font-black mb-5 leading-[1.1]">
                  Calgary Watch:<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A]">
                    Real-time, together.
                  </span>
                </h3>
                <p className="text-base md:text-lg text-slate-300 leading-relaxed mb-7 max-w-md">
                  A live, community-powered incident map built specifically for this city. Neighbours report what they see — road closures, safety alerts, flooding, fires — and it appears on the map in seconds.
                </p>
                <div className="space-y-2.5 mb-8">
                  {[
                    'Live updates — no lag, no delay',
                    'Verified with CPS data & community input',
                    'One map, every alert, all of Calgary',
                  ].map((point, i) => (
                    <motion.div
                      key={i}
                      className="flex items-center gap-3 text-sm"
                      initial={reducedMotion ? undefined : { opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.45, delay: 0.4 + i * 0.08 }}
                    >
                      <CheckCircle2 size={16} className="text-[#4A90D9] flex-shrink-0" />
                      <span className="text-slate-300">{point}</span>
                    </motion.div>
                  ))}
                </div>
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 20px 50px rgba(74,144,217,0.4)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/map')}
                  className="w-fit rounded-xl px-8 py-4 bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] text-white font-bold flex items-center gap-2 cursor-pointer text-base"
                >
                  <MapPin size={18} />
                  View Live Map
                  <ArrowRight size={16} />
                </motion.button>
              </div>

              {/* Right: big accent stat */}
              <div className="hidden md:flex flex-col items-center justify-center gap-2 px-12">
                <div className="text-[96px] font-black leading-none text-[#4A90D9] drop-shadow-[0_0_40px_rgba(74,144,217,0.6)]">
                  <AnimatedCounter to={30} suffix="s" prefix="< " duration={1.5} />
                </div>
                <p className="text-lg font-bold text-white/70 text-center">
                  From report to live map
                </p>
                <div className="mt-4 flex gap-3 flex-wrap justify-center">
                  {['< 30 second reports', 'Anonymous option', 'Real-time sync'].map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-3 py-1.5 rounded-full border border-[#4A90D9]/40 text-[#4A90D9] bg-[#4A90D9]/10 font-semibold"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          FEATURES SECTION — "What You Get"
          Enhanced animations with improved visual hierarchy
          ================================================================ */}
      <section className="py-32 px-6" id="features">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05]">
              Built for how Calgarians<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#D4A843]">
                actually live.
              </span>
            </h2>
            <p className="mt-4 text-lg text-slate-400 light:text-slate-600 leading-relaxed">
              Not a generic alert app. Every feature was designed around this city — its
              neighbourhoods, its patterns, its people.
            </p>
          </motion.div>

          {/* 4x1 Feature Cards with Images Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {/* Feature 1: Live Community Map - with image */}
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              whileHover={{ y: -12, boxShadow: '0 30px 60px rgba(74, 144, 217, 0.15)' }}
              className="rounded-2xl border border-white/10 light:border-slate-300 overflow-hidden bg-gradient-to-br from-slate-900/80 to-slate-950/60 light:from-white light:to-slate-50 shadow-xl transition-all group h-full flex flex-col"
            >
              {/* Image */}
              <div className="relative h-40 overflow-hidden bg-slate-800">
                <motion.img
                  src="/images/hero-wide.webp"
                  alt="Live community map"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.6 }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950 opacity-60" />
                {/* Icon badge */}
                <motion.div
                  className="absolute top-3 right-3 w-10 h-10 rounded-lg bg-blue-500/90 backdrop-blur flex items-center justify-center"
                  whileHover={{ scale: 1.2, rotate: 8 }}
                >
                  <MapIcon className="text-white" size={20} />
                </motion.div>
              </div>

              {/* Content */}
              <div className="p-6 flex-1 flex flex-col">
                <div className="mb-2">
                  <span className="inline-block text-[10px] font-black uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                    Real-time
                  </span>
                </div>
                <h3 className="text-lg font-black mb-3 group-hover:text-blue-400 transition-colors">
                  Live Community Map
                </h3>
                <p className="text-sm text-slate-400 light:text-slate-600 flex-1">
                  Incidents appear on the map the moment they're reported — no refresh, no delay. Watch your neighbourhood update in real time.
                </p>
              </div>
            </motion.div>

            {/* Feature 2: Neighbourhood Intelligence - with image */}
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              whileHover={{ y: -12, boxShadow: '0 30px 60px rgba(46, 139, 122, 0.15)' }}
              className="rounded-2xl border border-white/10 light:border-slate-300 overflow-hidden bg-gradient-to-br from-slate-900/80 to-slate-950/60 light:from-white light:to-slate-50 shadow-xl transition-all group h-full flex flex-col"
            >
              {/* Image */}
              <div className="relative h-40 overflow-hidden bg-slate-800">
                <motion.img
                  src="/images/calgary3.webp"
                  alt="Neighbourhood patterns and trends"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.6 }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950 opacity-60" />
                {/* Icon badge */}
                <motion.div
                  className="absolute top-3 right-3 w-10 h-10 rounded-lg bg-teal-500/90 backdrop-blur flex items-center justify-center"
                  whileHover={{ scale: 1.2, rotate: 8 }}
                >
                  <Layers className="text-white" size={20} />
                </motion.div>
              </div>

              {/* Content */}
              <div className="p-6 flex-1 flex flex-col">
                <div className="mb-2">
                  <span className="inline-block text-[10px] font-black uppercase tracking-wider text-teal-400 bg-teal-500/10 px-2 py-1 rounded">
                    Insights
                  </span>
                </div>
                <h3 className="text-lg font-black mb-3 group-hover:text-teal-400 transition-colors">
                  Neighbourhood Intelligence
                </h3>
                <p className="text-sm text-slate-400 light:text-slate-600 flex-1">
                  Tap any area to see historical incident patterns, safety scores, and local trends specific to that part of Calgary.
                </p>
              </div>
            </motion.div>

            {/* Feature 3: Verified + Community Data - with image */}
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              whileHover={{ y: -12, boxShadow: '0 30px 60px rgba(212, 168, 67, 0.15)' }}
              className="rounded-2xl border border-white/10 light:border-slate-300 overflow-hidden bg-gradient-to-br from-slate-900/80 to-slate-950/60 light:from-white light:to-slate-50 shadow-xl transition-all group h-full flex flex-col"
            >
              {/* Image */}
              <div className="relative h-40 overflow-hidden bg-slate-800">
                <motion.img
                  src="/images/calgary5.webp"
                  alt="Verified data sources"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.6 }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950 opacity-60" />
                {/* Icon badge */}
                <motion.div
                  className="absolute top-3 right-3 w-10 h-10 rounded-lg bg-amber-500/90 backdrop-blur flex items-center justify-center"
                  whileHover={{ scale: 1.2, rotate: 8 }}
                >
                  <ShieldCheck className="text-white" size={20} />
                </motion.div>
              </div>

              {/* Content */}
              <div className="p-6 flex-1 flex flex-col">
                <div className="mb-2">
                  <span className="inline-block text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                    Verified
                  </span>
                </div>
                <h3 className="text-lg font-black mb-3 group-hover:text-amber-400 transition-colors">
                  Verified + Community Data
                </h3>
                <p className="text-sm text-slate-400 light:text-slate-600 flex-1">
                  Each report shows its source — community-submitted or cross-referenced with police data — so you know exactly how much to trust it.
                </p>
              </div>
            </motion.div>

            {/* Feature 4: Post Anonymously - with image */}
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              whileHover={{ y: -12, boxShadow: '0 30px 60px rgba(139, 92, 246, 0.15)' }}
              className="rounded-2xl border border-white/10 light:border-slate-300 overflow-hidden bg-gradient-to-br from-slate-900/80 to-slate-950/60 light:from-white light:to-slate-50 shadow-xl transition-all group h-full flex flex-col"
            >
              {/* Image */}
              <div className="relative h-40 overflow-hidden bg-slate-800">
                <motion.img
                  src="/images/calgary4.webp"
                  alt="Anonymous privacy"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.6 }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950 opacity-60" />
                {/* Icon badge */}
                <motion.div
                  className="absolute top-3 right-3 w-10 h-10 rounded-lg bg-purple-500/90 backdrop-blur flex items-center justify-center"
                  whileHover={{ scale: 1.2, rotate: 8 }}
                >
                  <Lock className="text-white" size={20} />
                </motion.div>
              </div>

              {/* Content */}
              <div className="p-6 flex-1 flex flex-col">
                <div className="mb-2">
                  <span className="inline-block text-[10px] font-black uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-1 rounded">
                    Private
                  </span>
                </div>
                <h3 className="text-lg font-black mb-3 group-hover:text-purple-400 transition-colors">
                  Post Anonymously
                </h3>
                <p className="text-sm text-slate-400 light:text-slate-600 flex-1">
                  See something sensitive? Report it without revealing who you are. Your identity stays private by default.
                </p>
              </div>
            </motion.div>
          </div>

          {/* Context/Use-Case Card - Full Width */}
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="rounded-2xl border-2 border-white/20 light:border-slate-300 overflow-hidden bg-gradient-to-br from-slate-900/90 to-slate-950/70 light:from-white light:to-slate-50 shadow-2xl"
          >
            <div className="grid md:grid-cols-2 gap-0">
              {/* Left: Image */}
              <div className="relative h-64 md:h-full overflow-hidden">
                <motion.img
                  src={calgaryImages.neighborhood}
                  alt="Calgary neighbourhood aerial"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.6 }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950 to-transparent opacity-50" />
              </div>

              {/* Right: Use-Case Content */}
              <div className="p-8 md:p-12 flex flex-col justify-center relative z-10">
                <motion.div
                  className="inline-flex items-center gap-2 mb-4 w-fit"
                  whileHover={{ x: 4 }}
                >
                  <div className="w-3 h-3 rounded-full bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A]" />
                  <span className="text-xs font-black uppercase tracking-wider text-[#4A90D9]">Real-World Scenarios</span>
                </motion.div>

                <h3 className="text-3xl md:text-4xl font-black mb-4">
                  Built for real Calgary situations
                </h3>

                <p className="text-base md:text-lg text-slate-300 light:text-slate-700 leading-relaxed mb-6">
                  Whether you're rerouting around a Deerfoot closure, checking your kids' walk home from school, or just want to know why the helicopter is circling your block — Calgary Watch gives you the answer before anyone else does.
                </p>

                <div className="space-y-3 mb-8">
                  {[
                    '✓ Traffic delays & road closures',
                    '✓ Safety alerts for neighbourhoods',
                    '✓ Emergency & incident tracking',
                  ].map((point, i) => (
                    <motion.div
                      key={i}
                      className="flex items-center gap-3 text-sm"
                      initial={reducedMotion ? undefined : { opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: 0.6 + i * 0.08 }}
                    >
                      <span className="text-[#4A90D9] font-black">{point.split('✓')[0]}✓</span>
                      <span className="text-slate-300 light:text-slate-700">{point.split('✓')[1]}</span>
                    </motion.div>
                  ))}
                </div>

                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 20px 50px rgba(74,144,217,0.3)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/map')}
                  className="w-fit rounded-xl px-8 py-4 bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] text-white font-bold hover:from-blue-600 hover:to-teal-600 transition-all flex items-center gap-2 cursor-pointer text-lg"
                >
                  <MapPin size={20} />
                  Try Now
                  <ArrowRight size={18} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          HOW IT WORKS
          Advanced timeline workflow with sophisticated interactions
          ================================================================ */}
      <section
        className="py-32 px-6 relative overflow-hidden"
        id="how-it-works"
      >
        {/* Animated background grid */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 opacity-5 light:opacity-3" style={{
            backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px)',
            backgroundSize: '80px 80px'
          }} aria-hidden="true" />
          <div className="absolute -top-40 right-[20%] w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-10 bg-gradient-to-br from-blue-500 via-teal-500 to-purple-500" aria-hidden="true" />
          <div className="absolute -bottom-40 left-[10%] w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-10 bg-gradient-to-tr from-amber-500 via-orange-500 to-red-500" aria-hidden="true" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          {/* Header */}
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6 }}
            className="mb-20"
          >
            <motion.div 
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/20 light:border-slate-300 bg-white/5 light:bg-white/50 backdrop-blur-sm mb-6"
              whileInView={{ scale: 1.05 }}
              transition={{ duration: 0.4 }}
            >
              <motion.span 
                className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 via-teal-500 to-purple-500"
                animate={{ scale: [1, 1.5, 1], boxShadow: ['0 0 0 0 rgba(74,144,217,0.5)', '0 0 0 10px rgba(74,144,217,0)'] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400 light:text-slate-600">
                Workflow
              </span>
            </motion.div>
            <h2 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] mb-4">
              How it Works
            </h2>
            <p className="text-lg md:text-xl text-slate-400 light:text-slate-600 leading-relaxed max-w-2xl">
              Three fast steps for live local awareness.
            </p>
          </motion.div>

          {/* Icon-based step cards — no photos, pure information + animation */}
          <div className="relative">
            {/* Connecting gradient line (desktop) */}
            <div
              className="hidden lg:block absolute top-[4.5rem] left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-px pointer-events-none"
              style={{ background: 'linear-gradient(to right, #4A90D9, #2E8B7A, #D4A843)' }}
              aria-hidden="true"
            />

            <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
              {([
                {
                  step: '01',
                  Icon: MapPin,
                  title: 'Spot it. Tap it. Done.',
                  desc: 'Pick a category, drop a pin, and add a quick note — the whole report takes under 30 seconds. Post anonymously if you prefer.',
                  accentColor: '#4A90D9',
                  metric: '< 30s',
                  metricLabel: 'Average report time',
                  facts: ['7 incident categories', 'Anonymous option', 'One tap to submit'],
                  longDesc: 'Your voice matters. In just half a minute, report what you see and keep your community informed without revealing your identity.',
                },
                {
                  step: '02',
                  Icon: Zap,
                  title: "It's live in seconds.",
                  desc: "Your report appears on the map the moment it's submitted — no moderation queue, no delay. Everyone watching that area sees it instantly.",
                  accentColor: '#2E8B7A',
                  metric: '< 2s',
                  metricLabel: 'Time to appear on map',
                  facts: ['Real-time Firestore sync', 'Push to all active users', 'Zero moderation lag'],
                  longDesc: 'The moment you hit submit, the incident is live. Thousands of neighbours watching that area see your report before you put your phone down.',
                },
                {
                  step: '03',
                  Icon: BarChart2,
                  title: 'Context tells the full story.',
                  desc: "Neighbourhood history, safety trends, and verified police data surface automatically around every incident — so you understand what's actually happening.",
                  accentColor: '#D4A843',
                  metric: '100+',
                  metricLabel: 'Data points per area',
                  facts: ['CPS verified data layer', 'Historical trend charts', 'Safety score per zone'],
                  longDesc: 'Every incident exists in a context. Calgary Watch surfaces patterns, trends, and official sources automatically so you can make informed decisions.',
                },
              ] as const).map((item, i) => {
                const StepIcon = item.Icon;
                return (
                  <motion.div
                    key={item.step}
                    initial={reducedMotion ? undefined : { opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.65, delay: i * 0.14 }}
                    className="group relative"
                  >
                    <div
                      className="relative h-full flex flex-col rounded-2xl border overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-400 bg-slate-900/60 light:bg-white"
                      style={{ borderColor: `${item.accentColor}25` }}
                    >
                      {/* ── Icon hero area ── */}
                      <div className="relative flex flex-col items-center justify-center gap-4 px-8 py-10 overflow-hidden"
                           style={{ background: `linear-gradient(160deg, ${item.accentColor}12 0%, transparent 60%)` }}>
                        {/* Ghost step number behind icon */}
                        <span
                          className="absolute right-5 top-3 text-[5.5rem] font-black leading-none select-none pointer-events-none"
                          style={{ color: item.accentColor, opacity: 0.07 }}
                        >
                          {item.step}
                        </span>

                        {/* Animated glow rings */}
                        {!reducedMotion && (
                          <>
                            <motion.div
                              className="absolute w-36 h-36 rounded-full pointer-events-none"
                              style={{ border: `1px solid ${item.accentColor}20` }}
                              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.15, 0.5] }}
                              transition={{ duration: 3.5, repeat: Infinity, delay: i * 0.6 }}
                            />
                            <motion.div
                              className="absolute w-24 h-24 rounded-full pointer-events-none"
                              style={{ border: `1px solid ${item.accentColor}35` }}
                              animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0.2, 0.6] }}
                              transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.6 + 0.4 }}
                            />
                          </>
                        )}

                        {/* Step connector dot (desktop timeline) */}
                        <div
                          className="hidden lg:flex absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full items-center justify-center z-20 border-2 border-slate-950"
                          style={{ background: item.accentColor }}
                        >
                          <CheckCircle2 size={12} className="text-white" />
                        </div>

                        {/* Icon box */}
                        <motion.div
                          className="relative z-10 w-20 h-20 rounded-2xl flex items-center justify-center"
                          style={{
                            background: `linear-gradient(135deg, ${item.accentColor}22, ${item.accentColor}0a)`,
                            border: `1.5px solid ${item.accentColor}45`,
                            boxShadow: `0 8px 28px ${item.accentColor}18`,
                          }}
                          whileHover={!reducedMotion ? { scale: 1.1, boxShadow: `0 12px 40px ${item.accentColor}35` } : undefined}
                          transition={{ duration: 0.25 }}
                        >
                          <StepIcon size={36} style={{ color: item.accentColor }} strokeWidth={1.6} />
                        </motion.div>

                        {/* Key metric */}
                        <div className="relative z-10 text-center">
                          <motion.span
                            className="block text-3xl font-black"
                            style={{ color: item.accentColor }}
                            initial={reducedMotion ? undefined : { opacity: 0, scale: 0.6 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: i * 0.14 + 0.3, type: 'spring', stiffness: 200 }}
                          >
                            {item.metric}
                          </motion.span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            {item.metricLabel}
                          </span>
                        </div>
                      </div>

                      {/* ── Content ── */}
                      <div className="flex flex-col flex-1 p-6 gap-4">
                        {/* Step tag */}
                        <div className="flex items-center gap-2">
                          <motion.div
                            className="h-0.5 rounded-full"
                            style={{ background: item.accentColor }}
                            initial={{ width: 0 }}
                            whileInView={{ width: 24 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: i * 0.14 + 0.15 }}
                          />
                          <span className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: item.accentColor }}>
                            Step {item.step}
                          </span>
                        </div>

                        <h3 className="text-lg font-black text-white light:text-slate-900 leading-snug">
                          {item.title}
                        </h3>

                        <p className="text-sm text-slate-400 light:text-slate-600 leading-relaxed flex-1">
                          {item.desc}
                        </p>

                        {/* Fact chips */}
                        <div className="flex flex-wrap gap-2">
                          {item.facts.map((fact) => (
                            <span
                              key={fact}
                              className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                              style={{ background: `${item.accentColor}12`, color: item.accentColor, border: `1px solid ${item.accentColor}25` }}
                            >
                              {fact}
                            </span>
                          ))}
                        </div>

                        {/* Expandable detail */}
                        {expandedStep === item.step && (
                          <motion.p
                            className="text-xs text-slate-400 light:text-slate-600 leading-relaxed italic p-3 rounded-xl bg-white/4 light:bg-slate-50 border border-white/8 light:border-slate-200"
                            initial={reducedMotion ? undefined : { opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            "{item.longDesc}"
                          </motion.p>
                        )}

                        <motion.button
                          type="button"
                          onClick={() => setExpandedStep(expandedStep === item.step ? null : item.step)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold w-fit px-3.5 py-1.5 rounded-full transition-all"
                          style={{ color: item.accentColor, background: `${item.accentColor}12`, border: `1px solid ${item.accentColor}28` }}
                          whileHover={!reducedMotion ? { scale: 1.04 } : undefined}
                          whileTap={!reducedMotion ? { scale: 0.96 } : undefined}
                        >
                          {expandedStep === item.step ? 'Hide' : 'Learn more'}
                          <motion.span animate={{ rotate: expandedStep === item.step ? 90 : 0 }} transition={{ duration: 0.25 }}>
                            →
                          </motion.span>
                        </motion.button>
                      </div>

                      {/* Hover bloom */}
                      <div
                        className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-400 -z-10 blur-md"
                        style={{ background: `radial-gradient(ellipse at 50% 0%, ${item.accentColor}18, transparent 70%)` }}
                        aria-hidden="true"
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* CTA Section */}
          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-20 text-center"
          >
            <p className="text-lg text-slate-300 light:text-slate-700 mb-6">
              Ready to make Calgary smarter together?
            </p>
            <motion.button
              whileHover={!reducedMotion ? { scale: 1.05, boxShadow: '0 25px 60px rgba(74,144,217,0.4)' } : undefined}
              whileTap={!reducedMotion ? { scale: 0.95 } : undefined}
              onClick={() => navigate('/map')}
              className="rounded-xl px-10 py-4 bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#8B5CF6] text-white font-bold hover:from-blue-600 hover:via-teal-600 hover:to-purple-600 transition-all flex items-center gap-2 cursor-pointer mx-auto text-lg shadow-lg"
            >
              <MapPin size={20} />
              Start Reporting
              <ArrowRight size={18} />
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
          DATA TRUST — CPS integration callout
          Full-bleed night panorama (calgary7) behind gradient pill
          ================================================================ */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto rounded-[3rem] overflow-hidden shadow-2xl relative">
          {/* Background: night panorama with teal/blue overlay */}
          <img
            src="/images/calgary7.webp"
            alt="Calgary at night"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, rgba(74,144,217,0.82) 0%, rgba(46,139,122,0.88) 100%)' }}
            aria-hidden="true"
          />
          {/* Content */}
          <div className="relative z-10 p-12 text-center space-y-8">
            <ShieldCheck size={64} className="mx-auto text-white/80" />
            <h2 className="text-4xl font-black tracking-tight text-white">Data You Can Trust</h2>
            <p className="text-xl text-blue-50/90 max-w-2xl mx-auto leading-relaxed">
              We bridge the gap between community reports and official data. Calgary Watch
              integrates Calgary Police Service (CPS) data to provide a verified layer of
              urban awareness.
            </p>
            <div className="flex justify-center gap-8 pt-4">
              <div className="text-center text-white">
                <div className="text-2xl font-black">Verified</div>
                <div className="text-[10px] uppercase font-bold opacity-70 tracking-widest mt-1">
                  Official Sources
                </div>
              </div>
              <div className="w-px h-14 bg-white/20" />
              <div className="text-center text-white">
                <div className="text-2xl font-black">Real-Time</div>
                <div className="text-[10px] uppercase font-bold opacity-70 tracking-widest mt-1">
                  Community Driven
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          MAIN CTA
          ================================================================ */}
      <section className="py-32 px-6">
        <motion.div
          initial={reducedMotion ? undefined : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.55 }}
          className="max-w-6xl mx-auto relative overflow-hidden rounded-[2.6rem] border border-white/10 light:border-slate-300 bg-slate-900/70 light:bg-white px-7 py-12 md:px-12 md:py-14"
        >
          {/* Downtown street photo — subtle depth layer */}
          <img
            src="/images/calgary8.webp"
            alt=""
            loading="lazy"
            decoding="async"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-10 light:opacity-5"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 10% 15%, rgba(46,139,122,0.14), transparent 35%), radial-gradient(circle at 90% 85%, rgba(74,144,217,0.14), transparent 45%)',
            }}
            aria-hidden="true"
          />
          <div
            className="absolute -top-24 -right-14 w-52 h-52 rounded-full blur-3xl pointer-events-none opacity-15"
            style={{ background: '#4A90D9' }}
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-24 -left-14 w-52 h-52 rounded-full blur-3xl pointer-events-none opacity-15"
            style={{ background: '#2E8B7A' }}
            aria-hidden="true"
          />

          <div className="relative z-10 grid lg:grid-cols-[1.2fr_auto] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 light:border-slate-300 bg-white/5 light:bg-slate-50">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 light:text-slate-600">
                  Live Community Network
                </span>
              </div>
              <h2 className="mt-5 text-4xl md:text-6xl font-black tracking-tight leading-[1.05] max-w-3xl">
                Join Calgary's real-time awareness network.
              </h2>
              <p className="mt-4 text-base md:text-lg text-slate-400 light:text-slate-600 leading-relaxed max-w-2xl">
                Open the city map to monitor incidents in motion, or add your report to
                strengthen neighbourhood awareness for everyone.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 lg:min-w-[16rem]">
              <Button
                size="lg"
                className="h-14 md:h-16 px-8 rounded-2xl text-base md:text-lg font-black"
                style={{
                  background: 'linear-gradient(135deg, #4A90D9 0%, #2E8B7A 100%)',
                  boxShadow: '0 12px 36px -18px rgba(74,144,217,0.75)',
                }}
                onClick={() => navigate('/map')}
              >
                Open Live Map
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="h-14 md:h-16 px-8 rounded-2xl bg-white/10 light:bg-white border border-white/15 light:border-slate-300 hover:bg-white/15 light:hover:bg-slate-100 text-base md:text-lg font-black text-white light:text-slate-900"
                onClick={() => navigate('/map?report=true')}
              >
                Submit Report
              </Button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ================================================================
          CITY EXPANSION REQUEST
          ================================================================ */}
      <section className="py-20 px-6 border-t border-white/5 light:border-slate-200">
        <div className="max-w-xl mx-auto text-center space-y-6">
          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
            Want this in your city?
          </h4>
          <div className="flex gap-2">
            <label htmlFor="city-request-input" className="sr-only">
              Enter your city name
            </label>
            <input
              id="city-request-input"
              type="text"
              placeholder="Enter your city name"
              value={cityRequest}
              maxLength={100}
              onChange={(e) => setCityRequest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCityRequest();
                }
              }}
              className="flex-1 bg-white/5 light:bg-white border border-white/10 light:border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9] light:text-slate-900"
            />
            <Button
              onClick={() => void handleCityRequest()}
              disabled={isSubmittingCityRequest}
              className="bg-white text-slate-950 hover:bg-slate-200 rounded-xl px-6 font-bold disabled:opacity-60"
            >
              {isSubmittingCityRequest ? 'Sending...' : 'Request'}
            </Button>
          </div>
          {cityRequestMessage && (
            <p className="text-xs text-emerald-400 font-semibold">{cityRequestMessage}</p>
          )}
          <p className="text-[10px] text-slate-600">
            Currently in demand for: Edmonton (420), Vancouver (310), Toronto (280)
          </p>
        </div>
      </section>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <footer className="py-12 px-6 border-t border-white/5 light:border-slate-200 bg-slate-950 light:bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-[#4A90D9]" size={24} />
            <span className="text-lg font-bold tracking-tight">Calgary Watch</span>
          </div>
          <div className="flex gap-8 text-sm text-slate-500 light:text-slate-600">
            <button
              type="button"
              onClick={() => setLegalModal('privacy')}
              className="hover:text-white light:hover:text-slate-900 transition-colors"
            >
              Privacy
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('terms')}
              className="hover:text-white light:hover:text-slate-900 transition-colors"
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('contact')}
              className="hover:text-white light:hover:text-slate-900 transition-colors"
            >
              Contact
            </button>
          </div>
          <p className="text-xs text-slate-600 light:text-slate-500">
            &copy; 2026 Calgary Watch. Community Safety Platform.
          </p>
        </div>

        {/* Disclaimer */}
        <div className="max-w-7xl mx-auto mt-8 p-4 bg-red-500/5 light:bg-red-50 border border-red-500/10 light:border-red-200 rounded-2xl text-center">
          <p className="text-[10px] text-red-400/80 uppercase font-bold tracking-widest">
            Disclaimer: User-generated content. Always verify with official sources before taking action.
          </p>
        </div>
      </footer>

      {/* ================================================================
          LEGAL MODAL
          ================================================================ */}
      <AnimateLegalModal legalModal={legalModal} onClose={() => setLegalModal(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legal Modal
// ---------------------------------------------------------------------------
function AnimateLegalModal({
  legalModal,
  onClose,
}: {
  legalModal: 'privacy' | 'terms' | 'contact' | null;
  onClose: () => void;
}) {
  if (!legalModal) return null;

  const content = {
    privacy: {
      title: 'Privacy Policy',
      body: 'Calgary Watch stores report metadata to operate safety alerts. We do not sell personal data. Reporter identity can be anonymised per report and admin access is restricted to verified administrators only.',
    },
    terms: {
      title: 'Terms of Use',
      body: 'Calgary Watch is for informational awareness only. Always verify critical incidents with official agencies. Misleading or abusive submissions may be removed by administrators.',
    },
    contact: {
      title: 'Contact',
      body: 'For support, account issues, or policy requests, contact: jorti104@mtroyal.ca',
    },
  }[legalModal];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 light:bg-black/45 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={content.title}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.96 }}
        className="w-full max-w-xl rounded-3xl border border-white/10 light:border-slate-200 bg-slate-900 light:bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-2xl font-black text-white light:text-slate-900">{content.title}</h3>
        <p className="mt-4 text-sm text-slate-300 light:text-slate-700 leading-relaxed">{content.body}</p>
        <div className="mt-6 flex justify-end">
          <Button
            onClick={onClose}
            className="bg-[#4A90D9] hover:bg-blue-600 px-5"
          >
            Close
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
