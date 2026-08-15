import { useEffect, useRef, useState, memo } from 'react';
import type { ReactNode, ElementType, CSSProperties } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  animate,
  AnimatePresence,
  easeInOut,
  easeOut,
} from 'motion/react';
import type { MotionValue } from 'motion/react';
import {
  AlertCircle,
  Bike,
  Car,
  CloudRain,
  Construction,
  Siren,
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Phone,
  X,
  Menu,
  Radio,
  ShieldCheck,
  Users,
  Lock,
  Activity,
  Crosshair,
} from 'lucide-react';
import { publicAsset, cn } from '@/src/lib/utils';
import { db } from '@/src/firebase';
import { addDoc, collection } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Design tokens — "field atlas" system. Light-only by design.
// ---------------------------------------------------------------------------
const T = {
  paper: '#F7F3EA',      // map-paper base
  panel: '#FFFDF8',      // raised card surface
  ink: '#1C2B3A',        // river-slate ink (text)
  inkSoft: '#5A6B7D',    // secondary text
  line: '#D9D2C3',       // hairline rules on paper
  sky: '#4A90D9',        // big Alberta sky
  bow: '#2E8B7A',        // Bow River teal
  gold: '#D4A843',       // prairie gold
  red: '#C0392B',        // Stampede red — alerts only
  night: '#0C1D2E',      // night-watch band
  nightPanel: '#122740',
  nightText: '#EDF2F0',
  nightSoft: '#8FA3B5',
};

const CATEGORIES = [
  { key: 'crime', label: 'Crime', color: '#ef4444', icon: AlertCircle, desc: 'Break-ins, stolen bikes and vehicles, vandalism, suspicious activity — flagged by the neighbours who saw it.', sample: 'Car break-in · Inglewood' },
  { key: 'traffic', label: 'Traffic', color: '#f59e0b', icon: Car, desc: 'Collisions, closures and stalls on Deerfoot, Stoney, Glenmore and your own street.', sample: 'Vehicle collision · Deerfoot Trail NB' },
  { key: 'weather', label: 'Weather', color: '#60a5fa', icon: CloudRain, desc: 'Icy roads, hail cells, blowing snow — the chinook giveth and the chinook taketh away.', sample: 'Icy road conditions · NW Calgary' },
  { key: 'infrastructure', label: 'Infrastructure', color: '#f97316', icon: Construction, desc: 'Water main breaks, outages, flooded underpasses and potholes big enough to name.', sample: 'Water main break · 17 Ave SW' },
  { key: 'emergency', label: 'Emergency', color: '#a855f7', icon: Siren, desc: 'Active fires, EMS activity and evacuation notices — the reports that cannot wait.', sample: 'Structure fire · Forest Lawn' },
] as const;

const TICKER_ITEMS: Array<{ icon: ElementType; color: string; title: string; area: string }> = [
  { icon: Bike, color: '#ef4444', title: 'Stolen bike — blue Norco', area: 'Bridgeland' },
  { icon: Car, color: '#f59e0b', title: 'Vehicle collision', area: 'Deerfoot Trail NB' },
  { icon: Car, color: '#ef4444', title: 'Car break-in', area: 'Inglewood' },
  { icon: CloudRain, color: '#60a5fa', title: 'Icy road conditions', area: 'NW Calgary' },
  { icon: Construction, color: '#f97316', title: 'Water main break', area: '17 Ave SW' },
  { icon: Siren, color: '#a855f7', title: 'Structure fire', area: 'Forest Lawn' },
  { icon: AlertCircle, color: '#ef4444', title: 'Break & enter', area: 'Ramsay' },
  { icon: Car, color: '#ef4444', title: 'Stolen vehicle — grey F-150', area: 'Marlborough' },
  { icon: Car, color: '#f59e0b', title: 'Stalled vehicle', area: 'Macleod Trail' },
  { icon: CloudRain, color: '#60a5fa', title: 'Blowing snow advisory', area: 'SE Calgary' },
  { icon: Construction, color: '#f97316', title: 'Pothole — major', area: 'Memorial Dr NW' },
  { icon: Siren, color: '#a855f7', title: 'Medical emergency', area: 'Sunridge' },
  { icon: AlertCircle, color: '#ef4444', title: 'Graffiti report', area: 'Kensington' },
  { icon: Car, color: '#f59e0b', title: 'Road closure', area: '9 Ave SE' },
];

// "Near me" showcase — the neighbourhood radius view (Inglewood vantage).
const NEARBY_POSTS: Array<{
  icon: ElementType; color: string; title: string; meta: string; time: string; contact?: string;
}> = [
  { icon: Car, color: '#ef4444', title: 'Car break-in — glass on the road', meta: 'Inglewood · 400 m', time: '38 min' },
  { icon: Bike, color: '#ef4444', title: 'Stolen bike — blue Norco Storm 3', meta: 'Ramsay · 1.2 km', time: '2 h', contact: 'Call Dana · 403-555-0119' },
  { icon: Car, color: '#ef4444', title: 'Stolen vehicle — grey F-150', meta: 'Alyth · 2.4 km', time: '5 h' },
  { icon: CloudRain, color: '#60a5fa', title: 'Icy sidewalk on the school route', meta: 'Inglewood · 650 m', time: '1 h' },
];

const QUADRANTS = [
  { code: 'NW', name: 'Northwest', places: 'Bowness · Kensington · Nose Hill · University District', from: { x: -60, y: -60 }, img: 'images/calgary4.webp', imgAlt: 'Peace Bridge over the Bow River' },
  { code: 'NE', name: 'Northeast', places: 'Saddle Ridge · Marlborough · Airport · Bridgeland', from: { x: 60, y: -60 }, img: 'images/calgary1.webp', imgAlt: 'Calgary skyline under a golden prairie sky' },
  { code: 'SW', name: 'Southwest', places: 'Beltline · Marda Loop · Signal Hill · Glenmore', from: { x: -60, y: 60 }, img: 'images/calgary2.webp', imgAlt: 'Calgary Tower at golden hour' },
  { code: 'SE', name: 'Southeast', places: 'Inglewood · Forest Lawn · Seton · Mahogany', from: { x: 60, y: 60 }, img: 'images/calgary7.webp', imgAlt: 'Saddledome and downtown from Scotsman Hill' },
];

// "One day on the watch" — dawn to after-midnight camera dolly.
const DAY_PLATES = [
  { src: 'images/calgary1.webp', time: '07:12', caption: 'First light over the core', note: 'quiet · 0 open reports', color: T.gold },
  { src: 'images/calgary5.webp', time: '12:38', caption: 'Three neighbours, one map', note: 'crime · graffiti logged, Kensington', color: '#ef4444' },
  { src: 'images/calgary7.webp', time: '19:26', caption: 'Saddledome from Scotsman Hill', note: 'traffic · Macleod Tr slowdown', color: '#f59e0b' },
  { src: 'images/calgary8.webp', time: '22:04', caption: 'Fireworks over Stampede Park', note: 'weather · clear skies, 14°C', color: '#60a5fa' },
  { src: 'images/calgary3.webp', time: '01:47', caption: 'Deerfoot after midnight', note: 'infrastructure · signal fault cleared', color: '#f97316' },
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

// ---------------------------------------------------------------------------
// Shared motion helpers
// ---------------------------------------------------------------------------
const EASE = [0.16, 1, 0.3, 1] as const;

function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children, color = T.bow, light = false }: { children: ReactNode; color?: string; light?: boolean }) {
  return (
    <p
      className="font-mono text-[11px] font-semibold uppercase tracking-[0.32em] flex items-center gap-3"
      style={{ color }}
    >
      <span className="inline-block h-px w-8" style={{ background: color, opacity: light ? 0.9 : 0.7 }} aria-hidden="true" />
      {children}
    </p>
  );
}

