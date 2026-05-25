import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ArrowRight, MapPin, ChevronDown, Shield,
  Radio, Sun, Moon, AlertCircle, Car, Construction,
  CloudRain, Siren, ExternalLink, CheckCircle2,
} from 'lucide-react';
import { cn, publicAsset } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/Button';

// ─── Theme ──────────────────────────────────────────────────────────────────
function useCwTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    try { return localStorage.getItem('cw-theme') === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });
  useEffect(() => {
    if (theme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
    try { localStorage.setItem('cw-theme', theme); } catch {}
  }, [theme]);
  return [theme, setTheme] as const;
}

// ─── Data ────────────────────────────────────────────────────────────────────
const COMMUNITIES = [
  { name: 'Airdrie',         dist: 30,  dir: 'N',         type: 'City',   pop: '79,000+' },
  { name: 'Cochrane',        dist: 45,  dir: 'NW',        type: 'Town',   pop: '34,000+' },
  { name: 'Chestermere',     dist: 15,  dir: 'E',         type: 'City',   pop: '23,000+' },
  { name: 'Okotoks',         dist: 32,  dir: 'S',         type: 'Town',   pop: '34,000+' },
  { name: 'Strathmore',      dist: 44,  dir: 'E',         type: 'Town',   pop: '17,000+' },
  { name: 'High River',      dist: 60,  dir: 'S',         type: 'Town',   pop: '16,000+' },
  { name: 'Canmore',         dist: 103, dir: 'W',         type: 'Town',   pop: '16,000+' },
  { name: 'Langdon',         dist: 35,  dir: 'SE',        type: 'Village',pop: '7,500+' },
  { name: 'Crossfield',      dist: 52,  dir: 'N',         type: 'Town',   pop: '3,800+' },
  { name: 'Carstairs',       dist: 66,  dir: 'N',         type: 'Town',   pop: '4,600+' },
  { name: 'Didsbury',        dist: 80,  dir: 'N',         type: 'Town',   pop: '7,000+' },
  { name: 'Olds',            dist: 91,  dir: 'N',         type: 'Town',   pop: '9,500+' },
  { name: 'Black Diamond',   dist: 56,  dir: 'SW',        type: 'Town',   pop: '3,200+' },
  { name: 'Turner Valley',   dist: 58,  dir: 'SW',        type: 'Town',   pop: '2,500+' },
  { name: 'Nanton',          dist: 90,  dir: 'S',         type: 'Town',   pop: '2,600+' },
  { name: 'Irricana',        dist: 60,  dir: 'NE',        type: 'Village',pop: '1,500+' },
  { name: 'Beiseker',        dist: 70,  dir: 'NE',        type: 'Village',pop: '1,000+' },
  { name: 'Gleichen',        dist: 80,  dir: 'E',         type: 'Village',pop: '350+' },
  { name: 'Vulcan',          dist: 95,  dir: 'SE',        type: 'Town',   pop: '2,200+' },
  { name: 'Balzac',          dist: 12,  dir: 'N',         type: 'Hamlet', pop: '—' },
  { name: 'Springbank',      dist: 20,  dir: 'W',         type: 'Hamlet', pop: '—' },
  { name: 'Bragg Creek',     dist: 45,  dir: 'SW',        type: 'Hamlet', pop: '—' },
  { name: 'Priddis',         dist: 35,  dir: 'SW',        type: 'Hamlet', pop: '—' },
  { name: 'De Winton',       dist: 30,  dir: 'S',         type: 'Hamlet', pop: '—' },
  { name: 'Millarville',     dist: 45,  dir: 'SW',        type: 'Hamlet', pop: '—' },
  { name: 'Bearspaw',        dist: 15,  dir: 'NW',        type: 'Hamlet', pop: '—' },
  { name: 'Conrich',         dist: 25,  dir: 'E',         type: 'Hamlet', pop: '—' },
  { name: 'Linden',          dist: 75,  dir: 'NE',        type: 'Village',pop: '900+' },
  { name: 'Rocky View County',dist: 0,  dir: 'Surrounding',type: 'County', pop: '43,000+' },
  { name: 'Foothills County', dist: 0,  dir: 'Surrounding',type: 'County', pop: '22,000+' },
];

