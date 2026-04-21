/**
 * AboutPage.tsx
 *
 * Calgary Watch — Full visual rework with 3D scroll-driven animations
 *
 * Design philosophy:
 *  - Every section has a unique, non-generic layout
 *  - 3D perspective transforms driven by scroll position via Framer Motion
 *  - Dramatic typographic scale and creative visual hierarchy
 *  - Calgary design language: sky, mountains, Bow River, Stampede energy
 *  - Full dark/light mode with `light:` Tailwind variant
 *  - prefers-reduced-motion respected throughout
 */

import { useEffect, useRef, memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  motion,
  useInView,
  animate,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  AnimatePresence,
} from 'motion/react';
import emailjs from '@emailjs/browser';
import { db } from '@/src/firebase';
import { publicAsset } from '@/src/lib/utils';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import {
  ArrowLeft,
  MapPin,
  Zap,
  Mail,
  Users,
  ArrowRight,
  Clock,
  Shield,
  Eye,
  HeartHandshake,
  Handshake,
  ChevronDown,
  CheckCircle2,
  Cpu,
  Globe,
  TrendingUp,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// AnimatedCounter — counts up when scrolled into view
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

  useEffect(() => {
    if (!inView || !ref.current) return;
    if (prefersReducedMotion()) {
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
  }, [inView, to, suffix, prefix, duration, decimals]);

  return <span ref={ref}>{prefix}0{suffix}</span>;
});