const Counter = memo(function Counter({
  to, prefix = '', suffix = '', decimals = 0, duration = 1.8,
}: { to: number; prefix?: string; suffix?: string; decimals?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (!inView || !ref.current) return;
    if (reduced) { ref.current.textContent = `${prefix}${to.toFixed(decimals)}${suffix}`; return; }
    const ctrl = animate(0, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate(v) { if (ref.current) ref.current.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`; },
    });
    return () => ctrl.stop();
  }, [inView, to, prefix, suffix, decimals, duration, reduced]);
  return <span ref={ref}>{prefix}0{suffix}</span>;
});

// ---------------------------------------------------------------------------
// River rail — fixed scroll-progress line, the page's signature element.
// The Bow River "fills" with teal as you travel down the city.
// ---------------------------------------------------------------------------
function RiverRail({ progress }: { progress: MotionValue<number> }) {
  const scaleY = useSpring(progress, { stiffness: 90, damping: 24, mass: 0.4 });
  const dotY = useTransform(scaleY, (v) => `${Math.min(Math.max(v, 0), 1) * 100}%`);
  return (
    <div className="fixed left-7 top-24 bottom-24 z-40 hidden xl:flex flex-col items-center pointer-events-none select-none" aria-hidden="true">
      {/* Coordinates run along the rail rather than across it. Set horizontally
          they were ~55px wide, and because the rail is fixed while the hero
          scrolls beneath it, the bottom label landed on top of the hero stat
          strip — rendering as "1145°C1EGORIES". Vertical text keeps the whole
          rail inside its own ~12px column at every scroll position. */}
      <span
        className="font-mono text-[9px] tracking-[0.2em] mb-3"
        style={{ color: T.inkSoft, writingMode: 'vertical-rl', textOrientation: 'mixed' }}
      >
        51.05°N
      </span>
      <div className="relative flex-1 w-px" style={{ background: T.line }}>
        <motion.div
          className="absolute top-0 origin-top"
          style={{
            scaleY,
            height: '100%',
            width: '2px',
            left: '-0.5px',
            background: `linear-gradient(to bottom, ${T.sky}, ${T.bow})`,
          }}
        />
        <motion.div
          className="absolute -left-[4.5px] w-[10px] h-[10px] rounded-full"
          style={{
            top: dotY,
            background: T.bow,
            boxShadow: `0 0 0 4px ${T.paper}, 0 0 12px 2px rgba(46,139,122,0.55)`,
          }}
        />
      </div>
      <span
        className="font-mono text-[9px] tracking-[0.2em] mt-3"
        style={{ color: T.inkSoft, writingMode: 'vertical-rl', textOrientation: 'mixed' }}
      >
        114.07°W
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons — landing-specific, explicit colors
// ---------------------------------------------------------------------------
function InkButton({
  children, onClick, href, tone = 'ink', className,
}: { children: ReactNode; onClick?: () => void; href?: string; tone?: 'ink' | 'outline' | 'paper'; className?: string }) {
  const styles: Record<string, CSSProperties> = {
    ink: { background: T.ink, color: T.panel },
    outline: { background: 'transparent', color: T.ink, border: `1.5px solid ${T.ink}` },
    paper: { background: T.panel, color: T.ink },
  };
  const classes = cn(
    'group inline-flex items-center justify-center gap-2.5 rounded-full px-7 h-[52px] text-[15px] font-bold tracking-tight',
    'transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]',
    'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4A90D9]',
    className,
  );

  if (href) {
    return (
      <a href={href} onClick={onClick} style={styles[tone]} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={styles[tone]}
      className={classes}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Legal modal (behaviour preserved from the previous landing page)
// ---------------------------------------------------------------------------
function LegalModal({ legalModal, onClose }: { legalModal: 'privacy' | 'terms' | 'contact' | null; onClose: () => void }) {
  if (!legalModal) return null;
  const content = {
    privacy: { title: 'Privacy Policy', body: 'Calgary Watch stores report metadata to operate safety alerts. We do not sell personal data. Reporter identity can be anonymised per report and admin access is restricted to verified administrators only.' },
    terms: { title: 'Terms of Use', body: 'Calgary Watch is for informational awareness only. Always verify critical incidents with official agencies. Misleading or abusive submissions may be removed by administrators.' },
    contact: { title: 'Contact', body: 'For support, account issues, or policy requests, contact: jorti104@mtroyal.ca' },
  }[legalModal];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(20,28,38,0.55)] backdrop-blur-sm p-4"
      onClick={onClose} role="dialog" aria-modal="true" aria-label={content.title}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.97 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="w-full max-w-xl rounded-3xl p-8 shadow-2xl"
        style={{ background: T.panel, border: `1px solid ${T.line}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-2xl font-bold" style={{ color: T.ink }}>{content.title}</h3>
        <p className="mt-4 text-sm leading-relaxed" style={{ color: T.inkSoft }}>{content.body}</p>
        <div className="mt-6 flex justify-end">
          <InkButton onClick={onClose} className="h-11 px-6 text-sm">Close</InkButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function Nav() {
  const [visible, setVisible] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 40);
      if (y < 80) setVisible(true);
      else if (y > lastY.current + 6) setVisible(false);
      else if (y < lastY.current - 6) setVisible(true);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const link = 'px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors hover:bg-[rgba(28,43,58,0.06)]';

  return (
    <nav
      className={cn('fixed top-0 inset-x-0 z-50 transition-transform duration-300', visible ? 'translate-y-0' : '-translate-y-full')}
      style={{
        background: scrolled ? 'rgba(247,243,234,0.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(14px)' : undefined,
        borderBottom: scrolled ? `1px solid ${T.line}` : '1px solid transparent',
      }}
    >
      <div className="mx-auto max-w-[88rem] px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5 shrink-0"
          aria-label="Calgary Watch home"
        >
          <img
            src={publicAsset('icon.svg')}
            alt=""
            width={30}
            height={30}
            className="w-[30px] h-[30px] object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="flex flex-col leading-none text-left">
            <span className="font-display text-[17px] font-bold tracking-tight" style={{ color: T.ink }}>Calgary Watch</span>
            <span className="font-mono text-[8.5px] font-medium tracking-[0.34em] uppercase mt-0.5" style={{ color: T.inkSoft }}>Community Safety</span>
          </span>
        </button>

        <div className="hidden md:flex items-center gap-1" style={{ color: T.ink }}>
          <a href="#features" className={link}>What we track</a>
          <a href="#how-it-works" className={link}>How it works</a>
          <a href="/about" className={link}>About</a>
          <a href="/coverage" className={link}>Airdrie &amp; area coverage</a>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/map"
            className="hidden md:inline-flex items-center gap-2 rounded-full h-10 px-5 text-sm font-bold transition-transform hover:-translate-y-0.5"
            style={{ background: T.ink, color: T.panel }}
          >
            <MapPin size={14} />
            Open the live map
          </a>
          <button
            type="button"
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-full"
            style={{ border: `1px solid ${T.line}`, color: T.ink, background: 'rgba(255,253,248,0.7)' }}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="md:hidden px-5 py-4 flex flex-col gap-1"
            style={{ background: 'rgba(247,243,234,0.97)', backdropFilter: 'blur(14px)', borderTop: `1px solid ${T.line}`, color: T.ink }}
          >
            <a href="#features" onClick={() => setMenuOpen(false)} className="px-3 py-2.5 text-sm font-semibold rounded-xl">What we track</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="px-3 py-2.5 text-sm font-semibold rounded-xl">How it works</a>
            <a href="/about" onClick={() => setMenuOpen(false)} className="text-left px-3 py-2.5 text-sm font-semibold rounded-xl">About</a>
            <a href="/coverage" onClick={() => setMenuOpen(false)} className="text-left px-3 py-2.5 text-sm font-semibold rounded-xl">Airdrie &amp; area coverage</a>
            <a
              href="/map"
              onClick={() => setMenuOpen(false)}
              className="mt-2 h-12 rounded-2xl font-bold text-sm"
              style={{ background: T.ink, color: T.panel }}
            >
              Open the live map
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// HERO — parallax skyline plate + staggered display type + live dispatch card
// ---------------------------------------------------------------------------
const HERO_LINES = [
  { text: 'Calgary crime.', color: T.ink },
  { text: 'Mapped live.', color: T.sky },
  { text: 'By neighbours.', color: T.ink },
];

/**
 * Mobile hero — "pocket dispatch": boot line, staggered headline, a full-bleed
 * city window with live rotating dispatch chip, and thumb-zone CTAs.
 */
function MobileHero({ reduced }: { reduced: boolean }) {
  const [feedIdx, setFeedIdx] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setFeedIdx((v) => (v + 1) % TICKER_ITEMS.length), 2800);
    return () => window.clearInterval(id);
  }, [reduced]);
  const item = TICKER_ITEMS[feedIdx];
  const ItemIcon = item.icon;

  return (
    <div className="lg:hidden relative z-10 flex flex-col min-h-dvh pt-24 pb-7">
      <div className="px-5">
        {/* boot line */}
        <motion.p
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="font-mono text-[10px] tracking-[0.3em] uppercase flex items-center gap-2.5"
          style={{ color: T.bow }}
        >
          <span className="inline-block w-1.5 h-3 animate-pulse rounded-[1px]" style={{ background: T.bow }} aria-hidden="true" />
          Scanning YYC · 4 quadrants live
        </motion.p>

        {/* headline */}
        <h1 className="mt-5 font-display font-extrabold leading-[0.93] tracking-[-0.03em]" style={{ fontSize: 'clamp(2.9rem, 14.5vw, 4.6rem)' }}>
          {HERO_LINES.map((line, i) => (
            <span key={line.text} className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
              <motion.span
                className="block"
                style={{ color: line.color }}
                initial={reduced ? false : { y: '110%' }}
                animate={{ y: 0 }}
                transition={{ duration: 0.85, delay: 0.12 + i * 0.12, ease: EASE }}
              >
                {line.text}
                {i === 1 && (
                  <motion.svg
                    viewBox="0 0 300 14" className="block w-[62%] mt-1" aria-hidden="true"
                    initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
                  >
                    <motion.path
                      d="M2 10 C 60 2, 120 13, 180 7 S 280 4, 298 8"
                      fill="none" stroke={T.bow} strokeWidth="3.5" strokeLinecap="round"
                      initial={reduced ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1, delay: 0.85, ease: 'easeInOut' }}
                    />
                  </motion.svg>
                )}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55, ease: EASE }}
          className="mt-4 text-[14.5px] leading-relaxed max-w-[32ch]"
          style={{ color: T.inkSoft }}
        >
          See current crime and safety reports near you, then alert your
          neighbours when something happens. Free, run by Calgarians.
        </motion.p>
      </div>

      {/* city window — full-bleed strip with live dispatch */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, delay: 0.7, ease: EASE }}
        className="relative mt-7 h-44 min-[400px]:h-48 overflow-hidden"
      >
        <img
          src={publicAsset('images/hero-wide.webp')}
          alt="Calgary skyline over the Bow River"
          width={1600} height={900}
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = publicAsset('images/calgary2.webp'); }}
        />
        <div className="absolute inset-x-0 top-0 h-8" style={{ background: `linear-gradient(to bottom, ${T.paper}, transparent)` }} aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: 'linear-gradient(to top, rgba(12,29,46,0.72), transparent)' }} aria-hidden="true" />

        <span
          className="absolute top-4 right-4 font-mono text-[8.5px] font-bold tracking-[0.24em] uppercase px-2.5 py-1.5 rounded-md flex items-center gap-1.5"
          style={{ background: 'rgba(12,29,46,0.7)', color: '#F7F3EA', backdropFilter: 'blur(6px)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: T.red }} aria-hidden="true" />
          Live · YYC
        </span>

        {/* pulsing pins */}
        {[
          { left: '18%', top: '46%', color: '#f59e0b', delay: 0 },
          { left: '55%', top: '32%', color: '#ef4444', delay: 0.8 },
          { left: '80%', top: '52%', color: '#60a5fa', delay: 1.6 },
        ].map((pin) => (
          <span key={pin.left} className="absolute" style={{ left: pin.left, top: pin.top }} aria-hidden="true">
            <span
              className="absolute -inset-2 rounded-full animate-ping"
              style={{ background: pin.color, opacity: 0.35, animationDelay: `${pin.delay}s`, animationDuration: '2.4s' }}
            />
            <span className="relative block w-2.5 h-2.5 rounded-full border-2 border-[#fff]" style={{ background: pin.color }} />
          </span>
        ))}

        {/* rotating dispatch chip */}
        <div className="absolute bottom-3.5 left-4 right-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={feedIdx}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="flex items-center gap-2.5 rounded-full pl-3 pr-2 py-2 w-fit max-w-full"
              style={{ background: 'rgba(12,29,46,0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(247,243,234,0.15)' }}
            >
              <ItemIcon size={12} style={{ color: item.color }} className="shrink-0" />
              <span className="text-[12px] font-bold truncate" style={{ color: '#F7F3EA' }}>{item.title}</span>
              <span className="font-mono text-[9px] truncate shrink-0" style={{ color: 'rgba(247,243,234,0.6)' }}>{item.area}</span>
              <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: `${item.color}33`, color: item.color }}>
                NOW
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="flex-1" aria-hidden="true" />

      {/* stat chips */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.85, ease: EASE }}
        className="px-5 mt-6 flex gap-2"
      >
        {[
          { v: '5', l: 'categories' },
          { v: '3 km', l: 'near me' },
          { v: '<30s', l: 'to report' },
        ].map((s) => (
          <div key={s.l} className="flex-1 rounded-xl px-2 py-2.5 text-center" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
            <p className="font-display text-[15px] font-extrabold leading-none" style={{ color: T.ink }}>{s.v}</p>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em]" style={{ color: T.inkSoft }}>{s.l}</p>
          </div>
        ))}
      </motion.div>

      {/* thumb-zone CTAs */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.95, ease: EASE }}
        className="px-5 mt-3.5 flex flex-col gap-2.5"
      >
        <a
          href="/map"
          className="w-full h-14 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform"
          style={{ background: T.ink, color: T.panel, boxShadow: '0 16px 34px -18px rgba(28,43,58,0.6)' }}
        >
          <MapPin size={16} />
          Open the live map
          <ArrowRight size={14} className="opacity-80" />
        </a>
        <a
          href="/map?report=true"
          className="w-full h-12 rounded-2xl font-bold text-[14px] flex items-center justify-center active:scale-[0.98] transition-transform"
          style={{ border: `1.5px solid ${T.ink}`, color: T.ink }}
        >
          Sign in to report
        </a>
        <p className="mt-1.5 text-center font-mono text-[8.5px] uppercase tracking-[0.26em]" style={{ color: T.inkSoft }}>
          Free · Non-profit · Built by Calgarians
        </p>
      </motion.div>
    </div>
  );
}

