/**
 * AboutPage.tsx
 *
 * Calgary Watch — Redesigned About page with premium desktop/mobile UI
 *
 * Features:
 *  - Full-width hero with background image
 *  - 3D card animations with image integration
 *  - Professional section layout
 *  - Responsive grid designs
 *  - Glassmorphism + depth effects
 *  - Full dark/light theme support
 */

import { useEffect, useRef, memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, animate } from 'motion/react';
import { db } from '@/src/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import {
  ArrowLeft,
  MapPin,
  Zap,
  Mail,
  Sparkles,
  Users,
  Rocket,
  ArrowRight,
  Clock,
  Shield,
  Briefcase,
  MapIcon,
  Eye,
  HeartHandshake,
  Handshake,
} from 'lucide-react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// Volunteer form card
// ---------------------------------------------------------------------------
function VolunteerCard({ reducedMotion }: { reducedMotion: boolean }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [whyJoin, setWhyJoin] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  const roles = ['Marketing', 'Development', 'Administration'];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !role || !whyJoin.trim()) return;
    setStatus('submitting');
    try {
      await addDoc(collection(db, 'volunteers'), {
        name: name.trim().slice(0, 100),
        email: email.trim().slice(0, 200),
        role,
        whyJoin: whyJoin.trim().slice(0, 500),
        createdAt: serverTimestamp(),
      });
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  return (
    <motion.div
      initial={reducedMotion ? undefined : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="rounded-2xl border border-[#2E8B7A]/40 bg-gradient-to-br from-[#2E8B7A]/10 to-slate-950/60 light:from-teal-50 light:to-white p-8 flex flex-col gap-5 relative overflow-hidden"
    >
      <div className="absolute top-4 right-4 text-[10px] font-black uppercase tracking-wider text-[#2E8B7A] bg-[#2E8B7A]/15 border border-[#2E8B7A]/30 px-2 py-1 rounded-full">
        Open
      </div>
      <div className="w-12 h-12 rounded-xl bg-[#2E8B7A]/15 flex items-center justify-center">
        <HeartHandshake size={24} className="text-[#2E8B7A]" />
      </div>
      <div>
        <span className="text-[10px] font-black uppercase tracking-widest text-[#2E8B7A] bg-[#2E8B7A]/10 px-2 py-1 rounded">
          Volunteers
        </span>
        <h3 className="text-xl font-black mt-3 mb-2">Help keep Calgary informed</h3>
        <p className="text-slate-400 light:text-slate-600 text-sm leading-relaxed">
          We're looking for passionate Calgarians to join us. As a trusted community platform, every volunteer shapes the integrity of Calgary Watch. Your contributions ensure we remain accurate, responsive, and worthy of the community's trust.
        </p>
      </div>

      {status === 'done' ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-2 rounded-xl bg-[#2E8B7A]/15 border border-[#2E8B7A]/30 px-5 py-6 text-center"
        >
          <p className="text-[#2E8B7A] font-bold text-sm">Thanks, {name.split(' ')[0]}! We'll be in touch.</p>
          <p className="text-slate-400 text-xs mt-1">Your interest has been recorded.</p>
        </motion.div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-1">
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            className="w-full bg-white/5 light:bg-white border border-white/15 light:border-slate-300 rounded-xl px-4 py-2.5 text-sm text-white light:text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-[#2E8B7A]/60 transition-colors"
          />
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            required
            className="w-full bg-white/5 light:bg-white border border-white/15 light:border-slate-300 rounded-xl px-4 py-2.5 text-sm text-white light:text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-[#2E8B7A]/60 transition-colors"
          />
          <div>
            <p className="text-[11px] text-slate-500 mb-2 uppercase tracking-widest font-semibold">I want to help with</p>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                    role === r
                      ? 'bg-[#2E8B7A] border-[#2E8B7A] text-white'
                      : 'bg-transparent border-white/20 light:border-slate-300 text-slate-400 light:text-slate-600 hover:border-[#2E8B7A]/50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-2 uppercase tracking-widest font-semibold">Why do you want to join?</p>
            <textarea
              placeholder="Tell us why you're interested in building a trusted platform for Calgary..."
              value={whyJoin}
              onChange={(e) => setWhyJoin(e.target.value)}
              maxLength={500}
              required
              rows={3}
              className="w-full bg-white/5 light:bg-white border border-white/15 light:border-slate-300 rounded-xl px-4 py-2.5 text-sm text-white light:text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-[#2E8B7A]/60 transition-colors resize-none"
            />
            <p className="text-[10px] text-slate-600 mt-1 text-right">{whyJoin.length}/500</p>
          </div>
          {status === 'error' && (
            <p className="text-red-400 text-xs">Something went wrong — try emailing us directly.</p>
          )}
          <motion.button
            type="submit"
            disabled={status === 'submitting' || !name.trim() || !email.trim() || !role || !whyJoin.trim()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="w-full rounded-xl py-2.5 bg-[#2E8B7A] text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {status === 'submitting' ? 'Sending…' : 'Express Interest'}
          </motion.button>
        </form>
      )}
    </motion.div>
  );
}

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

export default function AboutPage() {
  const navigate = useNavigate();
  const reducedMotion = prefersReducedMotion();

  return (
    <div className="min-h-screen bg-slate-950 light:bg-white text-white light:text-slate-900 font-sans overflow-x-hidden">

      {/* ================================================================
          NAVIGATION
          ================================================================ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/85 light:bg-white/95 backdrop-blur-xl border-b border-white/5 light:border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <motion.div className="flex items-center gap-3" whileHover={{ scale: 1.02 }}>
            <img
              src="/icon.webp"
              alt="Calgary Watch"
              className="w-16 h-16 object-contain drop-shadow-lg flex-shrink-0"
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement;
                const fallback = document.createElement('div');
                fallback.className = 'w-16 h-16 rounded-lg bg-gradient-to-br from-[#4A90D9] to-[#2E8B7A] flex items-center justify-center';
                el.replaceWith(fallback);
              }}
            />
            <span className="text-xl font-bold tracking-tight">Calgary Watch</span>
          </motion.div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/')}
            className="rounded-full px-6 py-2 bg-white/5 light:bg-slate-100 border border-white/10 light:border-slate-300 hover:bg-white/10 light:hover:bg-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
            Home
          </motion.button>
        </div>
      </nav>

      <main className="pt-24 pb-20">

        {/* ================================================================
            HERO SECTION — Full width with image background
            ================================================================ */}
        <motion.section
          initial={reducedMotion ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="relative h-screen md:h-[85vh] overflow-hidden flex items-end"
        >
          {/* Background image with overlay */}
          <motion.div
            className="absolute inset-0"
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          >
            <img
              src="/images/hero-wide.webp"
              alt="Calgary skyline panorama"
              className="w-full h-full object-cover"
              loading="eager"
            />
            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />
            {/* Additional color gradient for depth */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#1a2a3a]/40 via-transparent to-[#2a1f1f]/30" />
          </motion.div>

          {/* Hero content */}
          <motion.div
            className="relative z-10 max-w-7xl mx-auto px-6 w-full pb-16 md:pb-20"
            initial={reducedMotion ? undefined : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="max-w-3xl">
              <motion.div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-md mb-6"
                whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(74,144,217,0.3)' }}
              >
                <Sparkles size={16} className="text-[#4A90D9]" />
                <span className="text-xs font-black uppercase tracking-wider">Designed for Calgary</span>
              </motion.div>

              <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] mb-6">
                Real-time{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#D4A843]">
                  city intelligence
                </span>
              </h1>

              <p className="text-lg md:text-xl text-slate-200 leading-relaxed max-w-2xl mb-8">
                Calgary Watch turns community reports and verified data into actionable awareness. See what's happening on the map, right now.
              </p>

              <motion.div className="flex flex-wrap gap-4">
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 20px 50px rgba(74,144,217,0.4)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/map')}
                  className="rounded-xl px-8 py-4 text-lg font-bold text-white bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] hover:from-blue-600 hover:to-teal-600 transition-all duration-300 flex items-center gap-2 cursor-pointer"
                >
                  <MapPin size={20} />
                  View Live Map
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/map?report=true')}
                  className="rounded-xl px-8 py-4 text-lg font-bold bg-white/10 border-2 border-white/30 hover:bg-white/15 text-white transition-all duration-300 flex items-center gap-2 cursor-pointer"
                >
                  <Zap size={20} />
                  Report Now
                </motion.button>
              </motion.div>
            </div>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="w-6 h-10 border-2 border-white/30 rounded-full flex items-start justify-center p-2">
              <motion.div className="w-1 h-2 bg-white/60 rounded-full" />
            </div>
          </motion.div>
        </motion.section>

        {/* ================================================================
            ABOUT SECTION — Who we are
            ================================================================ */}
        <section className="py-20 md:py-32 px-6 bg-slate-950 light:bg-white">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.7 }}
              className="max-w-3xl mb-16"
            >
              <span className="inline-block text-xs font-black uppercase tracking-widest text-[#4A90D9] mb-4">
                Who We Are
              </span>
              <h2 className="text-4xl md:text-6xl font-black leading-[1.15] mb-6">
                Built for Calgarians, by Calgarians
              </h2>
              <p className="text-lg text-slate-400 light:text-slate-600 leading-relaxed">
                Calgary Watch isn't generic. We understand this city — its neighbourhoods, its geography, its rhythm. We built a platform that turns local awareness into action, connecting people with the information they need to stay safe and informed.
              </p>
            </motion.div>

            {/* Stats or Values Grid */}
            <motion.div
              className="grid md:grid-cols-3 gap-6"
              initial={reducedMotion ? undefined : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.7, staggerChildren: 0.1 }}
            >
              {[
                { icon: Clock, label: 'Real-Time', desc: 'Incidents appear on the map in seconds' },
                { icon: Shield, label: 'Verified', desc: 'Community reports + official CPS data' },
                { icon: Users, label: 'Community', desc: 'Powered by Calgary residents' },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={reducedMotion ? undefined : { opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.35, delay: i * 0.06 }}
                  whileHover={{ scale: 1.06, y: -8 }}
                  className="rounded-2xl border border-white/10 light:border-slate-300 bg-gradient-to-br from-slate-900/70 to-slate-950/50 light:from-white light:to-slate-50 p-8 group cursor-pointer transition-all"
                >
                  <motion.div
                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#4A90D9] to-[#2E8B7A] flex items-center justify-center mb-4"
                    whileHover={{ scale: 1.15, rotate: 10 }}
                  >
                    <item.icon className="text-white" size={24} />
                  </motion.div>
                  <h3 className="text-xl font-black mb-2">{item.label}</h3>
                  <p className="text-slate-400 light:text-slate-600">{item.desc}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* Animated platform numbers */}
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-px bg-white/8 light:bg-slate-200 rounded-2xl overflow-hidden border border-white/10 light:border-slate-200"
            >
              {[
                { value: 2000, suffix: '+', label: 'Incidents mapped', color: '#4A90D9' },
                { value: 47, suffix: '', label: 'Neighbourhoods covered', color: '#2E8B7A' },
                { value: 30, suffix: 's', prefix: '< ', label: 'Report to map', color: '#D4A843' },
                { value: 100, suffix: '+', label: 'Active contributors', color: '#a855f7' },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="bg-slate-950 light:bg-white px-6 py-10 flex flex-col items-center text-center"
                >
                  <div
                    className="text-5xl md:text-6xl font-black tabular-nums mb-3 tracking-tight"
                    style={{ color: stat.color }}
                  >
                    <AnimatedCounter
                      to={stat.value}
                      suffix={stat.suffix}
                      prefix={stat.prefix ?? ''}
                      duration={1.8 + i * 0.25}
                    />
                  </div>
                  <p className="text-sm font-semibold text-slate-400 light:text-slate-500">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ================================================================
            STORY SECTION — How it works with 3D cards & images
            ================================================================ */}
        <section className="py-20 md:py-32 px-6 bg-slate-900/50 light:bg-slate-50">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.7 }}
              className="mb-16"
            >
              <span className="inline-block text-xs font-black uppercase tracking-widest text-[#4A90D9] mb-4">
                How It Works
              </span>
              <h2 className="text-4xl md:text-6xl font-black leading-[1.15] max-w-3xl">
                Three steps to live city intelligence
              </h2>
            </motion.div>

            {/* 3 Step Cards with Images */}
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  num: '01',
                  title: 'Report',
                  desc: 'Spot something? Drop a pin and report it. Under 30 seconds.',
                  image: '/images/calgary2.webp',
                  color: '#4A90D9',
                },
                {
                  num: '02',
                  title: 'Share',
                  desc: 'Your report appears on the live map instantly for all Calgarians.',
                  image: '/images/calgary3.webp',
                  color: '#2E8B7A',
                },
                {
                  num: '03',
                  title: 'Decide',
                  desc: 'Context and verified data help you decide what to do next.',
                  image: '/images/calgary5.webp',
                  color: '#D4A843',
                },
              ].map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={reducedMotion ? undefined : { opacity: 0, y: 40, rotateX: 20 }}
                  whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.7, delay: i * 0.065 }}
                  whileHover={{ y: -12 }}
                  style={{ perspective: '1200px' }}
                  className="group"
                >
                  <div className="rounded-[1.5rem] border border-white/10 light:border-slate-300 overflow-hidden bg-gradient-to-br from-slate-900/80 to-slate-950/60 light:from-white light:to-slate-50 shadow-2xl h-full flex flex-col transition-all duration-300 hover:shadow-2xl hover:border-white/20 light:hover:border-slate-400">
                    {/* Image top */}
                    <div className="relative h-48 overflow-hidden">
                      <motion.img
                        src={step.image}
                        alt={step.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        whileHover={{ scale: 1.1 }}
                        transition={{ duration: 0.35 }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950" />

                      {/* Step number badge */}
                      <motion.div
                        className="absolute top-4 right-4 w-12 h-12 rounded-xl border-2 backdrop-blur-md"
                        style={{
                          borderColor: step.color,
                          background: `${step.color}20`,
                        }}
                        whileHover={{ scale: 1.2, rotate: 8 }}
                      >
                        <div className="w-full h-full flex items-center justify-center font-black text-lg" style={{ color: step.color }}>
                          {step.num}
                        </div>
                      </motion.div>
                    </div>

                    {/* Content */}
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="mb-3">
                        <motion.div
                          className="inline-block h-1 rounded-full mb-3"
                          style={{ background: step.color }}
                          initial={{ width: 0 }}
                          whileInView={{ width: 32 }}
                          transition={{ duration: 0.35, delay: i * 0.065 }}
                        />
                      </div>
                      <h3 className="text-2xl font-black mb-2">{step.title}</h3>
                      <p className="text-slate-400 light:text-slate-600 flex-1">{step.desc}</p>
                      <motion.div
                        className="mt-4 inline-flex items-center gap-2 text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: step.color }}
                      >
                        <span>Learn more</span>
                        <motion.div animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                          →
                        </motion.div>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================
            MISSION SECTION — What drives us
            ================================================================ */}
        <section className="py-20 md:py-32 px-6 bg-slate-950 light:bg-white">
          <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
            {/* Left: Image */}
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.7 }}
              className="rounded-2xl overflow-hidden border border-white/10 light:border-slate-300"
            >
              <img
                src="/images/calgary8.webp"
                alt="Calgary downtown"
                className="w-full h-96 object-cover"
                loading="lazy"
              />
            </motion.div>

            {/* Right: Content */}
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.7 }}
            >
              <span className="inline-block text-xs font-black uppercase tracking-widest text-[#4A90D9] mb-4">
                Our Mission
              </span>
              <h2 className="text-4xl md:text-5xl font-black leading-[1.15] mb-6">
                Connected, aware, informed
              </h2>
              <p className="text-lg text-slate-400 light:text-slate-600 leading-relaxed mb-6">
                We believe Calgarians deserve real-time awareness of what's happening around them. Not endless notifications. Not algorithmic feeds. Just clear, trustworthy information that helps you decide.
              </p>
              <div className="space-y-4 mb-8">
                {[
                  'Community-powered incident reporting',
                  'Real-time map updates and context',
                  'Verified data from official sources',
                  'Privacy-first, anonymous reporting option',
                ].map((point, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3"
                    initial={reducedMotion ? undefined : { opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.06 }}
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-white text-sm font-black">✓</span>
                    </div>
                    <span className="text-slate-300 light:text-slate-700">{point}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ================================================================
            GET INVOLVED — Team, Volunteers, Business Partners
            ================================================================ */}
        <section className="py-20 md:py-32 px-6 bg-slate-900/50 light:bg-slate-50">
          <div className="max-w-7xl mx-auto">

            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.7 }}
              className="max-w-2xl mb-16"
            >
              <span className="inline-block text-xs font-black uppercase tracking-widest text-[#4A90D9] mb-4">
                Get Involved
              </span>
              <h2 className="text-4xl md:text-5xl font-black leading-[1.15] mb-4">
                Calgary Watch is built by the community — and it grows with it.
              </h2>
              <p className="text-lg text-slate-400 light:text-slate-600 leading-relaxed mb-4">
                We're a small but dedicated team, and we're always looking for people who care about this city.
              </p>
              <p className="text-base text-slate-400 light:text-slate-600 leading-relaxed border-l-4 border-[#4A90D9]/40 pl-4 py-2">
                <span className="font-bold text-white light:text-slate-900">Trust is everything.</span> When Calgarians rely on us to stay informed about what's happening in their neighbourhoods, we accept a responsibility to be accurate, responsive, and transparent. Every volunteer, every verification, every decision shapes whether Calgary Watch remains a platform they can depend on. Join us in building something our city can trust.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6">

              {/* Card 1: Our Team */}
              <motion.div
                initial={reducedMotion ? undefined : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.6, delay: 0 }}
                className="rounded-2xl border border-white/10 light:border-slate-300 bg-gradient-to-br from-slate-900/80 to-slate-950/60 light:from-white light:to-slate-50 p-8 flex flex-col gap-5"
              >
                <div className="w-12 h-12 rounded-xl bg-[#4A90D9]/15 flex items-center justify-center">
                  <Eye size={24} className="text-[#4A90D9]" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#4A90D9] bg-[#4A90D9]/10 px-2 py-1 rounded">
                    Our Team
                  </span>
                  <h3 className="text-xl font-black mt-3 mb-2">Always watching, always here</h3>
                  <p className="text-slate-400 light:text-slate-600 text-sm leading-relaxed">
                    A dedicated team actively monitors Calgary Watch around the clock — reviewing reports, verifying incidents, and making sure the map stays accurate and trustworthy. Every pin you see has a real person behind it.
                  </p>
                </div>
              </motion.div>

              {/* Card 2: Volunteers — inline form */}
              <VolunteerCard reducedMotion={reducedMotion} />

              {/* Card 3: Business Partners */}
              <motion.div
                initial={reducedMotion ? undefined : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="rounded-2xl border border-[#D4A843]/30 bg-gradient-to-br from-[#D4A843]/8 to-slate-950/60 light:from-amber-50 light:to-white p-8 flex flex-col gap-5 relative overflow-hidden"
              >
                <div className="absolute top-4 right-4 text-[10px] font-black uppercase tracking-wider text-[#D4A843] bg-[#D4A843]/15 border border-[#D4A843]/30 px-2 py-1 rounded-full">
                  Open
                </div>
                <div className="w-12 h-12 rounded-xl bg-[#D4A843]/15 flex items-center justify-center">
                  <Handshake size={24} className="text-[#D4A843]" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#D4A843] bg-[#D4A843]/10 px-2 py-1 rounded">
                    Business Partners
                  </span>
                  <h3 className="text-xl font-black mt-3 mb-2">Grow with Calgary</h3>
                  <p className="text-slate-400 light:text-slate-600 text-sm leading-relaxed mb-4">
                    We're looking for Calgary-based businesses and organizations who want to be part of a platform that thousands of residents rely on. Sponsorship, integrations, local partnerships — let's build something together.
                  </p>
                  <ul className="space-y-1.5 text-sm text-slate-300 light:text-slate-700">
                    {['Sponsored neighbourhood alerts', 'Data & API integration', 'Co-branding opportunities'].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D4A843] flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <motion.a
                  href="mailto:jorti104@mtroyal.ca?subject=Partnership%20Inquiry"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-[#D4A843] hover:text-amber-400 transition-colors cursor-pointer"
                >
                  <Mail size={15} />
                  Get in touch
                  <ArrowRight size={14} />
                </motion.a>
              </motion.div>

            </div>
          </div>
        </section>

        {/* ================================================================
            CONTACT SECTION — Get in touch
            ================================================================ */}
        <section className="py-20 md:py-32 px-6 bg-slate-900/50 light:bg-slate-50">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.7 }}
            >
              <span className="inline-block text-xs font-black uppercase tracking-widest text-[#4A90D9] mb-4">
                Get In Touch
              </span>
              <h2 className="text-4xl md:text-5xl font-black leading-[1.15] mb-6">
                Questions? Ideas? Let's talk.
              </h2>
              <p className="text-lg text-slate-400 light:text-slate-600 leading-relaxed mb-12">
                Whether you want to partner, have suggestions, or just want to chat about the platform, we'd love to hear from you.
              </p>

              <motion.a
                href="mailto:jorti104@mtroyal.ca"
                whileHover={{ scale: 1.08, boxShadow: '0 30px 60px rgba(74,144,217,0.3)' }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center gap-3 rounded-xl px-8 py-4 text-lg font-bold text-white bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] hover:from-blue-600 hover:to-teal-600 transition-all duration-300 cursor-pointer"
              >
                <Mail size={20} />
                jorti104@mtroyal.ca
                <ArrowRight size={18} />
              </motion.a>
            </motion.div>
          </div>
        </section>

        {/* ================================================================
            FINAL CTA
            ================================================================ */}
        <section className="py-20 md:py-32 px-6 bg-slate-950 light:bg-white relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[140px] opacity-15"
              style={{
                background: 'linear-gradient(135deg, #4A90D9, #2E8B7A)',
              }}
            />
          </div>

          <motion.div
            className="max-w-4xl mx-auto text-center relative z-10"
            initial={reducedMotion ? undefined : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-4xl md:text-6xl font-black leading-[1.15] mb-6">
              See Calgary{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4A90D9] via-[#2E8B7A] to-[#D4A843]">
                live right now
              </span>
            </h2>
            <p className="text-lg text-slate-400 light:text-slate-600 mb-10 max-w-2xl mx-auto">
              Open the map, explore incidents in your neighbourhood, and join a community that's building real-time awareness for Calgary.
            </p>

            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.08, boxShadow: '0 30px 60px rgba(74,144,217,0.35)' }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/map')}
                className="rounded-xl px-10 py-4 text-lg font-bold text-white bg-gradient-to-r from-[#4A90D9] to-[#2E8B7A] hover:from-blue-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <MapPin size={20} />
                Open Live Map
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/map?report=true')}
                className="rounded-xl px-10 py-4 text-lg font-bold bg-white/10 light:bg-slate-100 border-2 border-white/20 light:border-slate-300 hover:bg-white/15 light:hover:bg-slate-200 text-white light:text-slate-900 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Zap size={20} />
                Report Incident
              </motion.button>
            </div>
          </motion.div>
        </section>
      </main>

      {/* ================================================================
          FOOTER
          ================================================================ */}
      <footer className="py-8 px-6 border-t border-white/5 light:border-slate-200 bg-slate-950 light:bg-white text-center">
        <motion.p
          className="text-xs text-slate-600 light:text-slate-500 uppercase font-bold tracking-widest"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          Calgary Watch &bull; Built for Real-Time Awareness &bull; &copy; 2026
        </motion.p>
      </footer>
    </div>
  );
}
