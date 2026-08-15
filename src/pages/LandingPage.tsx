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
    // Short summary only. The full policy lives at /privacy — a two-sentence
    // modal cannot state purposes, retention, third parties and access rights,
    // which is what a privacy policy has to do.
    privacy: {
      title: 'Privacy',
      body: 'We do not sell personal information, run advertising, or track you across other sites. Posting anonymously hides your name from the public map, but your account is still recorded for moderation. The full policy sets out what is stored, for how long, who else is involved, and how to get your data or have it deleted.',
      href: '/privacy',
      hrefLabel: 'Read the full privacy policy',
    },
    terms: { title: 'Terms of Use', body: 'Calgary Watch is for informational awareness only. Always verify critical incidents with official agencies. Misleading or abusive submissions may be removed by administrators.' },
    contact: { title: 'Contact', body: 'For support, account issues, data access or deletion requests, contact: jorti104@mtroyal.ca' },
  }[legalModal] as { title: string; body: string; href?: string; hrefLabel?: string };

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
        {content.href && (
          <a
            href={content.href}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold transition-opacity hover:opacity-75"
            style={{ color: T.sky }}
          >
            {content.hrefLabel} <ArrowUpRight size={15} />
          </a>
        )}
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
  /**
   * Whether the bar has left the hero behind.
   *
   * It used to flip at 40px of scroll, which put a paper bar over the top of
   * the artwork for the remaining 95% of the hero. On mobile it never flipped
   * at all — the bar carried a hard-coded navy background, so the collage was
   * covered from the first pixel.
   *
   * Tying it to the hero element instead means the bar stays out of the way
   * for exactly as long as there is artwork behind it, however tall that
   * turns out to be.
   */
  const [pastHero, setPastHero] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const hero = document.getElementById('site-hero');
    // No hero to sit over: take the solid treatment. A transparent bar over
    // light content is unreadable, so that is the safe default.
    if (!hero) { setPastHero(true); return; }
    const observer = new IntersectionObserver(
      ([entry]) => setPastHero(!entry.isIntersecting),
      { rootMargin: '-64px 0px 0px 0px' },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 80) setVisible(true);
      else if (y > lastY.current + 6) setVisible(false);
      else if (y < lastY.current - 6) setVisible(true);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  /** Over the hero the bar gets out of the way; past it, it behaves normally. */
  const solid = pastHero || menuOpen;

  const link = cn(
    'px-3 py-1.5 text-sm font-semibold transition-colors',
    solid ? 'hover:bg-[rgba(28,43,58,0.06)]' : 'hover:bg-white/10',
  );

  return (
    <nav
      className={cn(
        'fixed top-0 inset-x-0 z-50 transition-[transform,background-color] duration-300',
        visible || menuOpen ? 'translate-y-0' : '-translate-y-full',
      )}
      style={{
        // Over the hero: no bar, just enough of a scrim that the wordmark stays
        // legible wherever the collage happens to be bright. With the menu open
        // it goes solid so the header meets the panel below it cleanly.
        background: menuOpen
          ? '#06162F'
          : pastHero
            ? 'rgba(247,243,234,0.9)'
            : 'linear-gradient(to bottom, rgba(6,22,47,0.62), rgba(6,22,47,0.18) 70%, transparent)',
        backdropFilter: pastHero && !menuOpen ? 'blur(14px)' : undefined,
        borderBottom: pastHero && !menuOpen ? `1px solid ${T.line}` : undefined,
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
            src={publicAsset('images/calgary-watch-plane-mark.webp')}
            alt=""
            width={40}
            height={40}
            className="h-11 w-12 object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="flex flex-col leading-none text-left">
            <span className={cn('font-display text-[17px] font-bold tracking-tight', solid ? 'text-[#1C2B3A]' : 'text-[#EDF2F0]')}>Calgary Watch</span>
            <span className={cn('mt-0.5 font-mono text-[8.5px] font-medium uppercase tracking-[0.34em]', solid ? 'text-[#5A6B7D]' : 'text-[#AFC5DF]')}>Community Safety</span>
          </span>
        </button>

        <div className="hidden md:flex items-center gap-1" style={{ color: solid ? T.ink : T.nightText }}>
          <a href="#features" className={link}>What we track</a>
          <a href="#how-it-works" className={link}>How it works</a>
          <a href="/about" className={link}>About</a>
          <a href="/coverage" className={link}>Airdrie &amp; area coverage</a>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/map"
            className="hidden md:inline-flex items-center gap-2 rounded-full h-10 px-5 text-sm font-bold transition-transform hover:-translate-y-0.5"
            style={{ background: solid ? T.ink : '#F2EFE8', color: solid ? T.panel : '#06162F' }}
          >
            <MapPin size={14} />
            Open the live map
          </a>
          <button
            type="button"
            className="relative z-[61] md:hidden w-10 h-10 flex items-center justify-center border transition-transform active:scale-95"
            style={{
              borderColor: menuOpen ? '#E52C20' : pastHero ? T.line : 'rgba(237,242,240,0.55)',
              color: menuOpen ? '#06162F' : pastHero ? T.ink : T.nightText,
              background: menuOpen ? '#F2EFE8' : pastHero ? 'rgba(255,253,248,0.9)' : 'rgba(6,22,47,0.55)',
            }}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
          >
            {menuOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-navigation"
            initial={{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
            animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
            exit={{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.42, ease: EASE }}
            className="absolute inset-x-0 top-full z-[60] h-[calc(100dvh-4rem)] md:hidden overflow-y-auto bg-[#06162F] text-[#F2EFE8]"
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <img src={publicAsset('images/calgary-watch-plane-mark.webp')} alt="" className="absolute -right-20 top-4 size-80 rotate-6 object-contain opacity-[0.1]" />
              <div className="absolute -left-20 top-[43%] h-16 w-[140%] -rotate-6 bg-[#E52C20]/15" />
            </div>

            <div className="relative flex min-h-full flex-col px-5 pb-6 pt-8 sm:px-7">
              <div className="mb-7 flex items-center justify-between border-b border-white/15 pb-4 font-mono text-[9px] font-semibold uppercase tracking-[0.24em] text-[#AFC5DF]">
                <span>Calgary / 51.0447° N</span>
                <span className="text-[#E52C20]">Navigation / 01</span>
              </div>

              <div className="flex flex-col">
                {[
                  ['01', 'What we track', '#features'],
                  ['02', 'How it works', '#how-it-works'],
                  ['03', 'About', '/about'],
                  ['04', 'Area coverage', '/coverage'],
                ].map(([number, label, href], index) => (
                  <motion.a
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.055, duration: 0.42, ease: EASE }}
                    className="group flex min-h-16 items-center gap-4 border-b border-white/15 py-3 font-display text-[clamp(1.55rem,8vw,2.25rem)] font-black uppercase leading-none tracking-[-0.035em]"
                  >
                    <span className="w-6 font-mono text-[9px] tracking-normal text-[#E52C20]">{number}</span>
                    <span className="flex-1">{label}</span>
                    <ArrowUpRight size={20} className="text-[#AFC5DF] transition-transform group-active:translate-x-1 group-active:-translate-y-1" />
                  </motion.a>
                ))}
              </div>

              <div className="mt-auto pt-8">
                <a
                  href="/map"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-15 items-center justify-between bg-[#F2EFE8] px-5 font-display text-[15px] font-black uppercase text-[#06162F] shadow-[5px_5px_0_#E52C20] active:translate-x-1 active:translate-y-1 active:shadow-none"
                >
                  <span className="flex items-center gap-3"><MapPin size={17} /> Open the live map</span>
                  <ArrowRight size={18} />
                </a>
                <p className="mt-5 max-w-[30ch] text-[12px] leading-relaxed text-[#AFC5DF]">
                  Community reports and verified city data, in one clear view of Calgary.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// HERO — parallax skyline plate + staggered display type + live dispatch card
// ---------------------------------------------------------------------------
const MOBILE_ROUTE = 'BOWNESS  /  BELTLINE  /  INGLEWOOD  /  FOREST LAWN  /  BRIDGELAND  /  KENSINGTON  /  ';

/** Mobile hero: an animated Calgary collage built like a cultural night poster. */
function MobileHero({ reduced }: { reduced: boolean }) {
  return (
    <div className="relative z-10 min-h-[100dvh] overflow-hidden bg-[#06162F] lg:hidden">
      <motion.img
        src={publicAsset('images/mobile-hero-calgary-collage.webp')}
        alt="Art collage of the Calgary Tower, downtown, the Bow River and city streets"
        width={720}
        height={1280}
        fetchPriority="high"
        initial={false}
        animate={reduced ? undefined : { scale: [1.025, 1.055, 1.025], y: ['0%', '-0.8%', '0%'] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0 h-full w-full object-cover object-center"
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = publicAsset('images/calgary2.webp'); }}
      />
      {!reduced && (
        <div className="absolute inset-0" aria-hidden="true">
          <motion.img
            src={publicAsset('images/mobile-hero-calgary-collage.webp')}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
            style={{ clipPath: 'polygon(0 0, 48% 0, 36% 62%, 0 57%)', filter: 'saturate(1.08) contrast(1.04)' }}
            animate={{ x: ['-1.8%', '0.8%', '-1.8%'], rotate: [-0.35, 0.2, -0.35] }}
            transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.img
            src={publicAsset('images/mobile-hero-calgary-collage.webp')}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
            style={{ clipPath: 'polygon(39% 0, 100% 0, 100% 62%, 66% 57%)' }}
            animate={{ x: ['1.2%', '-0.5%', '1.2%'], y: ['-0.5%', '0.7%', '-0.5%'] }}
            transition={{ duration: 10.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -left-[18%] top-[33%] h-[19%] w-[70%] -rotate-[7deg] bg-[#E52C20] mix-blend-multiply"
            animate={{ x: ['-4%', '4%', '-4%'] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            style={{ opacity: 0.2 }}
          />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#06162F]/70" aria-hidden="true" />

      <div className="absolute left-4 top-[11.5%] z-[3] -rotate-3 bg-[#F2EFE8] px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#06162F] shadow-[3px_3px_0_#E52C20]" aria-hidden="true">
        Calgary / 51.0447° N
      </div>
      <motion.img
        src={publicAsset('images/calgary-watch-plane-mark.webp')}
        alt=""
        className="absolute right-3 top-[16%] z-[3] size-20 rotate-6 object-contain drop-shadow-[0_2px_3px_rgba(6,22,47,0.9)]"
        animate={reduced ? undefined : { rotate: [6, 1, 6], y: [0, -4, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      />

      <div className="absolute inset-x-[-8%] top-[48%] z-[3] -rotate-2 overflow-hidden border-y border-[#06162F] bg-[#F2EFE8] py-2 text-[#06162F] shadow-[0_4px_0_rgba(229,44,32,0.9)] [@media(min-height:700px)]:top-[55%]" aria-hidden="true">
        <motion.div
          className="flex w-max whitespace-nowrap font-display text-[11px] font-black uppercase tracking-[0.14em]"
          animate={reduced ? undefined : { x: ['0%', '-50%'] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        >
          <span>{MOBILE_ROUTE}{MOBILE_ROUTE}</span>
          <span>{MOBILE_ROUTE}{MOBILE_ROUTE}</span>
        </motion.div>
      </div>

      <div className="relative z-[4] flex min-h-[100dvh] flex-col px-5 pb-5 pt-20 sm:px-7">
        <div className="flex-1" aria-hidden="true" />

        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#AFC5DF]">
          <motion.span
            className="size-2 bg-[#E52C20]"
            animate={reduced ? undefined : { rotate: [0, 90, 180], scale: [1, 0.72, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
          Community reports + verified data
        </div>

        <h1 className="font-display text-[clamp(3.1rem,15.5vw,4.5rem)] font-black uppercase leading-[0.78] tracking-[-0.04em] text-[#F2EFE8] max-[340px]:text-[2.75rem]">
          <span className="block">Know your</span>
          <span className="relative mt-2 inline-block overflow-hidden pb-[0.13em] pr-3 text-[#E52C20]">
            city.
            {!reduced && (
              <motion.span
                className="absolute inset-y-0 w-8 -skew-x-12 bg-white/30 mix-blend-screen"
                initial={{ x: '-180%' }}
                animate={{ x: '600%' }}
                transition={{ duration: 1.2, delay: 0.7, repeat: Infinity, repeatDelay: 5.5, ease: [0.77, 0, 0.175, 1] }}
                aria-hidden="true"
              />
            )}
          </span>
        </h1>

        <p className="mt-3 max-w-[33ch] text-[13px] font-medium leading-[1.5] text-[#D5DFEB] sm:text-[14px]">
          Live reports and trusted city data, cut into one clear view of Calgary.
        </p>

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2.5">
          <a
            href="/map"
            className="flex h-13 min-w-0 items-center justify-center gap-2 bg-[#F2EFE8] px-4 text-[14px] font-black uppercase tracking-[-0.01em] text-[#06162F] shadow-[4px_4px_0_#E52C20] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            <MapPin size={16} aria-hidden="true" />
            Open the map
            <ArrowRight size={14} aria-hidden="true" />
          </a>
          <a
            href="/map?report=true"
            className="flex h-13 items-center justify-center border border-[#F2EFE8]/60 bg-[#06162F] px-4 text-[14px] font-bold text-[#F2EFE8] transition-transform active:translate-y-0.5"
          >
            Report
          </a>
        </div>
      </div>
    </div>
  );
}

function Hero({ reduced }: { reduced: boolean }) {
  const collageX = useSpring(useMotionValue(0), { stiffness: 90, damping: 22 });
  const collageY = useSpring(useMotionValue(0), { stiffness: 90, damping: 22 });

  const onCollageMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    collageX.set(((event.clientX - rect.left) / rect.width - 0.5) * 18);
    collageY.set(((event.clientY - rect.top) / rect.height - 0.5) * 12);
  };

  const resetCollage = () => {
    collageX.set(0);
    collageY.set(0);
  };

  return (
    <section id="site-hero" className="relative min-h-[100dvh] overflow-hidden bg-[#06162F]">
      <MobileHero reduced={reduced} />

      <div
        className="absolute inset-0 hidden lg:block"
        onPointerMove={onCollageMove}
        onPointerLeave={resetCollage}
      >
        <motion.img
          src={publicAsset('images/desktop-hero-calgary-collage.webp')}
          alt="Art collage of Calgary Tower, Peace Bridge, the Bow River and downtown at night"
          width={1920}
          height={1080}
          fetchPriority="high"
          initial={false}
          animate={reduced ? undefined : { scale: [1.015, 1.04, 1.015] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = publicAsset('images/hero-wide.webp'); }}
        />

        {!reduced && (
          <motion.div className="absolute inset-0" style={{ x: collageX, y: collageY }} aria-hidden="true">
            <motion.img
              src={publicAsset('images/desktop-hero-calgary-collage.webp')}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ clipPath: 'polygon(51% 0, 100% 0, 100% 58%, 67% 56%, 45% 47%)', filter: 'saturate(1.08) contrast(1.03)' }}
              animate={{ x: ['0.7%', '-0.5%', '0.7%'], y: ['-0.4%', '0.5%', '-0.4%'] }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.img
              src={publicAsset('images/desktop-hero-calgary-collage.webp')}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ clipPath: 'polygon(42% 55%, 68% 58%, 100% 48%, 100% 100%, 31% 100%)' }}
              animate={{ x: ['-0.5%', '0.65%', '-0.5%'], y: ['0.45%', '-0.3%', '0.45%'] }}
              transition={{ duration: 12.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        )}

        <div className="absolute inset-0 bg-gradient-to-r from-[#06162F]/20 via-transparent to-transparent" aria-hidden="true" />

        <div className="absolute left-[3.5%] top-[15%] z-[3] -rotate-2 bg-[#F2EFE8] px-3 py-1.5 font-display text-[11px] font-black uppercase tracking-[0.16em] text-[#06162F] shadow-[4px_4px_0_#E52C20]" aria-hidden="true">
          Calgary / 51.0447° N / 114.0719° W
        </div>

        <motion.div
          className="absolute right-[4%] top-[12%] z-[3] size-32 rotate-6 drop-shadow-[0_3px_4px_rgba(6,22,47,0.9)]"
          animate={reduced ? undefined : { rotate: [6, 2, 6], y: [0, -5, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          <img src={publicAsset('images/calgary-watch-plane-mark.webp')} alt="" className="size-full object-contain" />
        </motion.div>

        <div className="absolute bottom-[7%] right-[2.5%] z-[3] font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#F2EFE8]/65 [writing-mode:vertical-rl]" aria-hidden="true">
          Community-made · Calgary, Alberta
        </div>

        <div className="absolute left-[46%] right-[-3%] top-[73%] z-[3] rotate-[-2deg] overflow-hidden border-y border-[#06162F] bg-[#F2EFE8] py-2.5 text-[#06162F] shadow-[0_5px_0_#E52C20]" aria-hidden="true">
          <motion.div
            className="flex w-max whitespace-nowrap font-display text-[12px] font-black uppercase tracking-[0.16em]"
            animate={reduced ? undefined : { x: ['0%', '-50%'] }}
            transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
          >
            <span>{MOBILE_ROUTE}{MOBILE_ROUTE}</span>
            <span>{MOBILE_ROUTE}{MOBILE_ROUTE}</span>
          </motion.div>
        </div>

        <div className="relative z-[4] flex min-h-[100dvh] w-[48%] flex-col justify-end px-[clamp(3rem,6vw,7rem)] pb-[clamp(3rem,6vh,5.5rem)] pt-28">
          <div className="mb-4 flex items-center gap-3 font-display text-xs font-bold uppercase tracking-[0.15em] text-[#AFC5DF]">
            <motion.span
              className="size-2.5 bg-[#E52C20]"
              animate={reduced ? undefined : { rotate: [0, 90, 180], scale: [1, 0.72, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden="true"
            />
            Community reports + verified data
          </div>

          <h1 className="font-display text-[clamp(5rem,9vw,9.5rem)] font-black uppercase leading-[0.76] tracking-[-0.04em] text-[#F2EFE8]">
            <span className="block">Know</span>
            <span className="block">your</span>
            <span className="relative mt-3 inline-block overflow-hidden pb-[0.12em] pr-6 text-[#E52C20]">
              city.
              {!reduced && (
                <motion.span
                  className="absolute inset-y-0 w-12 -skew-x-12 bg-white/30 mix-blend-screen"
                  initial={{ x: '-180%' }}
                  animate={{ x: '850%' }}
                  transition={{ duration: 1.4, delay: 0.8, repeat: Infinity, repeatDelay: 6, ease: [0.77, 0, 0.175, 1] }}
                  aria-hidden="true"
                />
              )}
            </span>
          </h1>

          <p className="mt-5 max-w-[31rem] text-[clamp(1rem,1.2vw,1.2rem)] font-medium leading-relaxed text-[#D5DFEB]">
            Live community reports and trusted city data, cut into one clear view of Calgary.
          </p>

          <div className="mt-7 flex items-center gap-4">
            <a
              href="/map"
              className="group inline-flex h-14 items-center gap-3 bg-[#F2EFE8] px-7 font-display text-[15px] font-black uppercase text-[#06162F] shadow-[5px_5px_0_#E52C20] transition-transform hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-none"
            >
              <MapPin size={17} />
              <span className="xl:hidden">Open map</span>
              <span className="hidden xl:inline">Open the map</span>
              <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
            </a>
            <a
              href="/map?report=true"
              className="inline-flex h-14 items-center border border-[#F2EFE8]/55 px-7 font-display text-[15px] font-bold text-[#F2EFE8] transition-colors hover:bg-[#F2EFE8] hover:text-[#06162F] active:translate-y-0.5"
            >
              <span className="xl:hidden">Report</span>
              <span className="hidden xl:inline">Sign in to report</span>
            </a>
          </div>

          <div className="mt-8 flex max-w-[34rem] items-center justify-between border-t border-[#F2EFE8]/20 pt-4 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#AFC5DF]">
            <span>Free / non-profit</span>
            <span>All four quadrants</span>
            <span>Built for neighbours</span>
          </div>
        </div>
      </div>
    </section>
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
    // Desktop only. On a phone this sat directly under the hero's own scrolling
    // neighbourhood strip, so the first two things below the fold were both
    // sliding text — and a narrow viewport shows so little of each item that
    // "Car break-in / Inglewood" reads as fragments rather than as reports.
    <div className="relative z-10 hidden overflow-hidden py-4 -rotate-[0.6deg] scale-[1.01] md:block" style={{ background: T.ink }} aria-hidden="true">
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
  const plateClip = i % 2
    ? 'polygon(1.5% 0, 98% 1.5%, 100% 96%, 3% 100%, 0 5%)'
    : 'polygon(2% 2%, 100% 0, 98% 98%, 1% 100%, 0 4%)';

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: count - i, opacity }}
      aria-hidden="true"
    >
      <motion.div
        className="relative w-[min(78vw,800px)]"
        style={{
          scale, x, y, rotateY,
          transformPerspective: 1200,
          willChange: 'transform, opacity',
        }}
      >
        <div className="absolute inset-0 translate-x-3 translate-y-3 bg-[#E52C20]" style={{ clipPath: plateClip }} aria-hidden="true" />
        <div className="relative bg-[#F2EFE8] p-2 sm:p-3" style={{ clipPath: plateClip, boxShadow: '0 55px 110px -35px rgba(0,0,0,0.86)' }}>
          <div className="relative overflow-hidden" style={{ clipPath: plateClip }}>
            <img
              src={publicAsset(plate.src)}
              alt=""
              loading="lazy"
              decoding="async"
              width={1520} height={950}
              className="w-full aspect-[16/10] object-cover saturate-[0.82] contrast-[1.12]"
            />
            <div className="absolute inset-0 bg-[#0B3157]/15 mix-blend-color" aria-hidden="true" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(6,22,47,0.5), transparent 48%)' }} />
          </div>
          <span
            className="absolute left-5 top-5 -rotate-2 bg-[#06162F] px-3 py-2 font-display text-xl font-black tabular-nums text-[#F2EFE8] shadow-[4px_4px_0_#E52C20] sm:left-7 sm:top-7 sm:text-2xl"
          >
            {plate.time}
          </span>
          <span className="absolute bottom-5 right-6 font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-white/75 sm:text-[10px]">
            YYC / Frame 0{i + 1}
          </span>
        </div>
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
    const styles = window.getComputedStyle(el);
    const step = card.offsetWidth + (Number.parseFloat(styles.columnGap || styles.gap) || 0);
    setIdx(Math.max(0, Math.min(DAY_PLATES.length - 1, Math.round(el.scrollLeft / step))));
  };

  return (
    <section className="relative lg:hidden overflow-hidden py-16 sm:py-20" style={{ background: T.night }} aria-label="One day on the watch — photo stories">
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(rgba(242,239,232,0.75) 0.7px, transparent 0.7px)', backgroundSize: '7px 7px' }} aria-hidden="true" />
      <motion.img
        src={publicAsset('images/plane-signal.webp')}
        alt=""
        className="pointer-events-none absolute -right-20 top-8 w-72 rotate-[-7deg] object-contain opacity-[0.16]"
        animate={reduced ? undefined : { x: [8, -6, 8], y: [4, -3, 4] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      />
      <div className="relative px-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow color="#E52C20" light>Field footage · Calgary</Eyebrow>
            <h2 className="mt-4 font-display text-[clamp(2.8rem,14vw,4.8rem)] font-black uppercase leading-[0.79] tracking-[-0.045em] text-[#F2EFE8]">
              One day<br /><span className="text-[#E52C20]">on watch.</span>
            </h2>
          </div>
          <div className="mt-1 -rotate-3 border border-[#F2EFE8]/35 px-3 py-2 text-right font-mono uppercase text-[#AFC5DF]" aria-hidden="true">
            <span className="block text-[8px] tracking-[0.2em]">Archive</span>
            <span className="mt-1 block font-display text-xl font-black tracking-tight text-[#F2EFE8]">24H</span>
          </div>
        </div>

        {/* story-style segmented progress */}
        <div className="mt-7 flex gap-1" aria-hidden="true">
          {DAY_PLATES.map((p, i) => (
            <span key={p.src} className="h-1 flex-1 overflow-hidden" style={{ background: 'rgba(237,242,240,0.16)' }}>
              <span
                className="block h-full transition-all duration-400"
                style={{ width: i <= idx ? '100%' : '0%', background: i === idx ? '#E52C20' : '#F2EFE8' }}
              />
            </span>
          ))}
        </div>
      </div>

      {/* swipe deck */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="mt-6 flex gap-5 overflow-x-auto snap-x snap-mandatory no-scrollbar px-5 sm:px-8 pb-5"
      >
        {DAY_PLATES.map((p, i) => (
          <motion.figure
            key={p.src}
            initial={reduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.55, delay: Math.min(i, 2) * 0.08, ease: EASE }}
            className="relative w-[84vw] max-w-[27rem] shrink-0 snap-center pt-1"
            style={{ rotate: `${i % 2 ? 0.8 : -0.8}deg` }}
          >
            <div className="absolute inset-0 translate-x-2 translate-y-2 bg-[#E52C20]" style={{ clipPath: 'polygon(1% 0, 99% 1%, 100% 97%, 2% 100%, 0 4%)' }} aria-hidden="true" />
            <div className="relative bg-[#F2EFE8] p-2" style={{ clipPath: 'polygon(1% 0, 99% 1%, 100% 97%, 2% 100%, 0 4%)' }}>
            <div className="relative overflow-hidden">
              <img
                src={publicAsset(p.src)}
                alt=""
                loading="lazy"
                decoding="async"
                width={1520} height={1045}
                className="w-full aspect-[4/5] object-cover saturate-[0.8] contrast-[1.12]"
              />
              <div className="absolute inset-0 bg-[#0B3157]/15 mix-blend-color" aria-hidden="true" />
              <span
                className="absolute left-3 top-3 -rotate-2 bg-[#06162F] px-3 py-2 font-display text-lg font-black tabular-nums text-[#F2EFE8] shadow-[3px_3px_0_#E52C20]"
              >
                {p.time}
              </span>
              <span className="absolute bottom-3 right-3 font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-white/75">Frame 0{i + 1}</span>
            </div>
            <figcaption className="px-3 pb-4 pt-4 text-[#06162F]">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#E52C20]">{p.note}</p>
              <p className="mt-1.5 font-display text-[19px] font-black uppercase leading-[1.02] tracking-[-0.02em]">{p.caption}</p>
            </figcaption>
            </div>
          </motion.figure>
        ))}
        <div className="w-1 shrink-0" aria-hidden="true" />
      </div>

      {/* swipe affordance */}
      <div className="mt-2 px-5 sm:px-8 flex items-center justify-between border-t border-[#F2EFE8]/20 pt-4 font-mono text-[9px] uppercase tracking-[0.2em] text-[#AFC5DF]">
        <span>Swipe the archive</span>
        <span className="flex items-center gap-2.5">
        <motion.span
          animate={reduced ? undefined : { x: [0, 6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="inline-flex"
          aria-hidden="true"
        >
          <ArrowRight size={12} style={{ color: T.gold }} />
        </motion.span>
        {String(idx + 1).padStart(2, '0')} / {String(DAY_PLATES.length).padStart(2, '0')}
        </span>
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
      <section className="relative overflow-hidden px-5 py-20 sm:px-8" style={{ background: T.night }}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(rgba(242,239,232,0.75) 0.7px, transparent 0.7px)', backgroundSize: '7px 7px' }} aria-hidden="true" />
        <div className="mx-auto max-w-[80rem]">
          <Eyebrow color="#E52C20" light>Field footage · Calgary</Eyebrow>
          <h2 className="mt-4 font-display text-5xl font-black uppercase leading-[0.84] tracking-[-0.04em] text-[#F2EFE8]">One day<br /><span className="text-[#E52C20]">on watch.</span></h2>
          <div className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {DAY_PLATES.map((p, i) => (
              <figure key={p.src} className="relative pt-1" style={{ rotate: `${i % 2 ? 0.6 : -0.6}deg` }}>
                <div className="absolute inset-0 translate-x-2 translate-y-2 bg-[#E52C20]" aria-hidden="true" />
                <div className="relative bg-[#F2EFE8] p-2">
                  <img src={publicAsset(p.src)} alt="" loading="lazy" className="w-full aspect-[4/3] object-cover saturate-[0.82] contrast-[1.1]" />
                  <figcaption className="px-3 pb-3 pt-4 text-[#06162F]">
                    <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#E52C20]">{p.time} · {p.note}</p>
                    <p className="mt-1 font-display text-lg font-black uppercase leading-tight">{p.caption}</p>
                  </figcaption>
                </div>
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
        {/* offset-print halftone field */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(rgba(242,239,232,0.8) 0.7px, transparent 0.7px)', backgroundSize: '8px 8px' }} aria-hidden="true" />
        <div className="pointer-events-none absolute -left-[8%] top-[22%] h-20 w-[46%] -rotate-6 bg-[#E52C20]/10" aria-hidden="true" />

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

        {/* field-archive registration frame */}
        <div className="absolute inset-3 sm:inset-6 pointer-events-none" style={{ zIndex: 40 }} aria-hidden="true">
          {['top-0 left-0 border-t border-l', 'top-0 right-0 border-t border-r', 'bottom-0 left-0 border-b border-l', 'bottom-0 right-0 border-b border-r'].map((pos) => (
            <span key={pos} className={cn('absolute w-5 h-5 sm:w-8 sm:h-8', pos)} style={{ borderColor: 'rgba(237,242,240,0.35)' }} />
          ))}
          <span className="absolute top-1.5 left-8 sm:top-2 sm:left-12 font-mono text-[8.5px] sm:text-[10px] tracking-[0.3em] uppercase" style={{ color: T.nightSoft }}>
            Archive / YYC / 24H
          </span>
          <span className="absolute top-1.5 right-8 sm:top-2 sm:right-12 font-mono text-[8.5px] sm:text-[10px] tracking-[0.3em] uppercase flex items-center gap-2" style={{ color: T.nightSoft }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: T.red }} />
            Live sequence
          </span>
        </div>

        {/* plates */}
        {DAY_PLATES.map((p, i) => (
          <DayPlate key={p.src} plate={p} i={i} count={count} progress={smooth} />
        ))}

        {/* intro title — owns the first stretch, always above the plates */}
        <motion.img
          src={publicAsset('images/plane-signal.webp')}
          alt=""
          className="pointer-events-none absolute right-[3%] top-[12%] w-[min(34vw,30rem)] rotate-[-5deg] object-contain opacity-[0.13]"
          style={{ zIndex: 44 }}
          animate={{ x: [12, -8, 12], y: [6, -4, 6] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        />
        <motion.div
          className="absolute inset-0 flex flex-col items-start justify-center px-[clamp(4rem,9vw,10rem)] pointer-events-none"
          style={{ opacity: introOpacity, y: introY, scale: introScale, zIndex: 45 }}
        >
          <Eyebrow color="#E52C20" light>Field footage · Calgary</Eyebrow>
          <h2
            className="mt-6 font-display font-black uppercase tracking-[-0.045em] leading-[0.76]"
            style={{ color: T.nightText, fontSize: 'clamp(5rem, 10vw, 9rem)', textShadow: '0 4px 40px rgba(4,12,20,0.9)' }}
          >
            One day<br /><span className="text-[#E52C20]">on watch.</span>
          </h2>
          <p className="mt-8 font-mono text-[10px] sm:text-[11px] tracking-[0.3em] uppercase flex items-center gap-4" style={{ color: T.nightSoft }}>
            Scroll the archive
            <motion.span
              animate={reduced ? undefined : { x: [0, 8, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="block h-px w-12"
              style={{ background: `linear-gradient(to right, #E52C20, transparent)` }}
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
              className="flex min-h-[4.5rem] rotate-[-1deg] flex-col items-start justify-center bg-[#F2EFE8] px-6 py-3 text-left shadow-[6px_6px_0_#E52C20]"
            >
              <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] tabular-nums text-[#E52C20]">
                {DAY_PLATES[active].time} · {DAY_PLATES[active].note}
              </p>
              <p
                className="mt-1 font-display text-xl font-black uppercase tracking-[-0.02em] text-[#06162F] sm:text-2xl"
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
  const direction = active % 2 === 0 ? -1 : 1;

  return (
    <section className="relative overflow-hidden bg-[#06162F] py-20 sm:py-24 lg:py-28">
      <div ref={sectionRef} className="relative mx-auto max-w-[96rem] px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-col gap-5 border-b border-[#F2EFE8]/20 pb-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.26em] text-[#E52C20]">One city · four directions</p>
              <h2 className="mt-4 max-w-3xl font-display text-[clamp(2.65rem,6.3vw,5.6rem)] font-black uppercase leading-[0.84] tracking-[-0.04em] text-[#F2EFE8]">
                Every address<br />ends in a quadrant.
              </h2>
            </div>
            <p className="max-w-lg text-[15px] leading-relaxed text-[#AFC5DF] sm:text-base">
              Centre Street splits east from west; the Bow bends north from south.
              Pick a direction and Calgary changes with it.
            </p>
          </div>
        </Reveal>

        {/* Mobile: one cinematic quadrant at a time, with the selector attached. */}
        <div className="mt-8 lg:hidden">
          <div className="grid grid-cols-4 border-y border-[#F2EFE8]/20" role="tablist" aria-label="Calgary quadrants">
            {QUADRANTS.map((quad, i) => {
              const isActive = active === i;
              return (
                <button key={quad.code} type="button" role="tab" aria-selected={isActive} aria-controls="quadrant-mobile-panel" onClick={() => pick(i)} className="relative min-h-14 border-r border-[#F2EFE8]/20 font-display text-lg font-black text-[#F2EFE8] outline-none last:border-r-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#E52C20]">
                  {quad.code}
                  <motion.span className="absolute inset-x-3 bottom-0 h-1 origin-left" animate={{ scaleX: isActive ? 1 : 0 }} style={{ background: QUAD_META[i].color }} />
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait" custom={direction}>
            <motion.article id="quadrant-mobile-panel" role="tabpanel" key={q.code} custom={direction} initial={reduced ? false : { opacity: 0, x: direction * 32 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: direction * -24 }} transition={{ duration: 0.38, ease: EASE }} className="relative -mx-5 min-h-[36rem] overflow-hidden sm:-mx-8">
              <img src={publicAsset(q.img)} alt={q.imgAlt} loading="lazy" decoding="async" width={1536} height={1024} className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#06162F] via-[#06162F]/20 to-transparent" aria-hidden="true" />
              <span className="absolute right-5 top-5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#F2EFE8]">{meta.bearing} · {String(active + 1).padStart(2, '0')}/04</span>
              <div className="absolute inset-x-5 bottom-8 sm:inset-x-8">
                <span className="font-display text-[6.5rem] font-black leading-none tracking-[-0.04em] text-[#F2EFE8]/15" aria-hidden="true">{q.code}</span>
                <h3 className="-mt-8 font-display text-4xl font-black uppercase tracking-[-0.03em] text-[#F2EFE8]">{q.name}</h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#D9E2EC]">{q.places}</p>
                <div className="mt-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#F2EFE8]">
                  <span className="h-2 w-2 bg-[#E52C20] motion-safe:animate-pulse" aria-hidden="true" />All five report types live
                </div>
              </div>
            </motion.article>
          </AnimatePresence>
        </div>

        {/* Desktop: the four directions form one city; choosing one changes the composition. */}
        <Reveal delay={0.08} className="mt-10 hidden lg:block">
          <div className="relative flex h-[min(68vh,46rem)] gap-2" role="tablist" aria-label="Explore Calgary by quadrant">
            {QUADRANTS.map((quad, i) => {
              const isActive = active === i;
              return (
                <button
                  key={quad.code}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => pick(i)}
                  onMouseEnter={() => pick(i)}
                  onFocus={() => pick(i)}
                  className="group relative min-w-0 overflow-hidden text-left outline-none transition-[flex] duration-700 ease-out focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#E52C20]"
                  style={{ flex: isActive ? '2.35 1 0%' : '0.72 1 0%' }}
                >
                  <img src={publicAsset(quad.img)} alt="" loading="lazy" decoding="async" width={1536} height={1024} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.015]" />
                  <div className="absolute inset-0 transition-colors duration-500" style={{ background: isActive ? 'linear-gradient(to top, rgba(6,22,47,0.94), rgba(6,22,47,0.04) 70%)' : 'rgba(6,22,47,0.58)' }} aria-hidden="true" />
                  <span className="absolute left-5 top-5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#F2EFE8]">{QUAD_META[i].bearing}</span>
                  <span className="absolute right-0 top-0 h-full w-1 origin-top transition-transform duration-500" style={{ background: QUAD_META[i].color, transform: isActive ? 'scaleY(1)' : 'scaleY(0)' }} aria-hidden="true" />
                  <div className="absolute inset-x-5 bottom-6 sm:inset-x-7 sm:bottom-8">
                    <span className="block font-display text-[clamp(3.5rem,7vw,7rem)] font-black leading-[0.72] tracking-[-0.04em] text-[#F2EFE8]">{quad.code}</span>
                    <div className="grid transition-[grid-template-rows,opacity] duration-500" style={{ gridTemplateRows: isActive ? '1fr' : '0fr', opacity: isActive ? 1 : 0 }}>
                      <div className="overflow-hidden">
                        <h3 className="mt-5 font-display text-3xl font-black uppercase tracking-[-0.03em] text-[#F2EFE8] xl:text-4xl">{quad.name}</h3>
                        <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#D9E2EC] xl:text-base">{quad.places}</p>
                        <p className="mt-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#F2EFE8]">
                          <span className="h-2 w-2 bg-[#E52C20] motion-safe:animate-pulse" aria-hidden="true" />All five report types live
                        </p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2" aria-hidden="true">
              <svg viewBox="0 0 1200 70" preserveAspectRatio="none" className="h-12 w-full opacity-90">
                <path d="M0 37 C150 4 250 66 400 34 S690 9 840 39 S1080 55 1200 23" fill="none" stroke="#F2EFE8" strokeWidth="14" />
                <path d="M0 37 C150 4 250 66 400 34 S690 9 840 39 S1080 55 1200 23" fill="none" stroke="#E52C20" strokeWidth="2.5" />
              </svg>
              <span className="absolute left-5 top-1/2 -translate-y-1/2 bg-[#F2EFE8] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#E52C20]">The Bow</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[#AFC5DF]">
            <span>Hover or focus a direction</span><span>Centre St × Bow River · Calgary, AB</span>
          </div>
        </Reveal>
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
    art: 'images/process-megaphone.webp',
    artAlt: 'Illustrated megaphone representing a local observation',
  },
  {
    n: '02',
    title: 'Pin it',
    body: 'Drop a pin, pick a category, write one line — and if it\'s your stolen bike, add a way for neighbours to reach you. Under thirty seconds, anonymous if you prefer.',
    accent: T.gold,
    mono: 'REPORT · <30 SECONDS',
    log: '→ pin dropped · category set · 0:27',
    art: 'images/process-signal.webp',
    artAlt: 'Illustrated paper plane representing a report being sent',
  },
  {
    n: '03',
    title: 'The city sees it',
    body: 'Your report appears instantly for every neighbour watching the map — and stays there, so patterns become visible over weeks.',
    accent: T.bow,
    mono: 'BROADCAST · REALTIME',
    log: '→ live on the map · all quadrants',
    art: 'images/process-community.webp',
    artAlt: 'Illustrated neighbours receiving a community report',
  },
  {
    n: '04',
    title: 'The pattern stays',
    body: 'Recent reports remain visible with their time and source, helping neighbours notice repeat activity without turning one observation into a permanent label.',
    accent: T.red,
    mono: 'CONTEXT · OVER TIME',
    log: '→ dated · attributed · easier to verify',
    art: 'images/process-history.webp',
    artAlt: 'Illustrated calendar representing reports over time',
  },
];

/**
 * One step of the report sequence.
 *
 * The card used to be 58vh with the content pinned top and the step numeral
 * pinned bottom, which left roughly 270px of nothing between them and made the
 * numeral read as a stray mark rather than part of the card.
 *
 * The numeral now sits where a reader meets it — top right, bleeding past the
 * corner so it registers as the card's index rather than a decoration — and
 * the card is shorter, so the copy sits in a composition instead of floating
 * at the top of a void. The numbering is kept because filing a report really
 * is a sequence; the order carries information.
 */
function RideCard({ step }: { step: (typeof STEPS)[number] }) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl p-9 xl:p-11 flex flex-col w-[min(42vw,580px)] shrink-0 h-[46vh] min-h-[22rem]"
      style={{ background: T.panel, border: `1px solid ${T.line}` }}
    >
      <div className="absolute top-0 left-0 h-1.5 w-full" style={{ background: step.accent }} aria-hidden="true" />

      <motion.img
        src={publicAsset(step.art)}
        alt={step.artAlt}
        width={640}
        height={640}
        className="absolute -right-7 -top-7 z-0 h-44 w-44 rotate-3 object-cover opacity-90 xl:h-52 xl:w-52"
        whileHover={{ rotate: 0, scale: 1.025 }}
        transition={{ duration: 0.22, ease: EASE }}
      />

      <div className="relative z-10 pr-32 xl:pr-40">
        <p className="font-mono text-[11px] tracking-[0.28em]" style={{ color: step.accent }}>{step.mono}</p>
        <h3 className="mt-3.5 font-display font-extrabold tracking-[-0.02em]" style={{ color: T.ink, fontSize: 'clamp(2.2rem,3.1vw,3.2rem)' }}>
          {step.title}
        </h3>
      </div>
      <p className="relative z-10 mt-4 max-w-md text-[15.5px] leading-relaxed" style={{ color: T.inkSoft }}>{step.body}</p>

      <p
        className="relative z-10 mt-auto pt-5 font-mono text-[10.5px] tracking-[0.08em]"
        style={{ color: step.accent, borderTop: `1px dashed ${T.line}` }}
      >
        {step.log}
      </p>
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
          <div className="relative mt-4 flex items-end justify-between gap-8">
            <h2 className="font-display font-extrabold tracking-[-0.025em] leading-none" style={{ color: T.ink, fontSize: 'clamp(2.2rem,4.2vw,3.8rem)' }}>
              Thirty seconds,<br />start to signal.
            </h2>
            <motion.img
              src={publicAsset('images/plane-speed.webp')}
              alt=""
              className="pointer-events-none absolute right-0 bottom-[-1.5rem] hidden w-80 object-contain opacity-90 xl:block"
              initial={{ opacity: 0, x: -90, rotate: -4 }}
              whileInView={{ opacity: 0.9, x: 0, rotate: -1 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.9, ease: EASE }}
              aria-hidden="true"
            />
            <div className="hidden xl:block w-64 h-px relative opacity-0" style={{ background: T.line }} aria-hidden="true">
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
      <motion.img
        src={publicAsset('images/plane-speed.webp')}
        alt=""
        className="pointer-events-none absolute -right-24 top-8 w-72 rotate-[-7deg] object-contain opacity-[0.1] sm:w-96"
        animate={reduced ? undefined : { x: [10, -5, 10], y: [4, -3, 4] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      />
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
                  <motion.img
                    src={publicAsset(step.art)}
                    alt={step.artAlt}
                    width={640}
                    height={640}
                    className="absolute -right-4 -top-4 z-0 h-28 w-28 rotate-3 object-cover opacity-90 sm:h-36 sm:w-36"
                    initial={reduced ? false : { opacity: 0, rotate: 10, scale: 0.86 }}
                    whileInView={{ opacity: 0.9, rotate: 3, scale: 1 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.6, ease: EASE }}
                  />
                  <p className="relative z-10 pr-24 sm:pr-32 font-mono text-[10px] tracking-[0.26em]" style={{ color: step.accent }}>{step.mono}</p>
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
      {/*
        On a phone this used to run heading, body, form, link, then the list of
        covered towns — so the page asked "name your city" before it had shown
        that thirty of them are already covered. The grid is placed explicitly
        so mobile reads proof-then-ask while the desktop two-column layout is
        unchanged.
      */}
      <div className="mx-auto max-w-[80rem] px-5 sm:px-8 grid gap-8 lg:gap-14 lg:grid-cols-2 lg:items-center">
        <div className="order-1 lg:col-start-1 lg:row-start-1">
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
        </div>

        <Reveal delay={0.1} className="order-3 lg:col-start-1 lg:row-start-2">
            {/*
              One control, not two blocks. Stacked, a pale hairline input above
              a solid black button read as two unrelated things and ate most of
              a phone screen; the placeholder also floated oddly inside the
              pill. The field and its action now share a single container that
              lights up as one on focus, which is both shorter and legible as a
              thing you type into.
            */}
            <label
              htmlFor="city-request-input"
              className="flex items-center gap-2 rounded-full py-1.5 pl-5 pr-1.5 max-w-md transition-shadow focus-within:shadow-[0_0_0_3px_rgba(74,144,217,0.25)]"
              style={{ background: T.panel, border: `1.5px solid ${T.line}` }}
            >
              <span className="sr-only">Request a city</span>
              <input
                id="city-request-input"
                type="text"
                placeholder="Name your city"
                value={cityRequest}
                maxLength={100}
                onChange={(e) => setCityRequest(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCityRequest(); }}
                className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] font-medium outline-none placeholder:font-normal"
                style={{ color: T.ink }}
              />
              <button
                type="button"
                onClick={handleCityRequest}
                disabled={submitting}
                className={cn(
                  'shrink-0 rounded-full h-11 px-5 text-[14px] font-bold transition-[background-color,opacity] active:scale-[0.98]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2',
                  submitting && 'opacity-60 pointer-events-none',
                )}
                style={{ background: T.ink, color: T.paper, outlineColor: T.sky }}
              >
                {submitting ? 'Sending…' : 'Request it'}
              </button>
            </label>
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

        {/* Region panel — the proof. Sits above the form on mobile. */}
        <Reveal delay={0.12} className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <div className="relative rounded-[1.75rem] p-6 sm:p-8 lg:p-10 overflow-hidden" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em]" style={{ color: T.inkSoft }}>Region · Greater Calgary</p>
            <div className="mt-5 flex flex-wrap gap-2 sm:mt-6 sm:gap-2.5">
              {towns.map((t, i) => (
                <motion.span
                  key={t}
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.05 * i, duration: 0.45, ease: EASE }}
                  className="rounded-full px-3 py-1.5 text-[12px] font-bold sm:px-4 sm:py-2 sm:text-[13px]"
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

          <motion.img
            src={publicAsset('images/plane-white.webp')}
            alt=""
            className="pointer-events-none absolute -left-20 -bottom-12 w-80 rotate-[-8deg] object-contain opacity-[0.24] mix-blend-screen sm:w-[30rem] lg:-left-12 lg:-bottom-20"
            animate={reduced ? undefined : { x: [8, -7, 8], y: [5, -4, 5], rotate: [-8, -5, -8] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />

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
            <a href="/privacy" className="hover:opacity-70 transition-opacity">Privacy</a>
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