// ---------------------------------------------------------------------------
// MagneticButton — cursor-following micro-motion
// ---------------------------------------------------------------------------
function MagneticButton({
  children,
  className,
  onClick,
  href,
  tag = 'button',
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  href?: string;
  tag?: 'button' | 'a';
}) {
  const ref = useRef<HTMLElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20 });
  const sy = useSpring(y, { stiffness: 300, damping: 20 });

  function onMove(e: React.MouseEvent) {
    if (prefersReducedMotion()) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * 0.22);
    y.set((e.clientY - cy) * 0.22);
  }
  function onLeave() { x.set(0); y.set(0); }

  const Tag = tag === 'a' ? motion.a : motion.button;

  return (
    <Tag
      ref={ref as React.Ref<HTMLButtonElement & HTMLAnchorElement>}
      className={className}
      style={{ x: sx, y: sy }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
      href={href}
      whileTap={{ scale: 0.95 }}
    >
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// SplitTextReveal — each word staggers in on scroll
// ---------------------------------------------------------------------------
function SplitTextReveal({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const words = text.split(' ');

  return (
    <div ref={ref} className={`flex flex-wrap ${className ?? ''}`} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="mr-[0.28em] overflow-hidden"
          aria-hidden="true"
        >
          <motion.span
            className="inline-block"
            initial={prefersReducedMotion() ? undefined : { y: '110%', opacity: 0 }}
            animate={inView ? { y: '0%', opacity: 1 } : {}}
            transition={{
              duration: 0.65,
              delay: delay + i * 0.055,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {word}
          </motion.span>
        </motion.span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Volunteer Form — preserved exactly, new visual treatment
// ---------------------------------------------------------------------------
function VolunteerForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [whyJoin, setWhyJoin] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  const roles = ['Reporter', 'Analyst', 'Developer', 'Community Advocate', 'Other'];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !role || !whyJoin.trim()) return;
    setStatus('submitting');
    if (!db) { setStatus('error'); return; }
    try {
      await addDoc(collection(db, 'volunteers'), {
        name: name.trim().slice(0, 100),
        email: email.trim().slice(0, 200),
        role,
        whyJoin: whyJoin.trim().slice(0, 500),
        createdAt: serverTimestamp(),
      });

      emailjs.init({ publicKey: 'SwfXJ-eXi92R0m_nV' });
      emailjs.send('service_77g2o0a', 'template_sx463hg', {
        name: name.trim().slice(0, 100),
        email: email.trim().slice(0, 200),
        subject: role,
        message: `Role: ${role}\n\nWhy they want to join:\n${whyJoin.trim().slice(0, 500)}`,
      }).catch((err) => { console.error('EmailJS error:', JSON.stringify(err)); });

      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  const inputClass =
    'w-full bg-white/5 light:bg-white/80 border border-white/12 light:border-slate-300 rounded-lg px-4 py-3 text-sm text-white light:text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-[#2E8B7A]/70 focus:bg-white/8 light:focus:bg-white transition-all';

  return (
    <AnimatePresence mode="wait">
      {status === 'done' ? (
        <motion.div
          key="done"
          initial={{ opacity: 0, scale: 0.92, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center justify-center gap-4 py-12 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 18 }}
            className="w-16 h-16 rounded-full bg-[#2E8B7A]/20 border border-[#2E8B7A]/40 flex items-center justify-center"
          >
            <CheckCircle2 size={32} className="text-[#2E8B7A]" />
          </motion.div>
          <div>
            <p className="text-xl font-black text-white light:text-slate-900">
              Thanks, {name.split(' ')[0]}!
            </p>
            <p className="text-slate-400 light:text-slate-600 text-sm mt-1">
              We'll be in touch soon.
            </p>
          </div>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, y: -8 }}
        >
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            className={inputClass}
          />
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            required
            className={inputClass}
          />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2.5">
              I want to help with
            </p>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`text-xs font-bold px-3.5 py-1.5 rounded-full border transition-all cursor-pointer ${
                    role === r
                      ? 'bg-[#2E8B7A] border-[#2E8B7A] text-white shadow-lg shadow-[#2E8B7A]/25'
                      : 'bg-transparent border-white/15 light:border-slate-300 text-slate-400 light:text-slate-600 hover:border-[#2E8B7A]/50 hover:text-[#2E8B7A]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2.5">
              Why do you want to join?
            </p>
            <textarea
              placeholder="Tell us why you're interested in building a trusted platform for Calgary..."
              value={whyJoin}
              onChange={(e) => setWhyJoin(e.target.value)}
              maxLength={500}
              required
              rows={3}
              className={`${inputClass} resize-none`}
            />
            <p className="text-[10px] text-slate-600 mt-1 text-right tabular-nums">
              {whyJoin.length}/500
            </p>
          </div>
          {status === 'error' && (
            <p className="text-red-400 text-xs">
              Something went wrong. Try emailing us directly.
            </p>
          )}
          <motion.button
            type="submit"
            disabled={
              status === 'submitting' ||
              !name.trim() ||
              !email.trim() ||
              !role ||
              !whyJoin.trim()
            }
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="w-full rounded-xl py-3.5 bg-gradient-to-r from-[#2E8B7A] to-[#246b5f] text-white text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer tracking-wide shadow-lg shadow-[#2E8B7A]/20"
          >
            {status === 'submitting' ? 'Sending…' : 'Express Interest'}
          </motion.button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// HeroPerspectiveTitle — letters tilt in 3D as hero scrolls
// ---------------------------------------------------------------------------
function HeroPerspectiveTitle({ scrollProgress }: { scrollProgress: ReturnType<typeof useScroll>['scrollYProgress'] }) {
  const rotateX = useTransform(scrollProgress, [0, 0.5], [0, -25]);
  const scale = useTransform(scrollProgress, [0, 0.5], [1, 0.88]);
  const opacity = useTransform(scrollProgress, [0, 0.55], [1, 0]);
  const springRotX = useSpring(rotateX, { stiffness: 60, damping: 18 });
  const springScale = useSpring(scale, { stiffness: 60, damping: 18 });

  if (prefersReducedMotion()) {
    return (
      <h1 className="text-[clamp(3rem,10vw,8.5rem)] font-black tracking-tight leading-[0.92] select-none">
        <span className="block text-white">Real-time</span>
        <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#D4A843]">
          city
        </span>
        <span className="block text-white">intelligence.</span>
      </h1>
    );
  }

  return (
    <motion.div
      style={{
        rotateX: springRotX,
        scale: springScale,
        opacity,
        transformStyle: 'preserve-3d',
        perspective: '1200px',
      }}
    >
      <h1 className="text-[clamp(3rem,10vw,8.5rem)] font-black tracking-tight leading-[0.92] select-none">
        <motion.span
          className="block text-white"
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          Real-time
        </motion.span>
        <motion.span
          className="block text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#D4A843]"
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          city
        </motion.span>
        <motion.span
          className="block text-white"
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          intelligence.
        </motion.span>
      </h1>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ScrollingMarquee — horizontal ticker strip
// ---------------------------------------------------------------------------
function ScrollingMarquee() {
  const items = [
    '2000+ Incidents Mapped',
    '47 Neighbourhoods',
    '<30s Report to Map',
    '100+ Contributors',
    'Real-Time Awareness',
    'Calgary-First Platform',
  ];
  const doubled = [...items, ...items];

  return (
    <div className="relative overflow-hidden py-5 border-y border-white/6 light:border-slate-200 bg-white/[0.02] light:bg-slate-50/60">
      <motion.div
        className="flex gap-12 whitespace-nowrap w-max"
        animate={prefersReducedMotion() ? {} : { x: [0, '-50%'] }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 light:text-slate-400 flex items-center gap-4"
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: ['#4A90D9', '#2E8B7A', '#D4A843'][i % 3],
              }}
            />
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiagonalImageBlock — full-bleed image with clipped diagonal edge
// ---------------------------------------------------------------------------
function DiagonalImageBlock({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const imgY = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);
  const smoothY = useSpring(imgY, { stiffness: 50, damping: 18 });

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-2xl"
      style={{ clipPath: 'polygon(0 0, 100% 0, 100% 88%, 88% 100%, 0 100%)' }}
    >
      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        width={1200} height={448}
        className="w-full h-80 md:h-[28rem] object-cover"
        style={prefersReducedMotion() ? undefined : { y: smoothY }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrbitingBadges — stat badges orbiting a central icon
// ---------------------------------------------------------------------------
function OrbitingBadges() {
  const reduced = prefersReducedMotion();
  const badges = [
    { label: '2000+', sub: 'incidents', color: '#4A90D9', angle: 0 },
    { label: '47', sub: 'areas', color: '#2E8B7A', angle: 90 },
    { label: '<30s', sub: 'latency', color: '#D4A843', angle: 180 },
    { label: '100+', sub: 'contributors', color: '#a855f7', angle: 270 },
  ];

  return (
    <div className="relative w-64 h-64 mx-auto flex items-center justify-center">
      {/* Central glow */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#4A90D9]/15 via-[#2E8B7A]/10 to-[#D4A843]/15 blur-xl" />
      {/* Central icon */}
      <motion.div
        className="relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br from-[#4A90D9] to-[#2E8B7A] flex items-center justify-center shadow-2xl shadow-[#4A90D9]/30"
        animate={reduced ? {} : { rotate: [0, 5, -5, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <img
          src={publicAsset('icon.svg')}
          alt="Calgary Watch"
          width={48} height={48}
          className="w-12 h-12 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </motion.div>
      {/* Orbit ring */}
      <motion.div
        className="absolute inset-0 rounded-full border border-white/8 light:border-slate-300/50"
        animate={reduced ? {} : { rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
      />
      {/* Badges */}
      {badges.map((b) => {
        const rad = (b.angle * Math.PI) / 180;
        const r = 112;
        const bx = Math.cos(rad) * r;
        const by = Math.sin(rad) * r;
        return (
          <motion.div
            key={b.label}
            className="absolute flex flex-col items-center pointer-events-none"
            style={{ left: `calc(50% + ${bx}px - 2rem)`, top: `calc(50% + ${by}px - 1.5rem)` }}
            animate={reduced ? {} : { rotate: -360 }}
            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          >
            <span className="text-base font-black tabular-nums" style={{ color: b.color }}>
              {b.label}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 light:text-slate-400">
              {b.sub}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimelineStep — connected node for "How It Works"
// ---------------------------------------------------------------------------
function TimelineStep({
  num,
  title,
  desc,
  color,
  image,
  isLast,
  index,
}: {
  num: string;
  title: string;
  desc: string;
  color: string;
  image: string;
  isLast: boolean;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduced = prefersReducedMotion();

  const isEven = index % 2 === 0;

  return (
    <div ref={ref} className={`flex flex-col md:flex-row items-center gap-0 md:gap-0 relative ${isEven ? '' : 'md:flex-row-reverse'}`}>
      {/* Image side */}
      <motion.div
        className="w-full md:w-5/12"
        initial={reduced ? undefined : { opacity: 0, x: isEven ? -60 : 60, rotateY: isEven ? -15 : 15 }}
        animate={inView ? { opacity: 1, x: 0, rotateY: 0 } : {}}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        style={{ perspective: '1000px' }}
      >
        <div
          className="relative overflow-hidden rounded-2xl border border-white/8 light:border-slate-200 group"
          style={{ boxShadow: `0 24px 60px ${color}18` }}
        >
          <img
            src={image}
            alt={title}
            width={800} height={288}
            loading="lazy"
            className="w-full h-60 md:h-72 object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
          <div
            className="absolute bottom-4 left-4 text-5xl font-black opacity-20"
            style={{ color }}
          >
            {num}
          </div>
        </div>
      </motion.div>

      {/* Center connector */}
      <div className="hidden md:flex flex-col items-center w-2/12 relative z-10 self-stretch">
        <motion.div
          className="w-12 h-12 rounded-full border-2 flex items-center justify-center font-black text-sm shrink-0 mt-8"
          style={{ borderColor: color, color, background: `${color}15` }}
          initial={reduced ? undefined : { scale: 0, opacity: 0 }}
          animate={inView ? { scale: 1, opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.2, type: 'spring', stiffness: 260 }}
        >
          {num}
        </motion.div>
        {!isLast && (
          <motion.div
            className="flex-1 w-px mt-2"
            style={{ background: `linear-gradient(to bottom, ${color}60, transparent)` }}
            initial={reduced ? undefined : { scaleY: 0, originY: 0 }}
            animate={inView ? { scaleY: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
          />
        )}
      </div>

      {/* Text side */}
      <motion.div
        className="w-full md:w-5/12 pt-6 md:pt-0 pb-12 md:pb-0"
        initial={reduced ? undefined : { opacity: 0, x: isEven ? 60 : -60 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
      >
        <div className={`max-w-sm ${isEven ? 'md:pl-2' : 'md:pr-2 md:text-right md:ml-auto'}`}>
          <span
            className="inline-block text-[10px] font-black uppercase tracking-[0.2em] mb-3 px-2.5 py-1 rounded"
            style={{ color, background: `${color}18` }}
          >
            Step {num}
          </span>
          <h3 className="text-3xl md:text-4xl font-black mb-3 tracking-tight">{title}</h3>
          <p className="text-slate-400 light:text-slate-600 leading-relaxed">{desc}</p>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MorphingStat — large number with animated underline morphing on scroll
// ---------------------------------------------------------------------------
function MorphingStat({
  value,
  suffix,
  prefix,
  label,
  color,
  delay,
}: {
  value: number;
  suffix: string;
  prefix: string;
  label: string;
  color: string;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <div ref={ref} className="flex flex-col items-center gap-2 py-8 px-4">
      <motion.div
        className="text-[clamp(2.8rem,6vw,5rem)] font-black tabular-nums leading-none tracking-tight"
        style={{ color }}
        initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        <AnimatedCounter to={value} suffix={suffix} prefix={prefix} duration={1.8 + delay} />
      </motion.div>
      <motion.div
        className="h-px w-12 rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={inView ? { width: 48 } : {}}
        transition={{ duration: 0.5, delay: delay + 0.2 }}
      />
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400 light:text-slate-500 text-center">
        {label}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NorthernLightsBackground — decorative ambient gradient layer
// ---------------------------------------------------------------------------
function NorthernLightsBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute -top-32 left-1/4 w-[40rem] h-[20rem] rounded-full opacity-[0.07] blur-[80px]"
        style={{ background: 'linear-gradient(135deg, #4A90D9, #2E8B7A)' }}
      />
      <div
        className="absolute top-1/3 -right-24 w-[28rem] h-[16rem] rounded-full opacity-[0.055] blur-[60px]"
        style={{ background: 'linear-gradient(135deg, #D4A843, #C0392B)' }}
      />
      <div
        className="absolute bottom-0 left-1/3 w-[32rem] h-[18rem] rounded-full opacity-[0.06] blur-[70px]"
        style={{ background: 'linear-gradient(135deg, #2E8B7A, #4A90D9)' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
export default function AboutPage() {
  const navigate = useNavigate();

  /* ---------- hero scroll ---------- */
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroBgY = useTransform(heroProgress, [0, 1], ['0%', '28%']);
  const smoothBgY = useSpring(heroBgY, { stiffness: 50, damping: 18 });

  /* ---------- "who we are" section parallax ---------- */
  const whoRef = useRef<HTMLElement>(null);
  const { scrollYProgress: whoProgress } = useScroll({
    target: whoRef,
    offset: ['start end', 'end start'],
  });
  const whoImgScale = useTransform(whoProgress, [0, 0.5], [1.08, 1]);

  /* ---------- mission section ---------- */
  const missionRef = useRef<HTMLElement>(null);
  const { scrollYProgress: missionProgress } = useScroll({
    target: missionRef,
    offset: ['start end', 'end start'],
  });
  const missionImgY = useTransform(missionProgress, [0, 1], ['6%', '-6%']);
  const smoothMissionY = useSpring(missionImgY, { stiffness: 50, damping: 18 });

  return (
    <div className="relative min-h-dvh bg-slate-950 light:bg-[rgb(255,250,243)] text-white light:text-slate-900 font-sans overflow-x-hidden isolate">
      {/* Ambient light mode gradients */}
      <div className="pointer-events-none absolute inset-0 hidden light:block" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_15%_10%,rgba(74,144,217,0.14),transparent_34%),radial-gradient(circle_at_85%_5%,rgba(212,168,67,0.14),transparent_28%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[32rem] bg-[radial-gradient(circle_at_30%_30%,rgba(46,139,122,0.12),transparent_30%)]" />
      </div>

      {/* ================================================================
          NAVIGATION — fixed glassy bar
          ================================================================ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 light:bg-[rgba(255,250,242,0.88)] backdrop-blur-2xl border-b border-white/5 light:border-stone-200/70">
        <div className="max-w-7xl mx-auto px-5 h-[4.5rem] flex items-center justify-between">
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <img
              src={publicAsset('icon.svg')}
              alt="Calgary Watch"
              width={40} height={40}
              className="w-10 h-10 object-contain drop-shadow-md flex-shrink-0"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="text-base font-black tracking-tight">Calgary Watch</span>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <MagneticButton
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-sm font-bold rounded-full px-5 py-2.5 bg-white/5 light:bg-slate-100/80 border border-white/10 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <ArrowLeft size={15} />
              Back to Home
            </MagneticButton>
          </motion.div>
        </div>
      </nav>

      <main className="pt-[4.5rem]">

        {/* ==============================================================
            HERO — full-viewport, 3D perspective title, deep parallax
            ============================================================== */}
        <motion.section
          ref={heroRef}
          className="relative h-[100dvh] min-h-[600px] flex flex-col justify-end overflow-hidden"
          initial={prefersReducedMotion() ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7 }}
        >
          {/* Background image — parallax layer */}
          <motion.div
            className="absolute inset-0 scale-110"
            style={prefersReducedMotion() ? undefined : { y: smoothBgY }}
          >
            <img
              src={publicAsset('images/hero-wide.webp')}
              alt="Calgary skyline panorama"
              width={1920} height={1080}
              className="w-full h-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          </motion.div>

          {/* Gradient overlays — depth stack */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-950/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/50 via-transparent to-transparent" />
          {/* Top fade for nav */}
          <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-slate-950/60 to-transparent" />

          {/* Hero content */}
          <div className="relative z-10 max-w-7xl mx-auto px-6 w-full pb-20 md:pb-28">
            <div className="max-w-4xl">
              {/* Eyebrow badge */}
              <motion.div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/15 bg-white/8 backdrop-blur-sm mb-8"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.05 }}
              >
                <span className="w-2 h-2 rounded-full bg-[#4A90D9] animate-pulse" />
                <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-200">
                  Designed for Calgary
                </span>
              </motion.div>

              {/* 3D perspective title */}
              <HeroPerspectiveTitle scrollProgress={heroProgress} />

              {/* Subtitle */}
              <motion.p
                className="mt-6 text-base md:text-xl text-slate-300 leading-relaxed max-w-xl"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.6 }}
              >
                Calgary Watch turns community reports and verified data into
                actionable awareness. See what's happening on the map, right now.
              </motion.p>

              {/* CTAs */}
              <motion.div
                className="mt-10 flex flex-wrap gap-4"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.75 }}
              >
                <MagneticButton
                  onClick={() => navigate('/map')}
                  className="inline-flex items-center gap-2 rounded-xl px-7 py-4 font-black text-sm text-white bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] shadow-xl shadow-[#4A90D9]/25 hover:shadow-[#4A90D9]/40 transition-shadow cursor-pointer"
                >
                  <MapPin size={17} />
                  View Live Map
                </MagneticButton>
                <MagneticButton
                  onClick={() => navigate('/map?report=true')}
                  className="inline-flex items-center gap-2 rounded-xl px-7 py-4 font-black text-sm bg-white/10 border border-white/20 hover:bg-white/15 text-white transition-colors cursor-pointer backdrop-blur-sm"
                >
                  <Zap size={17} />
                  Report Now
                </MagneticButton>
              </motion.div>
            </div>
          </div>

          {/* Scroll cue */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4, duration: 0.6 }}
          >
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
              Scroll
            </span>
            <motion.div
              animate={prefersReducedMotion() ? {} : { y: [0, 6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ChevronDown size={18} className="text-white/30" />
            </motion.div>
          </motion.div>
        </motion.section>

        {/* Marquee ticker strip */}
        <ScrollingMarquee />

        {/* ==============================================================
            WHO WE ARE — editorial cinematic split
            ============================================================== */}
        <section
          ref={whoRef}
          className="relative py-28 md:py-44 px-6 overflow-hidden"
        >
          <NorthernLightsBackground />
          <div className="max-w-7xl mx-auto relative z-10">

            {/* Eyebrow */}
            <motion.div
              className="flex items-center gap-4 mb-16 md:mb-24"
              initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <span className="w-10 h-px bg-[#4A90D9]" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#4A90D9]">
                Who We Are
              </span>
            </motion.div>

            <div className="grid md:grid-cols-[1fr_1.15fr] gap-14 md:gap-20 items-start">

              {/* Left — stacked offset images with floating stats (desktop only) */}
              <div className="relative h-[32rem] hidden md:block shrink-0">
                {/* Image 1 — top-left */}
                <motion.div
                  className="absolute top-0 left-0 w-[56%] h-[58%] rounded-2xl overflow-hidden border border-white/8 light:border-slate-200 shadow-2xl"
                  initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.img
                    src={publicAsset('images/calgary3.webp')}
                    alt="Calgary community"
                    width={800} height={600}
                    className="w-full h-full object-cover"
                    style={prefersReducedMotion() ? undefined : { scale: whoImgScale }}
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-[#4A90D9]/25 via-transparent to-transparent mix-blend-overlay" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 to-transparent" />
                </motion.div>

                {/* Image 2 — bottom-right */}
                <motion.div
                  className="absolute bottom-0 right-0 w-[60%] h-[62%] rounded-2xl overflow-hidden border border-white/8 light:border-slate-200 shadow-2xl"
                  initial={prefersReducedMotion() ? undefined : { opacity: 0, y: -24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                >
                  <img
                    src={publicAsset('images/calgary5.webp')}
                    alt="Calgary neighbourhoods"
                    width={800} height={600}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-[#2E8B7A]/20 via-transparent to-transparent mix-blend-overlay" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 to-transparent" />
                </motion.div>

                {/* Floating stat badge — overlaps both images */}
                <motion.div
                  className="absolute top-[46%] left-[34%] bg-slate-950/90 light:bg-white/95 backdrop-blur-xl border border-white/10 light:border-slate-200 rounded-2xl px-5 py-4 shadow-2xl z-20"
                  initial={prefersReducedMotion() ? undefined : { opacity: 0, scale: 0.75 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
                >
                  <p className="text-3xl font-black text-[#4A90D9] tabular-nums leading-none mb-1">
                    <AnimatedCounter to={47} />
                  </p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Neighbourhoods
                  </p>
                </motion.div>

                {/* Second floating stat */}
                <motion.div
                  className="absolute top-[8%] right-[4%] bg-slate-950/90 light:bg-white/95 backdrop-blur-xl border border-white/10 light:border-slate-200 rounded-2xl px-4 py-3 shadow-xl z-20"
                  initial={prefersReducedMotion() ? undefined : { opacity: 0, scale: 0.75 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.7, type: 'spring', stiffness: 200, damping: 20 }}
                >
                  <p className="text-2xl font-black text-[#D4A843] tabular-nums leading-none mb-0.5">
                    <AnimatedCounter to={2000} suffix="+" />
                  </p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Incidents
                  </p>
                </motion.div>
              </div>

              {/* Right — stacked headline + editorial values */}
              <div>
                {/* Headline — each word on its own line */}
                <h2 className="text-[clamp(3rem,7vw,5.5rem)] font-black leading-[0.92] tracking-tight mb-8 select-none">
                  {[
                    { word: 'Built', gradient: false },
                    { word: 'for', gradient: true },
                    { word: 'Calgarians,', gradient: false },
                    { word: 'by', gradient: true },
                    { word: 'Calgarians', gradient: false },
                  ].map(({ word, gradient }, i) => (
                    <motion.span
                      key={i}
                      className={`block ${gradient
                        ? 'text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] italic'
                        : 'text-white light:text-slate-900'
                      }`}
                      initial={prefersReducedMotion() ? undefined : { opacity: 0, x: i % 2 === 0 ? -28 : 28 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.7, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {word}
                    </motion.span>
                  ))}
                </h2>

                <motion.p
                  className="text-base md:text-lg text-slate-400 light:text-slate-600 leading-relaxed mb-10 max-w-md"
                  initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.38 }}
                >
                  Calgary Watch is built specifically for this city. We understand
                  its neighbourhoods, its geography, its rhythm. We built a platform
                  that turns local awareness into action, connecting people with the
                  information they need to stay safe and informed.
                </motion.p>

                {/* Values — editorial numbered rows */}
                <div className="border-t border-white/8 light:border-slate-200">
                  {[
                    { icon: Clock, num: '01', label: 'Real-Time', desc: 'Incidents appear on the map in seconds', color: '#4A90D9' },
                    { icon: Shield, num: '02', label: 'Verified', desc: 'Community reports + official CPS data', color: '#2E8B7A' },
                    { icon: Users, num: '03', label: 'Community', desc: 'Powered by Calgary residents', color: '#D4A843' },
                  ].map((item, i) => (
                    <motion.div
                      key={item.num}
                      className="flex items-center gap-4 py-5 border-b border-white/8 light:border-slate-200 group cursor-default"
                      initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 14 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: 0.48 + i * 0.09 }}
                      whileHover={prefersReducedMotion() ? undefined : { x: 5 }}
                    >
                      <span className="text-[11px] font-black tabular-nums text-slate-600 w-6 shrink-0">
                        {item.num}
                      </span>
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                        style={{ background: `${item.color}18`, border: `1px solid ${item.color}28` }}
                      >
                        <item.icon size={16} style={{ color: item.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm tracking-tight mb-0.5">{item.label}</p>
                        <p className="text-xs text-slate-500 light:text-slate-500 truncate">{item.desc}</p>
                      </div>
                      <motion.div
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: item.color }}
                      >
                        <ArrowRight size={14} />
                      </motion.div>
                    </motion.div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ==============================================================
            STATS — dramatic full-width typographic number bar
            ============================================================== */}
        <section className="relative py-4 bg-slate-900/60 light:bg-slate-50/70 border-y border-white/5 light:border-slate-200 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#4A90D9/3,#2E8B7A/3,#D4A843/3,#a855f7/3)] opacity-5" aria-hidden="true" />
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/5 light:divide-slate-200">
              {[
                { value: 2000, suffix: '+', prefix: '', label: 'Incidents Mapped', color: '#4A90D9' },
                { value: 47,   suffix: '',  prefix: '', label: 'Neighbourhoods',   color: '#2E8B7A' },
                { value: 30,   suffix: 's', prefix: '<', label: 'Report to Map',   color: '#D4A843' },
                { value: 100,  suffix: '+', prefix: '', label: 'Contributors',     color: '#a855f7' },
              ].map((s, i) => (
                <MorphingStat key={i} {...s} delay={i * 0.12} />
              ))}
            </div>
          </div>
        </section>

        {/* ==============================================================
            HOW IT WORKS — vertical timeline with alternating sides
            ============================================================== */}
        <section className="py-24 md:py-40 px-6 relative overflow-hidden">
          <NorthernLightsBackground />
          <div className="max-w-5xl mx-auto relative z-10">
            <div className="mb-16 md:mb-24">
              <motion.span
                className="inline-block text-[10px] font-black uppercase tracking-[0.25em] text-[#4A90D9] mb-4"
                initial={prefersReducedMotion() ? undefined : { opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                How It Works
              </motion.span>
              <SplitTextReveal
                text="Three steps to live city intelligence"
                className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05] max-w-3xl"
              />
            </div>

            <div className="space-y-0">
              {[
                {
                  num: '01',
                  title: 'Report',
                  desc: 'Spot something? Drop a pin and report it in under 30 seconds. Our streamlined form gets your incident on the map before you put your phone away.',
                  image: publicAsset('images/calgary2.webp'),
                  color: '#4A90D9',
                },
                {
                  num: '02',
                  title: 'Share',
                  desc: 'Your report appears on the live map instantly for all Calgarians. Real-time awareness, city-wide. No delay, no middleman.',
                  image: publicAsset('images/calgary3.webp'),
                  color: '#2E8B7A',
                },
                {
                  num: '03',
                  title: 'Decide',
                  desc: "Context and verified data help you decide what to do next. Adjust your route, stay informed, or simply know what's happening around you.",
                  image: publicAsset('images/calgary5.webp'),
                  color: '#D4A843',
                },
              ].map((step, i, arr) => (
                <TimelineStep
                  key={step.num}
                  {...step}
                  index={i}
                  isLast={i === arr.length - 1}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ==============================================================
            MISSION — full-bleed image with diagonal clip, checklist
            ============================================================== */}
        <motion.section
          ref={missionRef}
          className="py-24 md:py-40 px-6 bg-slate-900/40 light:bg-slate-50/50 relative overflow-hidden"
        >
          <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-14 md:gap-20 items-center">

            {/* Image column — diagonal clip with parallax */}
            <motion.div
              className="order-2 md:order-1"
              initial={prefersReducedMotion() ? undefined : { opacity: 0, x: -32 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            >
              <div
                className="relative overflow-hidden rounded-2xl border border-white/8 light:border-slate-200"
                style={{
                  clipPath: 'polygon(0 0, 100% 0, 100% 90%, 92% 100%, 0 100%)',
                }}
              >
                <motion.img
                  src={publicAsset('images/calgary8.webp')}
                  alt="Calgary downtown"
                  width={1200} height={512}
                  loading="lazy"
                  className="w-full h-80 md:h-[32rem] object-cover"
                  style={prefersReducedMotion() ? undefined : { y: smoothMissionY }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent" />
                {/* Floating stat overlay */}
                <motion.div
                  className="absolute bottom-6 left-6 bg-slate-950/80 light:bg-white/90 backdrop-blur-md border border-white/10 light:border-slate-200 rounded-xl px-5 py-4"
                  initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  <p className="text-2xl font-black text-[#4A90D9]">2,000+</p>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 light:text-slate-500">
                    incidents tracked
                  </p>
                </motion.div>
              </div>
            </motion.div>

            {/* Text column */}
            <motion.div
              className="order-1 md:order-2"
              initial={prefersReducedMotion() ? undefined : { opacity: 0, x: 32 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            >
              <span className="inline-block text-[10px] font-black uppercase tracking-[0.25em] text-[#4A90D9] mb-4">
                Our Mission
              </span>
              <h2 className="text-4xl md:text-5xl font-black leading-[1.08] tracking-tight mb-5">
                Connected, aware,{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A]">
                  informed
                </span>
              </h2>
              <p className="text-lg text-slate-400 light:text-slate-600 leading-relaxed mb-8">
                We believe Calgarians deserve real-time awareness of what's happening
                around them. Not endless notifications. Not algorithmic feeds. Just
                clear, trustworthy information that helps you decide.
              </p>

              {/* Checklist */}
              <div className="space-y-3.5">
                {[
                  'Community-powered incident reporting',
                  'Real-time map updates and context',
                  'Verified data from official sources',
                  'Privacy-first, anonymous reporting option',
                ].map((point, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3.5"
                    initial={prefersReducedMotion() ? undefined : { opacity: 0, x: 12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.2 + i * 0.07 }}
                  >
                    <CheckCircle2
                      size={18}
                      className="text-[#2E8B7A] shrink-0 mt-0.5"
                    />
                    <span className="text-slate-300 light:text-slate-700 text-sm leading-relaxed">
                      {point}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </motion.section>

        {/* ==============================================================
            GET INVOLVED — trust-forward immersive panels
            ============================================================== */}
        <section className="py-24 md:py-40 px-6 relative overflow-hidden">
          <NorthernLightsBackground />
          <div className="max-w-7xl mx-auto relative z-10 space-y-16 md:space-y-24">

            {/* Section header */}
            <div className="max-w-4xl">
              <motion.div
                className="flex items-center gap-4 mb-8"
                initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <span className="w-10 h-px bg-[#4A90D9]" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#4A90D9]">
                  Get Involved
                </span>
              </motion.div>
              <SplitTextReveal
                text="Calgary Watch is built by the community, and it grows with it."
                className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05] mb-6"
              />
              <motion.p
                className="text-lg text-slate-400 light:text-slate-600 leading-relaxed"
                initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                We're a small but dedicated team, and we're always looking for people who care about this city.
              </motion.p>
            </div>

            {/* Trust pull-quote — full-width dramatic block */}
            <motion.div
              className="relative rounded-2xl overflow-hidden"
              initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#4A90D9]/8 via-[#2E8B7A]/5 to-transparent light:from-blue-50/80 light:to-teal-50/50" />
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#4A90D9] via-[#2E8B7A] to-[#D4A843]" />
              <div className="relative px-8 md:px-14 py-10 md:py-14 pl-10 md:pl-16">
                <span className="text-[5rem] leading-none font-black text-[#4A90D9]/15 select-none absolute top-2 left-6 md:left-10">"</span>
                <p className="text-xl md:text-2xl lg:text-3xl font-black leading-[1.3] tracking-tight text-white light:text-slate-900 mb-3">
                  Trust is everything.
                </p>
                <p className="text-base md:text-lg text-slate-400 light:text-slate-600 leading-relaxed max-w-4xl">
                  When Calgarians rely on us to stay informed about what's happening
                  in their neighbourhoods, we accept a responsibility to be accurate,
                  responsive, and transparent. Every volunteer, every verification,
                  every decision shapes whether Calgary Watch remains a platform they
                  can depend on.{' '}
                  <span className="font-semibold text-white light:text-slate-900">
                    Join us in building something our city can trust.
                  </span>
                </p>
              </div>
            </motion.div>

            {/* Volunteer form — wide 2-column immersive panel */}
            <motion.div
              className="relative rounded-3xl overflow-hidden border border-[#2E8B7A]/20 light:border-teal-200"
              initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="absolute inset-0 bg-slate-900/80 light:bg-white/85 backdrop-blur-sm" />
              <div className="absolute inset-0 bg-gradient-to-br from-[#2E8B7A]/10 via-transparent to-[#4A90D9]/6" />
              <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-[#2E8B7A]/8 blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full bg-[#4A90D9]/6 blur-2xl pointer-events-none" />

              <div className="relative grid md:grid-cols-[1fr_1.1fr]">
                {/* Left: description */}
                <div className="p-8 md:p-12 md:border-r border-white/6 light:border-slate-200 flex flex-col justify-center gap-7">
                  <div>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-11 h-11 rounded-xl bg-[#2E8B7A]/15 border border-[#2E8B7A]/25 flex items-center justify-center">
                        <HeartHandshake size={20} className="text-[#2E8B7A]" />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-wider text-[#2E8B7A] bg-[#2E8B7A]/15 border border-[#2E8B7A]/30 px-2.5 py-1 rounded-full">
                        Open Positions
                      </span>
                    </div>
                    <h3 className="text-3xl md:text-4xl font-black tracking-tight leading-[1.05] mb-4">
                      Help keep<br />
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2E8B7A] to-[#4A90D9]">
                        Calgary informed
                      </span>
                    </h3>
                    <p className="text-slate-400 light:text-slate-600 text-sm leading-relaxed">
                      We're looking for passionate Calgarians to join us. Your
                      contributions ensure we remain accurate, responsive, and worthy of
                      the community's trust.
                    </p>
                  </div>

                  {/* Role badges */}
                  <div className="flex flex-wrap gap-2">
                    {['Reporter', 'Analyst', 'Developer', 'Advocate'].map((r, i) => (
                      <motion.span
                        key={r}
                        className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full border border-white/10 light:border-slate-200 text-slate-400 light:text-slate-600"
                        initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 + i * 0.07, duration: 0.4 }}
                      >
                        {r}
                      </motion.span>
                    ))}
                  </div>

                  {/* Social proof */}
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {['#4A90D9', '#2E8B7A', '#D4A843'].map((color, i) => (
                        <div
                          key={i}
                          className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
                          style={{ background: `${color}25`, borderColor: `${color}50` }}
                        >
                          <Users size={10} style={{ color }} />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 light:text-slate-500">
                      <span className="font-black text-white light:text-slate-900">100+</span> contributors and growing
                    </p>
                  </div>
                </div>

                {/* Right: form */}
                <div className="p-8 md:p-12">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-6">
                    Express your interest
                  </p>
                  <VolunteerForm />
                </div>
              </div>
            </motion.div>

            {/* Our Team + Business Partners — two image-backed cards */}
            <div className="grid md:grid-cols-2 gap-6">

              {/* Our Team */}
              <motion.div
                className="relative rounded-2xl overflow-hidden group min-h-[300px]"
                initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.65 }}
              >
                <div className="absolute inset-0">
                  <img
                    src={publicAsset('images/calgary2.webp')}
                    alt=""
                    width={800} height={400}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                    aria-hidden="true"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/25" />
                  <div className="absolute inset-0 bg-gradient-to-br from-[#4A90D9]/15 to-transparent" />
                </div>
                <div className="relative p-8 md:p-10 flex flex-col gap-3 h-full justify-end">
                  <div className="w-10 h-10 rounded-xl bg-[#4A90D9]/20 border border-[#4A90D9]/35 flex items-center justify-center mb-1">
                    <Eye size={18} className="text-[#4A90D9]" />
                  </div>
                  <span className="inline-block text-[9px] font-black uppercase tracking-widest text-[#4A90D9] bg-[#4A90D9]/15 px-2.5 py-1 rounded w-fit">
                    Our Team
                  </span>
                  <h3 className="text-2xl font-black tracking-tight">Always watching, always here</h3>
                  <p className="text-slate-300 light:text-slate-200 text-sm leading-relaxed">
                    A dedicated team actively monitors Calgary Watch around the clock,
                    reviewing reports, verifying incidents, and making sure the map
                    stays accurate and trustworthy. Every pin you see has a real person
                    behind it.
                  </p>
                </div>
              </motion.div>

              {/* Business Partners */}
              <motion.div
                className="relative rounded-2xl overflow-hidden group min-h-[300px]"
                initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.65, delay: 0.12 }}
              >
                <div className="absolute inset-0">
                  <img
                    src={publicAsset('images/calgary8.webp')}
                    alt=""
                    width={800} height={400}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                    aria-hidden="true"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/25" />
                  <div className="absolute inset-0 bg-gradient-to-br from-[#D4A843]/15 to-transparent" />
                </div>
                <div className="relative p-8 md:p-10 flex flex-col gap-3 h-full justify-end">
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#D4A843]/20 border border-[#D4A843]/35 flex items-center justify-center mb-1">
                      <Handshake size={18} className="text-[#D4A843]" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-[#D4A843] bg-[#D4A843]/15 border border-[#D4A843]/30 px-2.5 py-1 rounded-full">
                      Open
                    </span>
                  </div>
                  <span className="inline-block text-[9px] font-black uppercase tracking-widest text-[#D4A843] bg-[#D4A843]/15 px-2.5 py-1 rounded w-fit">
                    Business Partners
                  </span>
                  <h3 className="text-2xl font-black tracking-tight">Grow with Calgary</h3>
                  <p className="text-slate-300 light:text-slate-200 text-sm leading-relaxed mb-2">
                    Looking for Calgary-based businesses who want to be part of a
                    platform thousands rely on. Sponsorship, integrations, partnerships.
                  </p>
                  <ul className="space-y-1.5 mb-4">
                    {['Sponsored neighbourhood alerts', 'Data & API integration', 'Co-branding opportunities'].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-xs text-slate-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D4A843] shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <MagneticButton
                    tag="a"
                    href="mailto:jorti104@mtroyal.ca?subject=Partnership%20Inquiry"
                    className="inline-flex items-center gap-2 text-sm font-black text-[#D4A843] hover:text-amber-300 transition-colors cursor-pointer w-fit"
                  >
                    <Mail size={14} />
                    Get in touch
                    <ArrowRight size={13} />
                  </MagneticButton>
                </div>
              </motion.div>
            </div>

            {/* Funding / Investor Banner */}
            <motion.div
              className="rounded-2xl border border-[#4A90D9]/25 relative overflow-hidden"
              initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.65, delay: 0.15 }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#4A90D9]/6 via-[#2E8B7A]/4 to-[#D4A843]/6 light:from-blue-50 light:to-amber-50" />
              <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-[#4A90D9]/8 blur-3xl" aria-hidden="true" />
              <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-[#D4A843]/8 blur-3xl" aria-hidden="true" />
              <div className="relative p-8 flex flex-col md:flex-row md:items-center gap-8">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#4A90D9] bg-[#4A90D9]/10 px-2.5 py-1 rounded">
                      Funding
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#D4A843] bg-[#D4A843]/10 px-2.5 py-1 rounded">
                      Seeking Investors
                    </span>
                  </div>
                  <h3 className="text-xl md:text-2xl font-black mb-2 tracking-tight">
                    We're looking for funding to build the app.
                  </h3>
                  <p className="text-slate-400 light:text-slate-600 text-sm leading-relaxed max-w-2xl mb-5">
                    Calgary Watch has proven community demand. The next step is a native
                    iOS and Android app with push alerts, an enhanced trust system, and
                    expansion to other cities. We're actively seeking investors, grants,
                    and strategic partners who believe in community-first public safety
                    technology.
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    {[
                      { label: 'Native app development', icon: Cpu },
                      { label: 'Push notification infrastructure', icon: Zap },
                      { label: 'Multi-city expansion', icon: Globe },
                      { label: 'Trust & AI layer', icon: TrendingUp },
                    ].map(({ label, icon: Icon }) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 light:text-slate-700 bg-white/5 light:bg-white border border-white/10 light:border-slate-200 px-3 py-1.5 rounded-full"
                      >
                        <Icon size={11} />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                <MagneticButton
                  tag="a"
                  href="mailto:jorti104@mtroyal.ca?subject=Investment%20Inquiry%20-%20Calgary%20Watch"
                  className="shrink-0 inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] text-white text-sm font-black shadow-xl shadow-[#4A90D9]/20 hover:shadow-[#4A90D9]/35 transition-shadow cursor-pointer whitespace-nowrap"
                >
                  <Mail size={15} />
                  Reach Out
                  <ArrowRight size={13} />
                </MagneticButton>
              </div>
            </motion.div>

          </div>
        </section>

        {/* ==============================================================
            CONTACT — centered, dramatic
            ============================================================== */}
        <section className="py-24 md:py-32 px-6 bg-slate-900/50 light:bg-slate-50/60 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(74,144,217,0.05),transparent_60%)]" aria-hidden="true" />
          <div className="max-w-2xl mx-auto text-center relative z-10">
            <motion.div
              initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.65 }}
            >
              <span className="inline-block text-[10px] font-black uppercase tracking-[0.25em] text-[#4A90D9] mb-4">
                Get In Touch
              </span>
              <h2 className="text-4xl md:text-5xl font-black leading-[1.08] tracking-tight mb-4">
                Questions? Ideas?{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A]">
                  Let's talk.
                </span>
              </h2>
              <p className="text-lg text-slate-400 light:text-slate-600 leading-relaxed mb-10">
                Whether you want to partner, have suggestions, or just want to chat
                about the platform, we'd love to hear from you.
              </p>
              <MagneticButton
                tag="a"
                href="mailto:jorti104@mtroyal.ca"
                className="inline-flex items-center gap-3 rounded-xl px-8 py-4 text-base font-black text-white bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] shadow-xl shadow-[#4A90D9]/20 hover:shadow-[#4A90D9]/35 transition-shadow cursor-pointer"
              >
                <Mail size={18} />
                jorti104@mtroyal.ca
                <ArrowRight size={16} />
              </MagneticButton>
            </motion.div>
          </div>
        </section>

        {/* ==============================================================
            FINAL CTA — full-bleed with background image
            ============================================================== */}
        <section className="relative py-28 md:py-40 px-6 overflow-hidden">
          {/* Background image */}
          <div className="absolute inset-0">
            <img
              src={publicAsset('images/calgary5.webp')}
              alt=""
              width={1200} height={600}
              aria-hidden="true"
              className="w-full h-full object-cover opacity-20 light:opacity-25"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/85 to-slate-950/70 light:from-[rgb(255,250,243)] light:via-[rgba(255,250,243,0.9)] light:to-[rgba(255,250,243,0.8)]" />
          </div>

          {/* Center glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[20rem] rounded-full blur-[120px] opacity-10"
            style={{ background: 'linear-gradient(135deg, #4A90D9, #2E8B7A)' }}
            aria-hidden="true"
          />

          <motion.div
            className="relative z-10 max-w-4xl mx-auto text-center"
            initial={prefersReducedMotion() ? undefined : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-5xl md:text-7xl font-black leading-[1] tracking-tight mb-6">
              See Calgary{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#D4A843]">
                live right now
              </span>
            </h2>
            <p className="text-lg text-slate-400 light:text-slate-600 leading-relaxed mb-12 max-w-xl mx-auto">
              Open the map, explore incidents in your neighbourhood, and join a
              community that's building real-time awareness for Calgary.
            </p>

            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <MagneticButton
                onClick={() => navigate('/map')}
                className="inline-flex items-center justify-center gap-2.5 rounded-xl px-10 py-4 font-black text-base text-white bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] shadow-2xl shadow-[#4A90D9]/25 hover:shadow-[#4A90D9]/40 transition-shadow cursor-pointer"
              >
                <MapPin size={18} />
                Open Live Map
              </MagneticButton>
              <MagneticButton
                onClick={() => navigate('/map?report=true')}
                className="inline-flex items-center justify-center gap-2.5 rounded-xl px-10 py-4 font-black text-base bg-white/10 light:bg-slate-100/80 border-2 border-white/20 light:border-slate-300 hover:bg-white/15 light:hover:bg-slate-200 text-white light:text-slate-900 transition-colors cursor-pointer backdrop-blur-sm"
              >
                <Zap size={18} />
                Report Incident
              </MagneticButton>
            </div>
          </motion.div>
        </section>
      </main>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <footer className="relative py-10 px-6 border-t border-white/5 light:border-stone-200/80 bg-slate-950 light:bg-[rgb(255,250,243)] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(74,144,217,0.04),transparent_60%)]" aria-hidden="true" />
        <div className="max-w-7xl mx-auto relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={publicAsset('icon.svg')}
              alt="Calgary Watch"
              width={28} height={28}
              className="w-7 h-7 object-contain opacity-60"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="text-xs font-black uppercase tracking-widest text-slate-600 light:text-slate-500">
              Calgary Watch
            </span>
          </div>
          <p className="text-xs text-slate-700 light:text-slate-500 font-bold uppercase tracking-widest text-center">
            Built for Real-Time Awareness &bull; &copy; 2026
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/map')}
              className="text-xs text-slate-600 light:text-slate-500 hover:text-[#4A90D9] transition-colors font-bold uppercase tracking-wider cursor-pointer"
            >
              Live Map
            </button>
            <a
              href="mailto:jorti104@mtroyal.ca"
              className="text-xs text-slate-600 light:text-slate-500 hover:text-[#4A90D9] transition-colors font-bold uppercase tracking-wider"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