function Hero({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);
  const textY = useTransform(scrollYProgress, [0, 1], ['0%', '-30%']);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const plateRotate = useTransform(scrollYProgress, [0, 1], [0, 3]);

  // Pointer-tracked 3D tilt on the skyline plate (fine pointers only)
  const tiltX = useSpring(useMotionValue(0), { stiffness: 160, damping: 18 });
  const tiltY = useSpring(useMotionValue(0), { stiffness: 160, damping: 18 });
  const onPlateMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    tiltY.set(((e.clientX - r.left) / r.width - 0.5) * 9);
    tiltX.set(-((e.clientY - r.top) / r.height - 0.5) * 7);
  };
  const onPlateLeave = () => { tiltX.set(0); tiltY.set(0); };

  const lines = HERO_LINES;

  return (
    <section ref={ref} className="relative min-h-dvh flex flex-col overflow-hidden" style={{ background: T.paper }}>
      {/* 45° survey grid — downtown Calgary's rotated street grid */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        <defs>
          <pattern id="lp-grid" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M64 0H0V64" fill="none" stroke={T.ink} strokeWidth="0.5" />
          </pattern>
          <radialGradient id="lp-grid-fade" cx="30%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="lp-grid-mask"><rect width="100%" height="100%" fill="url(#lp-grid-fade)" /></mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#lp-grid)" mask="url(#lp-grid-mask)" opacity="0.07" />
      </svg>

      <MobileHero reduced={reduced} />

      <div className="relative z-10 mx-auto w-full max-w-[88rem] px-5 sm:px-8 pt-28 lg:pt-32 pb-16 hidden lg:grid lg:grid-cols-[7fr_5fr] gap-12 lg:gap-8 items-center flex-1">
        {/* Left — thesis */}
        <motion.div style={reduced ? undefined : { y: textY, opacity: fade }}>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <Eyebrow>
              <span className="inline-flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full animate-ping opacity-70" style={{ background: T.bow }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: T.bow }} />
                </span>
                Live · Calgary, Alberta
              </span>
            </Eyebrow>
          </motion.div>

          <h1 className="mt-6 font-display font-extrabold leading-[0.95] tracking-[-0.03em]" style={{ fontSize: 'clamp(2.7rem, 8.2vw, 7.2rem)' }}>
            {lines.map((line, i) => (
              <span key={line.text} className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
                <motion.span
                  className="block"
                  style={{ color: line.color }}
                  initial={reduced ? false : { y: '110%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.9, delay: 0.15 + i * 0.13, ease: EASE }}
                >
                  {line.text}
                  {i === 1 && (
                    <motion.svg
                      viewBox="0 0 300 14" className="block w-[62%] mt-1" aria-hidden="true"
                      initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
                    >
                      <motion.path
                        d="M2 10 C 60 2, 120 13, 180 7 S 280 4, 298 8"
                        fill="none" stroke={T.bow} strokeWidth="3.5" strokeLinecap="round"
                        initial={reduced ? false : { pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 1.1, delay: 0.95, ease: 'easeInOut' }}
                      />
                    </motion.svg>
                  )}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            className="mt-7 max-w-xl text-[17px] leading-relaxed"
            style={{ color: T.inkSoft }}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65, ease: EASE }}
          >
            Calgary Watch is a free Calgary crime map and neighbourhood safety
            network. See current community reports near you — break-ins, stolen
            vehicles, traffic, weather and emergencies — then sign in to alert
            your neighbours.
          </motion.p>

          <motion.div
            className="mt-9 flex flex-wrap items-center gap-3.5"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.8, ease: EASE }}
          >
            <InkButton href="/map">
              <MapPin size={16} />
              Open the live map
              <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
            </InkButton>
            <InkButton href="/map?report=true" tone="outline">
              Sign in to report
            </InkButton>
          </motion.div>

          <motion.div
            className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 font-mono text-[11px] uppercase tracking-[0.18em]"
            style={{ color: T.inkSoft }}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.05 }}
          >
            <span><strong style={{ color: T.ink }}>5</strong> categories</span>
            <span><strong style={{ color: T.ink }}>3 km</strong> near-me view</span>
            <span><strong style={{ color: T.ink }}>&lt;30s</strong> to report</span>
            <span style={{ color: T.bow }}>Free · Non-profit</span>
          </motion.div>
        </motion.div>

        {/* Right — skyline plate with live dispatch card */}
        <motion.div
          className="relative"
          initial={reduced ? false : { opacity: 0, y: 40, rotate: 2 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 1, delay: 0.5, ease: EASE }}
          style={reduced ? undefined : { rotate: plateRotate, rotateX: tiltX, rotateY: tiltY, transformPerspective: 1100 }}
          onPointerMove={onPlateMove}
          onPointerLeave={onPlateLeave}
        >
          <div
            className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[1.75rem] shadow-[0_40px_80px_-32px_rgba(28,43,58,0.45)]"
            style={{ border: `1px solid ${T.line}`, background: T.panel }}
          >
            <div className="relative h-[220px] sm:h-[420px] lg:h-[500px] overflow-hidden">
              <motion.img
                src={publicAsset('images/calgary2.webp')}
                alt="Calgary Tower at golden hour"
                width={1200} height={1641}
                fetchPriority="high"
                className="absolute inset-0 h-[118%] w-full object-cover"
                style={reduced ? undefined : { y: imgY }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = publicAsset('images/calgary1.webp'); }}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(12,29,46,0.55), transparent 55%)' }} />

              {/* plate annotations */}
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 font-mono text-[8.5px] sm:text-[9.5px] tracking-[0.22em] uppercase px-2.5 py-1.5 rounded-md"
                style={{ background: 'rgba(247,243,234,0.85)', color: T.ink, backdropFilter: 'blur(6px)' }}>
                Plate 01 — Calgary Tower · Centre St S
              </div>
              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 hidden min-[400px]:block font-mono text-[8.5px] sm:text-[9.5px] tracking-[0.18em] px-2.5 py-1.5 rounded-md"
                style={{ background: 'rgba(247,243,234,0.85)', color: T.bow, backdropFilter: 'blur(6px)' }}>
                YYC · 1,045 m
              </div>

              {/* pulsing incident pins on the photo */}
              {[
                { left: '22%', top: '58%', color: '#f59e0b', delay: 0 },
                { left: '58%', top: '40%', color: '#ef4444', delay: 0.8 },
                { left: '78%', top: '66%', color: '#60a5fa', delay: 1.6 },
              ].map((pin) => (
                <span key={pin.left} className="absolute" style={{ left: pin.left, top: pin.top }} aria-hidden="true">
                  <span
                    className="absolute -inset-2.5 rounded-full animate-ping"
                    style={{ background: pin.color, opacity: 0.3, animationDelay: `${pin.delay}s`, animationDuration: '2.4s' }}
                  />
                  <span className="relative block w-3 h-3 rounded-full border-2 border-[#fff]" style={{ background: pin.color }} />
                </span>
              ))}
            </div>

            {/* Dispatch strip under the photo */}
            <div className="px-5 py-4" style={{ borderTop: `1px solid ${T.line}` }}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] flex items-center gap-2" style={{ color: T.inkSoft }}>
                  <Activity size={11} style={{ color: T.sky }} />
                  Live dispatch
                </span>
                <span className="font-mono text-[10px] font-bold flex items-center gap-1.5" style={{ color: T.red }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: T.red }} />
                  3 active
                </span>
              </div>
              <HeroFeed reduced={reduced} />
            </div>
          </div>

          {/* Floating quadrant compass chip */}
          <motion.div
            className="absolute -bottom-6 -left-6 hidden lg:flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl"
            style={{ background: T.ink, color: T.paper }}
            initial={reduced ? false : { opacity: 0, scale: 0.8, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 1.15, duration: 0.6, ease: EASE }}
          >
            <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
              <circle cx="17" cy="17" r="15" fill="none" stroke={T.paper} strokeOpacity="0.35" />
              <path d="M17 5 L20 17 L17 29 L14 17 Z" fill={T.gold} />
              <circle cx="17" cy="17" r="2" fill={T.paper} />
            </svg>
            <span className="font-mono text-[10px] leading-snug tracking-[0.14em] uppercase">
              All four<br />quadrants live
            </span>
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll cue */}
      <motion.div
        className="relative z-10 pb-6 hidden lg:flex justify-center"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
      >
        <div className="flex flex-col items-center gap-2 font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: T.inkSoft }}>
          Follow the river
          <motion.span
            animate={reduced ? undefined : { y: [0, 7, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="block w-px h-9"
            style={{ background: `linear-gradient(to bottom, ${T.bow}, transparent)` }}
          />
        </div>
      </motion.div>
    </section>
  );
}

function HeroFeed({ reduced }: { reduced: boolean }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % TICKER_ITEMS.length), 3200);
    return () => window.clearInterval(id);
  }, [reduced]);

  const visible = [0, 1, 2].map((o) => TICKER_ITEMS[(idx + o) % TICKER_ITEMS.length]);

  return (
    <ul className="mt-3 space-y-2.5">
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map((item) => {
          const Icon = item.icon;
          return (
            <motion.li
              key={item.title + item.area}
              layout
              initial={reduced ? false : { opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? undefined : { opacity: 0, x: 14 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="flex items-center gap-3"
            >
              <span className="flex w-7 h-7 items-center justify-center rounded-lg shrink-0" style={{ background: `${item.color}1f` }}>
                <Icon size={13} style={{ color: item.color }} />
              </span>
              <span className="text-[13px] font-semibold truncate" style={{ color: T.ink }}>{item.title}</span>
              <span className="ml-auto font-mono text-[10px] shrink-0" style={{ color: T.inkSoft }}>{item.area}</span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Marquee ticker — the city, scrolling past
// ---------------------------------------------------------------------------
function Ticker({ reduced }: { reduced: boolean }) {
  const row = (key: string) => (
    <div key={key} className="flex items-center gap-10 pr-10 shrink-0">
      {TICKER_ITEMS.map((item, i) => {
        const Icon = item.icon;
        return (
          <span key={`${key}-${i}`} className="flex items-center gap-2.5 whitespace-nowrap">
            <Icon size={13} style={{ color: item.color }} />
            <span className="text-[13px] font-bold" style={{ color: T.paper }}>{item.title}</span>
            <span className="font-mono text-[11px]" style={{ color: 'rgba(247,243,234,0.55)' }}>{item.area}</span>
            <span className="ml-6 w-1 h-1 rounded-full" style={{ background: T.gold }} aria-hidden="true" />
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="relative z-10 overflow-hidden py-4 -rotate-[0.6deg] scale-[1.01]" style={{ background: T.ink }} aria-hidden="true">
      <div
        className="flex w-max"
        style={reduced ? undefined : { animation: 'lp-marquee 46s linear infinite' }}
      >
        {row('a')}
        {row('b')}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DAY TUNNEL — "One day on the watch": a pinned camera dolly through five
// photographic plates, dawn to after-midnight. Fake-3D: perspective container,
// plates scale up and fly past the lens as scroll advances.
// ---------------------------------------------------------------------------
// Keep scroll breakpoints non-decreasing inside [0,1].
function scrollRange(...vals: number[]): number[] {
  let prev = 0;
  return vals.map((v) => (prev = Math.max(prev, Math.min(1, Math.max(0, v)))));
}

// The intro title owns the first stretch of the tunnel; plates ride after it.
const TUNNEL_INTRO = 0.14;

function plateSegment(i: number, count: number) {
  const seg = (1 - TUNNEL_INTRO) / count;
  const start = TUNNEL_INTRO + i * seg;
  return { seg, start, peak: start + seg * 0.55 };
}

function DayPlate({ plate, i, count, progress }: {
  plate: (typeof DAY_PLATES)[number];
  i: number;
  count: number;
  progress: MotionValue<number>;
}) {
  const { seg, start, peak } = plateSegment(i, count);
  // Generous overlap into the next segment = crossfade instead of a hard cut.
  const out = start + seg * 1.3;

  const scale = useTransform(progress, scrollRange(start, peak, out), [0.52, 1, 1.6], { ease: easeInOut });
  const opacity = useTransform(
    progress,
    scrollRange(start, start + seg * 0.3, out - seg * 0.35, out),
    [0, 1, 1, 0],
    { ease: easeInOut },
  );
  const x = useTransform(progress, scrollRange(start, out), i % 2 ? ['7vw', '-2.5vw'] : ['-7vw', '2.5vw'], { ease: easeInOut });
  const y = useTransform(progress, scrollRange(start, out), ['5vh', '-4vh'], { ease: easeOut });
  const rotateY = useTransform(progress, scrollRange(start, peak), [i % 2 ? -9 : 9, 0], { ease: easeOut });

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: count - i, opacity }}
      aria-hidden="true"
    >
      <motion.div
        className="relative w-[min(88vw,760px)] overflow-hidden rounded-[1.1rem] sm:rounded-[1.4rem]"
        style={{
          scale, x, y, rotateY,
          transformPerspective: 1200,
          willChange: 'transform, opacity',
          border: '1px solid rgba(237,242,240,0.18)',
          background: T.nightPanel,
          boxShadow: '0 60px 120px -40px rgba(0,0,0,0.8)',
        }}
      >
        <img
          src={publicAsset(plate.src)}
          alt=""
          loading="lazy"
          decoding="async"
          width={1520} height={950}
          className="w-full aspect-[16/10] object-cover"
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(12,29,46,0.45), transparent 40%)' }} />
        <span
          className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 font-mono text-[10px] sm:text-[11px] font-bold tracking-[0.2em] px-2.5 py-1.5 rounded-md tabular-nums"
          style={{ background: 'rgba(12,29,46,0.72)', color: T.nightText, backdropFilter: 'blur(6px)' }}
        >
          {plate.time}
        </span>
      </motion.div>
    </motion.div>
  );
}

/**
 * Mobile & tablet version of the day sequence: a story-style swipe carousel —
 * native horizontal snap scrolling with segmented progress bars (the pattern
 * every phone user already knows), captions fixed under each photo.
 */
function DayStories({ reduced }: { reduced: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const onScroll = () => {
    const el = trackRef.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    const step = card.offsetWidth + 16;
    setIdx(Math.max(0, Math.min(DAY_PLATES.length - 1, Math.round(el.scrollLeft / step))));
  };

  return (
    <section className="lg:hidden py-16 sm:py-20 overflow-hidden" style={{ background: T.night }} aria-label="One day on the watch — photo stories">
      <div className="px-5 sm:px-8">
        <Eyebrow color={T.gold} light>Field footage · 24 hours</Eyebrow>
        <h2 className="mt-4 font-display font-extrabold tracking-[-0.025em] leading-[1.02]" style={{ color: T.nightText, fontSize: 'clamp(2rem, 8vw, 3rem)' }}>
          One day on the watch.
        </h2>

        {/* story-style segmented progress */}
        <div className="mt-6 flex gap-1.5" aria-hidden="true">
          {DAY_PLATES.map((p, i) => (
            <span key={p.src} className="h-[3px] flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(237,242,240,0.16)' }}>
              <span
                className="block h-full rounded-full transition-all duration-400"
                style={{ width: i <= idx ? '100%' : '0%', background: i === idx ? p.color : 'rgba(237,242,240,0.5)' }}
              />
            </span>
          ))}
        </div>
      </div>

      {/* swipe deck */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="mt-5 flex gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar px-5 sm:px-8 pb-2"
      >
        {DAY_PLATES.map((p, i) => (
          <motion.figure
            key={p.src}
            initial={reduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.55, delay: Math.min(i, 2) * 0.08, ease: EASE }}
            className="w-[82vw] max-w-[26rem] shrink-0 snap-center overflow-hidden rounded-2xl"
            style={{ background: T.nightPanel, border: '1px solid rgba(237,242,240,0.16)' }}
          >
            <div className="relative">
              <img
                src={publicAsset(p.src)}
                alt={p.caption}
                loading="lazy"
                decoding="async"
                width={1520} height={1045}
                className="w-full aspect-[16/11] object-cover"
              />
              <span
                className="absolute top-2.5 left-2.5 font-mono text-[10px] font-bold tracking-[0.2em] px-2.5 py-1.5 rounded-md tabular-nums"
                style={{ background: 'rgba(12,29,46,0.72)', color: T.nightText, backdropFilter: 'blur(6px)' }}
              >
                {p.time}
              </span>
            </div>
            <figcaption className="p-4">
              <p className="font-mono text-[9.5px] tracking-[0.18em] uppercase" style={{ color: p.color }}>{p.note}</p>
              <p className="mt-1 text-[15px] font-bold leading-snug" style={{ color: T.nightText }}>{p.caption}</p>
            </figcaption>
          </motion.figure>
        ))}
        <div className="w-1 shrink-0" aria-hidden="true" />
      </div>

      {/* swipe affordance */}
      <div className="mt-4 px-5 sm:px-8 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.24em]" style={{ color: T.nightSoft }}>
        <motion.span
          animate={reduced ? undefined : { x: [0, 6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="inline-flex"
          aria-hidden="true"
        >
          <ArrowRight size={12} style={{ color: T.gold }} />
        </motion.span>
        Swipe through the day · {idx + 1}/{DAY_PLATES.length}
      </div>
    </section>
  );
}

function DayTunnel({ reduced }: { reduced: boolean }) {
  const count = DAY_PLATES.length;
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  // Spring-smoothed progress drives the plates so fast scrolling still
  // produces fluid, inertial motion instead of hard scrubbed cuts.
  const smooth = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.4, restDelta: 0.0005 });

  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const seg = (1 - TUNNEL_INTRO) / count;
    setActive(Math.max(0, Math.min(count - 1, Math.floor((v - TUNNEL_INTRO) / seg))));
  });
  const captionVisible = useTransform(scrollYProgress, [TUNNEL_INTRO * 0.7, TUNNEL_INTRO * 1.15], [0, 1]);
  const introOpacity = useTransform(smooth, [0, TUNNEL_INTRO * 0.75], [1, 0]);
  const introY = useTransform(smooth, [0, TUNNEL_INTRO], ['0vh', '-14vh']);
  const introScale = useTransform(smooth, [0, TUNNEL_INTRO], [1, 0.92]);

  // Reduced motion: a calm annotated contact sheet instead of the ride.
  if (reduced) {
    return (
      <section className="py-20 px-5 sm:px-8" style={{ background: T.night }}>
        <div className="mx-auto max-w-[80rem]">
          <Eyebrow color={T.gold} light>Field footage · 24 hours</Eyebrow>
          <h2 className="mt-4 font-display text-4xl font-extrabold" style={{ color: T.nightText }}>One day on the watch.</h2>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {DAY_PLATES.map((p) => (
              <figure key={p.src} className="overflow-hidden rounded-2xl" style={{ border: '1px solid rgba(237,242,240,0.16)' }}>
                <img src={publicAsset(p.src)} alt={p.caption} loading="lazy" className="w-full aspect-[16/10] object-cover" />
                <figcaption className="p-4">
                  <p className="font-mono text-[10px] tracking-[0.2em] tabular-nums" style={{ color: p.color }}>{p.time} · {p.note}</p>
                  <p className="mt-1 text-sm font-bold" style={{ color: T.nightText }}>{p.caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
    <DayStories reduced={reduced} />
    <section ref={ref} className="relative hidden lg:block" style={{ height: `${count * 85 + 110}vh`, background: T.night }} aria-label="One day on the watch — photo sequence">
      <div className="sticky top-0 h-screen overflow-hidden" style={{ perspective: '1200px' }}>
        {/* receding survey grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.06]" aria-hidden="true">
          <defs>
            <pattern id="lp-tunnel-grid" width="72" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <path d="M72 0H0V72" fill="none" stroke={T.nightText} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#lp-tunnel-grid)" />
        </svg>

        {/* ambient room glow — takes on the active plate's category colour */}
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(90vw,900px)] h-[min(90vw,900px)] rounded-full pointer-events-none"
          animate={{ background: `radial-gradient(circle, ${DAY_PLATES[active].color}26 0%, rgba(12,29,46,0) 62%)` }}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
          aria-hidden="true"
        />

        {/* vignette + anamorphic letterbox bars */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(4,12,20,0.9) 100%)', zIndex: 20 }} aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-14 sm:h-16 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(4,12,20,0.9), transparent)', zIndex: 21 }} aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-36 sm:h-40 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(4,12,20,0.95), rgba(4,12,20,0.55) 55%, transparent)', zIndex: 21 }} aria-hidden="true" />

        {/* camera HUD */}
        <div className="absolute inset-3 sm:inset-6 pointer-events-none" style={{ zIndex: 40 }} aria-hidden="true">
          {['top-0 left-0 border-t border-l', 'top-0 right-0 border-t border-r', 'bottom-0 left-0 border-b border-l', 'bottom-0 right-0 border-b border-r'].map((pos) => (
            <span key={pos} className={cn('absolute w-5 h-5 sm:w-8 sm:h-8', pos)} style={{ borderColor: 'rgba(237,242,240,0.35)' }} />
          ))}
          <span className="absolute top-1.5 left-8 sm:top-2 sm:left-12 font-mono text-[8.5px] sm:text-[10px] tracking-[0.3em] uppercase" style={{ color: T.nightSoft }}>
            Cam 01 · Dolly N 51°
          </span>
          <span className="absolute top-1.5 right-8 sm:top-2 sm:right-12 font-mono text-[8.5px] sm:text-[10px] tracking-[0.3em] uppercase flex items-center gap-2" style={{ color: T.nightSoft }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: T.red }} />
            Rec
          </span>
        </div>

        {/* plates */}
        {DAY_PLATES.map((p, i) => (
          <DayPlate key={p.src} plate={p} i={i} count={count} progress={smooth} />
        ))}

        {/* intro title — owns the first stretch, always above the plates */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none"
          style={{ opacity: introOpacity, y: introY, scale: introScale, zIndex: 45 }}
        >
          <Eyebrow color={T.gold} light>Field footage · 24 hours</Eyebrow>
          <h2
            className="mt-5 font-display font-extrabold tracking-[-0.03em] leading-[0.98]"
            style={{ color: T.nightText, fontSize: 'clamp(2.6rem, 7.4vw, 6rem)', textShadow: '0 4px 40px rgba(4,12,20,0.9)' }}
          >
            One day<br />on the watch.
          </h2>
          <p className="mt-6 font-mono text-[10px] sm:text-[11px] tracking-[0.3em] uppercase flex flex-col items-center gap-3" style={{ color: T.nightSoft }}>
            Keep scrolling — the camera moves
            <motion.span
              animate={reduced ? undefined : { y: [0, 6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="block w-px h-7"
              style={{ background: `linear-gradient(to bottom, ${T.gold}, transparent)` }}
            />
          </p>
        </motion.div>

        {/* lower-third caption — sits on the letterbox scrim, above everything */}
        <motion.div
          className="absolute inset-x-0 bottom-6 sm:bottom-9 flex flex-col items-center gap-3.5 px-6 pointer-events-none"
          style={{ zIndex: 46, opacity: captionVisible }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.32, ease: EASE }}
              className="flex flex-col items-center text-center min-h-[3.6rem] sm:min-h-[4.2rem] justify-end"
            >
              <p className="font-mono text-[9.5px] sm:text-[10.5px] tracking-[0.24em] uppercase tabular-nums" style={{ color: DAY_PLATES[active].color }}>
                {DAY_PLATES[active].time} · {DAY_PLATES[active].note}
              </p>
              <p
                className="mt-1.5 font-display text-xl sm:text-3xl font-bold"
                style={{ color: T.nightText, textShadow: '0 2px 24px rgba(4,12,20,0.95)' }}
              >
                {DAY_PLATES[active].caption}
              </p>
            </motion.div>
          </AnimatePresence>
          <div className="flex items-center gap-2" aria-hidden="true">
            {DAY_PLATES.map((p, i) => (
              <span
                key={p.src}
                className="h-1 rounded-full transition-all duration-500"
                style={{ width: i === active ? 28 : 10, background: i === active ? p.color : 'rgba(237,242,240,0.25)' }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// QUADRANTS — an interactive atlas plate: Calgary's real quadrant system as a
// living diagram (Centre St axis + the Bow drawn in), driving a detail plate.
// ---------------------------------------------------------------------------
const QUAD_META: Array<{ color: string; x: number; y: number; dots: Array<[number, number]> }> = [
  { color: '#4A90D9', x: 0,   y: 0,   dots: [[52, 62], [110, 38], [88, 118], [140, 90]] },   // NW
  { color: '#D4A843', x: 188, y: 0,   dots: [[238, 52], [296, 96], [262, 124], [310, 40]] }, // NE
  { color: '#2E8B7A', x: 0,   y: 188, dots: [[60, 250], [118, 296], [96, 224], [148, 270]] },// SW
  { color: '#C0392B', x: 188, y: 188, dots: [[240, 236], [292, 282], [258, 312], [312, 250]] }, // SE
];

function Quadrants({ reduced }: { reduced: boolean }) {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { margin: '-20%' });

  // Auto-tour the quadrants until the visitor takes over
  useEffect(() => {
    if (reduced || touched || !inView) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % 4), 3200);
    return () => window.clearInterval(id);
  }, [reduced, touched, inView]);

  const pick = (i: number) => { setTouched(true); setActive(i); };
  const q = QUADRANTS[active];
  const meta = QUAD_META[active];

  return (
    <section className="relative py-16 sm:py-20 lg:py-36 overflow-hidden" style={{ background: T.paper }}>
      <div ref={sectionRef} className="mx-auto max-w-[80rem] px-5 sm:px-8">
        <Reveal>
          <Eyebrow color={T.gold}>The grid · NW NE SW SE</Eyebrow>
          <h2 className="mt-5 font-display font-extrabold tracking-[-0.025em] leading-[1.02]" style={{ color: T.ink, fontSize: 'clamp(2.2rem, 5vw, 4.2rem)' }}>
            Every address ends<br />in a quadrant.
          </h2>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed" style={{ color: T.inkSoft }}>
            Centre Street splits east from west, the Bow bends through the
            middle — and the map thinks the way the city does. Touch a quadrant.
          </p>
        </Reveal>

        <div className="mt-12 lg:mt-16 grid lg:grid-cols-[5fr_6fr] gap-8 lg:gap-14 items-center">
          {/* Atlas diagram */}
          <Reveal className="mx-auto w-full max-w-[26rem] lg:max-w-none">
            <div className="relative">
              <svg viewBox="0 0 360 360" className="w-full" role="group" aria-label="Calgary quadrant selector">
                {QUADRANTS.map((quad, i) => {
                  const m = QUAD_META[i];
                  const isActive = active === i;
                  return (
                    <g
                      key={quad.code}
                      onClick={() => pick(i)}
                      onMouseEnter={() => pick(i)}
                      className="cursor-pointer"
                      role="button"
                      aria-label={`${quad.name} quadrant`}
                      aria-pressed={isActive}
                    >
                      <motion.rect
                        x={m.x + 4} y={m.y + 4} width={164} height={164} rx={26}
                        animate={{
                          fill: isActive ? m.color : T.panel,
                          stroke: isActive ? m.color : T.line,
                        }}
                        transition={{ duration: 0.45, ease: 'easeOut' }}
                        strokeWidth={1.5}
                        style={{ filter: isActive ? `drop-shadow(0 16px 28px ${m.color}55)` : undefined }}
                      />
                      <text
                        x={m.x + 86} y={m.y + 104}
                        textAnchor="middle"
                        className="font-display select-none"
                        style={{ fontSize: 56, fontWeight: 800, fill: isActive ? '#FFFDF8' : T.line, letterSpacing: '-0.02em', transition: 'fill 0.4s' }}
                      >
                        {quad.code}
                      </text>
                      {/* incident constellation inside the active sector */}
                      {m.dots.map(([dx, dy], di) => (
                        <motion.circle
                          key={di}
                          cx={dx} cy={dy} r={3.5}
                          animate={{ opacity: isActive ? [0.4, 1, 0.4] : 0.18, fill: isActive ? '#FFFDF8' : m.color }}
                          transition={isActive && !reduced ? { duration: 1.8, repeat: Infinity, delay: di * 0.35 } : { duration: 0.3 }}
                        />
                      ))}
                    </g>
                  );
                })}

                {/* Centre Street — vertical axis */}
                <line x1="180" y1="0" x2="180" y2="360" stroke={T.paper} strokeWidth="16" />
                <line x1="180" y1="6" x2="180" y2="354" stroke={T.ink} strokeWidth="1" strokeDasharray="6 5" opacity="0.45" />
                {/* The Bow — wavy horizontal divider */}
                <line x1="0" y1="180" x2="360" y2="180" stroke={T.paper} strokeWidth="16" />
                <path d="M0 180 C 40 168, 80 194, 122 180 S 210 164, 254 182 S 330 190, 360 176" fill="none" stroke={T.bow} strokeWidth="2.5" opacity="0.85" />

                {/* axis labels */}
                <text x="188" y="16" className="select-none" style={{ fontSize: 8.5, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, letterSpacing: '0.22em', fill: T.inkSoft }}>CENTRE ST</text>
                <text x="6" y="171" className="select-none" style={{ fontSize: 8.5, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, letterSpacing: '0.22em', fill: T.bow }}>THE BOW</text>

                {/* hub */}
                <circle cx="180" cy="180" r="13" fill={T.ink} />
                <circle cx="180" cy="180" r="4" fill={T.gold} />
              </svg>

              {/* progress ticks under the diagram */}
              <div className="mt-4 flex items-center justify-center gap-2" aria-hidden="true">
                {QUADRANTS.map((quad, i) => (
                  <button
                    key={quad.code}
                    type="button"
                    onClick={() => pick(i)}
                    className="h-1.5 rounded-full transition-all duration-400"
                    style={{ width: active === i ? 26 : 10, background: active === i ? QUAD_META[i].color : T.line }}
                    aria-label={`Show ${quad.name}`}
                  />
                ))}
              </div>
            </div>
          </Reveal>

          {/* Detail plate — crossfades with the selection */}
          <Reveal delay={0.08}>
            <AnimatePresence mode="wait">
              <motion.article
                key={q.code}
                initial={reduced ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="relative overflow-hidden rounded-3xl"
                style={{ background: T.panel, border: `1px solid ${T.line}` }}
              >
                <div className="absolute top-0 inset-x-0 h-1 z-10" style={{ background: meta.color }} aria-hidden="true" />
                <div className="relative h-44 sm:h-52 overflow-hidden" aria-hidden="true">
                  <img
                    src={publicAsset(q.img)}
                    alt={q.imgAlt}
                    loading="lazy"
                    decoding="async"
                    width={800} height={450}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${meta.color}55, transparent 60%)`, mixBlendMode: 'multiply' }} />
                  <div className="absolute inset-x-0 bottom-0 h-12" style={{ background: `linear-gradient(to top, ${T.panel}, transparent)` }} />
                  <span
                    className="absolute top-3 left-3 font-mono text-[9px] font-bold tracking-[0.22em] uppercase px-2.5 py-1.5 rounded-md"
                    style={{ background: 'rgba(255,253,248,0.9)', color: meta.color }}
                  >
                    Plate {String(active + 1).padStart(2, '0')} · {q.code}
                  </span>
                </div>
                <div className="p-6 sm:p-8 pt-4">
                  <h3 className="font-display text-2xl sm:text-3xl font-extrabold tracking-[-0.02em]" style={{ color: T.ink }}>
                    {q.name}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed" style={{ color: T.inkSoft }}>{q.places}</p>
                  <div className="mt-5 flex items-center gap-2" aria-hidden="true">
                    {CATEGORIES.map((c) => (
                      <span key={c.key} className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                    ))}
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: T.inkSoft }}>
                      All five categories · live
                    </span>
                  </div>
                </div>
              </motion.article>
            </AnimatePresence>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// HOW IT WORKS — pinned horizontal ride (lg+), stacked steps on mobile
// ---------------------------------------------------------------------------
const STEPS = [
  {
    n: '01',
    title: 'Spot it',
    body: 'Something is happening on your street — a collision, a break-in, a flooded underpass. You are already the closest sensor the city has.',
    accent: T.sky,
    mono: 'OBSERVE · YOUR BLOCK',
    log: '→ eyes on · 51.0447 N, 114.0719 W',
  },
  {
    n: '02',
    title: 'Pin it',
    body: 'Drop a pin, pick a category, write one line — and if it\'s your stolen bike, add a way for neighbours to reach you. Under thirty seconds, anonymous if you prefer.',
    accent: T.gold,
    mono: 'REPORT · <30 SECONDS',
    log: '→ pin dropped · category set · 0:27',
  },
  {
    n: '03',
    title: 'The city sees it',
    body: 'Your report appears instantly for every neighbour watching the map — and stays there, so patterns become visible over weeks.',
    accent: T.bow,
    mono: 'BROADCAST · REALTIME',
    log: '→ live on the map · all quadrants',
  },
];

function RideCard({ step }: { step: (typeof STEPS)[number] }) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl p-10 xl:p-12 flex flex-col justify-between w-[min(44vw,620px)] shrink-0 h-[58vh] min-h-[26rem]"
      style={{ background: T.panel, border: `1px solid ${T.line}` }}
    >
      <div className="absolute top-0 left-0 h-1.5 w-full" style={{ background: step.accent }} aria-hidden="true" />
      <div>
        <p className="font-mono text-[11px] tracking-[0.28em]" style={{ color: step.accent }}>{step.mono}</p>
        <h3 className="mt-4 font-display font-extrabold tracking-[-0.02em]" style={{ color: T.ink, fontSize: 'clamp(2.4rem,3.4vw,3.6rem)' }}>
          {step.title}
        </h3>
        <p className="mt-4 max-w-md text-[15.5px] leading-relaxed" style={{ color: T.inkSoft }}>{step.body}</p>
      </div>
      <div className="flex items-end justify-between gap-4">
        <p className="font-mono text-[10.5px] tracking-[0.08em]" style={{ color: step.accent }}>{step.log}</p>
        <span
          className="font-display font-extrabold select-none leading-none"
          style={{ fontSize: '7rem', color: 'transparent', WebkitTextStroke: `1.5px ${step.accent}`, opacity: 0.65 }}
          aria-hidden="true"
        >
          {step.n}
        </span>
      </div>
    </div>
  );
}

/**
 * Desktop pinned ride. The section height is 100vh + the measured horizontal
 * overflow of the card track, so scroll distance and card travel match 1:1 —
 * the pin releases exactly when the last card is fully in view.
 */
function HowItWorksRide() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      setDistance(Math.max(track.scrollWidth - window.innerWidth, 0));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -distance]);
  const trackScale = useSpring(scrollYProgress, { stiffness: 80, damping: 22 });

  return (
    <div ref={sectionRef} className="relative hidden lg:block" style={{ background: T.paper, height: `calc(100vh + ${distance}px)` }}>
      <div className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center">
        <div className="mx-auto w-full max-w-[88rem] px-8 mb-10">
          <Eyebrow>From sighting to signal</Eyebrow>
          <div className="mt-4 flex items-end justify-between gap-8">
            <h2 className="font-display font-extrabold tracking-[-0.025em] leading-none" style={{ color: T.ink, fontSize: 'clamp(2.2rem,4.2vw,3.8rem)' }}>
              Thirty seconds,<br />start to signal.
            </h2>
            <div className="hidden xl:block w-64 h-px relative" style={{ background: T.line }} aria-hidden="true">
              <motion.div className="absolute left-0 w-full origin-left" style={{ scaleX: trackScale, background: T.bow, height: '2px', top: '-0.5px' }} />
            </div>
          </div>
        </div>
        <motion.div ref={trackRef} className="flex gap-6 pl-[6vw] pr-[6vw] w-max" style={{ x }}>
          {STEPS.map((s) => <RideCard key={s.n} step={s} />)}
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Mobile / tablet: "signal timeline" — a dispatch rail that fills with the
 * river gradient as you scroll, numbered nodes that snap in, and tilted
 * transmission-log cards. Also serves as the reduced-motion layout on desktop.
 */
function SignalTimeline({ reduced, allSizes }: { reduced: boolean; allSizes: boolean }) {
  const railRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: railRef, offset: ['start 0.8', 'end 0.55'] });
  const fill = useSpring(scrollYProgress, { stiffness: 90, damping: 25 });
  const dotTop = useTransform(fill, (v) => `${Math.min(Math.max(v, 0), 1) * 100}%`);

  return (
    <section className={cn('relative py-20 sm:py-24 overflow-hidden', !allSizes && 'lg:hidden')} style={{ background: T.paper }}>
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <Reveal>
          <Eyebrow>From sighting to signal</Eyebrow>
          <h2 className="mt-4 font-display font-extrabold tracking-[-0.025em] leading-[1.04]" style={{ color: T.ink, fontSize: 'clamp(2.1rem, 7.4vw, 3.4rem)' }}>
            Thirty seconds,<br />start to signal.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed" style={{ color: T.inkSoft }}>
            One report travels from your sidewalk to every screen watching the
            map. Follow the signal down.
          </p>
        </Reveal>

        <div ref={railRef} className="relative mt-12">
          {/* dispatch rail */}
          <div className="absolute left-[21px] top-1 bottom-1 w-[2px] rounded-full" style={{ background: T.line }} aria-hidden="true">
            <motion.div
              className="absolute inset-x-0 top-0 h-full origin-top rounded-full"
              style={{ scaleY: reduced ? 1 : fill, background: `linear-gradient(to bottom, ${T.sky}, ${T.bow})` }}
            />
            {!reduced && (
              <motion.span
                className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-[11px] h-[11px] rounded-full"
                style={{ top: dotTop, background: T.bow, boxShadow: `0 0 0 4px ${T.paper}, 0 0 14px 3px rgba(46,139,122,0.6)` }}
              />
            )}
          </div>

          <ol className="space-y-9 sm:space-y-11">
            {STEPS.map((step, i) => (
              <li key={step.n} className="relative pl-16 sm:pl-20">
                {/* node */}
                <motion.span
                  className="absolute left-0 top-1 flex w-[44px] h-[44px] items-center justify-center rounded-full font-mono text-[13px] font-bold"
                  style={{ background: T.panel, border: `2px solid ${step.accent}`, color: step.accent, boxShadow: `0 0 0 6px ${T.paper}` }}
                  initial={reduced ? false : { scale: 0.3, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true, margin: '-25% 0px -25% 0px' }}
                  transition={{ type: 'spring', stiffness: 320, damping: 17 }}
                >
                  {step.n}
                </motion.span>

                {/* transmission card */}
                <motion.div
                  initial={reduced ? false : { opacity: 0, x: 40, rotate: i % 2 ? -1.4 : 1.4 }}
                  whileInView={{ opacity: 1, x: 0, rotate: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.7, ease: EASE }}
                  className="relative overflow-hidden rounded-3xl p-6 sm:p-8"
                  style={{ background: T.panel, border: `1px solid ${T.line}` }}
                >
                  <div className="absolute top-0 left-0 h-1 w-full" style={{ background: step.accent }} aria-hidden="true" />
                  {/* Decorative numeral sits behind the copy. It is absolutely
                      positioned while the eyebrow below is normal flow, so on a
                      narrow screen the label ran straight underneath it — the
                      reserved right padding is what keeps them apart. */}
                  <span
                    className="absolute -top-4 right-2 z-0 font-display font-extrabold select-none leading-none text-[3.75rem] sm:text-[5.5rem]"
                    style={{ color: 'transparent', WebkitTextStroke: `1.3px ${step.accent}`, opacity: 0.4 }}
                    aria-hidden="true"
                  >
                    {step.n}
                  </span>
                  <p className="relative z-10 pr-16 sm:pr-24 font-mono text-[10px] tracking-[0.26em]" style={{ color: step.accent }}>{step.mono}</p>
                  <h3 className="relative z-10 mt-3 font-display text-2xl sm:text-3xl font-extrabold tracking-[-0.02em]" style={{ color: T.ink }}>{step.title}</h3>
                  <p className="relative z-10 mt-3 text-[14.5px] leading-relaxed max-w-md" style={{ color: T.inkSoft }}>{step.body}</p>
                  <p className="mt-5 pt-3 font-mono text-[10px] tracking-[0.06em]" style={{ color: step.accent, borderTop: `1px dashed ${T.line}` }}>
                    {step.log}
                  </p>
                </motion.div>
              </li>
            ))}
          </ol>

          {/* signal delivered */}
          <motion.div
            className="relative mt-10 ml-16 sm:ml-20"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="inline-flex items-center gap-2.5 rounded-full px-5 py-3" style={{ background: T.ink, color: T.paper }}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full animate-ping opacity-70" style={{ background: T.bow }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: T.bow }} />
              </span>
              <span className="font-mono text-[10.5px] tracking-[0.2em] uppercase">Signal live on the map</span>
            </span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ reduced }: { reduced: boolean }) {
  return (
    <div id="how-it-works">
      {!reduced && <HowItWorksRide />}
      <SignalTimeline reduced={reduced} allSizes={reduced} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CATEGORIES — five wipe-reveal ledger rows
// ---------------------------------------------------------------------------
/**
 * WHAT WE TRACK — the dispatch board.
 *
 * This was a hairline ledger table: five rows, rules between them, and the
 * whole right half of the heading area empty. It was also the one section that
 * looked like any other product page rather than like Calgary Watch.
 *
 * It now reads as the board an admin or a neighbour actually watches. Each
 * category is rendered the way an incident is rendered on the live map — a
 * coloured edge, an icon tile, and a status line carrying a real location —
 * so the page previews the product instead of describing it. The heading holds
 * the left column and stays put while the board scrolls past it, which is what
 * fills the dead space and gives the section a spine.
 */
function Categories({ reduced }: { reduced: boolean }) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <section
      id="features"
      className="relative py-16 sm:py-20 lg:py-28"
      style={{ background: T.panel, borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` }}
    >
      <div className="mx-auto max-w-[80rem] px-5 sm:px-8 grid gap-10 lg:gap-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">

        {/* Left: the spine. Sticky on desktop so the board scrolls against it. */}
        <div className="lg:sticky lg:top-28">
          <Reveal>
            <Eyebrow color={T.red}>What we track</Eyebrow>
            <h2
              className="mt-5 font-display font-extrabold tracking-[-0.025em] leading-[1.02]"
              style={{ color: T.ink, fontSize: 'clamp(2.1rem, 4.4vw, 3.6rem)' }}
            >
              Five kinds of<br />report. One map.
            </h2>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed" style={{ color: T.inkSoft }}>
              Every report a neighbour files lands in one of these five. This is
              exactly how they appear on the map — colour, category, and where it
              happened.
            </p>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="mt-7 flex items-center gap-2.5">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                {!reduced && (
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-70 motion-safe:animate-ping" style={{ background: T.bow }} />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: T.bow }} />
              </span>
              <span className="font-mono text-[10.5px] uppercase tracking-[0.2em]" style={{ color: T.inkSoft }}>
                All five live across every quadrant
              </span>
            </div>
          </Reveal>
        </div>

        {/* Right: the board. Same anatomy as an incident on the live map. */}
        <ul className="flex flex-col gap-3">
          {CATEGORIES.map((cat, i) => {
            const Icon = cat.icon;
            const isActive = active === cat.key;
            const [sampleTitle, sampleArea] = cat.sample.split(' · ');
            return (
              <motion.li
                key={cat.key}
                initial={reduced ? false : { opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
                onMouseEnter={() => setActive(cat.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(cat.key)}
                onBlur={() => setActive(null)}
                tabIndex={0}
                className="group relative overflow-hidden rounded-2xl outline-none transition-[transform,box-shadow] duration-300 focus-visible:ring-2 focus-visible:ring-offset-2 sm:hover:-translate-y-0.5"
                style={{
                  background: T.paper,
                  border: `1px solid ${isActive ? `${cat.color}66` : T.line}`,
                  boxShadow: isActive ? `0 10px 24px -14px ${cat.color}99` : 'none',
                  // @ts-expect-error -- CSS custom property for the focus ring
                  '--tw-ring-color': cat.color,
                }}
              >
                {/* Category edge — the same signal the map uses. */}
                <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: cat.color }} aria-hidden="true" />

                <div className="relative flex items-start gap-4 py-5 pl-6 pr-5 sm:pl-7">
                  <span
                    className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
                    style={{ background: `${cat.color}1c` }}
                  >
                    <Icon size={19} style={{ color: cat.color }} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-xl font-bold sm:text-[1.35rem]" style={{ color: T.ink }}>
                      {cat.label}
                    </h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed sm:text-sm" style={{ color: T.inkSoft }}>
                      {cat.desc}
                    </p>

                    {/* Status line, styled like a live incident row. */}
                    <div
                      className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 pt-3"
                      style={{ borderTop: `1px dashed ${T.line}` }}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cat.color }} aria-hidden="true" />
                      <span className="font-mono text-[10.5px] font-semibold" style={{ color: cat.color }}>
                        {sampleTitle}
                      </span>
                      {sampleArea && (
                        <span className="font-mono text-[10.5px]" style={{ color: T.inkSoft }}>
                          · {sampleArea}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// NEAR ME — "It starts on your street": neighbourhood radius view with
// community posts (stolen bike with a contact number, car break-ins, …)
// ---------------------------------------------------------------------------
function NearMe({ reduced }: { reduced: boolean }) {
  return (
    <section className="relative py-16 sm:py-20 lg:py-32 overflow-hidden" style={{ background: T.paper }}>
      <div className="mx-auto max-w-[80rem] px-5 sm:px-8 grid lg:grid-cols-[6fr_5fr] gap-12 lg:gap-16 items-center">
        {/* Copy */}
        <div>
          <Reveal>
            <Eyebrow color={T.red}>Near me · your 3 km</Eyebrow>
            <h2 className="mt-5 font-display font-extrabold tracking-[-0.025em] leading-[1.04]" style={{ color: T.ink, fontSize: 'clamp(2.2rem, 4.8vw, 4rem)' }}>
              It starts on<br />your street.
            </h2>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed" style={{ color: T.inkSoft }}>
              The whole city matters, but your block matters more. The near-me
              view sorts every report by distance from where you stand — so
              Inglewood sees Inglewood first.
            </p>
          </Reveal>

          <div className="mt-9 space-y-6">
            {[
              {
                icon: Bike,
                color: '#ef4444',
                title: 'Post your stolen bike with a number',
                body: 'The neighbour who spots it locked outside a train station calls you — not a call centre.',
                tag: 'Coming soon',
              },
              {
                icon: Car,
                color: '#f59e0b',
                title: 'See the pattern before you park',
                body: 'Car break-ins cluster. Three reports on one block this week is something worth knowing tonight.',
              },
              {
                icon: Crosshair,
                color: T.bow as string,
                title: 'Everything within 3 km, sorted',
                body: 'One tap on the map shows what\'s open around you right now, nearest first, emergencies on top.',
              },
            ].map((f, i) => (
              <Reveal key={f.title} delay={i * 0.08}>
                <div className="flex gap-4">
                  <span className="mt-0.5 flex w-11 h-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${f.color}1c` }}>
                    <f.icon size={19} style={{ color: f.color }} />
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-bold flex items-center gap-2.5 flex-wrap" style={{ color: T.ink }}>
                      {f.title}
                      {f.tag && (
                        <span className="font-mono text-[8.5px] font-semibold tracking-[0.2em] uppercase px-2 py-1 rounded-full" style={{ background: `${T.gold}26`, color: '#8A6A16' }}>
                          {f.tag}
                        </span>
                      )}
                    </h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed max-w-md" style={{ color: T.inkSoft }}>{f.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.2} className="mt-10">
            <InkButton href="/map">
              <Crosshair size={16} />
              See what's near you
              <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
            </InkButton>
          </Reveal>
        </div>

        {/* Phone-frame near-me mock */}
        <Reveal delay={0.1}>
          <motion.div
            initial={reduced ? false : { rotate: 3 }}
            whileInView={{ rotate: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.9, ease: EASE }}
            className="relative mx-auto w-full max-w-[24rem] rounded-[2.4rem] p-2.5 shadow-[0_44px_80px_-36px_rgba(28,43,58,0.55)]"
            style={{ background: T.ink }}
          >
            <div className="overflow-hidden rounded-[1.9rem]" style={{ background: T.panel }}>
              {/* mock header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <p className="font-mono text-[9px] tracking-[0.28em] uppercase" style={{ color: T.inkSoft }}>Near me</p>
                  <p className="font-display text-base font-bold" style={{ color: T.ink }}>Inglewood · 3 km</p>
                </div>
                <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] px-2.5 py-1.5 rounded-full" style={{ background: `${T.bow}1a`, color: T.bow }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: T.bow }} />
                  Live
                </span>
              </div>

              {/* radius radar */}
              <div className="relative mx-5 h-40 overflow-hidden rounded-2xl" style={{ background: '#EAF0F4', border: `1px solid ${T.line}` }} aria-hidden="true">
                {[0.36, 0.66, 0.96].map((f, i) => (
                  <motion.span
                    key={f}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ width: `${f * 160}px`, height: `${f * 160}px`, border: `1px solid ${T.bow}55` }}
                    initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15 + i * 0.12, duration: 0.6, ease: EASE }}
                  />
                ))}
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="absolute -inset-3 rounded-full animate-ping opacity-30" style={{ background: T.sky }} />
                  <span className="relative block w-3.5 h-3.5 rounded-full border-2 border-[#fff]" style={{ background: T.sky }} />
                </span>
                <span className="absolute left-1/2 top-[62%] ml-6 font-mono text-[8.5px] tracking-[0.14em] uppercase" style={{ color: T.inkSoft }}>You</span>
                {[
                  { left: '34%', top: '30%', color: '#ef4444' },
                  { left: '68%', top: '58%', color: '#ef4444' },
                  { left: '24%', top: '66%', color: '#60a5fa' },
                  { left: '76%', top: '26%', color: '#ef4444' },
                ].map((d, i) => (
                  <motion.span
                    key={d.left}
                    className="absolute w-2 h-2 rounded-full"
                    style={{ left: d.left, top: d.top, background: d.color, boxShadow: `0 0 8px 1px ${d.color}88` }}
                    initial={reduced ? false : { scale: 0, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 + i * 0.12, type: 'spring', stiffness: 320, damping: 16 }}
                  />
                ))}
              </div>

              {/* nearby posts */}
              <ul className="px-5 py-4 space-y-3">
                {NEARBY_POSTS.map((post, i) => (
                  <motion.li
                    key={post.title}
                    initial={reduced ? false : { opacity: 0, x: 18 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ delay: 0.2 + i * 0.1, duration: 0.5, ease: EASE }}
                    className="rounded-xl p-3"
                    style={{ background: T.paper, border: `1px solid ${T.line}` }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex w-8 h-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${post.color}1c` }}>
                        <post.icon size={14} style={{ color: post.color }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold leading-tight truncate" style={{ color: T.ink }}>{post.title}</p>
                        <p className="font-mono text-[9.5px] mt-0.5" style={{ color: T.inkSoft }}>{post.meta} · {post.time} ago</p>
                      </div>
                    </div>
                    {post.contact && (
                      <div className="mt-2.5 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: `${T.bow}12`, border: `1px dashed ${T.bow}55` }}>
                        <Phone size={12} style={{ color: T.bow }} />
                        <span className="font-mono text-[10.5px] font-bold tabular-nums" style={{ color: T.bow }}>{post.contact}</span>
                        <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.16em]" style={{ color: T.inkSoft }}>member post</span>
                      </div>
                    )}
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// NIGHT WATCH — deep-navy editorial band: counters + incident constellation
// ---------------------------------------------------------------------------
function NightWatch({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const starsY = useTransform(scrollYProgress, [0, 1], ['-6%', '6%']);

  const stats = [
    { value: 2400, suffix: '+', label: 'Calgarians on the map this week' },
    { value: 30, suffix: '+', label: 'Communities covered around YYC' },
    { value: 5, suffix: '', label: 'Incident categories, one ledger' },
    { value: 24, suffix: '/7', label: 'The watch never closes' },
  ];

  const dots = [
    { left: '8%', top: '22%', c: '#ef4444', d: 0 }, { left: '19%', top: '64%', c: '#f59e0b', d: 0.6 },
    { left: '33%', top: '38%', c: '#60a5fa', d: 1.2 }, { left: '46%', top: '72%', c: '#a855f7', d: 0.3 },
    { left: '58%', top: '26%', c: '#ef4444', d: 1.8 }, { left: '71%', top: '58%', c: '#f97316', d: 0.9 },
    { left: '84%', top: '34%', c: '#60a5fa', d: 1.5 }, { left: '92%', top: '68%', c: '#f59e0b', d: 2.1 },
  ];

  return (
    <section ref={ref} className="relative overflow-hidden py-16 sm:py-20 lg:py-36" style={{ background: T.night }}>
      {/* live traffic map of Calgary glowing under the whole band */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <motion.img
          src={publicAsset('images/calgary_map.png')}
          alt=""
          loading="lazy"
          decoding="async"
          width={1024} height={1024}
          className="h-[120%] w-full object-cover opacity-40"
          style={reduced ? undefined : { y: starsY }}
        />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${T.night} 0%, rgba(12,29,46,0.55) 35%, rgba(12,29,46,0.72) 70%, ${T.night} 100%)` }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 70% 40%, transparent 30%, rgba(12,29,46,0.85) 100%)' }} />
      </div>

      {/* incident constellation */}
      <motion.div className="absolute inset-0 pointer-events-none" style={reduced ? undefined : { y: starsY }} aria-hidden="true">
        {dots.map((s) => (
          <span key={s.left} className="absolute" style={{ left: s.left, top: s.top }}>
            <span className="absolute -inset-2 rounded-full animate-ping" style={{ background: s.c, opacity: 0.25, animationDelay: `${s.d}s`, animationDuration: '3s' }} />
            <span className="relative block w-1.5 h-1.5 rounded-full" style={{ background: s.c, boxShadow: `0 0 10px 2px ${s.c}66` }} />
          </span>
        ))}
        <svg className="absolute inset-0 w-full h-full opacity-[0.05]">
          <defs>
            <pattern id="lp-night-grid" width="72" height="72" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <path d="M72 0H0V72" fill="none" stroke={T.nightText} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#lp-night-grid)" />
        </svg>
      </motion.div>

      <div className="relative mx-auto max-w-[80rem] px-5 sm:px-8">
        <Reveal>
          <Eyebrow color={T.gold} light>2 a.m. · Somewhere in the NE</Eyebrow>
          <h2 className="mt-5 font-display font-extrabold tracking-[-0.025em] leading-[1.04]" style={{ color: T.nightText, fontSize: 'clamp(2.2rem, 5vw, 4.4rem)' }}>
            The watch doesn't<br />close at night.
          </h2>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed" style={{ color: T.nightSoft }}>
            Chinook or cold snap, rush hour or last call — reports keep landing
            and the picture keeps updating. This is what a city looks like when
            its residents are the sensor network.
          </p>
        </Reveal>

        <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden" style={{ background: 'rgba(237,242,240,0.14)' }}>
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={reduced ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }}
              className="p-7 lg:p-9"
              style={{ background: T.nightPanel }}
            >
              <p className="font-display font-extrabold tabular-nums leading-none" style={{ color: T.nightText, fontSize: 'clamp(2.4rem,3.6vw,3.6rem)' }}>
                <Counter to={s.value} suffix={s.suffix} />
              </p>
              <p className="mt-3 text-[13px] leading-snug" style={{ color: T.nightSoft }}>{s.label}</p>
            </motion.div>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
          {[
            { icon: Users, text: 'Community-run, non-profit' },
            { icon: Crosshair, text: 'Near-me view: your 3 km, nearest first' },
            { icon: Lock, text: 'Anonymous reporting available' },
            { icon: ShieldCheck, text: 'Admin-reviewed submissions' },
            { icon: Radio, text: 'Verify critical events with 911 / official channels' },
          ].map(({ icon: Icon, text }) => (
            <span key={text} className="flex items-center gap-2.5 text-[13px] font-semibold" style={{ color: T.nightSoft }}>
              <Icon size={14} style={{ color: T.bow }} />
              {text}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// COVERAGE — beyond city limits + city request (behaviour preserved)
// ---------------------------------------------------------------------------
function Coverage() {
  const [cityRequest, setCityRequest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleCityRequest = async () => {
    const city = cityRequest.trim().slice(0, 100);
    if (city.length < 2) { setMessage('Please enter a valid city name.'); return; }
    setSubmitting(true);
    setMessage(null);
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
    } catch { /* continue */ } finally { setSubmitting(false); }
    const subject = encodeURIComponent(`City Expansion Request: ${city}`);
    const body = encodeURIComponent(`Hello Calgary Watch team,\n\nPlease add support for ${city}.\n\nRequested via landing page at ${new Date(requestedAt).toISOString()}.`);
    window.open(`mailto:jorti104@mtroyal.ca?subject=${subject}&body=${body}`, '_blank');
    setMessage(`Request queued for ${city}. Thank you.`);
    setCityRequest('');
  };

  const towns = ['Airdrie', 'Cochrane', 'Chestermere', 'Okotoks', 'Strathmore', 'High River', 'Canmore', 'Langdon', 'Crossfield', 'Didsbury', 'Olds', '+ 20 more'];

  return (
    <section className="relative py-16 sm:py-20 lg:py-32 overflow-hidden" style={{ background: T.paper }}>
      <div className="mx-auto max-w-[80rem] px-5 sm:px-8 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <Reveal>
            <Eyebrow>Beyond city limits</Eyebrow>
            <h2 className="mt-5 font-display font-extrabold tracking-[-0.025em] leading-[1.04]" style={{ color: T.ink, fontSize: 'clamp(2.2rem, 4.6vw, 3.8rem)' }}>
              The watch reaches<br />100 km out.
            </h2>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed" style={{ color: T.inkSoft }}>
              From Airdrie to Okotoks, Cochrane to Strathmore — 30+ communities
              around Calgary share the same live map. Somewhere else in Alberta?
              Tell us where to point the watch next.
            </p>
          </Reveal>

          <Reveal delay={0.1} className="mt-8">
            <div className="flex flex-col sm:flex-row gap-3 max-w-md">
              <input
                id="city-request-input"
                type="text"
                placeholder="Name your city"
                value={cityRequest}
                maxLength={100}
                onChange={(e) => setCityRequest(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCityRequest(); }}
                className="flex-1 h-[52px] rounded-full px-6 text-[15px] font-medium outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(74,144,217,0.25)]"
                style={{ background: T.panel, border: `1.5px solid ${T.line}`, color: T.ink }}
                aria-label="Request a city"
              />
              <InkButton onClick={handleCityRequest} className={cn('shrink-0', submitting && 'opacity-60 pointer-events-none')}>
                {submitting ? 'Sending…' : 'Request it'}
              </InkButton>
            </div>
            {message && (
              <p className="mt-3 text-sm font-semibold" style={{ color: T.bow }} role="status">{message}</p>
            )}
            <a
              href="/coverage"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold transition-colors hover:opacity-75"
              style={{ color: T.sky }}
            >
              See the Airdrie and Calgary area coverage map
              <ArrowUpRight size={15} />
            </a>
          </Reveal>
        </div>

        {/* Region panel — towns pop in around the Calgary hub */}
        <Reveal delay={0.12}>
          <div className="relative rounded-[1.75rem] p-8 lg:p-10 overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em]" style={{ color: T.inkSoft }}>Region · Greater Calgary</p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {towns.map((t, i) => (
                <motion.span
                  key={t}
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.05 * i, duration: 0.45, ease: EASE }}
                  className="rounded-full px-4 py-2 text-[13px] font-bold"
                  style={t === '+ 20 more'
                    ? { background: T.ink, color: T.paper }
                    : { border: `1px solid ${T.line}`, color: T.ink, background: T.paper }}
                >
                  {t}
                </motion.span>
              ))}
            </div>
            <div className="mt-8 flex items-center gap-3 rounded-2xl px-5 py-4" style={{ background: `${T.bow}14`, border: `1px solid ${T.bow}33` }}>
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full animate-ping opacity-60" style={{ background: T.bow }} />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: T.bow }} />
              </span>
              <p className="text-[13px] font-semibold" style={{ color: T.ink }}>
                Calgary is the hub — every community within ~100 km can file and follow reports.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FILM STRIP — field prints drifting across the desk, pauses on hover
// ---------------------------------------------------------------------------
const STRIP_PRINTS = [
  { src: 'images/calgary1.webp', label: 'NE · golden hour' },
  { src: 'images/calgary4.webp', label: 'NW · Peace Bridge' },
  { src: 'images/calgary7.webp', label: 'SE · Scotsman Hill' },
  { src: 'images/calgary2.webp', label: 'SW · Calgary Tower' },
  { src: 'images/calgary8.webp', label: 'SE · Stampede Park' },
  { src: 'images/calgary5.webp', label: 'SW · Stephen Ave' },
  { src: 'images/calgary3.webp', label: 'NE · Deerfoot, 01:47' },
  { src: 'images/hero-wide.webp', label: 'SW · Bow River' },
];

function FilmStrip({ reduced }: { reduced: boolean }) {
  const prints = (key: string) => (
    <div key={key} className="flex items-center gap-6 pr-6 shrink-0">
      {STRIP_PRINTS.map((p, i) => (
        <figure
          key={`${key}-${p.src}`}
          className="relative shrink-0 rounded-xl p-2 pb-3 transition-transform duration-300 hover:scale-[1.04] hover:rotate-0"
          style={{
            background: T.panel,
            border: `1px solid ${T.line}`,
            transform: `rotate(${i % 2 ? -1.6 : 1.8}deg)`,
            boxShadow: '0 18px 34px -22px rgba(28,43,58,0.5)',
          }}
        >
          <img
            src={publicAsset(p.src)}
            alt={p.label}
            loading="lazy"
            decoding="async"
            width={480} height={320}
            className="h-36 w-56 sm:h-44 sm:w-72 object-cover rounded-lg"
          />
          <figcaption className="mt-2 flex items-center justify-between font-mono text-[9px] tracking-[0.18em] uppercase" style={{ color: T.nightSoft }}>
            <span>{p.label}</span>
            <span style={{ color: T.bow }}>CW-{String(i + 1).padStart(2, '0')}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );

  return (
    // Photography sits on the night band, the same ground the "one day on the
    // watch" plates use. Two photo sections on two different surfaces read as
    // two unrelated ideas, and prints on cream wash out — the page also ran
    // three cream sections back to back here, flattening the last third of the
    // scroll into one tone.
    <section className="relative py-16 sm:py-20 overflow-hidden" style={{ background: T.night }}>
      <div className="mx-auto max-w-[80rem] px-5 sm:px-8 mb-8 flex items-end justify-between gap-6">
        <Reveal>
          <Eyebrow color={T.gold}>Field photography · YYC</Eyebrow>
          <h2 className="mt-4 font-display font-extrabold tracking-[-0.02em]" style={{ color: T.nightText, fontSize: 'clamp(1.7rem, 3.6vw, 2.6rem)' }}>
            The city we're watching.
          </h2>
        </Reveal>
        <p className="hidden md:block font-mono text-[10px] uppercase tracking-[0.24em] pb-1 shrink-0" style={{ color: T.nightSoft }}>
          Hover to hold a print
        </p>
      </div>
      <div
        className="flex w-max hover:[animation-play-state:paused]"
        style={reduced ? undefined : { animation: 'lp-marquee 60s linear infinite' }}
      >
        {prints('a')}
        {prints('b')}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FINAL CTA + FOOTER
// ---------------------------------------------------------------------------
function Finale({ openLegal, reduced }: { openLegal: (m: 'privacy' | 'terms' | 'contact') => void; reduced: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] });
  const y = useTransform(scrollYProgress, [0, 1], [60, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.96, 1]);

  return (
    <section ref={ref} className="relative overflow-hidden" style={{ background: T.paper }}>
      <div className="mx-auto max-w-[80rem] px-5 sm:px-8 pt-24 lg:pt-32 pb-14">
        <motion.div
          style={reduced ? undefined : { y, scale }}
          className="relative overflow-hidden rounded-[2rem] px-7 py-16 sm:px-14 lg:px-20 lg:py-24 text-center shadow-[0_48px_90px_-40px_rgba(28,43,58,0.5)]"
        >
          <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${T.ink} 0%, #24466B 60%, ${T.bow} 130%)` }} aria-hidden="true" />
          {/* Stampede fireworks glow through the gradient */}
          <img
            src={publicAsset('images/calgary8.webp')}
            alt=""
            loading="lazy"
            decoding="async"
            width={800} height={620}
            className="absolute inset-0 h-full w-full object-cover opacity-35"
            style={{ mixBlendMode: 'screen' }}
            aria-hidden="true"
          />
          <svg className="absolute inset-0 w-full h-full opacity-[0.07]" aria-hidden="true">
            <defs>
              <pattern id="lp-cta-grid" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d="M56 0H0V56" fill="none" stroke="#fff" strokeWidth="0.6" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#lp-cta-grid)" />
          </svg>

          <div className="relative">
            <p className="font-mono text-[11px] uppercase tracking-[0.34em]" style={{ color: T.gold }}>The map is already on</p>
            <h2 className="mt-5 font-display font-extrabold tracking-[-0.03em] leading-[0.98]" style={{ color: T.paper, fontSize: 'clamp(1.9rem, 6.6vw, 5.6rem)' }}>
              See what's happening<br />right now.
            </h2>
            <p className="mx-auto mt-6 max-w-md text-[15.5px] leading-relaxed" style={{ color: 'rgba(247,243,234,0.75)' }}>
              Free, no subscription, no ads. An account is only needed to file a
              report of your own.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3.5">
              <InkButton href="/map" tone="paper" className="px-9">
                <MapPin size={16} />
                Open the live map
                <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
              </InkButton>
              <a
                href="/map?report=true"
                className="inline-flex items-center justify-center rounded-full px-7 h-[52px] text-[15px] font-bold transition-transform hover:-translate-y-0.5"
                style={{ border: '1.5px solid rgba(247,243,234,0.5)', color: T.paper }}
              >
                Sign in to report
              </a>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="mx-auto max-w-[80rem] px-5 sm:px-8 pb-10" style={{ color: T.inkSoft }}>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pt-8" style={{ borderTop: `1px solid ${T.line}` }}>
          <div>
            <p className="font-display text-lg font-bold" style={{ color: T.ink }}>Calgary Watch</p>
            <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed">
              A community safety map built by Calgarians, for Calgarians.
              Informational awareness only — always verify critical incidents
              with official agencies.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-semibold">
            <a href="/map" className="hover:opacity-70 transition-opacity">Live Calgary crime map</a>
            <a href="/calgary-neighbourhood-watch" className="hover:opacity-70 transition-opacity">Neighbourhood watch guide</a>
            <a href="/coverage" className="hover:opacity-70 transition-opacity">Airdrie &amp; area coverage</a>
            <a href="/about" className="hover:opacity-70 transition-opacity">How Calgary Watch works</a>
            <button type="button" onClick={() => openLegal('privacy')} className="hover:opacity-70 transition-opacity">Privacy</button>
            <button type="button" onClick={() => openLegal('terms')} className="hover:opacity-70 transition-opacity">Terms</button>
            <button type="button" onClick={() => openLegal('contact')} className="hover:opacity-70 transition-opacity">Contact</button>
          </nav>
        </div>
        <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.22em] flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>© {new Date().getFullYear()} Calgary Watch</span>
          <span aria-hidden="true">·</span>
          <span>51.0447° N, 114.0719° W</span>
          <span aria-hidden="true">·</span>
          <span style={{ color: T.bow }}>Non-profit · Community-run</span>
        </p>
      </footer>
    </section>
  );
}

// ---------------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------------
export default function LandingPage() {
  const reduced = usePrefersReducedMotion();
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | 'contact' | null>(null);
  const { scrollYProgress } = useScroll();

  // overflow-x-clip (not hidden): a hidden ancestor breaks position:sticky
  // for the pinned how-it-works ride; clip contains overflow without
  // creating a scroll container.
  return (
    <div className="relative min-h-dvh font-sans overflow-x-clip isolate" style={{ background: T.paper, color: T.ink }}>
      <style>{`
        @keyframes lp-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>

      <Nav />
      {!reduced && <RiverRail progress={scrollYProgress} />}

      <main>
        <Hero reduced={reduced} />
        <Ticker reduced={reduced} />
        <DayTunnel reduced={reduced} />
        <Quadrants reduced={reduced} />
        <HowItWorks reduced={reduced} />
        <Categories reduced={reduced} />
        <NearMe reduced={reduced} />
        <NightWatch reduced={reduced} />
        <Coverage />
        <FilmStrip reduced={reduced} />
        <Finale openLegal={setLegalModal} reduced={reduced} />
      </main>

      <AnimatePresence>
        {legalModal && <LegalModal legalModal={legalModal} onClose={() => setLegalModal(null)} />}
      </AnimatePresence>
    </div>
  );
}