const FAQS = [
  {
    q: 'Is Calgary safe?',
    a: "Calgary consistently ranks among Canada's safer major cities by Crime Severity Index. Property crime — vehicle theft, break-and-enter, and residential theft — is the most common category. Violent crime is significantly lower than many comparable cities. That said, incident hotspots exist around transit corridors, downtown entertainment areas, and certain suburban zones. Calgary Watch lets you see current conditions in your specific neighbourhood rather than relying on city-wide annual averages.",
  },
  {
    q: 'What is the crime rate in Calgary?',
    a: "Calgary's Crime Severity Index has fluctuated in recent years, with property crime rising alongside population growth. The downtown core, Beltline, Forest Lawn, and parts of the northeast have historically higher incident density. Newer suburban communities in the NW, SW, and south tend to have lower property crime rates. Calgary Watch surfaces community-reported incidents alongside official open data, so you can track your specific area's trend over days and weeks — not just annual statistics.",
  },
  {
    q: 'What are the most dangerous neighbourhoods in Calgary?',
    a: "Incident density on Calgary Watch tends to concentrate around the downtown core (especially along 17 Ave and Centre Street corridors), Forest Lawn in the NE, and parts of the NW industrial zones. These patterns shift over time and by category — vehicle break-ins may spike in one area while residential crime rises elsewhere. Open the live map and filter by category to see current hotspots.",
  },
  {
    q: 'How do I report a crime or incident in Calgary?',
    a: "For emergencies, always call 911 first. For non-emergency police matters in Calgary, contact Calgary Police Service at 403-266-1234 or submit online at Calgary Police. You can also submit a community report on Calgary Watch to alert your neighbours instantly — your identity can be kept fully anonymous, and your report appears on the live map within 30 seconds.",
  },
  {
    q: 'Is Airdrie AB safe?',
    a: "Airdrie is a rapidly growing city north of Calgary with a generally low crime rate relative to its size. As the city has expanded — now approaching 80,000 residents — property crime has increased proportionally, particularly vehicle theft and residential break-ins in newer subdivisions. Calgary Watch monitors community-reported incidents across Airdrie and Rocky View County.",
  },
  {
    q: 'Is Cochrane AB safe?',
    a: "Cochrane maintains one of the lowest crime rates among Alberta's satellite cities of its size. Most reported incidents involve property crime in residential areas. The rural highway corridors between Cochrane and Calgary (Highway 1A and Highway 22) see occasional traffic incidents. Calgary Watch covers Cochrane and surrounding Rocky View County communities.",
  },
  {
    q: 'Does Calgary Watch cover Okotoks, High River, and Strathmore?',
    a: "Yes. Calgary Watch covers the full Calgary metropolitan region including Okotoks, High River, Strathmore, Chestermere, Langdon, Crossfield, Carstairs, and all communities within approximately 100 kilometres of Calgary. Community members in these areas can submit reports and see incidents from the same map.",
  },
  {
    q: 'How does Calgary Watch work?',
    a: "Calgary Watch combines community-submitted reports with official public safety data from the City of Calgary open data portal, Environment Canada weather alerts, and 511 Alberta traffic feeds. Residents sign in to submit geolocated incident reports in under 30 seconds. Reports appear on the live map immediately and are visible to the entire community. Anonymous reporting is fully supported.",
  },
];

