import { useEffect, useRef, useState, memo } from 'react';
import type { ReactNode, ElementType, CSSProperties } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionTemplate,
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
  Eye,
  Database,
  Compass,
  History,
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

const QUADRANTS = [
  { code: 'NW', name: 'Northwest', places: 'Bowness · Kensington · Nose Hill · University District', img: 'images/quadrant/quadrant-nw-collage.webp', imgAlt: 'Collage of the Peace Bridge, Bow River, Nose Hill and northwest Calgary' },
  { code: 'NE', name: 'Northeast', places: 'Saddle Ridge · Marlborough · Airport · Bridgeland', img: 'images/quadrant/quadrant-ne-collage.webp', imgAlt: 'Collage of a northeast CTrain, airport approach and neighbourhood streets' },
  { code: 'SW', name: 'Southwest', places: 'Beltline · Marda Loop · Signal Hill · Glenmore', img: 'images/quadrant/quadrant-sw-collage.webp', imgAlt: 'Collage of Glenmore Reservoir, the Rockies and southwest Calgary neighbourhoods' },
  { code: 'SE', name: 'Southeast', places: 'Inglewood · Forest Lawn · Seton · Mahogany', img: 'images/quadrant/quadrant-se-collage.webp', imgAlt: 'Collage of the Saddledome, Inglewood brick streets and southeast Calgary homes' },
];

/**
 * "One day on the watch" — dawn to after-midnight.
 *
 * The captions used to be a travelogue: "First light over the core",
 * "Saddledome from Scotsman Hill". Handsome, and they explained nothing about
 * what this is. Each frame now carries one thing a first-time visitor needs —
 * what the map is, who fills it, where the rest of the data comes from, how far
 * it reaches, and what happens to a report afterwards — so the sequence is an
 * introduction rather than a slideshow.
 */