const CATEGORIES = [
  { icon: AlertCircle, label: 'Crime',          color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',    desc: 'Break-ins, vehicle theft, assault, vandalism, suspicious activity, theft from vehicle, robbery' },
  { icon: Car,         label: 'Traffic',        color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20',desc: 'Collisions, road closures, Deerfoot Trail incidents, Stoney Trail congestion, highway accidents' },
  { icon: Construction,label: 'Infrastructure', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20',desc: 'Water main breaks, flooding, utility outages, road washouts, construction hazards' },
  { icon: CloudRain,   label: 'Weather',        color: 'text-sky-400',    bg: 'bg-sky-500/10 border-sky-500/20',    desc: 'Severe weather warnings, icy roads, flash flooding, hail alerts, whiteout conditions, fog' },
  { icon: Siren,       label: 'Emergency',      color: 'text-emerald-400',bg: 'bg-emerald-500/10 border-emerald-500/20',desc: 'Active fires, EMS activity, evacuation notices, Amber Alerts, shelter-in-place orders' },
];

const OFFICIAL_LINKS = [
  { label: 'Calgary Police Service',      url: 'https://www.calgarypolice.ca',              desc: 'Non-emergency: 403-266-1234' },
  { label: 'City of Calgary Open Data',   url: 'https://data.calgary.ca',                   desc: 'Official incident & crime statistics' },
  { label: 'Alberta Emergency Alert',     url: 'https://www.alberta.ca/emergency-alerts',   desc: 'Province-wide emergency notifications' },
  { label: '511 Alberta Traffic',         url: 'https://511.alberta.ca',                    desc: 'Highway conditions & closures' },
  { label: 'Environment Canada Alerts',   url: 'https://weather.gc.ca/warnings/index_e.html?prov=ab', desc: 'Severe weather warnings for AB' },
  { label: 'Airdrie RCMP',               url: 'https://www.rcmp-grc.gc.ca/en/airdrie',     desc: 'Airdrie & Rocky View County policing' },
];

// ─── FAQ Item ─────────────────────────────────────────────────────────────
function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className={cn(
      'border rounded-2xl overflow-hidden transition-colors duration-200',
      open
        ? 'border-[#4A90D9]/40 bg-[#4A90D9]/5 light:bg-[#4A90D9]/4'
        : 'border-white/8 light:border-slate-200 bg-white/[0.02] light:bg-white',
    )}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-4 px-6 py-5 text-left"
        aria-expanded={open}
      >
        <span className={cn(
          'text-sm font-bold leading-snug transition-colors',
          open ? 'text-[#4A90D9]' : 'text-white light:text-slate-900',
        )}>
          {q}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 mt-0.5 transition-transform duration-300 text-slate-400',
            open && 'rotate-180 text-[#4A90D9]',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-5 text-sm text-slate-400 light:text-slate-600 leading-relaxed border-t border-white/6 light:border-slate-100 pt-4">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Community Card ───────────────────────────────────────────────────────
const typeColor: Record<string, string> = {
  City:    'text-[#4A90D9] bg-[#4A90D9]/10 border-[#4A90D9]/25',
  Town:    'text-[#2E8B7A] bg-[#2E8B7A]/10 border-[#2E8B7A]/25',
  Village: 'text-[#D4A843] bg-[#D4A843]/10 border-[#D4A843]/25',
  Hamlet:  'text-slate-400 bg-white/5 border-white/10',
  County:  'text-violet-400 bg-violet-500/10 border-violet-500/25',
};
const typeColorLight: Record<string, string> = {
  City:    'text-[#2563eb] bg-blue-50 border-blue-200',
  Town:    'text-[#0f766e] bg-teal-50 border-teal-200',
  Village: 'text-[#92400e] bg-amber-50 border-amber-200',
  Hamlet:  'text-slate-500 bg-slate-50 border-slate-200',
  County:  'text-violet-700 bg-violet-50 border-violet-200',
};

function CommunityCard({ c, index, navigate }: { c: typeof COMMUNITIES[0]; index: number; navigate: ReturnType<typeof useNavigate> }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 18 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay: (index % 5) * 0.06, ease: 'easeOut' }}
      className={cn(
        'group relative rounded-2xl border p-4 cursor-pointer transition-all duration-200',
        'border-white/8 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/15',
        'light:border-slate-200 light:bg-white light:hover:border-slate-300 light:hover:bg-slate-50/80',
      )}
      onClick={() => navigate('/map')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/map')}
      aria-label={`View ${c.name} on the live map`}
    >
      {/* Type badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={cn(
          'text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border',
          typeColor[c.type],
          'light:hidden',
        )}>
          {c.type}
        </span>
        <span className={cn(
          'text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border hidden',
          typeColorLight[c.type],
          'light:inline-block',
        )}>
          {c.type}
        </span>

        {c.dist > 0 && (
          <span className="font-mono text-[10px] text-slate-500 shrink-0">
            {c.dist} km {c.dir}
          </span>
        )}
        {c.dist === 0 && (
          <span className="font-mono text-[10px] text-slate-500 shrink-0">{c.dir}</span>
        )}
      </div>

      <p className="text-sm font-black text-white light:text-slate-900 leading-tight mb-1">{c.name}</p>
      {c.pop !== '—' && (
        <p className="text-[10px] text-slate-500 font-medium">{c.pop}</p>
      )}

      {/* Hover arrow */}
      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <ArrowRight size={13} className="text-[#4A90D9]" />
      </div>
    </motion.div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────
const Section = memo(function Section({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
});

// ─── Main Page ────────────────────────────────────────────────────────────
export default function CoveragePage() {
  const navigate = useNavigate();
  const [theme, setTheme] = useCwTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ── Inject page-specific JSON-LD schemas ─────────────────────────────────
  useEffect(() => {
    const inject = (id: string, data: object) => {
      let el = document.head.querySelector<HTMLScriptElement>(`script[data-ld="${id}"]`);
      if (!el) {
        el = document.createElement('script');
        el.setAttribute('type', 'application/ld+json');
        el.setAttribute('data-ld', id);
        document.head.appendChild(el);
      }
      el.textContent = JSON.stringify(data);
    };

    // ItemList — all 30 communities as structured data for rich results
    inject('coverage-itemlist', {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Calgary Area Communities Covered by Calgary Watch',
      description: '30+ communities across the Calgary metropolitan region where Calgary Watch provides real-time community safety reporting.',
      numberOfItems: COMMUNITIES.length,
      itemListElement: COMMUNITIES.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `${c.name}, Alberta`,
        item: {
          '@type': 'City',
          name: c.name,
          addressRegion: 'AB',
          addressCountry: 'CA',
          url: 'https://calgarywatch.ca/map',
        },
      })),
    });

    // FAQPage — coverage-specific Q&As for PAA boxes
    inject('coverage-faq', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Which communities does Calgary Watch cover?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Calgary Watch covers Calgary and 30+ surrounding communities including Airdrie, Cochrane, Chestermere, Okotoks, Strathmore, High River, Canmore, Langdon, Crossfield, Carstairs, Didsbury, Olds, Black Diamond, Turner Valley, Nanton, Irricana, Beiseker, Vulcan, Balzac, Springbank, Bragg Creek, Priddis, De Winton, Millarville, Bearspaw, Conrich, Linden, Rocky View County, and Foothills County — all within approximately 100 km of Calgary.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does Calgary Watch cover Rocky View County?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Calgary Watch covers all of Rocky View County including Cochrane, Airdrie, Balzac, Springbank, Bearspaw, Langdon, Conrich, and unincorporated rural areas. Rocky View County surrounds Calgary on most sides and all communities within the county can submit and view real-time safety reports.',
          },
        },
        {
          '@type': 'Question',
          name: 'How far from Calgary does Calgary Watch cover?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Calgary Watch covers communities within approximately 100 kilometres of Calgary city centre. This includes all cities, towns, villages, and hamlets in the greater Calgary metropolitan region — from Olds in the north (~90 km) to Nanton in the south (~90 km), Canmore to the west (~100 km), and Strathmore to the east (~45 km).',
          },
        },
        {
          '@type': 'Question',
          name: 'Is Calgary Watch free to use?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Calgary Watch is completely free for all community members. Viewing the live safety map, browsing incident reports, and submitting your own community reports are all free with no subscription required. A free account is needed only to submit reports.',
          },
        },
        {
          '@type': 'Question',
          name: 'What types of crimes and incidents are reported on Calgary Watch?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Calgary Watch tracks five main incident categories: (1) Crime — break-and-enter, vehicle theft, vandalism, suspicious activity, assault, robbery; (2) Traffic — collisions, road closures, Deerfoot Trail and Stoney Trail incidents; (3) Infrastructure — water main breaks, utility outages, flooding; (4) Weather — severe weather warnings, icy roads, hail, flash flooding; (5) Emergency — active fires, EMS activity, evacuation notices, Amber Alerts.',
          },
        },
        {
          '@type': 'Question',
          name: 'How do I report an incident in Airdrie, Cochrane, or other surrounding communities?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The process is the same for all communities covered by Calgary Watch. Open the live map at calgarywatch.ca/map, sign in or create a free account, tap the report button, select your incident category, drop a pin on the location in your community, add a description, and submit. Your report is immediately visible to everyone viewing the map in that area.',
          },
        },
      ],
    });

    return () => {
      document.head.querySelector('script[data-ld="coverage-itemlist"]')?.remove();
      document.head.querySelector('script[data-ld="coverage-faq"]')?.remove();
    };
  }, []);

  return (
    <div className="relative min-h-dvh bg-slate-950 light:bg-[#f8f3e8] text-white light:text-slate-900 font-sans overflow-x-hidden isolate">

      {/* Subtle background texture */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 opacity-[0.03] light:opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(74,144,217,0.6) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top_left,rgba(74,144,217,0.08),transparent_55%)]" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(ellipse_at_bottom_right,rgba(46,139,122,0.06),transparent_55%)]" />
      </div>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 border-b border-white/8 light:border-slate-200/80 bg-slate-950/80 light:bg-[#f8f3e8]/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-bold text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={15} />
            Calgary Watch
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 light:bg-slate-100 border border-white/10 light:border-slate-200 text-slate-400 hover:text-white light:hover:text-slate-900 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <Button
              size="sm"
              className="h-8 px-4 rounded-full text-xs font-bold bg-[#4A90D9] hover:bg-[#3a7fc8]"
              onClick={() => navigate('/map')}
            >
              Open Map
            </Button>
          </div>
        </div>
      </nav>

      <div className="relative z-10">

        {/* ── HERO ────────────────────────────────────────────────────────── */}
        <header className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 pb-14 md:pt-24 md:pb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          >
            {/* Eyebrow */}
            <div className="flex items-center gap-3 mb-6">
              <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] uppercase text-[#2E8B7A]">
                <span className="inline-block w-1.5 h-3 bg-[#2E8B7A] animate-pulse" aria-hidden="true" />
                Coverage · Alberta · {new Date().getFullYear()}
              </span>
              <span className="h-px flex-1 max-w-16 bg-[#2E8B7A]/30" aria-hidden="true" />
            </div>

            <h1 className="text-[clamp(2.6rem,8vw,6rem)] font-black leading-[0.92] tracking-tight mb-6 max-w-4xl">
              Calgary Area
              <span className="block text-[#4A90D9]">Safety Guide.</span>
            </h1>

            <p className="text-base sm:text-lg text-slate-400 light:text-slate-600 max-w-2xl leading-relaxed mb-10 border-l-2 border-[#4A90D9]/40 pl-4">
              Real-time crime intelligence, community safety reports, and incident alerts for Calgary
              and every town, city, and hamlet within 100 km — from Airdrie and Cochrane to Okotoks, Strathmore, and High River.
            </p>

            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { value: '100 km',  label: 'Coverage radius',   color: 'text-[#4A90D9]' },
                { value: '30+',     label: 'Communities',       color: 'text-[#2E8B7A]' },
                { value: '5',       label: 'Incident categories', color: 'text-[#D4A843]' },
                { value: 'Free',    label: 'Always open',       color: 'text-emerald-400' },
              ].map(({ value, label, color }) => (
                <div key={label} className="rounded-2xl border border-white/8 light:border-slate-200 bg-white/[0.03] light:bg-white px-4 py-3">
                  <p className={cn('text-2xl font-black font-mono', color)}>{value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </header>

        {/* ── COMMUNITIES GRID ────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-slate-200/80">
          <Section>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#4A90D9] mb-2">Coverage Map</p>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                  30+ Communities Covered
                </h2>
              </div>
              <p className="text-xs text-slate-500 light:text-slate-500 max-w-xs leading-relaxed">
                Click any community to view current incidents on the live map.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {COMMUNITIES.map((c, i) => (
                <CommunityCard key={c.name} c={c} index={i} navigate={navigate} />
              ))}
            </div>

            {/* Legend */}
            <div className="mt-5 flex flex-wrap gap-3">
              {Object.entries(typeColor).map(([type]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span className={cn('w-2 h-2 rounded-full', {
                    'bg-[#4A90D9]': type === 'City',
                    'bg-[#2E8B7A]': type === 'Town',
                    'bg-[#D4A843]': type === 'Village',
                    'bg-slate-500': type === 'Hamlet',
                    'bg-violet-400': type === 'County',
                  })} />
                  <span className="text-[10px] text-slate-500">{type}</span>
                </div>
              ))}
            </div>
          </Section>
        </section>

        {/* ── INCIDENT CATEGORIES ─────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-slate-200/80">
          <Section>
            <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#2E8B7A] mb-2">What We Track</p>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-8">
              5 Incident Categories
            </h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CATEGORIES.map(({ icon: Icon, label, color, bg, desc }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{ duration: 0.4, delay: i * 0.07 }}
                  className={cn('rounded-2xl border p-5', bg)}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Icon size={18} className={color} />
                    <span className={cn('text-sm font-black', color)}>{label}</span>
                  </div>
                  <p className="text-xs text-slate-400 light:text-slate-600 leading-relaxed">{desc}</p>
                </motion.div>
              ))}

              {/* Bonus card */}
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.4, delay: 0.35 }}
                className="rounded-2xl border border-white/6 light:border-slate-200 bg-white/[0.02] light:bg-white p-5 flex flex-col justify-between"
              >
                <div>
                  <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-slate-500 mb-3">New reports</p>
                  <p className="text-3xl font-black text-white light:text-slate-900">{'< 30s'}</p>
                  <p className="text-xs text-slate-400 light:text-slate-600 mt-1">from submission to live map</p>
                </div>
                <div className="mt-4 h-px bg-gradient-to-r from-[#4A90D9]/40 to-transparent" />
              </motion.div>
            </div>
          </Section>
        </section>

        {/* ── CALGARY QUADRANTS ────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-slate-200/80">
          <Section>
            <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#D4A843] mb-2">City Zones</p>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">Calgary Quadrant Coverage</h2>
            <p className="text-sm text-slate-400 light:text-slate-600 mb-8 max-w-2xl">
              Calgary is divided into four quadrants plus the downtown core. Calgary Watch monitors community-reported incidents across all zones, with particular density data for high-traffic corridors.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { zone: 'NW Calgary',       desc: 'Tuscany, Rocky Ridge, Nolan Hill, Evanston, Panorama Hills, Hamptons',                     accent: 'border-[#4A90D9]/30 bg-[#4A90D9]/5' },
                { zone: 'NE Calgary',       desc: 'Saddle Ridge, Skyview Ranch, Redstone, Cornerstone, Martindale, Temple, Falconridge',       accent: 'border-[#2E8B7A]/30 bg-[#2E8B7A]/5' },
                { zone: 'SW Calgary',       desc: 'Signal Hill, Cougar Ridge, Discovery Ridge, Aspen Woods, West Springs, Lakeview, Richmond', accent: 'border-[#D4A843]/30 bg-[#D4A843]/5' },
                { zone: 'SE Calgary',       desc: 'Auburn Bay, Mahogany, Cranston, New Brighton, McKenzie Towne, Legacy, Copperfield',         accent: 'border-violet-500/30 bg-violet-500/5' },
                { zone: 'Downtown Core',    desc: 'Beltline, East Village, Chinatown, Mission, Inglewood, Kensington, Hillhurst, Bridgeland',  accent: 'border-red-500/30 bg-red-500/5' },
                { zone: 'Key Corridors',    desc: 'Deerfoot Trail, Stoney Trail, Glenmore Trail, Crowchild Trail, Memorial Drive, 16 Ave',     accent: 'border-slate-500/30 bg-white/3' },
              ].map(({ zone, desc, accent }) => (
                <div key={zone} className={cn('rounded-2xl border p-4 light:border-slate-200 light:bg-white', accent)}>
                  <p className="text-sm font-black text-white light:text-slate-900 mb-1.5">{zone}</p>
                  <p className="text-[11px] text-slate-400 light:text-slate-600 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </Section>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-slate-200/80">
          <Section>
            <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#4A90D9] mb-2">Common Questions</p>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-8">
              Calgary Area Safety FAQ
            </h2>

            <div className="space-y-2.5 max-w-3xl">
              {FAQS.map((faq, i) => (
                <FaqItem
                  key={i}
                  q={faq.q}
                  a={faq.a}
                  open={openFaq === i}
                  onToggle={() => setOpenFaq(openFaq === i ? null : i)}
                />
              ))}
            </div>
          </Section>
        </section>

        {/* ── SEO CONTENT BLOCK ────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-slate-200/80">
          <Section>
            <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-slate-500 mb-6">About This Service</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 text-sm text-slate-400 light:text-slate-600 leading-relaxed">
              <div>
                <h3 className="text-sm font-black text-white light:text-slate-900 mb-2">Crime mapping for Calgary</h3>
                <p>Calgary Watch tracks break-ins, vehicle theft, assault incidents, vandalism, and suspicious activity across all Calgary quadrants with community reports submitted within 30 seconds of an event. Unlike static annual crime statistics, the live map reflects conditions right now.</p>
              </div>
              <div>
                <h3 className="text-sm font-black text-white light:text-slate-900 mb-2">Airdrie &amp; Cochrane coverage</h3>
                <p>As Calgary's fastest-growing satellite cities, Airdrie (30 km north) and Cochrane (45 km northwest) generate significant community safety activity. Calgary Watch monitors residential break-ins, traffic incidents, and community alerts across both cities and surrounding Rocky View County.</p>
              </div>
              <div>
                <h3 className="text-sm font-black text-white light:text-slate-900 mb-2">Southern Alberta communities</h3>
                <p>Okotoks, High River, and Strathmore along the Highway 2 and Highway 1 corridors rely on Calgary Watch for road condition alerts, crime news, and neighbourhood safety trends — particularly for the tens of thousands of daily commuters travelling between these communities and Calgary.</p>
              </div>
              <div>
                <h3 className="text-sm font-black text-white light:text-slate-900 mb-2">Rural communities &amp; hamlets</h3>
                <p>Rural Alberta communities like Bragg Creek, Springbank, Priddis, Millarville, De Winton, and Bearspaw are part of the Calgary metro ecosystem but often underserved by traditional news coverage. Calgary Watch gives residents in these areas the same real-time visibility as urban neighbourhoods.</p>
              </div>
              <div>
                <h3 className="text-sm font-black text-white light:text-slate-900 mb-2">Anonymous community reporting</h3>
                <p>Every Calgary Watch report can be submitted anonymously. Your name and contact information are never displayed publicly. This encourages reporting in situations where witnesses may be reluctant to identify themselves — particularly important for crime in progress or ongoing suspicious activity.</p>
              </div>
              <div>
                <h3 className="text-sm font-black text-white light:text-slate-900 mb-2">Official data integration</h3>
                <p>Alongside community reports, Calgary Watch integrates official data feeds: City of Calgary open data for verified incidents, Environment Canada weather alerts for Alberta, and 511 Alberta for highway and road closures — giving you a complete picture from both community and official sources.</p>
              </div>
            </div>
          </Section>
        </section>

        {/* ── OFFICIAL RESOURCES ───────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-slate-200/80">
          <Section>
            <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-slate-500 mb-2">External Resources</p>
            <h2 className="text-xl font-black tracking-tight mb-6">Official Safety Resources</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {OFFICIAL_LINKS.map(({ label, url, desc }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'group flex items-start justify-between gap-3 rounded-2xl border p-4 transition-all duration-200',
                    'border-white/8 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15',
                    'light:border-slate-200 light:bg-white light:hover:border-slate-300 light:hover:bg-slate-50',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white light:text-slate-900 truncate">{label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
                  </div>
                  <ExternalLink size={13} className="shrink-0 mt-0.5 text-slate-600 group-hover:text-[#4A90D9] transition-colors" />
                </a>
              ))}
            </div>
          </Section>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-slate-200/80">
          <Section>
            <div className="relative overflow-hidden rounded-2xl md:rounded-[2rem] border border-white/10 light:border-slate-200 bg-gradient-to-br from-[#0d1929] to-slate-950 light:from-white light:to-slate-50 p-8 md:p-12">
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(circle at 15% 50%, rgba(74,144,217,0.14), transparent 45%), radial-gradient(circle at 85% 50%, rgba(46,139,122,0.1), transparent 45%)' }}
                aria-hidden="true"
              />
              <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-mono text-[10px] tracking-[0.24em] uppercase text-emerald-400">Live now</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white light:text-slate-900 mb-2">
                    See Calgary in real time.
                  </h2>
                  <p className="text-sm text-slate-400 light:text-slate-600">
                    Open the live map to monitor incidents across Calgary and surrounding communities.
                  </p>
                </div>
                <div className="flex flex-col gap-2.5 sm:min-w-44">
                  <Button
                    size="lg"
                    className="h-12 px-7 rounded-2xl font-black text-sm"
                    style={{ background: 'linear-gradient(135deg,#4A90D9,#2E8B7A)', boxShadow: '0 8px 28px -12px rgba(74,144,217,0.7)' }}
                    onClick={() => navigate('/map')}
                  >
                    Open Live Map
                    <ArrowRight className="ml-2" size={15} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="h-12 px-7 rounded-2xl font-black text-sm bg-white/8 light:bg-white border border-white/15 light:border-slate-300 text-white light:text-slate-900 hover:bg-white/12 light:hover:bg-slate-100"
                    onClick={() => navigate('/map?report=true')}
                  >
                    Submit a Report
                  </Button>
                </div>
              </div>
            </div>
          </Section>
        </section>

        {/* ── FOOTER ───────────────────────────────────────────────────────── */}
        <footer className="max-w-6xl mx-auto px-5 sm:px-8 py-8 border-t border-white/5 light:border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={publicAsset('icon.svg')} alt="" width={18} height={18} className="w-[18px] h-[18px] opacity-70" />
            <span className="text-sm font-bold text-slate-500">Calgary Watch</span>
          </div>
          <p className="text-xs text-slate-600 text-center">
            Community safety data for Calgary, AB and surrounding region · Always verify with official sources.
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors"
          >
            ← Back to home
          </button>
        </footer>

      </div>
    </div>
  );
}