const DAY_PLATES: Array<{
  src: string; time: string; icon: ElementType; caption: string; note: string; color: string;
}> = [
  { src: 'images/photo/calgary1.webp', time: '07:12', icon: Eye,
    caption: 'Check before you leave',
    note: 'Nothing open near you this morning',
    color: T.gold },
  { src: 'images/photo/calgary5.webp', time: '12:38', icon: Users,
    caption: 'Neighbours file it, not a call centre',
    note: 'Graffiti logged in Kensington · 30 seconds',
    color: '#ef4444' },
  { src: 'images/photo/calgary7.webp', time: '19:26', icon: Database,
    caption: 'City feeds land on the same map',
    note: '511 Alberta · Macleod Trail slowdown',
    color: '#f59e0b' },
  { src: 'images/photo/calgary8.webp', time: '22:04', icon: Compass,
    caption: 'All four quadrants, one view',
    note: 'NW · NE · SW · SE, sorted by distance from you',
    color: '#60a5fa' },
  { src: 'images/photo/calgary3.webp', time: '01:47', icon: History,
    caption: 'Reports stay, so patterns show',
    note: 'Signal fault cleared · dated and attributed',
    color: '#f97316' },
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
            src={publicAsset('images/brand/calgary-watch-plane-mark.webp')}
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
              <img src={publicAsset('images/brand/calgary-watch-plane-mark.webp')} alt="" className="absolute -right-20 top-4 size-80 rotate-6 object-contain opacity-[0.1]" />
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
        src={publicAsset('images/hero/mobile-hero-calgary-collage.webp')}
        alt="Art collage of the Calgary Tower, downtown, the Bow River and city streets"
        width={720}
        height={1280}
        fetchPriority="high"
        initial={false}
        animate={reduced ? undefined : { scale: [1.025, 1.055, 1.025], y: ['0%', '-0.8%', '0%'] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0 h-full w-full object-cover object-center"
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = publicAsset('images/photo/calgary2.webp'); }}
      />
      {!reduced && (
        <div className="absolute inset-0" aria-hidden="true">
          <motion.img
            src={publicAsset('images/hero/mobile-hero-calgary-collage.webp')}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
            style={{ clipPath: 'polygon(0 0, 48% 0, 36% 62%, 0 57%)', filter: 'saturate(1.08) contrast(1.04)' }}
            animate={{ x: ['-1.8%', '0.8%', '-1.8%'], rotate: [-0.35, 0.2, -0.35] }}
            transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.img
            src={publicAsset('images/hero/mobile-hero-calgary-collage.webp')}
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
        src={publicAsset('images/brand/calgary-watch-plane-mark.webp')}
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
          src={publicAsset('images/hero/desktop-hero-calgary-collage.webp')}
          alt="Art collage of Calgary Tower, Peace Bridge, the Bow River and downtown at night"
          width={1920}
          height={1080}
          fetchPriority="high"
          initial={false}
          animate={reduced ? undefined : { scale: [1.015, 1.04, 1.015] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = publicAsset('images/hero/hero-wide.webp'); }}
        />

        {!reduced && (
          <motion.div className="absolute inset-0" style={{ x: collageX, y: collageY }} aria-hidden="true">
            <motion.img
              src={publicAsset('images/hero/desktop-hero-calgary-collage.webp')}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ clipPath: 'polygon(51% 0, 100% 0, 100% 58%, 67% 56%, 45% 47%)', filter: 'saturate(1.08) contrast(1.03)' }}
              animate={{ x: ['0.7%', '-0.5%', '0.7%'], y: ['-0.4%', '0.5%', '-0.4%'] }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.img
              src={publicAsset('images/hero/desktop-hero-calgary-collage.webp')}
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
          <img src={publicAsset('images/brand/calgary-watch-plane-mark.webp')} alt="" className="size-full object-contain" />
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
        src={publicAsset('images/brand/plane-signal.webp')}
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
        {DAY_PLATES.map((p, i) => { const PlateIcon = p.icon; return (
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
              <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#E52C20]">
                <PlateIcon size={12} className="shrink-0" aria-hidden="true" />
                {p.note}
              </p>
              <p className="mt-1.5 font-display text-[19px] font-black uppercase leading-[1.02] tracking-[-0.02em]">{p.caption}</p>
            </figcaption>
            </div>
          </motion.figure>
        ); })}
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
            {DAY_PLATES.map((p, i) => { const PlateIcon = p.icon; return (
              <figure key={p.src} className="relative pt-1" style={{ rotate: `${i % 2 ? 0.6 : -0.6}deg` }}>
                <div className="absolute inset-0 translate-x-2 translate-y-2 bg-[#E52C20]" aria-hidden="true" />
                <div className="relative bg-[#F2EFE8] p-2">
                  <img src={publicAsset(p.src)} alt="" loading="lazy" className="w-full aspect-[4/3] object-cover saturate-[0.82] contrast-[1.1]" />
                  <figcaption className="px-3 pb-3 pt-4 text-[#06162F]">
                    <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#E52C20]">
                      <PlateIcon size={12} className="shrink-0" aria-hidden="true" />
                      {p.time} · {p.note}
                    </p>
                    <p className="mt-1 font-display text-lg font-black uppercase leading-tight">{p.caption}</p>
                  </figcaption>
                </div>
              </figure>
            ); })}
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
          src={publicAsset('images/brand/plane-signal.webp')}
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
const QUAD_META = [
  { color: '#4A90D9', bearing: '315°', dots: [[52, 62], [110, 38], [88, 118]] },
  { color: '#D4A843', bearing: '045°', dots: [[238, 52], [296, 96], [262, 124]] },
  { color: '#2E8B7A', bearing: '225°', dots: [[60, 250], [118, 296], [96, 224]] },
  { color: '#C0392B', bearing: '135°', dots: [[240, 236], [292, 282], [258, 312]] },
] as const;

function Quadrants({ reduced }: { reduced: boolean }) {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { margin: '-20%' });

  useEffect(() => {
    if (reduced || touched || !inView) return;
    const id = window.setInterval(() => setActive((value) => (value + 1) % QUADRANTS.length), 3600);
    return () => window.clearInterval(id);
  }, [reduced, touched, inView]);

  const pick = (index: number) => { setTouched(true); setActive(index); };
  const q = QUADRANTS[active];
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
            <div className="max-w-lg">
              <p className="text-[15px] leading-relaxed text-[#AFC5DF] sm:text-base">
                Centre Street splits east from west; the Bow bends north from south.
                Calgary Watch covers all four the same way — every report, wherever it
                is filed, on one map anyone can open without an account.
              </p>
              <ul className="mt-5 space-y-2.5">
                {[
                  { Icon: Users,    text: 'Filed by the neighbours who saw it' },
                  { Icon: Database, text: 'Alongside police, 311, 511 and utility feeds' },
                  { Icon: Compass,  text: 'Sorted by how far it is from where you stand' },
                ].map(({ Icon, text }) => (
                  <li key={text} className="flex items-start gap-2.5 text-[14px] leading-snug text-[#AFC5DF]">
                    <Icon size={15} className="mt-[2px] shrink-0 text-[#E52C20]" aria-hidden="true" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>

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
              <span className="absolute right-5 top-5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#F2EFE8]">{QUAD_META[active].bearing} · {String(active + 1).padStart(2, '0')}/04</span>
              <div className="absolute inset-x-5 bottom-8 sm:inset-x-8">
                <span className="font-display text-[6.5rem] font-black leading-none tracking-[-0.04em] text-[#F2EFE8]/15" aria-hidden="true">{q.code}</span>
                <h3 className="-mt-8 font-display text-4xl font-black uppercase tracking-[-0.03em] text-[#F2EFE8]">{q.name}</h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#D9E2EC]">{q.places}</p>
                <p className="mt-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#F2EFE8]"><span className="h-2 w-2 bg-[#E52C20] motion-safe:animate-pulse" aria-hidden="true" />All five report types live</p>
              </div>
            </motion.article>
          </AnimatePresence>
        </div>

        <Reveal delay={0.08} className="mt-10 hidden lg:block">
          <div className="relative flex h-[min(68vh,46rem)] gap-2" role="tablist" aria-label="Explore Calgary by quadrant">
            {QUADRANTS.map((quad, i) => {
              const isActive = active === i;
              return (
                <button key={quad.code} type="button" role="tab" aria-selected={isActive} onClick={() => pick(i)} onMouseEnter={() => pick(i)} onFocus={() => pick(i)} className="group relative min-w-0 overflow-hidden text-left outline-none transition-[flex] duration-700 ease-out focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#E52C20]" style={{ flex: isActive ? '2.35 1 0%' : '0.72 1 0%' }}>
                  <img src={publicAsset(quad.img)} alt="" loading="lazy" decoding="async" width={1536} height={1024} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.015]" />
                  <div className="absolute inset-0 transition-colors duration-500" style={{ background: isActive ? 'linear-gradient(to top, rgba(6,22,47,0.94), rgba(6,22,47,0.04) 70%)' : 'rgba(6,22,47,0.62)' }} aria-hidden="true" />
                  <span className="absolute left-5 top-5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#F2EFE8]">{QUAD_META[i].bearing}</span>
                  <span className="absolute right-0 top-0 h-full w-1 origin-top transition-transform duration-500" style={{ background: QUAD_META[i].color, transform: isActive ? 'scaleY(1)' : 'scaleY(0)' }} aria-hidden="true" />
                  <div className="absolute inset-x-5 bottom-6 sm:inset-x-7 sm:bottom-8">
                    <span className="block font-display text-[clamp(3.5rem,7vw,7rem)] font-black leading-[0.72] tracking-[-0.04em] text-[#F2EFE8]">{quad.code}</span>
                    <div className="grid transition-[grid-template-rows,opacity] duration-500" style={{ gridTemplateRows: isActive ? '1fr' : '0fr', opacity: isActive ? 1 : 0 }}>
                      <div className="overflow-hidden">
                        <h3 className="mt-5 font-display text-3xl font-black uppercase tracking-[-0.03em] text-[#F2EFE8] xl:text-4xl">{quad.name}</h3>
                        <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#D9E2EC] xl:text-base">{quad.places}</p>
                        <p className="mt-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#F2EFE8]"><span className="h-2 w-2 bg-[#E52C20] motion-safe:animate-pulse" aria-hidden="true" />All five report types live</p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2" aria-hidden="true">
              <svg viewBox="0 0 1200 70" preserveAspectRatio="none" className="h-12 w-full opacity-90"><path d="M0 37 C150 4 250 66 400 34 S690 9 840 39 S1080 55 1200 23" fill="none" stroke="#F2EFE8" strokeWidth="14" /><path d="M0 37 C150 4 250 66 400 34 S690 9 840 39 S1080 55 1200 23" fill="none" stroke="#E52C20" strokeWidth="2.5" /></svg>
              <span className="absolute left-5 top-1/2 -translate-y-1/2 bg-[#F2EFE8] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#E52C20]">The Bow</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[#AFC5DF]"><span>Hover or focus a direction</span><span>Centre St × Bow River · Calgary, AB</span></div>
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
    mono: 'OBSERVE · YOUR BLOCK',
    log: '→ eyes on · 51.0447 N, 114.0719 W',
    art: 'images/illustration/process-megaphone.webp',
    artAlt: 'Illustrated megaphone representing a local observation',
  },
  {
    n: '02',
    title: 'Pin it',
    body: 'Drop a pin, pick a category, write one line — and if it\'s your stolen bike, add a way for neighbours to reach you. Under thirty seconds, anonymous if you prefer.',
    mono: 'REPORT · <30 SECONDS',
    log: '→ pin dropped · category set · 0:27',
    art: 'images/illustration/process-signal.webp',
    artAlt: 'Illustrated paper plane representing a report being sent',
  },
  {
    n: '03',
    title: 'The city sees it',
    body: 'Your report appears instantly for every neighbour watching the map — and stays there, so patterns become visible over weeks.',
    mono: 'BROADCAST · REALTIME',
    log: '→ live on the map · all quadrants',
    art: 'images/illustration/process-community.webp',
    artAlt: 'Illustrated neighbours receiving a community report',
  },
  {
    n: '04',
    title: 'The pattern stays',
    body: 'Recent reports remain visible with their time and source, helping neighbours notice repeat activity without turning one observation into a permanent label.',
    mono: 'CONTEXT · OVER TIME',
    log: '→ dated · attributed · easier to verify',
    art: 'images/illustration/process-history.webp',
    artAlt: 'Illustrated calendar representing reports over time',
  },
];

// ---------------------------------------------------------------------------
// FROM SIGHTING TO SIGNAL — the report's flight path
// ---------------------------------------------------------------------------
/**
 * The brand mark is a paper plane and this section is about a report
 * travelling, so the structure is the flight itself: one drawn trajectory,
 * four waypoints, flown as you scroll. That earns the numbering — filing a
 * report really is a sequence — and it belongs to this product rather than
 * being a timeline that would suit anything.
 *
 * Editorial layer, so it takes the full poster language (see
 * docs/design-system.md): navy ground, paper slips pinned off-axis with hard
 * vermilion offset shadows, uppercase display, zero radius.
 *
 * The four steps used to carry four different accent colours. The poster
 * language has one accent, so identity now comes from the numeral and the
 * label, and vermilion is spent only on the path and the waypoint the plane
 * has reached. Four accents in a four-step sequence was decoration pretending
 * to be information.
 *
 * No 3D here deliberately: this language is screen-printed and flat — zero-blur
 * shadows, no perspective, no depth haze. A rendered model would fight every
 * other rule in it, and the hard offset shadow already does the "lifted off the
 * page" job in the grammar the rest of the page speaks.
 */

/** Where each waypoint sits along the flight, 0–1. */
const WAYPOINTS = [0.03, 0.35, 0.67, 0.98];

const DESKTOP_STAGE = { w: 1200, h: 230 };
/**
 * A shallow climb across the top of the stage, with the slips hanging beneath
 * it like luggage tags.
 *
 * The first version climbed hard and alternated slips above and below the
 * line. On a rising path that inverts: "below waypoint four" ends up higher
 * than "above waypoint three", so the last two slips collided. Hanging them
 * all from the same side means the path's own climb does the staggering, which
 * is both tidier and truer to what the line represents.
 */
const DESKTOP_PATH =
  'M 16 194 C 220 194, 286 152, 462 140 C 638 128, 706 94, 884 80 C 1012 70, 1094 48, 1184 34';

/** Column centres, as a fraction of the stage width — one per step. */
const COLUMNS = [0.125, 0.375, 0.625, 0.875];

/**
 * Rides a motion value along an SVG path.
 *
 * Position and heading both come from the path itself — the heading by sampling
 * a point slightly ahead — so the plane genuinely banks into the curve instead
 * of being keyframed to approximately match it.
 */
function usePathRider(pathRef: React.RefObject<SVGPathElement | null>, progress: MotionValue<number>) {
  const [length, setLength] = useState(0);

  useEffect(() => {
    const measure = () => setLength(pathRef.current?.getTotalLength() ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [pathRef]);

  const at = (p: number) => {
    const path = pathRef.current;
    if (!path || length === 0) return { x: 0, y: 0, angle: 0 };
    const d = Math.min(Math.max(p, 0), 1) * length;
    const here = path.getPointAtLength(d);
    const ahead = path.getPointAtLength(Math.min(d + 2, length));
    return { x: here.x, y: here.y, angle: (Math.atan2(ahead.y - here.y, ahead.x - here.x) * 180) / Math.PI };
  };

  /**
   * The point on the path directly above a column.
   *
   * Cards sit on an even grid rather than being hung off the path: four cards
   * wide enough to hold a sentence do not fit between four waypoints spaced by
   * a curve, and anchoring them to the curve made every neighbouring pair
   * overlap. Sampling the path for each column's x instead keeps the dot
   * genuinely on the line while the cards stay evenly spaced.
   */
  const atX = (targetX: number) => {
    const path = pathRef.current;
    if (!path || length === 0) return { x: targetX, y: 0, t: 0 };
    let lo = 0;
    let hi = length;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (path.getPointAtLength(mid).x < targetX) lo = mid; else hi = mid;
    }
    const pt = path.getPointAtLength(lo);
    return { x: pt.x, y: pt.y, t: lo / length };
  };

  return {
    length,
    x: useTransform(progress, (p) => at(p).x),
    y: useTransform(progress, (p) => at(p).y),
    angle: useTransform(progress, (p) => at(p).angle),
    pointAt: at,
    pointAtX: atX,
  };
}

/** A paper slip pinned to the board. */
function FlightSlip({
  step, index, reached, reduced, className,
}: {
  step: (typeof STEPS)[number];
  index: number;
  reached: boolean;
  reduced: boolean;
  className?: string;
}) {
  const tilt = [-1.6, 1.2, -1.1, 1.7][index] ?? 0;
  return (
    <motion.article
      className={cn('relative', className)}
      initial={reduced ? false : { opacity: 0, y: 22, rotate: tilt * 2.2 }}
      whileInView={{ opacity: 1, y: 0, rotate: tilt }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      <div
        className="relative bg-[#F2EFE8] px-5 py-5 sm:px-6 sm:py-6"
        style={{ boxShadow: reached ? '6px 6px 0 #E52C20' : '6px 6px 0 rgba(242,239,232,0.22)', transition: 'box-shadow 420ms ease' }}
      >
        {/* The index, set as the poster sets numbers: huge, tight, cropped. */}
        <span
          className="pointer-events-none absolute -top-1 right-3 select-none font-display font-black leading-none tracking-[-0.06em]"
          style={{ fontSize: 'clamp(3.4rem, 7vw, 5.2rem)', color: 'rgba(6,22,47,0.07)' }}
          aria-hidden="true"
        >
          {step.n}
        </span>

        <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: '#E52C20' }}>
          {step.mono}
        </p>
        <h3
          className="mt-2 font-display font-black uppercase leading-[0.88] tracking-[-0.03em]"
          style={{ color: '#06162F', fontSize: 'clamp(1.5rem, 3vw, 2.1rem)' }}
        >
          {step.title}
        </h3>
        <p className="relative mt-2.5 text-[13.5px] leading-[1.5]" style={{ color: '#3B4A5C' }}>
          {step.body}
        </p>
        <p
          className="mt-3.5 pt-3 font-mono text-[10px] tracking-[0.06em]"
          style={{ color: '#6B7A8C', borderTop: '1px dashed rgba(6,22,47,0.18)' }}
        >
          {step.log}
        </p>
      </div>
    </motion.article>
  );
}

/**
 * The section. One concept, two builds: the flight arcs across the field on a
 * wide screen, and descends a rail on a narrow one. A phone reads a sequence
 * top-to-bottom, and bending that into an arc to match the desktop would be
 * the layout serving the idea instead of the reader.
 */
function SignalFlight({ reduced }: { reduced: boolean }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const desktopPathRef = useRef<SVGPathElement>(null);
  const mobileRailRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start 0.85', 'end 0.65'] });
  const flown = useSpring(scrollYProgress, { stiffness: 70, damping: 24, restDelta: 0.001 });

  const desktop = usePathRider(desktopPathRef, flown);
  const planeTop = useTransform(flown, (p) => `${Math.min(Math.max(p, 0), 1) * 100}%`);

  /** Which waypoints the plane has passed, for the shadow to light up. */
  const [reached, setReached] = useState<boolean[]>([false, false, false, false]);
  useEffect(() => {
    const stop = flown.on('change', (p) => {
      setReached((prev) => {
        const next = WAYPOINTS.map((w, i) => prev[i] || p >= w - 0.02);
        return next.some((v, i) => v !== prev[i]) ? next : prev;
      });
    });
    return () => stop();
  }, [flown]);

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-20 sm:py-24 lg:py-28" style={{ background: '#06162F' }}>
      {/* Header */}
      <div className="mx-auto max-w-[88rem] px-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="h-[3px] w-[22px] shrink-0" style={{ background: '#E52C20' }} aria-hidden="true" />
          <span className="font-mono text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: '#AFC5DF' }}>
            From sighting to signal
          </span>
        </div>
        <h2
          className="mt-4 font-display font-black uppercase leading-[0.82] tracking-[-0.04em]"
          style={{ color: '#F2EFE8', fontSize: 'clamp(2.6rem, 8.4vw, 6.4rem)' }}
        >
          Thirty seconds,
          <br />
          start to <span style={{ color: '#E52C20' }}>signal.</span>
        </h2>
        <p className="mt-5 max-w-[34ch] text-[14px] leading-[1.55] sm:text-[15px]" style={{ color: '#D5DFEB' }}>
          One report travels from your sidewalk to every screen watching the map. Follow it down the line.
        </p>
      </div>

      {/* ── Wide: the flight crosses above, the slips hang from it ───────── */}
      <div className="mx-auto mt-16 hidden w-full max-w-[75rem] px-8 lg:block">
        <div className="relative">
          <div className="relative w-full" style={{ aspectRatio: `${DESKTOP_STAGE.w} / ${DESKTOP_STAGE.h}` }}>
            <svg
              viewBox={`0 0 ${DESKTOP_STAGE.w} ${DESKTOP_STAGE.h}`}
              className="absolute inset-0 h-full w-full overflow-visible"
              fill="none"
              aria-hidden="true"
            >
              <path ref={desktopPathRef} d={DESKTOP_PATH} stroke="rgba(242,239,232,0.16)" strokeWidth="2" strokeDasharray="7 9" />
              <motion.path
                d={DESKTOP_PATH}
                stroke="#E52C20"
                strokeWidth="2.5"
                strokeDasharray="7 9"
                style={{ pathLength: reduced ? 1 : flown }}
              />

              {COLUMNS.map((c, i) => {
                const p = desktop.pointAtX(c * DESKTOP_STAGE.w);
                const on = reached[i];
                return (
                  <g key={c}>
                    {/* Tether: what ties this slip to that moment in the flight. */}
                    <line
                      x1={p.x} y1={p.y} x2={p.x} y2={DESKTOP_STAGE.h}
                      stroke={on ? 'rgba(229,44,32,0.55)' : 'rgba(242,239,232,0.14)'}
                      strokeWidth="1.5"
                      strokeDasharray="3 6"
                      style={{ transition: 'stroke 420ms ease' }}
                    />
                    <circle cx={p.x} cy={p.y} r="8.5" fill="#06162F"
                      stroke={on ? '#E52C20' : 'rgba(242,239,232,0.32)'} strokeWidth="2.5"
                      style={{ transition: 'stroke 420ms ease' }} />
                    {on && <circle cx={p.x} cy={p.y} r="3.2" fill="#E52C20" />}
                  </g>
                );
              })}

              {!reduced && desktop.length > 0 && (
                <motion.g style={{ x: desktop.x, y: desktop.y, rotate: desktop.angle, transformBox: 'fill-box', transformOrigin: 'center' }}>
                  <image href={publicAsset('images/brand/plane-white.webp')} x="-24" y="-24" width="48" height="48" />
                </motion.g>
              )}
            </svg>
          </div>

          <div className="grid grid-cols-4 gap-5 xl:gap-6">
            {STEPS.map((step, i) => (
              <FlightSlip key={step.n} step={step} index={i} reached={reached[i]} reduced={reduced} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Narrow: the flight descends a rail ───────────────────────────── */}
      {/* A phone reads a sequence top to bottom, so the flight descends rather
          than arcing. The rail is dead straight: squeezed into a 3rem column an
          S-curve stops reading as a trajectory and starts reading as a wobble.
          The plane still flies it, because that is the whole idea. */}
      <div className="mt-12 lg:hidden">
        <div ref={mobileRailRef} className="relative mx-auto max-w-3xl px-5 sm:px-8">
          <div className="absolute bottom-6 left-[2.05rem] top-6 w-[3px] sm:left-[2.8rem]" style={{ background: 'rgba(242,239,232,0.16)' }} aria-hidden="true">
            <motion.div
              className="absolute inset-x-0 top-0 h-full origin-top"
              style={{ background: '#E52C20', scaleY: reduced ? 1 : flown }}
            />
            {!reduced && (
              <motion.img
                src={publicAsset('images/brand/plane-white.webp')}
                alt=""
                className="absolute left-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 object-contain"
                style={{ top: planeTop, rotate: 78 }}
              />
            )}
          </div>

          <ol className="relative space-y-7">
            {STEPS.map((step, i) => (
              <li key={step.n} className="relative pl-[3.9rem] sm:pl-[4.9rem]">
                <span
                  className="absolute left-[1.15rem] top-7 grid h-7 w-7 place-items-center sm:left-[1.9rem]"
                  style={{
                    background: '#06162F',
                    border: `3px solid ${reached[i] ? '#E52C20' : 'rgba(242,239,232,0.3)'}`,
                    transition: 'border-color 420ms ease',
                  }}
                  aria-hidden="true"
                >
                  {reached[i] && <span className="h-2.5 w-2.5" style={{ background: '#E52C20' }} />}
                </span>
                <FlightSlip step={step} index={i} reached={reached[i]} reduced={reduced} />
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Arrival */}
      <div className="mx-auto mt-12 max-w-[88rem] px-5 sm:px-8 lg:mt-0">
        <a
          href="/map"
          className="inline-flex items-center gap-3 bg-[#F2EFE8] px-6 py-4 font-display text-[14px] font-black uppercase tracking-[-0.01em] text-[#06162F] transition-transform hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-none sm:text-[15px]"
          style={{ boxShadow: '5px 5px 0 #E52C20' }}
        >
          Signal live on the map
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CATEGORIES — five wipe-reveal ledger rows
// ---------------------------------------------------------------------------
/**
 * WHAT WE TRACK — the specimen board.
 *
 * The copy promises "exactly how they appear on the map", so the section shows
 * the real marker rather than an illustration of one: the same rounded tile,
 * white rim and white icon that Map.tsx draws, at a size you can actually
 * examine. Five specimens pinned to a board with a field label and a real
 * sighting, the way a plate in a field guide is laid out.
 *
 * ── On colour ──────────────────────────────────────────────────────────────
 *
 * This is the one editorial surface that carries the app's severity palette,
 * because the palette *is* the subject — a legend has to be the real colours or
 * it is not a legend. Per docs/design-system.md, brand vermilion and severity
 * red must never share a view, so this section spends no vermilion at all. The
 * badges carry every colour on screen and the type stays ink. That constraint
 * is why the headline is not accented: picking one category to tint it would
 * have been arbitrary, and picking the brand red would have broken the rule the
 * section exists to illustrate.
 *
 * ── On the dimension ───────────────────────────────────────────────────────
 *
 * The flight section is flat on purpose. Here the badge is a physical object
 * sitting on flat paper, so it may have depth the board does not: a small
 * CSS-3D tilt with a sheen that tracks it, the way an enamel pin catches light.
 * Pointer-driven where there is a pointer, scroll-driven where there is not, so
 * a phone gets the same idea rather than a dead version of it. No WebGL — a
 * rendered model would be a different material language and 150KB to say the
 * same thing.
 */
/** Field codes, so the plate reads as catalogued rather than truncated. */
const FIELD_CODE: Record<string, string> = {
  crime: 'CRM', traffic: 'TRF', weather: 'WTH', infrastructure: 'INF', emergency: 'EMG',
};

function SpecimenBadge({
  category, reduced, index,
}: {
  category: (typeof CATEGORIES)[number];
  reduced: boolean;
  index: number;
}) {
  const Icon = category.icon;
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(useMotionValue(0), { stiffness: 140, damping: 16 });
  const ry = useSpring(useMotionValue(0), { stiffness: 140, damping: 16 });
  /** Where the highlight sits, in step with the tilt. */
  const sheenX = useTransform(ry, [-14, 14], ['82%', '18%']);
  const sheenY = useTransform(rx, [-14, 14], ['18%', '82%']);
  // Hooks cannot live inside the conditional branch that renders the sheen.
  const sheen = useMotionTemplate`radial-gradient(70% 60% at ${sheenX} ${sheenY}, rgba(255,255,255,0.5), rgba(255,255,255,0) 62%)`;

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    ry.set(((event.clientX - rect.left) / rect.width - 0.5) * 28);
    rx.set((0.5 - (event.clientY - rect.top) / rect.height) * 28);
  };
  const rest = () => { rx.set(0); ry.set(0); };

  // No pointer to follow on a phone, so the badge turns as it arrives instead.
  const settle = reduced
    ? {}
    : {
        initial: { rotateX: -18, rotateY: 12, opacity: 0 },
        whileInView: { rotateX: 0, rotateY: 0, opacity: 1 },
        viewport: { once: true, margin: '-80px' },
        transition: { duration: 0.7, delay: index * 0.07, ease: EASE },
      };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={rest}
      className="relative shrink-0"
      style={{ perspective: 620 }}
    >
      <motion.div
        className="relative grid h-[4.5rem] w-[4.5rem] place-items-center sm:h-20 sm:w-20"
        style={{
          rotateX: reduced ? 0 : rx,
          rotateY: reduced ? 0 : ry,
          transformStyle: 'preserve-3d',
          background: category.color,
          borderRadius: 20,
          border: '2.5px solid rgba(255,255,255,0.94)',
          boxShadow: `0 8px 16px -10px ${category.color}, 0 2px 5px rgba(28,43,58,0.2)`,
        }}
        {...settle}
      >
        <Icon size={30} strokeWidth={2.4} color="#FFFFFF" aria-hidden="true" />
        {/* The sheen: what makes it read as an object rather than a swatch. */}
        {!reduced && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              borderRadius: 18,
              background: sheen,
            }}
          />
        )}
      </motion.div>
    </div>
  );
}

/** One specimen: the marker, what it covers, and something really filed under it. */
function Specimen({
  category, reduced, index,
}: {
  category: (typeof CATEGORIES)[number];
  reduced: boolean;
  index: number;
}) {
  const [title, place] = category.sample.split(' · ');
  const tilt = [-1.1, 0.8, -0.7, 1.1, -0.9][index] ?? 0;

  return (
    <motion.article
      className="relative flex h-full gap-4 p-5 sm:gap-5 lg:flex-col lg:gap-0 lg:p-6"
      style={{
        background: T.panel,
        border: `1px solid ${T.line}`,
        boxShadow: `5px 5px 0 ${category.color}`,
        rotate: `${tilt}deg`,
      }}
      initial={reduced ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-70px' }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: EASE }}
    >
      {/* Field code — a specimen plate numbers what is on it. */}
      <span
        className="absolute right-4 top-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] lg:right-5 lg:top-5"
        style={{ color: T.inkSoft }}
        aria-hidden="true"
      >
        {FIELD_CODE[category.key] ?? category.key.toUpperCase()}
      </span>

      <SpecimenBadge category={category} reduced={reduced} index={index} />

      <div className="flex min-w-0 flex-1 flex-col lg:mt-5">
        <h3
          className="font-display font-black uppercase leading-[0.92] tracking-[-0.03em]"
          style={{ color: T.ink, fontSize: 'clamp(1.25rem, 2vw, 1.6rem)' }}
        >
          {category.label}
        </h3>
        <p className="mt-2 text-[13.5px] leading-[1.5]" style={{ color: T.inkSoft }}>
          {category.desc}
        </p>

        {/* The sighting: proof the category is a real thing people file. */}
        <div className="mt-4 pt-3 lg:mt-auto" style={{ borderTop: `1px dashed ${T.line}` }}>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: category.color }}>
            Filed as
          </p>
          <p className="mt-1.5 text-[13px] font-bold leading-tight" style={{ color: T.ink }}>{title}</p>
          <p className="font-mono text-[11px]" style={{ color: T.inkSoft }}>{place}</p>
        </div>
      </div>
    </motion.article>
  );
}

function Categories({ reduced }: { reduced: boolean }) {
  return (
    <section
      id="features"
      className="relative py-16 sm:py-20 lg:py-24"
      style={{ background: '#F2EFE8', borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` }}
    >
      <div className="mx-auto max-w-[88rem] px-5 sm:px-8">
        <div className="lg:flex lg:items-end lg:justify-between lg:gap-10">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="h-[3px] w-[22px] shrink-0" style={{ background: T.ink }} aria-hidden="true" />
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: T.inkSoft }}>
                What we track
              </span>
            </div>
            <h2
              className="mt-4 font-display font-black uppercase leading-[0.84] tracking-[-0.04em]"
              style={{ color: T.ink, fontSize: 'clamp(2.3rem, 6.4vw, 4.6rem)' }}
            >
              Five kinds of
              <br />
              report. One map.
            </h2>
          </div>
          <p className="mt-5 max-w-[38ch] text-[14px] leading-[1.55] lg:mb-2 lg:mt-0 sm:text-[15px]" style={{ color: T.inkSoft }}>
            Every report a neighbour files lands in one of these five. These are the real markers,
            at the size and colour the map draws them.
          </p>
        </div>

        {/* The board */}
        <div className="mt-10 grid gap-4 sm:mt-12 sm:gap-5 lg:grid-cols-5">
          {CATEGORIES.map((c, i) => (
            <Specimen key={c.key} category={c} reduced={reduced} index={i} />
          ))}
        </div>

        <p className="mt-8 font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: T.inkSoft }}>
          All five live across every quadrant · NW · NE · SW · SE
        </p>
      </div>
    </section>
  );
}

/**
 * NEAR ME — the distance scale.
 *
 * The feature is one sentence: every report, sorted by how far it is from where
 * you stand. So the section draws that literally — a measured scale from your
 * doorstep to 3 km, with real reports pinned at their true distances. The
 * clustering you can see (two inside 700 m, then a gap) is the argument the
 * copy is making, made visually instead of asserted.
 *
 * It replaces a phone mock with a radar in it. That layout — copy left, device
 * right — is what every product page does, and its radar repeated a device the
 * signed-in briefing already uses. A scale is specific to this feature and
 * belongs to nothing else on the page.
 *
 * Editorial layer, so poster grammar: paper slips at slight angles with hard
 * vermilion offset shadows, mono labels, square corners, and the emblem doing
 * the work an illustration should — marking where you stand.
 */
const NEAR_RANGE_M = 3000;

/** Real distances, so the scale is a measurement rather than a decoration. */
const NEAR_REPORTS: Array<{
  icon: ElementType; title: string; area: string; metres: number; time: string; contact?: string;
}> = [
  { icon: Car,       title: 'Car break-in — glass on the road', area: 'Inglewood', metres: 400,  time: '38 min' },
  { icon: CloudRain, title: 'Icy sidewalk on the school route',  area: 'Inglewood', metres: 650,  time: '1 h' },
  { icon: Bike,      title: 'Stolen bike — blue Norco Storm 3',  area: 'Ramsay',    metres: 1200, time: '2 h', contact: 'Call Dana · 403-555-0119' },
  { icon: Car,       title: 'Stolen vehicle — grey F-150',       area: 'Alyth',     metres: 2400, time: '5 h' },
];

const NEAR_PROMISES = [
  { label: 'Coming soon', title: 'Post your stolen bike with a number',
    body: 'The neighbour who spots it locked outside a train station calls you — not a call centre.' },
  { title: 'See the pattern before you park',
    body: 'Car break-ins cluster. Three reports on one block this week is worth knowing tonight.' },
  { title: 'Everything within 3 km, sorted',
    body: 'One tap shows what is open around you right now, nearest first, emergencies on top.' },
];

function formatMetres(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function NearMe({ reduced }: { reduced: boolean }) {
  return (
    <section className="relative overflow-hidden py-16 sm:py-20 lg:py-24" style={{ background: T.paper }}>
      <div className="mx-auto max-w-[80rem] px-5 sm:px-8">
        {/* Header */}
        <div className="lg:flex lg:items-end lg:justify-between lg:gap-12">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2.5">
              <span className="h-[3px] w-[22px] shrink-0" style={{ background: '#E52C20' }} aria-hidden="true" />
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: T.inkSoft }}>
                Near me · your 3 km
              </span>
            </div>
            <h2
              className="mt-4 font-display font-black uppercase leading-[0.84] tracking-[-0.04em]"
              style={{ color: T.ink, fontSize: 'clamp(2.3rem, 6.4vw, 4.6rem)' }}
            >
              It starts on
              <br />
              your <span style={{ color: '#E52C20' }}>street.</span>
            </h2>
            <p className="mt-5 max-w-[46ch] text-[14.5px] leading-[1.6] sm:text-[15.5px]" style={{ color: T.inkSoft }}>
              The whole city matters, but your block matters more. Everything is sorted by how far it is
              from where you stand — so Inglewood sees Inglewood first.
            </p>
          </div>

          {/* The city you are standing in. */}
          <img
            src={publicAsset('images/illustration/calgary-bow-emblem.webp')}
            alt=""
            width={900} height={900} loading="lazy"
            className="mt-8 hidden w-40 shrink-0 opacity-90 lg:mt-0 lg:block xl:w-48"
            aria-hidden="true"
          />
        </div>

        {/* ── The scale ────────────────────────────────────────────────────
            Wide: distance runs left to right. Narrow: top to bottom, because a
            phone reads down and a 3 km ruler across 340px is unreadable. */}
        <div className="mt-12 sm:mt-14">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: '#E52C20' }}>
              Measured from you
            </span>
            <span className="h-px flex-1" style={{ background: T.line }} aria-hidden="true" />
          </div>

          {/* Wide */}
          <div className="relative mt-10 hidden lg:block" style={{ height: '23rem' }}>
            <div className="absolute inset-x-0 top-[9rem] h-[3px]" style={{ background: T.ink }} aria-hidden="true" />
            {[0, 1000, 2000, 3000].map((m) => (
              <div key={m} className="absolute top-[9rem] z-10" style={{ left: `${(m / NEAR_RANGE_M) * 100}%` }} aria-hidden="true">
                <span className="block h-3.5 w-[3px] -translate-x-1/2" style={{ background: T.ink }} />
                <span className="mt-1.5 block -translate-x-1/2 font-mono text-[10px] font-bold tabular-nums" style={{ color: T.inkSoft }}>
                  {m === 0 ? 'YOU' : `${m / 1000} km`}
                </span>
              </div>
            ))}

            {NEAR_REPORTS.map((r, i) => {
              const pct = (r.metres / NEAR_RANGE_M) * 100;
              const above = i % 2 === 0;
              const tilt = [-1.4, 1.2, -1, 1.3][i] ?? 0;
              return (
                <motion.div
                  key={r.title}
                  className="absolute w-[15rem]"
                  style={{
                    left: `${pct}%`,
                    ...(above ? { bottom: 'calc(100% - 7.4rem)' } : { top: '11.4rem' }),
                    transform: `translateX(${i === NEAR_REPORTS.length - 1 ? '-72%' : '-14%'})`,
                  }}
                  initial={reduced ? false : { opacity: 0, y: above ? -14 : 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-70px' }}
                  transition={{ delay: i * 0.09, duration: 0.5, ease: EASE }}
                >
                  <span
                    className="absolute left-[14%] w-[3px]"
                    style={{ background: '#E52C20', top: above ? '100%' : '-2.4rem', height: above ? '1.6rem' : '2.4rem' }}
                    aria-hidden="true"
                  />
                  <NearSlip report={r} tilt={tilt} />
                </motion.div>
              );
            })}
          </div>

          {/* Narrow */}
          <ol className="relative mt-8 space-y-5 lg:hidden">
            <span className="absolute bottom-4 left-[1.55rem] top-4 w-[3px]" style={{ background: T.line }} aria-hidden="true" />
            {NEAR_REPORTS.map((r, i) => (
              <motion.li
                key={r.title}
                className="relative pl-[3.6rem]"
                initial={reduced ? false : { opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: i * 0.07, duration: 0.45, ease: EASE }}
              >
                <span
                  className="absolute left-0 top-4 w-[3.1rem] text-center font-mono text-[11px] font-black tabular-nums"
                  style={{ color: '#E52C20' }}
                >
                  {formatMetres(r.metres)}
                </span>
                <NearSlip report={r} tilt={[-1, 0.9, -0.8, 1][i] ?? 0} />
              </motion.li>
            ))}
          </ol>
        </div>

        {/* What it buys you */}
        <div className="mt-14 grid gap-4 sm:grid-cols-3 sm:gap-5">
          {NEAR_PROMISES.map((p, i) => (
            <motion.div
              key={p.title}
              className="relative p-5"
              style={{ background: T.panel, border: `1px solid ${T.line}` }}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.07, duration: 0.5, ease: EASE }}
            >
              {p.label && (
                <span
                  className="mb-2 inline-block px-2 py-1 font-mono text-[9.5px] font-black uppercase tracking-[0.16em]"
                  style={{ background: '#E52C20', color: '#F2EFE8' }}
                >
                  {p.label}
                </span>
              )}
              <h3 className="font-display text-[1.05rem] font-black uppercase leading-[0.95] tracking-[-0.02em]" style={{ color: T.ink }}>
                {p.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.5]" style={{ color: T.inkSoft }}>{p.body}</p>
            </motion.div>
          ))}
        </div>

        <a
          href="/map"
          className="mt-10 inline-flex items-center gap-3 px-6 py-4 font-display text-[14px] font-black uppercase tracking-[-0.01em] transition-transform hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-none sm:text-[15px]"
          style={{ background: T.ink, color: '#F2EFE8', boxShadow: '5px 5px 0 #E52C20' }}
        >
          See what&rsquo;s near you
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

/** One report, as a slip pinned to the scale. */
function NearSlip({ report, tilt }: { report: (typeof NEAR_REPORTS)[number]; tilt: number }) {
  const Icon = report.icon;
  return (
    <div
      className="relative p-3.5"
      style={{ background: T.panel, border: `1px solid ${T.line}`, boxShadow: '5px 5px 0 #E52C20', rotate: `${tilt}deg` }}
    >
      <div className="flex items-start gap-2.5">
        <Icon size={15} className="mt-[2px] shrink-0" style={{ color: T.ink }} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-snug" style={{ color: T.ink }}>{report.title}</p>
          <p className="mt-1 font-mono text-[10.5px] tabular-nums" style={{ color: T.inkSoft }}>
            {report.area} · {formatMetres(report.metres)} · {report.time} ago
          </p>
          {report.contact && (
            <p
              className="mt-2 inline-block px-2 py-1 font-mono text-[10px] font-bold"
              style={{ background: '#EAE3D5', color: T.ink }}
            >
              {report.contact}
            </p>
          )}
        </div>
      </div>
    </div>
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
          src={publicAsset('images/photo/calgary_map.png')}
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
  { src: 'images/photo/calgary1.webp', label: 'NE · golden hour' },
  { src: 'images/photo/calgary4.webp', label: 'NW · Peace Bridge' },
  { src: 'images/photo/calgary7.webp', label: 'SE · Scotsman Hill' },
  { src: 'images/photo/calgary2.webp', label: 'SW · Calgary Tower' },
  { src: 'images/photo/calgary8.webp', label: 'SE · Stampede Park' },
  { src: 'images/photo/calgary5.webp', label: 'SW · Stephen Ave' },
  { src: 'images/photo/calgary3.webp', label: 'NE · Deerfoot, 01:47' },
  { src: 'images/hero/hero-wide.webp', label: 'SW · Bow River' },
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
            src={publicAsset('images/photo/calgary8.webp')}
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
            src={publicAsset('images/brand/plane-white.webp')}
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

      {/* The city itself, as the rule that closes the page. A 3:1 strip of
          skyline does the job a hairline border was doing, and says where. */}
      <div className="mx-auto max-w-[80rem] px-5 sm:px-8" aria-hidden="true">
        <img
          src={publicAsset('images/illustration/calgary-skyline-rule.webp')}
          alt=""
          width={1800} height={600} loading="lazy"
          className="pointer-events-none mx-auto w-full max-w-4xl opacity-[0.55]"
        />
      </div>

      {/* Footer */}
      <footer className="mx-auto max-w-[80rem] px-5 sm:px-8 pb-10" style={{ color: T.inkSoft }}>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pt-8" style={{ borderTop: `1px solid ${T.line}` }}>
          <div>
            <div className="flex items-center gap-3">
              <img
                src={publicAsset('images/illustration/calgary-watch-shield.webp')}
                alt=""
                width={800} height={800} loading="lazy"
                className="h-11 w-11 shrink-0 object-contain"
                aria-hidden="true"
              />
              <p className="font-display text-lg font-bold" style={{ color: T.ink }}>Calgary Watch</p>
            </div>
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
        <SignalFlight reduced={reduced} />
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
